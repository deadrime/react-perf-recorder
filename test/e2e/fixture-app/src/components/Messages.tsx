import { memo } from 'react';
import { bug } from '../bugs';
import { selectMessageIds, selectMessageInfo } from '../store/selectors';
import { useChatStore, type Chat } from '../store/chat';
import { useSettings } from './Settings';
import { TimeAgo } from './TimeAgo';

const useMessageInfo = (id: string) => useChatStore((s) => selectMessageInfo(s, id));

const selectFreshIds = (s: Chat) => Object.keys(s.messageById);

function useMessageIds() {
  return useChatStore(bug('new-array-selector') ? selectFreshIds : selectMessageIds);
}

/**
 * The reactions and the read receipts are the only thing that moves, so the subscription lives here and not in the
 * row: on a tick React renders this span and leaves the message above it alone.
 */
const Status = memo(({ id }: { id: string }) => {
  const info = useMessageInfo(id);
  // A new component type on every render: React unmounts the old count and mounts a new one.
  const NestedCount = () => <b>{info.reactions}</b>;
  return (
    <span className="status" title={info.seen ? 'read by everyone' : 'sent'}>
      ♥ {bug('nested-component') ? <NestedCount /> : <b>{info.reactions}</b>} {info.seen ? '✓✓' : '✓'}
    </span>
  );
});

/** The message itself never changes once it is sent, so the row renders once and stays. */
export const MessageRow = memo(({ id }: { id: string }) => {
  const message = useChatStore((s) => s.messageById[id]);
  const { dense } = useSettings();
  return (
    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
      <span className="avatar">{message.from[0]}</span>
      <span className="body">
        <span className="who">
          {message.from}
          <TimeAgo sentAt={message.sentAt} />
        </span>
        <span className="text">{message.text}</span>
      </span>
      <Status id={id} />
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
