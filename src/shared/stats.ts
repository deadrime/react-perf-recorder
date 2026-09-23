/** The n biggest entries of a count map, biggest first. */
export const topEntries = <K>(map: Map<K, number>, n: number): Array<[K, number]> => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

/** The median gap between times in order, or null with fewer than two. */
export function medianGap(times: number[]): number | null {
  if (times.length < 2) return null;
  const gaps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
