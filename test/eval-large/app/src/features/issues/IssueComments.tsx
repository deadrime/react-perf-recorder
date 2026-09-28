import { memo } from 'react';
import type { Comment } from '../../api/types';
import { Avatar } from '../../components/ui/Avatar';
import { Spinner } from '../../components/ui/Misc';
import { TimeAgo } from '../../components/ui/TimeAgo';
import { useComments } from '../../queries/comments';
import { useMember } from '../../queries/members';
import { useTyping } from '../../store/presence';
import { RichText } from './RichText';

const CommentItem = memo(function CommentItem({ comment }: { comment: Comment }) {
  const author = useMember(comment.authorId);
  return (
    <li className="comment" data-testid="comment">
      <Avatar id={comment.authorId} />
      <div className="grow">
        <div className="row gap-sm">
          <strong>{author?.name ?? '…'}</strong>
          <span className="muted small">
            <TimeAgo at={comment.createdAt} />
          </span>
          {comment.id.startsWith('optimistic-') && <span className="muted small">Sending…</span>}
        </div>
        <RichText text={comment.body} />
      </div>
    </li>
  );
});

function TypingLine({ issueKey }: { issueKey: string }) {
  const typing = useTyping(issueKey);
  const first = useMember(typing[0]);
  if (!typing.length) return <div className="typing" />;
  return (
    <div className="typing muted small" data-testid="typing">
      {first?.name.split(' ')[0] ?? 'Someone'} {typing.length > 1 ? `and ${typing.length - 1} more are` : 'is'} typing…
    </div>
  );
}

export function IssueComments({ issueId, issueKey }: { issueId: string; issueKey: string }) {
  const { data: comments, isLoading } = useComments(issueId);
  return (
    <section className="comments" data-testid="comments">
      <h3>Activity</h3>
      {isLoading ? (
        <Spinner label="Loading comments" />
      ) : (
        <ul>
          {comments?.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </ul>
      )}
      <TypingLine issueKey={issueKey} />
    </section>
  );
}
