import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Comment } from '../api/types';
import { ME } from '../api/seed';
import { commentCounted } from '../store/issues';
import { useAppDispatch } from '../store';

export const commentsKey = (issueId: string) => ['comments', issueId] as const;

export const useComments = (issueId: string | undefined) =>
  useQuery({ queryKey: commentsKey(issueId ?? ''), queryFn: () => api.comments(issueId!), enabled: !!issueId });

export function useAddComment(issueId: string) {
  const client = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (body: string) => api.addComment(issueId, body),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: commentsKey(issueId) });
      const previous = client.getQueryData<Comment[]>(commentsKey(issueId));
      const optimistic: Comment = { id: `optimistic-${Date.now()}`, issueId, authorId: ME.id, body, createdAt: Date.now(), editedAt: null };
      client.setQueryData<Comment[]>(commentsKey(issueId), (list = []) => [...list, optimistic]);
      return { previous };
    },
    onError: (_error, _body, context) => client.setQueryData(commentsKey(issueId), context?.previous),
    onSuccess: (comment) => {
      const list = client.getQueryData<Comment[]>(commentsKey(issueId)) ?? [];
      client.setQueryData<Comment[]>(
        commentsKey(issueId),
        list.map((c) => (c.id.startsWith('optimistic-') ? comment : c))
      );
      dispatch(commentCounted({ id: issueId, commentCount: list.length, updatedAt: comment.createdAt }));
    },
  });
}
