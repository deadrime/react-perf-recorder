import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

interface Both {
  user: string;
  theme: string;
}

const BothContext = createContext<Both>({ user: 'Anna', theme: 'dark' });
const UserContext = createContext('Anna');
const ThemeContext = createContext('dark');

const Who = ({ user, renders }: { user: string; renders: number }) => (
  <li data-testid="who">
    <span className="grow">signed in as {user}</span>
    <RenderCount n={renders} />
  </li>
);

const Swatch = ({ theme, renders }: { theme: string; renders: number }) => (
  <li data-testid="swatch">
    <span className="grow">theme: {theme}</span>
    <RenderCount n={renders} />
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

export const Contexts = () => {
  const [user, setUser] = useState('Anna');
  const [theme, setTheme] = useState('dark');
  return (
    <Case
      title="one context for two unrelated things"
      what={
        <>
          Two readers: one shows who is signed in, the other the theme. On the left both values live in one context, so
          changing the theme renders the reader that only cares about the user. On the right they are two contexts, and
          each reader hears only its own news.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="user" onClick={() => setUser((u) => (u === 'Anna' ? 'Boris' : 'Anna'))}>
          Change the user
        </button>
        <button type="button" data-testid="theme" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          Change the theme
        </button>
      </p>
      <div className="two">
        <Panel kind="broken" title="{ user, theme } in one context" says="The recorder says: context BothContext on a reader whose own value never changed.">
          <TogetherProvider user={user} theme={theme}>
            {TOGETHER}
          </TogetherProvider>
        </Panel>
        <Panel kind="fixed" title="a context each" says="The recorder says: only the reader of the context that changed, and only when it changed.">
          <UserContext.Provider value={user}>
            <ThemeContext.Provider value={theme}>{APART}</ThemeContext.Provider>
          </UserContext.Provider>
        </Panel>
      </div>
    </Case>
  );
};
