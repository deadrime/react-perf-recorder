import type { StyleGroup } from '../shared/schema';
import { fiberFromNode, isComposite, isLibraryFiber, nameOf } from './fiber';

/** Past this many values of one property the group is a leak whatever they are. */
const MAX_VALUES = 50;
const MAX_GROUPS = 30;

/** `width:#px;left:#px`: the declarations with the numbers taken out, which is how rules of one kind are grouped. */
export const shapeOf = (decls: Array<[string, string]>) =>
  decls
    .map(
      ([prop, value]) =>
        `${prop}:${value
          .replace(/url\([^)]*\)/g, 'url()')
          .replace(/#[0-9a-f]{3,8}\b/gi, '#hex')
          .replace(/-?\d*\.?\d+/g, '#')}`
    )
    .join(';')
    .slice(0, 120);

/** `a: 1; b: url("x;y")` → pairs; a `;` inside quotes or brackets is part of the value. */
export function declsOf(cssText: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const push = (part: string) => {
    const at = part.indexOf(':');
    if (at > 0 && part.slice(at + 1).trim()) out.push([part.slice(0, at).trim(), part.slice(at + 1).trim()]);
  };
  for (let i = 0; i < cssText.length; i++) {
    const c = cssText[i];
    if (quote) {
      if (c === quote && cssText[i - 1] !== '\\') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth <= 0) {
      push(cssText.slice(start, i));
      start = i + 1;
    }
  }
  push(cssText.slice(start));
  return out;
}

interface StyleRuleInfo {
  text: string;
  selector: string;
  cssText: string;
  /** What wrote the sheet: `style[data-emotion]`, `style[data-styled]`, `style#_goober`, `link`, `adopted`. */
  source: string;
}

function sourceOf(sheet: CSSStyleSheet, adopted: boolean, owners: Map<StyleSheet, Element>): string {
  if (adopted) return 'adopted';
  // Asked of the elements too: a DOM that leaves ownerNode unset still knows each element's sheet.
  const node = (sheet.ownerNode as Element | null) ?? owners.get(sheet);
  if (!node) return 'unknown';
  const tag = node.tagName.toLowerCase();
  if (node.id) return `${tag}#${node.id}`;
  const data = Array.from(node.attributes ?? []).find((a) => a.name.startsWith('data-'));
  return data ? `${tag}[${data.name}]` : tag;
}

function eachStyleRule(rules: CSSRuleList, visit: (rule: CSSStyleRule) => void) {
  for (const rule of Array.from(rules)) {
    if ((rule as CSSStyleRule).selectorText !== undefined) visit(rule as CSSStyleRule);
    // @media and @supports hold rules of their own.
    const inner = (rule as CSSGroupingRule).cssRules;
    if (inner?.length) eachStyleRule(inner, visit);
  }
}

/** Every style rule in the document's sheets now; a sheet of another origin keeps its rules to itself. */
function readRules(): StyleRuleInfo[] {
  const out: StyleRuleInfo[] = [];
  const adopted = (document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [];
  const sheets: Array<[CSSStyleSheet, boolean]> = [
    ...Array.from(document.styleSheets).map((s) => [s, false] as [CSSStyleSheet, boolean]),
    ...adopted.map((s) => [s, true] as [CSSStyleSheet, boolean]),
  ];
  const owners = new Map<StyleSheet, Element>();
  for (const el of Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel~="stylesheet"]')))
    if (el.sheet) owners.set(el.sheet, el);
  for (const [sheet, isAdopted] of sheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const source = sourceOf(sheet, isAdopted, owners);
    eachStyleRule(rules, (rule) => out.push({ text: rule.cssText, selector: rule.selectorText, cssText: rule.style?.cssText ?? '', source }));
  }
  return out;
}

const WRAPPERS = /^(Anonymous|ForwardRef|Memo|EmotionCssPropInternal|Styled.*|styled\..*)$/;

/** The app's component that renders an element with this class; CSS-in-JS wrappers and packages' components are passed. */
function ownerOfClass(name: string): string | null {
  const el = document.getElementsByClassName(name)[0];
  for (let f = el ? fiberFromNode(el) : null; f; f = f.return) {
    if (isComposite(f) && !isLibraryFiber(f)) {
      const component = nameOf(f);
      if (component && !WRAPPERS.test(component)) return component;
    }
  }
  return null;
}

const CLASS = /\.(-?[_a-zA-Z][\w-]*)/;

interface Group {
  source: string;
  shape: string;
  rules: number;
  classes: string[];
  values: Map<string, Set<string>>;
}

/**
 * Rules added to the page's stylesheets during a recording, whichever library wrote them: CSS-in-JS never removes a
 * rule it inserted, so a value put into styles grows the sheet for as long as the page is open.
 */
export class StyleWatcher {
  /** The rules there at the start, by text, with how many times each appears. */
  private before = new Map<string, number>();

  start() {
    this.before.clear();
    for (const rule of readRules()) this.before.set(rule.text, (this.before.get(rule.text) ?? 0) + 1);
  }

  stop(): StyleGroup[] {
    const left = new Map(this.before);
    const groups = new Map<string, Group>();
    for (const rule of readRules()) {
      const seen = left.get(rule.text);
      if (seen) {
        left.set(rule.text, seen - 1);
        continue;
      }
      const decls = declsOf(rule.cssText);
      const shape = shapeOf(decls);
      const key = `${rule.source}\u0000${shape}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { source: rule.source, shape, rules: 0, classes: [], values: new Map() }));
      group.rules++;
      const cls = CLASS.exec(rule.selector)?.[1];
      if (cls && group.classes[group.classes.length - 1] !== cls) group.classes.push(cls);
      for (const [prop, value] of decls) {
        let values = group.values.get(prop);
        if (!values) group.values.set(prop, (values = new Set()));
        if (values.size < MAX_VALUES) values.add(value);
      }
    }
    this.before.clear();
    return [...groups.values()]
      .sort((a, b) => b.rules - a.rules)
      .slice(0, MAX_GROUPS)
      .map((g) => {
        // The oldest classes are on no element any more; the newest are, and their element knows its component.
        let component: string | null = null;
        for (let i = g.classes.length - 1; i >= Math.max(0, g.classes.length - 5) && !component; i--) component = ownerOfClass(g.classes[i]);
        // What tells the rules of one group apart: the values the component puts into its styles.
        const varying = [...g.values].filter(([, values]) => values.size > 1).map(([prop, values]) => ({ prop, values: [...values].slice(0, 5) }));
        return {
          ...(component ? { component } : {}),
          source: g.source,
          rules: g.rules,
          classes: new Set(g.classes).size,
          ...(varying.length ? { varying } : {}),
          shape: g.shape,
          examples: g.classes.slice(-3),
        };
      });
  }
}
