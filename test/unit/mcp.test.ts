// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, section } from '../../src/mcp/server';
import type { RecordingV2, SessionEvent, SessionMeta } from '../../src/shared/schema';

let dir: string;
let client: Client;

const meta = (id: string, status: SessionMeta['status'], updatedAt = new Date().toISOString()): SessionMeta => ({
  schema: 'react-perf-recorder/session',
  version: 1,
  id,
  status,
  createdAt: updatedAt,
  updatedAt,
  source: 'panel',
  page: { url: 'http://localhost:5173/trade', title: 't', viewport: '1920×919', dpr: 1, userAgent: 'x' },
  scope: { name: 'OrderForm', source: 'src/OrderForm.tsx:10' },
  conditions: { viewport: '1920×919' },
  plugins: [{ name: 'zustand', sectionVersion: 1 }],
  events: 0,
  reloads: 0,
});

const events = (renders: number): SessionEvent[] => [
  { k: 'root', i: 0, key: 'Amount|src/Amount.tsx:3|OrderForm', name: 'Amount', source: 'src/Amount.tsx:3', path: 'OrderForm' },
  { k: 'reason', info: { i: 0, kind: 'state', hook: 2, text: 'state #2' } },
  { k: 'action', action: { id: 1, kind: 'typing', atMs: 10, endMs: 300, chars: 3, length: 3, target: { tag: 'input', name: 'amount' } } },
  { k: 'commit', t: 20, n: renders, event: 'input', roots: [[0, renders, [0]]], causes: ['core:input input'] },
  { k: 'commit', t: 120, n: renders, event: 'input', roots: [[0, renders, [0]]], causes: ['core:input input'] },
  { k: 'commit', t: 220, n: renders, event: 'input', roots: [[0, renders, [0]]], causes: ['core:input input'] },
];

const write = (m: SessionMeta, list: SessionEvent[]) => {
  const d = path.join(dir, m.id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'session.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(d, 'events.ndjson'), list.map((e) => JSON.stringify(e)).join('\n') + '\n');
};

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
};

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-mcp-'));
  write(meta('20260919-100000-OrderForm-panel-aaaa', 'recording', new Date(Date.now() - 120_000).toISOString()), events(80));
  write(meta('20260919-110000-OrderForm-panel-bbbb', 'recording'), events(8));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(dir).connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('MCP server', () => {
  it('lists sessions newest first and marks a silent one interrupted', async () => {
    const list = await call('list_recordings');
    expect(list.recordings.map((r: { id: string; status: string }) => [r.id.slice(-4), r.status])).toEqual([
      ['bbbb', 'recording'],
      ['aaaa', 'interrupted'],
    ]);
    expect(list.recordings[1]).toMatchObject({ area: 'OrderForm', actions: 1, commits: 3, renders: 240 });
    // The leading root is named with its reason in words: the listing has nothing to look an id up in.
    expect(list.recordings[1].topRoot).toBe('Amount ×3 · state #2');
  });

  it('hands a component its reasons in words, keeping the id the timeline uses', () => {
    const rec = {
      durationMs: 1000,
      reasons: [{ i: 7, kind: 'store', hook: 2, store: 'useChatStore', sameContent: true }],
      components: [{ name: 'Status', renders: 396, withoutDom: 394, byParent: 0, memo: true, reasons: [[7, 394]] }],
    } as unknown as RecordingV2;
    const components = section(rec, 'components', 10, 0) as { items: Array<{ reasons: unknown[] }> };
    expect(components.items[0].reasons).toEqual([{ i: 7, n: 394, reason: 'external store #2 SAME-CONTENT [useChatStore]' }]);
  });

  it('returns a partial summary and the actions section', async () => {
    const got = await call('get_recording', { id: 'latest-1' });
    expect(got).toMatchObject({ status: 'interrupted', partial: true });
    expect(got.summary.actions[0]).toMatchObject({
      what: 'typing 3 chars into «amount»',
      renders: 240,
      perChar: '80 renders, 1 commits per char (max 80)',
    });
    const actions = await call('get_recording', { id: 'latest-1', section: 'actions' });
    expect(actions.actions.items[0].topRoots[0]).toMatchObject({ root: 'Amount', renders: 240, reason: 'state #2' });
  });

  it('gives the timeline as a line per commit, in words', async () => {
    const got = await call('get_recording', { id: 'latest-1', section: 'timeline' });
    expect(got.timeline.total).toBe(3);
    // Everything the recording keeps as ids — the action, the causes, the roots and their reasons — is resolved here.
    expect(got.timeline.items[0]).toMatchObject({
      i: 0,
      atSec: 0.02,
      renders: 80,
      event: 'input',
      action: 'typing 3 chars into «amount»',
      causes: ['core:input input'],
      roots: [{ root: 'Amount', hits: 80, reasons: ['state #2'] }],
    });
    expect(got.timeline.items[1]).toMatchObject({ i: 1, sinceMs: 100 });
  });

  it('waits for a session to finish', async () => {
    const waiting = call('wait_for_recording', { timeoutMs: 5000 });
    setTimeout(() => write(meta('20260919-120000-OrderForm-panel-cccc', 'done'), events(4)), 300);
    const done = await waiting;
    expect(done).toMatchObject({ status: 'done', id: '20260919-120000-OrderForm-panel-cccc' });
    expect(done.summary.totals.renders).toBe(12);
  });

  it('times out when nothing is recorded', async () => {
    expect(await call('wait_for_recording', { timeoutMs: 1000 })).toMatchObject({ status: 'timeout' });
  });

  it('compares two sessions', async () => {
    const result = await call('compare_recordings', {
      before: '20260919-100000-OrderForm-panel-aaaa',
      after: '20260919-110000-OrderForm-panel-bbbb',
    });
    expect(result.roots[0]).toMatchObject({ root: 'Amount', perHit: { before: 80, after: 8 } });
    expect(result.actions[0]).toMatchObject({ per: 'char', renders: { before: 80, after: 8 } });
  });
});
