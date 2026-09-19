import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { CLIENT_HEADER, ENDPOINT, SESSION_SCHEMA, type RecordingV1, type SessionEvent, type SessionMeta } from '../shared/schema';

export interface SessionStoreOptions {
  dir: string;
  maxBytes: number;
  retain: { sessions: number; bytes: number };
  /** Inside the project the folder gets a `.gitignore` with `*`. */
  gitignore: boolean;
  /** Turns a generated call site into `src/file.ts:line` and the source line; set by the Vite plugin. */
  mapSite?: (url: string, line: number, column: number) => Promise<{ site: string; code?: string } | null>;
}

const ID = /^\d{8}-\d{6}-[\w.-]+$/;

const slug = (s: string | undefined) =>
  (s ?? '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'app';

const stamp = (d: Date) => {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function writeAtomic(file: string, data: string) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function dirSize(dir: string): number {
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    try {
      total += fs.statSync(path.join(dir, name)).size;
    } catch {
      // Removed meanwhile.
    }
  }
  return total;
}

export class SessionStore {
  private tokens = new Map<string, string>();

  constructor(private options: SessionStoreOptions) {}

  get dir() {
    return this.options.dir;
  }

  get maxBytes() {
    return this.options.maxBytes;
  }

  private ensureDir() {
    if (fs.existsSync(this.options.dir)) return;
    fs.mkdirSync(this.options.dir, { recursive: true });
    if (this.options.gitignore) fs.writeFileSync(path.join(this.options.dir, '.gitignore'), '*\n');
  }

  open(meta: Partial<SessionMeta>): { id: string; token: string } {
    this.ensureDir();
    this.prune();
    const now = new Date();
    const scope = meta.scope?.name ? slug(meta.scope.name) : 'app';
    const source = slug(meta.source ?? 'api').replace(/^script-/, '');
    let id = `${stamp(now)}-${scope}-${source}-${randomBytes(2).toString('hex')}`;
    while (fs.existsSync(path.join(this.options.dir, id))) id = `${id.slice(0, -4)}${randomBytes(2).toString('hex')}`;
    const dir = path.join(this.options.dir, id);
    fs.mkdirSync(dir);
    const session: SessionMeta = {
      schema: SESSION_SCHEMA,
      version: 1,
      id,
      status: 'recording',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      source: String(meta.source ?? 'api'),
      ...(meta.label ? { label: String(meta.label).slice(0, 200) } : {}),
      page: meta.page ?? { url: '', title: '', viewport: '', dpr: 1, userAgent: '' },
      scope: meta.scope ?? null,
      conditions: meta.conditions ?? {},
      plugins: meta.plugins ?? [],
      events: 0,
      reloads: 0,
    };
    writeAtomic(path.join(dir, 'session.json'), JSON.stringify(session, null, 2));
    fs.writeFileSync(path.join(dir, 'events.ndjson'), '');
    const token = randomBytes(16).toString('hex');
    this.tokens.set(id, token);
    return { id, token };
  }

  checkToken(id: string, token: string | null) {
    return Boolean(token) && this.tokens.get(id) === token;
  }

  append(id: string, events: SessionEvent[]) {
    const dir = this.sessionDir(id);
    const meta = this.readMeta(dir);
    if (events.length) fs.appendFileSync(path.join(dir, 'events.ndjson'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
    meta.events += events.length;
    meta.updatedAt = new Date().toISOString();
    if (meta.status === 'recording' && events.some((e) => e.k === 'end')) meta.status = 'interrupted';
    writeAtomic(path.join(dir, 'session.json'), JSON.stringify(meta, null, 2));
  }

  async finish(id: string, recording: RecordingV1): Promise<{ id: string; dir: string }> {
    const dir = this.sessionDir(id);
    const meta = this.readMeta(dir);
    await this.mapHookSites(recording);
    writeAtomic(path.join(dir, 'recording.json'), JSON.stringify({ ...recording, id }, null, 1));
    meta.status = 'done';
    meta.updatedAt = new Date().toISOString();
    writeAtomic(path.join(dir, 'session.json'), JSON.stringify(meta, null, 2));
    this.tokens.delete(id);
    return { id, dir };
  }

  private async mapHookSites(recording: RecordingV1) {
    const mapSite = this.options.mapSite;
    if (!mapSite) return;
    const cache = new Map<string, Promise<{ site: string; code?: string } | null>>();
    for (const root of [...recording.roots, ...recording.outsideRoots]) {
      for (const hook of Object.values(root.hooks ?? {})) {
        const g = hook.generated;
        if (!g) continue;
        const key = `${g.url}:${g.line}:${g.column}`;
        if (!cache.has(key))
          cache.set(
            key,
            mapSite(g.url, g.line, g.column).catch(() => null)
          );
        const mapped = await cache.get(key)!;
        if (mapped) {
          hook.site = mapped.site;
          if (mapped.code) hook.code = mapped.code;
          delete hook.generated;
        }
      }
    }
  }

  private sessionDir(id: string) {
    if (!ID.test(id)) throw Object.assign(new Error('bad session id'), { status: 400 });
    const dir = path.join(this.options.dir, id);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('unknown session'), { status: 404 });
    return dir;
  }

  private readMeta(dir: string): SessionMeta {
    return JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8'));
  }

  /** Oldest sessions go first; a session still being written (updated within a minute) is never removed. */
  private prune() {
    const { sessions, bytes } = this.options.retain;
    const entries = fs
      .readdirSync(this.options.dir)
      .filter((name) => ID.test(name))
      .sort()
      .map((name) => {
        const dir = path.join(this.options.dir, name);
        return { dir, size: dirSize(dir), mtime: fs.statSync(dir).mtimeMs };
      });
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    let count = entries.length;
    for (const entry of entries) {
      if (count < sessions && total <= bytes) break;
      if (Date.now() - entry.mtime < 60_000) continue;
      fs.rmSync(entry.dir, { recursive: true, force: true });
      count--;
      total -= entry.size;
    }
  }
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

/**
 * `POST sessions`, `POST sessions/:id/events`, `POST sessions/:id/finish`, `GET health` under `{base}__react-perf-recorder`.
 * Writes need our header with a JSON content type: a cross-origin page cannot send that without a preflight, which
 * this server never answers. `sendBeacon` cannot set headers, so a page unload proves itself with the session token.
 */
export function createMiddleware(store: SessionStore, base: string, version: string) {
  const prefix = `${base.replace(/\/$/, '')}/${ENDPOINT}/`;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(prefix)) return next();
    const route = url.pathname.slice(prefix.length);
    try {
      if (req.method === 'GET' && route === 'health') return send(res, 200, { ok: true, version, dir: store.dir });
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      const match = /^sessions(?:\/([^/]+)\/(events|finish))?$/.exec(route);
      if (!match) return send(res, 404, { error: 'not found' });
      const [, id, action] = match;
      const trusted = req.headers[CLIENT_HEADER] === '1' && String(req.headers['content-type'] ?? '').startsWith('application/json');
      const beacon = action === 'events' && id && store.checkToken(id, url.searchParams.get('token'));
      if (!trusted && !beacon) return send(res, 415, { error: `requests need content-type application/json and ${CLIENT_HEADER}: 1` });
      const raw = await readBody(req, action === 'finish' ? store.maxBytes : Math.min(store.maxBytes, 16 * 1024 * 1024));
      const body = raw ? JSON.parse(raw) : {};
      if (!action) return send(res, 200, store.open(body));
      if (action === 'events') {
        if (!Array.isArray(body.events)) return send(res, 400, { error: 'events must be an array' });
        store.append(id, body.events);
        return send(res, 200, { ok: true });
      }
      if (body.recording?.schema !== 'react-perf-recorder/recording') return send(res, 400, { error: 'not a recording' });
      return send(res, 200, await store.finish(id, body.recording));
    } catch (error) {
      const status = (error as { status?: number }).status ?? (error instanceof SyntaxError ? 400 : 500);
      return send(res, status, { error: String((error as Error).message ?? error) });
    }
  };
}
