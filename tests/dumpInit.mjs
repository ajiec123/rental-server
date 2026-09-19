import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'IDENTIFY', clientType: 'tv' }));
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', channels: ['tv:PS3_93'] }));
});
ws.on('message', (data) => {
  const text = data.toString();
  const obj = JSON.parse(text);
  if (obj.type === 'INIT_STATE') {
    console.log(JSON.stringify({
      type: obj.type,
      stationsCount: obj.stations?.length,
      hasPairings: Array.isArray(obj.tvPairings) ? obj.tvPairings.length : null,
      pairings: obj.tvPairings
    }, null, 2));
    ws.close();
  }
});