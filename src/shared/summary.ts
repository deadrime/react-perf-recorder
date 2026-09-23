import type { ActionRecord, HookInfo, PluginSection, ReasonInfo, RecordingV2, RootStat } from './schema';

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
 * The sentence behind a reason — `state #2 SAME-CONTENT`, `parent: props price | same: style` — built in one place
 * so the panel, the MCP server and an agent all read the same words.
 */
export function reasonText(reason: Omit<ReasonInfo, 'i' | 'text'>): string {
  const mark = reason.sameContent ? ' SAME-CONTENT' : '';
  const props = [names(reason.changed), reason.sameRef?.length ? `same: ${names(reason.sameRef)}` : ''].filter(Boolean).join(' | ');
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
    reasons: root.reasons.slice(0, 3).map(([id, n]) => reasonLine(root, reasons.get(id), n, mode)),
    causes: root.causes.slice(0, 3).map(([k, n]) => `${n}× ${k}`),
    ...(root.lanes.length ? { lanes: root.lanes.map(([l, n]) => `${l}:${n}`).join(' ') } : {}),
  };
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
      Object.entries(rec.plugins).map(([name, section]: [string, PluginSection]) => [
        name,
        { version: section.version, highlights: (section.highlights ?? []).slice(0, 3) },
      ])
    ),
    frames: {
      longTasks: rec.frames.longTasks.count,
      maxLongTaskMs: rec.frames.longTasks.maxMs,
      longFrames: rec.frames.loaf.length,
      worstFrameMs: rec.frames.loaf.reduce((m, f) => Math.max(m, f.duration), 0),
    },
    overhead: rec.overhead,
    warnings: [...rec.warnings, ...rec.errors.map((e) => `error: ${e}`)].slice(0, 10),
  };
}
