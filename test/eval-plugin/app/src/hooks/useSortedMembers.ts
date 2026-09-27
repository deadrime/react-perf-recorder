import { useMemo } from 'react';
import { ROSTER, sortMembers } from '../lib/members';

export function useSortedMembers(order: Intl.CollatorOptions) {
  return useMemo(() => sortMembers(ROSTER, order), [order]);
}
