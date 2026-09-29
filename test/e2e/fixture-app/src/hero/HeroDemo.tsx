import { useEffect, useRef, useState } from 'react';

/** The scene is 800px tall; its width follows the window's shape: 1280 on a desktop, 640 on a phone. */
const SCENE_H = 800;

/** A browser window playing the recorder's real flow on Orbit: pick an area, record, read the report. */
export const HeroDemo = () => {
  const view = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [fit, setFit] = useState({ width: 1280, scale: 0 });

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
      const { width, height } = el.getBoundingClientRect();
      if (height) setFit({ width: Math.round((width / height) * SCENE_H), scale: height / SCENE_H });
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
      <div className="window-view" ref={view}>
        {doc && fit.scale > 0 && (
          <iframe
            title="Perf Recorder on a board app: pick an area, record, read the report"
            srcDoc={doc}
            tabIndex={-1}
            aria-hidden="true"
            style={{ width: fit.width, height: SCENE_H, transform: `scale(${fit.scale})` }}
          />
        )}
      </div>
    </div>
  );
};
