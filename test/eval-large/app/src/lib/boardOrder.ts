import type { Issue } from '../api/types';

/**
 * The sort order that puts an issue at slot `at` of a column, `at` counted over the cards as they are shown, the
 * dragged one included. Null when the card would stay where it is.
 */
export function orderAt(column: Pick<Issue, 'id' | 'sortOrder'>[], id: string, at: number): number | null {
  const from = column.findIndex((i) => i.id === id);
  if (from !== -1 && (at === from || at === from + 1)) return null;
  const rest = column.filter((i) => i.id !== id);
  const slot = from !== -1 && from < at ? at - 1 : at;
  const before = rest[slot - 1];
  const after = rest[slot];
  if (before && after) return (before.sortOrder + after.sortOrder) / 2;
  if (before) return before.sortOrder + 1;
  if (after) return after.sortOrder - 1;
  return 0;
}
