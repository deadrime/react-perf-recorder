import { memo, useMemo } from 'react';
import { memoize } from 'proxy-memoize';
import { messageInfo, selectMessageIds, selectSeen } from '../store/selectors';
import { useChatStore, type Chat } from '../store/chat';
import { useSettings } from './Settings';
import { TimeAgo } from './TimeAgo';

function useMessageInfo(id: string) {
  const select = useMemo(() => memoize((s: Chat) => messageInfo(s, id)), [id]);
  return useChatStore(select);
}

const Status = memo(({ id }: { id: string }) => {
  const info = useMessageInfo(id);
  const seen = useChatStore(selectSeen);
  return (
    <span className="status" title={seen ? 'read by everyone' : 'sent'}>
      ♥ <b>{info.reactions}</b> {seen ? '✓✓' : '✓'}
    </span>
  );
});

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
      <button type="button" className="delete" title="Delete" data-testid={`delete-${id}`} onClick={() => useChatStore.getState().removeMessage(id)}>
        ×
      </button>
    </li>
  );
});

export const MessageList = () => {
  const ids = useChatStore(selectMessageIds);
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
