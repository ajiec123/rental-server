/**
 * PGlite-backed persistence for the Command Center backend.
 *
 * Uses PGlite (https://pglite.dev) — full PostgreSQL compiled to WASM,
 * embedded in-process, single-file directory, zero external services.
 * Perfect for distributing the app via e-commerce (no Docker, no setup).
 *
 * Tables: stations, transactions, vips, employees, permissions, settings.
 * All mutations use UPSERT (INSERT ... ON CONFLICT DO UPDATE) for atomic
 * writes, wrapped in a transaction for consistency.
 *
 * On first startup, if JSON files exist in DATA_DIR (legacy data from
 * previous JSON-based persistence), they are auto-imported then archived
 * with .bak suffix so they never get re-imported.
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

// DATA_DIR berbasis working directory (root project), sehingga konsisten sama
// di dev (tsx server.ts) maupun produksi (bundled dist/server.mjs). Sebelumnya
// berbasis import.meta.url yang menunjuk ke dist/ setelah di-bundle.
export const DATA_DIR = path.join(process.cwd(), 'data-server');
const PGLITE_DIR = path.join(DATA_DIR, 'pg');

// ===== Schema Types (mirror client types; kept loose for flexibility) =====
export interface DBSession {
  sessionId: string;
  transactionId?: string;
  customerName: string;
  customerPhone?: string;
  vipId?: string;
  startTime: number;
  durationMinutes: number;
  endTime: number;
  isMainBebas?: boolean;
  paymentMethod: string;
  paymentStatus: string;
  amount: number;
  gamePlaying?: string;
  cashierName: string;
  notes?: string;
}

export interface DBStation {
  id: string;
  name: string;
  consoleType: string;
  ratePerHour: number;
  status: 'available' | 'occupied' | 'warning' | 'maintenance';
  currentSession?: DBSession;
  totalSessionsToday: number;
  totalRevenueToday: number;
  countersDay?: string;
}

export interface DBTransaction {
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
  vipId?: string;
}

export interface DBVipMember {
  id: string;
  name: string;
  phone: string;
  tier: string;
  playHoursTotal: number;
  loyaltyPoints: number;
  totalSpent: number;
  createdAt?: number;
}

export interface DBEmployee {
  id: string;
  name: string;
  role: string;
  avatarUrl: string;
  email?: string;
  pin: string;
  createdAt?: number;
}

export interface DBUserPermission {
  userId: string;
  dashboard: number;
  units: number;
  history: number;
  users: number;
  settings: number;
  new_session: number;
}

export interface DBTvPairing {
  stationId: string;
  tvChannel: string;
  label?: string;
  createdAt?: number;
  lastSeenAt?: number;
}

export interface DBSettings {
  storeName: string;
  address: string;
  soundEnabled: number;
  rates: Record<string, number>;
}

export interface DBState {
  stations: DBStation[];
  transactions: DBTransaction[];
  vips: DBVipMember[];
  employees: DBEmployee[];
  permissions: DBUserPermission[];
  tvPairings: DBTvPairing[];
  settings: DBSettings;
}

// ===== Default seed settings =====
const DEFAULT_SETTINGS: DBSettings = {
  storeName: 'COMMAND CENTER',
  address: 'Jl. Cybernetics No. 88, Suite 404, Tech District',
  soundEnabled: 1,
  rates: {
    PS3: 10000,
    PS4: 15000,
    PS5: 20000,
    'PS5 Pro': 25000,
    'Nintendo Switch': 15000,
    'VIP Sim Rig': 35000,
  },
};

// ===== Singleton PGlite instance =====
let pgInstance: PGlite | null = null;

async function getPG(): Promise<PGlite> {
  if (pgInstance) return pgInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PGLITE_DIR)) {
    fs.mkdirSync(PGLITE_DIR, { recursive: true });
  }
  pgInstance = new PGlite(PGLITE_DIR);
  await pgInstance.waitReady;
  await ensureSchema(pgInstance);
  await migrateFromJsonIfPresent(pgInstance);
  return pgInstance;
}

// ===== Schema bootstrap =====
async function ensureSchema(pg: PGlite): Promise<void> {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      console_type TEXT NOT NULL,
      rate_per_hour INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      current_session JSONB,
      total_sessions_today INTEGER NOT NULL DEFAULT 0,
      total_revenue_today INTEGER NOT NULL DEFAULT 0,
      counters_day TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      station_name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      duration_label TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT,
      amount INTEGER NOT NULL,
      formatted_amount TEXT NOT NULL,
      time_label TEXT,
      date_label TEXT,
      timestamp BIGINT NOT NULL,
      cashier_name TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      console_type TEXT,
      receipt_number TEXT,
      vip_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_station ON transactions(station_id);
    CREATE INDEX IF NOT EXISTS idx_tx_payment_status ON transactions(payment_status);

    CREATE TABLE IF NOT EXISTS vips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      tier TEXT NOT NULL DEFAULT 'Bronze',
      play_hours_total REAL NOT NULL DEFAULT 0,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_url TEXT,
      email TEXT,
      pin TEXT NOT NULL,
      created_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      user_id TEXT PRIMARY KEY,
      dashboard INTEGER NOT NULL DEFAULT 1,
      units INTEGER NOT NULL DEFAULT 1,
      history INTEGER NOT NULL DEFAULT 1,
      users INTEGER NOT NULL DEFAULT 1,
      settings INTEGER NOT NULL DEFAULT 1,
      new_session INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tv_pairings (
      station_id TEXT PRIMARY KEY,
      tv_channel TEXT NOT NULL,
      label TEXT,
      created_at BIGINT,
      last_seen_at BIGINT
    );
  `);
}

// ===== Migration from legacy JSON files =====
async function migrateFromJsonIfPresent(pg: PGlite): Promise<void> {
  const stationsFile = path.join(DATA_DIR, 'stations.json');
  const transactionsFile = path.join(DATA_DIR, 'transactions.json');
  const vipsFile = path.join(DATA_DIR, 'vips.json');
  const employeesFile = path.join(DATA_DIR, 'employees.json');
  const permissionsFile = path.join(DATA_DIR, 'permissions.json');
  const settingsFile = path.join(DATA_DIR, 'settings.json');

  // If no legacy JSON files, nothing to migrate.
  const hasLegacy = [stationsFile, transactionsFile, vipsFile, employeesFile, permissionsFile, settingsFile]
    .some((f) => fs.existsSync(f));
  if (!hasLegacy) return;

  // Check if DB already has any data — if yes, skip migration.
  const existing = await pg.query<{ count: string }>('SELECT COUNT(*) as count FROM stations');
  const existingCount = parseInt(existing.rows[0]?.count ?? '0', 10);
  if (existingCount > 0) {
    console.log('[db] PGlite already has data, skipping JSON migration. Archiving .json files.');
    archiveLegacyJson();
    return;
  }

  console.log('[db] One-time migration from JSON to PGlite...');
  const now = Date.now();

  // Stations
  if (fs.existsSync(stationsFile)) {
    const stations = readJson<DBStation[]>(stationsFile, []);
    for (const s of stations) {
      await pg.query(
        `INSERT INTO stations (id, name, console_type, rate_per_hour, status, current_session, total_sessions_today, total_revenue_today, counters_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, console_type=EXCLUDED.console_type,
           rate_per_hour=EXCLUDED.rate_per_hour, status=EXCLUDED.status,
           current_session=EXCLUDED.current_session,
           total_sessions_today=EXCLUDED.total_sessions_today,
           total_revenue_today=EXCLUDED.total_revenue_today,
           counters_day=EXCLUDED.counters_day`,
        [
          s.id, s.name, s.consoleType, s.ratePerHour, s.status,
          s.currentSession ? JSON.stringify(s.currentSession) : null,
          s.totalSessionsToday ?? 0, s.totalRevenueToday ?? 0,
          s.countersDay ?? null,
        ]
      );
    }
    console.log(`[db] Migrated ${stations.length} stations`);
  }

  // Transactions
  if (fs.existsSync(transactionsFile)) {
    const txs = readJson<DBTransaction[]>(transactionsFile, []);
    for (const t of txs) {
      await pg.query(
        `INSERT INTO transactions (id, station_id, station_name, duration_minutes, duration_label, payment_method, payment_status, amount, formatted_amount, time_label, date_label, timestamp, cashier_name, customer_name, console_type, receipt_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           station_id=EXCLUDED.station_id, payment_status=EXCLUDED.payment_status,
           payment_method=EXCLUDED.payment_method`,
        [
          t.id, t.stationId, t.stationName, t.durationMinutes, t.durationLabel,
          t.paymentMethod, t.paymentStatus ?? 'Lunas', t.amount, t.formattedAmount,
          t.timeLabel ?? '', t.dateLabel ?? '', t.timestamp,
          t.cashierName ?? '', t.customerName ?? '', t.consoleType ?? '', t.receiptNumber ?? '',
        ]
      );
    }
    console.log(`[db] Migrated ${txs.length} transactions`);
  }

  // VIPs
  if (fs.existsSync(vipsFile)) {
    const vips = readJson<DBVipMember[]>(vipsFile, []);
    for (const v of vips) {
      await pg.query(
        `INSERT INTO vips (id, name, phone, tier, play_hours_total, loyalty_points, total_spent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, phone=EXCLUDED.phone, tier=EXCLUDED.tier,
           play_hours_total=EXCLUDED.play_hours_total,
           loyalty_points=EXCLUDED.loyalty_points, total_spent=EXCLUDED.total_spent`,
        [v.id, v.name, v.phone ?? '', v.tier ?? 'Bronze',
         v.playHoursTotal ?? 0, v.loyaltyPoints ?? 0, v.totalSpent ?? 0, now]
      );
    }
    console.log(`[db] Migrated ${vips.length} VIPs`);
  }

  // Employees
  if (fs.existsSync(employeesFile)) {
    const emps = readJson<DBEmployee[]>(employeesFile, []);
    for (const e of emps) {
      await pg.query(
        `INSERT INTO employees (id, name, role, avatar_url, email, pin, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, role=EXCLUDED.role,
           avatar_url=EXCLUDED.avatar_url, email=EXCLUDED.email`,
        [e.id, e.name, e.role, e.avatarUrl ?? '', e.email ?? '', e.pin, now]
      );
    }
    console.log(`[db] Migrated ${emps.length} employees`);
  }

  // Permissions
  if (fs.existsSync(permissionsFile)) {
    const perms = readJson<DBUserPermission[]>(permissionsFile, []);
    for (const p of perms) {
      await pg.query(
        `INSERT INTO permissions (user_id, dashboard, units, history, users, settings, new_session)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET
           dashboard=EXCLUDED.dashboard, units=EXCLUDED.units,
           history=EXCLUDED.history, users=EXCLUDED.users,
           settings=EXCLUDED.settings, new_session=EXCLUDED.new_session`,
        [p.userId, p.dashboard, p.units, p.history, p.users, p.settings, p.new_session]
      );
    }
    console.log(`[db] Migrated ${perms.length} permission records`);
  }

  // Settings
  if (fs.existsSync(settingsFile)) {
    const settings = readJson<DBSettings>(settingsFile, DEFAULT_SETTINGS);
    await pg.query(
      `INSERT INTO settings (key, value) VALUES ('app', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [JSON.stringify(settings)]
    );
    console.log('[db] Migrated settings');
  } else {
    // Write default settings
    await pg.query(
      `INSERT INTO settings (key, value) VALUES ('app', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(DEFAULT_SETTINGS)]
    );
  }

  // Archive JSON files so they're never re-imported.
  archiveLegacyJson();
  console.log('[db] Migration complete. Legacy .json files moved to .json.bak');
}

function archiveLegacyJson(): void {
  for (const name of ['stations.json', 'transactions.json', 'vips.json', 'employees.json', 'permissions.json', 'settings.json']) {
    const src = path.join(DATA_DIR, name);
    if (fs.existsSync(src)) {
      const dest = path.join(DATA_DIR, name + '.bak');
      if (!fs.existsSync(dest)) {
        fs.renameSync(src, dest);
      } else {
        fs.unlinkSync(src);
      }
    }
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[db] Failed to read ${filePath}, using fallback:`, (e as Error).message);
    return fallback;
  }
}

// ===== Public API =====
export async function loadAll(): Promise<DBState> {
  const pg = await getPG();

  const [stationsRes, transactionsRes, vipsRes, employeesRes, permissionsRes, settingsRes, pairingsRes] = await Promise.all([
    pg.query<{
      id: string; name: string; console_type: string; rate_per_hour: number;
      status: string; current_session: DBSession | null;
      total_sessions_today: number; total_revenue_today: number; counters_day: string | null;
    }>('SELECT id, name, console_type, rate_per_hour, status, current_session, total_sessions_today, total_revenue_today, counters_day FROM stations ORDER BY id'),
    pg.query<{
      id: string; station_id: string; station_name: string; duration_minutes: number;
      duration_label: string; payment_method: string; payment_status: string | null;
      amount: number; formatted_amount: string; time_label: string | null;
      date_label: string | null; timestamp: string | number;
      cashier_name: string | null; customer_name: string; console_type: string | null;
      receipt_number: string | null;
    }>(`SELECT id, station_id, station_name, duration_minutes, duration_label, payment_method, payment_status, amount, formatted_amount, time_label, date_label, timestamp, cashier_name, customer_name, console_type, receipt_number FROM transactions ORDER BY timestamp DESC`),
    pg.query<{
      id: string; name: string; phone: string | null; tier: string;
      play_hours_total: number; loyalty_points: number; total_spent: number;
    }>('SELECT id, name, phone, tier, play_hours_total, loyalty_points, total_spent FROM vips ORDER BY id'),
    pg.query<{
      id: string; name: string; role: string; avatar_url: string | null;
      email: string | null; pin: string;
    }>('SELECT id, name, role, avatar_url, email, pin FROM employees ORDER BY id'),
    pg.query<{
      user_id: string; dashboard: number; units: number; history: number;
      users: number; settings: number; new_session: number;
    }>('SELECT user_id, dashboard, units, history, users, settings, new_session FROM permissions ORDER BY user_id'),
    pg.query<{ value: unknown }>("SELECT value FROM settings WHERE key = 'app'"),
    pg.query<{
      station_id: string; tv_channel: string; label: string | null; created_at: string | number | null; last_seen_at: string | number | null;
    }>('SELECT station_id, tv_channel, label, created_at, last_seen_at FROM tv_pairings ORDER BY station_id'),
  ]);

  const stations: DBStation[] = stationsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    consoleType: r.console_type,
    ratePerHour: r.rate_per_hour,
    status: r.status as DBStation['status'],
    currentSession: r.current_session ?? undefined,
    totalSessionsToday: r.total_sessions_today,
    totalRevenueToday: r.total_revenue_today,
    countersDay: r.counters_day ?? undefined,
  }));

  const transactions: DBTransaction[] = transactionsRes.rows.map((r) => ({
    id: r.id,
    stationId: r.station_id,
    stationName: r.station_name,
    durationMinutes: r.duration_minutes,
    durationLabel: r.duration_label,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status ?? 'Lunas',
    amount: r.amount,
    formattedAmount: r.formatted_amount,
    timeLabel: r.time_label ?? '',
    dateLabel: r.date_label ?? '',
    timestamp: Number(r.timestamp),
    cashierName: r.cashier_name ?? '',
    customerName: r.customer_name,
    consoleType: r.console_type ?? '',
    receiptNumber: r.receipt_number ?? '',
  }));

  const vips: DBVipMember[] = vipsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    tier: r.tier,
    playHoursTotal: r.play_hours_total,
    loyaltyPoints: r.loyalty_points,
    totalSpent: r.total_spent,
  }));

  const employees: DBEmployee[] = employeesRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    avatarUrl: r.avatar_url ?? '',
    email: r.email ?? '',
    pin: r.pin,
  }));

  const permissions: DBUserPermission[] = permissionsRes.rows.map((r) => ({
    userId: r.user_id,
    dashboard: r.dashboard,
    units: r.units,
    history: r.history,
    users: r.users,
    settings: r.settings,
    new_session: r.new_session,
  }));

  const tvPairings: DBTvPairing[] = pairingsRes.rows.map((r) => ({
    stationId: r.station_id,
    tvChannel: r.tv_channel,
    label: r.label ?? undefined,
    createdAt: r.created_at ? Number(r.created_at) : undefined,
    lastSeenAt: r.last_seen_at ? Number(r.last_seen_at) : undefined,
  }));

  let settings: DBSettings = DEFAULT_SETTINGS;
  if (settingsRes.rows.length > 0) {
    const raw = settingsRes.rows[0].value;
    if (raw && typeof raw === 'object' && 'storeName' in (raw as Record<string, unknown>)) {
      settings = raw as DBSettings;
    }
  }

  return { stations, transactions, vips, employees, permissions, tvPairings, settings };
}

export async function saveStations(stations: DBStation[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const ids = stations.map((s) => s.id);
    if (ids.length === 0) {
      await tx.exec('DELETE FROM stations');
    } else {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM stations WHERE id NOT IN (${placeholders})`, ids);
    }
    for (const s of stations) {
      await tx.query(
        `INSERT INTO stations (id, name, console_type, rate_per_hour, status, current_session, total_sessions_today, total_revenue_today, counters_day)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, console_type=EXCLUDED.console_type,
           rate_per_hour=EXCLUDED.rate_per_hour, status=EXCLUDED.status,
           current_session=EXCLUDED.current_session,
           total_sessions_today=EXCLUDED.total_sessions_today,
           total_revenue_today=EXCLUDED.total_revenue_today,
           counters_day=EXCLUDED.counters_day`,
        [
          s.id, s.name, s.consoleType, s.ratePerHour, s.status,
          s.currentSession ? JSON.stringify(s.currentSession) : null,
          s.totalSessionsToday ?? 0, s.totalRevenueToday ?? 0,
          s.countersDay ?? null,
        ]
      );
    }
  });
}

export async function saveTransactions(txs: DBTransaction[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const ids = txs.map((t) => t.id);
    if (ids.length === 0) {
      await tx.exec('DELETE FROM transactions');
    } else {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM transactions WHERE id NOT IN (${placeholders})`, ids);
    }
    for (const t of txs) {
      await tx.query(
        `INSERT INTO transactions (id, station_id, station_name, duration_minutes, duration_label, payment_method, payment_status, amount, formatted_amount, time_label, date_label, timestamp, cashier_name, customer_name, console_type, receipt_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           station_id=EXCLUDED.station_id, station_name=EXCLUDED.station_name,
           duration_minutes=EXCLUDED.duration_minutes, duration_label=EXCLUDED.duration_label,
           payment_method=EXCLUDED.payment_method, payment_status=EXCLUDED.payment_status,
           amount=EXCLUDED.amount, formatted_amount=EXCLUDED.formatted_amount,
           time_label=EXCLUDED.time_label, date_label=EXCLUDED.date_label,
           cashier_name=EXCLUDED.cashier_name, customer_name=EXCLUDED.customer_name,
           console_type=EXCLUDED.console_type, receipt_number=EXCLUDED.receipt_number`,
        [
          t.id, t.stationId, t.stationName, t.durationMinutes, t.durationLabel,
          t.paymentMethod, t.paymentStatus ?? 'Lunas', t.amount, t.formattedAmount,
          t.timeLabel ?? '', t.dateLabel ?? '', t.timestamp,
          t.cashierName ?? '', t.customerName ?? '', t.consoleType ?? '', t.receiptNumber ?? '',
        ]
      );
    }
  });
}

export async function saveVips(vips: DBVipMember[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const ids = vips.map((v) => v.id);
    if (ids.length === 0) {
      await tx.exec('DELETE FROM vips');
    } else {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM vips WHERE id NOT IN (${placeholders})`, ids);
    }
    for (const v of vips) {
      await tx.query(
        `INSERT INTO vips (id, name, phone, tier, play_hours_total, loyalty_points, total_spent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, phone=EXCLUDED.phone, tier=EXCLUDED.tier,
           play_hours_total=EXCLUDED.play_hours_total,
           loyalty_points=EXCLUDED.loyalty_points, total_spent=EXCLUDED.total_spent`,
        [v.id, v.name, v.phone ?? '', v.tier ?? 'Bronze',
         v.playHoursTotal ?? 0, v.loyaltyPoints ?? 0, v.totalSpent ?? 0]
      );
    }
  });
}

export async function saveEmployees(emps: DBEmployee[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const ids = emps.map((e) => e.id);
    if (ids.length === 0) {
      await tx.exec('DELETE FROM employees');
    } else {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM employees WHERE id NOT IN (${placeholders})`, ids);
    }
    for (const e of emps) {
      await tx.query(
        `INSERT INTO employees (id, name, role, avatar_url, email, pin)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, role=EXCLUDED.role,
           avatar_url=EXCLUDED.avatar_url, email=EXCLUDED.email`,
        [e.id, e.name, e.role, e.avatarUrl ?? '', e.email ?? '', e.pin]
      );
    }
  });
}

export async function savePermissions(perms: DBUserPermission[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const userIds = perms.map((p) => p.userId);
    if (userIds.length === 0) {
      await tx.exec('DELETE FROM permissions');
    } else {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM permissions WHERE user_id NOT IN (${placeholders})`, userIds);
    }
    for (const p of perms) {
      await tx.query(
        `INSERT INTO permissions (user_id, dashboard, units, history, users, settings, new_session)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET
           dashboard=EXCLUDED.dashboard, units=EXCLUDED.units,
           history=EXCLUDED.history, users=EXCLUDED.users,
           settings=EXCLUDED.settings, new_session=EXCLUDED.new_session`,
        [p.userId, p.dashboard, p.units, p.history, p.users, p.settings, p.new_session]
      );
    }
  });
}

export async function saveSettings(settings: DBSettings): Promise<void> {
  const pg = await getPG();
  await pg.query(
    `INSERT INTO settings (key, value) VALUES ('app', $1)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify(settings)]
  );
}

export async function saveTvPairings(pairings: DBTvPairing[]): Promise<void> {
  const pg = await getPG();
  await pg.transaction(async (tx) => {
    const stationIds = pairings.map((p) => p.stationId);
    if (stationIds.length === 0) {
      await tx.exec('DELETE FROM tv_pairings');
    } else {
      const placeholders = stationIds.map((_, i) => `$${i + 1}`).join(',');
      await tx.query(`DELETE FROM tv_pairings WHERE station_id NOT IN (${placeholders})`, stationIds);
    }
    for (const pairing of pairings) {
      await tx.query(
        `INSERT INTO tv_pairings (station_id, tv_channel, label, created_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (station_id) DO UPDATE SET
           tv_channel=EXCLUDED.tv_channel,
           label=EXCLUDED.label,
           created_at=EXCLUDED.created_at,
           last_seen_at=EXCLUDED.last_seen_at`,
        [pairing.stationId, pairing.tvChannel, pairing.label ?? null, pairing.createdAt ?? Date.now(), pairing.lastSeenAt ?? null]
      );
    }
  });
}

// ===== Database reset (for restore-with-reset / fresh migrate) =====
/**
 * Drops all known tables. Used by:
 *   1. /api/admin/restore?reset=1 — wipe before importing backup
 *   2. CLI `npm run db:fresh` — equivalent of `php artisan migrate:fresh`
 *
 * Schema will be re-created on next getPG() call via ensureSchema().
 */
export async function resetDatabase(): Promise<void> {
  const pg = await getPG();
  await pg.exec(`
    DROP TABLE IF EXISTS transactions CASCADE;
    DROP TABLE IF EXISTS stations CASCADE;
    DROP TABLE IF EXISTS vips CASCADE;
    DROP TABLE IF EXISTS employees CASCADE;
    DROP TABLE IF EXISTS permissions CASCADE;
    DROP TABLE IF EXISTS settings CASCADE;
    DROP TABLE IF EXISTS tv_pairings CASCADE;
  `);
  // Force next call to rebuild schema + re-migrate legacy JSON if any
  pgInstance = null;
}

// Legacy compatibility export
export const DATA_DIR_PATH = DATA_DIR;