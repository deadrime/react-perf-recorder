import { memoDepsAt, memoDepsInHook } from '../../src/vite/helpers/hook-deps';
import { parseModule } from '../../src/vite/helpers/name-declarations';
import { memoWhy } from '../../src/shared/summary';

const depsAt = (code: string, line: number) => memoDepsAt(parseModule(code, 'a.tsx')!, code, line);

describe('memo dependencies by name', () => {
  it('reads the array of the useMemo or useCallback called on a line, wherever the array is written', () => {
    const code = [
      'function useRows(filter, side) {',
      '  const sorted = React.useMemo(() => sort(rows), [rows, options.order]);',
      '  return useMemo(() => {',
      '    return rows.filter((r) => r.status === filter.status);',
      '  }, [filter, side]);',
      '}',
      'const onPick = useCallback((id: string) => pick(id), [pick]);',
      'const fresh = useMemo(() => new Date());',
    ].join('\n');
    expect(depsAt(code, 2)).toEqual(['rows', 'options.order']);
    expect(depsAt(code, 3)).toEqual(['filter', 'side']);
    expect(depsAt(code, 7)).toEqual(['pick']);
    // No array: nothing to name.
    expect(depsAt(code, 8)).toBeNull();
    expect(depsAt(code, 4)).toBeNull();
  });

  it('finds the one useMemo inside a custom hook, or where the hook is imported from', () => {
    const code = [
      "import { useSort } from './sort';",
      'export function useOpenRows(filter, side) {',
      '  return useMemo(() => rows.filter((r) => r.status === filter.status), [filter, side]);',
      '}',
      'const useTwo = () => { const a = useMemo(() => 1, [x]); return useCallback(() => a, [a]); };',
    ].join('\n');
    const body = parseModule(code, 'a.tsx')!;
    expect(memoDepsInHook(body, code, 'useOpenRows')).toEqual({ kind: 'deps', deps: ['filter', 'side'] });
    expect(memoDepsInHook(body, code, 'useSort')).toEqual({ kind: 'import', source: './sort' });
    // Two memos in one hook: which one is not known here.
    expect(memoDepsInHook(body, code, 'useTwo')).toBeNull();
    expect(memoDepsInHook(body, code, 'useNothing')).toBeNull();
  });

  it('names the dependency in the sentence, and falls back to its number', () => {
    const stat = { component: 'A', hook: 1, kind: 'useMemo' as const, renders: 3, recomputed: 3, deps: [{ index: 1, changed: 3, sameContent: 3 }] };
    expect(memoWhy({ ...stat, info: { deps: ['rows', 'filter'] } })).toBe('`filter` is a new object with the same content every time');
    expect(memoWhy(stat)).toBe('dependency 2 is a new object with the same content every time');
  });
});
