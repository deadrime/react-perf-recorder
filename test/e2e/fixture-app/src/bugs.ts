/**
 * Seeded re-render bugs, on by URL: `/?bugs=whole-object,field-state`. Each is a pattern any React app can have;
 * the e2e tests check that a recording points at it.
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

const enabled = new Set((new URLSearchParams(location.search).get('bugs') ?? '').split(',').filter(Boolean));

export const bug = (name: Bug) => enabled.has(name);
