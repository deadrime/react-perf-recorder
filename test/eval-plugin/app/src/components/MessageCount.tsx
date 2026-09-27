import { useMessageCount } from '../hooks/useMessageCount';

export const MessageCount = () => {
  const count = useMessageCount();
  return (
    <p className="side-line" data-testid="count">
      <b>{count}</b> messages kept
    </p>
  );
};
