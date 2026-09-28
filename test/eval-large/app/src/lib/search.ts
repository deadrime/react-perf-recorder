/**
 * A small fuzzy matcher for the command palette and the issue search: every query character in order, with a bonus
 * for runs and word starts. Returns 0 when the query does not match.
 */
export function fuzzyScore(query: string, text: string) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const exact = t.indexOf(q);
  if (exact >= 0) return 100 - Math.min(exact, 50) + (exact === 0 || t[exact - 1] === ' ' ? 20 : 0);
  let score = 0;
  let run = 0;
  let from = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, from);
    if (at < 0) return 0;
    run = at === from ? run + 1 : 0;
    score += 1 + run * 2 + (at === 0 || t[at - 1] === ' ' ? 3 : 0);
    from = at + 1;
  }
  return score;
}

export function matchesAllWords(query: string, text: string) {
  const t = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => t.includes(word));
}
