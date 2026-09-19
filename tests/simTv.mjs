import WebSocket from 'ws';

const url = 'ws://localhost:3000';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('[tv-sim] open');
  ws.send(JSON.stringify({ type: 'IDENTIFY', clientType: 'tv' }));
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', channels: ['tv:PS3_93', 'tv:all'] }));
});

ws.on('message', (data) => {
  const text = data.toString();
  console.log('[tv-sim] msg', text.length > 220 ? text.slice(0, 220) + '...' : text);
});

setInterval(() => {
  ws.send(JSON.stringify({ type: 'TV_HEARTBEAT', channel: 'tv:PS3_93' }));
}, 5000);