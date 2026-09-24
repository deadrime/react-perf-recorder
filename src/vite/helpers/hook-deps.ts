import type { Node, Statement } from '@babel/types';

const MEMO_HOOKS = /^(useMemo|useCallback)$/;

const hookName = (callee: Node): string | null => {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;
  return null;
};

/**
 * The dependency list of the useMemo or useCallback called on `line`, each item as the code writes it:
 * `['items', 'filter']`. Null when there is no such call there or its last argument is not an array literal.
 */
export function memoDepsAt(body: Statement[], code: string, line: number): string[] | null {
  let found: string[] | null = null;
  const visit = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const n = node as Node;
    if (n.loc && (n.loc.start.line > line || n.loc.end.line < line)) return;
    if (n.type === 'CallExpression' && n.callee.loc?.start.line === line) {
      const name = hookName(n.callee);
      const last = n.arguments[n.arguments.length - 1];
      if (name && MEMO_HOOKS.test(name) && n.arguments.length > 1 && last?.type === 'ArrayExpression') {
        found = last.elements.map((el) =>
          el
            ? code
                .slice(el.start ?? 0, el.end ?? 0)
                .replace(/\s+/g, ' ')
                .slice(0, 60)
            : ''
        );
        return;
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
      visit((n as unknown as Record<string, unknown>)[key]);
    }
  };
  visit(body);
  return found;
}

type Found = { kind: 'deps'; deps: string[] } | { kind: 'import'; source: string } | null;

/** The function a module declares under `name`: `function useX() {}` or `const useX = () => {}`, exported or not. */
function declared(body: Statement[], name: string): Node | null {
  for (const statement of body) {
    const node = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement;
    if (!node) continue;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) return node;
    if (node.type === 'VariableDeclaration')
      for (const d of node.declarations) if (d.id.type === 'Identifier' && d.id.name === name && d.init) return d.init;
  }
  return null;
}

/** Every useMemo and useCallback inside a function, in the order they are written. */
function memoCalls(fn: Node): Array<Extract<Node, { type: 'CallExpression' }>> {
  const out: Array<Extract<Node, { type: 'CallExpression' }>> = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return void node.forEach(visit);
    const n = node as Node;
    if (n.type === 'CallExpression') {
      const name = hookName(n.callee);
      if (name && MEMO_HOOKS.test(name)) out.push(n);
    }
    for (const key of Object.keys(n)) if (key !== 'loc' && !key.endsWith('Comments')) visit((n as unknown as Record<string, unknown>)[key]);
  };
  visit(fn);
  return out;
}

/**
 * The dependency list of the one useMemo or useCallback inside the custom hook `name`, when the module declares it;
 * or where the module imports `name` from, to look there. Null when there is none, or more than one to choose from.
 */
export function memoDepsInHook(body: Statement[], code: string, name: string): Found {
  const fn = declared(body, name);
  if (fn) {
    const calls = memoCalls(fn);
    const last = calls.length === 1 ? calls[0].arguments[calls[0].arguments.length - 1] : undefined;
    if (calls[0]?.arguments.length !== 2 || last?.type !== 'ArrayExpression') return null;
    return {
      kind: 'deps',
      deps: last.elements.map((el) =>
        el
          ? code
              .slice(el.start ?? 0, el.end ?? 0)
              .replace(/\s+/g, ' ')
              .slice(0, 60)
          : ''
      ),
    };
  }
  for (const statement of body)
    if (statement.type === 'ImportDeclaration' && statement.specifiers.some((s) => s.local.name === name))
      return { kind: 'import', source: statement.source.value };
  return null;
}
