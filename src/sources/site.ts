import fs from 'node:fs';
import path from 'node:path';
import type { Statement } from '@babel/types';
import { memoDepsAt, memoDepsInHook } from '../vite/helpers/hook-deps';
import { parseModule } from '../vite/helpers/name-declarations';

export interface MappedSite {
  site: string;
  code?: string;
  deps?: string[];
}

const fileLines = new Map<string, { mtimeMs: number; lines: string[] }>();

export function linesOf(file: string): string[] {
  const mtimeMs = fs.statSync(file).mtimeMs;
  const cached = fileLines.get(file);
  if (cached?.mtimeMs === mtimeMs) return cached.lines;
  if (fileLines.size > 200) fileLines.clear();
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  fileLines.set(file, { mtimeMs, lines });
  return lines;
}

const parsedFiles = new Map<string, { mtimeMs: number; code: string; body: Statement[] | null }>();

function parsedOf(file: string) {
  const mtimeMs = fs.statSync(file).mtimeMs;
  let parsed = parsedFiles.get(file);
  if (parsed?.mtimeMs !== mtimeMs) {
    if (parsedFiles.size > 50) parsedFiles.clear();
    const code = linesOf(file).join('\n');
    parsedFiles.set(file, (parsed = { mtimeMs, code, body: parseModule(code, file) }));
  }
  return parsed;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

/**
 * A memo's dependencies by name: the useMemo on the line, or — when the line calls a custom hook — the one useMemo
 * inside the innermost of `hooks`, looked up in this module and the modules it imports relatively, three at most.
 */
export function depsOf(file: string, line: number, hooks: string[] = []): string[] | null {
  const here = parsedOf(file);
  if (!here.body) return null;
  const direct = memoDepsAt(here.body, here.code, line);
  if (direct || !hooks.length) return direct;
  const innermost = hooks[hooks.length - 1];
  let at = file;
  for (let hop = 0; hop < 3; hop++) {
    const parsed = parsedOf(at);
    if (!parsed.body) return null;
    // The innermost hook, or the outermost that leads there: the module that has one imports the other.
    const found =
      memoDepsInHook(parsed.body, parsed.code, innermost) ??
      (hop === 0 && hooks.length > 1 ? memoDepsInHook(parsed.body, parsed.code, hooks[0]) : null);
    if (!found) return null;
    if (found.kind === 'deps') return found.deps;
    if (!found.source.startsWith('.')) return null;
    const base = path.resolve(path.dirname(at), found.source);
    const next = EXTENSIONS.map((ext) => base + ext).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!next) return null;
    at = next;
  }
  return null;
}

/**
 * A line of a file on disk as a recording names it: `src/file.ts:12`, the code on it and, for a memo, its
 * dependencies. `name` is the file as the page's server calls it, when that is not its path from `root`.
 */
export function siteOnDisk(root: string, file: string, line: number, hooks?: string[], name?: string): MappedSite {
  const code = linesOf(file)[line - 1]?.trim().slice(0, 140);
  // A useMemo or useCallback: its dependencies by the names the code gives them, wherever the array is written.
  const deps = hooks ? depsOf(file, line, hooks) : null;
  const shown = name ?? path.relative(root, file).replace(/\\/g, '/');
  return { site: `${shown}:${line}`, ...(code ? { code } : {}), ...(deps ? { deps } : {}) };
}
