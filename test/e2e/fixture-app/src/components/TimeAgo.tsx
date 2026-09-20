import { useStore } from 'zustand';
import { bug } from '../bugs';
import { clockStore, timeAgo } from '../store/clock';

/** The label, not the clock: this renders when the words change, which for an old message is once a minute. */
function useLabel(sentAt: number) {
  return useStore(clockStore, (s) => timeAgo(s.now, sentAt));
}

/** The clock itself: a render a second for a message that has said "4 minutes ago" for a while now. */
function useExactClock(sentAt: number) {
  return timeAgo(useStore(clockStore, (s) => s.now), sentAt);
}

const useTimeAgo = bug('exact-value') ? useExactClock : useLabel;

export const TimeAgo = ({ sentAt }: { sentAt: number }) => <small data-testid="time-ago">{useTimeAgo(sentAt)}</small>;
