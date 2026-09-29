import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { nameOfFile } from '../component-names';
import { frameKey, type ResolvedFrame } from './aggregate';
import type { CallFrame } from './profile';

type RawMap = ConstructorParameters<typeof TraceMap>[0];

/** The part of the dev server a resolver needs; a fake of it is enough in a test. */
export interface ModuleSource {
  root: string;
  publicDir?: string;
  getModuleByUrl(url: string): Promise<{ file?: string | null; transformResult?: { map?: unknown } | null } | undefined>;
}

const packageOf = (rest: string) => {
  const parts = rest.split('/').filter(Boolean);
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? '';
};

/** The folder of this package: its `src/` or `dist/` in a frame is the recorder's own code, wherever it is linked from. */
export const ownRoot = (() => {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const pkg = path.join(dir, 'package.json');
      if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).name === 'react-perf-recorder') return dir;
      dir = path.dirname(dir);
    }
  } catch {
    // Not found: the recorder's frames count as the package they are installed as.
  }
  return null;
})();

// Deps maps (react-dom's is megabytes) are parsed once per file version, across recordings.
const diskMaps = new Map<string, { mtime: number; map: TraceMap | null }>();
const graphMaps = new WeakMap<object, TraceMap>();

/** A pre-bundled dependency is not in the module graph with a map: the optimizer left one beside the file. */
function mapOnDisk(file: string): TraceMap | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = diskMaps.get(file);
  if (cached && cached.mtime === stat.mtimeMs) return cached.map;
  let map: TraceMap | null = null;
  try {
    const code = fs.readFileSync(file, 'utf8');
    const ref = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code.slice(-4096))?.[1];
    let raw: string | null = null;
    if (ref?.startsWith('data:')) raw = Buffer.from(ref.slice(ref.indexOf(',') + 1), 'base64').toString('utf8');
    else {
      const mapFile = path.resolve(path.dirname(file), ref ?? `${path.basename(file)}.map`);
      if (fs.existsSync(mapFile)) raw = fs.readFileSync(mapFile, 'utf8');
    }
    if (raw) map = new TraceMap(JSON.parse(raw) as RawMap, file);
  } catch {
    map = null;
  }
  diskMaps.set(file, { mtime: stat.mtimeMs, map });
  return map;
}

/**
 * Resolves every distinct frame of a profile once: the app's to `file:line`, a dependency's to its npm package by
 * the file its source map names (a shared `chunk-XYZ.js` says nothing), a file of `public/` to `(static) /dir`.
 */
export async function resolveFrames(frames: Iterable<CallFrame>, server: ModuleSource): Promise<Map<string, ResolvedFrame>> {
  const out = new Map<string, ResolvedFrame>();
  const origin = { value: '' as string };
  for (const frame of frames) {
    const key = frameKey(frame);
    if (out.has(key)) continue;
    out.set(key, await resolveFrame(frame, server, origin).catch(() => ({ name: frame.functionName, package: '(unknown)' })));
  }
  return out;
}

async function resolveFrame(frame: CallFrame, server: ModuleSource, origin: { value: string }): Promise<ResolvedFrame> {
  const name = frame.functionName;
  // A builtin has no script at all; a script with no url was evaluated into the page from outside.
  if (!frame.url)
    return frame.scriptId && frame.scriptId !== '0' ? { name, package: '(evaluated)', external: true } : { name, package: null, native: true };
  let url: URL;
  try {
    url = new URL(frame.url);
  } catch {
    return { name, package: '(other)' };
  }
  // The recorder as record_page puts it into a page without the plugin.
  if (url.protocol === 'react-perf-recorder:') return { name, package: 'react-perf-recorder', own: true };
  if (!/^https?:$/.test(url.protocol)) return { name, package: `(${url.protocol.replace(/:$/, '')})` };
  // The page's own origin is the one most frames come from; another one is a CDN or a third-party script.
  origin.value ||= url.origin;
  if (url.origin !== origin.value && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) return { name, package: url.host };
  const pathname = decodeURIComponent(url.pathname);
  if (/^\/@id\/.*react-perf-recorder/.test(pathname)) return { name, package: 'react-perf-recorder', own: true };
  const mod = await server.getModuleByUrl(pathname + url.search).catch(() => undefined);
  let file = mod?.file ?? null;
  let map: TraceMap | null = null;
  const graphMap = mod?.transformResult?.map as RawMap | null | undefined;
  if (graphMap && typeof graphMap === 'object') {
    map = graphMaps.get(graphMap as object) ?? null;
    if (!map) graphMaps.set(graphMap as object, (map = new TraceMap(graphMap)));
  }
  if (!file) {
    const candidate = pathname.startsWith('/@fs/') ? pathname.slice(4) : path.join(server.root, pathname);
    if (fs.existsSync(candidate)) file = candidate;
    else if (server.publicDir && fs.existsSync(path.join(server.publicDir, pathname)))
      return { name, package: `(static) /${pathname.split('/').filter(Boolean)[0] ?? ''}` };
  }
  if (!file) return { name, package: pathname.startsWith('/@') ? '(vite)' : `(static) /${pathname.split('/').filter(Boolean)[0] ?? ''}` };
  if (!map) map = mapOnDisk(file);
  let source = file;
  let line = frame.lineNumber + 1;
  let column = frame.columnNumber;
  if (map && frame.lineNumber >= 0) {
    const pos = originalPositionFor(map, { line: frame.lineNumber + 1, column: Math.max(0, frame.columnNumber) });
    if (pos.line != null) {
      line = pos.line;
      column = pos.column ?? column;
      // Graph maps name sources beside the module; disk maps are read with the chunk's path, so theirs are absolute.
      if (pos.source) source = pos.source.startsWith('file://') ? fileURLToPath(pos.source) : path.resolve(path.dirname(file), pos.source);
    }
  }
  const out = classify(name, source.replace(/\\/g, '/'), line, server.root);
  if (!name && out.package === null) out.name = declaredAt(source, line, column);
  return out;
}

/** V8 calls `const Row = memo(({ id }) => …)` anonymous; what the line assigns it to says what the app calls it. */
function declaredAt(file: string, line: number, column: number): string {
  try {
    const text = fs.readFileSync(file, 'utf8').split('\n')[line - 1] ?? '';
    // `const Row = memo(` or `use: ` right before where the function starts, past any wrapping calls.
    const before = column > 0 ? text.slice(0, column) : text;
    const assigned = /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:[\w$.]+\(\s*)*(?:async\s*)?$/.exec(before)?.[1];
    if (assigned) return assigned;
    if (/export\s+default\b/.test(text)) return nameOfFile(file) ?? '';
  } catch {
    // Unnamed, then.
  }
  return '';
}

function classify(name: string, file: string, line: number, root: string): ResolvedFrame {
  const own = ownRoot?.replace(/\\/g, '/');
  if (own && (file.startsWith(`${own}/src/`) || file.startsWith(`${own}/dist/`))) return { name, package: 'react-perf-recorder', own: true };
  const at = file.lastIndexOf('/node_modules/');
  if (at >= 0) {
    const rest = file.slice(at + '/node_modules/'.length);
    // Left unmapped in the optimizer's folder: an entry is named after its package, a shared chunk after nothing.
    const deps = /^\.[^/]+\/deps\/([^/]+)\.js$/.exec(rest)?.[1];
    const pkg = deps ? (deps.startsWith('chunk-') ? '(vite deps)' : packageOf(deps.replace(/_/g, '/'))) : packageOf(rest);
    return pkg === 'react-perf-recorder' ? { name, package: pkg, own: true } : { name, package: pkg };
  }
  return { name, site: `${path.relative(root, file).replace(/\\/g, '/')}:${line}`, package: null };
}
