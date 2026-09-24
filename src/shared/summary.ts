import type { ActionRecord, ChainLink, CommitRecord, HookInfo, MemoHookStat, PluginSection, ReasonInfo, RecordingV2, RootStat } from './schema';

export interface RootLine {
  root: string;
  source: string;
  path: string;
  hits: number;
  hitsPerSec: number;
  instances: number;
  perHit: number;
  noDomChange: number;
  /** Components mounted under the root: remounts on every hit point at a component declared in render or a new key. */
  mounts?: number;
  renderMsPerHit?: number;
  reasons: string[];
  causes: string[];
  lanes?: string;
}

export interface ActionLine {
  id: number;
  what: string;
  atSec: number;
  commits: number;
  renders: number;
  reaction: number;
  perChar?: string;
  latencyMs?: number;
  longFrames?: number;
  topRoot?: string;
}

export interface Summary {
  id?: string;
  status?: string;
  partial?: boolean;
  createdAt: string;
  label?: string;
  source: string;
  url: string;
  viewport: string;
  durationSec: number;
  scope: { name: string; source: string; state: string; remounts: number } | null;
  totals: {
    commits: number;
    commitsPerSec: number;
    commitsInScope: number;
    renders: number;
    rendersPerScopeCommit: number;
    rendersFromOutside: number;
    rendersWithoutDom: number;
    domTextChanges: number;
    rendersPerTextChange: number | null;
  };
  topRoots: RootLine[];
  outsideRoots: RootLine[];
  topCauses: Array<{ key: string; events: number; commits: number; keys?: string }>;
  actions: ActionLine[];
  plugins: Record<string, { version: number; highlights: string[] }>;
  /** useMemo and useCallback that recompute on most renders, worst first. */
  memos?: string[];
  frames: { longTasks: number; maxLongTaskMs: number; longFrames: number; worstFrameMs: number };
  overhead: RecordingV2['overhead'];
  warnings: string[];
}

const perSec = (n: number, ms: number) => (ms > 0 ? +((n * 1000) / ms).toFixed(2) : 0);

/** `full` keeps the whole chain; `short` stops at the package API the app called: `useSelector › zustand.useStore`. */
export type HookMode = 'full' | 'short';

/**
 * The hooks a render came through: `useSelector › [zustand] useStore › useSyncExternalStoreWithSelector`.
 * `[zustand]` marks where the app's hooks end and the package begins; `short` stops at the package API.
 */
export function hookChain(hook: HookInfo | undefined, mode: HookMode = 'full'): string {
  if (!hook) return '';
  const steps = hook.path ?? [];
  const at = hook.library && hook.libraryAt !== undefined && hook.libraryAt < steps.length ? hook.libraryAt : -1;
  if (!steps.length) return hook.type ?? '';
  if (at < 0) return steps.join(' › ');
  if (mode === 'short') return [...steps.slice(0, at), `${hook.library}.${steps[at]}`].join(' › ');
  return [...steps.slice(0, at), `[${hook.library}] ${steps[at]}`, ...steps.slice(at + 1)].join(' › ');
}

export function hookText(hook: HookInfo | undefined, mode: HookMode = 'full'): string {
  if (!hook) return '';
  const site = hook.site ? ` @ ${hook.site}${hook.code ? ` ${hook.code}` : ''}` : '';
  return `${hookChain(hook, mode)}${site}`;
}

/**
 * What a state hook is called in the code: the variable of `const [now, setNow] = useState()`, or the custom hook
 * that keeps it — the package API for a package's (`useForm`), the innermost of the app's otherwise (`useSecond`).
 */
export function stateName(hook: HookInfo | undefined): string | undefined {
  if (!hook) return undefined;
  const custom = (hook.path ?? []).slice(0, -1);
  if (hook.library && hook.libraryAt !== undefined) return hook.path?.[hook.libraryAt];
  if (custom.length) return custom[custom.length - 1];
  return /\[\s*([A-Za-z_$][\w$]*)\s*,[^\]]*\]\s*=\s*(?:React\.)?use(?:State|Reducer)\b/.exec(hook.code ?? '')?.[1];
}

/** Key of a context's hooks entry in `RootStat.hooks`: `ctx:Location`. */
export const contextKey = (name: string) => `ctx:${name}`;

/** The hooks entry behind a reason: the hook's own index for state and stores, `ctx:<name>` for contexts. */
export function hookOf(root: RootStat, reason: ReasonInfo | undefined) {
  if (!reason) return undefined;
  if (reason.kind === 'context') return reason.context ? root.hooks?.[contextKey(reason.context)] : undefined;
  return reason.hook !== undefined ? root.hooks?.[reason.hook] : undefined;
}

const names = (list: string[] | undefined, max = 5) => (list ?? []).slice(0, max).join(', ');

/**
 * The sentence behind a reason — `state #2 SAME-CONTENT`, `parent: props price | new ref, same content: style` — built in one place
 * so the panel, the MCP server and an agent all read the same words.
 */
export function reasonText(reason: Omit<ReasonInfo, 'i' | 'text'>): string {
  const mark = reason.sameContent ? ' SAME-CONTENT' : '';
  const props = [names(reason.changed), reason.sameRef?.length ? `new ref, same content: ${names(reason.sameRef)}` : ''].filter(Boolean).join(' | ');
  switch (reason.kind) {
    case 'state':
      return reason.hook === undefined ? `class state${mark}` : `state #${reason.hook}${mark}`;
    case 'store':
      return `external store #${reason.hook}${mark}${reason.store ? ` [${reason.store}]` : ''}${reason.selector ? ` ${reason.selector}` : ''}`;
    case 'context':
      return `context ${reason.context || '(unnamed)'}${mark}`;
    case 'props':
      return `props: ${props || '(new object)'}`;
    case 'parent':
      if (reason.equal) return 'parent: props equal';
      if (!props) return 'parent: children';
      return `parent: props ${props}${reason.children ? ' +children' : ''}`;
    case 'bailout':
      return 'bailout: state set to the same value';
    default:
      return 'unknown';
  }
}

/** The sentence of a reason: what the recording stored, or what its fields say. */
export const textOf = (reason: Pick<ReasonInfo, 'kind'> & Partial<ReasonInfo>) => reason.text ?? reasonText(reason);

/** One step of a way down, ready to print; the first carries its root's leading cause. */
export interface WayStep {
  name: string;
  /** The root's own reason: `state now`, `store chat selectRow`; `kind` and `what` split it for the panel. */
  why?: string;
  kind?: string;
  what?: string;
  /** Props the parent changed, and props that were only new references to the same content. */
  props?: string[];
  newRefSameContent?: string[];
  children?: true;
  /** Props equal: the render a memo would have saved. */
  equal?: true;
  skipped?: number;
}

/** A root's reason as the chip and the words after it, with the state named as the code names it. */
function rootWhy(reason: ReasonInfo, root: RootStat | undefined): { kind?: string; what: string } {
  const mark = reason.sameContent ? ' SAME-CONTENT' : '';
  switch (reason.kind) {
    case 'state': {
      const name = root ? stateName(hookOf(root, reason)) : undefined;
      return { kind: 'state', what: `${name ?? (reason.hook === undefined ? 'of a class' : `#${reason.hook}`)}${mark}` };
    }
    case 'store':
      return { kind: 'store', what: `${[reason.store, reason.selector].filter(Boolean).join(' ') || `#${reason.hook}`}${mark}` };
    case 'context':
      return { kind: 'context', what: `${reason.context || '(unnamed)'}${mark}` };
    default:
      return { what: textOf(reason) };
  }
}

function stepOf(name: string, reason: ReasonInfo | undefined, root?: RootStat): WayStep {
  if (!reason) return { name };
  if (reason.kind !== 'parent') {
    const { kind, what } = rootWhy(reason, root);
    return { name, why: kind ? `${kind} ${what}` : what, ...(kind ? { kind } : {}), what };
  }
  if (reason.equal) return { name, equal: true };
  return {
    name,
    ...(reason.changed?.length ? { props: reason.changed.slice(0, 5) } : {}),
    ...(reason.sameRef?.length ? { newRefSameContent: reason.sameRef.slice(0, 5) } : {}),
    ...(reason.children || (!reason.changed?.length && !reason.sameRef?.length) ? { children: true as const } : {}),
  };
}

/** What a step says after the name, split for the panel: `prop` and `renders`, or only the words for a root. */
export function stepParts(step: WayStep): Array<{ label?: string; text: string; tone?: 'warn' }> {
  if (step.skipped) return [{ text: `${step.skipped} more` }];
  if (step.why) return [{ label: step.kind, text: step.what ?? step.why }];
  if (step.equal) return [{ label: 'props', text: 'equal', tone: 'warn' }];
  const parts: Array<{ label?: string; text: string; tone?: 'warn' }> = [];
  if (step.props?.length) parts.push({ label: step.props.length > 1 ? 'props' : 'prop', text: step.props.join(', ') });
  // A new reference with the same content: the prop a useMemo or a constant would have kept.
  if (step.newRefSameContent?.length) parts.push({ label: 'new ref, same content', text: step.newRefSameContent.join(', '), tone: 'warn' });
  if (step.children && !parts.length) parts.push({ text: 'children' });
  return parts;
}

const stepText = (step: WayStep) =>
  stepParts(step)
    .map((p) => (p.label ? `${p.label} ${p.text}` : p.text))
    .join(' · ');

export function wayOf(rec: Pick<RecordingV2, 'roots' | 'outsideRoots' | 'reasons'>, links: ChainLink[]): { cause?: string; steps: WayStep[] } {
  const reasons = reasonsById(rec.reasons);
  const root = links[0]?.root !== undefined ? [...rec.roots, ...rec.outsideRoots][links[0].root] : undefined;
  const cause = root?.causes.find(([key]) => key !== 'core:none')?.[0];
  const steps = links.map(
    (link, i): WayStep =>
      link.skipped
        ? { name: '…', skipped: link.skipped }
        : stepOf(link.name, link.reason !== undefined ? reasons.get(link.reason) : undefined, i === 0 ? root : undefined)
  );
  return { ...(cause ? { cause } : {}), steps };
}

export interface Way {
  n: number;
  cause?: string;
  steps: WayStep[];
}

const union = (a?: string[], b?: string[]) => {
  const all = [...new Set([...(a ?? []), ...(b ?? [])])];
  return all.length ? all : undefined;
};

/** Two steps of the same component on the same way: the props of both; equal only if equal on both. */
function mergeStep(a: WayStep, b: WayStep): WayStep {
  if (a.skipped || a.why !== undefined) return a;
  if (a.equal && b.equal) return a;
  const props = union(a.props, b.props);
  const newRefSameContent = union(a.newRefSameContent, b.newRefSameContent);
  return {
    name: a.name,
    ...(props ? { props } : {}),
    ...(newRefSameContent ? { newRefSameContent } : {}),
    ...(a.children || b.children ? { children: true as const } : {}),
  };
}

/**
 * A component's ways, those through the same components as one: which props each parent changed differs from render
 * to render, and that is not a different way down.
 */
export function waysOf(rec: Pick<RecordingV2, 'roots' | 'outsideRoots' | 'reasons'>, chains: Array<{ n: number; links: ChainLink[] }> = []): Way[] {
  const byRoute = new Map<string, Way>();
  for (const chain of chains) {
    const way = { n: chain.n, ...wayOf(rec, chain.links) };
    const route = `${way.cause ?? ''}|${way.steps.map((s) => `${s.name}${s.why ? `:${s.why}` : ''}`).join('>')}`;
    const known = byRoute.get(route);
    if (!known) byRoute.set(route, way);
    else {
      known.n += way.n;
      known.steps = known.steps.map((step, i) => mergeStep(step, way.steps[i]));
    }
  }
  return [...byRoute.values()].sort((a, b) => b.n - a.n);
}

/** A link of a commit's cascade tree: who rendered, how many times, why, and whom it rendered in turn. */
export interface CascadeNode {
  step: WayStep;
  n: number;
  children: CascadeNode[];
}

/** A commit's cascade as trees from its roots, busiest first; empty for a fast recording or an old one. */
export function cascadeOf(
  rec: Pick<RecordingV2, 'roots' | 'outsideRoots' | 'reasons' | 'chainNodes'>,
  commit: Pick<CommitRecord, 'ways'>
): CascadeNode[] {
  const nodes = rec.chainNodes ?? [];
  if (!commit.ways?.length || !nodes.length) return [];
  const reasons = reasonsById(rec.reasons);
  const roots = [...rec.roots, ...rec.outsideRoots];
  const byId = new Map<number, CascadeNode>();
  for (const [id, n] of commit.ways) {
    const node = nodes[id];
    if (!node) continue;
    const reason = node.reason !== undefined ? reasons.get(node.reason) : undefined;
    byId.set(id, { step: stepOf(node.name, reason, node.root !== undefined ? roots[node.root] : undefined), n, children: [] });
  }
  const top: CascadeNode[] = [];
  for (const [id, entry] of byId) {
    const parent = byId.get(nodes[id].up);
    (parent ? parent.children : top).push(entry);
  }
  const sort = (list: CascadeNode[]) => {
    list.sort((a, b) => b.n - a.n);
    for (const entry of list) sort(entry.children);
    return list;
  };
  return sort(top);
}

/** The tree as indented lines, for an answer in text: `  Line · prop online ×3`. */
export function cascadeLines(tree: CascadeNode[], max = 15): string[] {
  const lines: string[] = [];
  const walk = (list: CascadeNode[], depth: number) => {
    for (const entry of list) {
      if (lines.length >= max) return;
      const why = stepText(entry.step);
      lines.push(`${'  '.repeat(depth)}${entry.step.name}${why ? ` · ${why}` : ''}${entry.n > 1 ? ` ×${entry.n}` : ''}`);
      walk(entry.children, depth + 1);
    }
  };
  walk(tree, 0);
  return lines;
}

/** `react-query:fetch ["presence"] › Stats · state #0 › Line · online › Badge · count` */
export function wayText(way: Way): string {
  return [way.cause, ...way.steps.map((s) => (s.skipped ? `… ${s.skipped} more` : stepText(s) ? `${s.name} · ${stepText(s)}` : s.name))]
    .filter(Boolean)
    .join(' › ');
}

/** Reasons of a recording by id, for everything that prints them. */
export const reasonsById = (reasons: ReasonInfo[] = []) => new Map(reasons.map((r) => [r.i, r]));

/** What a root or a component gave as reasons, as sentences: `[['state #0', 12], …]`. */
export const reasonTexts = (recording: { reasons?: ReasonInfo[] }, stat: { reasons: Array<[number, number]> }): Array<[string, number]> => {
  const byId = reasonsById(recording.reasons);
  return stat.reasons.map(([id, n]) => {
    const reason = byId.get(id);
    return [reason ? textOf(reason) : 'unknown', n];
  });
};

/** `12× state #2 SAME-CONTENT · useController › useFormState › State @ src/Field.tsx:48 const { fieldState } = …` */
export function reasonLine(root: RootStat, reason: ReasonInfo | undefined, n: number, mode: HookMode = 'full'): string {
  if (!reason) return `${n}× unknown`;
  const hook = hookText(hookOf(root, reason), mode);
  return `${n}× ${textOf(reason)}${hook ? ` · ${hook}` : ''}`;
}

/** A reason and its same-content twin as one line: `289× external store #15 (287 of them same content) · …`. */
export function mergeSameContent(lines: Array<[string, number]>): Array<[string, number]> {
  const groups = new Map<string, { n: number; same: number; sameText: string }>();
  for (const [text, n] of lines) {
    const key = text.replace(' SAME-CONTENT', '');
    const group = groups.get(key) ?? { n: 0, same: 0, sameText: '' };
    group.n += n;
    if (key !== text) [group.same, group.sameText] = [group.same + n, text];
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, g]): [string, number] => [
      !g.same ? key : g.same === g.n ? g.sameText : g.sameText.replace(' SAME-CONTENT', ` (${g.same} of them same content)`),
      g.n,
    ])
    .sort((a, b) => b[1] - a[1]);
}

export function rootLine(root: RootStat, durationMs: number, reasons: Map<number, ReasonInfo>, mode: HookMode = 'full'): RootLine {
  return {
    root: root.name,
    source: root.source,
    path: root.path,
    hits: root.hits,
    hitsPerSec: perSec(root.hits, durationMs),
    instances: root.instances,
    perHit: root.perHit,
    noDomChange: root.noDomChange,
    ...(root.mounts ? { mounts: root.mounts } : {}),
    ...(root.renderMs ? { renderMsPerHit: +(root.renderMs / Math.max(1, root.hits)).toFixed(2) } : {}),
    reasons: mergeSameContent(root.reasons.map(([id, n]) => [reasonLine(root, reasons.get(id), n, mode).replace(/^\d+× /, ''), n]))
      .slice(0, 3)
      .map(([text, n]) => `${n}× ${text}`),
    causes: root.causes.slice(0, 3).map(([k, n]) => `${n}× ${k}`),
    ...(root.lanes.length ? { lanes: root.lanes.map(([l, n]) => `${l}:${n}`).join(' ') } : {}),
  };
}

/** Why a memo hook remembers nothing, in words: which dependency moves, and whether only its reference does. */
export function memoWhy(m: MemoHookStat): string {
  if (m.noDeps) return 'no dependency array: it runs on every render';
  const dep = m.deps[0];
  if (!dep) return 'its dependencies changed';
  const name = m.info?.deps?.[dep.index];
  const which = name ? `\`${name}\`` : `dependency ${dep.index + 1}`;
  return dep.sameContent === dep.changed
    ? `${which} is a new object with the same content every time`
    : dep.sameContent
    ? `${which} changed ${dep.changed}×, ${dep.sameContent} of them to the same content`
    : `${which} changed ${dep.changed}×`;
}

/** `Report · useMemo #2 · recomputed 12 of 12 renders — dependency 1 is a new object… · src/Report.tsx:14` */
export function memoLine(m: MemoHookStat): string {
  const site = m.info?.site ? ` · ${m.info.site}${m.info.code ? ` ${m.info.code}` : ''}` : m.source ? ` · ${m.source}` : '';
  return `${m.component} · ${m.kind} #${m.hook} · recomputed ${m.recomputed} of ${m.renders} renders — ${memoWhy(m)}${site}`;
}

export function actionText(action: ActionRecord): string {
  const t = action.target;
  const field = t ? t.testId ?? t.name ?? t.label ?? t.text ?? t.tag : '';
  const where = t?.component ? ` in ${t.component}` : '';
  switch (action.kind) {
    case 'typing':
      return `typing ${action.chars ?? 0} chars into «${field}»${where}${
        action.secret ? ' (secret)' : action.value !== undefined ? ` = ${JSON.stringify(action.value)}` : ''
      }`;
    case 'key':
      return `${action.key} on «${field}»${where}`;
    case 'scroll':
      return `scroll «${field}» ${action.scroll?.pixels ?? 0}px`;
    case 'drag':
      return `drag «${field}»${where} ${action.drag?.pixels ?? 0}px`;
    case 'navigation':
      return `back/forward to ${action.url}`;
    default:
      return `${action.kind} «${field}»${where}${action.value !== undefined ? ` = ${JSON.stringify(action.value)}` : ''}`;
  }
}

export function summarize(rec: RecordingV2 & { id?: string; status?: string }, top = 5, hooks: HookMode = 'full'): Summary {
  const ms = rec.durationMs;
  const reasons = reasonsById(rec.reasons);
  const allRoots = [...rec.roots, ...rec.outsideRoots];
  const actionsById = new Map(rec.actions.map((a) => [a.id, a]));
  const actions = rec.segments
    .slice()
    .sort((a, b) => b.renders - a.renders)
    .slice(0, 10)
    .sort((a, b) => a.atMs - b.atMs)
    .map((s): ActionLine => {
      const action = actionsById.get(s.action);
      const root = s.topRoots[0] ? allRoots[s.topRoots[0][0]] : undefined;
      return {
        id: s.action,
        what: action ? actionText(action) : `action ${s.action}`,
        atSec: +(s.atMs / 1000).toFixed(1),
        commits: s.commits,
        renders: s.renders,
        reaction: s.reaction.renders,
        ...(s.perChar ? { perChar: `${s.perChar.renders} renders, ${s.perChar.commits} commits per char (max ${s.perChar.maxRenders})` } : {}),
        ...(s.latency ? { latencyMs: s.latency.duration } : {}),
        ...(s.longFrames ? { longFrames: s.longFrames } : {}),
        ...(root
          ? {
              topRoot: `${root.name} ×${s.topRoots[0][1]} — ${
                root.reasons[0] ? reasonLine(root, reasons.get(root.reasons[0][0]), root.reasons[0][1], hooks) : ''
              }`,
            }
          : {}),
      };
    });
  const texts = rec.totals.domTextChanges;
  return {
    ...(rec.id ? { id: rec.id } : {}),
    ...(rec.status ? { status: rec.status } : {}),
    ...(rec.partial ? { partial: true } : {}),
    createdAt: rec.createdAt,
    ...(rec.label ? { label: rec.label } : {}),
    source: rec.tool.source,
    url: rec.page.url,
    viewport: rec.page.viewport,
    durationSec: +(ms / 1000).toFixed(1),
    scope: rec.scope ? { name: rec.scope.name, source: rec.scope.source, state: rec.scope.state, remounts: rec.scope.remounts } : null,
    totals: {
      commits: rec.totals.commits,
      commitsPerSec: perSec(rec.totals.commits, ms),
      commitsInScope: rec.totals.commitsInScope,
      renders: rec.totals.renders,
      rendersPerScopeCommit: rec.totals.rendersPerScopeCommit,
      rendersFromOutside: rec.totals.rendersFromOutside,
      rendersWithoutDom: rec.totals.rendersWithoutDom,
      domTextChanges: texts,
      rendersPerTextChange: texts ? +(rec.totals.renders / texts).toFixed(1) : null,
    },
    topRoots: rec.roots.slice(0, top).map((r) => rootLine(r, ms, reasons, hooks)),
    outsideRoots: rec.outsideRoots.slice(0, 3).map((r) => rootLine(r, ms, reasons, hooks)),
    topCauses: rec.causes.slice(0, 5).map((c) => ({
      key: c.key,
      events: c.events,
      commits: c.commits,
      ...(c.keys
        ? {
            keys: Object.entries(c.keys)
              .sort((a, b) => b[1].changed + b[1].sameContent - (a[1].changed + a[1].sameContent))
              .slice(0, 6)
              .map(([k, v]) => `${k}${v.sameContent ? ` (same content ${v.sameContent}/${v.changed + v.sameContent + v.unknown})` : ''}`)
              .join(', '),
          }
        : {}),
    })),
    actions,
    plugins: Object.fromEntries(
      Object.entries(rec.plugins)
        // A plugin whose library is not on the page is left out; one that is says so even when nothing happened.
        .filter(([, section]: [string, PluginSection]) => section.active ?? Boolean(section.highlights?.length))
        .map(([name, section]: [string, PluginSection]) => [name, { version: section.version, highlights: section.highlights!.slice(0, 3) }])
    ),
    frames: {
      longTasks: rec.frames.longTasks.count,
      maxLongTaskMs: rec.frames.longTasks.maxMs,
      longFrames: rec.frames.loaf.length,
      worstFrameMs: rec.frames.loaf.reduce((m, f) => Math.max(m, f.duration), 0),
    },
    overhead: rec.overhead,
    ...(rec.memos?.length ? { memos: rec.memos.slice(0, 5).map(memoLine) } : {}),
    warnings: [...rec.warnings, ...rec.errors.map((e) => `error: ${e}`)].slice(0, 10),
  };
}
