import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Dropdown } from '../../components/ui/Dropdown';
import { Spinner } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { BOARD_STATUSES } from '../../lib/meta';
import { useProjects } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { selectIssuesReady } from '../../store/selectors';
import { BoardColumn } from './BoardColumn';

export function BoardPage() {
  const [params, setParams] = useSearchParams();
  const { data: projects = [] } = useProjects();
  const ready = useAppSelector(selectIssuesReady);
  const projectId = params.get('project') ?? projects[0]?.id;
  const project = projects.find((p) => p.id === projectId);
  const navigate = useNavigate();
  const { search } = useLocation();
  useDocumentTitle(project ? `${project.name} board` : 'Board');

  const openIssue = useCallback((key: string) => navigate({ pathname: `/board/${key}`, search }), [navigate, search]);

  if (!ready || !projectId) return <Spinner label="Loading board" />;

  return (
    <div className="page page-board" data-testid="board-page">
      <div className="toolbar">
        <Dropdown<string>
          testId="board-project"
          trigger={
            <span className="btn btn-secondary btn-sm">
              <span className="dot" style={{ background: project?.color }} /> {project?.name}
            </span>
          }
          options={projects.map((p) => ({ value: p.id, label: p.name, icon: <span className="dot" style={{ background: p.color }} /> }))}
          selected={[projectId]}
          onSelect={(id) => setParams({ project: id })}
        />
        <span className="muted small">{project?.description}</span>
      </div>
      <div className="board" data-testid="board">
        {BOARD_STATUSES.map((status) => (
          <BoardColumn key={status} projectId={projectId} status={status} onOpen={openIssue} />
        ))}
      </div>
      <Outlet />
    </div>
  );
}
