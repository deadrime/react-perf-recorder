import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Composer = () => {
  const typing = useStore(presence, (s) => s.typing);   // ← subscribed, to be read only on a click
  const send = () => post(text, { alsoTyping: typing });
  …
};`;

const FIXED = `
const Composer = () => {
  const send = () => post(text, { alsoTyping: presence.getState().typing });   // ← read at the moment it is needed
  …
};`;

interface Presence {
  typing: string[];
  step: number;
}

const PEOPLE = [['Anna'], ['Boris'], [], ['Anna', 'Chen']];

/** Who is typing right now: the room changes its mind twice a second, and nobody on this page draws it. */
const presence = createStore<Presence>(() => ({ typing: [], step: 0 }));

const useRoom = () =>
  useEffect(() => {
    const id = setInterval(() => presence.setState((s) => ({ typing: PEOPLE[(s.step + 1) % PEOPLE.length], step: s.step + 1 })), 500);
    return () => clearInterval(id);
  }, []);

const said = (typing: string[]) => `sent while ${typing.length ? typing.join(' and ') : 'nobody'} was typing`;

/** Subscribes to the room to have the answer ready for a click that may never come. */
const Subscribed = () => {
  const typing = useStore(presence, (s) => s.typing);
  const [sent, setSent] = useState('');
  const renders = useRenderCount();
  return (
    <li>
      <button type="button" data-testid="send-subscribed" onClick={() => setSent(said(typing))}>
        Send
      </button>
      <span className="grow" data-testid="sent-subscribed">
        {sent}
      </span>
      <RenderCount n={renders} />
    </li>
  );
};

/** Asks the room at the moment of the click: the same answer, and no renders while nobody clicks. */
const ReadOnClick = () => {
  const [sent, setSent] = useState('');
  const renders = useRenderCount();
  return (
    <li>
      <button type="button" data-testid="send-read" onClick={() => setSent(said(presence.getState().typing))}>
        Send
      </button>
      <span className="grow" data-testid="sent-read">
        {sent}
      </span>
      <RenderCount n={renders} />
    </li>
  );
};

export const ReadWhenNeeded = () => {
  useRoom();
  return (
    <Case
      title="read it when you need it"
      what={
        <>
          The message goes out with who else was typing at that moment. On the left the composer subscribes to the room
          to have that at hand, so it renders every time somebody starts or stops typing — twice a second, for a value
          it only reads when Send is pressed. On the right it asks the store in the click handler, and renders when it
          sends.
        </>
      }
    >
      <div className="two">
        <Panel
          kind="broken"
          title="useStore(presence, …)"
          says="The recorder says: external store [presence] (s)=>s.typing on the composer, every half second."
          code={BROKEN}
        >
          <ul className="rows">
            <Subscribed />
          </ul>
        </Panel>
        <Panel kind="fixed" title="presence.getState() in the handler" says="The recorder says nothing until Send is pressed: no subscription, no renders." code={FIXED}>
          <ul className="rows">
            <ReadOnClick />
          </ul>
        </Panel>
      </div>
    </Case>
  );
};
