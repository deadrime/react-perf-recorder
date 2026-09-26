import { useQuery } from '@tanstack/react-query';

let polls = 0;

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
