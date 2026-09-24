import fs from 'node:fs';
import path from 'node:path';
import { aggregateEvents } from '../shared/aggregate';
import type { RecordingV2, SessionEvent, SessionMeta, SessionStatus } from '../shared/schema';

export interface SessionEntry {
  id: string;
  dir: string;
  meta: SessionMeta;
  status: SessionStatus;
  hasRecording: boolean;
  bytes: number;
}

const ID = /^\d{8}-\d{6}-[\w.-]+$/;
/** The page sends a heartbeat every 10 s while recording; silence longer than this means the tab is gone. */
const STALE_MS = 30_000;

export function resolveDir(argDir?: string): string {
  return path.resolve(argDir ?? process.env.REACT_PERF_RECORDER_DIR ?? path.join(process.cwd(), '.agent-artifacts/perf-recorder'));
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function listSessions(dir: string): SessionEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: SessionEntry[] = [];
  for (const id of fs.readdirSync(dir).filter((name) => ID.test(name))) {
    const sessionDir = path.join(dir, id);
    const meta = readJson<SessionMeta>(path.join(sessionDir, 'session.json'));
    if (!meta) continue;
    const hasRecording = fs.existsSync(path.join(sessionDir, 'recording.json'));
    const stale = meta.status === 'recording' && Date.now() - Date.parse(meta.updatedAt) > STALE_MS;
    let bytes = 0;
    for (const name of fs.readdirSync(sessionDir)) bytes += fs.statSync(path.join(sessionDir, name)).size;
    out.push({ id, dir: sessionDir, meta, status: stale ? 'interrupted' : meta.status, hasRecording, bytes });
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function findSession(dir: string, ref: string): SessionEntry {
  const sessions = listSessions(dir);
  const latest = /^latest(?:-(\d+))?$/.exec(ref);
  const entry = latest ? sessions[Number(latest[1] ?? 0)] : sessions.find((s) => s.id === ref) ?? sessions.find((s) => s.id.includes(ref));
  if (!entry) throw new Error(sessions.length ? `no session ${ref}; latest is ${sessions[0].id}` : `no sessions in ${dir} yet`);
  return entry;
}

const pageOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
};

/**
 * `latest` is whoever recorded last into the folder. When other pages were recorded around the same time — another
 * agent on another app — the answer says so, rather than hand over someone else's recording as yours.
 */
export function latestWarning(dir: string, ref: string, entry: SessionEntry): string | undefined {
  if (!/^latest/.test(ref)) return undefined;
  const at = Date.parse(entry.meta.createdAt);
  const page = pageOf(entry.meta.page.url);
  const others = new Set(
    listSessions(dir)
      .filter((s) => Math.abs(Date.parse(s.meta.createdAt) - at) < 10 * 60_000 && pageOf(s.meta.page.url) !== page)
      .map((s) => pageOf(s.meta.page.url))
  );
  if (!others.size) return undefined;
  return `"${ref}" is ${entry.id} on ${page}; ${[...others].slice(0, 3).join(', ')} ${
    others.size > 1 ? 'were' : 'was'
  } recorded in the same ten minutes — someone else may record into this folder: pass the id record_page returned`;
}

export function readEvents(entry: SessionEntry): SessionEvent[] {
  const file = path.join(entry.dir, 'events.ndjson');
  if (!fs.existsSync(file)) return [];
  const events: SessionEvent[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A line cut by a crash; the rest is still valid.
    }
  }
  return events;
}

/** The final recording, or one rebuilt from the events of a running or interrupted session. */
export function readRecording(entry: SessionEntry): RecordingV2 & { status: SessionStatus } {
  const recording = entry.hasRecording ? readJson<RecordingV2>(path.join(entry.dir, 'recording.json')) : null;
  const base = recording ?? aggregateEvents(entry.meta, readEvents(entry));
  return { ...base, id: entry.id, status: entry.status };
}

export interface WaitOptions {
  afterId?: string;
  /** Only a session whose page url contains this: another agent may be recording another app into the same folder. */
  url?: string;
  until: 'started' | 'done';
  timeoutMs: number;
  signal?: AbortSignal;
  onTick?: (waitedMs: number) => void;
}

/** Polls the folder: a new session (`started`) or one that reached done/interrupted after the call began (`done`). */
export async function waitForSession(dir: string, options: WaitOptions): Promise<SessionEntry | null> {
  const began = Date.now();
  const known = new Map(listSessions(dir).map((s) => [s.id, s.status]));
  let lastTick = began;
  while (Date.now() - began < options.timeoutMs) {
    if (options.signal?.aborted) return null;
    for (const s of listSessions(dir)) {
      if (options.afterId && s.id <= options.afterId) continue;
      if (options.url && !s.meta.page.url.includes(options.url)) continue;
      const before = known.get(s.id);
      if (options.until === 'started' && before === undefined) return s;
      if (options.until === 'done' && s.status !== 'recording' && before !== s.status && (before === undefined || before === 'recording')) return s;
    }
    if (Date.now() - lastTick > 15_000) {
      lastTick = Date.now();
      options.onTick?.(lastTick - began);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}
