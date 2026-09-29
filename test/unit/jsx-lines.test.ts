// @vitest-environment node
import { decode, encode } from '@jridgewell/sourcemap-codec';
import { transform } from 'esbuild';
import { fixJsxLines } from '../../src/vite/jsx-lines';

const source = [
  "import { memo } from 'react';",
  'export function Counter({ n }: { n: number }) {',
  '  return (',
  '    <div>',
  '      <button',
  '        data-testid="more"',
  '      >',
  '        more',
  '      </button>',
  '      <span title={String({ lineNumber: 1 }.lineNumber)}>{n}</span>',
  '    </div>',
  '  );',
  '}',
].join('\n');

/** esbuild's output for the module with `header` lines above it, and a map from that output back to `source`. */
async function compiled(header: number) {
  const input = 'refresh();\n'.repeat(header) + source;
  const out = await transform(input, { loader: 'tsx', jsx: 'automatic', jsxDev: true, sourcemap: 'external', sourcefile: 'App.tsx' });
  const map = JSON.parse(out.map);
  // What Vite combines: the header's map puts every line back where the file has it.
  const lines = decode(map.mappings).map((segments) =>
    segments.filter((s) => s.length < 4 || s[2]! >= header).map((s) => (s.length < 4 ? s : ([s[0], s[1]!, s[2]! - header, s[3]!] as const)))
  );
  return { code: out.code, map: { ...map, mappings: encode(lines as never) } };
}

const lineNumbers = (code: string) => [...code.matchAll(/fileName: ".*",\s*lineNumber: (\d+)/g)].map((m) => Number(m[1]));

describe('fixJsxLines', () => {
  it('puts element lines back where the file has them when something above the module moved them', async () => {
    const { code, map } = await compiled(19);
    expect(lineNumbers(code)).toEqual([24, 29, 23]);
    const fixed = fixJsxLines(code, map)!;
    expect(lineNumbers(fixed)).toEqual([5, 10, 4]);
    expect(fixed).toContain('lineNumber: 1 }');
  });

  it('leaves lines that are already right alone', async () => {
    const { code, map } = await compiled(0);
    expect(lineNumbers(code)).toEqual([5, 10, 4]);
    expect(fixJsxLines(code, map)).toBeNull();
  });
});
