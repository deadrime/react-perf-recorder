const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Past a quoted string: it ends at its quote, or at the end of the line — a stray apostrophe in JSX text included. */
const skipString = (code: string, i: number) => {
  const quote = code[i];
  let j = i + 1;
  while (j < code.length && code[j] !== quote && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
  return j + 1;
};

/** Past a template literal, its `${…}` parts and the templates nested in them included. */
function skipTemplate(code: string, i: number): number {
  let j = i + 1;
  while (j < code.length) {
    const ch = code[j];
    if (ch === '\\') j += 2;
    else if (ch === '`') return j + 1;
    else if (ch === '$' && code[j + 1] === '{') j = skipExpression(code, j + 2);
    else j++;
  }
  return code.length;
}

function skipExpression(code: string, i: number): number {
  let depth = 1;
  let j = i;
  while (j < code.length) {
    const ch = code[j];
    if (ch === '`') j = skipTemplate(code, j);
    else if (ch === '"' || ch === "'") j = skipString(code, j);
    else {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return j + 1;
      j++;
    }
  }
  return code.length;
}

/** After one of these, a `/` opens a regular expression rather than dividing. */
const BEFORE_REGEX = /[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|void|yield|await)$/;

function skipRegex(code: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < code.length && code[j] !== '\n') {
    const ch = code[j];
    if (ch === '\\') j += 2;
    else {
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) return j + 1;
      j++;
    }
  }
  return j;
}

/**
 * The parts of a module that are not code: strings, template literals, comments and regular expressions. A
 * declaration written inside one of them — a code sample in a template string, an example in a doc comment — is
 * text, and naming it would append a reference to a variable that does not exist.
 */
export function literalRanges(code: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let before = '';
  for (let i = 0; i < code.length; ) {
    const ch = code[i];
    const next = code[i + 1];
    let end = -1;
    if (ch === '/' && next === '/') end = code.indexOf('\n', i) < 0 ? code.length : code.indexOf('\n', i);
    else if (ch === '/' && next === '*') end = code.indexOf('*/', i + 2) < 0 ? code.length : code.indexOf('*/', i + 2) + 2;
    else if (ch === '"' || ch === "'") end = skipString(code, i);
    else if (ch === '`') end = skipTemplate(code, i);
    else if (ch === '/' && (before === '' || BEFORE_REGEX.test(before))) end = skipRegex(code, i);
    if (end >= 0) {
      ranges.push([i, end]);
      i = end;
      before = 'x';
      continue;
    }
    if (!/\s/.test(ch)) before = /[\w$]/.test(ch) ? (/[\w$]/.test(before.slice(-1)) ? before + ch : ch) : ch;
    i++;
  }
  return ranges;
}

const inside = (ranges: Array<[number, number]>, at: number) => ranges.some(([start, end]) => at >= start && at < end);

/**
 * Top-level `const X = callee(` / `export const X = callee<T>(` declarations, on one line up to the call; arguments
 * may span many lines. Nested and default-exported calls are not named, and neither is anything written inside a
 * string, a template literal or a comment.
 */
export function findDeclarations(code: string, callees: string[], { allowReactPrefix = false } = {}): string[] {
  if (!callees.length) return [];
  const prefix = allowReactPrefix ? '(?:React\\.)?' : '';
  const re = new RegExp(
    `^(?:export\\s+)?(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\b[^\\n]*?=\\s*${prefix}(?:${callees.map(escape).join('|')})\\b\\s*[<(]`,
    'gm'
  );
  let ranges: Array<[number, number]> | null = null;
  const names: string[] = [];
  for (let m = re.exec(code); m; m = re.exec(code)) {
    ranges ??= literalRanges(code);
    // Both ends have to be code: the declaration, and the call it is assigned — `const A = '… = memoize('` is a string.
    const call = m.index + m[0].length - 1;
    if (!inside(ranges, m.index) && !inside(ranges, call) && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** Appends generated lines at the end of the module: line numbers stay the same, so no source map is needed. */
export function appendLines(code: string, lines: string[]): string | null {
  if (!lines.length) return null;
  return `${code}\n${lines.join('\n')}\n`;
}

/**
 * A call on a found name that cannot throw: whatever the scan got wrong, a name that is not there is skipped
 * rather than breaking the module that was being named.
 */
export const ifDeclared = (name: string, call: string) => `if (typeof ${name} !== "undefined") ${call}`;
