import { useRef, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const Upload = ({ files }) => {
  const [progress, setProgress] = useState(0);
  const start = () => animate((p) => setProgress(p));   // ← a commit on every frame
  return (
    <>
      <Bar width={progress} />
      {files.map((file) => <File key={file.name} file={file} />)}
    </>
  );
};`;

const FIXED = `
const Upload = ({ files }) => {
  const [status, setStatus] = useState('ready');
  const bar = useRef(null);
  const start = () => {
    setStatus('uploading…');
    animate((p) => (bar.current.style.transform = \`scaleX(\${p})\`),   // ← the frames go to the DOM
            () => setStatus('uploaded'));                               // ← one commit at the end
  };
  return (
    <>
      <div ref={bar} className="fill" />
      {files.map((file) => <File key={file.name} file={file} />)}
    </>
  );
};`;

const FILES = ['cover.png', 'chapter-1.md', 'chapter-2.md', 'chapter-3.md', 'index.json', 'fonts.zip'];

/** Not memoized, as most rows are: every render of the card renders each of them. */
const File = ({ name }: { name: string }) => (
  <li>
    <span className="grow">{name}</span>
    <RenderCount renders={useRenderCount()} />
  </li>
);

/** Calls `frame` with 0…1 on each frame for a second, then `done`: what a progress or a tween does. */
function animate(frame: (p: number) => void, done?: () => void) {
  const started = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - started) / 1000);
    frame(p);
    if (p < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

interface CardProps {
  side: string;
  status: string;
  renders: number;
  onUpload: () => void;
  children: JSX.Element;
}

const Card = ({ side, status, renders, onUpload, children }: CardProps) => (
  <div className="stack">
    <button type="button" data-testid={`upload-${side}`} onClick={onUpload}>
      Upload
    </button>
    {children}
    <ul className="rows">
      <li>
        <span className="grow muted" data-testid={`status-${side}`}>
          {status}
        </span>
        <RenderCount renders={renders} />
      </li>
      {FILES.map((name) => (
        <File key={name} name={name} />
      ))}
    </ul>
  </div>
);

/** Each frame's progress goes into state: the card and every file in it render sixty times a second. */
const UploadByState = () => {
  const [progress, setProgress] = useState(0);
  const renders = useRenderCount();
  return (
    <Card
      side="state"
      status={progress === 1 ? 'uploaded' : `${Math.round(progress * 100)}%`}
      renders={renders}
      onUpload={() => animate(setProgress)}
    >
      <div className="meter">
        <div className="fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </Card>
  );
};

/** The frames move the bar through a ref; state hears only that it is done. */
const UploadByRef = () => {
  const [status, setStatus] = useState('ready');
  const bar = useRef<HTMLDivElement>(null);
  const renders = useRenderCount();
  const start = () => {
    setStatus('uploading…');
    animate(
      (p) => bar.current && (bar.current.style.transform = `scaleX(${p})`),
      () => setStatus('uploaded')
    );
  };
  return (
    <Card side="ref" status={status} renders={renders} onUpload={start}>
      <div className="meter">
        <div ref={bar} className="fill" style={{ transform: 'scaleX(0)' }} />
      </div>
    </Card>
  );
};

export const Animation = () => (
  <Case
    title="setState on every animation frame"
    what={
      <>
        Both cards fill a progress bar over a second. On the left each frame's progress goes into state, so the card and every file in it render on
        every frame, sixty times a second. On the right the frames set the bar's style through a ref, and state changes once, when it is done. The
        same goes for a drag, a tween or a playhead: what moves every frame belongs in the DOM or a CSS transition, not in a render.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="setProgress on every frame"
        says="The recorder says: state #0 on every frame, caused by core:timer requestAnimationFrame step."
        code={BROKEN}
      >
        <UploadByState />
      </Panel>
      <Panel
        kind="fixed"
        title="style.transform through a ref"
        says="The recorder says: two renders, the click's and the one when it is done."
        code={FIXED}
      >
        <UploadByRef />
      </Panel>
    </div>
  </Case>
);
