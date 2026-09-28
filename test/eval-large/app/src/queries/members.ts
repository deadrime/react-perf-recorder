import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Member } from '../api/types';
import { MEMBERS_POLL_MS } from '../config';

const indexById = (members: Member[]) => new Map(members.map((m) => [m.id, m]));

const membersQuery = {
  queryKey: ['members'],
  queryFn: api.members,
  refetchInterval: MEMBERS_POLL_MS,
  staleTime: MEMBERS_POLL_MS,
};

export const useMembers = () => useQuery(membersQuery);

export function useMembersById() {
  const { data } = useQuery({ ...membersQuery, select: indexById });
  return data;
}

export function useMember(id: string | null | undefined) {
  return useMembersById()?.get(id ?? '');
}
