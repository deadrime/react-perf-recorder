// What each case's bug costs, for check.mjs and verify.mjs: the root its wasted renders start at, and the number a
// recording gives for that waste. The case without a bug has no root to find. Orbit's cases (orbit-<bug>-rec) take
// theirs from the large app's own list, all but its no-bug (test/eval-large/evals.mjs says why).
import { BUGS } from '../eval-large/cases.mjs';

const wasted = (show) => show.totals.rendersWithoutDom;
const root = (show, name) => show.topRoots.find((r) => r.root === name);
// Where the bug is the root's own render, its hits: memo on the children would cut the renders without a DOM change
// and leave the root rendering on every event, which is not the fix.
const hitsOf = (name) => (show) => root(show, name)?.hits ?? 0;

export const CASES = {
  'whole-object-rec': { root: 'Unread', waste: hitsOf('Unread') },
  'form-watch': { root: 'Composer', waste: hitsOf('Composer') },
  'form-watch-rec': { root: 'Composer', waste: hitsOf('Composer') },
  'field-state-rec': { root: 'MetaInput', waste: wasted },
  'memo-cache-slot-rec': { root: 'Status', waste: wasted },
  'new-array-selector-rec': { root: 'MessageList', waste: wasted },
  'router-in-layout-rec': { root: 'ChatView', waste: hitsOf('ChatView') },
  'exact-value-rec': { root: 'TimeAgo', waste: wasted },
  'effect-derived-state-rec': { root: 'ChatPanel', waste: hitsOf('ChatPanel') },
  'inline-context-rec': { root: 'SettingsBySync', waste: wasted },
  // The box's input is remounted, not re-rendered: its mounts are the waste.
  'nested-component-rec': { root: 'MessageInput', waste: (show) => root(show, 'MessageInput')?.mounts ?? 0 },
  // The waste is time: the member list sorting on every poll.
  'expensive-render-rec': { root: 'ChannelStats', waste: (show) => root(show, 'ChannelStats')?.renderMsPerHit ?? 0 },
  'draft-context-rec': { root: 'Layout', waste: hitsOf('Layout') },
  // connect() wraps the component, and its wrapper is the root.
  'connect-filter-rec': { root: 'Connect(ActivityLog)', waste: hitsOf('Connect(ActivityLog)') },
  'query-rest-rec': { root: 'ChannelTopic', waste: hitsOf('ChannelTopic') },
  // The cause is two files from the root: the component reads a hook that reads a helper.
  'hook-reads-all-rec': { root: 'MessageCount', waste: hitsOf('MessageCount') },
  // The store's writer is the bug; the component reading it is right.
  'prefs-on-tick-rec': { root: 'PrefsLine', waste: hitsOf('PrefsLine') },
  // One real cause among harmless look-alikes in other files.
  'decoys-rec': { root: 'TypingBadge', waste: hitsOf('TypingBadge') },
  // Only the rows nobody reacted to render for nothing.
  'fallback-array-rec': { root: 'Attachments', waste: wasted },
  // A frequent cheap waste and a rare costly one: the cost is what the person feels.
  // Its recording names it by time, not by count: the root that costs most per render.
  'cost-over-count-rec': {
    root: 'OnlineNow',
    waste: (show) => root(show, 'OnlineNow')?.renderMsPerHit ?? 0,
    shown: (show) => [...show.topRoots].sort((a, b) => (b.renderMsPerHit ?? 0) - (a.renderMsPerHit ?? 0))[0]?.root === 'OnlineNow',
  },
  'two-bugs-rec': { root: 'Unread', waste: wasted },
  'no-bug-rec': { root: null, waste: wasted },
  ...Object.fromEntries(
    Object.entries(BUGS)
      .filter(([bug, c]) => (c.patches ?? [bug]).length)
      .map(([bug, { root, waste, shown }]) => [`orbit-${bug}-rec`, { root, waste, shown }])
  ),
};
