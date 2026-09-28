import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Issue, Project } from '../../api/types';
import { Avatar, AvatarStack } from '../../components/ui/Avatar';
import { ProgressBar, Spinner } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDate } from '../../lib/time';
import { useMember } from '../../queries/members';
import { useProjects } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { selectAllIssues } from '../../store/selectors';

function ProjectCard({ project, issues }: { project: Project; issues: Issue[] }) {
  const lead = useMember(project.leadId);
  const done = issues.filter((i) => i.status === 'done').length;
  const active = issues.filter((i) => i.status === 'in_progress' || i.status === 'in_review').length;
  const scope = issues.filter((i) => i.status !== 'canceled').length;
  return (
    <article className="panel project" data-testid="project-card">
      <header className="row gap-sm">
        <span className="dot dot-lg" style={{ background: project.color }} />
        <Link to={`/board?project=${project.id}`}>
          <h3>{project.name}</h3>
        </Link>
        <div className="grow" />
        <span className="muted small">{project.key}</span>
      </header>
      <p className="muted">{project.description}</p>
      <ProgressBar value={scope ? done / scope : 0} color={project.color} />
      <div className="row between small">
        <span>
          {done} of {scope} done · {active} active
        </span>
        {project.targetDate && <span className="muted">Target {formatDate(project.targetDate)}</span>}
      </div>
      <footer className="row gap-sm">
        <Avatar id={project.leadId} size="xs" />
        <span className="small">{lead?.name ?? '…'}</span>
        <div className="grow" />
        <AvatarStack ids={project.memberIds} max={5} />
      </footer>
    </article>
  );
}

export function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const issues = useAppSelector(selectAllIssues);
  useDocumentTitle('Projects');
  const byProject = useMemo(() => {
    const map: Record<string, Issue[]> = {};
    for (const issue of issues) (map[issue.projectId] ??= []).push(issue);
    return map;
  }, [issues]);
  if (isLoading || !projects) return <Spinner label="Loading projects" />;
  return (
    <div className="page grid-cards" data-testid="projects-page">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} issues={byProject[p.id] ?? []} />
      ))}
    </div>
  );
}
