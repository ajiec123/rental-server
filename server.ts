import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  loadAll,
  saveStations,
  saveTransactions,
  saveVips,
  saveEmployees,
  savePermissions,
  saveSettings,
  saveTvPairings,
  resetDatabase,
  DATA_DIR_PATH,
  DBState,
  DBStation,
  DBTransaction,
  DBVipMember,
  DBEmployee,
  DBUserPermission,
  DBSettings,
  DBTvPairing,
} from './server-db';

// ===== TV Control Adapter Registry =====
// Adapter functions translate abstract TV commands into hardware-specific
// protocol calls (HDMI CEC, Smart TV HTTP API, MQTT broker, etc).
// Each adapter receives (stationId, command) and returns a Promise<string>
// describing the action taken. Failed/unsupported adapters are caught.

type TVCommand = 'power_on' | 'power_off' | 'volume_up' | 'volume_down' | 'mute' | 'unmute';

export interface BrandingPayload {
  action: 'show' | 'hide' | 'set';
  text?: string;
  subtitle?: string;
  color?: string;
  bg?: string;
}

const tvAdapters: Array<(stationId: string, command: TVCommand) => Promise<string>> = [];
const brandingAdapters: Array<(stationId: string, payload: BrandingPayload) => Promise<string>> = [];

/** Register a TV adapter. Chain as needed; failures of one adapter do not stop others. */
export function registerTVAdapter(
  fn: (stationId: string, command: TVCommand) => Promise<string>
): void {
  tvAdapters.push(fn);
}

/** Register a branding-overlay adapter. Called when operator sets branding text/visibility. */
export function registerBrandingAdapter(
  fn: (stationId: string, payload: BrandingPayload) => Promise<string>
): void {
  brandingAdapters.push(fn);
}

async function dispatchTVCommand(stationId: string, command: TVCommand): Promise<string[]> {
  if (tvAdapters.length === 0) {
    return [
      `[tv-stub] station=${stationId} cmd=${command} (no adapters registered — install one to control real hardware)`,
    ];
  }
  const results = await Promise.allSettled(
    tvAdapters.map((fn) => fn(stationId, command))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? `[adapter#${i}] ${r.value}`
      : `[adapter#${i} ERROR] ${(r.reason as Error).message}`
  );
}

async function dispatchBranding(stationId: string, payload: BrandingPayload): Promise<string[]> {
  if (brandingAdapters.length === 0) {
    return [
      `[branding-stub] station=${stationId} action=${payload.action} text="${payload.text || ''}" (no branding adapters registered)`,
    ];
  }
  const results = await Promise.allSettled(
    brandingAdapters.map((fn) => fn(stationId, payload))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? `[branding-adapter#${i}] ${r.value}`
      : `[branding-adapter#${i} ERROR] ${(r.reason as Error).message}`
  );
}

interface ActiveSession {
  sessionId: string;
  transactionId?: string;
  customerName: string;
  customerPhone?: string;
  vipId?: string;
  isMainBebas?: boolean;
  startTime: number;
  durationMinutes: number;
  endTime: number;
  paymentMethod: 'QRIS' | 'Cash' | 'Debit' | 'E-Wallet';
  paymentStatus: 'Paid' | 'Pending' | 'Lunas' | 'Belum Lunas';
  amount: number;
  gamePlaying?: string;
  cashierName: string;
  notes?: string;
}

interface GamingStation {
  id: string;
  name: string;
  consoleType: string;
  ratePerHour: number;
  status: 'available' | 'occupied' | 'warning' | 'maintenance';
  currentSession?: ActiveSession;
  totalSessionsToday: number;
  totalRevenueToday: number;
}

interface Transaction {
  id: string;
  stationId: string;
  stationName: string;
  durationMinutes: number;
  durationLabel: string;
  paymentMethod: string;
  paymentStatus?: string;
  amount: number;
  formattedAmount: string;
  timeLabel: string;
  dateLabel: string;
  timestamp: number;
  cashierName: string;
  customerName: string;
  consoleType: string;
  receiptNumber: string;
}

// ===== Persistence-backed state (replaces hardcoded mock arrays) =====
let dbState: DBState = await loadAll();
let stations: GamingStation[] = dbState.stations as GamingStation[];
let transactions: Transaction[] = dbState.transactions as Transaction[];
let vips: DBVipMember[] = dbState.vips;
let employees: DBEmployee[] = dbState.employees;
let userPermissions: DBUserPermission[] = dbState.permissions;
let settings: DBSettings = dbState.settings;
let tvPairings: DBTvPairing[] = dbState.tvPairings || [];

// ===== Seed initial mock data ONLY on first ever boot =====
// Uses a settings-key flag so seed runs once. After that, an empty DB stays
// empty - operators who clear data expect it to stay cleared. To force-reload
// demo data: `npm run dev -- --seed-demo`.
const SEED_FLAG = '_seeded_initial_demo';
const alreadySeeded = (settings as any)?.[SEED_FLAG] === true;
const isSeedRequested = process.argv.includes('--seed-demo');

if (!alreadySeeded || isSeedRequested) {
  stations = seedInitialStations();
  transactions = seedInitialTransactions();
  vips = seedInitialVips();
  employees = seedInitialEmployees();
  userPermissions = seedInitialPermissions();
  settings = { ...settings, [SEED_FLAG]: true } as DBSettings;
  saveStations(stations).catch((e) => console.error('[db] seed stations failed:', e));
  saveTransactions(transactions).catch((e) => console.error('[db] seed tx failed:', e));
  saveVips(vips).catch((e) => console.error('[db] seed vips failed:', e));
  saveEmployees(employees).catch((e) => console.error('[db] seed emp failed:', e));
  savePermissions(userPermissions).catch((e) => console.error('[db] seed perms failed:', e));
  saveSettings(settings).catch((e) => console.error('[db] seed settings failed:', e));
  saveTvPairings(tvPairings).catch((e) => console.error('[db] seed tv pairings failed:', e));
  console.log('[db] Initial seed data persisted to', DATA_DIR_PATH);
}

// ===== Seed functions (run only on first boot) =====
function seedInitialStations(): GamingStation[] {
  const now = Date.now();
  return [
    { id: 'st-01', name: 'Station 01', consoleType: 'PS5 Pro', ratePerHour: 20000, status: 'occupied',
      currentSession: { sessionId: 'sess-101', customerName: 'Rian Pratama', customerPhone: '081234567890',
        startTime: now - 35*60*1000, durationMinutes: 60, endTime: now + 25*60*1000,
        paymentMethod: 'Cash', paymentStatus: 'Paid', amount: 20000,
        gamePlaying: 'EA Sports FC 25', cashierName: 'Alex Rivera' },
      totalSessionsToday: 5, totalRevenueToday: 100000 },
    { id: 'st-02', name: 'Station 02', consoleType: 'PS5', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 3, totalRevenueToday: 60000 },
    { id: 'st-03', name: 'Station 03', consoleType: 'PS5', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 4, totalRevenueToday: 80000 },
    { id: 'st-04', name: 'Station 04', consoleType: 'PS5 Pro', ratePerHour: 20000, status: 'occupied',
      currentSession: { sessionId: 'sess-104', customerName: 'Budi Santoso', customerPhone: '081987654321',
        startTime: now - 75*60*1000, durationMinutes: 120, endTime: now + 45*60*1000,
        paymentMethod: 'QRIS', paymentStatus: 'Paid', amount: 40000,
        gamePlaying: 'Tekken 8', cashierName: 'Alex Rivera' },
      totalSessionsToday: 6, totalRevenueToday: 140000 },
    { id: 'st-05', name: 'Station 05', consoleType: 'VIP Sim Rig', ratePerHour: 35000, status: 'occupied',
      currentSession: { sessionId: 'sess-105', customerName: 'Dimas Anggara',
        startTime: now - 110*60*1000, durationMinutes: 120, endTime: now + 10*60*1000,
        paymentMethod: 'QRIS', paymentStatus: 'Paid', amount: 70000,
        gamePlaying: 'Assetto Corsa Competizione', cashierName: 'Sarah Connor' },
      totalSessionsToday: 2, totalRevenueToday: 70000 },
    { id: 'st-06', name: 'Station 06', consoleType: 'Xbox Series X', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 2, totalRevenueToday: 40000 },
    { id: 'st-07', name: 'Station 07', consoleType: 'PS5', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 3, totalRevenueToday: 60000 },
    { id: 'st-08', name: 'Station 08', consoleType: 'PS5 Pro', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 4, totalRevenueToday: 80000 },
    { id: 'st-09', name: 'Station 09', consoleType: 'Nintendo Switch', ratePerHour: 15000, status: 'available',
      totalSessionsToday: 3, totalRevenueToday: 45000 },
    { id: 'st-10', name: 'Station 10', consoleType: 'PS5', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 2, totalRevenueToday: 40000 },
    { id: 'st-11', name: 'Station 11', consoleType: 'PS5 Pro', ratePerHour: 20000, status: 'available',
      totalSessionsToday: 3, totalRevenueToday: 60000 },
    { id: 'st-12', name: 'Station 12', consoleType: 'PS5 Pro', ratePerHour: 20000, status: 'occupied',
      currentSession: { sessionId: 'sess-112', customerName: 'Kiki Wijaya',
        startTime: now - 15*60*1000, durationMinutes: 180, endTime: now + 165*60*1000,
        paymentMethod: 'QRIS', paymentStatus: 'Paid', amount: 60000,
        gamePlaying: 'God of War Ragnarök', cashierName: 'Alex Rivera' },
      totalSessionsToday: 4, totalRevenueToday: 120000 },
  ];
}

function seedInitialTransactions(): Transaction[] {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  return [
    { id: 'tx-001', stationId: 'st-04', stationName: 'Station 04', durationMinutes: 120,
      durationLabel: '2 Jam', paymentMethod: 'QRIS', paymentStatus: 'Lunas',
      amount: 40000, formattedAmount: 'Rp 40k', timeLabel: '14:30', dateLabel: today,
      timestamp: now - 45*60*1000, cashierName: 'Rian Hidayat', customerName: 'Budi Santoso',
      consoleType: 'PS5 Pro', receiptNumber: 'NEX-0014' },
  ];
}

function seedInitialVips(): DBVipMember[] {
  return [
    { id: 'vip-001', name: 'Ahmad Fauzan', phone: '081111111111', tier: 'Cyber Elite',
      playHoursTotal: 42.5, loyaltyPoints: 2150, totalSpent: 850000 },
    { id: 'vip-002', name: 'Citra Lestari', phone: '082222222222', tier: 'Platinum',
      playHoursTotal: 18.2, loyaltyPoints: 920, totalSpent: 364000 },
    { id: 'vip-003', name: 'Rizky Hidayat', phone: '083333333333', tier: 'Gold',
      playHoursTotal: 9.8, loyaltyPoints: 490, totalSpent: 196000 },
    { id: 'vip-004', name: 'Putri Maharani', phone: '084444444444', tier: 'Standard',
      playHoursTotal: 3.4, loyaltyPoints: 170, totalSpent: 68000 },
  ];
}

function seedInitialEmployees(): DBEmployee[] {
  return [
    { id: 'usr-owner-01', name: 'Budi Santoso (Owner)', role: 'Owner',
      avatarUrl: '',
      email: 'owner@cmdcenter.app',
      pin: 'sha256:1905a2ddc74d782648af627b6a137a63370762cc296235727278b72cdc121d6e' },
    { id: 'usr-karyawan-01', name: 'Rian Hidayat (Kasir Pagi)', role: 'Karyawan',
      avatarUrl: '',
      email: 'rian@cmdcenter.app',
      pin: 'sha256:1c338152982aa48b0b67c83c2e3793b243a5dc0c875374baca50d1f1dd6b769c' },
  ];
}

function seedInitialPermissions(): DBUserPermission[] {
  return [
    { userId: 'usr-karyawan-01', dashboard: 0, units: 1, history: 1, users: 1, settings: 0, new_session: 1 },
  ];
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // REST API: full state snapshot (includes everything: stations, tx, vips, employees, settings)
  app.get('/api/state', (req, res) => {
    res.json({
      stations,
      transactions,
      vips,
      employees,
      userPermissions,
      settings,
      tvPairings,
      timestamp: Date.now(),
    });
  });

  // REST API: just stations + transactions (back-compat)
  app.get('/api/stations', (req, res) => {
    res.json({ stations, transactions, tvPairings });
  });

  // REST API: trigger TV command via HTTP (alternative to WebSocket)
  app.post('/api/tv-control', async (req, res) => {
    const { stationId, command } = req.body || {};
    if (!stationId || !command) {
      return res.status(400).json({ error: 'stationId and command are required' });
    }
    if (!['power_on','power_off','volume_up','volume_down','mute','unmute'].includes(command)) {
      return res.status(400).json({ error: `unknown command: ${command}` });
    }
    try {
      const messages = await dispatchTVCommand(stationId, command as TVCommand);
      return res.json({ ok: true, stationId, command, messages });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  });

  // REST API: branding overlay (nama rental di pojok TV)
  app.post('/api/tv-branding', async (req, res) => {
    const { stationId, payload } = req.body || {};
    if (!stationId || !payload || !payload.action) {
      return res.status(400).json({ error: 'stationId and payload.action are required' });
    }
    if (!['show', 'hide', 'set'].includes(payload.action)) {
      return res.status(400).json({ error: `invalid action: ${payload.action}` });
    }
    try {
      const messages = await dispatchBranding(stationId, payload as BrandingPayload);
      return res.json({ ok: true, stationId, payload, messages });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  });

  // REST API: publish to a channel (operator → TV)
  // Body: { channel: "tv:PS5_01", data: { command: "power_on" } }
  app.post('/api/channel/publish', (req, res) => {
    const { channel, data } = req.body || {};
    if (!channel || !data) {
      return res.status(400).json({ error: 'channel and data are required' });
    }
    const recipients = publishToChannel(channel, data);
    res.json({ ok: true, channel, recipients, timestamp: Date.now() });
  });

  // REST API: move session (operator → server, persisted + broadcast)
  // Body: { sourceStationId: "st-01", targetStationId: "st-03" }
  app.post('/api/stations/move-session', (req, res) => {
    const { sourceStationId, targetStationId } = req.body || {};
    if (!sourceStationId || !targetStationId) {
      return res.status(400).json({ error: 'sourceStationId and targetStationId are required' });
    }

    const now = Date.now();
    const sourceStation = stations.find((s) => s.id === sourceStationId);
    const targetStation = stations.find((s) => s.id === targetStationId);

    if (!sourceStation || !targetStation) {
      return res.status(404).json({ error: 'source or target station not found' });
    }
    if (!sourceStation.currentSession) {
      return res.status(400).json({ error: 'source station has no active session' });
    }
    if (targetStation.currentSession) {
      return res.status(409).json({ error: 'target station already occupied' });
    }

    const sourceSess = sourceStation.currentSession;
    const movedSession: ActiveSession = {
      ...sourceSess,
      startTime: sourceSess.startTime,
      endTime: sourceSess.endTime,
      durationMinutes: sourceSess.durationMinutes,
    };

    stations = stations.map((st) => {
      if (st.id === sourceStationId) {
        return { ...st, status: 'available', currentSession: undefined };
      }
      if (st.id === targetStationId) {
        let targetStatus: 'occupied' | 'warning' = 'occupied';
        if (!sourceSess.isMainBebas && sourceSess.durationMinutes > 0) {
          const remainingMs = Math.max(0, sourceSess.endTime - now);
          targetStatus =
            remainingMs > 0 && remainingMs <= 15 * 60 * 1000 ? 'warning' : 'occupied';
        }
        return { ...st, status: targetStatus, currentSession: movedSession };
      }
      return st;
    });

    saveStations(stations).catch((e) =>
      console.error('[db] persist MOVE_SESSION (REST) failed:', e)
    );
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      actionMessage: `Sesi dipindahkan: ${sourceStation.name} → ${targetStation.name}`,
    });

    res.json({
      ok: true,
      sourceStationId,
      targetStationId,
      timestamp: Date.now(),
    });
  });

  // REST API: start session (fallback for WS)
  app.post('/api/sessions/start', (req, res) => {
    const { stationId, session, transaction } = req.body || {};
    if (!stationId || !session || !transaction) {
      return res.status(400).json({ error: 'stationId, session, and transaction are required' });
    }
    const targetStation = stations.find((s) => s.id === stationId);
    if (!targetStation) return res.status(404).json({ error: 'station not found' });
    transactions = [transaction, ...transactions];
    stations = stations.map((st) =>
      st.id === stationId
        ? {
            ...st,
            status: 'occupied',
            currentSession: session,
            totalSessionsToday: st.totalSessionsToday + 1,
            totalRevenueToday: st.totalRevenueToday + transaction.amount,
          }
        : st
    );
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      lastTransaction: transaction,
    });
    Promise.all([saveStations(stations), saveTransactions(transactions)])
      .catch((e) => console.error('[db] persist /api/sessions/start failed:', e));
    res.json({ ok: true, stationId, timestamp: Date.now() });
  });

  // REST API: end Main Bebas session
  app.post('/api/sessions/end-main-bebas', (req, res) => {
    const { stationId, actualMinutes, finalAmount, paymentMethod, paymentStatus } = req.body || {};
    if (!stationId || finalAmount === undefined) {
      return res.status(400).json({ error: 'stationId and finalAmount are required' });
    }
    const station = stations.find((s) => s.id === stationId);
    if (!station || !station.currentSession) {
      return res.status(400).json({ error: 'no active session on station' });
    }
    const now = Date.now();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const d = new Date();
    const newTx: Transaction = {
      id: `tx-${now}`,
      stationId,
      stationName: station.name,
      durationMinutes: actualMinutes || Math.max(1, Math.ceil((now - station.currentSession.startTime) / 60000)),
      durationLabel: `${actualMinutes || Math.max(1, Math.ceil((now - station.currentSession.startTime) / 60000))} Menit (Main Bebas)`,
      paymentMethod: paymentMethod || station.currentSession.paymentMethod,
      paymentStatus: paymentStatus || 'Lunas',
      amount: finalAmount,
      formattedAmount:
        finalAmount >= 1000 ? `Rp ${Math.round(finalAmount / 1000)}k` : `Rp ${finalAmount}`,
      timeLabel: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      dateLabel: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      timestamp: now,
      cashierName: station.currentSession.cashierName,
      customerName: station.currentSession.customerName,
      consoleType: station.consoleType,
      receiptNumber: `NEX-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    transactions = [newTx, ...transactions];
    stations = stations.map((st) =>
      st.id === stationId
        ? {
            ...st,
            status: 'available',
            currentSession: undefined,
            totalSessionsToday: st.totalSessionsToday + 1,
            totalRevenueToday: st.totalRevenueToday + finalAmount,
          }
        : st
    );
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      lastTransaction: newTx,
    });
    Promise.all([saveStations(stations), saveTransactions(transactions)])
      .catch((e) => console.error('[db] persist /api/sessions/end-main-bebas failed:', e));
    res.json({ ok: true, transaction: newTx, timestamp: Date.now() });
  });

  // REST API: end Fixed session (just update tx payment status)
  app.post('/api/sessions/end-fixed', (req, res) => {
    const { stationId, paymentMethod, paymentStatus } = req.body || {};
    if (!stationId) return res.status(400).json({ error: 'stationId required' });
    const station = stations.find((s) => s.id === stationId);
    transactions = transactions.map((tx) =>
      station?.currentSession?.transactionId === tx.id ||
      (!station?.currentSession?.transactionId && tx.stationId === stationId)
        ? { ...tx, paymentMethod: paymentMethod || tx.paymentMethod, paymentStatus: paymentStatus || tx.paymentStatus }
        : tx
    );
    stations = stations.map((st) =>
      st.id === stationId
        ? { ...st, status: 'available', currentSession: undefined }
        : st
    );
    broadcast({ type: 'STATE_UPDATE', stations, transactions });
    Promise.all([saveStations(stations), saveTransactions(transactions)])
      .catch((e) => console.error('[db] persist /api/sessions/end-fixed failed:', e));
    res.json({ ok: true, stationId, timestamp: Date.now() });
  });

  // REST API: toggle payment status
  app.post('/api/transactions/toggle-payment', (req, res) => {
    const { transactionId } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: 'transactionId required' });
    transactions = transactions.map((tx) => {
      if (tx.id !== transactionId) return tx;
      const newStatus =
        tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending' ? 'Lunas' : 'Belum Lunas';
      return { ...tx, paymentStatus: newStatus };
    });
    broadcast({ type: 'STATE_UPDATE', stations, transactions });
    saveTransactions(transactions).catch((e) =>
      console.error('[db] persist toggle-payment failed:', e)
    );
    res.json({ ok: true, transactionId, timestamp: Date.now() });
  });

  // REST API: delete transactions
  app.post('/api/transactions/delete', (req, res) => {
    const { transactionIds } = req.body || {};
    if (!Array.isArray(transactionIds)) {
      return res.status(400).json({ error: 'transactionIds array required' });
    }
    transactions = transactions.filter((tx) => !transactionIds.includes(tx.id));
    broadcast({ type: 'STATE_UPDATE', stations, transactions });
    saveTransactions(transactions).catch((e) =>
      console.error('[db] persist delete-transactions failed:', e)
    );
    res.json({ ok: true, deleted: transactionIds.length, timestamp: Date.now() });
  });

  // REST API: add VIP
  app.post('/api/vips/add', (req, res) => {
    const vip = req.body as DBVipMember;
    if (!vip || !vip.id || !vip.name) {
      return res.status(400).json({ error: 'id and name required' });
    }
    vips = [vip, ...vips];
    broadcast({ type: 'STATE_UPDATE', stations, transactions });
    saveVips(vips).catch((e) => console.error('[db] persist add-vip failed:', e));
    res.json({ ok: true, vip, timestamp: Date.now() });
  });

  // REST API: delete station
  app.post('/api/stations/delete', (req, res) => {
    const { stationId } = req.body || {};
    if (!stationId) return res.status(400).json({ error: 'stationId required' });
    stations = stations.filter((st) => st.id !== stationId);
    broadcast({ type: 'STATE_UPDATE', stations, transactions });
    saveStations(stations).catch((e) =>
      console.error('[db] persist delete-station failed:', e)
    );
    res.json({ ok: true, stationId, timestamp: Date.now() });
  });

  // REST API: add station (fallback for WS)
  app.post('/api/stations/add', (req, res) => {
    const { station } = req.body || {};
    if (!station || !station.id || !station.name) {
      return res.status(400).json({ error: 'station with id and name required' });
    }
    const exists = stations.some((st) => st.id === station.id);
    stations = exists
      ? stations.map((st) => (st.id === station.id ? { ...station } : st))
      : [...stations, { ...station }];
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      actionMessage: `Station added: ${station.name}`,
    });
    saveStations(stations).catch((e) =>
      console.error('[db] persist add-station failed:', e)
    );
    res.json({ ok: true, station, timestamp: Date.now() });
  });

  // REST API: update station (fallback for WS)
  app.post('/api/stations/update', (req, res) => {
    const { station } = req.body || {};
    if (!station || !station.id) {
      return res.status(400).json({ error: 'station with id required' });
    }
    stations = stations.map((st) => (st.id === station.id ? { ...station } : st));
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      actionMessage: `Station updated: ${station.name || station.id}`,
    });
    saveStations(stations).catch((e) =>
      console.error('[db] persist update-station failed:', e)
    );
    res.json({ ok: true, station, timestamp: Date.now() });
  });

  // REST API: clear ALL stations (owner-only debug/test). Used for resetting
  // demo data without nuking the whole DB. Owner console → POST /api/stations/clear
  app.post('/api/stations/clear', (req, res) => {
    const removed = stations.length;
    stations = [];
    broadcast({
      type: 'STATE_UPDATE',
      stations,
      transactions,
      actionMessage: `All ${removed} stations cleared via /api/stations/clear`,
    });
    saveStations(stations).catch((e) =>
      console.error('[db] persist stations/clear failed:', e)
    );
    res.json({ ok: true, removed, remaining: 0, timestamp: Date.now() });
  });

  // REST API: list active channels (debug/monitoring)
  app.get('/api/channels', (req, res) => {
    const list = Array.from(channelRegistry.entries()).map(([ch, subs]) => ({
      channel: ch,
      subscribers: Array.from(subs).map((c) => c.clientType),
    }));
    res.json({ channels: list, count: list.length });
  });

  // REST API: TV presence status (anti-fraud check before starting/ending a session)
  // Body: { channel: "tv:PS5_01" } → returns { online: bool, subscribers, lastSeen }
  app.post('/api/tv/presence', (req, res) => {
    const { channel } = req.body || {};
    if (!channel) return res.status(400).json({ error: 'channel required' });
    const presence = getTVPresence(channel);
    const online = !!presence && presence.subscribers > 0 && (Date.now() - presence.lastSeen) < PRESENCE_STALE_MS;
    res.json({
      channel,
      online,
      subscribers: presence?.subscribers ?? 0,
      lastSeen: presence?.lastSeen ?? null,
      ageMs: presence ? Date.now() - presence.lastSeen : null,
    });
  });

  app.get('/api/tv/pairings', (_req, res) => {
    res.json({ pairings: tvPairings });
  });

  app.post('/api/tv/pairings', (req, res) => {
    const { pairings } = req.body || {};
    if (!Array.isArray(pairings)) {
      return res.status(400).json({ error: 'pairings array required' });
    }
    tvPairings = pairings.map((p: DBTvPairing) => ({
      stationId: p.stationId,
      tvChannel: p.tvChannel,
      label: p.label,
      createdAt: p.createdAt ?? Date.now(),
      lastSeenAt: p.lastSeenAt ?? Date.now(),
    }));
    saveTvPairings(tvPairings).catch((e) => console.error('[db] persist tv pairings failed:', e));
    broadcast({ type: 'TV_PAIRINGS_UPDATE', pairings: tvPairings, timestamp: Date.now() });
    res.json({ ok: true, pairings: tvPairings });
  });

  // ===== TV pairing self-registration =====
  // POST /api/tv/pair — TV receiver calls this on boot to claim a channel.
  // Body: { tvChannel: "PS5_01", deviceId: "abc123", model: "Mi Box S", version: "1.0.0" }
  //
  // Returns:
  //   { ok: true, channel: "tv:PS5_01", claimed: true|false, claimedBy: deviceId }
  //
  // Why this exists:
  //   - Previously TV silently subscribed to a channel name (random or
  //     manually-typed). Operator had no way to know which channel was
  //     claimed by which physical device.
  //   - Now TV self-registers on boot. Server validates channel format
  //     and records which deviceId owns it. If a different device tries
  //     to claim the same channel, server returns 409 CONFLICT.
  //   - Operator can see "TV PS5_01 claimed by device abc123" in /api/tv/pairings.
  //
  // This complements (does NOT replace) the existing stationId→tvChannel
  // pairing in tv_pairings table. The new flow is: TV picks channel →
  // tells server → operator maps it to station in UI.
  let tvDeviceClaims = new Map<string, { deviceId: string; model: string; version: string; claimedAt: number }>();

  app.post('/api/tv/pair', (req, res) => {
    const { tvChannel, deviceId, model, version } = req.body || {};
    if (!tvChannel || !deviceId) {
      return res.status(400).json({ ok: false, error: 'tvChannel and deviceId required' });
    }
    // Normalize: uppercase + strip "tv:" prefix
    const normalized = tvChannel.toUpperCase().replace(/^TV:/, '');
    const fullChannel = `tv:${normalized}`;

    // Validate format: must be like PS5_01, PS3_99, DEV_42
    if (!/^[A-Z0-9_]{2,16}$/.test(normalized)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid channel format. Use uppercase letters/numbers/underscore (e.g. PS5_01).',
      });
    }

    const existing = tvDeviceClaims.get(fullChannel);
    if (existing && existing.deviceId !== deviceId) {
      // Channel already claimed by another device
      console.warn(`[tv-pair] CONFLICT: channel=${fullChannel} already claimed by deviceId=${existing.deviceId}, new attempt by deviceId=${deviceId}`);
      return res.status(409).json({
        ok: false,
        error: 'CHANNEL_TAKEN',
        channel: fullChannel,
        claimedBy: existing.deviceId,
        message: `Channel ${fullChannel} is already registered to another TV. Please pick a different channel in Settings.`,
      });
    }

    // Claim or refresh
    tvDeviceClaims.set(fullChannel, {
      deviceId,
      model: model || 'unknown',
      version: version || '0.0.0',
      claimedAt: Date.now(),
    });
    console.log(`[tv-pair] ✅ ${fullChannel} claimed by deviceId=${deviceId} (${model || 'unknown'})`);

    // Broadcast to operators so UI can show "TV <channel> online"
    broadcast({
      type: 'TV_PAIR_UPDATE',
      claims: Object.fromEntries(tvDeviceClaims),
      timestamp: Date.now(),
    });

    res.json({
      ok: true,
      channel: fullChannel,
      claimed: true,
      deviceId,
      claimedAt: Date.now(),
    });
  });

  // GET /api/tv/pair — list all active channel claims (for diagnostics)
  app.get('/api/tv/pair', (_req, res) => {
    res.json({
      claims: Object.fromEntries(tvDeviceClaims),
      count: tvDeviceClaims.size,
    });
  });

  // DELETE /api/tv/pair — TV calls this when shutting down so another TV can claim
  app.delete('/api/tv/pair', (req, res) => {
    const { tvChannel, deviceId } = req.body || {};
    if (!tvChannel || !deviceId) {
      return res.status(400).json({ ok: false, error: 'tvChannel and deviceId required' });
    }
    const normalized = tvChannel.toUpperCase().replace(/^TV:/, '');
    const fullChannel = `tv:${normalized}`;
    const existing = tvDeviceClaims.get(fullChannel);
    if (existing && existing.deviceId === deviceId) {
      tvDeviceClaims.delete(fullChannel);
      console.log(`[tv-pair] Released ${fullChannel} (deviceId=${deviceId})`);
      broadcast({
        type: 'TV_PAIR_UPDATE',
        claims: Object.fromEntries(tvDeviceClaims),
        timestamp: Date.now(),
      });
      // Drop WS subscribe from this channel too
      return res.json({ ok: true, released: true });
    }
    res.json({ ok: true, released: false, reason: 'not owner' });
  });

  // ===== Database Backup & Restore (Owner-only via UI gating) =====
  // GET /api/admin/backup  → download full DB state as JSON
  // POST /api/admin/restore?reset=1  → body = JSON backup; reset=1 wipes schema first
  app.get('/api/admin/backup', async (_req, res) => {
    try {
      const state = await loadAll();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `command-center-backup-${stamp}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json({
        meta: {
          app: 'command-center',
          version: 1,
          exportedAt: new Date().toISOString(),
          counts: {
            stations: state.stations.length,
            transactions: state.transactions.length,
            vips: state.vips.length,
            employees: state.employees.length,
            permissions: state.permissions.length,
          },
        },
        data: state,
      });
    } catch (e) {
      console.error('[backup] export failed:', e);
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/admin/restore', async (req, res) => {
    try {
      const reset = req.query.reset === '1' || req.query.reset === 'true';
      const body = req.body as { meta?: unknown; data?: DBState } | DBState;
      const state: DBState = (body && (body as any).data) ? (body as any).data : (body as DBState);

      if (!state || typeof state !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid payload' });
      }
      const required: Array<keyof DBState> = [
        'stations', 'transactions', 'vips', 'employees', 'permissions', 'settings',
      ];
      for (const k of required) {
        if (!(k in state)) {
          return res.status(400).json({ ok: false, error: `Missing field: ${k}` });
        }
      }

      // Preserve seed flag so demo data isn't re-injected after restore
      let existingSettings: DBSettings | null = null;
      try {
        const before = await loadAll();
        existingSettings = before.settings;
      } catch {/* ignore */}
      const seedFlag = (existingSettings as any)?._seeded_initial_demo;
      const finalSettings: DBSettings = {
        ...state.settings,
        ...(seedFlag === true ? { _seeded_initial_demo: true as any } : {}),
      };

      if (reset) {
        console.log('[restore] reset=1 — wiping database before import');
        await resetDatabase();
      }

      // Order matters because of FK-like references in app code
      await saveEmployees(state.employees);
      await savePermissions(state.permissions);
      await saveVips(state.vips);
      await saveStations(state.stations);
      await saveTransactions(state.transactions);
      await saveSettings(finalSettings);
      await saveTvPairings(state.tvPairings || []);

      // Refresh in-memory state so /api/stations, /api/state and all
      // WebSocket broadcasts use the freshly-restored data.
      const freshState = await loadAll();
      stations = freshState.stations as GamingStation[];
      transactions = freshState.transactions as Transaction[];
      vips = freshState.vips;
      employees = freshState.employees;
      userPermissions = freshState.permissions;
      settings = freshState.settings;

      // Notify connected clients to refresh state
      broadcast({
        type: 'state:replaced',
        counts: {
          stations: state.stations.length,
          transactions: state.transactions.length,
          vips: state.vips.length,
          employees: state.employees.length,
          permissions: state.permissions.length,
        },
      });

      console.log('[restore] OK — stations=%d tx=%d vips=%d emps=%d perms=%d (reset=%s)',
        state.stations.length, state.transactions.length,
        state.vips.length, state.employees.length, state.permissions.length, reset);

      res.json({
        ok: true,
        reset,
        counts: {
          stations: state.stations.length,
          transactions: state.transactions.length,
          vips: state.vips.length,
          employees: state.employees.length,
          permissions: state.permissions.length,
        },
      });
    } catch (e) {
      console.error('[restore] failed:', e);
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  app.get('/api/admin/backup-info', async (_req, res) => {
    try {
      const state = await loadAll();
      res.json({
        counts: {
          stations: state.stations.length,
          transactions: state.transactions.length,
          vips: state.vips.length,
          employees: state.employees.length,
          permissions: state.permissions.length,
        },
        dataDir: DATA_DIR_PATH,
        pgVersion: process.versions.pglite ?? 'unknown',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    const list = Array.from(channelRegistry.entries()).map(([ch, subs]) => ({
      channel: ch,
      subscribers: subs.size,
    }));
    res.json({
      status: 'ok',
      websocket: true,
      channels: list,
      dataDir: DATA_DIR_PATH,
      time: new Date().toISOString(),
    });
  });

  // Cache cleaner page — clears all cmdcenter_* localStorage keys then redirects to app.
  // Useful when client and server state diverge (e.g. after wiping DB rows from REST).
  app.get('/clear-cache', (_req, res) => {
    const htmlPath = path.join(process.cwd(), 'public', 'clear-cache.html');
    res.sendFile(htmlPath, (err) => {
      if (err) {
        res.status(500).send('clear-cache.html not found at ' + htmlPath);
      }
    });
  });

  // Create HTTP Server
  const server = http.createServer(app);

  // Attach WebSocket Server
  const wss = new WebSocketServer({ server });

  // Broadcast function to send JSON data to all connected WebSocket clients
  const broadcast = (data: object) => {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  // Resolve channel TV untuk sebuah station: pairing eksplisit (tv_pairings)
  // menang; kalau tidak ada, turunkan dengan konvensi yang SAMA persis dengan
  // frontend (src/utils/tvPairing.ts → buildDerivedStationChannel):
  // "tv:<CONSOLETYPE tanpa spasi, uppercase, max 6 huruf>_<2 digit id station>".
  function resolveStationTvChannelSrv(station: { id: string; consoleType: string }): string {
    const explicit = tvPairings.find((p) => p.stationId === station.id);
    if (explicit?.tvChannel) return explicit.tvChannel;
    const idDigits = station.id.replace(/\D/g, '');
    const lastTwo = idDigits.slice(-2).padStart(2, '0');
    const consoleShort = station.consoleType.replace(/\s+/g, '').toUpperCase().slice(0, 6);
    return `tv:${consoleShort}_${lastTwo}`;
  }

  // Lampirkan channel TV terselesaikan ke setiap station untuk payload yang
  // dikonsumsi TV receiver (INIT_STATE & WS_TIMER_TICK). Tanpa field ini, TV
  // yang baru restart / mati listrik tidak bisa memulihkan state sesinya
  // (reconcileSessionState di TvConnectionService mencocokkan station.tvChannel).
  function withTvChannels(list: GamingStation[]): Array<GamingStation & { tvChannel: string }> {
    return list.map((st) => ({ ...st, tvChannel: resolveStationTvChannelSrv(st) }));
  }

  // Timer Tick Engine: runs every second on server
  setInterval(() => {
    const now = Date.now();
    let hasChanged = false;

    stations = stations.map((st) => {
      if (st.status === 'occupied' || st.status === 'warning') {
        if (st.currentSession) {
          const remainingMs = st.currentSession.endTime - now;
          if (remainingMs <= 0) {
            hasChanged = true;
            // Timer expired! Auto power-off TV (server-authoritative: tetap
            // jalan walau browser operator tertutup). Hanya untuk sesi Fixed;
            // Main Bebas diakhiri manual oleh operator (UI yang kirim power_off).
            const sess = st.currentSession;
            const isFixedSession = !sess.isMainBebas && sess.durationMinutes > 0;
            if (isFixedSession) {
              const ch = resolveStationTvChannelSrv(st);
              const recipients = publishToChannel(ch, { command: 'power_off' });
              console.log(
                `[tv-auto-power] Sesi habis di ${st.name} → power_off ke ${ch} (${recipients} penerima)`
              );
            }
            return {
              ...st,
              status: 'available',
              currentSession: undefined,
            };
          } else if (remainingMs <= 15 * 60 * 1000 && st.status !== 'warning') {
            hasChanged = true;
            // Less than 15 mins remaining
            return {
              ...st,
              status: 'warning',
            };
          }
        }
      }
      return st;
    });

    // Send tick message with server timestamp and latest stations
    broadcast({
      type: 'WS_TIMER_TICK',
      timestamp: now,
      stations: withTvChannels(stations),
      hasChanged
    });

    // Persist when timer-driven state changes occur (only when something changed
    // to avoid hammering disk every second).
    if (hasChanged) {
      saveStations(stations).catch((e) => console.error('[db] tick save failed:', e));
    }
  }, 1000);

  // ===== ANTI-FRAUD: Tamper detection =====
  // Every 10 seconds, verify each OCCUPIED station has its TV online.
  // If not → broadcast TV_TAMPER_ALERT so operator/owner sees a warning.
  // This catches the fraud scenario: kasir claims "TV rusak" but timer keeps
  // running (and customer keeps paying). Without this check, the system has
  // no way to know the TV isn't actually playing.
  const TAMPER_CHECK_INTERVAL_MS = 10_000;
  const tvIdToStationId = (tvChannel: string): string | null => {
    const explicit = tvPairings.find((p) => p.tvChannel.toUpperCase() === tvChannel.toUpperCase());
    if (explicit) return explicit.stationId;
    const m = tvChannel.match(/_(\d{2})$/);
    return m ? `st-${m[1]}` : null;
  };

  setInterval(() => {
    const now = Date.now();
    const offlineStations: string[] = [];
    for (const [channel, presence] of tvPresence.entries()) {
      // Skip channels without active subscribers
      if (presence.subscribers === 0) continue;
      if (now - presence.lastSeen > PRESENCE_STALE_MS) {
        const stationId = tvIdToStationId(channel);
        if (stationId) offlineStations.push(stationId);
      }
    }
    // Check each occupied station against the channel-presence data
    for (const st of stations) {
      if (st.status !== 'occupied' && st.status !== 'warning') continue;
      const pairingsForStation = tvPairings.filter((p) => p.stationId === st.id);
      const candidateChannels = pairingsForStation.length > 0
        ? pairingsForStation.map((p) => p.tvChannel)
        : ['PS5', 'PS4', 'PS3', 'PS5PRO', 'SWITCH', 'XBOX', 'VIPSIM'].map((c) => {
            const idDigits = st.id.replace(/\D/g, '');
            const stSuffix = idDigits.slice(-2).padStart(2, '0');
            return `tv:${c}_${stSuffix}`;
          });
      let channelFound = false;
      for (const channel of candidateChannels) {
        const presence = tvPresence.get(channel);
        if (presence && presence.subscribers > 0 && (now - presence.lastSeen) < PRESENCE_STALE_MS) {
          channelFound = true;
          break;
        }
      }
      if (!channelFound) {
        // TV offline for an occupied station — possible tamper
        broadcast({
          type: 'TV_TAMPER_ALERT',
          stationId: st.id,
          stationName: st.name,
          reason: 'TV offline during active session',
          timestamp: now,
        });
      }
    }
  }, TAMPER_CHECK_INTERVAL_MS);

  // ===== Channel-based WebSocket Registry =====
  // Pattern similar to Pusher Channels / Socket.IO Rooms.
  // Clients SUBSCRIBE to one or more channels (e.g. "tv:PS5_01").
  // Operators PUBLISH messages to specific channels without needing to know
  // each client's IP — channels abstract the routing.
  //
  // This eliminates the need for per-TV IP config in stationUrlMap.
  // TVs only need to know the server's IP (one config: serverUrl in MainActivity).

  interface ChannelClient {
    socket: WebSocket;
    clientType: 'tv' | 'operator' | 'unknown';
    subscribedChannels: Set<string>;
    connectedAt: number;
    lastHeartbeat: number;
  }

  const channelRegistry = new Map<string, Set<ChannelClient>>();

  // ===== TV presence tracker =====
  // Anti-fraud: track which TV channels have an active subscriber so we can
  // verify that power_on/power_off commands were actually delivered.
  // Map<channel, { clientCount, lastSeen }> — lastSeen = Date.now() of latest
  // SUBSCRIBE / HEARTBEAT / CHANNEL_MESSAGE for this channel.
  interface TVPresence {
    subscribers: number;
    lastSeen: number;
  }
  const tvPresence = new Map<string, TVPresence>();

  function markChannelActive(channel: string): void {
    const subs = channelRegistry.get(channel);
    const subscribers = subs ? subs.size : 0;
    tvPresence.set(channel, { subscribers, lastSeen: Date.now() });
  }

  function getTVPresence(channel: string): TVPresence | null {
    return tvPresence.get(channel) ?? null;
  }

  // Heartbeat sweeper: every 5s, prune stale presence entries (no activity for >15s)
  // and broadcast TV_PRESENCE_UPDATE to operators so the UI can show online/offline.
  const PRESENCE_STALE_MS = 15_000;
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [ch, presence] of tvPresence.entries()) {
      const subs = channelRegistry.get(ch);
      const liveSubs = subs ? subs.size : 0;
      if (liveSubs === 0) {
        tvPresence.delete(ch);
        changed = true;
        continue;
      }
      if (now - presence.lastSeen > PRESENCE_STALE_MS) {
        presence.lastSeen = now; // refresh so we don't churn
      }
      // Always sync subscriber count
      if (presence.subscribers !== liveSubs) {
        presence.subscribers = liveSubs;
        changed = true;
      }
    }
    if (changed) {
      broadcast({ type: 'TV_PRESENCE_UPDATE', presence: Object.fromEntries(tvPresence), timestamp: now });
    }
  }, 5_000);

  function subscribeToChannel(client: ChannelClient, channel: string): void {
    // ===== Channel-uniqueness constraint (anti-fraud) =====
    // A TV channel can only be held by ONE device at a time. If another
    // TV is already subscribed to this channel, reject the new subscriber.
    // This prevents the "two TVs sharing one channel" silent failure mode.
    // Exception: "tv:all" is a broadcast channel — many TVs may subscribe.
    if (channel.startsWith('tv:') && channel !== 'tv:all' && client.clientType === 'tv') {
      const existing = channelRegistry.get(channel);
      if (existing && existing.size > 0) {
        for (const other of existing) {
          if (other !== client && other.clientType === 'tv') {
            console.warn(`[ws-channels] CONFLICT: channel ${channel} already held by another TV — rejecting new subscriber`);
            try {
              client.socket.send(JSON.stringify({
                type: 'CHANNEL_TAKEN',
                channel,
                message: `Channel ${channel} is held by another TV. Configure a unique channel in Settings.`,
                timestamp: Date.now(),
              }));
            } catch (_) {}
            return; // do NOT add to registry
          }
        }
      }
    }

    if (!channelRegistry.has(channel)) {
      channelRegistry.set(channel, new Set());
    }
    channelRegistry.get(channel)!.add(client);
    client.subscribedChannels.add(channel);
    markChannelActive(channel);
    console.log(`[ws-channels] Client subscribed to "${channel}" (now ${channelRegistry.get(channel)!.size} subscribers)`);
    broadcast({ type: 'TV_PRESENCE_UPDATE', presence: Object.fromEntries(tvPresence), timestamp: Date.now() });
  }

  function unsubscribeFromChannel(client: ChannelClient, channel: string): void {
    const subs = channelRegistry.get(channel);
    if (subs) {
      subs.delete(client);
      if (subs.size === 0) channelRegistry.delete(channel);
    }
    client.subscribedChannels.delete(channel);
    markChannelActive(channel);
    broadcast({ type: 'TV_PRESENCE_UPDATE', presence: Object.fromEntries(tvPresence), timestamp: Date.now() });
  }

  function publishToChannel(channel: string, data: object, exclude?: ChannelClient): number {
    // Kirim HANYA ke channel yang dituju. (Sebelumnya ikut fan-out ke 'tv:all',
    // sehingga TV yang subscribe broadcast ikut mengeksekusi perintah milik
    // station lain — TV salah nyala/mati.) Broadcast tetap bisa dengan
    // publish eksplisit ke channel 'tv:all'.
    const targets = [channel];

    let sent = 0;
    const seenClients = new Set<ChannelClient>();

    for (const target of targets) {
      const subs = channelRegistry.get(target);
      if (!subs || subs.size === 0) continue;

      const payload = JSON.stringify({ type: 'CHANNEL_MESSAGE', channel: target, data, timestamp: Date.now() });
      subs.forEach((c) => {
        if (c === exclude || seenClients.has(c)) return;
        if (c.socket.readyState === WebSocket.OPEN) {
          c.socket.send(payload);
          sent++;
          seenClients.add(c);
        }
      });
    }

    return sent;
  }

  function broadcastToChannelType(clientType: 'tv' | 'operator', data: object): number {
    let sent = 0;
    const payload = JSON.stringify(data);
    channelRegistry.forEach((subs) => {
      subs.forEach((c) => {
        if (c.clientType === clientType && c.socket.readyState === WebSocket.OPEN) {
          c.socket.send(payload);
          sent++;
        }
      });
    });
    return sent;
  }

  function getChannelSubscribers(channel: string): number {
    return channelRegistry.get(channel)?.size || 0;
  }

  // Expose helpers for external adapters that want to publish to channels
  // (used by REST endpoints and operator commands)
  const wsChannels = {
    publish: publishToChannel,
    broadcastToType: broadcastToChannelType,
    getSubscribers: getChannelSubscribers,
    listChannels: () => Array.from(channelRegistry.keys()),
  };

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');

    const client: ChannelClient = {
      socket: ws,
      clientType: 'unknown',
      subscribedChannels: new Set(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    // Send initial sync state upon connection
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      stations: withTvChannels(stations),
      transactions,
      tvPairings,
      timestamp: Date.now()
    }));

    // Auto-acknowledge connection
    ws.send(JSON.stringify({
      type: 'WELCOME',
      serverVersion: '1.0.0',
      protocol: 'channel-based-v1',
      timestamp: Date.now(),
    }));

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message.toString());

        // ===== Channel protocol handlers =====
        if (payload.type === 'IDENTIFY') {
          // Client tells server what role it is: 'tv' or 'operator'
          const newType = payload.clientType === 'tv' || payload.clientType === 'operator'
            ? payload.clientType
            : 'unknown';
          client.clientType = newType;
          ws.send(JSON.stringify({
            type: 'IDENTIFIED',
            clientType: newType,
            timestamp: Date.now(),
          }));
          console.log(`[ws-channels] Client identified as ${newType}`);
          return;
        } else if (payload.type === 'SUBSCRIBE') {
          // Subscribe to one or more channels
          const channels: string[] = Array.isArray(payload.channels) ? payload.channels : [payload.channel];
          channels.filter(Boolean).forEach((ch) => subscribeToChannel(client, ch));
          ws.send(JSON.stringify({
            type: 'SUBSCRIBED',
            channels: client.subscribedChannels,
            timestamp: Date.now(),
          }));
          return;
        } else if (payload.type === 'UNSUBSCRIBE') {
          const channels: string[] = Array.isArray(payload.channels) ? payload.channels : [payload.channel];
          channels.filter(Boolean).forEach((ch) => unsubscribeFromChannel(client, ch));
          ws.send(JSON.stringify({
            type: 'UNSUBSCRIBED',
            channels,
            timestamp: Date.now(),
          }));
          return;
        } else if (payload.type === 'PUBLISH') {
          // Publish a message to a channel (typically used by operator to TV)
          const { channel, data } = payload;
          if (!channel || !data) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'channel and data required' }));
            return;
          }
          const recipients = publishToChannel(channel, data, client);
          ws.send(JSON.stringify({
            type: 'PUBLISH_ACK',
            channel,
            recipients,
            timestamp: Date.now(),
          }));
          return;
        } else if (payload.type === 'CHANNEL_LIST') {
          // Operator request to see active channels
          const list = Array.from(channelRegistry.entries()).map(([ch, subs]) => ({
            channel: ch,
            subscribers: subs.size,
          }));
          ws.send(JSON.stringify({
            type: 'CHANNEL_LIST_RESPONSE',
            channels: list,
            timestamp: Date.now(),
          }));
          return;
        } else if (payload.type === 'TV_HEARTBEAT') {
          // TV receiver (or any client) sends periodic heartbeat to keep its
          // channel marked as live. Channel name is in payload.channel.
          const ch = payload.channel as string | undefined;
          if (ch) {
            markChannelActive(ch);
            ws.send(JSON.stringify({
              type: 'TV_HEARTBEAT_ACK',
              channel: ch,
              timestamp: Date.now(),
            }));
          }
          return;
        } else if (payload.type === 'TV_COMMAND_ACK') {
          // TV receiver confirms it actually executed a command (anti-fraud).
          // payload: { channel, command, success, error? }
          const ch = payload.channel as string | undefined;
          const ack = {
            type: 'TV_COMMAND_ACK',
            channel: ch,
            command: payload.command,
            success: !!payload.success,
            error: payload.error ?? null,
            stationId: payload.stationId ?? null,
            actor: payload.actor ?? 'tv',
            timestamp: Date.now(),
          };
          markChannelActive(ch || '');
          broadcast(ack);
          return;
        }

        if (payload.type === 'REQUEST_SYNC') {
          ws.send(JSON.stringify({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            timestamp: Date.now()
          }));
        } else if (payload.type === 'END_SESSION') {
          const { stationId } = payload.data;
          const targetStation = stations.find(s => s.id === stationId);

          stations = stations.map(st => {
            if (st.id === stationId) {
              return {
                ...st,
                status: 'available',
                currentSession: undefined
              };
            }
            return st;
          });

          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `Timer dihentikan WebSocket: ${targetStation?.name || stationId}`
          });

          saveStations(stations).catch((e) => console.error('[db] persist END_SESSION failed:', e));
        } else if (payload.type === 'EXTEND_SESSION') {
          const { stationId, extraMinutes, extraAmount, cashierName } = payload.data;
          const now = Date.now();
          const targetStation = stations.find(s => s.id === stationId);

          if (targetStation && targetStation.currentSession) {
            const currentEndTime = targetStation.currentSession.endTime;
            const newEndTime = currentEndTime + extraMinutes * 60 * 1000;
            const newDuration = targetStation.currentSession.durationMinutes + extraMinutes;
            const newTotalAmount = targetStation.currentSession.amount + extraAmount;

            const extendTx: Transaction = {
              id: 'tx-ext-' + Date.now(),
              stationId,
              stationName: targetStation.name,
              durationMinutes: extraMinutes,
              durationLabel: `+${extraMinutes} Mnt`,
              paymentMethod: targetStation.currentSession.paymentMethod,
              amount: extraAmount,
              formattedAmount: `Rp ${(extraAmount / 1000).toLocaleString('id-ID')}k`,
              timeLabel: new Date(now).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              dateLabel: new Date(now).toISOString().split('T')[0],
              timestamp: now,
              cashierName: cashierName || targetStation.currentSession.cashierName,
              customerName: targetStation.currentSession.customerName,
              consoleType: targetStation.consoleType,
              receiptNumber: 'NEX-EXT-' + Math.floor(1000 + Math.random() * 9000)
            };

            transactions = [extendTx, ...transactions];

            stations = stations.map(st => {
              if (st.id === stationId && st.currentSession) {
                const remaining = newEndTime - now;
                return {
                  ...st,
                  status: remaining > 15 * 60 * 1000 ? 'occupied' : 'warning',
                  totalRevenueToday: st.totalRevenueToday + extraAmount,
                  currentSession: {
                    ...st.currentSession,
                    durationMinutes: newDuration,
                    endTime: newEndTime,
                    amount: newTotalAmount
                  }
                };
              }
              return st;
            });

            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              lastTransaction: extendTx,
              actionMessage: `Perpanjang Timer WebSocket: ${targetStation.name} +${extraMinutes} mnt`
            });

            // Persist
            Promise.all([saveStations(stations), saveTransactions(transactions)])
              .catch((e) => console.error('[db] persist EXTEND_SESSION failed:', e));
          }
        } else if (payload.type === 'SET_STATION_STATUS') {
          const { stationId, status } = payload.data;
          stations = stations.map(st => {
            if (st.id === stationId) {
              return { ...st, status };
            }
            return st;
          });

          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions
          });

          saveStations(stations).catch((e) => console.error('[db] persist SET_STATION_STATUS failed:', e));
        } else if (payload.type === 'START_SESSION') {
          // Frontend sent us a new session that we should persist + broadcast.
          // (Server-side timer engine in WS_TIMER_TICK still applies if data drifts.)
          const { stationId, session, transaction } = payload.data as {
            stationId: string;
            session: ActiveSession;
            transaction: Transaction;
          };
          const targetStation = stations.find((s) => s.id === stationId);
          if (targetStation) {
            transactions = [transaction, ...transactions];
            stations = stations.map((st) =>
              st.id === stationId
                ? {
                    ...st,
                    status: 'occupied',
                    currentSession: session,
                    totalSessionsToday: st.totalSessionsToday + 1,
                    totalRevenueToday: st.totalRevenueToday + transaction.amount,
                  }
                : st
            );
            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              lastTransaction: transaction,
              actionMessage: `Sesi baru (sync): ${targetStation.name} - ${session.customerName}`,
            });
            Promise.all([
              saveStations(stations),
              saveTransactions(transactions),
            ]).catch((e) => console.error('[db] persist START_SESSION failed:', e));
          }
        } else if (payload.type === 'END_MAIN_BEBAS_SESSION') {
          // Main Bebas ending: create new transaction record
          const { stationId, actualMinutes, finalAmount, paymentMethod, paymentStatus } = payload.data as {
            stationId: string;
            actualMinutes: number;
            finalAmount: number;
            paymentMethod: string;
            paymentStatus: 'Lunas' | 'Belum Lunas';
          };
          const station = stations.find((s) => s.id === stationId);
          if (station && station.currentSession) {
            const now = Date.now();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const d = new Date();
            const txId = `tx-${now}`;
            const newTx: Transaction = {
              id: txId,
              stationId,
              stationName: station.name,
              durationMinutes: actualMinutes,
              durationLabel: `${actualMinutes} Menit (Main Bebas)`,
              paymentMethod,
              paymentStatus,
              amount: finalAmount,
              formattedAmount:
                finalAmount >= 1000
                  ? `Rp ${Math.round(finalAmount / 1000)}k`
                  : `Rp ${finalAmount}`,
              timeLabel: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
              dateLabel: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
              timestamp: now,
              cashierName: station.currentSession.cashierName,
              customerName: station.currentSession.customerName,
              consoleType: station.consoleType,
              receiptNumber: `NEX-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`,
            };
            transactions = [newTx, ...transactions];
            stations = stations.map((st) =>
              st.id === stationId
                ? {
                    ...st,
                    status: 'available',
                    currentSession: undefined,
                    totalSessionsToday: st.totalSessionsToday + 1,
                    totalRevenueToday: st.totalRevenueToday + finalAmount,
                  }
                : st
            );
            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              lastTransaction: newTx,
              actionMessage: `Selesai (Main Bebas): ${station.name}`,
            });
            Promise.all([
              saveStations(stations),
              saveTransactions(transactions),
            ]).catch((e) => console.error('[db] persist END_MAIN_BEBAS failed:', e));
          }
        } else if (payload.type === 'END_FIXED_SESSION') {
          // Fixed package ending: just update existing transaction's payment status
          const { stationId, paymentMethod, paymentStatus } = payload.data as {
            stationId: string;
            paymentMethod: string;
            paymentStatus: 'Lunas' | 'Belum Lunas';
          };
          let updatedTx: Transaction | null = null;
          const station = stations.find((s) => s.id === stationId);
          transactions = transactions.map((tx) => {
            if (station?.currentSession?.transactionId === tx.id || (!station?.currentSession?.transactionId && tx.stationId === stationId)) {
              const u = { ...tx, paymentMethod, paymentStatus };
              updatedTx = u;
              return u;
            }
            return tx;
          });
          stations = stations.map((st) =>
            st.id === stationId
              ? { ...st, status: 'available', currentSession: undefined }
              : st
          );
          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `Selesai (Fixed): ${station?.name || stationId}`,
          });
          Promise.all([
            saveStations(stations),
            saveTransactions(transactions),
          ]).catch((e) => console.error('[db] persist END_FIXED failed:', e));
        } else if (payload.type === 'TOGGLE_PAYMENT_STATUS') {
          // Toggle Lunas ↔ Belum Lunas on an existing transaction
          const { transactionId } = payload.data as { transactionId: string };
          transactions = transactions.map((tx) => {
            if (tx.id !== transactionId) return tx;
            const newStatus =
              tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending' ? 'Lunas' : 'Belum Lunas';
            return { ...tx, paymentStatus: newStatus };
          });
          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `Toggle payment: transaction ${transactionId}`,
          });
          saveTransactions(transactions).catch((e) =>
            console.error('[db] persist TOGGLE_PAYMENT failed:', e)
          );
        } else if (payload.type === 'DELETE_TRANSACTIONS') {
          const { transactionIds } = payload.data as { transactionIds: string[] };
          transactions = transactions.filter((tx) => !transactionIds.includes(tx.id));
          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `Deleted ${transactionIds.length} transaction(s)`,
          });
          saveTransactions(transactions).catch((e) =>
            console.error('[db] persist DELETE_TRANSACTIONS failed:', e)
          );
        } else if (payload.type === 'ADD_VIP') {
          const { vip } = payload.data as { vip: DBVipMember };
          vips = [vip, ...vips];
          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `VIP added: ${vip.name}`,
          });
          saveVips(vips).catch((e) => console.error('[db] persist ADD_VIP failed:', e));
        } else if (payload.type === 'DELETE_STATION') {
          const { stationId } = payload.data as { stationId: string };
          stations = stations.filter((st) => st.id !== stationId);
          broadcast({
            type: 'STATE_UPDATE',
            stations,
            transactions,
            actionMessage: `Station deleted: ${stationId}`,
          });
          saveStations(stations).catch((e) =>
            console.error('[db] persist DELETE_STATION failed:', e)
          );
        } else if (payload.type === 'ADD_STATION') {
          // Persist a brand-new station from operator UI. Replace any existing
          // row with the same id (idempotent), broadcast, save to DB.
          const { station } = payload.data as { station: GamingStation };
          if (station && station.id && station.name) {
            const exists = stations.some((st) => st.id === station.id);
            stations = exists
              ? stations.map((st) => (st.id === station.id ? { ...station } : st))
              : [...stations, { ...station }];
            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              actionMessage: `Station added: ${station.name}`,
            });
            saveStations(stations).catch((e) =>
              console.error('[db] persist ADD_STATION failed:', e)
            );
          }
        } else if (payload.type === 'UPDATE_STATION') {
          // Persist edits (name/consoleType/ratePerHour) on an existing station.
          const { station } = payload.data as { station: GamingStation };
          if (station && station.id) {
            stations = stations.map((st) => (st.id === station.id ? { ...station } : st));
            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              actionMessage: `Station updated: ${station.name}`,
            });
            saveStations(stations).catch((e) =>
              console.error('[db] persist UPDATE_STATION failed:', e)
            );
          }
        } else if (payload.type === 'MOVE_SESSION') {
          // ===== Move active session from source → target station =====
          // Preserves original startTime/endTime/durationMinutes so timer continues
          // seamlessly. Persisted to DB and broadcast to all connected clients.
          const { sourceStationId, targetStationId } = payload.data as {
            sourceStationId: string;
            targetStationId: string;
          };
          const now = Date.now();

          const sourceStation = stations.find((s) => s.id === sourceStationId);
          const targetStation = stations.find((s) => s.id === targetStationId);

          if (!sourceStation || !targetStation) {
            ws.send(JSON.stringify({
              type: 'MOVE_SESSION_ERROR',
              error: 'source or target station not found',
              timestamp: Date.now(),
            }));
            return;
          }

          if (!sourceStation.currentSession) {
            ws.send(JSON.stringify({
              type: 'MOVE_SESSION_ERROR',
              error: 'source station has no active session',
              timestamp: Date.now(),
            }));
            return;
          }

          if (targetStation.currentSession) {
            ws.send(JSON.stringify({
              type: 'MOVE_SESSION_ERROR',
              error: 'target station is already occupied',
              timestamp: Date.now(),
            }));
            return;
          }

          const sourceSess = sourceStation.currentSession;

          // Preserve full session timeline (same strategy as frontend)
          const movedSession: ActiveSession = {
            ...sourceSess,
            startTime: sourceSess.startTime,
            endTime: sourceSess.endTime,
            durationMinutes: sourceSess.durationMinutes,
          };

          let hasChanged = false;
          stations = stations.map((st) => {
            if (st.id === sourceStationId) {
              hasChanged = true;
              return { ...st, status: 'available', currentSession: undefined };
            }
            if (st.id === targetStationId) {
              hasChanged = true;
              let targetStatus: 'occupied' | 'warning' = 'occupied';
              if (!sourceSess.isMainBebas && sourceSess.durationMinutes > 0) {
                const remainingMs = Math.max(0, sourceSess.endTime - now);
                targetStatus =
                  remainingMs > 0 && remainingMs <= 15 * 60 * 1000 ? 'warning' : 'occupied';
              }
              return { ...st, status: targetStatus, currentSession: movedSession };
            }
            return st;
          });

          if (hasChanged) {
            // Persist to DB
            saveStations(stations).catch((e) =>
              console.error('[db] persist MOVE_SESSION failed:', e)
            );

            // Broadcast to all connected operators
            broadcast({
              type: 'STATE_UPDATE',
              stations,
              transactions,
              actionMessage: `Sesi dipindahkan: ${sourceStation.name} → ${targetStation.name}`,
            });

            // Auto-redirect branding overlay to target TV channel (if branding enabled)
            // Operator can manually call /api/tv-branding later — this is optional convenience
            console.log(`[move-session] ${sourceStation.name} → ${targetStation.name} persisted & broadcast`);

            ws.send(JSON.stringify({
              type: 'MOVE_SESSION_OK',
              sourceStationId,
              targetStationId,
              timestamp: Date.now(),
            }));
          }
        } else if (payload.type === 'TV_CONTROL') {
          const { stationId, command } = payload.data as { stationId: string; command: TVCommand };
          (async () => {
            const messages = await dispatchTVCommand(stationId, command);
            broadcast({
              type: 'TV_CONTROL_RESULT',
              stationId,
              command,
              messages,
              timestamp: Date.now(),
            });
          })();
        } else if (payload.type === 'TV_BRANDING') {
          const { stationId, payload: brandingPayload } = payload.data as {
            stationId: string;
            payload: BrandingPayload;
          };
          (async () => {
            const messages = await dispatchBranding(stationId, brandingPayload);
            broadcast({
              type: 'TV_BRANDING_RESULT',
              stationId,
              brandingPayload,
              messages,
              timestamp: Date.now(),
            });
          })();
        }
      } catch (err) {
        console.error('[WebSocket] Message error:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      // Clean up channel subscriptions
      client.subscribedChannels.forEach((ch) => {
        unsubscribeFromChannel(client, ch);
      });
      client.subscribedChannels.clear();
    });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    // Dynamic import: vite hanya devDependency, jadi produksi tak pernah memuatnya.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Catch-all: serve SPA index.html untuk semua route client-side
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // === Start mDNS: advertise server + browse for TVs ===
  // Use dynamic import so the optional mDNS module doesn't fail the whole
  // server if bonjour-service has issues on the host platform.
  let mdnsModule: any | undefined;
  try {
    mdnsModule = await import('./server-mdns');
    // Read version from package.json (best-effort, fall back to "0.0.0")
    let version = '0.0.0';
    try {
      const fs = await import('node:fs/promises');
      const pkgRaw = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      version = pkg.version || '0.0.0';
    } catch (_) {
      // package.json unreadable — keep default
    }
    mdnsModule.startMdns(PORT, version);
    console.log('[mdns] ✅ Server advertising + browsing for TVs');
  } catch (e) {
    console.warn('[mdns] Failed to start:', (e as Error).message);
  }

  // === REST endpoint: list TVs discovered via mDNS ===
  // Registered BEFORE the SPA catch-all so it always returns JSON.
  app.get('/api/mdns/tvs', (_req, res) => {
    if (!mdnsModule) {
      return res.status(503).json({
        tvs: [],
        count: 0,
        serverAdvertising: false,
        error: 'mDNS module not loaded',
      });
    }
    const tvs = mdnsModule.getDiscoveredTVs();
    res.json({
      tvs,
      count: tvs.length,
      serverAdvertising: true,
      serviceType: 'commandcenter._tcp',
    });
  });
  console.log('[mdns] REST endpoint ready: GET /api/mdns/tvs');

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`COMMAND CENTER WebSocket & Web Server running on http://0.0.0.0:${PORT}`);
    console.log('[ws-channels] Channel registry ready. TVs subscribe via WS.');
    console.log('[ws-channels] Active channels: GET http://localhost:' + PORT + '/api/channels');
  });

  // Mount channel-based TV adapter so the operator can publish to TV channels
  // without needing per-TV IP config. TVs connect via WebSocket on their own.
  try {
    const { mountChannelTVAdapter } = await import('./server-tv-adapter-channel');
    mountChannelTVAdapter({
      publish: publishToChannel,
      getSubscribers: getChannelSubscribers,
    });
    console.log('[channel-tv-adapter] Mounted. Operator app can publish to "tv:PS5_01" etc.');
  } catch (e) {
    console.warn('[channel-tv-adapter] Could not mount:', (e as Error).message);
  }
}

startServer();

