import React, { useMemo } from 'react';
import { UserAccount, AttendanceRecord, StaffUser } from '../types';

interface AttendanceSelfCardProps {
  currentUser: UserAccount;
  /** Map absensi: attendanceMap[employeeId][dateKey] = record */
  attendanceMap: Record<string, Record<string, AttendanceRecord>>;
  /** Tunjangan makan per hari (default: 10000) */
  mealAllowancePerDay?: number;
  /** Persentase bagi hasil dari revenue (default: 0.25 = 25%) */
  profitShareRate?: number;
  /** State runtime staff, termasuk revenueHandled */
  staffStateMap: Record<string, StaffUser>;
  onClockIn: (employeeId: string) => void;
  onClockOut: (employeeId: string) => void;
}

/** Format tanggal hari ini ke 'YYYY-MM-DD' */
function getTodayKey(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Format jam dari timestamp ms → 'HH:mm' */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Banner absensi otomatis untuk karyawan yang sedang login.
 * Hanya muncul jika currentUser.role === 'Karyawan'.
 * Owner TIDAK melihat banner ini.
 */
export const AttendanceSelfCard: React.FC<AttendanceSelfCardProps> = ({
  currentUser,
  attendanceMap,
  mealAllowancePerDay = 10000,
  profitShareRate = 0.25,
  staffStateMap,
  onClockIn,
  onClockOut,
}) => {
  // Hanya render untuk karyawan
  if (currentUser.role !== 'Karyawan') return null;

  const todayKey = getTodayKey();
  const todayRecord = attendanceMap[currentUser.id]?.[todayKey];
  const isClockedIn = !!todayRecord && !todayRecord.clockOut;
  const isClockedOut = !!todayRecord && !!todayRecord.clockOut;

  // Hitung gaji periode ini
  const daysPresent = useMemo(
    () => Object.keys(attendanceMap[currentUser.id] || {}).length,
    [attendanceMap, currentUser.id]
  );
  const staffState = staffStateMap[currentUser.id];
  const revenueHandled = staffState?.revenueHandled || 0;
  const mealAllowance = daysPresent * mealAllowancePerDay;
  const profitShare = Math.round(revenueHandled * profitShareRate);
  const totalSalary = mealAllowance + profitShare;

  // Status badge
  const statusLabel = isClockedIn
    ? 'Sedang Bertugas'
    : isClockedOut
    ? 'Sudah Absen Keluar'
    : 'Belum Absen';
  const statusBg = isClockedIn
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : isClockedOut
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-slate-100 text-slate-700 border-slate-300';

  return (
    <section className="bg-gradient-to-r from-emerald-50 via-cyan-50 to-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
        {/* Baris 1: status absen */}
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              isClockedIn
                ? 'bg-emerald-500 text-white animate-pulse'
                : isClockedOut
                ? 'bg-amber-500 text-white'
                : 'bg-slate-300 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {isClockedIn
                ? 'how_to_reg'
                : isClockedOut
                ? 'event_available'
                : 'schedule'}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm text-slate-900">
                Absensi Hari Ini
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${statusBg}`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium mt-0.5">
              {todayRecord ? (
                <>
                  Masuk:{' '}
                  <strong className="text-slate-900">
                    {formatTime(todayRecord.clockIn)}
                  </strong>
                  {todayRecord.clockOut && (
                    <>
                      {' · '}Keluar:{' '}
                      <strong className="text-slate-900">
                        {formatTime(todayRecord.clockOut)}
                      </strong>
                    </>
                  )}
                </>
              ) : (
                <span>Belum ada catatan absen. Silakan absen masuk.</span>
              )}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-emerald-200/70" />

        {/* Tombol Absen — layout atas-bawah (stack) */}
        <div className="flex flex-col gap-2 w-full">
          {!isClockedOut && (
            <button
              onClick={() => onClockIn(currentUser.id)}
              disabled={isClockedIn}
              className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                isClockedIn
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm active:scale-95 cursor-pointer'
              }`}
            >
              <span className="material-symbols-outlined text-base">login</span>
              {isClockedIn ? 'Sudah Absen' : 'Absen Masuk'}
            </button>
          )}
          {isClockedIn && (
            <button
              onClick={() => onClockOut(currentUser.id)}
              className="w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              Absen Keluar
            </button>
          )}
          {isClockedOut && (
            <span className="w-full py-2.5 rounded-xl text-sm font-bold border bg-slate-100 text-slate-500 border-slate-200 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base">check</span>
              Selesai Hari Ini
            </span>
          )}
        </div>

        {/* Baris 2: ringkasan gaji — uang makan & bagi hasil dipisah jelas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {/* Hari Hadir */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Hari Hadir
            </div>
            <div className="text-lg font-extrabold text-slate-900 font-mono-code mt-1">
              {daysPresent}
            </div>
          </div>

          {/* Bagi Hasil */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
              Gaji (Bagi Hasil)
            </div>
            <div className="text-base font-extrabold text-emerald-700 font-mono-code mt-1">
              Rp {profitShare.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
              25% × Rp {revenueHandled.toLocaleString('id-ID')}
            </div>
          </div>

          {/* Uang Makan */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">restaurant</span>
              Uang Makan
            </div>
            <div className="text-base font-extrabold text-amber-700 font-mono-code mt-1">
              Rp {mealAllowance.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
              Rp 10.000 × {daysPresent} hari
            </div>
          </div>

          {/* Total Gaji */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3">
            <div className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">account_balance_wallet</span>
              Total Gaji
            </div>
            <div className="text-lg font-extrabold text-white font-mono-code mt-1">
              Rp {totalSalary.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
    </section>
  );
};
