import { useEffect, useRef, useState } from 'react';
import { Case, Panel, useRenderCount } from '../basics/Case';

const BROKEN = `
const Tags = ({ tags }) => {
  const [width, setWidth] = useState(0);
  useResizeObserver(ref, (box) => setWidth(box.width));   // ← a new number on every frame of a resize
  const fits = Math.floor(width / TAG_WIDTH);
  return <div ref={ref}>{tags.slice(0, fits).map(…)} +{tags.length - fits}</div>;
};`;

const FIXED = `
const Tags = ({ tags }) => {
  const [fits, setFits] = useState(0);
  useResizeObserver(ref, (box) => setFits(Math.floor(box.width / TAG_WIDTH)));   // ← the answer: the same number
  return <div ref={ref}>{tags.slice(0, fits).map(…)} +{tags.length - fits}</div>;       //   most of the time
};`;

const TAGS = ['design', 'weekly', 'urgent', 'client', 'draft', 'review', 'q3', 'ops'];
const TAG_WIDTH = 96;

const Tag = ({ name }: { name: string }) => {
  const renders = useRenderCount();
  return (
    <span className="tag" title={`rendered ${renders}×`}>
      <span className="grow">{name}</span>
      <small className="n" data-count={renders}>
        {renders}
      </small>
    </span>
  );
};

function useWidth(onWidth: (width: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onWidth);
  latest.current = onWidth;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => latest.current(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return ref;
}

const Row = ({ fits, renders }: { fits: number; renders: number }) => (
  <>
    <div className="tags">
      {TAGS.slice(0, fits).map((name) => (
        <Tag key={name} name={name} />
      ))}
      {fits < TAGS.length ? <span className="tag more">+{TAGS.length - fits}</span> : null}
    </div>
    <p className="muted">
      the row rendered <span data-count={renders}>{renders}×</span>
    </p>
  </>
);

/** Keeps the measurement: a resize is a render on every frame, whether a tag comes or goes or not. */
const TagsByWidth = () => {
  const [width, setWidth] = useState(0);
  const ref = useWidth(setWidth);
  return (
    <div ref={ref} className="measured">
      <Row fits={Math.floor(width / TAG_WIDTH)} renders={useRenderCount()} />
    </div>
  );
};

/** Keeps the answer: React skips the render when a frame of the resize leaves the same number of tags. */
const TagsByCount = () => {
  const [fits, setFits] = useState(0);
  const ref = useWidth((width) => setFits(Math.floor(width / TAG_WIDTH)));
  return (
    <div ref={ref} className="measured">
      <Row fits={fits} renders={useRenderCount()} />
    </div>
  );
};

/** Narrows both boxes and widens them back over a second, frame by frame, as a window being dragged does. */
function resize() {
  const boxes = [...document.querySelectorAll<HTMLElement>('[data-resizable]')];
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / 1200);
    const width = 100 - 55 * Math.sin(t * Math.PI);
    for (const box of boxes) box.style.width = `${width}%`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const Measure = () => (
  <Case
    title="keep the answer, not the measurement"
    what={
      <>
        Both rows show as many tags as fit and count the rest. On the left the width goes into state, so a resize renders the row and every tag in it
        on every frame. On the right the number of tags that fit goes into state: most frames leave it as it was, and React does not render at all.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="resize" onClick={resize}>
        Resize both boxes
      </button>
    </p>
    <div className="two">
      <Panel kind="broken" title="setWidth(box.width)" says="The recorder says: state #0 on every frame of the resize." code={BROKEN}>
        <div data-resizable>
          <TagsByWidth />
        </div>
      </Panel>
      <Panel kind="fixed" title="setFits(…)" says="The recorder says: a render each time a tag comes or goes, and none in between." code={FIXED}>
        <div data-resizable>
          <TagsByCount />
        </div>
      </Panel>
    </div>
  </Case>
);
