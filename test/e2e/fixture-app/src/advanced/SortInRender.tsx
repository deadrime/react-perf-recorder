import { useMemo, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';
import { useLag } from './HeavyList';

const BROKEN = `
const Contacts = ({ contacts }) => {
  const [query, setQuery] = useState('');
  const sorted = [...contacts].sort(byName);   // ← all 1500, every letter
  const shown = sorted.filter((c) => c.name.includes(query));

  return (…);
};`;

const FIXED = `
const Contacts = ({ contacts }) => {
  const [query, setQuery] = useState('');
  const sorted = useMemo(
    () => [...contacts].sort(byName),   // ← once, until contacts change
    [contacts]
  );
  const shown = sorted.filter((c) => c.name.includes(query));

  return (…);
};`;

const FIRST = ['Émile', 'ada', 'Björn', 'chloé', 'Dmitri', 'Élodie', 'farid', 'Günter', 'hana', 'Íñigo', 'Jonas', 'kofi', 'Łukasz', 'Mateo'];
const LAST = ['Østergaard', 'lópez', 'Nakamura', 'Ødegaard', 'Schäfer', 'van Dijk', 'Żukowski', 'Åberg', "O'Neil", 'Müller', 'Dubois'];
const CONTACTS = Array.from({ length: 1500 }, (_, i) => ({
  id: i,
  name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} ${i}`,
}));

/** Names as people read them: case and accents aside, "Ada 9" before "Ada 10". */
function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
}

const Contacts = ({ side, sorted, query, onQuery }: { side: string; sorted: typeof CONTACTS; query: string; onQuery: (q: string) => void }) => {
  const lag = useLag();
  const q = query.toLowerCase();
  const shown = sorted.filter((c) => c.name.toLowerCase().includes(q));
  return (
    <>
      <label className="field">
        <input
          data-testid={`search-${side}`}
          placeholder="type: ada"
          value={query}
          onChange={(e) => {
            lag.onKey();
            onQuery(e.target.value);
          }}
        />
      </label>
      <p className="muted lag">
        <span ref={lag.out}>type to measure</span>
      </p>
      <ul className="rows">
        <li>
          <span className="grow muted" data-testid={`found-${side}`}>
            {shown.length} of {sorted.length}
          </span>
          <RenderCount renders={useRenderCount()} />
        </li>
        {shown.slice(0, 8).map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    </>
  );
};

const ContactsSortedEachRender = () => {
  const [query, setQuery] = useState('');
  const sorted = [...CONTACTS].sort(byName);
  return <Contacts side="broken" sorted={sorted} query={query} onQuery={setQuery} />;
};

const ContactsSortedOnce = () => {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...CONTACTS].sort(byName), []);
  return <Contacts side="fixed" sorted={sorted} query={query} onQuery={setQuery} />;
};

export const SortInRender = () => (
  <Case
    title="a list sorted again on every render"
    what={
      <>
        Both fields search fifteen hundred contacts sorted by name. On the left the sort sits in the render, so every letter sorts them all again; on
        the right <code>useMemo</code> sorts once. Both sides render as often: what differs is how long a render takes, and only the CPU fold of the
        report names the reason — <code>byName</code> inside the render of the left one. The fold needs Vite's dev server, which reads the profile:
        run the page locally (<code>npm run dev:pages</code>); this built site keeps recordings in the tab and has no CPU.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="sorted in render"
        says="The recorder says: under CPU, the slowest render is ContactsSortedEachRender, and byName is what takes its time."
        code={BROKEN}
      >
        <ContactsSortedEachRender />
      </Panel>
      <Panel kind="fixed" title="useMemo" says="The recorder says: the same renders, and no sort among them." code={FIXED}>
        <ContactsSortedOnce />
      </Panel>
    </div>
  </Case>
);
