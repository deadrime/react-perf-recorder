/**
 * Colours for the snippets on the case pages: a small TSX tokenizer written for them, not a general one. A highlighter
 * package would bring its own renders or a large grammar to a page that is itself being measured.
 */

type Kind = 'c' | 'note' | 's' | 'n' | 'k' | 'f' | 't' | 'tag' | 'a' | 'p' | '';
type Token = { kind: Kind; text: string };
/** What the text at this point is: code, the inside of a JSX tag, or the text between tags. */
type Mode = { in: 'js' | 'children' } | { in: 'tag'; closing: boolean; named: boolean };

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case break continue new typeof instanceof in of ' +
    'await async export import from default class extends try catch finally throw delete void as type interface'
  ).split(' ')
);
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this']);

const COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?\*\//y;
const STRING = /'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?/y;
const NUMBER = /\d[\d_]*(?:\.\d+)?/y;
const WORD = /[A-Za-z_$][\w$]*/y;
const SPACE = /\s+/y;
const OPERATOR = /\.\.\.|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|[-+*%!=<>&|^~?:;,.()[\]{}/]/y;
/** What makes a name a call, generic ones included: `useState<string>(`. */
const CALL = /\s*(?:<[\w\s,.[\]|]*>)?\(/y;
const JSX_TEXT = /[^<{\n/]+|\//y;

const at = (re: RegExp, source: string, i: number) => {
  re.lastIndex = i;
  return re.exec(source)?.[0];
};

/** A `<` opens a tag unless it follows a value: `a < b` and `useState<T>` stay code. */
const opensTag = (source: string, i: number, previous: Token | undefined) => {
  if (!/[A-Za-z>]/.test(source[i + 1] ?? '')) return false;
  if (!previous) return true;
  if (previous.kind === 'k') return true;
  return previous.kind === 'p' && !/^[)\]]$/.test(previous.text);
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const modes: Mode[] = [{ in: 'js' }];
  let previous: Token | undefined;
  const push = (kind: Kind, text: string) => {
    tokens.push({ kind, text });
    if (kind !== '' || text.trim()) previous = { kind, text };
  };
  const pop = () => {
    if (modes.length > 1) modes.pop();
  };

  let i = 0;
  while (i < source.length) {
    const mode = modes[modes.length - 1];
    let m: string | undefined;

    if ((m = at(SPACE, source, i))) push('', m);
    // In JSX text too: the snippets hang their `// ←` notes after a tag.
    else if ((m = at(COMMENT, source, i))) push(m.includes('←') ? 'note' : 'c', m);
    else if (mode.in === 'children') {
      if (source[i] === '{') {
        push('p', '{');
        modes.push({ in: 'js' });
        m = '{';
      } else if (source[i] === '<') {
        const closing = source[i + 1] === '/';
        m = closing ? '</' : '<';
        push('p', m);
        modes.push({ in: 'tag', closing, named: false });
      } else push('', (m = at(JSX_TEXT, source, i)!));
    } else if (mode.in === 'tag') {
      if ((m = at(STRING, source, i))) push('s', m);
      else if ((m = at(WORD, source, i) && at(/[\w$.-]+/y, source, i))) {
        push(mode.named ? 'a' : /^[A-Z]/.test(m) ? 't' : 'tag', m);
        mode.named = true;
      } else if (source.startsWith('/>', i)) {
        push('p', (m = '/>'));
        pop();
      } else if (source[i] === '>') {
        push('p', (m = '>'));
        pop();
        // `</x>` ends the element's children as well; `<x>` starts them.
        if (mode.closing) pop();
        else modes.push({ in: 'children' });
      } else if (source[i] === '{') {
        push('p', (m = '{'));
        modes.push({ in: 'js' });
      } else push('p', (m = source[i]));
    } else if ((m = at(STRING, source, i))) push('s', m);
    else if ((m = at(NUMBER, source, i))) push('n', m);
    else if ((m = at(WORD, source, i))) {
      const call = at(CALL, source, i + m.length) !== undefined;
      const property = previous?.text === '.' || previous?.text === '?.';
      if (!property && KEYWORDS.has(m)) push('k', m);
      else if (!property && LITERALS.has(m)) push('n', m);
      else if (call) push('f', m);
      else if (/^[A-Z]/.test(m) && !/^[A-Z_\d]+$/.test(m)) push('t', m);
      else push('', m);
    } else if (source[i] === '<' && opensTag(source, i, previous)) {
      push('p', (m = '<'));
      modes.push({ in: 'tag', closing: false, named: false });
    } else if ((m = at(OPERATOR, source, i))) {
      push('p', m);
      if (m === '{') modes.push({ in: 'js' });
      else if (m === '}') pop();
    } else push('', (m = source[i]));

    i += m.length;
  }
  return tokens;
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The snippet as the inside of a `<pre>`: a block per line, the lines with a `// ←` note marked as the ones to read. */
export function highlight(source: string): string {
  const lines: { html: string; note: boolean; text: string }[] = [{ html: '', note: false, text: '' }];
  for (const token of tokenize(source.trim())) {
    token.text.split('\n').forEach((part, n) => {
      if (n > 0) lines.push({ html: '', note: false, text: '' });
      const line = lines[lines.length - 1];
      line.text += part;
      if (token.kind === 'note') line.note = true;
      if (part) line.html += token.kind ? `<span class="tk-${token.kind}">${escape(part)}</span>` : escape(part);
    });
  }
  return lines
    .map(({ html, note, text }) => {
      // A wrapped line carries on under its own indent, two columns in.
      const indent = text.length - text.trimStart().length + 2;
      return `<span class="${note ? 'line bad' : 'line'}" style="--indent:${indent}ch">${html}\n</span>`;
    })
    .join('');
}
