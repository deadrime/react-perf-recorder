import { useEffect } from 'react';
import { server } from '../api/client';
import { ISSUES, ME, MEMBERS } from '../api/seed';
import type { ActivityEvent, IssuePatch, IssueStatus, NotificationKind, Priority } from '../api/types';
import { TICK_MS } from '../config';
import { queryClient } from '../queries/client';
import { commentsKey } from '../queries/comments';
import { store } from '../store';
import { activityReceived } from '../store/activity';
import { useAppStore } from '../store/app';
import { commentCounted, issueReceived } from '../store/issues';
import { notificationReceived } from '../store/notifications';
import { usePresenceStore } from '../store/presence';

// A worker stands in for the realtime socket: its frames reach the page as `message` events, like a WebSocket's.
const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${TICK_MS});`;

const TEAMMATES = MEMBERS.filter((m) => m.id !== ME.id);
/** The issues people are busy with this morning. */
const HOT = ['WEB-1', 'WEB-2', 'WEB-3', 'WEB-5', 'WEB-8', 'WEB-13', 'API-4', 'MOB-2', 'DS-7', 'WEB-21', 'OPS-3', 'WEB-34'].map(
  (key) => ISSUES.find((i) => i.key === key)!
);
const STATUS_FLOW: IssueStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'todo'];
const COMMENTS = ['On it.', 'Pushed a fix to the branch, can you check?', 'This is blocked on the API change.', 'LGTM', 'Reproduced on staging.'];

const teammate = (step: number) => TEAMMATES[step % TEAMMATES.length];
const hot = (step: number) => HOT[step % HOT.length];
let activityId = 0;

function activity(event: Omit<ActivityEvent, 'id' | 'at'>) {
  store.dispatch(activityReceived({ ...event, id: `rt-a${++activityId}`, at: Date.now() }));
}

/** Someone else edits an issue: the server applies it and broadcasts the result. */
function remoteEdit(step: number) {
  const target = server.getIssue(hot(step).id)!;
  const actor = teammate(step);
  const kind = (['status', 'priority', 'assignee', 'estimate'] as const)[Math.floor(step / 7) % 4];
  let patch: IssuePatch;
  let from: string | number | null;
  let to: string | number | null;
  if (kind === 'status') {
    const next = STATUS_FLOW[(STATUS_FLOW.indexOf(target.status) + 1) % STATUS_FLOW.length] ?? 'in_progress';
    [patch, from, to] = [{ status: next }, target.status, next];
  } else if (kind === 'priority') {
    const next = (((target.priority + 1) % 5) as Priority) || 1;
    [patch, from, to] = [{ priority: next as Priority }, target.priority, next];
  } else if (kind === 'assignee') {
    [patch, from, to] = [{ assigneeId: actor.id }, target.assigneeId, actor.id];
  } else {
    const next = [1, 2, 3, 5, 8][step % 5];
    [patch, from, to] = [{ estimate: next }, target.estimate, next];
  }
  store.dispatch(issueReceived(server.applyIssue(target.id, patch)));
  activity({ kind, issueId: target.id, actorId: actor.id, from, to });
}

function remoteComment(step: number) {
  const target = hot(step + 3);
  const actor = teammate(step + 1);
  const { comment, issue } = server.applyComment(target.id, actor.id, COMMENTS[step % COMMENTS.length]);
  // Only threads someone has open are in the cache; the others are fetched fresh when opened.
  if (queryClient.getQueryData(commentsKey(target.id)))
    queryClient.setQueryData(commentsKey(target.id), (list: unknown[] = []) => [...list, comment]);
  store.dispatch(commentCounted({ id: issue.id, commentCount: issue.commentCount, updatedAt: issue.updatedAt }));
  activity({ kind: 'comment', issueId: target.id, actorId: actor.id });
}

function notify(step: number) {
  const kinds: NotificationKind[] = ['mentioned', 'assigned', 'commented', 'status_changed'];
  store.dispatch(
    notificationReceived({
      id: `rt-n${step}`,
      kind: kinds[step % kinds.length],
      issueId: hot(step + 5).id,
      actorId: teammate(step + 2).id,
      createdAt: Date.now(),
      readAt: null,
    })
  );
}

function presence(step: number) {
  const state = usePresenceStore.getState();
  const who = teammate(step * 5);
  // Half the time on one of the hot issues, otherwise somewhere else in the app.
  state.setViewing(who.id, step % 4 === 0 ? null : hot(step >> 1).key);
  if (step % 11 === 0) {
    const key = hot(step).key;
    state.setTyping(key, step % 22 === 0 ? [] : [teammate(step + 4).id]);
  }
  if (step % 30 === 0 || state.online.length === 0) {
    state.setOnline(TEAMMATES.filter((_, i) => (i + Math.floor(step / 30)) % 4 !== 0).map((m) => m.id));
  }
}

function onFrame(step: number) {
  if (step % 3 === 0) useAppStore.getState().heartbeat(24 + ((step * 13) % 40));
  if (step % 2 === 0) presence(step);
  if (step % 7 === 0) remoteEdit(step);
  if (step % 17 === 0) remoteComment(step);
  if (step % 23 === 0) notify(step);
}

export function useRealtime() {
  useEffect(() => {
    const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => onFrame(event.data.step));
    presence(0);
    return () => {
      socket.terminate();
      useAppStore.getState().setConnection('reconnecting');
    };
  }, []);
}
