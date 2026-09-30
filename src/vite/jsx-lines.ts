import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

type SourceMap = ConstructorParameters<typeof TraceMap>[0];

const CALL = /(?<![\w$])_?jsxDEV\(/g;

/**
 * Puts React 18's element lines back on the file when a plugin before esbuild added lines above the module
 * (@vitejs/plugin-react 4). The shift is read off elements with no element inside; null when there is none.
 */
export function fixJsxLines(code: string, file: string, map: () => SourceMap): string | null {
  const literal = JSON.stringify(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Only the source objects the JSX transform wrote for this file: an app's own `lineNumber` stays as it is.
  const LINE = new RegExp(`\\bfileName:\\s*${literal},\\s*lineNumber:\\s*(\\d+),\\s*columnNumber:\\s*\\d+\\s*\\},\\s*this\\s*\\)`, 'g');
  const lines = [...code.matchAll(LINE)];
  if (!lines.length) return null;
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
  let traced: TraceMap | null = null;
  let shift: number | null = null;
  let next = 0;
  for (let i = 0; i < calls.length; i++) {
    while (next < lines.length && lines[next].index! < calls[i]) next++;
    const own = lines[next];
    if (!own || (i + 1 < calls.length && calls[i + 1] < own.index!)) continue;
    traced ??= new TraceMap(map());
    const original = originalPositionFor(traced, positionOf(calls[i]));
    if (original.line == null) continue;
    const d = Number(own[1]) - original.line;
    if (shift === null) shift = d;
    else if (shift !== d) return null;
  }
  if (!shift) return null;
  // Padded to the old width, so no column after it moves and the module's map stays true.
  return code.replace(LINE, (text, line: string) =>
    text.replace(/(lineNumber:\s*)\d+/, (_, head: string) => head + String(Number(line) - shift!).padStart(line.length, ' '))
  );
}
