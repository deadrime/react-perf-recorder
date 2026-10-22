import type { Engine, Owner } from '../core/engine';
import { currentOf, isHost, nearestHosts, type Fiber } from '../core/fiber';
import { safeUrl } from '../shared/url';

function elementText(el: Element): string {
  const attrs = ['id', 'data-testid', 'role', 'aria-label', 'name']
    .map((name) => [name, el.getAttribute(name)] as const)
    .filter(([, value]) => value)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
  const classes = [...el.classList].slice(0, 2).join(' ');
  const full = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const text = full.length > 40 ? `${full.slice(0, 40)}…` : full;
  return `<${el.tagName.toLowerCase()}${attrs}${classes ? ` class="${classes}"` : ''}>${text ? ` "${text}"` : ''}`;
}

/** The page as the app sees it: the recorder's own flags are not part of the address anyone should reproduce. */
function pageUrl(): string {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('rpr')) url.searchParams.delete(key);
  // Copied into a chat: a token in the address must not go with it.
  return safeUrl(url.href);
}

/** A selector that matches the element alone on the page now: steps up from it until one does, or an id anchors it. */
function selectorOf(el: Element): string {
  const steps: string[] = [];
  const plain = /^-?[A-Za-z_][\w-]*$/;
  for (let node: Element | null = el; node && node !== document.documentElement && steps.length < 12; node = node.parentElement) {
    if (node.id && plain.test(node.id)) {
      steps.unshift(`#${node.id}`);
      break;
    }
    // Only names a selector takes as they are: `md:flex` or `w-1/2` would need escaping to mean anything.
    const classes = [...node.classList].filter((c) => plain.test(c)).slice(0, 2);
    const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === node!.localName) : [];
    const nth = same.length > 1 ? `:nth-of-type(${same.indexOf(node) + 1})` : '';
    steps.unshift(`${node.localName}${classes.map((c) => `.${c}`).join('')}${nth}`);
    if (unique(steps.join(' > '))) break;
  }
  return steps.join(' > ');
}

function unique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** The app's component whose render wrote the element: its JSX owner, past the package components between. */
function writerOf(engine: Engine, fiber: Fiber): Owner | null {
  for (let f = fiber._debugOwner; f && typeof f.tag === 'number'; f = f._debugOwner) {
    const owner = engine.ownerOf(currentOf(f));
    if (!owner.library && !owner.wrapper && !owner.provider) return owner;
  }
  return null;
}

/**
 * An element for an assistant to change: its tag and text, the line of its JSX and the component that wrote it, the
 * component path down to it, and a selector. The scope is its component's: an element renders only with it.
 */
function describeElement(engine: Engine, fiber: Fiber): string {
  const el = fiber.stateNode as Element;
  const self = engine.ownerOf(fiber);
  const path = engine
    .ownersOfFiber(fiber)
    .filter((o) => !o.element && !o.wrapper && !o.library && !o.provider)
    .map((o) => o.name)
    .reverse();
  // Without owner stacks (a production build) the component it sits in is the best guess at who wrote it.
  const writer = writerOf(engine, fiber)?.name ?? path.at(-1);
  const lines = [
    `React element on ${pageUrl()}`,
    `Element: ${elementText(el)}`,
    writer || self.source ? `Written in: ${[writer, self.source].filter(Boolean).join(' — ')}` : null,
    `Path: ${[...path.slice(-7), self.name].join(' › ')}`,
    `Selector: ${selectorOf(el)}`,
    path.length ? `react-perf-recorder scope: ${JSON.stringify({ names: path.slice(-4) })}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Plain text that tells an assistant which part of the page is meant: component and file, the path above it,
 * the DOM it renders, what is inside, and the scope to pass to the recorder's scripts.
 */
export function describeArea(engine: Engine, fiber: Fiber): string {
  if (isHost(fiber) && fiber.stateNode instanceof Element) return describeElement(engine, fiber);
  const owners = engine.ownersOfFiber(fiber).filter((o) => !o.wrapper && !o.library && !o.provider);
  const self = engine.ownerOf(fiber);
  const path = owners.map((o) => o.name).reverse();
  const hosts = nearestHosts(fiber, 50);
  const counts = new Map<string, number>();
  for (const child of engine.childOwners(fiber, { library: false, providers: false })) counts.set(child.name, (counts.get(child.name) ?? 0) + 1);
  const inside = [...counts]
    .slice(0, 10)
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ');
  const lines = [
    `React area on ${pageUrl()}`,
    `Component: ${self.name}${self.source ? ` — ${self.source}` : ''}`,
    `Path: ${path.slice(-8).join(' › ')}`,
    hosts.length ? `Element: ${elementText(hosts[0])}${hosts.length > 1 ? ` (+${hosts.length - 1} more top-level elements)` : ''}` : null,
    inside ? `Inside: ${inside}` : null,
    `react-perf-recorder scope: ${JSON.stringify({ names: path.slice(-4) })}`,
  ];
  return lines.filter(Boolean).join('\n');
}
