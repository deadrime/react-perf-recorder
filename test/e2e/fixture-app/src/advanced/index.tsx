import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { EffectChain } from './EffectChain';
import { HeavyList } from './HeavyList';
import { Measure } from './Measure';
import { QueryFields } from './QueryFields';

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
