/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { stepParts, type CascadeNode } from '../../shared/summary';

interface Bar {
  node: CascadeNode;
  depth: number;
  /** Where the bar starts and how wide it is, as a share of the commit's time. */
  x: number;
  w: number;
  self: number;
}

const ms = (value: number) => `${+value.toFixed(2)}ms`;

/**
 * Lays the tree out the way React DevTools' flame chart does: a row a level, each link as wide as its renders took
 * with their subtree, its children under it from the left. The rest of a parent's width is its own time.
 */
function layout(tree: CascadeNode[]): { bars: Bar[]; total: number; depth: number } {
  const total = tree.reduce((sum, node) => sum + (node.ms ?? 0), 0);
  const bars: Bar[] = [];
  let depth = 0;
  const place = (list: CascadeNode[], x: number, level: number) => {
    let at = x;
    // The slowest first, as DevTools puts them: the eye goes to the left.
    for (const node of [...list].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))) {
      const time = node.ms ?? 0;
      const w = total ? time / total : 0;
      const self = Math.max(0, time - node.children.reduce((sum, child) => sum + (child.ms ?? 0), 0));
      bars.push({ node, depth: level, x: at, w, self });
      depth = Math.max(depth, level + 1);
      place(node.children, at, level + 1);
      at += w;
    }
  };
  place(tree, 0, 0);
  return { bars, total, depth };
}

/** The picked commit's render time, spread over the components that took it; null when the build times nothing. */
export function Flame({ tree }: { tree: CascadeNode[] }): JSX.Element | null {
  if (!tree.some((node) => node.ms !== undefined)) return null;
  const { bars, total, depth } = layout(tree);
  if (!total) return null;
  // How hot a bar is goes by its own time, not its subtree's: that is the part the component itself can change.
  const hottest = Math.max(...bars.map((bar) => bar.self));
  return (
    <div class="tl-row flame">
      <span class="tl-row-label" title="Render time of this commit's components, each with its subtree; the width is the share of the commit">
        {ms(total)}
      </span>
      <div class="flame-chart" data-rpr="flame" style={`height:${depth * 18}px`}>
        {bars.map((bar, i) => {
          const why = stepParts(bar.node.step)
            .map((part) => (part.label ? `${part.label} ${part.text}` : part.text))
            .join(' · ');
          const title = `${bar.node.step.name}${why ? ` · ${why}` : ''}\n${ms(bar.node.ms ?? 0)} with its subtree, ${ms(bar.self)} its own${
            bar.node.n > 1 ? `\n${bar.node.n} renders` : ''
          }`;
          return (
            <div
              key={i}
              class="flame-bar"
              data-rpr="flame-bar"
              data-equal={bar.node.step.equal ? 'true' : undefined}
              data-name={bar.node.step.name}
              data-ms={bar.node.ms ?? 0}
              title={title}
              style={`left:${(bar.x * 100).toFixed(3)}%;width:max(2px, ${(bar.w * 100).toFixed(3)}%);top:${bar.depth * 18}px;--heat:${
                hottest ? (0.25 + (0.75 * bar.self) / hottest).toFixed(2) : 0.25
              }`}
            >
              <span class="flame-label">{`${bar.node.step.name}${bar.node.n > 1 ? ` ×${bar.node.n}` : ''} ${ms(bar.node.ms ?? 0)}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
