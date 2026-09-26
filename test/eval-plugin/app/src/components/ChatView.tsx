import type { ReactNode } from 'react';
import { useFeed } from '../feed';
import { useChatStore } from '../store/chat';
import { ChannelStats } from './ChannelStats';
import { ChatPanel } from './ChatPanel';
import { Composer } from './Composer';
import { Header } from './Header';
import { SettingsProvider } from './Settings';
import { TypingLine } from './TypingLine';
import { WebhookForm } from './WebhookForm';

function useChatLayout() {
  return { wide: true };
}

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

const SyncBar = ({ at }: { at: number }) => (
  <span className="sync" title="Live">
    <span className="sync-fill" style={{ width: `${(at % 20) * 5}%` }} />
  </span>
);

/** The live bar moves with every event from the socket; the page itself comes in as children. */
const SettingsBySync = ({ children }: { children: ReactNode }) => {
  const lastEventAt = useChatStore((s) => s.workspace.lastEventAt);
  return (
    <SettingsProvider dense={false}>
      <SyncBar at={lastEventAt} />
      {children}
    </SettingsProvider>
  );
};

export const Layout = () => {
  useFeed();
  return (
    <SettingsBySync>
      <div className="app">
        <Header />
        <TypingLine />
        <ChatView />
      </div>
    </SettingsBySync>
  );
};
