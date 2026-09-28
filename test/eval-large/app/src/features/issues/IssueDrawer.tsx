import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AvatarStack } from '../../components/ui/Avatar';
import { IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Misc';
import { withPermission } from '../../components/withPermission';
import { useHotkey } from '../../hooks/useHotkey';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useProject } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { useViewers } from '../../store/presence';
import { selectIssueByKey, selectIssuesReady } from '../../store/selectors';
import { CommentComposer, ReadOnlyComposer } from './CommentComposer';
import { IssueComments } from './IssueComments';
import { IssueDescription } from './IssueDescription';
import { IssueProperties } from './IssueProperties';

const GuardedComposer = withPermission(CommentComposer, 'issue:comment', ReadOnlyComposer);

export function IssueDrawer() {
  const { key = '' } = useParams();
  const issue = useAppSelector((s) => selectIssueByKey(s, key));
  const ready = useAppSelector(selectIssuesReady);
  const project = useProject(issue?.projectId);
  const viewers = useViewers(key);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useDocumentTitle(issue ? `${issue.key} ${issue.title}` : key);

  const close = useCallback(() => navigate({ pathname: pathname.replace(/\/[^/]+$/, ''), search }), [navigate, pathname, search]);
  useHotkey('escape', close);

  return (
    <aside className="drawer" data-testid="drawer" aria-label={`Issue ${key}`}>
      <header className="drawer-head">
        {project && <span className="dot" style={{ background: project.color }} />}
        <span className="muted">{project?.name}</span>
        <strong>{key}</strong>
        <div className="grow" />
        {viewers.length > 0 && (
          <span className="viewers" data-testid="viewers" title="Also looking at this issue">
            <AvatarStack ids={viewers} />
          </span>
        )}
        <IconButton icon="close" label="Close" onClick={close} />
      </header>
      {!issue ? (
        ready ? (
          <EmptyState title={`${key} does not exist`}>It may have been deleted or moved to another project.</EmptyState>
        ) : null
      ) : (
        <div className="drawer-body">
          <div className="drawer-main">
            <IssueDescription issue={issue} />
            <IssueComments issueId={issue.id} issueKey={issue.key} />
            <GuardedComposer issueId={issue.id} issueKey={issue.key} />
          </div>
          <IssueProperties issue={issue} />
        </div>
      )}
    </aside>
  );
}
