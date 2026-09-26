import { useQuery } from '@tanstack/react-query';

const fetchTopic = async () => ({ topic: 'Release week: freeze on Thursday' });

/** The topic can be changed from elsewhere, so it is polled. */
export const ChannelTopic = () => {
  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
  return (
    <span className="topic" data-testid="topic">
      {isError ? 'topic unavailable' : data?.topic ?? '…'}
    </span>
  );
};
