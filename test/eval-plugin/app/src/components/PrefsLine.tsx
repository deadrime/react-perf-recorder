import { useChatStore } from '../store/chat';

export const PrefsLine = () => {
  const prefs = useChatStore((s) => s.prefs);
  return (
    <p className="side-line" data-testid="prefs">
      {prefs.timeFormat} clock · {prefs.compact ? 'compact' : 'comfortable'} rows
    </p>
  );
};
