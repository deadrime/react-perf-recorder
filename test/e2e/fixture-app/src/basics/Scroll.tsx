import { useEffect, useRef, useState, type RefObject, type UIEvent } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Article = () => {
  const [top, setTop] = useState(0);
  const scrolled = top > 120;
  return (
    <div onScroll={(e) => setTop(e.currentTarget.scrollTop)}>   // ← a new number on every scroll event
      <Header raised={scrolled} />
      {notes.map((note) => <Note key={note.id} note={note} />)}
    </div>
  );
};`;

const FIXED = `
const Article = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([marker]) => setScrolled(!marker.isIntersecting), { root: box.current });
    observer.observe(marker.current);   // ← told when the 120px marker leaves the box, and when it comes back
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box}>
      <div ref={marker} className="marker" />
      <Header raised={scrolled} />
      {notes.map((note) => <Note key={note.id} note={note} />)}
    </div>
  );
};`;

const NOTES = [
  'The panel docks to any side',
  'Recordings open from the clipboard',
  'Layout shifts name their component',
  'The largest paint names its element',
  'A CPU profile rides along',
  'Store causes name the selector',
  'Timers name the line that set them',
  'Effects name the hook they run in',
  'Phones get a bottom sheet',
  'Highlights follow a scrolled box',
  'compare_recordings reads both',
  'The skill installs with one command',
];

/** Past this many pixels the header gets a shadow and a way back up. */
const RAISED_AT = 120;

/** Not memoized, as most rows are: every render of the article renders each of them. */
const Note = ({ text }: { text: string }) => (
  <li>
    <span className="grow">{text}</span>
    <RenderCount renders={useRenderCount()} />
  </li>
);

const Article = ({
  side,
  box,
  marker,
  scrolled,
  onScroll,
}: {
  side: string;
  box: RefObject<HTMLDivElement>;
  marker?: RefObject<HTMLDivElement>;
  scrolled: boolean;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}) => {
  const renders = useRenderCount();
  return (
    <div ref={box} className="article" data-scrollable data-testid={`article-${side}`} onScroll={onScroll}>
      {marker ? <div ref={marker} className="marker" /> : null}
      <header className={scrolled ? 'raised' : undefined} data-raised={scrolled}>
        <span className="grow">What's new</span>
        {scrolled ? (
          <button type="button" onClick={() => box.current?.scrollTo({ top: 0 })}>
            ↑ top
          </button>
        ) : null}
        <RenderCount renders={renders} />
      </header>
      <ul className="rows">
        {NOTES.map((text) => (
          <Note key={text} text={text} />
        ))}
      </ul>
    </div>
  );
};

/** Keeps where the box is scrolled to: a render of the article and every note in it for each scroll event. */
const ArticleByPosition = () => {
  const [top, setTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  return <Article side="position" box={box} scrolled={top > RAISED_AT} onScroll={(event) => setTop(event.currentTarget.scrollTop)} />;
};

/** Asks the browser to say when a marker leaves the box: a render when the header changes, and none in between. */
const ArticleByMarker = () => {
  const [scrolled, setScrolled] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { root: box.current });
    if (marker.current) observer.observe(marker.current);
    return () => observer.disconnect();
  }, []);
  return <Article side="marker" box={box} marker={marker} scrolled={scrolled} />;
};

/** Scrolls both boxes to the bottom and back over a second and a half, frame by frame, as a wheel does. */
function scrollBoth() {
  const boxes = [...document.querySelectorAll<HTMLElement>('[data-scrollable]')];
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / 1500);
    for (const box of boxes) box.scrollTop = (box.scrollHeight - box.clientHeight) * Math.sin(t * Math.PI);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const Scroll = () => (
  <Case
    title="scroll position kept in state"
    what={
      <>
        Both articles raise their header and show a way back up once you scroll past the first notes. On the left the scroll position goes into state,
        so every scroll event renders the article and each note in it. On the right an IntersectionObserver watches a marker at the top: React hears
        about the scroll twice, when the marker leaves and when it comes back. Keeping only a scrolled flag in state also works: React drops a
        setState that leaves it as it was.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="scroll" onClick={scrollBoth}>
        Scroll both
      </button>
    </p>
    <div className="two">
      <Panel
        kind="broken"
        title="setTop(scrollTop) on scroll"
        says="The recorder says: state #0 on every scroll event, caused by core:update onScroll, and every note renders with it."
        code={BROKEN}
      >
        <ArticleByPosition />
      </Panel>
      <Panel
        kind="fixed"
        title="an IntersectionObserver on a marker"
        says="The recorder says: two renders, one each way past the marker."
        code={FIXED}
      >
        <ArticleByMarker />
      </Panel>
    </div>
  </Case>
);
