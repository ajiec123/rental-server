import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');
const seen = { init: 0, tick: 0, sessionStarts: 0, sessionEnds: 0, sample: null };

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'IDENTIFY', clientType: 'tv' }));
  ws.send(JSON.stringify({ type: 'SUBSCRIBE', channels: ['tv:PS3_93', 'tv:all'] }));
});

ws.on('message', (data) => {
  const text = data.toString();
  let obj;
  try { obj = JSON.parse(text); } catch { return; }
  if (obj.type === 'INIT_STATE') seen.init++;
  if (obj.type === 'WS_TIMER_TICK') {
    seen.tick++;
    const s = obj.stations.find((x) => x.id === 'st-606393');
    if (s?.currentSession && !seen.sample) {
      seen.sample = {
        sessionStart: s.currentSession.startTime,
        endTime: s.currentSession.endTime,
        remainingMs: s.currentSession.endTime - (obj.timestamp || Date.now()),
      };
      seen.sessionStarts++;
    }
    if (!s?.currentSession && seen.sessionEnds === 0) seen.sessionEnds++;
  }
});

setInterval(() => {
  ws.send(JSON.stringify({ type: 'TV_HEARTBEAT', channel: 'tv:PS3_93' }));
}, 5000);

setTimeout(() => {
  console.log(JSON.stringify({
    initEvents: seen.init,
    ticksObserved: seen.tick,
    sessionStartedObserved: seen.sessionStarts,
    sessionEndedObserved: seen.sessionEnds,
    sampleTimerPayload: seen.sample,
  }, null, 2));
  ws.close();
  process.exit(0);
}, 67000);