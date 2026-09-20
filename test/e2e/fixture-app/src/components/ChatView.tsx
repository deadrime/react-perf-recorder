import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bug } from '../bugs';
import { BugStrip } from '../Demo';
import { useChatStore } from '../store/chat';
import { AwayCountdown } from './AwayCountdown';
import { ChannelStats } from './ChannelStats';
import { ChatPanel } from './ChatPanel';
import { Composer } from './Composer';
import { Header } from './Header';
import { SettingsProvider } from './Settings';
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

const ConnectionStatus = () => {
  const synced = useChatStore((s) => s.syncedAt);
  return (
    <small className="connection" data-testid="sync">
      connected · synced {synced}
    </small>
  );
};

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
        <AwayCountdown />
        <h3>Webhook</h3>
        <WebhookForm />
      </aside>
    </main>
  );
};

/** Renders on every tick; the page below comes as children and skips, unless the settings object is new. */
const SettingsBySync = ({ children }: { children: ReactNode }) => {
  const synced = useChatStore((s) => s.syncedAt);
  return <SettingsProvider dense={synced < 0}>{children}</SettingsProvider>;
};

export const Layout = () => (
  <SettingsBySync>
    <BugStrip />
    <div className="app">
      <Header />
      <ConnectionStatus />
      <ChatView />
    </div>
  </SettingsBySync>
);
