import { definePlugin, type SessionContext } from '../../runtime';

interface QueryCache {
  subscribe(listener: (event: { type: string; action?: { type?: string }; query: { queryKey: unknown } }) => void): () => void;
}

const ACTIONS = new Set(['fetch', 'success', 'error', 'invalidate']);

/** A provider that mounts late (a lazy route, a recording from the page load) is looked for again, this often at most. */
const SEARCH_EVERY_MS = 1000;

export default definePlugin(() => {
  let unsubscribe: (() => void) | null = null;
  let found = false;
  let searchedAt = -Infinity;
  const counts = new Map<string, number>();
  /** What a waiting event has gathered: `fetch → success ["presence"]`. */
  const kinds = new WeakMap<object, string[]>();

  function search(session: SessionContext) {
    searchedAt = session.now();
    // The client is found through the provider's props: importing it would load a second module instance after HMR.
    const [provider] = session.findFibers((f) => typeof f.memoizedProps?.client?.getQueryCache === 'function', 1);
    if (!provider) return;
    found = true;
    const cache: QueryCache = provider.memoizedProps.client.getQueryCache();
    unsubscribe = cache.subscribe((event) => {
      const action = event.action?.type;
      const updated = event.type === 'updated';
      if (!(event.type === 'added' || event.type === 'removed' || (updated && action && ACTIONS.has(action)))) return;
      const key = JSON.stringify(event.query.queryKey).slice(0, 70);
      const kind = updated ? action! : event.type;
      counts.set(`${kind} ${key}`, (counts.get(`${kind} ${key}`) ?? 0) + 1);
      if (!updated) {
        session.emitCause({ type: `${kind} ${key}` });
        return;
      }
      // Observers hear of an update in react-query's own timer: the event waits for it, one per query.
      const cause = session.emitCause({ type: `${kind} ${key}`, waitForTimer: true, merge: key });
      if (!cause) return;
      const seen = kinds.get(cause);
      if (seen) {
        if (!seen.includes(kind)) seen.push(kind);
        cause.type = `${seen.join(' → ')} ${key}`;
      } else kinds.set(cause, [kind]);
    });
  }

  return {
    name: 'react-query',
    packages: ['@tanstack/react-query', '@tanstack/query-core'],
    start(session) {
      counts.clear();
      found = false;
      search(session);
    },
    commit(session) {
      if (!found && session.now() - searchedAt >= SEARCH_EVERY_MS) search(session);
    },
    stop(session) {
      if (!found) search(session);
      unsubscribe?.();
      unsubscribe = null;
      const list = [...counts].sort((a, b) => b[1] - a[1]);
      const byKind = new Map<string, number>();
      for (const [type, n] of list) {
        const kind = type.split(' ')[0];
        byKind.set(kind, (byKind.get(kind) ?? 0) + n);
      }
      return {
        version: 1,
        active: found,
        highlights: list.length ? list.slice(0, 3).map(([type, n]) => `${n}× ${type}`) : ['no query events during the recording'],
        metrics: Object.fromEntries([...byKind].map(([kind, n]) => [`events.${kind}`, { value: n, kind: 'count' as const }])),
        data: { clientFound: found, events: list.slice(0, 50) },
      };
    },
  };
});
