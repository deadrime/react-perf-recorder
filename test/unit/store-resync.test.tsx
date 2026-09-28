import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, useReducer, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { findRoots, type Fiber, type Hook } from '../../src/core/fiber';
import type { SessionEvent } from '../../src/shared/schema';
import rq from '../../src/plugins/react-query/runtime';
import { flush, makeRecorder, mount, reasonsOf } from './helpers';

type Member = { id: string; name: string };
const members = () =>
  Promise.resolve<Member[]>([
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bob' },
  ]);
const byId = (list: Member[]) => new Map(list.map((m) => [m.id, m]));
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

/**
 * An avatar reads a query and a presence store; a list of who is online mounts one more avatar when someone comes
 * online. A refetch that brings the same members changes the query's result without notifying anyone.
 */
async function presencePage() {
  const presence = createStore(() => ({ online: [] as string[] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Avatar = ({ id }: { id: string }) => {
    const { data } = useQuery({ queryKey: ['members'], queryFn: members, staleTime: 0, select: byId });
    const online = useStore(presence, (s) => s.online.includes(id));
    return (
      <span>
        {data?.get(id)?.name}
        {online ? '*' : ''}
      </span>
    );
  };
  const Online = () => (
    <p>
      {useStore(presence, (s) => s.online).map((id) => (
        <Avatar key={id} id={id} />
      ))}
    </p>
  );
  mount(
    <QueryClientProvider client={client}>
      <Online />
      <Avatar id="a" />
      <Avatar id="b" />
    </QueryClientProvider>
  );
  await settle();
  return { presence, client };
}

const commits = (events: SessionEvent[]) => events.filter((e): e is Extract<SessionEvent, { k: 'commit' }> => e.k === 'commit');

describe('store hooks that change without notifying', () => {
  it('marks the query that changed silently, and names the commit React scheduled itself on finding it changed', async () => {
    const { presence, client } = await presencePage();
    const { recorder, events } = makeRecorder({}, [[rq, null]]);
    recorder.start();
    await act(() => client.refetchQueries({ queryKey: ['members'] }));
    await settle();
    flush(() => presence.setState({ online: ['a'] }));
    await settle();
    const rec = recorder.stop();

    const [online, resync, ...rest] = commits(events);
    expect(rest).toEqual([]);
    // The avatar for `a` rendered for presence; the refetch had already changed its query result, silently.
    const avatar = rec.roots.find((r) => r.name === 'Avatar')!;
    // A silent change is not why anything rendered: it comes last, whatever its count.
    expect(reasonsOf(rec, avatar)).toEqual([
      expect.stringMatching(/^external store #\d+ \(s\) => s\.online\.includes\(id\)$/),
      expect.stringMatching(/^external store #\d+ RESYNC \[query \["members"\]\] byId$/),
      expect.stringMatching(/^external store #\d+ SILENT \[query \["members"\]\] byId$/),
    ]);
    expect(online.causes).not.toContain('core:store resync');
    // The avatar mounted in the list fetches the stale query; React re-checks the store after the commit and renders
    // the avatar once more, for a result that changed nothing on the page.
    expect(resync.causes).toEqual(['core:store resync']);
    expect(resync.noDom).toBe(1);
    const reason = rec.reasons[resync.roots![0][2][0]];
    expect(reason).toMatchObject({ kind: 'store', store: 'query ["members"]', storeChange: 'resync' });
  });

  it("marks nothing when React's updater sets are not there to say which component an update is for", async () => {
    const { presence, client } = await presencePage();
    const roots = findRoots();
    const saved = roots.map((root) => root.pendingUpdatersLaneMap);
    const inert = { add() {}, clear() {}, delete() {}, forEach() {}, has: () => false, size: 0 } as unknown as Set<Fiber>;
    roots.forEach((root) => (root.pendingUpdatersLaneMap = Array.from({ length: 31 }, () => inert)));
    try {
      const { recorder } = makeRecorder({}, [[rq, null]]);
      recorder.start();
      await act(() => client.refetchQueries({ queryKey: ['members'] }));
      await settle();
      flush(() => presence.setState({ online: ['a'] }));
      await settle();
      const rec = recorder.stop();
      expect(rec.reasons.some((r) => r.storeChange)).toBe(false);
      expect(rec.causes.map((c) => c.key)).not.toContain('core:store resync');
    } finally {
      roots.forEach((root, i) => (root.pendingUpdatersLaneMap = saved[i]));
    }
  });

  it('tells a store that changed silently from the state that scheduled the render', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let bump!: () => void;
    const Name = () => {
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      const { data } = useQuery({ queryKey: ['members'], queryFn: members, staleTime: 0, select: byId });
      return (
        <b>
          {data?.get('a')?.name}
          {n}
        </b>
      );
    };
    mount(
      <QueryClientProvider client={client}>
        <Name />
      </QueryClientProvider>
    );
    await settle();
    const { recorder } = makeRecorder({}, [[rq, null]]);
    recorder.start();
    await act(() => client.refetchQueries({ queryKey: ['members'] }));
    await settle();
    flush(() => bump());
    const rec = recorder.stop();
    const name = rec.roots.find((r) => r.name === 'Name')!;
    expect(reasonsOf(rec, name)).toEqual([expect.stringMatching(/^state #\d+$/), expect.stringMatching(/^external store #\d+ SILENT \[query/)]);
  });

  it('marks nothing when the store stayed and only the selector read it for another key', () => {
    const people = createStore(() => ({ byId: { a: 'Ann', b: 'Bob' } as Record<string, string> }));
    let pick!: (id: string) => void;
    const Person = () => {
      const [id, setId] = useState('a');
      pick = setId;
      return <b>{useStore(people, (s) => s.byId[id])}</b>;
    };
    mount(<Person />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => pick('b'));
    const rec = recorder.stop();
    expect(rec.reasons.some((r) => r.storeChange)).toBe(false);
  });

  it('keeps the bailout when a silent store change is all that differs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let same!: () => void;
    const Name = () => {
      const [n, dispatch] = useReducer((v: number) => v, 0);
      same = dispatch;
      const { data } = useQuery({ queryKey: ['members'], queryFn: members, staleTime: 0, select: byId });
      return (
        <b>
          {data?.get('a')?.name}
          {n}
        </b>
      );
    };
    mount(
      <QueryClientProvider client={client}>
        <Name />
      </QueryClientProvider>
    );
    await settle();
    const { recorder } = makeRecorder({}, [[rq, null]]);
    recorder.start();
    await act(() => client.refetchQueries({ queryKey: ['members'] }));
    await settle();
    flush(() => same());
    const rec = recorder.stop();
    const name = rec.roots.find((r) => r.name === 'Name')!;
    expect(reasonsOf(rec, name)).toEqual(['bailout: state set to the same value', expect.stringMatching(/^external store #\d+ SILENT \[query/)]);
  });

  it("leaves React's store hooks as it found them when the recording stops", async () => {
    await presencePage();
    const { recorder } = makeRecorder({}, [[rq, null]]);
    recorder.start();
    recorder.stop();
    const descriptors: PropertyDescriptor[] = [];
    const stack: Fiber[] = [findRoots()[0].current];
    while (stack.length) {
      const f = stack.pop()!;
      if (f.tag === 0)
        for (let h = f.memoizedState as Hook | null; h; h = h.next)
          if (h.queue && 'getSnapshot' in h.queue)
            for (const key of ['getSnapshot', 'value']) descriptors.push(Object.getOwnPropertyDescriptor(h.queue, key)!);
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    expect(descriptors.length).toBeGreaterThan(0);
    expect(descriptors.every((d) => 'value' in d && d.writable)).toBe(true);
  });
});
