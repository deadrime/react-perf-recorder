import { memo, useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Case, Pair, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN_SPOT = `
const Pad = () => {
  const [spot, setSpot] = useState({ x: 0, y: 0 });   // ← state for a value the pad never draws

  return (
    <div onPointerMove={(e) => setSpot({ x: e.offsetX, y: e.offsetY })}>
      <button onClick={() => pin(spot)}>Pin it here</button>
    </div>
  );
};`;

const FIXED_SPOT = `
const Pad = () => {
  const spot = useRef({ x: 0, y: 0 });   // ← a ref: writing to it renders nothing

  return (
    <div onPointerMove={(e) => { spot.current = { x: e.offsetX, y: e.offsetY }; }}>
      <button onClick={() => pin(spot.current)}>Pin it here</button>
    </div>
  );
};`;

const BROKEN_LATEST = `
const Composer = () => {
  const [text, setText] = useState('');
  const send = useCallback(() => post(text), [text]);   // ← a new handler on every keystroke

  return <><input value={text} onChange={…} /><SendButton onSend={send} /></>;   // memo'd, and it renders anyway
};`;

const FIXED_LATEST = `
const Composer = () => {
  const [text, setText] = useState('');
  const latest = useRef(text);
  useLayoutEffect(() => { latest.current = text; });   // ← the ref follows the text

  const send = useCallback(() => post(latest.current), []);   // ← one handler for the component's whole life
  return <><input value={text} onChange={…} /><SendButton onSend={send} /></>;
};`;

const spotOf = (e: PointerEvent<HTMLDivElement>) => ({ x: Math.round(e.nativeEvent.offsetX), y: Math.round(e.nativeEvent.offsetY) });

/** Keeps where the pointer is in state, only so the button can read it later: every move is a render. */
const PadWithState = () => {
  const [spot, setSpot] = useState({ x: 0, y: 0 });
  const [pinned, setPinned] = useState('');
  const renders = useRenderCount();
  return (
    <div className="pad" data-testid="pad-state" onPointerMove={(e) => setSpot(spotOf(e))}>
      <button type="button" data-testid="pin-state" onClick={() => setPinned(`pinned at ${spot.x}, ${spot.y}`)}>
        Pin it here
      </button>
      <span className="grow" data-testid="pinned-state">
        {pinned || 'move the pointer over the pad'}
      </span>
      <RenderCount n={renders} />
    </div>
  );
};

/** Keeps it in a ref: the pad knows where the pointer is and renders when something on it changes. */
const PadWithRef = () => {
  const spot = useRef({ x: 0, y: 0 });
  const [pinned, setPinned] = useState('');
  const renders = useRenderCount();
  return (
    <div
      className="pad"
      data-testid="pad-ref"
      onPointerMove={(e) => {
        spot.current = spotOf(e);
      }}
    >
      <button type="button" data-testid="pin-ref" onClick={() => setPinned(`pinned at ${spot.current.x}, ${spot.current.y}`)}>
        Pin it here
      </button>
      <span className="grow" data-testid="pinned-ref">
        {pinned || 'move the pointer over the pad'}
      </span>
      <RenderCount n={renders} />
    </div>
  );
};

/** memo'd, as a button deep in a toolbar would be: it renders again only if the handler it gets is a new one. */
const SendButton = memo(({ onSend, testId }: { onSend: () => void; testId: string }) => {
  const renders = useRenderCount();
  return (
    <li>
      <button type="button" data-testid={testId} onClick={onSend}>
        Send
      </button>
      <span className="grow muted">a memo button</span>
      <RenderCount n={renders} />
    </li>
  );
});

const SentLine = ({ sent, testId }: { sent: string; testId: string }) => (
  <li>
    <span className="grow" data-testid={testId}>
      {sent ? `sent: ${sent}` : 'nothing sent yet'}
    </span>
  </li>
);

const ComposerWithDeps = () => {
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const send = useCallback(() => setSent(text), [text]);
  return (
    <ul className="rows">
      <li>
        <input data-testid="text-deps" value={text} placeholder="type here" onChange={(e) => setText(e.target.value)} />
      </li>
      <SendButton onSend={send} testId="send-deps" />
      <SentLine sent={sent} testId="sent-deps" />
    </ul>
  );
};

const ComposerWithRef = () => {
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const latest = useRef(text);
  // Written after the render, not during it: a render may be thrown away, a layout effect is not.
  useLayoutEffect(() => {
    latest.current = text;
  });
  const send = useCallback(() => setSent(latest.current), []);
  return (
    <ul className="rows">
      <li>
        <input data-testid="text-ref" value={text} placeholder="type here" onChange={(e) => setText(e.target.value)} />
      </li>
      <SendButton onSend={send} testId="send-ref" />
      <SentLine sent={sent} testId="sent-ref" />
    </ul>
  );
};

export const Refs = () => (
  <Case
    title="a value nobody draws belongs in a ref"
    what={
      <>
        State is for what the screen shows: setting it is asking React to draw again. A value that is only read later —
        by a click, a timer, the next event — goes in a <code>useRef</code>, and writing to it renders nothing. The same
        trick keeps a handler stable while it still sees the latest value, so a <code>memo</code> child is not handed a
        new function on every keystroke.
      </>
    }
  >
    <Pair id="spot" title="a value only a handler reads">
      <Panel
        kind="broken"
        title="useState for the pointer"
        says="The recorder says: state #0 on the pad for every move of the pointer — a render for a value it never draws."
        code={BROKEN_SPOT}
      >
        <PadWithState />
      </Panel>
      <Panel kind="fixed" title="useRef for the pointer" says="The recorder says nothing while the pointer moves; the pad renders when it is pinned." code={FIXED_SPOT}>
        <PadWithRef />
      </Panel>
    </Pair>
    <Pair id="latest" title="the latest value in a handler that stays the same">
      <Panel
        kind="broken"
        title="useCallback(…, [text])"
        says="The recorder says: parent: props same: onSend on the memo button, once per keystroke."
        code={BROKEN_LATEST}
      >
        <ComposerWithDeps />
      </Panel>
      <Panel
        kind="fixed"
        title="useCallback(…, []) and a ref"
        says="The recorder says: the input renders as you type, the button does not — and Send still sends what was typed."
        code={FIXED_LATEST}
      >
        <ComposerWithRef />
      </Panel>
    </Pair>
  </Case>
);
