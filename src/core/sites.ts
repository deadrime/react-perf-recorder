export interface Position {
  url: string;
  line: number;
  column: number;
}

export type SiteMapper = (positions: Position[]) => Promise<Record<string, string>>;

export const positionKey = (p: Position) => `${p.url}:${p.line}:${p.column}`;

const known = new Map<string, string>();
const asked = new Set<string>();
const queue = new Map<string, Position>();
const listeners = new Set<() => void>();
let mapper: SiteMapper | null = null;
let inFlight: Promise<void> | null = null;
let scheduled: ReturnType<typeof setTimeout> | null = null;

/** The dev server is the only thing that can turn a built position back into a line of a file. */
export function setSiteMapper(fn: SiteMapper | null) {
  mapper = fn;
}

export function onSitesMapped(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The file and line of a built position once the dev server has said; until then nothing, and it is queued. */
export function mappedSite(position: Position): string | undefined {
  const key = positionKey(position);
  const site = known.get(key);
  if (site) return site;
  // An empty one is a position the server could not map; it is not asked for again.
  if (site === '' || !mapper) return undefined;
  if (!asked.has(key)) {
    asked.add(key);
    queue.set(key, position);
    schedule();
  }
  return undefined;
}

/** Sends what is queued now and resolves when the server has answered it; the tests wait on this. */
export async function mappedSites(): Promise<void> {
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
    void flush();
  }
  await inFlight;
}

function schedule() {
  if (scheduled || inFlight) return;
  // The next tick, not later: a tree's or a commit's positions go in one request, and the line is there before Copy.
  scheduled = setTimeout(() => {
    scheduled = null;
    void flush();
  }, 0);
}

function flush(): Promise<void> {
  if (!mapper || !queue.size) return Promise.resolve();
  const positions = [...queue.values()];
  queue.clear();
  const request = mapper(positions)
    .then((sites) => {
      for (const [key, site] of Object.entries(sites)) known.set(key, site);
      // A position the server could not map is remembered as unmappable, so it is not asked for again.
      for (const position of positions) if (!known.has(positionKey(position))) known.set(positionKey(position), '');
      if (Object.keys(sites).length) for (const listener of listeners) listener();
    })
    .catch(() => {
      // The dev server may be gone; the file without a line is still worth showing.
      for (const position of positions) asked.delete(positionKey(position));
    })
    .finally(() => {
      inFlight = null;
      if (queue.size) schedule();
    });
  inFlight = request;
  return request;
}

/** Tests and a page that navigated away start clean. */
export function resetSites() {
  known.clear();
  asked.clear();
  queue.clear();
  if (scheduled) clearTimeout(scheduled);
  scheduled = null;
  inFlight = null;
}
