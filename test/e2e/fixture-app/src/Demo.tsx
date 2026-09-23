import { BASICS } from './basics';
import { BUGS, SCENARIOS, enabledBugs } from './bugs';

/**
 * The fixture doubles as the demo: every seeded bug is a card that opens the app with that bug on, says what to do
 * and what the recording should name. The app itself stays unstyled on purpose — the point is what it renders, not
 * how it looks — so all the styling lives here.
 */
const DEMO_STYLES = `
body { margin: 0; background: #131317; }
.demo { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; color: #e8e8ea;
  font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.demo h1 { font-size: 20px; margin: 0 0 6px; color: #fff; }
.demo p { margin: 0 0 10px; color: #b9b9c2; max-width: 80ch; }
.demo code { color: #ffd60a; }
.demo .steps { margin: 0 0 24px; padding-left: 18px; color: #b9b9c2; }
.demo .steps li { margin: 3px 0; }
.demo .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
.demo .sandbox { display: flex; align-items: baseline; gap: 10px; margin: 0 0 26px; padding: 10px 14px; border: 1px solid #0a84ff;
  border-radius: 10px; background: rgba(10,132,255,.08); color: #e8e8ea; text-decoration: none; }
.demo .sandbox:hover { background: rgba(10,132,255,.16); }
.demo .sandbox b { color: #fff; }
.demo .sandbox span { color: #b9b9c2; }
.demo .section { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #8c8c96; }
.demo .section + p { margin-bottom: 12px; }
.demo .card { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; border: 1px solid #3a3a44; border-radius: 10px;
  background: rgba(36,36,42,.6); color: inherit; text-decoration: none; }
.demo .card:hover { border-color: #0a84ff; background: rgba(46,46,56,.75); }
.demo .card h2 { font-size: 14px; margin: 0; color: #fff; }
.demo .card .what { color: #b9b9c2; margin: 0; }
`;

/** The strip sits on the app's own page, which is left unstyled on purpose: it may not touch anything but itself. */
const STRIP_STYLES = `
.strip { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-bottom: 6px; padding: 3px 10px;
  background: #1d1d22; color: #b9b9c2; border-bottom: 1px solid #3a3a44;
  font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.strip a { color: #0a84ff; text-decoration: none; }
.strip b { color: #fff; }
.strip .try { color: #ffd60a; }
`;

/**
 * The front page is the textbook cases only. The chat with its seeded bugs (`/app`, `/bug/<flag>`) is still served —
 * the e2e tests record it, and a link or a recording can point at it — but it is not how a person meets the tool:
 * a real app's bug is learnt faster from the two-widget version of the same mistake.
 */
export const Catalogue = () => (
  <>
    <style>{DEMO_STYLES}</style>
    <div className="demo">
      <h1>react-perf-recorder — demo</h1>
      <p>
        Textbook re-render mistakes, each on a page of its own: the broken and the fixed version of one widget side by
        side, with the renders and the mounts counted on every row. Open one, record a few seconds, and read what the
        recorder says about it.
      </p>
      <ol className="steps">
        <li>
          Open a card. The recorder's panel is in the corner (<code>Alt+Shift+R</code> opens and closes it) — drag it
          anywhere, it sticks to the nearer side.
        </li>
        <li>
          Press <code>● Rec</code>, press the button on the page, press <code>■ Stop</code>. The summary names the
          cascade roots and why they rendered.
        </li>
        <li>
          Turn on <code>highlight</code> to see the renders outlined live, and <code>⌖ Pick</code> to record one of the
          two versions only.
        </li>
      </ol>
      {/* The chat with no bug on: a real-looking app to try the recorder on, with no answer waiting to be found. */}
      <a className="sandbox" href="/app" data-testid="sandbox">
        <b>▷ Sandbox</b>
        <span>a small team chat with a store, a live feed and a form — open it and record whatever you like</span>
      </a>
      <h2 className="section">The textbook ones</h2>
      <p>
        Two versions of one widget side by side, one of them wrong, with the renders counted on every row. Turn on{' '}
        <code>highlight</code> and press the button.
      </p>
      <div className="cards">
        {Object.entries(BASICS).map(([id, basic]) => (
          <a className="card" href={`/basics/${id}`} key={id} data-basic={id}>
            <h2>{basic.title}</h2>
            <p className="what">{basic.what}</p>
          </a>
        ))}
      </div>
    </div>
  </>
);

/** On every page but the front one: what is being shown here, and the way back to the cards. */
export const BugStrip = ({ note }: { note?: string }) => {
  const on = enabledBugs();
  return (
    <>
      <style>{STRIP_STYLES}</style>
      <div className="strip" data-testid="strip">
        <a href="/">← all cases</a>
        {note ? (
          <span>
            <b>{note}</b>
          </span>
        ) : on.length === 0 ? (
          <span>sandbox — a small team chat to try the recorder on: record anything, nothing here is broken on purpose</span>
        ) : (
          on.map((id) => (
            <span key={id}>
              <b>{id}</b> · <span className="try">{SCENARIOS[BUGS[id].scenario].long}</span>
            </span>
          ))
        )}
      </div>
    </>
  );
};
