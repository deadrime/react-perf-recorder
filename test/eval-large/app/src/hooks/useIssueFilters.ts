import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseFilters, writeFilters, type IssueFilters } from '../lib/filters';

/** The issue list's filters live in the URL, so a filtered view can be shared as a link. */
export function useIssueFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (patch: Partial<IssueFilters>) => setParams((current) => writeFilters(current, patch), { replace: true }),
    [setParams]
  );
  return [filters, setFilters] as const;
}
