import { useEffect } from 'react';
import { ARRIVAL_EVERY, TYPING_LEAD, presenceStore, senderAt, useChatStore, type Person } from './store/chat';

const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);

// A worker stands in for the chat socket: its messages reach the page as `message` events, like a WebSocket's.
const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;

const IDLE: Person[][] = [[], ['Anna'], [], ['Boris', 'Chen'], []];

/** Who is typing: whoever is about to send something, and otherwise whatever the room is doing. */
function typingAt(step: number): Person[] {
  const untilArrival = ARRIVAL_EVERY - (step % ARRIVAL_EVERY);
  if (untilArrival <= TYPING_LEAD) return [senderAt(step + untilArrival)];
  return IDLE[Math.floor(step / 4) % IDLE.length];
}

/** The chat's socket while the chat is on the page: a case elsewhere would record its ticks as causes of nothing. */
export function useFeed() {
  useEffect(() => {
    const socket = connectFeed();
    return () => socket.terminate();
  }, []);
}

function connectFeed() {
  const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
    const { step } = event.data;
    useChatStore.getState().tick(step);
    // Only when it actually changed: a socket handler that writes the same value every time is a bug of its own.
    const typing = typingAt(step);
    if (typing.join() !== presenceStore.getState().typing.join()) presenceStore.setState({ typing });
  });
  return socket;
}
