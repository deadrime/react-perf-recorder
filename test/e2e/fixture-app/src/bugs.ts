/**
 * Seeded re-render bugs, one per page: `/bug/whole-object` (several at once with `/bug/whole-object,field-state`).
 * Each is a pattern any React app can have; the demo page at `/` lists them, `/app` is the same app with none of
 * them on, and the e2e tests check that a recording points at each one.
 */
export type Bug =
  /** A component subscribes to a whole store object and shows one field of it. */
  | 'whole-object'
  /** A live subscription where a snapshot at render time is enough. */
  | 'live-subscription'
  /** `fieldState` from useController: every errors event of the form renders the field. */
  | 'field-state'
  /** `watch()` in the form root: every keystroke renders the whole form. */
  | 'form-watch'
  /** memoizeWithArgs with its default single slot, shared by rows with different args. */
  | 'memo-cache-slot'
  /** A selector that builds a new array on every call. */
  | 'new-array-selector'
  /** A JSX element created in render and passed to a memo component. */
  | 'inline-jsx-prop'
  /** A context value object built inline in a provider that renders often. */
  | 'inline-context'
  /** A layout hook that reads the URL: every navigation renders the whole page. */
  | 'router-in-layout'
  /** An exact value subscribed where only a rounded one is shown: renders with no DOM change. */
  | 'exact-value'
  /** A component declared inside another component's render: remounted every time. */
  | 'nested-component'
  /** A custom hook keeps a ticking state its caller never shows. */
  | 'hidden-hook-state'
  /** State copied from props in an effect: a second commit after every change. */
  | 'effect-derived-state';

/** What the page has to be doing for the bug to show. */
export type Scenario = 'wait' | 'type' | 'tabs';

export interface BugCard {
  title: string;
  /** The mistake in one sentence, as it would be written in a review. */
  what: string;
  scenario: Scenario;
  /** What the recording says once it is stopped: the point of the demo. */
  shows: string;
  /** Where the two versions of the code live, the clean one next to the broken one. */
  file: string;
}

export const SCENARIOS: Record<Scenario, { short: string; long: string }> = {
  wait: { short: 'wait a few seconds', long: 'just wait a few seconds — reactions and read receipts keep arriving' },
  type: { short: 'type a message', long: 'type a few words into the message box' },
  tabs: { short: 'switch tabs', long: 'switch the chat / people tabs' },
};

/** A card per bug: adding a flag to `Bug` without describing it here does not compile. */
export const BUGS: Record<Bug, BugCard> = {
  'whole-object': {
    title: 'Subscribed to the whole store object',
    what: 'The header takes the whole workspace object out of the store to show one number of it.',
    scenario: 'wait',
    shows: 'Unread as a cascade root with external store [useChatStore] selectWorkspace, every render without a DOM change.',
    file: 'src/components/Header.tsx',
  },
  'live-subscription': {
    title: 'A live subscription where a snapshot would do',
    what: 'The message box subscribes to the presence store although it only reads who is typing while it renders.',
    scenario: 'wait',
    shows: 'MessageInput as a root with external store [presenceStore], caused by zustand:presenceStore.setState and nothing else.',
    file: 'src/components/Composer/index.tsx',
  },
  'field-state': {
    title: 'fieldState renders the field on every errors event',
    what: 'useController with fieldState subscribes a field to the whole form’s errors, not to its own value.',
    scenario: 'type',
    shows: 'Both small fields render on keystrokes in the message box: state #N behind useMetaWithFieldState › [react-hook-form] useController.',
    file: 'src/components/Composer/index.tsx',
  },
  'form-watch': {
    title: 'watch() in the form root',
    what: 'The composer watches its own values, so every keystroke renders the whole form.',
    scenario: 'type',
    shows: 'Composer as the root with [react-hook-form] useForm; the fields below say parent: props equal — memo would have skipped them.',
    file: 'src/components/Composer/index.tsx',
  },
  'memo-cache-slot': {
    title: 'One memo slot for rows with different arguments',
    what: 'memoizeWithArgs keeps a single cache slot, and three message rows call it with three ids in turn.',
    scenario: 'wait',
    shows: 'The proxy-memoize section marks selectMessageInfo as thrash, and the rows re-render with SAME-CONTENT.',
    file: 'src/store/selectors.ts',
  },
  'new-array-selector': {
    title: 'A selector that builds a new array on every call',
    what: 'Object.keys() in a selector returns a new array each time, so the list re-subscribes on every store write.',
    scenario: 'wait',
    shows: 'MessageList with external store SAME-CONTENT [useChatStore] selectFreshIds — a new reference, the same ids.',
    file: 'src/components/Messages.tsx',
  },
  'inline-jsx-prop': {
    title: 'A JSX element built in render defeats memo',
    what: 'A prop holds an element created during render, so it is a new object on every render of the parent.',
    scenario: 'type',
    shows: 'StatRow renders with parent: props same: title — the prop changed identity, not content.',
    file: 'src/components/Composer/index.tsx',
  },
  'inline-context': {
    title: 'A context value built inline in a provider',
    what: 'The provider passes a fresh object as its value, so every consumer renders whenever the provider does.',
    scenario: 'wait',
    shows: 'TimezoneBadge with context SettingsContext SAME-CONTENT, and no DOM change behind any of those renders.',
    file: 'src/components/Settings.tsx',
  },
  'router-in-layout': {
    title: 'A layout hook that reads the URL',
    what: 'useSearchParams sits in a hook the whole layout calls, so switching a tab renders the page instead of the tab.',
    scenario: 'tabs',
    shows: 'ChatView with context Location, caused by core:navigation push, pulling more renders than the panel below it.',
    file: 'src/components/ChatView.tsx',
  },
  'exact-value': {
    title: 'An exact value where a rounded one is shown',
    what: 'The sync bar subscribes to the exact percentage but draws it in steps of ten, so most updates change nothing.',
    scenario: 'wait',
    shows: 'SyncBar renders again and again with no DOM change at all — the clearest case of wasted work.',
    file: 'src/components/Header.tsx',
  },
  'nested-component': {
    title: 'A component declared inside a render',
    what: 'A component defined in the body of another one is a new type on every render, so React remounts its subtree.',
    scenario: 'wait',
    shows: 'NestedStatus that mounts but never renders, and DOM nodes added and removed on a page that only changes text.',
    file: 'src/components/Messages.tsx',
  },
  'hidden-hook-state': {
    title: 'A hook keeps a ticking state nobody shows',
    what: 'A custom hook holds a clock in state to derive a boolean, so its caller renders four times a second for nothing.',
    scenario: 'wait',
    shows: 'TypingBadge with state #0 behind useTypingByClock › useNow, caused by core:timer setInterval @ src/components/TypingBadge.tsx.',
    file: 'src/components/TypingBadge.tsx',
  },
  'effect-derived-state': {
    title: 'State copied from props in an effect',
    what: 'An effect copies the active tab into state, so every switch costs a second commit after the first one.',
    scenario: 'tabs',
    shows: 'ChatPanel commits twice per switch, the second one caused by core:effect @ src/components/ChatPanel.tsx.',
    file: 'src/components/ChatPanel.tsx',
  },
};

const onThisPage = /^\/bug\/(.+)$/.exec(decodeURIComponent(location.pathname))?.[1] ?? '';
const enabled = new Set(onThisPage.split(',').filter(Boolean));

export const bug = (name: Bug) => enabled.has(name);

/** The bugs turned on for this page, for the strip that tells the visitor what to look for. */
export const enabledBugs = (): Bug[] => (Object.keys(BUGS) as Bug[]).filter((id) => enabled.has(id));
