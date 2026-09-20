import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { Keys } from './Keys';
import { MemoCallback } from './MemoCallback';

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
