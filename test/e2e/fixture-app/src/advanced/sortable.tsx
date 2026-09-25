import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * A stand-in for a sortable-list package, dnd-kit's shape: a provider that takes the item ids, a hook every item
 * calls. Made through a function, as a package's context is, so it has no displayName.
 */
const makeContext = () => createContext<{ items: string[] }>({ items: [] });
const SortableContext = makeContext();

export const SortableList = ({ items, children }: { items: string[]; children: ReactNode }) => {
  // The package does its part: the value changes only when the items do.
  const value = useMemo(() => ({ items }), [items]);
  return <SortableContext.Provider value={value}>{children}</SortableContext.Provider>;
};

export const useSortable = (id: string) => useContext(SortableContext).items.indexOf(id);
