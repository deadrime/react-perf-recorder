import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const CALL = /\bjsxDEV\(/g;
// The element's own source object, so an app's own `lineNumber:` is never touched.
const LINE = /\bfileName:\s*"(?:[^"\\]|\\.)*",\s*lineNumber:\s*(\d+)/g;

/**
 * esbuild writes an element's line as it stands in the code it was handed, and @vitejs/plugin-react 4 puts its Fast
 * Refresh header (19 lines) above the module first: React 18's `_debugSource` then points below the element. The
 * shift is read off elements with no element inside, whose call and line surely belong together, and taken off
 * every line; null when there is no shift or the elements disagree on it.
 */
export function fixJsxLines(code: string, map: ConstructorParameters<typeof TraceMap>[0]): string | null {
  if (!code.includes('lineNumber')) return null;
  const starts = [0];
  for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) starts.push(i + 1);
  const positionOf = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] };
  };
  const calls = [...code.matchAll(CALL)].map((m) => m.index!);
  const lines = [...code.matchAll(LINE)];
  let traced: TraceMap | null = null;
  let shift: number | null = null;
  let next = 0;
  for (let i = 0; i < calls.length; i++) {
    while (next < lines.length && lines[next].index! < calls[i]) next++;
    const own = lines[next];
    if (!own || (i + 1 < calls.length && calls[i + 1] < own.index!)) continue;
    traced ??= new TraceMap(map);
    const original = originalPositionFor(traced, positionOf(calls[i]));
    if (original.line == null) continue;
    const d = Number(own[1]) - original.line;
    if (shift === null) shift = d;
    else if (shift !== d) return null;
  }
  if (!shift) return null;
  return code.replace(LINE, (text, line: string) => text.slice(0, -line.length) + (Number(line) - shift!));
}
