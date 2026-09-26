import type { ReactNode } from 'react';
import { useFeed } from '../feed';
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

function useDenseSetting() {
  return false;
}

const SettingsBySync = ({ children }: { children: ReactNode }) => <SettingsProvider dense={useDenseSetting()}>{children}</SettingsProvider>;

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
