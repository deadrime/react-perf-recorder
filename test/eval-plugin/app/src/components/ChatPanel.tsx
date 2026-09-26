import { memo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageList, PeopleList } from './Messages';

export const useActiveTab = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
  return [tab, select] as const;
};

const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
    {name}
  </button>
));

export const ChatPanel = () => {
  const [tab, setTab] = useActiveTab();
  return (
    <section className="panel" data-testid="chat-panel">
      <div className="tabs" role="tablist">
        {['chat', 'people'].map((name) => (
          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
        ))}
      </div>
      {tab === 'chat' ? <MessageList /> : <PeopleList />}
    </section>
  );
};
