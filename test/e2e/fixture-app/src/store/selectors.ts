import { memoize, memoizeWithArgs } from 'proxy-memoize';
import { bug } from '../bugs';
import type { Terminal } from './terminal';

export const selectAccount = (s: Terminal) => s.account;
export const selectBalance = (s: Terminal) => s.account.balance;
export const selectEquity = (s: Terminal) => s.account.equity;
export const selectBtcPrice = (s: Terminal) => s.priceByTicker.BTC;

export const selectPositionIds = memoize((s: Terminal) => Object.keys(s.positionById));

/** One cache slot by default: rows that call it with their own ids evict each other on every tick. */
export const selectPositionInfo = memoizeWithArgs(
  (s: Terminal, id: string) => {
    const position = s.positionById[id];
    const price = s.priceByTicker[position.ticker];
    return { ...position, price, pnl: +((price - position.entry) * position.size).toFixed(2) };
  },
  bug('memo-cache-slot') ? undefined : { size: 32 }
);

/** Around 80: equity over the balance with a margin buffer. */
export const selectHealth = (s: Terminal) => Math.min(100, (s.account.equity / (s.account.balance * 1.2)) * 100);
