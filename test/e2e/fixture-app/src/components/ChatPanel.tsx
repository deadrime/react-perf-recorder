import { memo, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bug } from '../bugs';
import { MessageList, PeopleList } from './Messages';

export const useActiveTab = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
  // The setter is the same function every time, so a tab only renders when its own `active` changes.
  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
  return [tab, select] as const;
};

/** The shown tab copied into state by an effect: one more commit after every switch. */
function useShownTabFromEffect(tab: string) {
  const [shown, setShown] = useState(tab);
  useEffect(() => setShown(tab), [tab]);
  return shown;
}

function useShownTab(tab: string) {
  return tab;
}

const useShown = bug('effect-derived-state') ? useShownTabFromEffect : useShownTab;

/** A tab is a component of its own, as it is in any app: it renders when its own state changes, not the panel's. */
const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
    {name}
  </button>
));

export const ChatPanel = () => {
  const [active, setTab] = useActiveTab();
  const tab = useShown(active);
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
