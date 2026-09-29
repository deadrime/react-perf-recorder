import type { CallFrame, CpuProfile, SelfProfileTrace } from '../../shared/cpu';

export type { CallFrame, CpuInput, CpuProfile, SelfProfileTrace } from '../../shared/cpu';

const ROOT = 1;
const IDLE = 2;
const OFFSET = 3;

const frame = (functionName: string, url = '', lineNumber = -1, columnNumber = -1): CallFrame => ({
  functionName,
  scriptId: '0',
  url,
  lineNumber,
  columnNumber,
});

/**
 * A self-profiling trace as a CDP profile, so one reader serves both and the raw file opens in DevTools. A sample
 * with no stack is the page doing no JS: idle, as far as the trace can tell.
 */
export function profileFromTrace(trace: SelfProfileTrace): CpuProfile {
  const nodes: CpuProfile['nodes'] = [
    { id: ROOT, callFrame: frame('(root)'), children: [IDLE] },
    { id: IDLE, callFrame: frame('(idle)'), children: [] },
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  trace.stacks.forEach((stack, i) => {
    const f = trace.frames[stack.frameId] ?? {};
    const url = f.resourceId !== undefined ? trace.resources[f.resourceId] ?? '' : '';
    const node = { id: i + OFFSET, callFrame: frame(f.name ?? '', url, (f.line ?? 0) - 1, (f.column ?? 0) - 1), children: [] as number[] };
    nodes.push(node);
    byId.set(node.id, node);
  });
  trace.stacks.forEach((stack, i) => {
    const parent = stack.parentId !== undefined ? byId.get(stack.parentId + OFFSET) : byId.get(ROOT);
    (parent ?? byId.get(ROOT)!).children!.push(i + OFFSET);
  });
  const samples = trace.samples.filter((s) => Number.isFinite(s.timestamp));
  const first = samples[0]?.timestamp ?? 0;
  let previous = first;
  return {
    nodes,
    startTime: Math.round(first * 1000),
    endTime: Math.round((samples[samples.length - 1]?.timestamp ?? first) * 1000),
    samples: samples.map((s) => (s.stackId !== undefined && byId.has(s.stackId + OFFSET) ? s.stackId + OFFSET : IDLE)),
    timeDeltas: samples.map((s) => {
      const delta = Math.round((s.timestamp - previous) * 1000);
      previous = s.timestamp;
      return delta;
    }),
  };
}

/** A body from the page is checked before anything walks it: a bad one is a warning, never a failed save. */
export function isProfile(value: unknown): value is CpuProfile {
  const p = value as CpuProfile;
  return Boolean(p) && Array.isArray(p.nodes) && Array.isArray(p.samples) && Array.isArray(p.timeDeltas) && p.samples.length === p.timeDeltas.length;
}

export function isTrace(value: unknown): value is SelfProfileTrace {
  const t = value as SelfProfileTrace;
  return Boolean(t) && Array.isArray(t.frames) && Array.isArray(t.resources) && Array.isArray(t.stacks) && Array.isArray(t.samples);
}
