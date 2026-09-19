import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'IDENTIFY', clientType: 'tv' }));
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', channels: ['tv:PS3_93', 'tv:all'] }));
});
let ticks = 0;
ws.on('message', (data) => {
  const text = data.toString();
  let obj;
  try { obj = JSON.parse(text); } catch { return; }
  if (obj.type === 'WS_TIMER_TICK') {
    ticks++;
    const s = obj.stations.find((x) => x.id === 'st-606393');
    if (s) {
      console.log(`tick#${ticks} station=${s.name} status=${s.status} session=${s.currentSession ? 'YES' : 'no'}`);
      if (s.currentSession) {
        const remainingMs = s.currentSession.endTime - (obj.timestamp || Date.now());
        console.log(`   customer=${s.currentSession.customerName} remaining=${Math.round(remainingMs/1000)}s`);
      }
    }
  } else if (obj.type === 'CHANNEL_MESSAGE') {
    console.log('CHANNEL_MESSAGE:', obj.channel, JSON.stringify(obj.data));
  } else if (obj.type !== 'TV_HEARTBEAT_ACK' && obj.type !== 'TV_PRESENCE_UPDATE' && obj.type !== 'WELCOME' && obj.type !== 'IDENTIFIED' && obj.type !== 'SUBSCRIBED') {
    console.log(obj.type, text.length > 200 ? text.slice(0, 200) + '...' : text);
  }
});
ws.on('error', (e) => console.error('ws error', e.message));
setInterval(() => ws.send(JSON.stringify({ type: 'TV_HEARTBEAT', channel: 'tv:PS3_93' })), 5000);