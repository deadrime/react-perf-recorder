import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { Contexts } from './Contexts';
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
};

export const BasicsPage = () => {
  const { id } = useParams();
  const basic = BASICS[id ?? ''] ?? BASICS.memo;
  const Case = basic.element;
  return (
    <>
      <BugStrip note={basic.title} />
      <Case />
    </>
  );
};
