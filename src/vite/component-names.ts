import { appendLines, scanModule } from './helpers/name-declarations';

export interface ComponentNamesOptions {
  include?: string[];
  exclude?: string[];
  /** Calls whose result gets a `displayName`: memo and forwardRef components, contexts. */
  wrappers?: string[];
}

export const DEFAULT_WRAPPERS = ['memo', 'forwardRef', 'createContext'];

/** The local the default export is kept in so it can be named; a `var`, so it is declared before the export runs. */
const DEFAULT_LOCAL = '__rprDefault';

const nameLine = (local: string, name: string) =>
  `if ((typeof ${local} === "function" || (typeof ${local} === "object" && ${local} !== null)) && !${local}.displayName) ` +
  `${local}.displayName = ${JSON.stringify(name)};`;

/** What a default export is called where it is imported: its file, or its folder for an `index` file. */
export function nameOfFile(file: string): string | null {
  const parts = file.replace(/[?#].*$/, '').split(/[\\/]/);
  const base = parts.pop()?.replace(/\.[^.]+$/, '');
  const name = base === 'index' ? parts.pop() : base;
  return name && /^[A-Za-z_$][\w$-]*$/.test(name) ? name : null;
}

/**
 * `const Row = memo(...)` → `if (!Row.displayName) Row.displayName = "Row";`, so a memo over an arrow function is not
 * `Memo`/`Anonymous`. `export default memo(...)` is named after its file.
 */
export function addComponentNames(code: string, wrappers: string[] = DEFAULT_WRAPPERS, file?: string): string | null {
  const { names, defaultCall } = scanModule(code, wrappers, { allowReactPrefix: true, file });
  const lines = names.map((name) => nameLine(name, name));
  const defaultName = defaultCall && file ? nameOfFile(file) : null;
  let out = code;
  if (defaultCall && defaultName) {
    const { start, end } = defaultCall;
    out = `${code.slice(0, start)}(${DEFAULT_LOCAL} = ${code.slice(start, end)})${code.slice(end)}`;
    lines.push(`var ${DEFAULT_LOCAL};`, nameLine(DEFAULT_LOCAL, defaultName));
  }
  return appendLines(out, lines);
}
