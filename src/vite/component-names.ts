import { appendLines, findDeclarations } from './helpers/name-declarations';

export interface ComponentNamesOptions {
  include?: string[];
  exclude?: string[];
  /** Calls whose result gets a `displayName`: memo and forwardRef components, contexts. */
  wrappers?: string[];
}

export const DEFAULT_WRAPPERS = ['memo', 'forwardRef', 'createContext'];

/**
 * `const Row = memo(...)` → `if (!Row.displayName) Row.displayName = "Row";` at the end of the module. Without it a
 * memo over an arrow function shows up as `Memo`/`Anonymous`, and a context as `(unnamed)`.
 *
 * The declarations are found by reading the text; strings, templates and comments are skipped, and the `typeof`
 * guard keeps whatever the scan still gets wrong harmless: a name that does not exist, or holds something that is
 * not a component, is left alone instead of throwing.
 */
export function addComponentNames(code: string, wrappers: string[] = DEFAULT_WRAPPERS): string | null {
  const names = findDeclarations(code, wrappers, { allowReactPrefix: true });
  return appendLines(
    code,
    names.map(
      (name) =>
        `if ((typeof ${name} === "function" || (typeof ${name} === "object" && ${name} !== null)) && !${name}.displayName) ` +
        `${name}.displayName = ${JSON.stringify(name)};`
    )
  );
}
