import React, { useState, useMemo } from 'react';
import { GamingStation } from '../types';

interface MoveStationModalProps {
  sourceStation: GamingStation | null;
  stations: GamingStation[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetStationId: string) => void;
}

const formatDuration = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} Menit`;
  if (m === 0) return `${h} Jam`;
  return `${h} Jam ${m} Menit`;
};

const formatTime = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const MoveStationModal: React.FC<MoveStationModalProps> = ({
  sourceStation,
  stations,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  // Compute remaining time info from the source session
  const remainingInfo = useMemo(() => {
    if (!sourceStation?.currentSession) return null;
    const sess = sourceStation.currentSession;
    const now = Date.now();

    if (sess.isMainBebas || sess.durationMinutes === 0) {
      return {
        type: 'main_bebas' as const,
        startTime: sess.startTime,
        elapsedMs: now - sess.startTime,
        endTime: sess.endTime,
        remainingMs: 0,
        remainingLabel: 'Main Bebas',
      };
    }

    const remainingMs = Math.max(0, sess.endTime - now);
    return {
      type: 'fixed' as const,
      startTime: sess.startTime,
      elapsedMs: now - sess.startTime,
      endTime: sess.endTime,
      remainingMs,
      remainingLabel: formatDuration(Math.ceil(remainingMs / (1000 * 60))),
    };
  }, [sourceStation, isOpen]);

  // Filter available stations: not the source, status available/maintenance
  const availableTargets = useMemo(() => {
    if (!sourceStation) return [];
    return stations.filter((s) => {
      if (s.id === sourceStation.id) return false;
      const isAvailable = s.status === 'available' || s.status === 'maintenance';
      const matchesSearch =
        !searchQuery.trim() ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.consoleType.toLowerCase().includes(searchQuery.toLowerCase());
      return isAvailable && matchesSearch;
    });
  }, [stations, sourceStation, searchQuery]);

  if (!isOpen || !sourceStation || !sourceStation.currentSession) return null;

  const sess = sourceStation.currentSession;

  const handleConfirm = () => {
    if (!selectedTargetId) return;
    onConfirm(selectedTargetId);
    setSelectedTargetId('');
    setSearchQuery('');
  };

  const handleClose = () => {
    setSelectedTargetId('');
    setSearchQuery('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-2xl">swap_horizontal_circle</span>
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-slate-900">Pindah Station</h2>
              <p className="font-label-ts text-[11px] text-slate-500 font-medium">
                Migrasi sesi aktif ke station lain — durasi tetap dipertahankan
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Source Session Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-indigo-600 text-base">arrow_circle_right</span>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                Dari Station Sumber
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Station</div>
                <div className="font-extrabold text-sm text-slate-900 leading-tight">
                  {sourceStation.name}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {sourceStation.consoleType}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Penyewa</div>
                <div className="font-extrabold text-sm text-cyan-800 truncate leading-tight">
                  {sess.customerName}
                </div>
                <div className="text-[10px] text-slate-500 font-medium truncate">
                  {sess.paymentMethod} • {sess.paymentStatus}
                </div>
              </div>
            </div>

            {/* Time preservation info */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 mt-1">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-emerald-700 text-base shrink-0 mt-0.5">
                  schedule
                </span>
                <div className="flex-1 text-[11px] text-emerald-900 leading-relaxed">
                  {remainingInfo?.type === 'fixed' ? (
                    <>
                      <strong className="font-extrabold">Sisa waktu akan dipertahankan:</strong>{' '}
                      <span className="font-mono font-bold">
                        {remainingInfo.remainingLabel}
                      </span>{' '}
                      (akan berakhir pada jam{' '}
                      <strong className="font-mono font-bold">
                        {formatTime(remainingInfo!.endTime)}
                      </strong>
                      ). Timer TIDAK di-reset.
                    </>
                  ) : (
                    <>
                      <strong className="font-extrabold">Main Bebas (Pasca Bayar):</strong>{' '}
                      Durasi berjalan akan terus dihitung dari{' '}
                      <strong className="font-mono font-bold">
                        {formatTime(remainingInfo!.startTime)}
                      </strong>{' '}
                      tanpa perubahan.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block font-label-ts text-[11px] text-slate-600 uppercase mb-1.5 font-bold">
              Cari Station Tujuan
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-slate-400 absolute left-3 top-2.5 text-lg pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama station atau jenis konsol..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Target Stations List */}
          <div>
            <label className="block font-label-ts text-[11px] text-slate-600 uppercase mb-1.5 font-bold">
              Pilih Station Tujuan ({availableTargets.length} tersedia)
            </label>
            {availableTargets.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-center text-xs font-bold text-amber-800 flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-amber-600 text-2xl">
                  sentiment_dissatisfied
                </span>
                Tidak ada station tersedia (TERSEDIA / MAINTENANCE) untuk dipindahkan.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                {availableTargets.map((st) => {
                  const isSelected = selectedTargetId === st.id;
                  const rateSame = st.ratePerHour === sourceStation.ratePerHour;
                  return (
                    <button
                      type="button"
                      key={st.id}
                      onClick={() => setSelectedTargetId(st.id)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : st.status === 'maintenance'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <span className="material-symbols-outlined text-base">
                          {st.status === 'maintenance' ? 'build' : 'sports_esports'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm text-slate-900">
                            {st.name}
                          </span>
                          {st.status === 'maintenance' && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded uppercase">
                              Maintenance
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">
                          {st.consoleType} • Rp {st.ratePerHour.toLocaleString('id-ID')}/jam
                          {!rateSame && (
                            <span className="ml-1 text-amber-700 font-bold">
                              ⚠ tarif beda
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-indigo-600 shrink-0">
                          check_circle
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Warning if rate differs */}
          {selectedTargetId && (() => {
            const target = stations.find((s) => s.id === selectedTargetId);
            if (!target || target.ratePerHour === sourceStation.ratePerHour) return null;
            const diff = target.ratePerHour - sourceStation.ratePerHour;
            const sign = diff > 0 ? '+' : '';
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 font-medium leading-relaxed flex items-start gap-1.5">
                <span className="material-symbols-outlined text-amber-700 text-base shrink-0">
                  info
                </span>
                <span>
                  Station tujuan memiliki tarif <strong>Rp {target.ratePerHour.toLocaleString('id-ID')}/jam</strong>{' '}
                  ({sign}Rp {Math.abs(diff).toLocaleString('id-ID')} dibanding sumber).
                  Tagihan sesi tidak otomatis disesuaikan — settlement dilakukan saat sesi diakhiri.
                </span>
              </div>
            );
          })()}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedTargetId}
            className={`flex-1 font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedTargetId
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              swap_horiz
            </span>
            Pindahkan Sesi
          </button>
        </div>
      </div>
    </div>
  );
};