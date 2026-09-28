import { Suspense, useState, useTransition } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const Tabs = () => {
  const [tab, setTab] = useState('overview');
  return (
    <>
      <TabButtons onPick={setTab} />   // ← the panel on screen gives way to the spinner
      <Suspense fallback={<Spinner />}>
        <TabPanel tab={tab} />
      </Suspense>
    </>
  );
};`;

const FIXED = `
const Tabs = () => {
  const [tab, setTab] = useState('overview');
  const [pending, startTransition] = useTransition();
  return (
    <>
      <TabButtons pending={pending} onPick={(next) => startTransition(() => setTab(next))} />   // ← the old panel stays
      <Suspense fallback={<Spinner />}>
        <TabPanel tab={tab} />
      </Suspense>
    </>
  );
};`;

const TABS = ['overview', 'activity', 'members', 'settings'];
const LINES: Record<string, string[]> = {
  overview: ['12 open issues', '3 due this week', 'last release 0.3.2'],
  activity: ['Ann closed WEB-12', 'Bo commented on API-4', 'Cy moved DS-7 to review'],
  members: ['Ann Lee, owner', 'Bo Chen, member', 'Cy Ortiz, guest'],
  settings: ['visibility: team', 'default view: board', 'notifications: mentions'],
};

/** A tab's data, fetched the first time it is shown: a promise thrown until it arrives, as a Suspense data layer does. */
function createTabData(delay: number) {
  const cache = new Map<string, { lines?: string[]; promise?: Promise<void> }>();
  return {
    read(tab: string) {
      let entry = cache.get(tab);
      if (!entry) {
        const created: { lines?: string[]; promise?: Promise<void> } = {};
        created.promise = new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() => {
          created.lines = LINES[tab];
        });
        cache.set(tab, (entry = created));
      }
      if (!entry.lines) throw entry.promise;
      return entry.lines;
    },
    clear: () => cache.clear(),
  };
}

const TabPanel = ({ data, tab }: { data: ReturnType<typeof createTabData>; tab: string }) => {
  const lines = data.read(tab);
  return (
    <ul className="rows" data-testid="tab-panel" data-tab={tab}>
      {lines.map((line) => (
        <li key={line}>
          <span className="grow">{line}</span>
        </li>
      ))}
    </ul>
  );
};

const Spinner = ({ side }: { side: string }) => (
  <p className="muted" data-testid={`spinner-${side}`}>
    loading… <RenderCount renders={useRenderCount()} />
  </p>
);

const TabButtons = ({ side, tab, pending, onPick }: { side: string; tab: string; pending?: boolean; onPick: (tab: string) => void }) => (
  <p className="bar" style={pending ? { opacity: 0.6 } : undefined}>
    {TABS.map((name) => (
      <button key={name} type="button" data-testid={`tab-${side}-${name}`} aria-pressed={tab === name} onClick={() => onPick(name)}>
        {name}
      </button>
    ))}
  </p>
);

const DELAY = 600;

const TabsBlocking = () => {
  const [data] = useState(() => createTabData(DELAY));
  const [tab, setTab] = useState('overview');
  return (
    <div data-testid="tabs-blocking">
      <TabButtons side="blocking" tab={tab} onPick={setTab} />
      <Suspense fallback={<Spinner side="blocking" />}>
        <TabPanel data={data} tab={tab} />
      </Suspense>
    </div>
  );
};

const TabsInTransition = () => {
  const [data] = useState(() => createTabData(DELAY));
  const [tab, setTab] = useState('overview');
  const [pending, startTransition] = useTransition();
  return (
    <div data-testid="tabs-transition">
      <TabButtons side="transition" tab={tab} pending={pending} onPick={(next) => startTransition(() => setTab(next))} />
      <Suspense fallback={<Spinner side="transition" />}>
        <TabPanel data={data} tab={tab} />
      </Suspense>
    </div>
  );
};

export const Fallback = () => (
  <Case
    title="a tab that hides behind its spinner"
    what={
      <>
        Each tab fetches its data the first time it is opened. On the left a click sets the tab straight away: the panel that was on the screen is
        hidden, a spinner takes its place, and the new panel replaces the spinner when the data comes. On the right the click is a transition: React
        keeps the old panel, dims the tabs while it waits, and swaps the panels in one go. Open a tab you have not opened yet on each side.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="setTab(next)"
        says="The recorder says: the spinner mounts in the click's commit; the panel is the root of a second commit, in the Retry lane."
        code={BROKEN}
      >
        <TabsBlocking />
      </Panel>
      <Panel
        kind="fixed"
        title="startTransition(() => setTab(next))"
        says="The recorder says: no spinner; the click commits the pending tabs, the new panel comes in a Transition commit."
        code={FIXED}
      >
        <TabsInTransition />
      </Panel>
    </div>
  </Case>
);
