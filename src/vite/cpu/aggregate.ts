import { APP, type CpuEntry, type CpuFunction, type CpuRender, type CpuSummary } from '../../shared/cpu';
import type { CallFrame, CpuProfile } from './profile';

/** A frame as the dev server resolved it: `package` null is the app's own code. */
export interface ResolvedFrame {
  name: string;
  /** `src/file.ts:line` for the app's code. */
  site?: string;
  package: string | null;
  /** The recorder's own code: its wrappers, its commit hook, its panel. */
  own?: true;
  /** No script behind it: a builtin such as `JSON.parse`, counted with the function that called it. */
  native?: true;
  /** A script evaluated into the page from outside: the test driver's, DevTools'. */
  external?: true;
}

export const frameKey = (f: CallFrame) => `${f.url}:${f.lineNumber}:${f.columnNumber}:${f.functionName}`;

/** React's own frames that call a component: the frame under the innermost of them is the component's render. */
const RENDER_CALLERS = new Set(['renderWithHooks', 'renderWithHooksAgain', 'finishClassComponent']);
const REACT = new Set(['react', 'react-dom', 'scheduler']);
const LIMIT = { packages: 15, functions: 30, renders: 20, hot: 5, entries: 15 };

interface Place {
  name: string;
  site?: string;
  package?: string;
}

interface NodeInfo {
  kind: 'idle' | 'program' | 'gc' | 'js';
  own?: boolean;
  external?: boolean;
  selfPackage?: string;
  selfFn?: string;
  fns?: string[];
  packages?: string[];
  render?: { component: string; hot: string };
  entry?: string;
}

const round = (ms: number) => Math.round(ms * 10) / 10;

/** Sums a profile up by package, function, component render and entry point. */
export function aggregate(
  profile: CpuProfile,
  resolved: Map<string, ResolvedFrame>,
  options: { source: CpuSummary['source']; intervalMs: number }
): CpuSummary {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const places = new Map<string, Place>();
  const placeKey = (p: Place) => `${p.name}|${p.site ?? ''}|${p.package ?? ''}`;
  const remember = (p: Place) => {
    const key = placeKey(p);
    if (!places.has(key)) places.set(key, p);
    return key;
  };
  const placeOf = (r: ResolvedFrame, name = r.name || '(anonymous)'): Place => ({
    name,
    ...(r.site ? { site: r.site } : {}),
    ...(r.package !== null ? { package: r.package } : {}),
  });

  const infos = new Map<number, NodeInfo>();
  const infoOf = (id: number): NodeInfo => {
    let info = infos.get(id);
    if (info) return info;
    info = describe(id);
    infos.set(id, info);
    return info;
  };

  const describe = (id: number): NodeInfo => {
    const leaf = nodes.get(id);
    const name = leaf?.callFrame.functionName;
    if (!leaf || name === '(idle)' || name === '(root)') return { kind: 'idle' };
    if (name === '(program)') return { kind: 'program' };
    if (name === '(garbage collector)') return { kind: 'gc' };
    // Root first, leaf last.
    const stack: ResolvedFrame[] = [];
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const n = nodes.get(at);
      if (!n || n.callFrame.functionName === '(root)') continue;
      stack.push(resolved.get(frameKey(n.callFrame)) ?? { name: n.callFrame.functionName, package: null, native: true });
    }
    stack.reverse();
    // A builtin's time is its caller's: `JSON.parse` is the parser that called it.
    let selfAt = stack.length - 1;
    while (selfAt > 0 && stack[selfAt].native) selfAt--;
    const self = stack[selfAt];
    if (self.own) return { kind: 'js', own: true };
    if (self.external) return { kind: 'js', external: true };
    const scripted = (f: ResolvedFrame) => !f.native && !f.own && !f.external;
    const fns = new Set<string>();
    const packages = new Set<string>();
    for (const f of stack) {
      if (!scripted(f)) continue;
      fns.add(remember(placeOf(f)));
      packages.add(f.package ?? APP);
    }
    const info: NodeInfo = {
      kind: 'js',
      selfPackage: self.native ? '(native)' : self.package ?? APP,
      // Only builtins on the stack: a promise job, a script evaluated from outside the page.
      selfFn: remember(self.native ? { name: self.name || 'native code', package: '(native)' } : placeOf(self)),
      fns: [...fns],
      packages: [...packages],
    };
    let caller = -1;
    stack.forEach((f, i) => {
      if (RENDER_CALLERS.has(f.name) && f.package !== null && REACT.has(f.package)) caller = i;
    });
    const componentAt = caller < 0 ? -1 : stack.findIndex((f, i) => i > caller && scripted(f) && !(f.package !== null && REACT.has(f.package)));
    if (componentAt >= 0) {
      const c = stack[componentAt];
      const component = remember(placeOf(c));
      const below = stack.slice(componentAt + 1).filter(scripted);
      const app = [...below].reverse().find((f) => f.package === null);
      const hot = app ?? below[0];
      info.render = { component, hot: hot ? remember(placeOf(hot)) : component };
    } else {
      const app = stack.find((f) => scripted(f) && f.package === null);
      const outer = stack.find(scripted);
      if (app) info.entry = remember(placeOf(app));
      else if (outer?.package) info.entry = remember({ name: '', package: outer.package });
    }
    return info;
  };

  const add = (map: Map<string, number>, key: string, ms: number) => map.set(key, (map.get(key) ?? 0) + ms);
  const packageSelf = new Map<string, number>();
  const packageTotal = new Map<string, number>();
  const fnSelf = new Map<string, number>();
  const fnTotal = new Map<string, number>();
  const renderMs = new Map<string, number>();
  const renderHot = new Map<string, Map<string, number>>();
  const entryMs = new Map<string, number>();
  let busy = 0;
  let gc = 0;
  let recorder = 0;
  let external = 0;

  let at = profile.startTime;
  const times = profile.timeDeltas.map((d) => (at += d));
  profile.samples.forEach((id, i) => {
    // A sample stands for the time until the next one.
    const ms = ((i + 1 < times.length ? times[i + 1] : profile.endTime) - times[i]) / 1000;
    if (!(ms > 0)) return;
    const info = infoOf(id);
    if (info.kind === 'idle' || info.kind === 'program') return;
    busy += ms;
    if (info.kind === 'gc') {
      gc += ms;
      return;
    }
    if (info.own) {
      recorder += ms;
      return;
    }
    if (info.external) {
      external += ms;
      return;
    }
    add(packageSelf, info.selfPackage!, ms);
    for (const p of info.packages!) add(packageTotal, p, ms);
    add(fnSelf, info.selfFn!, ms);
    for (const f of info.fns!) add(fnTotal, f, ms);
    if (info.render) {
      add(renderMs, info.render.component, ms);
      const hot = renderHot.get(info.render.component) ?? new Map<string, number>();
      renderHot.set(info.render.component, add(hot, info.render.hot, ms));
    } else if (info.entry) add(entryMs, info.entry, ms);
  });

  const top = (map: Map<string, number>, n: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .filter(([, ms]) => ms >= 0.05);
  const functions: CpuFunction[] = top(fnSelf, LIMIT.functions).map(([key, ms]) => ({
    ...places.get(key)!,
    selfMs: round(ms),
    totalMs: round(fnTotal.get(key) ?? ms),
  }));
  const renders: CpuRender[] = top(renderMs, LIMIT.renders).map(([key, ms]) => ({
    ...places.get(key)!,
    ms: round(ms),
    hot: top(renderHot.get(key)!, LIMIT.hot).map(([h, hms]) => ({
      ...(h === key ? { ...places.get(h)!, name: '(its own code)' } : places.get(h)!),
      ms: round(hms),
    })),
  }));
  const entries: CpuEntry[] = top(entryMs, LIMIT.entries).map(([key, ms]) => ({ ...places.get(key)!, ms: round(ms) }));
  const wallMs = (profile.endTime - profile.startTime) / 1000;
  const warnings: string[] = [];
  const counted = profile.samples.length;
  if (busy / options.intervalMs < 50)
    warnings.push(`only ${Math.round(busy / options.intervalMs)} busy samples: the shares are rough; record longer or with throttle`);
  return {
    version: 1,
    source: options.source,
    intervalMs: options.intervalMs,
    samples: counted,
    wallMs: round(wallMs),
    busyMs: round(busy),
    gcMs: round(gc),
    recorderMs: round(recorder),
    ...(external ? { externalMs: round(external) } : {}),
    // By their own time; a package only ever on the stack (react-dom calling the app) comes after, by its total.
    packages: [...packageTotal.keys()]
      .map((name) => ({ name, selfMs: round(packageSelf.get(name) ?? 0), totalMs: round(packageTotal.get(name)!) }))
      .sort((a, b) => b.selfMs - a.selfMs || b.totalMs - a.totalMs)
      .slice(0, LIMIT.packages),
    functions,
    renders,
    entries,
    ...(warnings.length ? { warnings } : {}),
  };
}
