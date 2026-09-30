/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { APP, CPU_CAVEAT, fmtMs, type CpuSummary } from '../../shared/cpu';

const COLOURS = ['var(--accent)', 'var(--cause-query)', 'var(--cause-timer)', 'var(--cause-input)', 'var(--cause-effect)', 'var(--cause-navigation)'];
const pct = (ms: number, of: number) => (of > 0 ? Math.round((ms / of) * 100) : 0);

/** Where a function is: the app's `file:line`, or the package it belongs to. */
const Where = ({ site, pkg }: { site?: string; pkg?: string }) =>
  site ? <code class="cpu-where">{site}</code> : pkg ? <span class="cpu-where">{pkg}</span> : null;

/**
 * Where the CPU went while recording: busy time split by package, the renders that took it and what inside them,
 * the hottest functions, and the work that ran outside renders. Closed unless the page was busy.
 */
export function Cpu({ cpu, open }: { cpu: CpuSummary; open: boolean }): JSX.Element {
  const busy = cpu.busyMs;
  // The recorder's own time is its own segment: it is overhead of the measurement, not of the page.
  const shown = cpu.packages.slice(0, COLOURS.length);
  const rest = busy - cpu.recorderMs - (cpu.externalMs ?? 0) - cpu.gcMs - shown.reduce((sum, p) => sum + p.selfMs, 0);
  const segments = [
    ...shown.map((p, i) => ({ key: p.name, ms: p.selfMs, colour: COLOURS[i], label: p.name === APP ? 'your code' : p.name })),
    ...(rest > 0.5 ? [{ key: 'rest', ms: rest, colour: 'var(--density)', label: 'other' }] : []),
    ...(cpu.gcMs ? [{ key: 'gc', ms: cpu.gcMs, colour: 'var(--flash-wasted)', label: 'GC' }] : []),
    ...(cpu.recorderMs ? [{ key: 'recorder', ms: cpu.recorderMs, colour: 'var(--mark)', label: 'recorder' }] : []),
    ...(cpu.externalMs ? [{ key: 'driver', ms: cpu.externalMs, colour: 'var(--mark)', label: 'test driver' }] : []),
  ];
  const appFns = cpu.functions.filter((f) => !f.package).slice(0, 6);
  const libFns = cpu.functions.filter((f) => f.package).slice(0, 4);
  return (
    <details class="fold" data-fold="cpu" data-rpr="cpu" open={open}>
      <summary>
        <span class="fold-title">CPU</span>
        <span class="fold-note">{`${fmtMs(busy)} busy · ${pct(busy, cpu.wallMs)}%`}</span>
      </summary>
      <div class="fold-body">
        <div class="cpu-bar" role="img" aria-label="Busy time by package">
          {segments.map((s) => (
            <i key={s.key} style={`flex:${Math.max(s.ms, busy / 200)};background:${s.colour}`} title={`${s.label} ${fmtMs(s.ms)}`} />
          ))}
        </div>
        <div class="cpu-legend">
          {segments.map((s) => (
            <span class="cpu-key" key={s.key}>
              <i class="swatch" style={`background:${s.colour}`} />
              <span>{s.label}</span>
              <span class="muted">{`${pct(s.ms, busy)}%`}</span>
            </span>
          ))}
        </div>

        {cpu.renders.length ? (
          <>
            <h5 class="cpu-head">Slowest renders</h5>
            {cpu.renders.slice(0, 5).map((r) => (
              <div class="cpu-render" key={`${r.name}${r.site ?? r.package ?? ''}`} data-rpr="cpu-render">
                <div class="cpu-row">
                  <span class="who">{r.name}</span>
                  <span class="badge" data-tone="count">
                    {fmtMs(r.ms)}
                  </span>
                  <Where site={r.site} pkg={r.package} />
                </div>
                {r.hot
                  .filter((h) => h.ms >= r.ms * 0.1)
                  .slice(0, 3)
                  .map((h) => (
                    <div class="cpu-hot" key={`${h.name}${h.site ?? h.package ?? ''}`}>
                      <span class="muted">{`${pct(h.ms, r.ms)}%`}</span>
                      <span class="cpu-name">{h.name}</span>
                      <Where site={h.site} pkg={h.package} />
                    </div>
                  ))}
              </div>
            ))}
          </>
        ) : null}

        {appFns.length || libFns.length ? (
          <>
            <h5 class="cpu-head">Hottest functions</h5>
            {[...appFns, ...libFns].map((f) => (
              <div class="cpu-row" key={`${f.name}${f.site ?? f.package ?? ''}`} data-rpr="cpu-fn">
                <span class="badge" data-tone="count" title={`${fmtMs(f.totalMs)} with what it called`}>
                  {fmtMs(f.selfMs)}
                </span>
                <span class="cpu-name">{f.name}</span>
                <Where site={f.site} pkg={f.package} />
              </div>
            ))}
          </>
        ) : null}

        {cpu.entries.length ? (
          <>
            <h5 class="cpu-head">Outside renders</h5>
            {cpu.entries.slice(0, 5).map((e) => (
              <div class="cpu-row" key={`${e.name}${e.site ?? e.package ?? ''}`} data-rpr="cpu-entry">
                <span class="badge">{fmtMs(e.ms)}</span>
                {e.name ? <span class="cpu-name">{e.name}</span> : null}
                <Where site={e.site} pkg={e.package} />
              </div>
            ))}
          </>
        ) : null}

        {cpu.warnings?.map((w) => (
          <p class="muted cpu-note" key={w}>
            {w}
          </p>
        ))}
        <p class="muted cpu-note" title={CPU_CAVEAT}>
          {`sampled every ${cpu.intervalMs}ms · ${cpu.samples} samples · dev build: React and CSS-in-JS read high`}
        </p>
      </div>
    </details>
  );
}
