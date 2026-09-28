import { useEffect, useState } from 'react';
import { Case, createDriver, Pair, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN_INIT = `
const Notes = ({ text }) => {
  const [notes, setNotes] = useState(parseNotes(text));   // ← parsed on every render, kept only on the first
  …
};`;

const FIXED_INIT = `
const Notes = ({ text }) => {
  const [notes, setNotes] = useState(() => parseNotes(text));   // ← parsed once, on the first render
  …
};`;

const BROKEN_RESET = `
const Editor = ({ user }) => {
  const [draft, setDraft] = useState(user.name);
  useEffect(() => setDraft(user.name), [user]);   // ← a commit with the old draft, then another
  …
};`;

const FIXED_RESET = `
const Editor = ({ user }) => {
  const [draft, setDraft] = useState(user.name);
  const [shown, setShown] = useState(user);
  if (shown !== user) {   // ← set while rendering: React renders again before it commits
    setShown(user);
    setDraft(user.name);
  }
  …
};`;

const TEXT = Array.from({ length: 400 }, (_, i) => `- [${i % 3 ? ' ' : 'x'}] note ${i}: ${'lorem ipsum '.repeat(8)}`).join('\n');

/** Parses the notes the slow way, as a markdown parser does, and counts how often it was asked to. */
const parsed = { eager: 0, lazy: 0 };
function parseNotes(text: string, side: keyof typeof parsed) {
  parsed[side]++;
  const notes = [];
  for (const line of text.split('\n')) {
    const done = /^- \[x\]/.test(line);
    let words = 0;
    for (const word of line.split(/\s+/)) if (/^[a-z]+$/i.test(word)) words++;
    notes.push({ done, words });
  }
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

const NotesLine = ({ side, notes }: { side: keyof typeof parsed; notes: Array<{ done: boolean }> }) => (
  <ul className="rows">
    <li>
      <span className="grow">
        {notes.filter((n) => n.done).length} of {notes.length} done
      </span>
      <span className="muted" data-testid={`parsed-${side}`} data-parsed={parsed[side]}>
        parsed {parsed[side]}×
      </span>
      <RenderCount renders={useRenderCount()} />
    </li>
  </ul>
);

const USERS = [
  { id: 'ann', name: 'Ann Lee' },
  { id: 'bo', name: 'Bo Chen' },
  { id: 'cy', name: 'Cy Ortiz' },
];
const user = createDriver(USERS[0]);

const EditorByEffect = () => {
  const who = user.use();
  const [draft, setDraft] = useState(who.name);
  useEffect(() => setDraft(who.name), [who]);
  return <Draft side="effect" draft={draft} onDraft={setDraft} />;
};

const EditorWhileRendering = () => {
  const who = user.use();
  const [draft, setDraft] = useState(who.name);
  const [shown, setShown] = useState(who);
  if (shown !== who) {
    setShown(who);
    setDraft(who.name);
  }
  return <Draft side="render" draft={draft} onDraft={setDraft} />;
};

const Draft = ({ side, draft, onDraft }: { side: string; draft: string; onDraft: (text: string) => void }) => (
  <ul className="rows">
    <li>
      <input data-testid={`draft-${side}`} value={draft} onChange={(e) => onDraft(e.target.value)} />
      <RenderCount renders={useRenderCount()} />
    </li>
  </ul>
);

export const Init = () => (
  <Case
    title="state that starts from something"
    what={
      <>
        Two ways state set up from a value costs more than it should. <code>useState(parseNotes(text))</code> parses on every render and throws the
        result away after the first; handed a function, React calls it once. And a draft restarted from an effect when the user changes shows the old
        draft for a commit; set while rendering, React renders again before anything reaches the screen.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="render" onClick={() => tick.set((n) => n + 1)}>
        Render
      </button>
      <button type="button" data-testid="next-user" onClick={() => user.set((u) => USERS[(USERS.indexOf(u) + 1) % USERS.length])}>
        Next user
      </button>
    </p>
    <Pair id="init" title="an initial value worked out on every render">
      <Panel kind="broken" title="useState(parseNotes(text))" says="The recorder says: the notes render slowly, every time." code={BROKEN_INIT}>
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
    </Pair>
    <Pair id="reset" title="state restarted when a prop changes">
      <Panel
        kind="broken"
        title="useEffect(() => setDraft(user.name))"
        says="The recorder says: two commits for one switch, the second caused by core:effect."
        code={BROKEN_RESET}
      >
        <EditorByEffect />
      </Panel>
      <Panel kind="fixed" title="set while rendering" says="The recorder says: one commit for one switch." code={FIXED_RESET}>
        <EditorWhileRendering />
      </Panel>
    </Pair>
  </Case>
);
