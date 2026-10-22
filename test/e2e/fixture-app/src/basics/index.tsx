import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { Cache } from './Cache';
import { Children } from './Children';
import { Contexts } from './Contexts';
import { Dialog } from './Dialog';
import { Effects } from './Effects';
import { Forms } from './Forms';
import { Init } from './Init';
import { Nested } from './Nested';
import { Notify } from './Notify';
import { Router } from './Router';
import { Selection } from './Selection';
import { Subscriptions } from './Subscriptions';
import { Keys } from './Keys';
import { MemoCallback } from './MemoCallback';
import { MemoDeps } from './MemoDeps';
import { Props } from './Props';
import { ReadWhenNeeded } from './ReadWhenNeeded';
import { Refs } from './Refs';
import { Responses } from './Responses';
import { Scroll } from './Scroll';
import { StateDown } from './StateDown';

export interface BasicsCase {
  title: string;
  what: string;
  element: () => JSX.Element;
}

/** The textbook mistakes, each on a bare page: two versions of one widget side by side, one of them wrong. */
export const BASICS: Record<string, BasicsCase> = {
  memo: {
    title: 'an inline handler breaks memo',
    what: 'A handler written in render gives memo a new prop every time, so the children it should have skipped render anyway; useCallback keeps it the same.',
    element: MemoCallback,
  },
  deps: {
    title: 'an object in useMemo deps',
    what: 'A dependency written as an object in the render is new every time: the memo computes again and hands down a new array.',
    element: MemoDeps,
  },
  keys: {
    title: 'key={index} in a list that changes',
    what: 'key={index} matches rows by position: inserting one at the top re-renders every row below and moves their state to the next one.',
    element: Keys,
  },
  props: {
    title: 'an object written in render breaks memo',
    what: 'An object, an array or a JSX element written inside the render is a new one every time, and memo has nothing to compare.',
    element: Props,
  },
  state: {
    title: 'state kept too high in the tree',
    what: 'A clock ticking in a card renders the whole card — and hidden in a custom hook, it renders whoever calls the hook. Move it down to what shows it.',
    element: StateDown,
  },
  dialog: {
    title: "a dialog's open flag kept in the page",
    what: 'An open flag kept by the page renders the page and everything on it each time a dialog opens or closes.',
    element: Dialog,
  },
  ref: {
    title: 'useState for a value nothing shows',
    what: 'State for a value only a handler reads renders for nothing; a ref holds it quietly, and keeps a handler stable too.',
    element: Refs,
  },
  selection: {
    title: 'every row gets the selected id',
    what: 'Every row handed the selected id renders on every pick; handed whether it is the one, two rows do.',
    element: Selection,
  },
  context: {
    title: 'a context that renders every reader',
    what: 'Two unrelated values in one context, or a value object built in the provider: readers render with nothing new to show.',
    element: Contexts,
  },
  subscriptions: {
    title: 'a store selector that returns too much',
    what: 'The whole object, a fresh array, the exact number — three ways to ask a store for more than is on the screen.',
    element: Subscriptions,
  },
  snapshot: {
    title: 'a subscription where getState() would do',
    what: 'A value used only in a click handler needs no subscription: reading the store at the click costs no renders at all.',
    element: ReadWhenNeeded,
  },
  cache: {
    title: 'a memoized selector with too few slots',
    what: 'A selector cached by argument, with fewer slots than rows, evicts itself: every row gets a new object with the same content.',
    element: Cache,
  },
  effect: {
    title: 'derived state copied in an effect',
    what: 'An effect that copies props into state costs a second commit and leaves the screen one render behind; work it out while rendering.',
    element: Effects,
  },
  notify: {
    title: 'a child tells its parent in an effect',
    what: 'A child that keeps a value and hands it up from an effect costs its parent a second commit, and shows the old value in between.',
    element: Notify,
  },
  responses: {
    title: 'a setState for every response',
    what: 'Items put into state one by one as their requests come back: a commit and a render of the whole list each time, where Promise.all makes it one.',
    element: Responses,
  },
  scroll: {
    title: 'scroll position kept in state',
    what: 'A header that reads scrollY renders the page on every scroll event; an IntersectionObserver on a marker tells it twice, once each way.',
    element: Scroll,
  },
  init: {
    title: 'useState: an expensive initial value, a reset from an effect',
    what: 'useState(parse(text)) parses on every render; a draft reset from an effect shows the old user for a commit, a key starts it fresh.',
    element: Init,
  },
  nested: {
    title: 'a component declared inside a render',
    what: 'A new component type every render: React unmounts the old subtree, loses its state and rebuilds the DOM.',
    element: Nested,
  },
  children: {
    title: 'children as a prop: skip without memo',
    what: 'An element made by a component that did not render is reused as it is, so the subtree sits out the renders of the one around it.',
    element: Children,
  },
  router: {
    title: 'a router hook high in the tree',
    what: 'Reading the URL at the top of a page renders all of it on every navigation, even the parts the URL says nothing about.',
    element: Router,
  },
  form: {
    title: "a form's values: useState or react-hook-form",
    what: 'Not a bug, a choice: values in useState render the whole form on every letter; kept in the DOM, only what shows a value renders.',
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
