import { presenceStore, useChatStore, type Person } from './store/chat';

const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);
const people: Array<Person | null> = ['Anna', null, 'Chen', null, 'Boris'];

// A worker stands in for the chat socket: its messages reach the page as `message` events, like a WebSocket's.
const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;

export function connectFeed() {
  const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
    useChatStore.getState().tick(event.data.step);
    presenceStore.setState({ typing: people[event.data.step % people.length] });
  });
  return socket;
}
