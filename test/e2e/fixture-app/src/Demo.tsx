import { BUGS, SCENARIOS, enabledBugs, type Bug } from './bugs';

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
.demo .clean { display: inline-block; margin-bottom: 26px; padding: 8px 12px; border: 1px solid #45454f; border-radius: 8px;
  background: #23232a; color: #e8e8ea; text-decoration: none; }
.demo .clean:hover { background: #2f2f38; }
.demo .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
.demo .card { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; border: 1px solid #3a3a44; border-radius: 10px;
  background: rgba(36,36,42,.6); color: inherit; text-decoration: none; }
.demo .card:hover { border-color: #0a84ff; background: rgba(46,46,56,.75); }
.demo .card h2 { font-size: 14px; margin: 0; color: #fff; }
.demo .card .what { color: #b9b9c2; margin: 0; }
.demo .card .shows { color: #9fb7ff; margin: 0; }
.demo .card .meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; margin-top: auto; padding-top: 2px;
  color: #8c8c96; font-size: 12px; }
.demo .card .try { color: #ffd60a; }
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

const href = (id: Bug) => `/bug/${id}`;

export const Catalogue = () => (
  <>
    <style>{DEMO_STYLES}</style>
    <div className="demo">
      <h1>react-perf-recorder — demo</h1>
      <p>
        A small trading terminal with a store, a price feed, a form and thirteen re-render bugs, each the kind any
        React app can grow. Open one, record a few seconds, and read what the recorder says about it.
      </p>
      <ol className="steps">
        <li>
          Open a card — the app runs with that bug on. The recorder's panel is in the corner (<code>Alt+Shift+R</code>{' '}
          opens and closes it).
        </li>
        <li>
          Press <code>● Rec</code>, do what the card asks, press <code>■ Stop</code>. The summary names the cascade
          roots and why they rendered.
        </li>
        <li>
          Turn on <code>highlight</code> to see the renders outlined live, and <code>⌖ Area</code> to record one part
          of the page only.
        </li>
        <li>Record the clean app the same way and compare: that is the before-and-after a fix should produce.</li>
      </ol>
      <a className="clean" href="/app">
        ▷ Open the app with no bugs — the baseline
      </a>
      <div className="cards">
        {(Object.keys(BUGS) as Bug[]).map((id) => (
          <a className="card" href={href(id)} key={id} data-bug={id}>
            <h2>{BUGS[id].title}</h2>
            <p className="what">{BUGS[id].what}</p>
            <p className="shows">{BUGS[id].shows}</p>
            <span className="meta">
              <span className="try">try: {SCENARIOS[BUGS[id].scenario].short}</span>
              <span>{BUGS[id].file}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  </>
);

/** On the app itself: which bug is on, what to do about it, and the way back to the cards. */
export const BugStrip = () => {
  const on = enabledBugs();
  return (
    <>
      <style>{STRIP_STYLES}</style>
      <div className="strip" data-testid="strip">
        <a href="/">← all bugs</a>
        {on.length === 0 ? (
          <span>no bug is on — this is the clean baseline</span>
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
