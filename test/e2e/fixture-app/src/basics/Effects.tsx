import { useEffect, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

/** The greeting copied into state by an effect: React renders, runs the effect, and renders again. */
const ByEffect = ({ first, last }: { first: string; last: string }) => {
  const [full, setFull] = useState('');
  useEffect(() => setFull(`${first} ${last}`.trim()), [first, last]);
  return (
    <ul className="rows">
      <li>
        <span className="grow">
          Hello, <b>{full || '…'}</b>
        </span>
        <RenderCount n={useRenderCount()} />
      </li>
    </ul>
  );
};

/** The same greeting worked out while rendering: no second pass, no state that can fall behind. */
const WhileRendering = ({ first, last }: { first: string; last: string }) => {
  const full = `${first} ${last}`.trim();
  return (
    <ul className="rows">
      <li>
        <span className="grow">
          Hello, <b>{full || '…'}</b>
        </span>
        <RenderCount n={useRenderCount()} />
      </li>
    </ul>
  );
};

export const Effects = () => {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  return (
    <Case
      title="derive it while you render"
      what={
        <>
          Both greetings are the two fields put together. On the left an effect copies the result into state, so every
          keystroke costs two renders and the greeting is one render behind what you typed.
        </>
      }
    >
      <p className="bar">
        <label className="field small">
          <span>first</span>
          <input data-testid="first" value={first} onInput={(e) => setFirst((e.target as HTMLInputElement).value)} />
        </label>
        <label className="field small">
          <span>last</span>
          <input data-testid="last" value={last} onInput={(e) => setLast((e.target as HTMLInputElement).value)} />
        </label>
      </p>
      <div className="two">
        <Panel kind="broken" title="useEffect + useState" says="The recorder says: a second commit after every keystroke, caused by core:effect.">
          <ByEffect first={first} last={last} />
        </Panel>
        <Panel kind="fixed" title="worked out in render" says="The recorder says: one commit per keystroke, and nothing to explain.">
          <WhileRendering first={first} last={last} />
        </Panel>
      </div>
    </Case>
  );
};
