import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BugStrip } from '../Demo';
import { EffectChain } from './EffectChain';
import { EmptyDefault } from './EmptyDefault';
import { Fallback } from './Fallback';
import { HeavyList } from './HeavyList';
import { Leak } from './Leak';
import { LibraryContext } from './LibraryContext';
import { Measure } from './Measure';
import { PropGetters } from './PropGetters';
import { QueryFields } from './QueryFields';
import { ReduxFavorites } from './ReduxFavorites';
import { SortInRender } from './SortInRender';
import { WholeCopy } from './WholeCopy';
import { Windowed } from './Windowed';

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
    title: 'a measured width kept in state',
    what: 'It renders on every frame of a resize, while the number of tags that fit, the one thing shown, changes a few times.',
    element: Measure,
  },
  deferred: {
    title: 'a slow list filtered as you type',
    what: 'Two thousand rows filtered with every letter make typing stutter; useDeferredValue keeps the field ahead of the list.',
    element: HeavyList,
  },
  sort: {
    title: 'a list sorted again on every render',
    what: 'A sort left in the render runs over all fifteen hundred contacts with every letter typed: renders as often as with useMemo, each one slow.',
    element: SortInRender,
  },
  window: {
    title: 'a virtualized list of ten thousand rows',
    what: 'A log with every line in the DOM renders all ten thousand for one switch; virtualized, it renders only the twenty or so on the screen.',
    element: Windowed,
  },
  suspense: {
    title: 'a Suspense spinner on every tab switch',
    what: 'A tab set straight away swaps the panel for its Suspense fallback while the data comes; set in startTransition, the old panel stays.',
    element: Fallback,
  },
  query: {
    title: 'a useQuery result spread into props',
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
  redux: {
    title: 'a Redux selector that returns the whole list',
    what: 'Each card selects the whole favourites array to find itself in it: a star on one card renders all of them.',
    element: ReduxFavorites,
  },
  getters: {
    title: 'a prop getter makes every option new',
    what: "A package's getItemProps builds new handlers on every call: every memo option renders for a move of the pointer.",
    element: PropGetters,
  },
  leak: {
    title: 'leaks: CSS classes and listeners that pile up',
    what: 'A value put into css() is a new class every time and a listener without a cleanup outlives its popover: neither renders more, both pile up.',
    element: Leak,
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
