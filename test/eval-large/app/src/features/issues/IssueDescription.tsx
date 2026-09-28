import { useState } from 'react';
import type { Issue } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppDispatch } from '../../store';
import { updateIssue } from '../../store/issues';
import { RichText } from './RichText';

export function IssueDescription({ issue }: { issue: Issue }) {
  const { can } = useAuth();
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: issue.title, description: issue.description });

  if (editing)
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch(updateIssue({ id: issue.id, patch: draft }));
          setEditing(false);
        }}
      >
        <input className="input input-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <textarea className="input" rows={6} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <div className="row gap">
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );

  return (
    <div className="stack">
      <h2 className="issue-title" data-testid="issue-title">
        {issue.title}
      </h2>
      <RichText text={issue.description} />
      {can('issue:edit') && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft({ title: issue.title, description: issue.description });
              setEditing(true);
            }}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}
