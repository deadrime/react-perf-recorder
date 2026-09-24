import { createMemoInstrumentation, definePlugin, type MemoStat } from '../../runtime';

const memo = createMemoInstrumentation();

export const instrument = memo.instrument;
export const nameMemoized = memo.name;

export default definePlugin(() => ({
  name: 'proxy-memoize',
  describe: (fn, kind) => (kind === 'selector' ? memo.label(fn) : null),
  start: () => memo.start(),
  stop() {
    const selectors: MemoStat[] = memo.stop();
    const evicting = selectors.filter((s) => s.evicting);
    return {
      version: 1,
      active: memo.used,
      highlights: selectors.length
        ? [
            ...evicting
              .slice(0, 5)
              .map((s) =>
                s.distinctArgs > s.size
                  ? `${s.name}: ${s.recomputes}/${s.calls} recomputes, ${s.distinctArgs} argument sets > cache size ${s.size}`
                  : `${s.name}: ${s.recomputes}/${s.calls} recomputes, ${s.evictions} after the answer was pushed out of cache size ${s.size} (${s.distinctArgs} argument sets)`
              ),
            ...selectors
              .filter((s) => !s.evicting)
              .slice(0, 3)
              .map((s) => `${s.name}: ${s.recomputes}/${s.calls} recomputes`),
          ]
        : ['no selector calls during the recording'],
      metrics: Object.fromEntries(
        selectors.slice(0, 30).flatMap((s) => [
          [`${s.name}.calls`, { value: s.calls, kind: 'count' as const }],
          [`${s.name}.recomputes`, { value: s.recomputes, kind: 'count' as const }],
        ])
      ),
      data: { selectors },
    };
  },
}));
