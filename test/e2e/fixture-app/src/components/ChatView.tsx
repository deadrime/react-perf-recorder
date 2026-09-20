import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bug } from '../bugs';
import { BugStrip } from '../Demo';
import { useChatStore } from '../store/chat';
import { ChannelStats } from './ChannelStats';
import { ChatPanel } from './ChatPanel';
import { Composer } from './Composer';
import { Header } from './Header';
import { SettingsProvider } from './Settings';
import { TypingLine } from './TypingLine';
import { WebhookForm } from './WebhookForm';

function useLayoutWithParams() {
  useSearchParams();
  return { wide: true };
}

function useLayout() {
  return { wide: true };
}

/** A layout hook that also read the URL made the whole page render on every tab switch. */
const useChatLayout = bug('router-in-layout') ? useLayoutWithParams : useLayout;

export const ChatView = () => {
  const { wide } = useChatLayout();
  return (
    <main className={wide ? 'chat wide' : 'chat'}>
      <div className="thread">
        <ChatPanel />
        <Composer />
      </div>
      <aside className="side" data-testid="side-panel">
        <h3>Channel</h3>
        <ChannelStats />
        <h3>Webhook</h3>
        <WebhookForm />
      </aside>
    </main>
  );
};

/** Renders on every tick; the page below comes as children and skips, unless the settings object is new. */
/** Subscribed to the feed only when the bug asks for it: a provider that renders for nothing is the bug itself. */
function useDenseByTick() {
  return useChatStore((s) => s.workspace.lastEventAt) < 0;
}

function useDense() {
  return false;
}

const useDenseSetting = bug('inline-context') ? useDenseByTick : useDense;

/** With the bug on this renders on every tick; the page below comes as children and skips, the settings do not. */
const SettingsBySync = ({ children }: { children: ReactNode }) => <SettingsProvider dense={useDenseSetting()}>{children}</SettingsProvider>;

export const Layout = () => (
  <SettingsBySync>
    <BugStrip />
    <div className="app">
      <Header />
      <TypingLine />
      <ChatView />
    </div>
  </SettingsBySync>
);
