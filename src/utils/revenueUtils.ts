import { Transaction } from '../types';

/**
 * Aggregates revenue from transaction history. All amounts are computed
 * from real transactions, with NO hardcoded baselines.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getStartOfDay(d: Date): number {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function getStartOfWeek(d: Date): number {
  // Treat Monday as week start (ISO-style; tweak per locale if needed)
  const start = new Date(d);
  const day = start.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function getStartOfMonth(d: Date): number {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/** Sum tx.amount where timestamp >= startMs. */
function sumSince(transactions: Transaction[], startMs: number): number {
  return transactions
    .filter((tx) => tx.timestamp >= startMs)
    .reduce((acc, tx) => acc + tx.amount, 0);
}

export function computeDailyRevenue(transactions: Transaction[]): number {
  return sumSince(transactions, getStartOfDay(new Date()));
}

export function computeWeeklyRevenue(transactions: Transaction[]): number {
  return sumSince(transactions, getStartOfWeek(new Date()));
}

export function computeMonthlyRevenue(transactions: Transaction[]): number {
  return sumSince(transactions, getStartOfMonth(new Date()));
}

export function computeOutstandingRevenue(transactions: Transaction[]): {
  total: number;
  count: number;
  oldestTimestamp: number | null;
} {
  const unpaid = transactions.filter(
    (tx) => tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending'
  );
  const total = unpaid.reduce((acc, tx) => acc + tx.amount, 0);
  const oldestTimestamp =
    unpaid.length === 0
      ? null
      : unpaid.reduce((min, tx) => Math.min(min, tx.timestamp), Date.now());
  return { total, count: unpaid.length, oldestTimestamp };
}

export function getDayStartTimestamp(): number {
  return getStartOfDay(new Date());
}

export function getWeekStartTimestamp(): number {
  return getStartOfWeek(new Date());
}

export function getMonthStartTimestamp(): number {
  return getStartOfMonth(new Date());
}