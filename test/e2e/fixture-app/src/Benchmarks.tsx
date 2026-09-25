import results from '../../../../docs/benchmarks.json';

// The benchmark page's charts, from what test/eval-plugin/summarize.mjs wrote; the markdown carries the same as tables.
type Arm = (typeof results)['with'];

const usd = (x: number) => `$${x.toFixed(2)}`;
const times = (a: number, b: number) => `${(a / b).toFixed(1)}×`;

export const BENCH_STYLES = `
.bench { margin: 18px 0 8px; }
.bench .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 22px; }
.bench .stat { padding: 14px 16px; border: 1px solid #3a3a44; border-radius: 12px;
  background: linear-gradient(160deg, rgba(10,132,255,.14), rgba(10,132,255,0) 70%), #1b1b21; }
.bench .stat b { display: block; font-size: 30px; line-height: 1.1; color: #fff; font-variant-numeric: tabular-nums; }
.bench .stat b small { font-size: 16px; color: #8e8e99; font-weight: 500; }
.bench .stat span { display: block; margin-top: 6px; font-size: 13px; line-height: 1.4; color: #b9b9c2; }
.bench .legend { display: flex; gap: 16px; margin: 0 0 10px; font-size: 13px; color: #b9b9c2; }
.bench .legend i, .bench .bar i { display: inline-block; border-radius: 3px; }
.bench .legend i { width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px; }
.bench .with { background: #0a84ff; }
.bench .without { background: #5d5d6a; }
.bench .charts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1000px) { .bench .charts { grid-template-columns: 1fr; } }
.bench .chart { padding: 14px 16px; border: 1px solid #3a3a44; border-radius: 12px; background: #1b1b21; }
.bench .chart h4 { margin: 0 0 12px; font-size: 14px; color: #fff; font-weight: 600; }
.bench .note { margin: -6px 0 12px; font-size: 12px; color: #8e8e99; }
.bench .row { margin-bottom: 12px; }
.bench .row:last-child { margin-bottom: 0; }
.bench .row code { font-size: 12px; }
.bench .row em { display: block; font-size: 12px; color: #8e8e99; font-style: normal; }
.bench .bar { display: grid; grid-template-columns: minmax(0, 1fr) 62px; align-items: center; gap: 8px; margin-top: 4px; }
.bench .bar i { height: 10px; min-width: 2px; }
.bench .bar span { font-size: 12px; color: #cfcfd6; text-align: right; font-variant-numeric: tabular-nums; }
.bench .runs { display: flex; gap: 4px; margin-top: 4px; align-items: center; font-size: 12px; color: #8e8e99; }
.bench .runs .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid; box-sizing: border-box; }
.bench .runs .dot.with { border-color: #0a84ff; background: transparent; }
.bench .runs .dot.without { border-color: #5d5d6a; background: transparent; }
.bench .runs .dot.ok.with { background: #0a84ff; }
.bench .runs .dot.ok.without { background: #5d5d6a; }
.bench .runs .gap { width: 10px; }
`;

const Stat = ({ value, unit, text }: { value: string; unit?: string; text: string }) => (
  <div className="stat">
    <b>
      {value}
      {unit && <small> {unit}</small>}
    </b>
    <span>{text}</span>
  </div>
);

const Bars = ({ title, value, format }: { title: string; value: (arm: Arm) => number; format: (x: number) => string }) => {
  const max = Math.max(...results.cases.flatMap((c) => [value(c.with), value(c.without)]));
  return (
    <div className="chart">
      <h4>{title}</h4>
      {results.cases.map((c) => (
        <div className="row" key={c.name}>
          <code>{c.name}</code>
          <em>{c.input === 'recording' ? 'with the person’s recording' : 'from a complaint'}</em>
          {(['with', 'without'] as const).map((side) => (
            <div className="bar" key={side}>
              <i className={side} style={{ width: `${(value(c[side]) / max) * 100}%` }} />
              <span>{format(value(c[side]))}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const Fixed = () => (
  <div className="chart">
    <h4>Fixed at the cause, run by run</h4>
    <p className="note">A filled dot is a run that fixed it; hollow, one that did not.</p>
    {results.cases.map((c) => (
      <div className="row" key={c.name}>
        <code>{c.name}</code>
        <div className="runs">
          {(['with', 'without'] as const).map((side) => (
            <span key={side} style={{ display: 'contents' }}>
              {Array.from({ length: c[side].runs }, (_, i) => (
                <span key={i} className={`dot ${side}${i < c[side].solved ? ' ok' : ''}`} />
              ))}
              {side === 'with' && <span className="gap" />}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const BenchmarkCharts = () => {
  const { with: w, without: wo } = results;
  return (
    <div className="bench" data-testid="benchmarks">
      <div className="stats">
        <Stat value={`${w.solved}/${w.runs}`} unit={`vs ${wo.solved}/${wo.runs}`} text="runs fixed at the cause, with the recorder and without" />
        <Stat value={times(wo.cost, w.cost)} unit="cheaper" text={`${usd(w.cost)} a task against ${usd(wo.cost)}`} />
        <Stat value={times(wo.seconds, w.seconds)} unit="faster" text={`${w.seconds} s to the answer against ${wo.seconds} s`} />
        <Stat value={`${w.measured}/${w.runs}`} text="fixes proved with a before/after recording; without the recorder, none can be" />
      </div>
      <div className="legend">
        <span>
          <i className="with" />
          With the recorder
        </span>
        <span>
          <i className="without" />
          Without
        </span>
      </div>
      <div className="charts">
        <Fixed />
        <Bars title="Cost of a task" value={(arm) => arm.cost} format={usd} />
        <Bars title="Time to the answer" value={(arm) => arm.seconds} format={(x) => `${x} s`} />
      </div>
    </div>
  );
};
