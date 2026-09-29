import { useEffect, useRef, useState } from 'react';
import { NARROW, NARROW_QUERY, WIDE } from './size';

const narrowNow = () => typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches;

/** A browser window playing the recorder's real flow on Orbit: pick an area, record, read the report. */
export const HeroDemo = () => {
  const view = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(narrowNow);
  const [scale, setScale] = useState(0);
  const size = narrow ? NARROW : WIDE;

  // Loaded after the page: the scene carries the panel's markup at each step and is no use to the first paint.
  useEffect(() => {
    let live = true;
    import('./scene').then(({ sceneDocument }) => live && setDoc(sceneDocument()));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const measure = () => {
      setNarrow(narrowNow());
      setScale(el.getBoundingClientRect().width / (narrowNow() ? NARROW : WIDE).width);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="window">
      <div className="window-bar" aria-hidden="true">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="address">localhost:5173/board</span>
      </div>
      <div className="window-view" ref={view} style={{ aspectRatio: `${size.width} / ${size.stage + size.caption}` }}>
        {doc && scale > 0 && (
          <iframe
            title="Perf Recorder on a board app: pick an area, record, read the report"
            srcDoc={doc}
            tabIndex={-1}
            aria-hidden="true"
            style={{ width: size.width, height: size.stage + size.caption, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  );
};
