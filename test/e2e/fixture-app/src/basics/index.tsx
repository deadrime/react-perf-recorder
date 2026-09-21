import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { Children } from './Children';
import { Contexts } from './Contexts';
import { Effects } from './Effects';
import { Forms } from './Forms';
import { Nested } from './Nested';
import { Router } from './Router';
import { Subscriptions } from './Subscriptions';
import { Keys } from './Keys';
import { MemoCallback } from './MemoCallback';
import { Props } from './Props';
import { StateDown } from './StateDown';

export interface BasicsCase {
  title: string;
  what: string;
  element: () => JSX.Element;
}

/** The textbook mistakes, each on a bare page: two versions of one widget side by side, one of them wrong. */
export const BASICS: Record<string, BasicsCase> = {
  memo: {
    title: 'memo and useCallback',
    what: 'A handler written in render gives memo a new prop every time, so the children it should have skipped render anyway.',
    element: MemoCallback,
  },
  keys: {
    title: 'key: the position or the thing',
    what: 'key={index} matches rows by position: inserting one at the top re-renders every row below and moves their state to the next one.',
    element: Keys,
  },
  props: {
    title: 'a new object is a new prop',
    what: 'An object or an array written inside the render is a new one every time, and memo has nothing to compare.',
    element: Props,
  },
  state: {
    title: 'state belongs to the smallest component that shows it',
    what: 'A clock ticking in a card renders the whole card; the same clock in a component of its own renders itself.',
    element: StateDown,
  },
  context: {
    title: 'one context for two unrelated things',
    what: 'Two values in one context wake up both readers; two contexts wake up the one whose value changed.',
    element: Contexts,
  },
  subscriptions: {
    title: 'subscribe to what you show',
    what: 'The whole object, a fresh array, the exact number — three ways to ask a store for more than is on the screen.',
    element: Subscriptions,
  },
  effect: {
    title: 'derive it while you render',
    what: 'State copied from props in an effect costs a second commit and leaves the screen one render behind.',
    element: Effects,
  },
  nested: {
    title: 'a component declared inside a render',
    what: 'A new component type every render: React unmounts the old subtree, loses its state and rebuilds the DOM.',
    element: Nested,
  },
  children: {
    title: 'children come in as a prop, and skip',
    what: 'An element made by a component that did not render is reused as it is — the way to skip a subtree without memo.',
    element: Children,
  },
  router: {
    title: 'who needs to know the URL',
    what: 'A router hook read high in the tree renders the whole page on every navigation, even the parts the URL says nothing about.',
    element: Router,
  },
  form: {
    title: 'a form that does not render while you type',
    what: 'Every keystroke in a controlled form renders the form; left to the DOM, only what shows the value renders.',
    element: Forms,
  },
};

export const BasicsPage = () => {
  const { id } = useParams();
  const basic = BASICS[id ?? ''] ?? BASICS.memo;
  // useParams reads the location, so this page renders on every navigation the case makes. The element is the same
  // one each time, so React reuses it and only the components that asked the router for something render.
  const shown = useMemo(() => <basic.element />, [basic]);
  return (
    <>
      <BugStrip note={basic.title} />
      {shown}
    </>
  );
};
