import type { ReactNode } from 'react';
import type { Issue, IssuePatch, IssueStatus, Priority } from '../../api/types';
import { Avatar } from '../../components/ui/Avatar';
import { LabelChips, PriorityIcon, StatusIcon } from '../../components/ui/Badges';
import { Dropdown } from '../../components/ui/Dropdown';
import { TimeAgo } from '../../components/ui/TimeAgo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../../lib/meta';
import { dueLabel, formatDate } from '../../lib/time';
import { useMember, useMembers } from '../../queries/members';
import { useLabels } from '../../queries/workspace';
import { useAppDispatch } from '../../store';
import { updateIssue } from '../../store/issues';

const ESTIMATES = [1, 2, 3, 5, 8, 13];

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <span className="prop-label muted small">{label}</span>
      <div className="prop-value">{children}</div>
    </div>
  );
}

export function IssueProperties({ issue }: { issue: Issue }) {
  const { can } = useAuth();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const assignee = useMember(issue.assigneeId);
  const reporter = useMember(issue.reporterId);
  const editable = can('issue:edit');

  const change = (patch: IssuePatch, what: string, undo: IssuePatch) => {
    dispatch(updateIssue({ id: issue.id, patch }));
    toast(`${issue.key}: ${what}`, { action: { label: 'Undo', run: () => dispatch(updateIssue({ id: issue.id, patch: undo })) } });
  };

  const readOnly = (node: ReactNode) => <span className="prop-static">{node}</span>;

  return (
    <div className="props" data-testid="properties">
      <Property label="Status">
        {editable ? (
          <Dropdown<IssueStatus>
            testId="prop-status"
            trigger={
              <span className="prop-trigger">
                <StatusIcon status={issue.status} /> {STATUS_LABEL[issue.status]}
              </span>
            }
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: <StatusIcon status={s} /> }))}
            selected={[issue.status]}
            onSelect={(status) => change({ status }, `status set to ${STATUS_LABEL[status]}`, { status: issue.status })}
          />
        ) : (
          readOnly(STATUS_LABEL[issue.status])
        )}
      </Property>
      <Property label="Priority">
        {editable ? (
          <Dropdown<Priority>
            trigger={
              <span className="prop-trigger">
                <PriorityIcon priority={issue.priority} /> {PRIORITY_LABEL[issue.priority]}
              </span>
            }
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: <PriorityIcon priority={p} /> }))}
            selected={[issue.priority]}
            onSelect={(priority) => change({ priority }, `priority set to ${PRIORITY_LABEL[priority]}`, { priority: issue.priority })}
          />
        ) : (
          readOnly(PRIORITY_LABEL[issue.priority])
        )}
      </Property>
      <Property label="Assignee">
        {editable ? (
          <Dropdown<string>
            searchable
            trigger={
              <span className="prop-trigger">
                <Avatar id={issue.assigneeId} size="xs" /> {assignee?.name ?? 'Unassigned'}
              </span>
            }
            options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name, hint: `@${m.handle}` }))]}
            selected={[issue.assigneeId ?? '']}
            onSelect={(id) =>
              change({ assigneeId: id || null }, id ? `assigned to ${members.find((m) => m.id === id)?.name}` : 'unassigned', {
                assigneeId: issue.assigneeId,
              })
            }
          />
        ) : (
          readOnly(assignee?.name ?? 'Unassigned')
        )}
      </Property>
      <Property label="Labels">
        {editable ? (
          <Dropdown<string>
            searchable
            multiple
            trigger={<span className="prop-trigger">{issue.labelIds.length ? <LabelChips ids={issue.labelIds} max={4} /> : 'Add label'}</span>}
            options={labels.map((l) => ({ value: l.id, label: l.name, icon: <span className="dot" style={{ background: l.color }} /> }))}
            selected={issue.labelIds}
            onSelect={(id) => {
              const labelIds = issue.labelIds.includes(id) ? issue.labelIds.filter((l) => l !== id) : [...issue.labelIds, id];
              change({ labelIds }, 'labels changed', { labelIds: issue.labelIds });
            }}
          />
        ) : (
          <LabelChips ids={issue.labelIds} max={4} />
        )}
      </Property>
      <Property label="Estimate">
        {editable ? (
          <Dropdown<number>
            trigger={<span className="prop-trigger">{issue.estimate ? `${issue.estimate} points` : 'No estimate'}</span>}
            options={ESTIMATES.map((e) => ({ value: e, label: `${e} points` }))}
            selected={issue.estimate ? [issue.estimate] : []}
            onSelect={(estimate) => change({ estimate }, `estimate set to ${estimate}`, { estimate: issue.estimate })}
          />
        ) : (
          readOnly(issue.estimate ?? '—')
        )}
      </Property>
      <Property label="Due date">
        {issue.dueDate ? (
          <span className={`due due-${dueLabel(issue.dueDate).tone}`}>{formatDate(issue.dueDate)}</span>
        ) : (
          <span className="muted">None</span>
        )}
      </Property>
      <hr />
      <Property label="Reporter">
        <span className="prop-static">
          <Avatar id={issue.reporterId} size="xs" /> {reporter?.name}
        </span>
      </Property>
      <Property label="Created">
        <TimeAgo at={issue.createdAt} />
      </Property>
      <Property label="Updated">
        <TimeAgo at={issue.updatedAt} />
      </Property>
    </div>
  );
}
