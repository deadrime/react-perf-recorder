import type { CSSProperties } from 'react';

/**
 * The hero's report, scripted rather than screenshotted: Rec presses, the stats count up, the wasted-render row
 * flashes, then its cause line settles in — then it loops. All CSS (see `.pd-*` in Demo.tsx), so it stays crisp
 * and small and needs no video. `prefers-reduced-motion` gets the finished frame instead, held still.
 */
export const PanelDemo = () => (
  <div className="pd-panel pd-fade" aria-hidden="true">
    <div className="pd-head">
      <span>
        <svg className="mark" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="0.5" y="0.5" width="15" height="15" rx="4" />
          <path d="M2.5 9h2.5l1.5-4 2.5 7 1.5-3h3" fill="none" />
        </svg>
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
      <span className="pd-rec">
        <i className="pd-dot" /> Rec
      </span>
      <span className="pd-btn">⟲ Page load</span>
      <span className="pd-btn">⊕ Pick</span>
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
);
