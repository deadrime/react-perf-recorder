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

export interface ReferenceIndex {
  entries: Array<{ key: string; title: string }>;
  grams: Map<string, Set<number>>;
}

/** Trigrams of every issue's key, title and description, for the `#` references in a comment. */
export function buildReferenceIndex(issues: Array<{ key: string; title: string; description: string }>): ReferenceIndex {
  const entries = issues.map(({ key, title }) => ({ key, title }));
  const grams = new Map<string, Set<number>>();
  issues.forEach((issue, n) => {
    const text = ` ${issue.key} ${issue.title} ${issue.description} `.toLowerCase();
    for (let at = 0; at + 3 <= text.length; at++) {
      const gram = text.slice(at, at + 3);
      let hits = grams.get(gram);
      if (!hits) grams.set(gram, (hits = new Set()));
      hits.add(n);
    }
  });
  return { entries, grams };
}

/** The issues whose key, title or description holds every trigram of the query; a query under three letters matches key prefixes. */
export function searchReferences({ entries, grams }: ReferenceIndex, query: string, limit = 5) {
  const q = query.toLowerCase();
  if (q.length < 3) return entries.filter((e) => e.key.toLowerCase().startsWith(q)).slice(0, limit);
  let found = [...(grams.get(q.slice(0, 3)) ?? [])];
  for (let at = 1; at + 3 <= q.length && found.length; at++) {
    const hits = grams.get(q.slice(at, at + 3));
    found = found.filter((n) => hits?.has(n));
  }
  return found.slice(0, limit).map((n) => entries[n]);
}
