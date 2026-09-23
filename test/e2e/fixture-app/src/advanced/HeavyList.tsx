import { memo, useDeferredValue, useRef, useState } from 'react';
import { Case, Panel } from '../basics/Case';

const BROKEN = `
const Search = () => {
  const [query, setQuery] = useState('');
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results query={query} />   // ← two thousand rows before the letter shows up
    </>
  );
};`;

const FIXED = `
const Search = () => {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);   // ← the field first, the list when there is time
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results query={deferred} />
    </>
  );
};

const Results = memo(…);`;

const WORDS = ['alpha', 'bravo', 'delta', 'echo', 'kilo', 'lima', 'nova', 'oscar', 'sierra', 'tango'];
const ITEMS = Array.from({ length: 2000 }, (_, i) => `${WORDS[i % WORDS.length]} ${WORDS[(i * 7) % WORDS.length]} #${i}`);

/** A row that takes a little work to draw, as a real one with formatting and icons does. */
const Item = ({ text }: { text: string }) => {
  let hash = 0;
  for (let i = 0; i < 50000; i++) hash = (hash * 31 + text.charCodeAt(i % text.length)) | 0;
  return <li data-h={hash & 1}>{text}</li>;
};

const Results = memo(({ query, side }: { query: string; side: string }) => {
  const shown = ITEMS.filter((item) => item.includes(query));
  return (
    <>
      <p className="muted" data-testid={`found-${side}`} data-found={shown.length}>
        {shown.length} found
      </p>
      <ul className="rows tall">
        {shown.slice(0, 800).map((text) => (
          <Item key={text} text={text} />
        ))}
      </ul>
    </>
  );
});

/** How long from a keystroke to the screen showing it, written straight into the DOM so measuring costs no render. */
function useLag() {
  const out = useRef<HTMLSpanElement>(null);
  const worst = useRef(0);
  const onKey = () => {
    const at = performance.now();
    requestAnimationFrame(() =>
      setTimeout(() => {
        const lag = Math.round(performance.now() - at);
        worst.current = Math.max(worst.current, lag);
        if (out.current) out.current.textContent = `${lag}ms to the screen, worst ${worst.current}ms`;
      })
    );
  };
  return { out, onKey };
}

const Search = ({ side, deferred }: { side: string; deferred: boolean }) => {
  const [query, setQuery] = useState('');
  const later = useDeferredValue(query);
  const lag = useLag();
  return (
    <>
      <label className="field">
        <input
          data-testid={`search-${side}`}
          placeholder="type: lima"
          value={query}
          onChange={(e) => {
            lag.onKey();
            setQuery(e.target.value);
          }}
        />
      </label>
      <p className="muted lag">
        <span ref={lag.out}>type to measure</span>
      </p>
      <Results query={deferred ? later : query} side={side} />
    </>
  );
};

export const HeavyList = () => (
  <Case
    title="the field first, the list when there is time"
    what={
      <>
        Both fields filter two thousand rows. On the left every letter renders the list before the browser may show the letter, so typing stutters. On
        the right <code>useDeferredValue</code> lets React draw the field first and the list as a render that can be thrown away when the next letter
        comes. This one is about time, not about how many renders: the right side renders the list about as often — the numbers under the fields show
        the difference, and so does the latency of each keystroke in the recording.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="the list with every letter"
        says="The recorder says: each keystroke waits for the whole list, see its latency in the actions."
        code={BROKEN}
      >
        <Search side="sync" deferred={false} />
      </Panel>
      <Panel
        kind="fixed"
        title="useDeferredValue"
        says="The recorder says: the keystroke commits alone, the list follows in a transition lane."
        code={FIXED}
      >
        <Search side="deferred" deferred />
      </Panel>
    </div>
  </Case>
);
