import { useStore } from 'zustand';
import { clockStore, timeAgo } from '../store/clock';

export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
  return <small data-testid="time-ago">{label}</small>;
};
