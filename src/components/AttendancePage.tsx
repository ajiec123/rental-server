import React, { useMemo } from 'react';
import {
  UserAccount,
  AttendanceRecord,
  StaffUser,
} from '../types';
import { Avatar } from './Avatar';

interface AttendancePageProps {
  currentUser: UserAccount;
  /** Map absensi: attendanceMap[employeeId][dateKey 'YYYY-MM-DD'] = record */
  attendanceMap: Record<string, Record<string, AttendanceRecord>>;
  /** State runtime staff per karyawan (status Hadir, revenueHandled, dll) */
  staffStateMap: Record<string, StaffUser>;
  /** Daftar semua akun untuk mode Owner (lihat absensi semua karyawan) */
  employeeAccounts: UserAccount[];
  mealAllowancePerDay?: number;
  profitShareRate?: number;
  onClockIn: (employeeId: string) => void;
  onClockOut: (employeeId: string) => void;
}

/** Format tanggal hari ini ke 'YYYY-MM-DD' */
function getTodayKey(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Format timestamp ms → 'HH:mm' */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Halaman Absensi karyawan.
 *
 * Mode Karyawan:
 *  - Tampilkan card "Absen Saya" + "Performa & Gaji Saya" (1-to-1 dengan akun login).
 *
 * Mode Owner:
 *  - Tampilkan ringkasan performa semua karyawan + tombol Absen Masuk/Keluar override.
 */
export const AttendancePage: React.FC<AttendancePageProps> = ({
  currentUser,
  attendanceMap,
  staffStateMap,
  employeeAccounts,
  mealAllowancePerDay = 10000,
  profitShareRate = 0.25,
  onClockIn,
  onClockOut,
}) => {
  const isOwner = currentUser.role === 'Owner';
  const todayKey = getTodayKey();

  // === My (current user) attendance ===
  const myTodayRecord = attendanceMap[currentUser.id]?.[todayKey];
  const myIsClockedIn = !!myTodayRecord && !myTodayRecord?.clockOut;
  const myIsClockedOut = !!myTodayRecord && !!myTodayRecord?.clockOut;
  const myDaysPresent = useMemo(
    () => Object.keys(attendanceMap[currentUser.id] || {}).length,
    [attendanceMap, currentUser.id]
  );
  const myRevenueHandled = staffStateMap[currentUser.id]?.revenueHandled || 0;
  const myMealAllowance = myDaysPresent * mealAllowancePerDay;
  const myProfitShare = Math.round(myRevenueHandled * profitShareRate);
  const myTotalSalary = myMealAllowance + myProfitShare;

  const myStatusLabel = myIsClockedIn
    ? 'Sedang Bertugas'
    : myIsClockedOut
    ? 'Sudah Absen Keluar'
    : 'Belum Absen';

  // === All employees (Owner view) ===
  const employeeSummaries = useMemo(() => {
    return employeeAccounts
      .filter((acc) => acc.role === 'Karyawan')
      .map((acc) => {
        const daysPresent = Object.keys(attendanceMap[acc.id] || {}).length;
        const revenueHandled = staffStateMap[acc.id]?.revenueHandled || 0;
        const mealAllowance = daysPresent * mealAllowancePerDay;
        const profitShare = Math.round(revenueHandled * profitShareRate);
        const totalSalary = mealAllowance + profitShare;
        const todayRec = attendanceMap[acc.id]?.[todayKey];
        const isPresent = !!todayRec && !todayRec?.clockOut;
        return {
          account: acc,
          daysPresent,
          revenueHandled,
          mealAllowance,
          profitShare,
          totalSalary,
          isPresent,
        };
      });
  }, [
    employeeAccounts,
    attendanceMap,
    staffStateMap,
    todayKey,
    mealAllowancePerDay,
    profitShareRate,
  ]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header halaman */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-2xl">event_available</span>
          </div>
          <div>
            <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-2">
              Absensi Karyawan
              {isOwner && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                  Owner Mode
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {isOwner
                ? 'Pantau absensi & hitung gaji bagi hasil semua karyawan.'
                : 'Absen masuk/keluar, lihat performa & gaji Anda periode ini.'}
            </p>
          </div>
        </div>
      </div>

      {/* === Card absen diri sendiri (semua user lihat) === */}
      <section className="bg-gradient-to-r from-emerald-50 via-cyan-50 to-emerald-50 border border-emerald-200 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          {/* Kiri: status + waktu */}
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                myIsClockedIn
                  ? 'bg-emerald-500 text-white animate-pulse'
                  : myIsClockedOut
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-300 text-white'
              }`}
            >
              <span className="material-symbols-outlined text-2xl">
                {myIsClockedIn
                  ? 'how_to_reg'
                  : myIsClockedOut
                  ? 'event_available'
                  : 'schedule'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base text-slate-900">
                  Absen Saya
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                    myIsClockedIn
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : myIsClockedOut
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  {myStatusLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                {myTodayRecord ? (
                  <>
                    Masuk:{' '}
                    <strong className="text-slate-900">
                      {formatTime(myTodayRecord.clockIn)}
                    </strong>
                    {myTodayRecord.clockOut && (
                      <>
                        {' · '}Keluar:{' '}
                        <strong className="text-slate-900">
                          {formatTime(myTodayRecord.clockOut)}
                        </strong>
                      </>
                    )}
                  </>
                ) : (
                  <span>Belum ada catatan absen hari ini.</span>
                )}
              </p>
            </div>
          </div>

          {/* Tombol Absen (atas-bawah, full-width) */}
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[180px]">
            {!myIsClockedOut && (
              <button
                onClick={() => onClockIn(currentUser.id)}
                disabled={myIsClockedIn}
                className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                  myIsClockedIn
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm active:scale-95 cursor-pointer'
                }`}
              >
                <span className="material-symbols-outlined text-base">login</span>
                {myIsClockedIn ? 'Sudah Absen' : 'Absen Masuk'}
              </button>
            )}
            {myIsClockedIn && (
              <button
                onClick={() => onClockOut(currentUser.id)}
                className="w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                Absen Keluar
              </button>
            )}
            {myIsClockedOut && (
              <span className="w-full py-2.5 rounded-xl text-sm font-bold border bg-slate-100 text-slate-500 border-slate-200 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">check</span>
                Selesai Hari Ini
              </span>
            )}
          </div>
        </div>

        {/* Stat ringkasan */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-emerald-200/60">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Hari Hadir
            </div>
            <div className="text-lg font-extrabold text-slate-900 font-mono-code mt-1">
              {myDaysPresent}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              periode ini
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
              Gaji (Bagi Hasil)
            </div>
            <div className="text-base font-extrabold text-emerald-700 font-mono-code mt-1">
              Rp {myProfitShare.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
              25% × Rp {myRevenueHandled.toLocaleString('id-ID')}
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">restaurant</span>
              Uang Makan
            </div>
            <div className="text-base font-extrabold text-amber-700 font-mono-code mt-1">
              Rp {myMealAllowance.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
              Rp 10.000 × {myDaysPresent} hari
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3">
            <div className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">
                account_balance_wallet
              </span>
              Total Gaji
            </div>
            <div className="text-lg font-extrabold text-white font-mono-code mt-1">
              Rp {myTotalSalary.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </section>

      {/* === Section Performa & Gaji Karyawan === */}
      <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">analytics</span>
            <h3 className="font-bold text-lg text-slate-900">
              {isOwner ? 'Performa & Gaji Semua Karyawan' : 'Detail Performa Saya'}
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Reset otomatis setiap tanggal 25
          </span>
        </div>

        {isOwner ? (
          // === Tabel ringkasan Owner ===
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-label-ts text-slate-600 uppercase font-bold">
                  <th className="p-3">Karyawan</th>
                  <th className="p-3 text-center">Status Hari Ini</th>
                  <th className="p-3 text-right">Hari Hadir</th>
                  <th className="p-3 text-right">Pendapatan</th>
                  <th className="p-3 text-right">Uang Makan</th>
                  <th className="p-3 text-right">Gaji (25%)</th>
                  <th className="p-3 text-right">Total Gaji</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeSummaries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                      Belum ada akun karyawan.
                    </td>
                  </tr>
                )}
                {employeeSummaries.map((s) => (
                  <tr key={s.account.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.account.name} size="sm" />
                        <div>
                          <div className="font-bold text-slate-900">
                            {s.account.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-code">
                            @{s.account.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          s.isPresent
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {s.isPresent ? 'Hadir' : 'Tidak'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono-code font-bold">
                      {s.daysPresent}
                    </td>
                    <td className="p-3 text-right font-mono-code font-bold text-emerald-700">
                      Rp {s.revenueHandled.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono-code text-amber-700">
                      Rp {s.mealAllowance.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono-code font-bold text-emerald-700">
                      Rp {s.profitShare.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono-code font-extrabold text-slate-900">
                      Rp {s.totalSalary.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // === Detail card Karyawan (1 card) ===
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Hari Hadir
              </div>
              <div className="text-2xl font-extrabold text-slate-900 font-mono-code mt-1">
                {myDaysPresent}
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                hari (periode ini)
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                Pendapatan Ditangani
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 font-mono-code mt-1">
                Rp {myRevenueHandled.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                total bulan ini
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">restaurant</span>
                Uang Makan
              </div>
              <div className="text-2xl font-extrabold text-amber-700 font-mono-code mt-1">
                Rp {myMealAllowance.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                Rp 10.000 × {myDaysPresent} hari
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-900 rounded-xl p-4">
              <div className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">
                  account_balance_wallet
                </span>
                Total Gaji
              </div>
              <div className="text-2xl font-extrabold text-white font-mono-code mt-1">
                Rp {myTotalSalary.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-slate-300 font-medium mt-0.5">
                uang makan + bagi hasil
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
