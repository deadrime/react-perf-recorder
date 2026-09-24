import type { Engine } from '../core/engine';
import { nearestHosts, type Fiber } from '../core/fiber';
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

/**
 * Plain text that tells an assistant which part of the page is meant: component and file, the path above it,
 * the DOM it renders, what is inside, and the scope to pass to the recorder's scripts.
 */
export function describeArea(engine: Engine, fiber: Fiber): string {
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
