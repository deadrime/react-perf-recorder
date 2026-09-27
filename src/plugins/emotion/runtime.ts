import { fiberFromNode, isComposite, isLibraryFiber, nameOf } from '../../core/fiber';
import { definePlugin } from '../../runtime';

/** One class emotion inserted: its label (`css-1x2y3z-Tooltip` → `Tooltip`) and the declarations of its own rule. */
interface ClassInfo {
  label: string | null;
  decls: Array<[string, string]>;
  rules: number;
}

/** A group of new classes past this many is a leak whatever the values: emotion never removes a rule it inserted. */
const MAX_VALUES = 50;

/** `width:#px;left:#px`: the same declarations with the numbers taken out, how unlabeled classes are grouped. */
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

/** The app's component that renders an element with this class: emotion's own wrappers and other packages' are passed. */
function ownerOfClass(name: string): string | null {
  const el = document.querySelector(`.${CSS.escape(name)}`);
  for (let f = el ? fiberFromNode(el) : null; f; f = f.return) {
    if (isComposite(f) && !isLibraryFiber(f)) {
      const component = nameOf(f);
      if (component && !/^(Anonymous|ForwardRef|Memo|EmotionCssPropInternal|Styled.*)$/.test(component)) return component;
    }
  }
  return null;
}

function eachRule(rules: CSSRuleList, visit: (rule: CSSRule) => void) {
  for (const rule of Array.from(rules)) {
    visit(rule);
    // @media and @supports hold rules of their own.
    const inner = (rule as CSSGroupingRule).cssRules;
    if (inner?.length) eachRule(inner, visit);
  }
}

/** Every emotion class in the document now, from the `<style data-emotion>` tags each cache writes into. */
export function collect(): Map<string, ClassInfo> | null {
  const tags = document.querySelectorAll<HTMLStyleElement>('style[data-emotion]');
  if (!tags.length) return null;
  const classes = new Map<string, ClassInfo>();
  for (const tag of Array.from(tags)) {
    const key = (tag.getAttribute('data-emotion') ?? '').split(' ')[0];
    // `css-global`: Global styles replace their own rules, they do not pile up.
    if (!key || key.endsWith('-global')) continue;
    const re = new RegExp(`\\.${key.replace(/[^\w-]/g, '')}-([a-zA-Z0-9]+)(?:-([\\w-]+))?`);
    let rules: CSSRuleList;
    try {
      rules = tag.sheet?.cssRules as CSSRuleList;
    } catch {
      continue;
    }
    if (!rules) continue;
    eachRule(rules, (rule) => {
      const style = (rule as CSSStyleRule).style;
      const selector = (rule as CSSStyleRule).selectorText;
      if (!selector || !style) return;
      const m = re.exec(selector);
      if (!m) return;
      const name = m[0].slice(1);
      let info = classes.get(name);
      if (!info) classes.set(name, (info = { label: m[2] ?? null, decls: [], rules: 0 }));
      info.rules++;
      // The class's own rule: `&:hover` and nested selectors add rules, not what the class is.
      // cssText keeps shorthands as written: iterating `style` spells `background` out into five longhands.
      if (selector.trim() === m[0] && !info.decls.length) info.decls = declsOf(style.cssText);
    });
  }
  return classes;
}

interface Group {
  label: string | null;
  names: string[];
  shape: string;
  classes: number;
  rules: number;
  values: Map<string, Set<string>>;
  examples: string[];
}

export default definePlugin(() => {
  let before: Map<string, ClassInfo> | null = null;
  let startedAt = 0;

  return {
    name: 'emotion',
    start(session) {
      before = collect();
      startedAt = session.now();
    },
    stop(session) {
      const after = collect();
      if (!after && !before) return { version: 1, active: false };
      const groups = new Map<string, Group>();
      let classes = 0;
      let rules = 0;
      for (const [name, info] of after ?? []) {
        if (before?.has(name)) continue;
        classes++;
        rules += info.rules;
        const shape = shapeOf(info.decls);
        const key = info.label ? `label:${info.label}` : `shape:${shape}`;
        let group = groups.get(key);
        if (!group) groups.set(key, (group = { label: info.label, names: [], shape, classes: 0, rules: 0, values: new Map(), examples: [] }));
        group.classes++;
        group.rules += info.rules;
        if (group.examples.length < 3) group.examples.push(name);
        group.names.push(name);
        for (const [prop, value] of info.decls) {
          let values = group.values.get(prop);
          if (!values) group.values.set(prop, (values = new Set()));
          if (values.size < MAX_VALUES) values.add(value);
        }
      }
      const minutes = Math.max(session.now() - startedAt, 1) / 60_000;
      const list = [...groups.values()]
        .sort((a, b) => b.classes - a.classes)
        .map((g) => {
          // What tells the classes of one group apart: the values the component interpolates into its styles.
          const varying = [...g.values].filter(([, values]) => values.size > 1).map(([prop, values]) => ({ prop, values: [...values].slice(0, 5) }));
          // Old classes are on no element any more; the newest ones are, and their element knows its component.
          let component: string | null = null;
          for (let i = g.names.length - 1; i >= Math.max(0, g.names.length - 5) && !component; i--) component = ownerOfClass(g.names[i]);
          return {
            label: g.label,
            ...(component ? { component } : {}),
            classes: g.classes,
            rules: g.rules,
            ...(varying.length ? { varying } : {}),
            ...(g.label ? {} : { shape: g.shape }),
            examples: g.examples,
          };
        });
      const name = (g: (typeof list)[number]) => g.label ?? g.component ?? (g.shape || 'unlabeled');
      const highlights = classes
        ? [
            `new classes: ${classes} (${rules} rules, ${Math.round(classes / minutes)}/min)`,
            ...list.slice(0, 2).map((g) => `${name(g)}: +${g.classes}${g.varying ? `, varying ${g.varying.map((v) => v.prop).join(', ')}` : ''}`),
          ]
        : ['no new classes during the recording'];
      return {
        version: 1,
        active: true,
        highlights,
        metrics: {
          'classes.new': { value: classes, kind: 'count' as const },
          'rules.new': { value: rules, kind: 'count' as const },
          'classes.total': { value: after?.size ?? 0, kind: 'gauge' as const },
        },
        data: { classesBefore: before?.size ?? 0, classesAfter: after?.size ?? 0, groups: list.slice(0, 30) },
      };
    },
  };
});
