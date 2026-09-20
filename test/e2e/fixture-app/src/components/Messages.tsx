import { memo } from 'react';
import { bug } from '../bugs';
import { selectMessageIds, selectMessageInfo } from '../store/selectors';
import { useChatStore, type Chat } from '../store/chat';
import { useSettings } from './Settings';

const useMessageInfo = (id: string) => useChatStore((s) => selectMessageInfo(s, id));

const selectFreshIds = (s: Chat) => Object.keys(s.messageById);

function useMessageIds() {
  return useChatStore(bug('new-array-selector') ? selectFreshIds : selectMessageIds);
}

const Status = ({ reactions, seen }: { reactions: number; seen: boolean }) => (
  <span className="status">
    ♥ {reactions} {seen ? '✓✓' : '✓'}
  </span>
);

export const MessageRow = memo(({ id }: { id: string }) => {
  const info = useMessageInfo(id);
  const { dense } = useSettings();
  // A new component type on every render: React unmounts the old status and mounts a new one.
  const NestedStatus = () => <Status reactions={info.reactions} seen={info.seen} />;
  return (
    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
      <span className="avatar">{info.from[0]}</span>
      <span className="body">
        <span className="who">
          {info.from}
          <small>{info.sentAgo} min ago</small>
        </span>
        <span className="text">{info.text}</span>
      </span>
      {bug('nested-component') ? <NestedStatus /> : <Status reactions={info.reactions} seen={info.seen} />}
      <button
        type="button"
        className="delete"
        title="Delete"
        data-testid={`delete-${id}`}
        onClick={() => useChatStore.getState().removeMessage(id)}
      >
        ×
      </button>
    </li>
  );
});

export const MessageList = () => {
  const ids = useMessageIds();
  return (
    <ul className="messages" data-testid="messages">
      {ids.map((id) => (
        <MessageRow key={id} id={id} />
      ))}
    </ul>
  );
};

export const PeopleList = () => (
  <ul className="people" data-testid="people">
    {['Anna', 'Boris', 'Chen'].map((name) => (
      <li key={name}>
        <span className="avatar">{name[0]}</span>
        {name}
      </li>
    ))}
  </ul>
);
