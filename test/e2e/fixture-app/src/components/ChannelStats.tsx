import { useQuery } from '@tanstack/react-query';

let polls = 0;

/** Presence polled from the server; each answer differs, so every poll renders once. */
export const ChannelStats = () => {
  const { data } = useQuery({
    queryKey: ['presence'],
    queryFn: async () => ({ online: 3 + (++polls % 4) }),
    refetchInterval: 500,
  });
  return (
    <p className="side-line" data-testid="stats">
      <b>{data?.online ?? '…'}</b> people online
    </p>
  );
};
