// The large app's cases: the patches from bugs/ they apply, the scenario that shows the waste, the root it starts at,
// the number a recording gives for it, and what a person would say about it — the symptom, never the cause. For the
// agent runs' graders: the files under src/ a fix may touch, and the ones an answer names the bug in, any of them.
const wasted = (show) => show.totals.rendersWithoutDom;
const root = (show, name) => show.topRoots.find((r) => r.root === name);
const hitsOf = (name) => (show) => root(show, name)?.hits ?? 0;
const mountsUnder = (name) => (show) => root(show, name)?.mounts ?? 0;
const noDomUnder = (name) => (show) => root(show, name)?.noDomChange ?? 0;
const msPerHit = (name) => (show) => root(show, name)?.renderMsPerHit ?? 0;
const cascadeOf = (name) => (show) => (root(show, name)?.hits ?? 0) * (root(show, name)?.perHit ?? 0);
const effectCommits = (show) => show.topCauses.filter((c) => c.key.startsWith('core:effect')).reduce((n, c) => n + c.commits, 0);
// Roots rank by the renders they cause, and a remount's children count as mounts, not renders: a remount bug is
// shown when its root leads by mounts.
// A bug that costs time rather than renders: its root takes 5 ms or more a hit. Ancestors rendering in the same
// commit count its time too, so ranking roots by time is no test.
const slowAt = (name) => (show) => (root(show, name)?.renderMsPerHit ?? 0) >= 5;
const leadsByMounts = (name) => (show) => [...show.topRoots].sort((a, b) => (b.mounts ?? 0) - (a.mounts ?? 0))[0]?.root === name;

export const BUGS = {
  // The auth context depends on the whole connection object: every heartbeat renders everything that reads it.
  'auth-connection': {
    scenario: 'wait-issues',
    root: 'IssuesToolbar',
    waste: hitsOf('IssuesToolbar'),
    files: ['context/AuthContext.tsx'],
    named: ['AuthContext.tsx'],
    complaint: 'Leaving the issue list open makes the laptop fan spin up, though nothing on the page seems to change.',
  },
  // An inline arrow per row: the memoized rows render whenever the list does.
  'row-callback': {
    scenario: 'wait-issues',
    root: 'IssuesPage',
    waste: wasted,
    files: ['features/issues/IssueTable.tsx', 'features/issues/IssueRow.tsx'],
    named: ['IssueTable.tsx', 'IssueRow.tsx'],
    complaint: 'The issue list stutters every time a teammate edits an issue.',
  },
  // The debounce is rebuilt with the callback it wraps, on every key: the list is filtered once per letter.
  'debounce-deps': {
    scenario: 'search',
    root: 'IssuesPage',
    waste: hitsOf('IssuesPage'),
    files: ['hooks/useDebouncedCallback.ts', 'features/issues/SearchBox.tsx'],
    named: ['useDebouncedCallback.ts'],
    complaint: 'Typing into the issue search lags, and the list jumps around after every letter.',
  },
  // A selector taking an object: its cache misses on every call, so each column gets a new array on every dispatch.
  'column-selector': {
    scenario: 'wait-board',
    root: 'BoardColumn',
    waste: noDomUnder('BoardColumn'),
    files: ['store/selectors.ts', 'features/board/BoardColumn.tsx'],
    named: ['selectors.ts', 'BoardColumn.tsx'],
    complaint: 'The board gets sluggish while the team is active, even in columns where nothing changed.',
  },
  // A card wrapped in a tooltip only while someone views it: the card remounts as viewers come and go.
  'conditional-tooltip': {
    scenario: 'wait-board',
    root: 'IssueCard',
    waste: mountsUnder('IssueCard'),
    shown: leadsByMounts('IssueCard'),
    files: ['features/board/IssueCard.tsx', 'components/ui/Tooltip.tsx'],
    named: ['IssueCard.tsx'],
    complaint: 'Cards on the board flicker when a teammate opens one of them.',
  },
  // withPermission() called in render: a new component type each time, so the comment box remounts and loses the text.
  'hoc-in-render': {
    scenario: 'comment',
    root: 'IssueDrawer',
    waste: mountsUnder('IssueDrawer'),
    visible: true,
    files: ['features/issues/IssueDrawer.tsx', 'components/withPermission.tsx'],
    named: ['IssueDrawer.tsx'],
    complaint: 'The comment box on an issue sometimes wipes what I am typing.',
  },
  // An effect copies the filtered list into state: a second commit after every change of the issues.
  'effect-filter': {
    scenario: 'wait-issues',
    root: 'IssuesPage',
    waste: effectCommits,
    files: ['features/issues/IssuesPage.tsx'],
    named: ['IssuesPage.tsx'],
    complaint: 'The issue list flashes "No issues match" when it opens, and feels heavier than it should when issues change.',
  },
  // The table hands its selection up from an effect: every tick of a checkbox is a second commit, from the page.
  'selection-effect': {
    scenario: 'select-rows',
    root: 'IssuesPage',
    waste: effectCommits,
    files: ['features/issues/IssueTable.tsx', 'features/issues/IssuesPage.tsx', 'features/issues/IssuesToolbar.tsx'],
    named: ['IssueTable.tsx'],
    complaint: 'Ticking issues in the list feels sluggish, and the count in the toolbar trails the checkboxes.',
  },
  // A prop getter hands every option new handlers: the memoized options all render as the pointer moves.
  'prop-getter': {
    scenario: 'hover-menu',
    root: 'Dropdown',
    waste: cascadeOf('Dropdown'),
    files: ['hooks/useListbox.ts', 'components/ui/Dropdown.tsx'],
    named: ['useListbox.ts', 'Dropdown.tsx'],
    complaint: 'Moving the pointer down the Assignee filter on the issue list feels sticky.',
  },
  // The composer's reference index built as useState's argument: rebuilt on every render and thrown away.
  'eager-init': {
    scenario: 'comment',
    root: 'CommentComposer',
    waste: msPerHit('CommentComposer'),
    shown: slowAt('CommentComposer'),
    files: ['features/issues/CommentComposer.tsx', 'lib/search.ts'],
    named: ['CommentComposer.tsx'],
    complaint: 'Writing a comment on a busy issue is choppy, while the rest of the page keeps up.',
  },
  // The chart's data rebuilt on every render, and the hover renders it.
  'chart-no-memo': {
    scenario: 'hover-chart',
    root: 'ThroughputChart',
    waste: msPerHit('ThroughputChart'),
    files: ['features/dashboard/ThroughputChart.tsx'],
    named: ['ThroughputChart.tsx'],
    complaint: 'Moving the mouse over the throughput chart on the dashboard is choppy.',
  },
  // The sidebar reads the whole app store, heartbeat included.
  'store-whole': {
    scenario: 'wait-issues',
    root: 'Sidebar',
    waste: hitsOf('Sidebar'),
    files: ['components/layout/Sidebar.tsx', 'store/app.ts'],
    named: ['Sidebar.tsx'],
    complaint: 'The app keeps using CPU while it sits idle on the issue list.',
  },
  // The members indexed in the query function: a Map is never structurally shared, so every poll renders every avatar.
  'query-index': {
    scenario: 'wait-issues',
    root: 'Avatar',
    waste: wasted,
    files: ['queries/members.ts'],
    named: ['members.ts'],
    complaint: 'The idle issue list hitches every couple of seconds.',
  },
  // The hovered row kept in the table: every row renders as the pointer moves.
  'hover-state': {
    scenario: 'hover-rows',
    root: 'IssueTable',
    waste: hitsOf('IssueTable'),
    files: ['features/issues/IssueTable.tsx', 'features/issues/IssueRow.tsx', 'app.css'],
    named: ['IssueTable.tsx', 'IssueRow.tsx'],
    complaint: 'Moving the pointer down the issue list feels laggy.',
  },
  // Three at once, as an app that grew for a while has them: all three must go.
  'three-bugs': {
    patches: ['auth-connection', 'query-index', 'effect-filter'],
    scenario: 'wait-issues',
    root: 'Avatar',
    waste: wasted,
    complaint: 'The issue list is heavy while idle: the fan spins up and the list hitches every few seconds.',
  },
  // None: what the idle list renders, it shows. The right answer is to change nothing.
  'no-bug': {
    patches: [],
    scenario: 'wait-issues',
    root: null,
    waste: wasted,
    complaint: 'A colleague says the issue list is slow when left open; I am not sure it is.',
  },
};
