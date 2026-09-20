import { priceStore, useTerminalStore } from './store/terminal';

const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);

// A worker stands in for the price socket: its messages reach the page as `message` events, like a WebSocket's.
const feed = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;

export function connectPriceFeed() {
  const socket = new Worker(URL.createObjectURL(new Blob([feed], { type: 'text/javascript' })));
  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
    useTerminalStore.getState().tick(event.data.step);
    priceStore.setState({ lastTrade: { ...useTerminalStore.getState().priceByTicker } });
  });
  return socket;
}
