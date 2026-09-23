import { parse, type ParserPlugin } from '@babel/parser';
import type { Expression, Node, Statement } from '@babel/types';

export interface ScanOptions {
  /** `React.memo(…)` counts as `memo(…)`. */
  allowReactPrefix?: boolean;
  /** The module's id: its extension says whether it is TypeScript and whether it has JSX. */
  file?: string;
}

export interface ModuleScan {
  /** Top-level `const X = callee(…)`, exported or not, in the order they are declared. */
  names: string[];
  /** `export default callee(…)`: where the call is, so it can be given a name of its own. */
  defaultCall: { start: number; end: number } | null;
}

const EMPTY: ModuleScan = { names: [], defaultCall: null };

/** The syntax to read a module with, by its extension; `.ts` has no JSX, and in it `<T>x` is a cast. */
function pluginSets(file?: string): ParserPlugin[][] {
  const ext = file?.replace(/[?#].*$/, '').match(/\.([cm]?[jt]sx?)$/)?.[1];
  if (ext === 'tsx') return [['typescript', 'jsx']];
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return [['typescript']];
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return [['jsx']];
  return [['typescript', 'jsx'], ['typescript']];
}

function parseModule(code: string, file?: string): Statement[] | null {
  for (const plugins of pluginSets(file)) {
    try {
      return parse(code, { sourceType: 'module', plugins: [...plugins, 'decorators-legacy'], errorRecovery: true }).program.body;
    } catch {
      // The next set, or nothing: a module that does not parse is Vite's to report, not ours to name.
    }
  }
  return null;
}

/** Past the parts of an expression that only speak to the type checker: `x as T`, `x satisfies T`, `x!`, `(x)`. */
function unwrap(node: Expression): Expression {
  let e: Node = node;
  while (
    e.type === 'TSAsExpression' ||
    e.type === 'TSSatisfiesExpression' ||
    e.type === 'TSNonNullExpression' ||
    e.type === 'TSTypeAssertion' ||
    e.type === 'ParenthesizedExpression'
  )
    e = e.expression;
  return e as Expression;
}

/** The function a call calls, by name: `memo`, `React.memo`, and `create` of the curried `create<T>()(…)`. */
function calleeName(callee: Node, allowReactPrefix: boolean): string | null {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'CallExpression') return calleeName(callee.callee, allowReactPrefix);
  if (callee.type === 'TSInstantiationExpression') return calleeName(callee.expression, allowReactPrefix);
  if (
    allowReactPrefix &&
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'React' &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name;
  return null;
}

/**
 * Reads the module and finds what a call to one of `callees` is assigned to at its top level. It is parsed, not
 * searched: a declaration written in a string, a template or a comment is text, and one inside a function is not
 * the module's to name.
 */
export function scanModule(code: string, callees: string[], { allowReactPrefix = false, file }: ScanOptions = {}): ModuleScan {
  if (!callees.length || !callees.some((c) => code.includes(c))) return EMPTY;
  const body = parseModule(code, file);
  if (!body) return EMPTY;
  const isCall = (node: Expression | null | undefined): boolean => {
    if (!node) return false;
    const e = unwrap(node);
    if (e.type !== 'CallExpression') return false;
    const name = calleeName(e.callee, allowReactPrefix);
    return name !== null && callees.includes(name);
  };
  const names: string[] = [];
  let defaultCall: ModuleScan['defaultCall'] = null;
  for (const statement of body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
      for (const d of declaration.declarations)
        if (d.id.type === 'Identifier' && isCall(d.init) && !names.includes(d.id.name)) names.push(d.id.name);
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      const e = statement.declaration;
      if (e.start != null && e.end != null && isCall(e as Expression)) defaultCall = { start: e.start, end: e.end };
    }
  }
  return { names, defaultCall };
}

/**
 * Top-level `const X = callee(…)` / `export const X = callee<T>(…)` declarations. Nested calls and anything written
 * inside a string, a template literal or a comment are not named.
 */
export function findDeclarations(code: string, callees: string[], options: ScanOptions = {}): string[] {
  return scanModule(code, callees, options).names;
}

/** Appends generated lines at the end of the module: line numbers stay the same, so no source map is needed. */
export function appendLines(code: string, lines: string[]): string | null {
  if (!lines.length) return null;
  return `${code}\n${lines.join('\n')}\n`;
}

/**
 * A call on a found name that cannot throw: a name the module does not have after all — TypeScript's `declare`, a
 * transform after ours — is skipped rather than breaking the module that was being named.
 */
export const ifDeclared = (name: string, call: string) => `if (typeof ${name} !== "undefined") ${call}`;
