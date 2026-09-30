import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cpuLine } from '../../src/shared/cpu';
import { aggregate, frameKey, type ResolvedFrame } from '../../src/vite/cpu/aggregate';
import { profileFromTrace, type CallFrame, type CpuProfile } from '../../src/vite/cpu/profile';
import { resolveFrames } from '../../src/vite/cpu/symbols';

const APP = 'http://localhost:5173/src';
const DEPS = 'http://localhost:5173/node_modules/.vite/deps';

/** Frames as V8 names them, and how the dev server would resolve them. */
const F: Record<string, [CallFrame, ResolvedFrame]> = {};
const def = (id: string, url: string, line: number, resolved: ResolvedFrame, scriptId = '1') => {
  F[id] = [{ functionName: resolved.name, scriptId, url, lineNumber: line, columnNumber: 0 }, resolved];
};
def('loop', `${DEPS}/chunk-A.js`, 10, { name: 'workLoopSync', package: 'react-dom' });
def('rwh', `${DEPS}/chunk-A.js`, 20, { name: 'renderWithHooks', package: 'react-dom' });
def('bottom', `${DEPS}/chunk-A.js`, 30, { name: 'react-stack-bottom-frame', package: 'react-dom' });
def('Rows', `${APP}/Rows.tsx`, 4, { name: 'Rows', site: 'src/Rows.tsx:5', package: null });
def('useStore', `${DEPS}/zustand.js`, 1, { name: 'useStore', package: 'zustand' });
def('select', `${APP}/select.ts`, 1, { name: 'selectRows', site: 'src/select.ts:2', package: null });
def('sort', '', -1, { name: 'sort', package: null, native: true }, '0');
def('css', `${DEPS}/chunk-B.js`, 5, { name: 'serializeStyles', package: '@emotion/serialize' });
def('onmsg', `${DEPS}/chunk-C.js`, 5, { name: 'onmessage', package: 'engine.io-client' });
def('decode', `${DEPS}/chunk-C.js`, 50, { name: 'decode', package: 'socket.io-parser' });
def('timer', 'http://localhost:5173/@fs/rpr/src/core/env/timers.ts', 9, { name: '', package: 'react-perf-recorder', own: true });
def('tick', `${APP}/clock.ts`, 3, { name: 'tick', site: 'src/clock.ts:4', package: null });
def('hook', 'http://localhost:5173/@fs/rpr/src/core/commit-hook.ts', 9, { name: 'onCommit', package: 'react-perf-recorder', own: true });
def('driver', '', 2, { name: 'querySelectorAll', package: '(evaluated)', external: true }, '181');

/** A profile of stacks, root first, each sampled `n` times at 1 ms. */
function profileOf(stacks: Array<[string[], number]>): { profile: CpuProfile; resolved: Map<string, ResolvedFrame> } {
  const nodes: CpuProfile['nodes'] = [
    { id: 1, callFrame: { functionName: '(root)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 }, children: [] },
  ];
  const resolved = new Map<string, ResolvedFrame>();
  const samples: number[] = [];
  const special = (name: string) => {
    const node = { id: nodes.length + 1, callFrame: { functionName: name, scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 }, children: [] };
    nodes.push(node);
    nodes[0].children!.push(node.id);
    return node.id;
  };
  const idle = special('(idle)');
  const gc = special('(garbage collector)');
  for (const [stack, n] of stacks) {
    let parent = nodes[0];
    for (const id of stack) {
      const [frame, res] = F[id];
      resolved.set(frameKey(frame), res);
      let child = parent.children!.map((c) => nodes[c - 1]).find((c) => c.callFrame === frame);
      if (!child) {
        child = { id: nodes.length + 1, callFrame: frame, children: [] };
        nodes.push(child);
        parent.children!.push(child.id);
      }
      parent = child;
    }
    for (let i = 0; i < n; i++) samples.push(stack.length ? parent.id : idle);
  }
  samples.push(gc, gc, idle);
  return {
    profile: { nodes, startTime: 0, endTime: (samples.length + 1) * 1000, samples, timeDeltas: samples.map(() => 1000) },
    resolved,
  };
}

describe('aggregate', () => {
  const { profile, resolved } = profileOf([
    [['loop', 'rwh', 'Rows', 'useStore', 'select', 'sort'], 6],
    [['loop', 'rwh', 'Rows', 'css'], 3],
    [['loop', 'rwh', 'Rows'], 1],
    [['onmsg', 'decode'], 4],
    [['timer', 'tick'], 2],
    [['loop', 'rwh', 'hook'], 5],
    [['driver'], 2],
    [[], 7],
  ]);
  const cpu = aggregate(profile, resolved, { source: 'cdp', intervalMs: 1 });

  it('counts busy time without idle, GC apart, the recorder and the driver apart', () => {
    expect(cpu.busyMs).toBe(6 + 3 + 1 + 4 + 2 + 5 + 2 + 2);
    expect(cpu.gcMs).toBe(2);
    expect(cpu.recorderMs).toBe(5);
    expect(cpu.externalMs).toBe(2);
    expect(cpu.functions.some((f) => f.package === 'react-perf-recorder' || f.package === '(evaluated)')).toBe(false);
  });

  it("gives a builtin's time to the function that called it", () => {
    expect(cpu.functions[0]).toMatchObject({ name: 'selectRows', site: 'src/select.ts:2', selfMs: 6 });
    expect(cpu.functions.some((f) => f.name === 'sort')).toBe(false);
  });

  it('sums packages by their own time and by time on the stack, once per sample', () => {
    const byName = Object.fromEntries(cpu.packages.map((p) => [p.name, p]));
    expect(byName['(app)']).toMatchObject({ selfMs: 6 + 1 + 2, totalMs: 6 + 3 + 1 + 2 });
    expect(byName['react-dom'].totalMs).toBe(10);
    expect(byName['socket.io-parser'].selfMs).toBe(4);
  });

  it('puts a render on its component, with the app function inside it or the package API it called', () => {
    expect(cpu.renders).toHaveLength(1);
    expect(cpu.renders[0]).toMatchObject({ name: 'Rows', site: 'src/Rows.tsx:5', ms: 10 });
    expect(cpu.renders[0].hot).toEqual([
      { name: 'selectRows', site: 'src/select.ts:2', ms: 6 },
      { name: 'serializeStyles', package: '@emotion/serialize', ms: 3 },
      { name: '(its own code)', site: 'src/Rows.tsx:5', ms: 1 },
    ]);
  });

  it('names work outside renders by the app function that started it, past the recorder wrapping it', () => {
    expect(cpu.entries).toEqual([
      { name: '', package: 'engine.io-client', ms: 4 },
      { name: 'tick', site: 'src/clock.ts:4', ms: 2 },
    ]);
  });

  it('finds the component under React 19 dev frames too', () => {
    const r19 = profileOf([[['loop', 'rwh', 'bottom', 'Rows', 'select'], 3]]);
    expect(aggregate(r19.profile, r19.resolved, { source: 'cdp', intervalMs: 1 }).renders[0]).toMatchObject({ name: 'Rows', ms: 3 });
  });

  it('says in one line how busy the page was and who took it', () => {
    expect(cpuLine(cpu)).toMatch(/^25ms busy of \d+ms \(\d+%\): \(app\) \d+%/);
    expect(cpuLine(cpu)).toContain('recorder itself 20%');
  });
});

describe('profileFromTrace', () => {
  it('turns a self-profiling trace into a profile: frames 0-based, empty samples idle, times in µs', () => {
    const profile = profileFromTrace({
      resources: ['http://localhost:5173/src/a.ts'],
      frames: [{ name: 'outer', resourceId: 0, line: 3, column: 5 }, { name: 'inner', resourceId: 0, line: 9, column: 2 }, { name: 'sort' }],
      stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }, { frameId: 2, parentId: 1 }],
      samples: [{ timestamp: 100 }, { timestamp: 110, stackId: 2 }, { timestamp: 120, stackId: 1 }],
    });
    expect(profile.startTime).toBe(100_000);
    expect(profile.timeDeltas).toEqual([0, 10_000, 10_000]);
    const node = (id: number) => profile.nodes.find((n) => n.id === id)!;
    expect(node(profile.samples[0]).callFrame.functionName).toBe('(idle)');
    const leaf = node(profile.samples[1]);
    expect(leaf.callFrame).toMatchObject({ functionName: 'sort', url: '' });
    const inner = node(profile.samples[2]);
    expect(inner.callFrame).toMatchObject({ functionName: 'inner', lineNumber: 8, columnNumber: 1 });
    expect(inner.children).toContain(profile.samples[1]);
  });
});

describe('resolveFrames', () => {
  it("names a pre-bundled chunk's frame by the package its source map points at", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-cpu-'));
    const deps = path.join(root, 'node_modules/.vite/deps');
    fs.mkdirSync(deps, { recursive: true });
    fs.writeFileSync(path.join(deps, 'chunk-XYZ.js'), 'function a(){}\nfunction b(){}\n//# sourceMappingURL=chunk-XYZ.js.map\n');
    // Line 1 comes from react-dom, line 2 from @emotion/hash.
    fs.writeFileSync(
      path.join(deps, 'chunk-XYZ.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['../../react-dom/cjs/react-dom.development.js', '../../@emotion/hash/dist/hash.js'],
        names: [],
        mappings: 'AAAA;ACAA',
      })
    );
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/Row.tsx'),
      'import { memo } from "react";\nexport const Row = memo(({ id }) => id);\nconst api = { use: () => 1 };\n'
    );
    const url = (p: string) => `http://localhost:5173${p}`;
    const frames: CallFrame[] = [
      { functionName: 'a', scriptId: '5', url: url('/node_modules/.vite/deps/chunk-XYZ.js?v=1'), lineNumber: 0, columnNumber: 0 },
      { functionName: 'b', scriptId: '5', url: url('/node_modules/.vite/deps/chunk-XYZ.js?v=1'), lineNumber: 1, columnNumber: 0 },
      { functionName: '', scriptId: '6', url: url('/src/Row.tsx'), lineNumber: 1, columnNumber: 24 },
      { functionName: 'JSON.parse', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 },
      { functionName: '', scriptId: '6', url: url('/src/Row.tsx'), lineNumber: 2, columnNumber: 19 },
      { functionName: 'x', scriptId: '7', url: 'https://cdn.example.com/lib.js', lineNumber: 0, columnNumber: 0 },
    ];
    const resolved = await resolveFrames(frames, { root, getModuleByUrl: async () => undefined });
    const get = (i: number) => resolved.get(frameKey(frames[i]));
    expect(get(0)).toEqual({ name: 'a', package: 'react-dom' });
    expect(get(1)).toEqual({ name: 'b', package: '@emotion/hash' });
    // V8 calls a memo over an arrow anonymous; the line it starts on names it.
    expect(get(2)).toEqual({ name: 'Row', site: 'src/Row.tsx:2', package: null });
    expect(get(3)).toMatchObject({ native: true });
    expect(get(4)).toEqual({ name: 'use', site: 'src/Row.tsx:3', package: null });
    expect(get(5)).toEqual({ name: 'x', package: 'cdn.example.com' });
  });
});
