import type { CSSProperties } from 'react';

/**
 * The panel's own crosshair (see `PickIcon` in src/ui/components/Controls.tsx): a circle drawn rather than typed,
 * so it sits dead center in a button whatever the font.
 */
const PickIcon = ({ className = 'pd-pick-icon' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="6" cy="6" r="3.5" />
    <path d="M6 0.5v3M6 8.5v3M0.5 6h3M8.5 6h3" />
  </svg>
);

const Mark = () => (
  <svg className="mark" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="0.5" y="0.5" width="15" height="15" rx="4" />
    <path d="M2.5 9h2.5l1.5-4 2.5 7 1.5-3h3" fill="none" />
  </svg>
);

/** A pointer, not typed as a glyph, so it lands the same in every font: the mouse the demo moves for the user. */
const Cursor = () => (
  <svg className="pd-cursor" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3 1.5 16.5 9.8 10.3 11l3.2 6.1-2.6 1.4L7.7 12.4 3 16.3z" />
  </svg>
);

const TREE = [
  { depth: 0, name: 'Whole app', loc: null, bold: true },
  { depth: 1, name: 'AppShell', loc: 'routes.tsx:15' },
  { depth: 2, name: 'BoardPage', loc: 'routes.tsx:19' },
  { depth: 3, name: 'BoardColumn', loc: 'BoardPage.tsx:44', row: 'pd-row-boardcolumn' },
  { depth: 4, name: 'IssueCard', loc: 'BoardColumn.tsx:81' },
  { depth: 5, name: 'Tooltip', loc: 'IssueCard.tsx:26', row: 'pd-row-tooltip' },
  { depth: 6, name: 'Avatar', loc: 'IssueCard.tsx:42' },
  { depth: 6, name: 'PriorityIcon', loc: 'IssueCard.tsx:46' },
  { depth: 6, name: 'LabelChips', loc: 'IssueCard.tsx:47' },
] as const;

/**
 * The hero's flow, scripted rather than screenshotted, from the panel's own words and markup and from Eugene's own
 * screenshots of it running on Orbit (the benchmark's demo app: test/eval-large) — not invented: the real tree
 * (routes.tsx / BoardPage.tsx / BoardColumn.tsx / IssueCard.tsx, exact lines), picking a child then its parent,
 * the compact bar a recording actually shows while it runs, then the report on why. All CSS (`.pd-*` in Demo.tsx),
 * so it stays crisp and small and needs no video. `prefers-reduced-motion` gets the report's finished frame
 * instead, held still.
 */
export const PanelDemo = () => (
  <div className="pd-stage" aria-hidden="true">
    <div className="pd-layer pd-page-layer">
      <div className="pd-orbit">
        <div className="pd-orbit-col">
          <div className="pd-orbit-head">
            <i className="pd-status-dot" />
            <b>Todo</b>
            <span className="pd-muted">22</span>
            <span className="pd-muted pd-pts">70 pts</span>
          </div>
          <div className="pd-orbit-card">
            <div className="pd-card-top">
              <span className="pd-muted">WEB-83</span>
              <span className="pd-avatar">BC</span>
            </div>
            <p className="pd-card-title">Track usage of billing page in analytics</p>
            <div className="pd-card-bottom">
              <span className="pd-chip-mini">Performance</span>
              <span className="pd-chip-mini">Feature</span>
            </div>
          </div>
          <div className="pd-orbit-card-wrap">
            <div className="pd-orbit-card">
              <div className="pd-card-top">
                <span className="pd-muted">WEB-70</span>
                <span className="pd-avatar">LV</span>
              </div>
              <p className="pd-card-title">Flaky test around date picker</p>
              <div className="pd-card-bottom">
                <span className="pd-chip-mini">Design</span>
                <span className="pd-chip-mini pd-chip-mini--warn">Due tomorrow</span>
                <span className="pd-muted">💬 6</span>
              </div>
            </div>
            <div className="pd-pickbox pd-pickbox--child">
              <div className="pd-picktag">Tooltip</div>
            </div>
          </div>
          <div className="pd-pickbox pd-pickbox--parent">
            <div className="pd-picktag">BoardColumn</div>
          </div>
        </div>
      </div>

      <Cursor />

      <div className="pd-dock">
        <div className="pd-dock-mode pd-mode-idle">
          <div className="pd-dock-head">
            <Mark />
            Perf Recorder
          </div>
          <div className="pd-dock-buttons">
            <span className="pd-b pd-rec-b pd-pulse-pick">● Rec</span>
            <span className="pd-b">↺ Page load</span>
            <span className="pd-b pd-area-b pd-pulse-none">
              <PickIcon /> Pick
            </span>
          </div>
        </div>

        <div className="pd-dock-mode pd-mode-tree">
          <div className="pd-tree-top">
            <PickIcon className="pd-pick-icon-lg" />
            <b className="pd-tree-area">
              <span className="pd-tree-area-child">Tooltip</span>
              <span className="pd-tree-area-parent">BoardColumn</span>
            </b>
            <i className="pd-icon-btn">⧉</i>
            <i className="pd-icon-btn">×</i>
          </div>
          <div className="pd-tree-actions">
            <span className="pd-b">✕ Cancel</span>
            <span className="pd-b pd-confirm-b">✓ Confirm</span>
          </div>
          <div className="pd-tree-filters">
            <label>
              <input type="checkbox" disabled /> packages
            </label>
            <label>
              <input type="checkbox" disabled /> providers
            </label>
          </div>
          <div className="pd-tree-rows">
            {TREE.map((row) => (
              <div key={row.name} className={`pd-tree-row pd-depth-${row.depth} ${'row' in row ? row.row : ''}`}>
                <span className={'bold' in row && row.bold ? 'pd-tree-bold' : undefined}>
                  {row.depth < 6 ? '▾ ' : ''}
                  {row.name}
                </span>
                {row.loc ? <span className="pd-tree-loc">{row.loc}</span> : null}
              </div>
            ))}
          </div>
          <p className="pd-tree-hint">Click an element or a row to take it as the area.</p>
          <p className="pd-tree-keys">↑↓ move · →← in and out · Enter confirm · Esc cancel</p>
        </div>

        <div className="pd-dock-mode pd-mode-record">
          <div className="pd-rec-top">
            <b className="pd-rec-time">
              <span className="pd-num" style={{ '--target': 14 } as CSSProperties} />s
            </b>
            <span className="pd-muted">
              · <span className="pd-num" style={{ '--target': 23 } as CSSProperties} />
              /23 commits in area
            </span>
            <label className="pd-mini-toggle">
              <input type="checkbox" disabled /> highlights
            </label>
            <i className="pd-collapse">–</i>
          </div>
          <div className="pd-rec-list">
            <div className="pd-rec-row pd-rec-row-1">
              <b>IssueCard</b>
              <span className="pd-chip">×5</span>
              <span className="pd-chip">3/hit</span>
              <span className="pd-tag">store</span> usePresenceStore
            </div>
            <div className="pd-rec-row pd-rec-row-2">
              <b>BoardColumn</b>
              <span className="pd-chip">×2</span>
              <span className="pd-chip">7/hit</span>
              <span className="pd-tag">store</span> store
            </div>
          </div>
          <div className="pd-rec-bottom">
            <span className="pd-b pd-stop-b">■ Stop</span>
            <span className="pd-b pd-area-b">
              <PickIcon /> BoardColumn
            </span>
          </div>
        </div>
      </div>
    </div>

    <div className="pd-layer pd-report-layer">
      <div className="pd-head">
        <span>
          <Mark />
          Perf Recorder
        </span>
        <span className="pd-opts">
          <label>
            <input type="checkbox" disabled /> fast
          </label>
          <label>
            <input type="checkbox" disabled /> highlights
          </label>
          <i className="pd-collapse">–</i>
        </span>
      </div>

      <div className="pd-buttons">
        <span className="pd-b pd-rec-b">● Rec</span>
        <span className="pd-b">↺ Page load</span>
        <span className="pd-b pd-area-b">
          <PickIcon /> BoardColumn
        </span>
      </div>

      <div className="pd-stats">
        <div className="pd-stat">
          <b className="pd-num" style={{ '--target': 23 } as CSSProperties} />
          <span>commits</span>
        </div>
        <div className="pd-stat">
          <b className="pd-num" style={{ '--target': 96 } as CSSProperties} />
          <span>renders</span>
        </div>
        <div className="pd-stat pd-stat--warn">
          <b className="pd-num" style={{ '--target': 7 } as CSSProperties} />
          <span>wasted renders · 7%</span>
        </div>
        <div className="pd-stat">
          <b>14.1s</b>
          <span>recorded</span>
        </div>
      </div>

      <p className="pd-kicker">Main cause · wasted renders</p>
      <div className="pd-card pd-card--main">
        <div className="pd-card-top">
          <b>BoardColumn</b>
          <span className="pd-chip">×2</span>
          <span className="pd-chip">7/hit</span>
          <span className="pd-warn-chip">2 for nothing</span>
          <span className="pd-chip">1.05ms/hit</span>
        </div>
        <div className="pd-loc">BoardPage.tsx:44</div>
        <p className="pd-reason">
          ▾ 2× <span className="pd-tag">store</span> #0
          <span className="pd-indent">use › selectColumnIssues</span>
        </p>
      </div>

      <p className="pd-kicker pd-reveal-otherroots">
        ▾ Other roots <span className="pd-chip">1</span>
      </p>

      <div className="pd-timeline">
        <p className="pd-kicker">
          ▾ Timeline <span className="pd-chip">23 commits</span>
        </p>
        <div className="pd-tl-row">
          <i className="pd-tl-dot" /> 7 core:input drop @ react-perf-recorder/test/eval-large/app/src/features/board/BoardColumn.tsx
        </div>
      </div>

      <div className="pd-zoom">
        <span>−</span>
        <span>+</span>
        <span>fit</span>
        <label>
          <input type="checkbox" disabled /> changed the DOM
        </label>
      </div>
    </div>
  </div>
);
