import results from '../../../../docs/benchmarks.json';

// The benchmark page's charts, from what test/eval-plugin/summarize.mjs wrote; the markdown carries the same as tables.
type Arm = (typeof results)['with'];
type Arms = Record<(typeof SIDES)[number], Arm>;

const SIDES = ['with', 'without'] as const;
const usd = (x: number) => `$${x.toFixed(2)}`;
const times = (a: number, b: number) => `${(a / b).toFixed(1)}×`;
const maxOf = (value: (arm: Arm) => number) => Math.max(...results.cases.flatMap((c) => SIDES.map((side) => value(c[side]))));

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
.bench .table { padding: 4px 16px 8px; border: 1px solid #3a3a44; border-radius: 12px; background: #1b1b21; }
.bench .line { display: grid; grid-template-columns: minmax(150px, 1.1fr) 92px minmax(0, 1fr) minmax(0, 1fr); gap: 14px;
  align-items: center; padding: 7px 0; border-top: 1px solid #2a2a33; }
.bench .line:first-child { border-top: 0; }
.bench .line.head { font-size: 12px; color: #8e8e99; padding: 8px 0 6px; }
.bench .line code { font-size: 12px; }
.bench .line em { display: block; font-size: 11px; color: #8e8e99; font-style: normal; }
.bench .bars { display: grid; gap: 3px; }
.bench .bar { display: grid; grid-template-columns: minmax(0, 1fr) 48px; align-items: center; gap: 6px; }
.bench .bar i { height: 7px; min-width: 2px; }
.bench .bar span { font-size: 11px; color: #cfcfd6; text-align: right; font-variant-numeric: tabular-nums; }
.bench .runs { display: flex; gap: 3px; align-items: center; }
.bench .runs .dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid; box-sizing: border-box; }
.bench .runs .dot.with { border-color: #0a84ff; background: transparent; }
.bench .runs .dot.without { border-color: #5d5d6a; background: transparent; }
.bench .runs .dot.ok.with { background: #0a84ff; }
.bench .runs .dot.ok.without { background: #5d5d6a; }
.bench .runs .gap { width: 8px; }
.bench .note { margin: 8px 0 0; font-size: 12px; color: #8e8e99; }
@media (max-width: 760px) {
  .bench .line { grid-template-columns: 1fr 1fr; row-gap: 6px; }
  .bench .line.head { display: none; }
  .bench .line > :first-child { grid-column: 1 / -1; }
}
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

const Bars = ({ arms, value, max, format }: { arms: Arms; value: (arm: Arm) => number; max: number; format: (x: number) => string }) => (
  <div className="bars">
    {SIDES.map((side) => (
      <div className="bar" key={side}>
        <i className={side} style={{ width: `${(value(arms[side]) / max) * 100}%` }} />
        <span>{format(value(arms[side]))}</span>
      </div>
    ))}
  </div>
);

const Runs = ({ arms }: { arms: Arms }) => (
  <div className="runs">
    {SIDES.map((side) => (
      <span key={side} style={{ display: 'contents' }}>
        {Array.from({ length: arms[side].runs }, (_, i) => (
          <span key={i} className={`dot ${side}${i < arms[side].solved ? ' ok' : ''}`} />
        ))}
        {side === 'with' && <span className="gap" />}
      </span>
    ))}
  </div>
);

/** A line a case: its runs, what a task cost and how long it took, the two sides one above the other. */
const Cases = () => {
  const cost = maxOf((arm) => arm.cost);
  const seconds = maxOf((arm) => arm.seconds);
  return (
    <div className="table">
      <div className="line head">
        <span>Case</span>
        <span>Fixed, run by run</span>
        <span>Cost of a task</span>
        <span>Time to the answer</span>
      </div>
      {results.cases.map((c) => (
        <div className="line" key={c.name}>
          <span>
            <code>{c.name}</code>
            <em>{c.input === 'recording' ? 'the steps and a recording' : 'a one-line complaint'}</em>
          </span>
          <Runs arms={c} />
          <Bars arms={c} value={(arm) => arm.cost} max={cost} format={usd} />
          <Bars arms={c} value={(arm) => arm.seconds} max={seconds} format={(x) => `${x} s`} />
        </div>
      ))}
    </div>
  );
};

export const BenchmarkCharts = () => {
  const { with: w, without: wo } = results;
  return (
    <div className="bench" data-testid="benchmarks">
      <div className="stats">
        <Stat value={`${w.solved}/${w.runs}`} text={`runs fixed at the cause; ${wo.solved}/${wo.runs} without the recorder`} />
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
      <Cases />
      <p className="note">A filled dot is a run that fixed the bug at its cause; a hollow one, a run that did not.</p>
    </div>
  );
};
