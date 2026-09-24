import { QueryClient } from '@tanstack/query-core';
import { nextOrder } from '../../src/core/env/timers';
import { PluginHost } from '../../src/core/plugins';
import type { Fiber } from '../../src/core/fiber';
import plugin from '../../src/plugins/react-query/runtime';

/** A stand-in for the committed tree: the provider fiber once the page has mounted it. */
const tree = (client: QueryClient | null) => ({
  scope: null,
  findFibers: (pred: (f: Fiber) => boolean) => {
    const provider = client ? ({ memoizedProps: { client } } as unknown as Fiber) : null;
    return provider && pred(provider) ? [provider] : [];
  },
});

describe('react-query plugin runtime', () => {
  let now = 0;
  beforeEach(() => {
    now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is inactive when the page has no provider', () => {
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(null), now);
    now += 2000;
    host.commit(tree(null));
    expect(host.stop(tree(null))['react-query']).toMatchObject({ active: false });
  });

  it('finds a provider that mounts after the recording started, and records its queries from then on', async () => {
    const client = new QueryClient();
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(null), now);
    // Looked for again only once a second has passed since the last search.
    now += 300;
    host.commit(tree(client));
    await client.prefetchQuery({ queryKey: ['early'], queryFn: () => 1 });
    expect(host.drain()).toEqual([]);
    now += 1000;
    host.commit(tree(client));
    await client.prefetchQuery({ queryKey: ['late'], queryFn: () => 2 });
    expect(host.drain().map((e) => e.type)).toContain('added ["late"]');
    const section = host.stop(tree(client))['react-query'];
    expect(section).toMatchObject({ active: true });
    expect(section.highlights?.join(' ')).toContain('["late"]');
  });

  it('is active, and says nothing happened, when the provider is there but no query moved', () => {
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(new QueryClient()), now);
    expect(host.stop(tree(null))['react-query']).toMatchObject({ active: true, highlights: ['no query events during the recording'] });
  });
});

describe('events that wait for their library timer', () => {
  const fiber = { tag: 0 } as unknown as Fiber;
  const host = () => {
    const h = new PluginHost([[{ name: 'q', packages: ['@tanstack/query-core'] }, null]]);
    h.start({ scope: null, findFibers: () => [] }, performance.now());
    return h;
  };

  it('go, as one per key, to the components the timer updated, and the timer stays out of it', () => {
    const h = host();
    h.emit('q', { type: 'fetch ["a"]', waitForTimer: true, merge: '["a"]' });
    h.emit('q', { type: 'fetch → success ["a"]', waitForTimer: true, merge: '["a"]' });
    expect(h.drain()).toEqual([]);
    // Some other package's timer is not the delivery.
    expect(h.deliver('zustand', () => new Set([fiber]))).toBe(false);
    expect(h.deliver('@tanstack/query-core', () => new Set([fiber]))).toBe(true);
    expect(h.drain()).toEqual([expect.objectContaining({ type: 'fetch → success ["a"]', aimed: true, fibers: new Set([fiber]) })]);
  });

  it('wait past a timer that was not the delivery, and are dropped if the delivery never comes', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const h = host();
    h.emit('q', { type: 'success ["a"]', waitForTimer: true });
    const startedAt = nextOrder();
    h.emit('q', { type: 'fetch ["b"]', waitForTimer: true });
    // Only what waited from before the timer started goes with it.
    expect(h.deliver('@tanstack/query-core', () => new Set([fiber]), startedAt)).toBe(true);
    expect(h.drain().map((e) => e.type)).toEqual(['success ["a"]']);
    expect(h.hasWaiting).toBe(true);
    // Its timers delivered before: one that never comes means nothing listened.
    now += 2000;
    expect(h.drain()).toEqual([]);
    expect(h.hasWaiting).toBe(false);
    vi.restoreAllMocks();
  });

  it('go to the next commit as they are when the plugin has no timer delivering them', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const h = host();
    h.emit('q', { type: 'success ["a"]', waitForTimer: true });
    now += 2000;
    expect(h.drain()).toEqual([expect.objectContaining({ type: 'success ["a"]' })]);
    vi.restoreAllMocks();
  });
});
