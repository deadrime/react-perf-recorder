const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Top-level `const X = callee(` / `export const X = callee<T>(` declarations, on one line up to the call; arguments
 * may span many lines. Nested and default-exported calls are not named.
 */
export function findDeclarations(code: string, callees: string[], { allowReactPrefix = false } = {}): string[] {
  if (!callees.length) return [];
  const prefix = allowReactPrefix ? '(?:React\\.)?' : '';
  const re = new RegExp(
    `^(?:export\\s+)?(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\b[^\\n]*?=\\s*${prefix}(?:${callees.map(escape).join('|')})\\b\\s*[<(]`,
    'gm'
  );
  const names: string[] = [];
  for (let m = re.exec(code); m; m = re.exec(code)) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

/** Appends generated lines at the end of the module: line numbers stay the same, so no source map is needed. */
export function appendLines(code: string, lines: string[]): string | null {
  if (!lines.length) return null;
  return `${code}\n${lines.join('\n')}\n`;
}
