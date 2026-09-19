import { definePlugin } from '../../runtime';

interface QueryCache {
  subscribe(listener: (event: { type: string; action?: { type?: string }; query: { queryKey: unknown } }) => void): () => void;
}

const ACTIONS = new Set(['fetch', 'success', 'error', 'invalidate']);

export default definePlugin(() => {
  let unsubscribe: (() => void) | null = null;
  let found = false;
  const counts = new Map<string, number>();
  return {
    name: 'react-query',
    start(session) {
      counts.clear();
      // The client is found through the provider's props: importing it would load a second module instance after HMR.
      const [provider] = session.findFibers((f) => typeof f.memoizedProps?.client?.getQueryCache === 'function', 1);
      found = Boolean(provider);
      if (!provider) {
        session.warn('QueryClientProvider not found on the page');
        return;
      }
      const cache: QueryCache = provider.memoizedProps.client.getQueryCache();
      unsubscribe = cache.subscribe((event) => {
        const action = event.action?.type;
        if (!(event.type === 'added' || event.type === 'removed' || (event.type === 'updated' && action && ACTIONS.has(action)))) return;
        const type = `${event.type}${action ? `:${action}` : ''} ${JSON.stringify(event.query.queryKey).slice(0, 70)}`;
        counts.set(type, (counts.get(type) ?? 0) + 1);
        session.emitCause({ type });
      });
    },
    stop() {
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
        highlights: found ? list.slice(0, 3).map(([type, n]) => `${n}× ${type}`) : ['QueryClientProvider not found'],
        metrics: Object.fromEntries([...byKind].map(([kind, n]) => [`events.${kind}`, { value: n, kind: 'count' as const }])),
        data: { clientFound: found, events: list.slice(0, 50) },
      };
    },
  };
});
