// What each case's bug costs, for check.mjs and verify.mjs: the root its wasted renders start at, and the number a
// recording gives for that waste. The case without a bug has no root to find.
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
  'two-bugs-rec': { root: 'Unread', waste: wasted },
  'no-bug-rec': { root: null, waste: wasted },
};
