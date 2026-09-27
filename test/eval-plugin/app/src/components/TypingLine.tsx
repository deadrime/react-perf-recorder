import { useStore } from 'zustand';
import { presenceStore, type Person } from '../store/chat';

const line = (typing: Person[]) => {
  if (typing.length === 0) return ' ';
  const names = typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)}` : typing[0];
  return `${names} ${typing.length > 1 ? 'are' : 'is'} typing…`;
};

export const TypingLine = () => {
  const typing = useStore(presenceStore, (s) => s.typing);
  return (
    <small className="connection" data-testid="typing">
      {line(typing)}
    </small>
  );
};
