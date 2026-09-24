import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Case, createDriver, Pair, Panel, RenderCount, useRenderCount } from './Case';

interface Both {
  user: string;
  theme: string;
}

const BROKEN = `
const AppContext = createContext({ user, theme });   // ← two unrelated things in one context

const Who = () => <li>signed in as {useContext(AppContext).user}</li>;
const Swatch = () => <li>theme: {useContext(AppContext).theme}</li>;

// changing the theme gives both of them a new context value`;

const FIXED = `
const UserContext = createContext(user);     // ← one context per thing
const ThemeContext = createContext(theme);

const Who = () => <li>signed in as {useContext(UserContext)}</li>;
const Swatch = () => <li>theme: {useContext(ThemeContext)}</li>;

// changing the theme reaches the reader of the theme`;

const BROKEN_INLINE = `
const SessionProvider = ({ user, theme, children }) => (
  <SessionContext.Provider value={{ user, theme }}>   // ← a new object every time the provider renders
    {children}
  </SessionContext.Provider>
);`;

const FIXED_INLINE = `
const SessionProvider = ({ user, theme, children }) => {
  const value = useMemo(() => ({ user, theme }), [user, theme]);   // ← the same object until one of them changes
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};`;

const BothContext = createContext<Both>({ user: 'Anna', theme: 'dark' });
const UserContext = createContext('Anna');
const ThemeContext = createContext('dark');

const Who = ({ user, renders }: { user: string; renders: number }) => (
  <li data-testid="who">
    <span className="grow">signed in as {user}</span>
    <RenderCount renders={renders} />
  </li>
);

const Swatch = ({ theme, renders }: { theme: string; renders: number }) => (
  <li data-testid="swatch">
    <span className="grow">theme: {theme}</span>
    <RenderCount renders={renders} />
  </li>
);

/** Both values in one context: whoever reads it hears about the other one too. */
const TogetherProvider = ({ user, theme, children }: Both & { children: ReactNode }) => {
  const value = useMemo(() => ({ user, theme }), [user, theme]);
  return <BothContext.Provider value={value}>{children}</BothContext.Provider>;
};

// Each reader reads its context itself, as a component in an app would: no memo stands between them.
const TogetherUser = () => <Who user={useContext(BothContext).user} renders={useRenderCount()} />;
const TogetherTheme = () => <Swatch theme={useContext(BothContext).theme} renders={useRenderCount()} />;

const ApartUser = () => <Who user={useContext(UserContext)} renders={useRenderCount()} />;
const ApartTheme = () => <Swatch theme={useContext(ThemeContext)} renders={useRenderCount()} />;

const InlineContext = createContext<Both>({ user: 'Anna', theme: 'dark' });
const StableContext = createContext<Both>({ user: 'Anna', theme: 'dark' });

/** How often a provider rendered: the line above its readers, so the two numbers can be compared at a glance. */
const ProviderRenders = ({ renders }: { renders: number }) => (
  <p className="muted" data-provider-renders={renders}>
    the provider rendered {renders}×
  </p>
);

/** Hands out a new object every time it renders, whatever it renders for. */
const InlineProvider = ({ user, theme, children }: Both & { children: ReactNode }) => (
  <>
    <ProviderRenders renders={useRenderCount()} />
    <InlineContext.Provider value={{ user, theme }}>{children}</InlineContext.Provider>
  </>
);

/** Renders just as often, but hands out the object it had until user or theme really change. */
const StableProvider = ({ user, theme, children }: Both & { children: ReactNode }) => {
  const value = useMemo(() => ({ user, theme }), [user, theme]);
  return (
    <>
      <ProviderRenders renders={useRenderCount()} />
      <StableContext.Provider value={value}>{children}</StableContext.Provider>
    </>
  );
};

const InlineUser = () => <Who user={useContext(InlineContext).user} renders={useRenderCount()} />;
const InlineTheme = () => <Swatch theme={useContext(InlineContext).theme} renders={useRenderCount()} />;
const StableUser = () => <Who user={useContext(StableContext).user} renders={useRenderCount()} />;
const StableTheme = () => <Swatch theme={useContext(StableContext).theme} renders={useRenderCount()} />;

/**
 * The readers are written once, outside the render: in an app they sit deep under the provider and are not rebuilt
 * when it re-renders. Without that, everything below the state would render anyway and the contexts would prove
 * nothing.
 */
const TOGETHER = (
  <ul className="rows">
    <TogetherUser />
    <TogetherTheme />
  </ul>
);

const APART = (
  <ul className="rows">
    <ApartUser />
    <ApartTheme />
  </ul>
);

const INLINE = (
  <ul className="rows">
    <InlineUser />
    <InlineTheme />
  </ul>
);

const STABLE = (
  <ul className="rows">
    <StableUser />
    <StableTheme />
  </ul>
);

const users = createDriver('Anna');
const themes = createDriver('dark');
/** One clock for both sides of the second pair, so their providers render together. */
const seconds = createDriver(0);

/** The page's user and theme, handed to a provider the way a page hands them down. */
const Together = () => (
  <TogetherProvider user={users.use()} theme={themes.use()}>
    {TOGETHER}
  </TogetherProvider>
);
const Apart = () => (
  <UserContext.Provider value={users.use()}>
    <ThemeContext.Provider value={themes.use()}>{APART}</ThemeContext.Provider>
  </UserContext.Provider>
);

/**
 * A shell above the provider that renders every second for a reason of its own — a layout or a session shell
 * high in an app — and takes the provider with it: nothing in its value changes on those renders, and that is what
 * tells the two providers apart.
 */
const Shell = ({ provider: Provider, children }: { provider: typeof InlineProvider; children: ReactNode }) => {
  seconds.use();
  return (
    <Provider user={users.use()} theme={themes.use()}>
      {children}
    </Provider>
  );
};

export const Contexts = () => {
  useEffect(() => {
    const id = setInterval(() => seconds.set((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Case
      title="who a context wakes up"
      what={
        <>
          Every reader of a context renders when its value changes, and <em>changes</em> means a new object, not new content. So a context that
          carries two unrelated things wakes the reader of the other one, and a value object built inside the provider wakes every reader each time
          the provider renders — with nothing new in it. In the second pair a shell above each provider renders it every second, as a layout or a
          session shell high in an app does; the user and the theme are the page's, so the buttons change them on both sides.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="user" onClick={() => users.set((u) => (u === 'Anna' ? 'Boris' : 'Anna'))}>
          Change the user
        </button>
        <button type="button" data-testid="theme" onClick={() => themes.set((t) => (t === 'dark' ? 'light' : 'dark'))}>
          Change the theme
        </button>
      </p>
      <Pair id="split" title="two unrelated things in one context">
        <Panel
          kind="broken"
          title="{ user, theme } in one context"
          says="The recorder says: context BothContext on a reader whose own value never changed."
          code={BROKEN}
        >
          <Together />
        </Panel>
        <Panel
          kind="fixed"
          title="a context each"
          says="The recorder says: only the reader of the context that changed, and only when it changed."
          code={FIXED}
        >
          <Apart />
        </Panel>
      </Pair>
      <Pair id="inline" title="a value object built in the provider">
        <Panel
          kind="broken"
          title="value={{ user, theme }}"
          says="The recorder says: context InlineContext SAME-CONTENT on both readers, every second — the same user and theme, in a new object."
          code={BROKEN_INLINE}
        >
          <Shell provider={InlineProvider}>{INLINE}</Shell>
        </Panel>
        <Panel
          kind="fixed"
          title="useMemo(() => ({ user, theme }))"
          says="The recorder says nothing while the provider renders on its own; when the theme really changes, both readers render — and show it."
          code={FIXED_INLINE}
        >
          <Shell provider={StableProvider}>{STABLE}</Shell>
        </Panel>
      </Pair>
    </Case>
  );
};
