import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';

const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
const SORTED = [...MEMBERS].sort(byName);

const MemberList = memo(() => (
  <ul className="members" data-testid="members">
    {SORTED.slice(0, 8).map((name) => (
      <li key={name}>{name}</li>
    ))}
    <li className="more">and {SORTED.length - 8} more</li>
  </ul>
));

let polls = 0;

export const ChannelStats = () => {
  const { data } = useQuery({
    queryKey: ['presence'],
    queryFn: async () => ({ online: 3 + (++polls % 4) }),
    refetchInterval: 500,
  });
  return (
    <>
      <p className="side-line" data-testid="stats">
        <b>{data?.online ?? '…'}</b> people online
      </p>
      <MemberList />
    </>
  );
};
