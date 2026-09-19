import React, { useState, useEffect } from 'react';
import { GamingStation } from '../types';

interface StationCardProps {
  station: GamingStation;
  onStartSession: (station: GamingStation) => void;
  onEndSession: (station: GamingStation) => void;
  onExtendSession: (station: GamingStation, minutes: number) => void;
  onMoveSession?: (station: GamingStation) => void;
  onTvControl?: (station: GamingStation) => void;
  onEditStation?: (station: GamingStation) => void;
  onDeleteStation?: (stationId: string) => void;
  tvStatus?: { status: 'online' | 'idle' | 'offline' | 'unknown'; latencyMs: number | null; subscribers: number };
  onReconnectTv?: (station: GamingStation) => void;
}

export const StationCard: React.FC<StationCardProps> = ({
  station,
  onStartSession,
  onEndSession,
  onExtendSession,
  onMoveSession,
  onTvControl,
  onEditStation,
  onDeleteStation,
  tvStatus,
  onReconnectTv,
}) => {
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [percentRemaining, setPercentRemaining] = useState<number>(0);
  const [estCost, setEstCost] = useState<number>(0);
  const [hasFiredExpired, setHasFiredExpired] = useState<boolean>(false);

  const isMainBebas = station.currentSession?.isMainBebas || station.currentSession?.durationMinutes === 0;

  useEffect(() => {
    if (!station.currentSession) {
      setHasFiredExpired(false);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();

      if (isMainBebas) {
        // Counting UP timer for Main Bebas
        const elapsed = Math.max(0, now - station.currentSession!.startTime);
        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        const mins = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((elapsed % (1000 * 60)) / 1000);

        const pad = (n: number) => n.toString().padStart(2, '0');
        setTimeLeftStr(`${pad(hours)}:${pad(mins)}:${pad(secs)}`);

        // Calculate live estimated cost: (Minutes / 60) * Rate
        const elapsedMinutes = Math.max(1, Math.ceil(elapsed / (1000 * 60)));
        const calculatedCost = Math.round((elapsedMinutes / 60) * station.ratePerHour);
        setEstCost(calculatedCost);
        setPercentRemaining(100);
      } else {
        // Counting DOWN timer for fixed package
        const diff = station.currentSession!.endTime - now;

        if (diff <= 0) {
          setTimeLeftStr('00:00:00 - Selesai');
          setPercentRemaining(0);
        } else {
          const totalDurationMs = station.currentSession!.durationMinutes * 60 * 1000;
          const pct = Math.max(0, Math.min(100, (diff / totalDurationMs) * 100));
          setPercentRemaining(pct);

          const hours = Math.floor(diff / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);

          const pad = (n: number) => n.toString().padStart(2, '0');
          setTimeLeftStr(`${pad(hours)}:${pad(mins)}:${pad(secs)}`);
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [station.currentSession, isMainBebas, station.ratePerHour]);

  // Watchdog: trigger onEndSession automatically the moment the fixed timer hits 0.
  // Only fires once per session to avoid duplicate modal opens.
  useEffect(() => {
    if (!station.currentSession) {
      setHasFiredExpired(false);
      return;
    }
    if (isMainBebas) return;
    if (hasFiredExpired) return;

    const checkExpired = () => {
      if (!station.currentSession) return;
      const now = Date.now();
      const remainingMs = station.currentSession.endTime - now;
      if (remainingMs <= 0) {
        setHasFiredExpired(true);
        onEndSession(station);
      }
    };

    // Check immediately + every 2 seconds as a backup safety net
    checkExpired();
    const watchdog = setInterval(checkExpired, 2000);
    return () => clearInterval(watchdog);
  }, [station, isMainBebas, hasFiredExpired, onEndSession]);

  const isOccupied =
    (station.status === 'occupied' || station.status === 'warning') &&
    !!station.currentSession;
  const isExpired = isOccupied && !isMainBebas && percentRemaining === 0;
  const isWarning = !isMainBebas && !isExpired && (station.status === 'warning' || (percentRemaining < 15 && isOccupied));

  return (
    <div
      className={`bg-white border rounded-2xl p-4 flex flex-col justify-between transition-all shadow-sm ${
        isExpired
          ? 'border-rose-500 bg-rose-50 shadow-lg ring-2 ring-rose-400/40 animate-pulse'
          : isWarning
          ? 'border-amber-400 bg-amber-50/30 shadow-md ring-2 ring-amber-400/20'
          : isOccupied
          ? 'border-rose-300 bg-rose-50/20'
          : 'border-slate-200 hover:border-cyan-400 hover:shadow-md'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-cyan-700">
              <span className="material-symbols-outlined text-lg">gamepad</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-snug">
                {station.name}
              </h3>
              <span className="font-label-ts text-[10px] text-slate-500 font-medium">
                {station.consoleType}
              </span>
            </div>
          </div>

          {/* Status Badge & Actions */}
          <div className="flex items-center gap-1.5">
            {(onEditStation || onDeleteStation || onTvControl) && (
              <div className="flex items-center gap-1 mr-1">
                {onTvControl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTvControl(station);
                    }}
                    title="Kontrol TV Station (Power / Volume)"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">tv</span>
                  </button>
                )}
                {onEditStation && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditStation(station);
                    }}
                    title="Edit Station Unit"
                    className="p-1 rounded-lg text-slate-400 hover:text-cyan-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                )}
                {onDeleteStation && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStation(station.id);
                    }}
                    title="Hapus Station Unit"
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                )}
              </div>
            )}

            <span
              className={`font-label-ts text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 font-bold ${
                isExpired
                  ? 'bg-rose-600 text-white border border-rose-700'
                  : isMainBebas
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  : isWarning
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : isOccupied
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isExpired
                    ? 'bg-white animate-ping'
                    : isMainBebas
                    ? 'bg-indigo-600 animate-ping'
                    : isWarning
                    ? 'bg-amber-500 animate-pulse'
                    : isOccupied
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
                }`}
              ></span>
              {isExpired ? 'WAKTU HABIS' : isMainBebas ? 'MAIN BEBAS' : isWarning ? 'HAMPIR HABIS' : isOccupied ? 'TERPAKAI' : 'SIAP'}
            </span>
          </div>
        </div>

        {/* TV Status pill — di bawah header, full-width agar konsisten & mudah dibaca.
            Karyawan tidak perlu paham signal bar; cukup lihat warna + label. */}
        {tvStatus && (
          <div className="mt-2 flex items-center gap-1.5">
            <div
              className={`flex-1 min-w-0 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${
                tvStatus.status === 'online'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : tvStatus.status === 'idle'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : tvStatus.status === 'offline'
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
              title={
                tvStatus.status === 'online'
                  ? `TV terhubung normal — heartbeat ${tvStatus.latencyMs ?? 0}ms lalu`
                  : tvStatus.status === 'idle'
                  ? `TV heartbeat melambat — ${tvStatus.latencyMs ?? 0}ms lalu`
                  : tvStatus.status === 'offline'
                  ? 'TV tidak terdeteksi — periksa koneksi receiver'
                  : 'Status TV belum tersedia'
              }
            >
              <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
                {tvStatus.status === 'online' ? 'cast_connected' :
                 tvStatus.status === 'idle' ? 'cast' :
                 tvStatus.status === 'offline' ? 'cast_for_education' :
                 'help'}
              </span>
              <span className="truncate">
                {tvStatus.status === 'online' && 'TV Connected'}
                {tvStatus.status === 'idle' && `TV Lambat (${Math.round((tvStatus.latencyMs ?? 0) / 1000)}s)`}
                {tvStatus.status === 'offline' && 'TV Offline'}
                {tvStatus.status === 'unknown' && 'TV Belum Terhubung'}
              </span>
            </div>
          </div>
        )}

        {/* Content Body */}
        {isOccupied ? (
          <div className="my-3 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Penyewa:</span>
              <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
                {station.currentSession?.customerName}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">
                {isMainBebas ? 'Waktu Berjalan:' : 'Sisa Waktu:'}
              </span>
              <span className={`font-mono-code text-sm font-extrabold ${isMainBebas ? 'text-indigo-700' : 'text-cyan-700'}`}>
                {timeLeftStr || 'Menghitung...'}
              </span>
            </div>

            {isMainBebas && (
              <div className="flex justify-between items-center text-xs pt-0.5 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Estimasi Biaya:</span>
                <span className="font-mono-code font-bold text-indigo-900 bg-indigo-100/70 px-2 py-0.5 rounded border border-indigo-200">
                  Rp {estCost.toLocaleString('id-ID')}
                </span>
              </div>
            )}

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  isMainBebas ? 'bg-indigo-600' : isWarning ? 'bg-amber-500' : 'bg-cyan-600'
                }`}
                style={{ width: `${percentRemaining}%` }}
              ></div>
            </div>

            {station.currentSession?.gamePlaying && (
              <div className="text-[11px] text-slate-600 truncate flex items-center gap-1 pt-1.5 border-t border-slate-200">
                <span className="material-symbols-outlined text-xs text-cyan-600">
                  sports_esports
                </span>
                <span className="font-medium">{station.currentSession.gamePlaying}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="my-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <div className="font-mono-code text-sm font-bold text-slate-800">
              Rp {station.ratePerHour.toLocaleString('id-ID')} / jam
            </div>
            <div className="font-label-ts text-[10px] text-slate-500 mt-0.5 font-medium">
              Tersedia untuk disewa
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-slate-100">
        {isOccupied ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              {!isMainBebas && (
                <button
                  onClick={() => onExtendSession(station, 60)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold py-2 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">more_time</span>
                  +1 Jam
                </button>
              )}
              <button
                onClick={() => onEndSession(station)}
                className={`flex-1 text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                  isExpired
                    ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-md animate-pulse font-extrabold'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {isExpired ? 'priority_high' : 'check_circle'}
                </span>
                {isExpired ? 'Selesaikan Sekarang!' : 'Selesai & Bayar'}
              </button>
            </div>

            {/* Pindah Station button — preserves remaining duration */}
            {onMoveSession && (
              <button
                onClick={() => onMoveSession(station)}
                title="Pindahkan sesi aktif ke station lain (durasi tetap)"
                className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-semibold py-2 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">swap_horiz</span>
                Pindah Station
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => onStartSession(station)}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              Mulai Timer (Sewa)
            </button>
            {onReconnectTv && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReconnectTv(station);
                }}
                title={
                  tvStatus && (tvStatus.status === 'offline' || tvStatus.status === 'idle' || tvStatus.status === 'unknown')
                    ? 'TV tidak terhubung — coba paksa reconnect'
                    : 'Test koneksi TV receiver (kirim sinyal RECONNECT_TV ke channel)'
                }
                className={`shrink-0 flex items-center justify-center gap-1 text-xs font-bold px-3 py-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  tvStatus && (tvStatus.status === 'offline' || tvStatus.status === 'idle' || tvStatus.status === 'unknown')
                    ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:border-rose-400'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-base">sync</span>
                Connect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

