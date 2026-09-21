// @vitest-environment node
import { addComponentNames } from '../../src/vite/component-names';
import { findDeclarations } from '../../src/vite/helpers/name-declarations';
import { createFilter } from '../../src/vite/helpers/filter';

const namesIn = (code: string) => {
  const named = addComponentNames(code);
  return named ? Array.from(named.slice(code.length).matchAll(/^if \(\(typeof (\w+) === "function"/gm), (match) => match[1]) : [];
};

describe('addComponentNames', () => {
  it('names top-level memo, forwardRef components and contexts', () => {
    const code = [
      'export const PriceCell = memo(({ price }: Props) => <span>{price}</span>);',
      'const Row = React.memo((props: RowProps) => <tr {...props} />);',
      'export const Field = forwardRef<HTMLInputElement, FieldProps>((props, ref) => <input ref={ref} {...props} />);',
      'export const Select = memo(<T,>(props: SelectProps<T>) => null);',
      'export const Header: FC<HeaderProps> = memo(',
      '  ({ title }) => <h1>{title}</h1>,',
      ');',
      'export const ThemeContext = createContext<Theme | null>(null);',
      'const FormContext = React.createContext({});',
    ].join('\n');

    expect(namesIn(code)).toEqual(['PriceCell', 'Row', 'Field', 'Select', 'Header', 'ThemeContext', 'FormContext']);
  });

  it('is harmless when the declaration is only in a string', () => {
    // A code sample in a doc block or on a demo page reads like a declaration: whatever the name turns out to be —
    // missing, or a string — the line the transform adds must not throw.
    const code = ['const SAMPLE = `', 'const AppContext = createContext({});', '`;', 'export const Real = memo(() => null);'].join('\n');
    expect(namesIn(code)).toContain('Real');
    const named = addComponentNames(code)!;
    // Never a bare mention of the name: reading an undeclared one throws, `typeof` does not.
    for (const name of namesIn(code)) expect(named).toContain(`if ((typeof ${name} === "function" || (typeof ${name} === "object" && ${name} !== null))`);
  });

  it('keeps an existing displayName', () => {
    expect(addComponentNames("export const Foo = memo(() => null);\nFoo.displayName = 'Custom';")).toContain(
      'if ((typeof Foo === "function" || (typeof Foo === "object" && Foo !== null)) && !Foo.displayName) Foo.displayName = "Foo";'
    );
  });

  it('skips nested declarations and look-alike calls', () => {
    const code = [
      'export function List() {',
      '  const Item = memo(() => null);',
      '  const value = useMemo(() => 1, []);',
      '  return <Item />;',
      '}',
      'export const selectPrice = memoize((state: State) => state.price);',
      'const mapped = items.map((item) => memo(item));',
    ].join('\n');

    expect(addComponentNames(code)).toBeNull();
  });
});

describe('findDeclarations', () => {
  it('finds memoized selectors in every declaration form', () => {
    const code = [
      'export const selectA = memoize((state: S) => state.a);',
      'const selectB = memoizeWithArgs((state: S, id: string) => state.b[id]);',
      'export const selectC = memoizeWithArgs(',
      '  (state: S, id: string) => {',
      '    return state.c[id];',
      '  },',
      '  { size: 32 }',
      ');',
      'export const selectD = memoize<S, number>((state) => state.d);',
      'export const notMemo = memoized(1);',
    ].join('\n');
    expect(findDeclarations(code, ['memoize', 'memoizeWithArgs'])).toEqual(['selectA', 'selectB', 'selectC', 'selectD']);
  });
});

describe('createFilter', () => {
  it('matches the app code only', () => {
    const filter = createFilter(() => '/app', ['src/**/*.{ts,tsx}'], ['src/**/*.test.ts']);
    expect(filter('/app/src/stores/index.ts')).toBe(true);
    expect(filter('/app/src/a/b/C.tsx?v=1')).toBe(true);
    expect(filter('/app/src/a.test.ts')).toBe(false);
    expect(filter('/app/node_modules/zustand/index.js')).toBe(false);
    expect(filter('\0virtual')).toBe(false);
    expect(filter('/other/src/x.ts')).toBe(false);
  });
});
