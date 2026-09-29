import type { CSSProperties } from 'react';

/**
 * The panel's own crosshair (see `PickIcon` in src/ui/components/Controls.tsx): a circle drawn rather than typed,
 * so it sits dead center in a button whatever the font.
 */
const PickIcon = () => (
  <svg className="pd-pick-icon" viewBox="0 0 12 12" aria-hidden="true">
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

/**
 * The hero's flow, scripted rather than screenshotted, from the panel's own words and markup (Controls.tsx,
 * picker.ts, the real button labels and the crosshair icon) — not invented: Pick outlines Shell (the component
 * `basics/Contexts.tsx` actually renders every second), Rec turns to Stop while it flashes the way the real
 * highlight does (green, amber, red — see HIGHLIGHT_LEGEND), then the report settles on why. All CSS (`.pd-*` in
 * Demo.tsx), so it stays crisp and small and needs no video. `prefers-reduced-motion` gets the report's finished
 * frame instead, held still.
 */
export const PanelDemo = () => (
  <div className="pd-stage" aria-hidden="true">
    <div className="pd-layer pd-page-layer">
      <div className="pd-mockpage">
        <div className="pd-mock-shell">
          <div className="pd-pickbox">
            <div className="pd-picktag">Shell</div>
          </div>
          <p className="pd-mock-label">Shell</p>
          <ul className="pd-mock-rows">
            <li>
              signed in as <b>Anna</b>
            </li>
            <li>
              theme: <b>dark</b>
            </li>
          </ul>
        </div>
      </div>

      <div className="pd-dock">
        <div className="pd-dock-head">
          <Mark />
          Perf Recorder
        </div>
        <div className="pd-dock-rows">
          <div className="pd-dock-row pd-row-a">
            <span className="pd-b pd-rec-b pd-pulse-pick">● Rec</span>
            <span className="pd-b">↺ Page load</span>
            <span className="pd-b pd-area-b">
              <PickIcon /> Pick
            </span>
          </div>
          <div className="pd-dock-row pd-row-b">
            <span className="pd-b">✕ Cancel</span>
            <span className="pd-b pd-confirm-b">✓ Confirm</span>
          </div>
          <div className="pd-dock-row pd-row-c">
            <span className="pd-b pd-rec-b pd-pulse-rec">● Rec</span>
            <span className="pd-b">↺ Page load</span>
            <span className="pd-b pd-area-b">
              <PickIcon /> Shell
            </span>
          </div>
          <div className="pd-dock-row pd-row-d">
            <span className="pd-b pd-stop-b">■ Stop</span>
            <span className="pd-b pd-area-b">
              <PickIcon /> Shell
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
          <PickIcon /> Shell
        </span>
      </div>

      <div className="pd-stats">
        <div className="pd-stat">
          <b className="pd-num" style={{ '--target': 4 } as CSSProperties} />
          <span>commits</span>
        </div>
        <div className="pd-stat">
          <b className="pd-num" style={{ '--target': 56 } as CSSProperties} />
          <span>renders</span>
        </div>
        <div className="pd-stat pd-stat--warn">
          <b className="pd-num" style={{ '--target': 4 } as CSSProperties} />
          <span>wasted renders · 7%</span>
        </div>
        <div className="pd-stat">
          <b>3.5s</b>
          <span>recorded</span>
        </div>
      </div>

      <p className="pd-kicker">Main cause · wasted renders</p>
      <div className="pd-card pd-card--main">
        <div className="pd-card-top">
          <b>Shell</b>
          <span className="pd-chip">×4</span>
          <span className="pd-chip">4/hit</span>
          <span className="pd-warn-chip">4 for nothing</span>
          <span className="pd-chip">0.78ms/hit</span>
        </div>
        <div className="pd-loc">Contexts.tsx:218</div>
        <p className="pd-reason">
          ▾ 4× <span className="pd-tag">store</span> #0
          <span className="pd-indent">use › SyncExternalStore</span>
        </p>
      </div>

      <p className="pd-kicker">
        ▾ Other roots <span className="pd-chip">3</span>
      </p>

      <div className="pd-timeline">
        <p className="pd-kicker">
          ▾ Timeline <span className="pd-chip">4 commits</span>
        </p>
        <div className="pd-tl-row">
          <i className="pd-tl-dot" /> 4 core:timer setInterval @ react-perf-recorder/src/basics/Contexts.tsx
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
