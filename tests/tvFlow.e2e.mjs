// E2E test: operator → server → TV command flow.
// Dijalankan sambil server dev hidup di port 3000 (cwd = .tmp-tvtest agar DB terisolasi).
import WebSocket from 'ws';

const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

function makeTv(channel) {
  const ws = new WebSocket('ws://localhost:3000/');
  const tv = {
    ws,
    channelTaken: [],
    messages: [], // CHANNEL_MESSAGE data
    initState: null,
    send: (obj) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj)),
  };
  ws.on('open', () => {
    tv.send({ type: 'IDENTIFY', clientType: 'tv' });
    tv.send({ type: 'SUBSCRIBE', channels: [channel, 'tv:all'] });
  });
  ws.on('message', (raw) => {
    const p = JSON.parse(raw.toString());
    if (p.type === 'CHANNEL_TAKEN') tv.channelTaken.push(p.channel);
    if (p.type === 'CHANNEL_MESSAGE') tv.messages.push(p);
    if (p.type === 'INIT_STATE') tv.initState = p;
  });
  return tv;
}

// ===== Scenario =====
console.log('1) Dua TV subscribe channel sendiri + tv:all ...');
const tvA = makeTv('tv:PS5_02'); // station st-02 (PS5) → derived channel tv:PS5_02
const tvB = makeTv('tv:PS5_03'); // station st-03 (PS5)
await sleep(1500);
check('TV A tidak kena CHANNEL_TAKEN', tvA.channelTaken.length === 0, JSON.stringify(tvA.channelTaken));
check('TV B tidak kena CHANNEL_TAKEN', tvB.channelTaken.length === 0, JSON.stringify(tvB.channelTaken));
// Fase1 #4: sync end_time setelah TV restart/mati listrik — server harus
// melampirkan tvChannel per station di INIT_STATE agar TV bisa reconcile.
check(
  'INIT_STATE station punya field tvChannel (sync setelah reboot TV)',
  Array.isArray(tvA.initState?.stations) &&
    tvA.initState.stations.some((s) => s.id === 'st-02' && s.tvChannel === 'tv:PS5_02'),
  JSON.stringify(tvA.initState?.stations?.find((s) => s.id === 'st-02'))
);

console.log('2) Publish power_on ke tv:PS5_02 (hanya TV A yang boleh terima) ...');
const pubRes = await fetch(`${BASE}/api/channel/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel: 'tv:PS5_02', data: { command: 'power_on' } }),
}).then((r) => r.json());
await sleep(500);
check('recipients === 1', pubRes.recipients === 1, JSON.stringify(pubRes));
check('TV A terima power_on', tvA.messages.some((m) => m.data?.command === 'power_on'));
check('TV B TIDAK terima power_on (tanpa fan-out tv:all)', !tvB.messages.some((m) => m.data?.command === 'power_on'));

console.log('3) Mulai sesi fixed 3 detik di st-02, tunggu expired → server harus kirim power_off ...');
const now = Date.now();
const startRes = await fetch(`${BASE}/api/sessions/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stationId: 'st-02',
    session: {
      sessionId: 'sess-e2e-1', customerName: 'E2E Test', startTime: now,
      durationMinutes: 1, endTime: now + 3000, paymentMethod: 'Cash',
      paymentStatus: 'Paid', amount: 500, cashierName: 'E2E',
    },
    transaction: {
      id: 'tx-e2e-1', stationId: 'st-02', stationName: 'Station 02',
      durationMinutes: 1, durationLabel: '1 Menit', paymentMethod: 'Cash',
      paymentStatus: 'Lunas', amount: 500, formattedAmount: 'Rp 500',
      timeLabel: '00:00', dateLabel: new Date().toISOString().split('T')[0],
      timestamp: now, cashierName: 'E2E', customerName: 'E2E Test',
      consoleType: 'PS5', receiptNumber: 'NEX-E2E-0001',
    },
  }),
}).then((r) => r.json());
check('sesi dimulai ok', startRes.ok === true, JSON.stringify(startRes));

tvA.messages.length = 0; tvB.messages.length = 0;
await sleep(6000); // expiry +3s, tick engine 1s
check('TV A terima power_off otomatis saat timer habis', tvA.messages.some((m) => m.data?.command === 'power_off'),
  JSON.stringify(tvA.messages.map((m) => m.data)));
check('TV B TIDAK terima power_off', !tvB.messages.some((m) => m.data?.command === 'power_off'));

console.log('4) Status station kembali available ...');
const state = await fetch(`${BASE}/api/stations`).then((r) => r.json());
const st02 = state.stations.find((s) => s.id === 'st-02');
check('st-02 available', st02?.status === 'available', st02?.status);

tvA.ws.close(); tvB.ws.close();
console.log(failures === 0 ? '\nSEMUA TES LULUS' : `\nADA ${failures} TES GAGAL`);
process.exit(failures === 0 ? 0 : 1);
