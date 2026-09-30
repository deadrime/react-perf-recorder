// @vitest-environment node
import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';
import { transformWithEsbuild } from 'vite';
import { fixJsxLines } from '../../src/vite/jsx-lines';

const source = [
  "import { memo } from 'react';",
  'const where = { fileName: "/app/src/App.tsx", lineNumber: 40, columnNumber: 1 };',
  'export function Counter({ n }: { n: number }) {',
  '  return (',
  '    <div>',
  '      <button',
  '        data-testid="more"',
  '      >',
  '        more',
  '      </button>',
  '      <span title={String(where.lineNumber)}>{n}</span>',
  '    </div>',
  '  );',
  '}',
].join('\n');

const FILE = '/app/src/App.tsx';

/** esbuild's output for the module with `header` lines above it, and a map from that output back to `source`. */
async function compiled(header: number) {
  const out = await transformWithEsbuild('refresh();\n'.repeat(header) + source, FILE, { jsx: 'automatic', jsxDev: true, sourcemap: true });
  const map = out.map as unknown as ConstructorParameters<typeof TraceMap>[0];
  // What Vite combines: the header's map puts every line back where the file has it.
  const mappings = decodedMappings(new TraceMap(map)).map((segments) =>
    segments.filter((s) => s.length < 4 || s[2]! >= header).map((s) => (s.length < 4 ? s : [s[0], s[1]!, s[2]! - header, s[3]!]))
  );
  return { code: out.code, map: { version: 3 as const, sources: [FILE], names: [], mappings } as never };
}

const lineNumbers = (code: string) => [...code.matchAll(/fileName: ".*",\s*lineNumber: *(\d+),\s*columnNumber/g)].map((m) => Number(m[1]));

describe('fixJsxLines', () => {
  it('puts element lines back where the file has them when something above the module moved them', async () => {
    const { code, map } = await compiled(19);
    expect(lineNumbers(code)).toEqual([40, 25, 30, 24]);
    const fixed = fixJsxLines(code, FILE, () => map)!;
    // The app's own object keeps its number; the elements' lines keep their width, so no column moves.
    expect(lineNumbers(fixed)).toEqual([40, 6, 11, 5]);
    expect(fixed).toContain('lineNumber:  6,');
    expect(fixed.length).toBe(code.length);
  });

  it('leaves lines that are already right alone', async () => {
    const { code, map } = await compiled(0);
    expect(lineNumbers(code)).toEqual([40, 6, 11, 5]);
    expect(fixJsxLines(code, FILE, () => map)).toBeNull();
  });
});
