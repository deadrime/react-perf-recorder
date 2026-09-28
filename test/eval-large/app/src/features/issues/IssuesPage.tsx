import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Misc';
import { PAGE_SIZE } from '../../config';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useIssueFilters } from '../../hooks/useIssueFilters';
import { applyFilters } from '../../lib/filters';
import { useAppSelector } from '../../store';
import { selectAllIssues, selectIssuesReady } from '../../store/selectors';
import { IssuesToolbar } from './IssuesToolbar';
import { IssueTable } from './IssueTable';

export function IssuesPage() {
  const [filters, setFilters] = useIssueFilters();
  const issues = useAppSelector(selectAllIssues);
  const ready = useAppSelector(selectIssuesReady);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { search } = useLocation();
  const navigate = useNavigate();
  useDocumentTitle('Issues');

  const visible = useMemo(() => applyFilters(issues, filters), [issues, filters]);
  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);

  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);

  return (
    <div className="page page-issues" data-testid="issues-page">
      <IssuesToolbar filters={filters} setFilters={setFilters} total={visible.length} />
      {ready ? <IssueTable issues={page} onOpen={openIssue} /> : <Spinner label="Loading issues" />}
      {visible.length > limit && (
        <div className="center-pad">
          <Button variant="ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, visible.length - limit)} more
          </Button>
        </div>
      )}
      <Outlet />
    </div>
  );
}
