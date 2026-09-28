import type { IssueStatus } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Dropdown } from '../../components/ui/Dropdown';
import { StatusIcon } from '../../components/ui/Badges';
import { useToast } from '../../context/ToastContext';
import { STATUSES, STATUS_LABEL } from '../../lib/meta';
import { useMembers } from '../../queries/members';
import { useAppDispatch } from '../../store';
import { updateIssue } from '../../store/issues';

export function BulkBar({ ids, onClear }: { ids: Set<string>; onClear(): void }) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { data: members = [] } = useMembers();
  const apply = (patch: Parameters<typeof updateIssue>[0]['patch'], what: string) => {
    ids.forEach((id) => dispatch(updateIssue({ id, patch })));
    toast(`${what} for ${ids.size} issue${ids.size > 1 ? 's' : ''}`, { tone: 'success' });
    onClear();
  };
  return (
    <div className="bulk" data-testid="bulk-bar">
      <strong>{ids.size} selected</strong>
      <Dropdown<IssueStatus>
        trigger={<span className="btn btn-secondary btn-sm">Status</span>}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: <StatusIcon status={s} /> }))}
        selected={[]}
        onSelect={(status) => apply({ status }, `Status set to ${STATUS_LABEL[status]}`)}
      />
      <Dropdown<string>
        trigger={<span className="btn btn-secondary btn-sm">Assignee</span>}
        options={members.map((m) => ({ value: m.id, label: m.name }))}
        selected={[]}
        searchable
        onSelect={(assigneeId) => apply({ assigneeId }, 'Assignee changed')}
      />
      <div className="grow" />
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
