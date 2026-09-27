import { useQuery } from '@tanstack/react-query';
import { useSortedMembers } from '../hooks/useSortedMembers';

const ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };

/** The first few of the workspace by name, and how many of them are online now. */
export const OnlineNow = () => {
  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
  const sorted = useSortedMembers(ORDER);
  return (
    <p className="side-line" data-testid="online">
      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
    </p>
  );
};
