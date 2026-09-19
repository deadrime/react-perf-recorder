import { CLIENT_HEADER, type RecordingV1, type SessionEvent, type SessionMeta } from '../shared/schema';

export interface OpenMeta {
  source: string;
  label?: string;
  page: RecordingV1['page'];
  scope: SessionMeta['scope'];
  conditions: SessionMeta['conditions'];
  plugins: SessionMeta['plugins'];
}

export interface SavedSession {
  id: string;
  dir: string;
  /** `url:line:column` of a generated call site → its line in the source. */
  sites?: Record<string, { site: string; code?: string }>;
}

const FLUSH_MS = 2000;
const HEARTBEAT_MS = 10_000;
const BATCH = 200;
const PENDING_KEY = 'react-perf-recorder:session';

/**
 * Streams one session to the dev server: open, batches of events, finish. Without a server (IIFE on a static page)
 * the session stays local and the caller offers a download.
 */
export class SessionWriter {
  id: string | null = null;
  failed: string | null = null;
  private token: string | null = null;
  private queue: SessionEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly opening: Promise<void>;
  private sending: Promise<void> = Promise.resolve();

  constructor(private endpoint: string, meta: OpenMeta) {
    this.opening = this.open(meta);
  }

  push(event: SessionEvent) {
    if (this.failed) return;
    this.queue.push(event);
    if (this.queue.length >= BATCH) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.sending = this.sending.then(async () => {
      await this.opening;
      if (!this.id || this.failed || !this.queue.length) return;
      const events = this.queue.splice(0);
      await this.post(`sessions/${this.id}/events`, { events }).catch((error) => {
        this.failed = `events not saved: ${String(error?.message ?? error)}`;
      });
    });
    return this.sending;
  }

  /** Page is going away: send what is left without waiting; the server marks the session interrupted. */
  beacon(atMs: number) {
    if (!this.id || !this.token || this.failed) return;
    const events = [...this.queue.splice(0), { k: 'end', atMs } as SessionEvent];
    const url = `${this.endpoint}/sessions/${this.id}/events?token=${encodeURIComponent(this.token)}&end=1`;
    try {
      navigator.sendBeacon?.(url, new Blob([JSON.stringify({ events })], { type: 'text/plain' }));
    } catch {
      // Nothing left to do while the page unloads.
    }
    this.clearPending();
  }

  async finish(recording: RecordingV1): Promise<SavedSession | null> {
    await this.flush();
    this.stopHeartbeat();
    this.clearPending();
    if (!this.id || this.failed) return null;
    try {
      const saved = (await this.post(`sessions/${this.id}/finish`, { recording })) as SavedSession;
      return saved;
    } catch (error) {
      this.failed = `recording not saved: ${String((error as Error)?.message ?? error)}`;
      return null;
    }
  }

  static takeInterrupted(): { id: string } | null {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(PENDING_KEY);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async open(meta: OpenMeta) {
    try {
      const { id, token } = (await this.post('sessions', meta)) as { id: string; token: string };
      this.id = id;
      this.token = token;
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id }));
      } catch {
        // Private mode: the reload notice is lost, the session itself is not.
      }
      this.heartbeat = setInterval(() => void this.post(`sessions/${this.id}/events`, { events: [] }).catch(() => {}), HEARTBEAT_MS);
    } catch (error) {
      this.failed = `dev server unavailable: ${String((error as Error)?.message ?? error)}`;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearPending() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // See open().
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CLIENT_HEADER]: '1' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text().catch(() => '')}`.trim());
    return response.json();
  }
}
