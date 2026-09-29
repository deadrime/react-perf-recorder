import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN_INIT = `
const Notes = ({ text }) => {
  const [notes] = useState(parseNotes(text));   // ← every render
  const done = notes.filter((n) => n.done).length;

  return <p>{notes.length} notes, {done} done</p>;
};`;

const FIXED_INIT = `
const Notes = ({ text }) => {
  const [notes] = useState(() => parseNotes(text));   // ← once
  const done = notes.filter((n) => n.done).length;

  return <p>{notes.length} notes, {done} done</p>;
};`;

const BROKEN_RESET = `
const Editor = ({ user }) => {
  const [draft, setDraft] = useState(user.name);
  useEffect(() => setDraft(user.name), [user]);   // ← late

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
};

<Editor user={user} />`;

const FIXED_RESET = `
const Editor = ({ user }) => {
  const [draft, setDraft] = useState(user.name);

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
};

<Editor key={user.id} user={user} />   // ← new user, new state`;

const TEXT = Array.from({ length: 400 }, (_, i) => `- [${i % 3 ? ' ' : 'x'}] note ${i}: ${'lorem ipsum '.repeat(8)}`).join('\n');

/** Parses the notes the slow way, as a markdown parser does, and keeps how often and how long it was asked to. */
const parsed = { eager: { runs: 0, ms: 0 }, lazy: { runs: 0, ms: 0 } };
function parseNotes(text: string, side: keyof typeof parsed) {
  const started = performance.now();
  const notes = [];
  for (const line of text.split('\n')) {
    const done = /^- \[x\]/.test(line);
    let words = 0;
    for (const word of line.split(/\s+/)) if (/^[a-z]+$/i.test(word)) words++;
    notes.push({ done, words });
  }
  parsed[side].runs++;
  parsed[side].ms += performance.now() - started;
  return notes;
}

const tick = createDriver(0);

const NotesEager = () => {
  tick.use();
  const [notes] = useState(parseNotes(TEXT, 'eager'));
  return <NotesLine side="eager" notes={notes} />;
};

const NotesLazy = () => {
  tick.use();
  const [notes] = useState(() => parseNotes(TEXT, 'lazy'));
  return <NotesLine side="lazy" notes={notes} />;
};

const NotesLine = ({ side, notes }: { side: keyof typeof parsed; notes: Array<{ done: boolean }> }) => {
  const { runs, ms } = parsed[side];
  return (
    <ul className="rows">
      <li>
        <span className="grow">
          {notes.length} notes, {notes.filter((n) => n.done).length} done
        </span>
        <RenderCount renders={useRenderCount()} />
      </li>
      <li>
        <span className="grow muted">parseNotes: {ms.toFixed(1)} ms in all</span>
        <span className={runs > 1 ? 'count mounts again' : 'count mounts'} data-testid={`parsed-${side}`} data-parsed={runs}>
          ran {runs}×
        </span>
      </li>
    </ul>
  );
};

const USERS = [
  { id: 'ann', name: 'Ann Lee' },
  { id: 'bo', name: 'Bo Chen' },
  { id: 'cy', name: 'Cy Ortiz' },
];
type User = (typeof USERS)[number];
const user = createDriver(USERS[0]);

// A module counter, not useRenderCount: the editor on the right mounts anew for every user, and a ref would start over.
const editorRenders = { effect: 0, key: 0 };
const staleCommits = { effect: 0, key: 0 };

const EditorByEffect = () => {
  const who = user.use();
  const [draft, setDraft] = useState(who.name);
  const draftOf = useRef(who.id);
  useEffect(() => {
    draftOf.current = who.id;
    setDraft(who.name);
  }, [who]);
  return <Draft side="effect" who={who} draft={draft} stale={draftOf.current !== who.id} onDraft={setDraft} />;
};

const EditorByKey = () => {
  const who = user.use();
  return <FreshEditor key={who.id} who={who} />;
};

/** Knows nothing about switching users: the key hands it a new one, and its state starts over with it. */
const FreshEditor = ({ who }: { who: User }) => {
  const [draft, setDraft] = useState(who.name);
  return <Draft side="key" who={who} draft={draft} stale={false} onDraft={setDraft} />;
};

/** The editor as the page shows it, and how often it put another user's draft on the screen. */
const Draft = ({
  side,
  who,
  draft,
  stale,
  onDraft,
}: {
  side: keyof typeof editorRenders;
  who: User;
  draft: string;
  stale: boolean;
  onDraft: (text: string) => void;
}) => {
  editorRenders[side]++;
  useLayoutEffect(() => {
    if (stale) staleCommits[side]++;
  });
  const shown = staleCommits[side];
  return (
    <ul className="rows">
      <li>
        <span className="grow">
          Editing <b>{who.name}</b>
        </span>
        <RenderCount renders={editorRenders[side]} />
      </li>
      <li>
        <input data-testid={`draft-${side}`} value={draft} onChange={(e) => onDraft(e.target.value)} />
        <span className="grow" />
        <span className={shown ? 'count mounts again' : 'count mounts'} data-testid={`stale-${side}`} data-stale={shown}>
          old draft shown {shown}×
        </span>
      </li>
    </ul>
  );
};

/** One mistake of the two: what it is, the button that shows it, and the broken and fixed version side by side. */
const Lesson = ({ id, title, intro, action, children }: { id: string; title: string; intro: ReactNode; action: ReactNode; children: ReactNode }) => (
  <div data-pair={id}>
    <h3 className="pair">{title}</h3>
    <p className="what">{intro}</p>
    <p className="bar">{action}</p>
    <div className="two">{children}</div>
  </div>
);

export const Init = () => (
  <Case
    title="useState: an expensive initial value, a reset from an effect"
    what={<>Two mistakes with the first value of useState. Each has its own button: press it and compare the counters in the two panels.</>}
  >
    <Lesson
      id="init"
      title="an expensive initial value"
      intro={
        <>
          React uses the argument of <code>useState</code> on the first render only, but <code>useState(parseNotes(text))</code> still calls{' '}
          <code>parseNotes</code> on every render and throws the result away. Handed a function, React calls it once.
        </>
      }
      action={
        <button type="button" data-testid="render" onClick={() => tick.set((n) => n + 1)}>
          Render the notes again
        </button>
      }
    >
      <Panel
        kind="broken"
        title="useState(parseNotes(text))"
        says="The recorder says: the same renders as on the right, each several times longer."
        code={BROKEN_INIT}
      >
        <NotesEager />
      </Panel>
      <Panel
        kind="fixed"
        title="useState(() => parseNotes(text))"
        says="The recorder says: the same renders, a fraction of the time."
        code={FIXED_INIT}
      >
        <NotesLazy />
      </Panel>
    </Lesson>
    <Lesson
      id="reset"
      title="a draft that starts over for another user"
      intro={
        <>
          An editor keeps a draft of the user's name. Type in either box, then switch the user: both drafts start over, but an effect does it a commit
          late, so the new user is shown with the old draft first. A <code>key</code> makes another user another editor, with fresh state from its
          first render.
        </>
      }
      action={
        <button type="button" data-testid="next-user" onClick={() => user.set((u) => USERS[(USERS.indexOf(u) + 1) % USERS.length])}>
          Next user
        </button>
      }
    >
      <Panel
        kind="broken"
        title="useEffect(() => setDraft(user.name))"
        says="The recorder says: two commits per switch, the second caused by core:effect."
        code={BROKEN_RESET}
      >
        <EditorByEffect />
      </Panel>
      <Panel
        kind="fixed"
        title="<Editor key={user.id} />"
        says="The recorder says: one commit per switch; the editor mounts with the new user's name."
        code={FIXED_RESET}
      >
        <EditorByKey />
      </Panel>
    </Lesson>
  </Case>
);
