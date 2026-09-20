import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export type Ticker = 'BTC' | 'ETH' | 'SOL';

export interface Position {
  id: string;
  ticker: Ticker;
  size: number;
  entry: number;
}

interface MarketsSlice {
  priceByTicker: Record<Ticker, number>;
  /** Changes on every tick like a block time in an AMM state: whoever holds the whole object re-renders. */
  blockTimestamp: number;
  tick(step: number): void;
}

interface AccountSlice {
  account: { id: string; currency: string; balance: number; equity: number };
  deposit(amount: number): void;
}

interface PositionsSlice {
  positionById: Record<string, Position>;
  closePosition(id: string): void;
}

export type Terminal = MarketsSlice & AccountSlice & PositionsSlice;
type Slice<T> = StateCreator<Terminal, [['zustand/devtools', never]], [], T>;

const pnlOf = (s: Pick<Terminal, 'positionById' | 'priceByTicker'>) =>
  Object.values(s.positionById).reduce((sum, p) => sum + (s.priceByTicker[p.ticker] - p.entry) * p.size, 0);

const markets: Slice<MarketsSlice> = (set) => ({
  priceByTicker: { BTC: 100, ETH: 50, SOL: 10 },
  blockTimestamp: 0,
  tick: (step) =>
    set(
      (s) => {
        const priceByTicker = {
          BTC: +(100 + Math.sin(step) * 2).toFixed(2),
          ETH: +(50 + Math.cos(step) * 1).toFixed(2),
          SOL: s.priceByTicker.SOL,
        };
        const equity = +(s.account.balance + pnlOf({ ...s, priceByTicker })).toFixed(2);
        return { priceByTicker, blockTimestamp: s.blockTimestamp + 1, account: { ...s.account, equity } };
      },
      false,
      'markets/tick'
    ),
});

const account: Slice<AccountSlice> = (set) => ({
  account: { id: 'demo-1', currency: 'USD', balance: 1000, equity: 1000 },
  deposit: (amount) => set((s) => ({ account: { ...s.account, balance: s.account.balance + amount } }), false, 'account/deposit'),
});

const positions: Slice<PositionsSlice> = (set) => ({
  positionById: {
    p1: { id: 'p1', ticker: 'BTC', size: 2, entry: 99 },
    p2: { id: 'p2', ticker: 'ETH', size: 5, entry: 51 },
    p3: { id: 'p3', ticker: 'SOL', size: 10, entry: 9 },
  },
  closePosition: (id) =>
    set(
      (s) => {
        const { [id]: _, ...rest } = s.positionById;
        return { positionById: rest };
      },
      false,
      'positions/close'
    ),
});

export const useTerminalStore = create<Terminal>()(
  devtools((...a) => ({ ...markets(...a), ...account(...a), ...positions(...a) }), { name: 'terminal' })
);

/** Last trade per ticker, a store without devtools: its updates show up as `priceStore.setState`. */
export const priceStore = createStore(() => ({ lastTrade: { BTC: 100, ETH: 50, SOL: 10 } as Record<Ticker, number> }));
