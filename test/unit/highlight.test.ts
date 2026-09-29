import { highlight, tokenize } from '../e2e/fixture-app/src/basics/highlight';

const kinds = (source: string) => tokenize(source).filter((t) => t.kind !== '' || t.text.trim());

describe('case page snippets', () => {
  it('tells tags, attributes and JSX text apart from code', () => {
    const tokens = kinds(`return <Item key={id} label="x">don't {count} items</Item>;`);
    const of = (text: string) => tokens.find((t) => t.text === text)?.kind;
    expect(of('return')).toBe('k');
    expect(of('Item')).toBe('t');
    expect(of('key')).toBe('a');
    expect(of('"x"')).toBe('s');
    // An apostrophe in JSX text does not open a string.
    expect(of("don't ")).toBe('');
    expect(of('count')).toBe('');
  });

  it('reads `<` after a value as a comparison, not a tag', () => {
    const tokens = kinds('const late = now < deadline && useState<string>();');
    expect(tokens.some((t) => t.kind === 'tag' || t.kind === 'a')).toBe(false);
    expect(tokens.find((t) => t.text === 'useState')?.kind).toBe('f');
  });

  it('marks the lines with a `// ←` note, in code and after a tag', () => {
    const html = highlight(`
const a = 1;   // ← here
return (
  <>
    <List items={items} />   // ← and here
  </>
);`);
    expect(html.match(/class="line bad"/g)).toHaveLength(2);
    expect(html).toContain('<span class="tk-a">items</span>');
    expect(html).toContain('&lt;');
  });
});
