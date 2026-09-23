import { useEffect, useState } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Greeting = ({ first, last }) => {
  const [full, setFull] = useState('');
  useEffect(() => setFull(\`\${first} \${last}\`.trim()), [first, last]);   // ← a render, then another one

  return <p>Hello, {full}</p>;
};`;

const FIXED = `
const Greeting = ({ first, last }) => {
  const full = \`\${first} \${last}\`.trim();   // ← worked out while rendering

  return <p>Hello, {full}</p>;
};`;

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

const first = createDriver('');
const last = createDriver('');

/** The two fields: a form above both greetings, which hands them the names. */
const Field = ({ name, value }: { name: 'first' | 'last'; value: typeof first }) => (
  <label className="field small">
    <span>{name}</span>
    <input data-testid={name} value={value.use()} onInput={(e) => value.set((e.target as HTMLInputElement).value)} />
  </label>
);

/** The greeting as a component would get it from a form: the names as props. */
const Greeting = ({ by: View }: { by: typeof ByEffect }) => <View first={first.use()} last={last.use()} />;

export const Effects = () => {
  return (
    <Case
      title="derive it while you render"
      what={
        <>
          Both greetings are the two fields put together. On the left an effect copies the result into state, so every keystroke costs two renders and
          the greeting is one render behind what you typed.
        </>
      }
    >
      <p className="bar">
        <Field name="first" value={first} />
        <Field name="last" value={last} />
      </p>
      <div className="two">
        <Panel
          kind="broken"
          title="useEffect + useState"
          says="The recorder says: a second commit after every keystroke, caused by core:effect."
          code={BROKEN}
        >
          <Greeting by={ByEffect} />
        </Panel>
        <Panel kind="fixed" title="worked out in render" says="The recorder says: one commit per keystroke, and nothing to explain." code={FIXED}>
          <Greeting by={WhileRendering} />
        </Panel>
      </div>
    </Case>
  );
};
