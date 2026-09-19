import { memoize, memoizeWithArgs } from 'proxy-memoize';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface State {
  count: number;
  rows: Record<string, { price: number }>;
  increment(): void;
  tick(): void;
}

export const useCounterStore = create<State>()(
  devtools(
    (set) => ({
      count: 0,
      rows: { a: { price: 1 }, b: { price: 2 }, c: { price: 3 } },
      increment: () => set((s) => ({ count: s.count + 1 }), false, 'counter/increment'),
      tick: () => set((s) => ({ rows: { ...s.rows, a: { price: s.rows.a.price + 1 } } }), false, 'rows/tick'),
    }),
    { enabled: true, name: 'fixture' }
  )
);

export const selectCount = memoize((state: State) => state.count);

export const selectRow = memoizeWithArgs((state: State, id: string) => ({ price: state.rows[id].price, id }));
