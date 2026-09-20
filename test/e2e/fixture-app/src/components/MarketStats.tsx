import { useQuery } from '@tanstack/react-query';

let polls = 0;

/** Polled like a funding-rate endpoint; each answer differs, so every poll renders once. */
export const MarketStats = () => {
  const { data } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => ({ openInterest: 1000 + ++polls }),
    refetchInterval: 300,
  });
  return <p data-testid="stats">OI {data?.openInterest ?? '…'}</p>;
};
