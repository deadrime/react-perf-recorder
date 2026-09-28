import { memo, useRef, useState } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { buildReferenceIndex, searchReferences, type ReferenceIndex } from '../../lib/search';
import { useAddComment } from '../../queries/comments';
import { useMembers } from '../../queries/members';
import { useAppSelector } from '../../store';
import { selectAllIssues } from '../../store/selectors';

const MAX = 2000;

interface Values {
  body: string;
}

interface Props {
  issueId: string;
  issueKey: string;
}

function CharCount({ control }: { control: Control<Values> }) {
  const body = useWatch({ control, name: 'body' });
  if (body.length < MAX * 0.8) return null;
  return <span className={body.length > MAX ? 'danger small' : 'muted small'}>{MAX - body.length}</span>;
}

/** `@ann` at the caret: the members whose handle starts with it. */
function MentionMenu({ query, onPick }: { query: string; onPick(handle: string): void }) {
  const { data: members = [] } = useMembers();
  const matches = members.filter((m) => m.handle.startsWith(query.toLowerCase())).slice(0, 5);
  if (!matches.length) return null;
  return (
    <ul className="menu mention-menu">
      {matches.map((m) => (
        <li key={m.id} className="menu-item" onMouseDown={(e) => (e.preventDefault(), onPick(m.handle))}>
          <span className="dot" style={{ background: m.color }} />
          <span className="grow">{m.name}</span>
          <span className="muted small">@{m.handle}</span>
        </li>
      ))}
    </ul>
  );
}

/** `#web` at the caret: the issues it could refer to. */
function ReferenceMenu({ index, query, onPick }: { index: ReferenceIndex; query: string; onPick(key: string): void }) {
  const matches = searchReferences(index, query);
  if (!matches.length) return null;
  return (
    <ul className="menu mention-menu">
      {matches.map((m) => (
        <li key={m.key} className="menu-item" onMouseDown={(e) => (e.preventDefault(), onPick(m.key))}>
          <strong className="small">{m.key}</strong>
          <span className="grow">{m.title}</span>
        </li>
      ))}
    </ul>
  );
}

export const CommentComposer = memo(function CommentComposer({ issueId }: Props) {
  const { register, handleSubmit, reset, setValue, getValues, control, formState } = useForm<Values>({ defaultValues: { body: '' } });
  const addComment = useAddComment(issueId);
  const toast = useToast();
  const issues = useAppSelector(selectAllIssues);
  const [references] = useState(() => buildReferenceIndex(issues));
  const [mention, setMention] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const field = register('body', { required: true, maxLength: MAX, validate: (v) => v.trim().length > 0 });
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  const trackMention = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const match = /@(\w*)$/.exec(before);
    setMention(match ? match[1] : null);
    const ref = /#([\w-]*)$/.exec(before);
    setReference(ref ? ref[1] : null);
  };

  const insert = (pattern: RegExp, text: string) => {
    const el = textarea.current!;
    const before = el.value.slice(0, el.selectionStart).replace(pattern, `${text} `);
    setValue('body', before + el.value.slice(el.selectionStart), { shouldDirty: true });
    setMention(null);
    setReference(null);
    el.focus();
  };

  const submit = handleSubmit(({ body }) => {
    addComment.mutate(body.trim(), { onError: () => toast('Could not post the comment', { tone: 'error' }) });
    reset();
  });

  return (
    <form className="composer" onSubmit={submit} data-testid="composer">
      <div className="composer-field">
        <textarea
          {...field}
          ref={(el) => {
            field.ref(el);
            textarea.current = el;
          }}
          rows={3}
          className="input"
          placeholder="Leave a comment… Use @ to mention, # to link an issue"
          data-testid="comment-input"
          onChange={(e) => {
            field.onChange(e);
            trackMention(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === 'Escape') {
              setMention(null);
              setReference(null);
            }
          }}
          onBlur={(e) => {
            field.onBlur(e);
            setMention(null);
            setReference(null);
          }}
        />
        {mention !== null && <MentionMenu query={mention} onPick={(handle) => insert(/@\w*$/, `@${handle}`)} />}
        {reference !== null && <ReferenceMenu index={references} query={reference} onPick={(key) => insert(/#[\w-]*$/, `#${key}`)} />}
      </div>
      <div className="row gap">
        <CharCount control={control} />
        <div className="grow" />
        <Button type="submit" variant="primary" size="sm" disabled={!formState.isDirty || !getValues('body').trim()} loading={addComment.isPending}>
          Comment
        </Button>
      </div>
    </form>
  );
});

export function ReadOnlyComposer() {
  return <p className="muted small">You can read this issue, but only members can comment.</p>;
}
