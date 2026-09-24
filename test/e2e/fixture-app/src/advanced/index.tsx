import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { EffectChain } from './EffectChain';
import { EmptyDefault } from './EmptyDefault';
import { HeavyList } from './HeavyList';
import { LibraryContext } from './LibraryContext';
import { Measure } from './Measure';
import { QueryFields } from './QueryFields';
import { WholeCopy } from './WholeCopy';

export interface AdvancedCase {
  title: string;
  what: string;
  element: () => JSX.Element;
}

/** Mistakes of more than one step — a chain, a measurement, a list too big for a keystroke, a query — as in real code. */
export const ADVANCED: Record<string, AdvancedCase> = {
  chain: {
    title: 'a chain of effects',
    what: 'Each effect copies the one before it into state: one click, four renders and four commits, and wrong pairs on the screen in between.',
    element: EffectChain,
  },
  measure: {
    title: 'keep the answer, not the measurement',
    what: 'A width kept in state renders on every frame of a resize; the number of tags that fit changes a few times.',
    element: Measure,
  },
  deferred: {
    title: 'the field first, the list when there is time',
    what: 'Two thousand rows filtered with every letter make typing stutter; useDeferredValue keeps the field ahead of the list.',
    element: HeavyList,
  },
  query: {
    title: 'read only the fields you show',
    what: 'Spreading the rest of a useQuery result reads isFetching too: every poll renders the list with the same data.',
    element: QueryFields,
  },
  // Found in real apps: Jaeger UI, react-jsonschema-form, a dnd-kit kanban board.
  empty: {
    title: 'an empty default is a new array',
    what: 'A row list of memos gets ?? [] for rows without marks: a click on one row renders all of them.',
    element: EmptyDefault,
  },
  copy: {
    title: 'a copy of the whole form for one field',
    what: 'A structuredClone of the form on each keystroke gives every group a new object: every group renders for one letter.',
    element: WholeCopy,
  },
  context: {
    title: "memo does not stop a package's context",
    what: 'A new array of ids handed to a sortable list changes its context: every memo card renders with each letter typed elsewhere.',
    element: LibraryContext,
  },
};

export const AdvancedPage = () => {
  const { id } = useParams();
  const item = ADVANCED[id ?? ''] ?? ADVANCED.chain;
  const shown = useMemo(() => <item.element />, [item]);
  return (
    <>
      <BugStrip note={item.title} />
      {shown}
    </>
  );
};
