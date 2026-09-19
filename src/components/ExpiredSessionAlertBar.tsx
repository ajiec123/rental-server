import React from 'react';
import { GamingStation } from '../types';

interface ExpiredSessionAlertBarProps {
  expiredStations: GamingStation[];
  onSelectStation: (station: GamingStation) => void;
  onDismiss: () => void;
}

export const ExpiredSessionAlertBar: React.FC<ExpiredSessionAlertBarProps> = ({
  expiredStations,
  onSelectStation,
  onDismiss,
}) => {
  if (expiredStations.length === 0) return null;

  const count = expiredStations.length;

  return (
    <div className="fixed top-0 left-0 right-0 z-[55] animate-fade-in">
      <div className="bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 text-white shadow-lg border-b-2 border-rose-800">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Pulsing siren icon */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-white/30 rounded-full animate-ping"></div>
              <div className="relative w-8 h-8 rounded-full bg-white text-rose-700 flex items-center justify-center shadow-md">
                <span className="material-symbols-outlined text-lg">timer_off</span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-xs uppercase tracking-wider truncate">
                🚨 PERHATIAN: {count} Unit Rental Waktunya Sudah Habis!
              </div>
              <div className="text-[11px] text-rose-100 truncate font-medium">
                {expiredStations
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(', ')}
                {count > 3 && ` +${count - 3} lainnya`}
                {' — Segera selesaikan untuk mencegah fraud / kebocoran tagihan.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectStation(expiredStations[0])}
              className="bg-white text-rose-700 hover:bg-rose-50 font-extrabold text-xs px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Selesaikan Sekarang
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="text-rose-100 hover:text-white hover:bg-rose-800 p-1 rounded-lg transition-colors cursor-pointer"
              title="Sembunyikan notifikasi"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>

        {/* Station quick-chips */}
        {count > 1 && (
          <div className="max-w-7xl mx-auto px-4 pb-2 flex flex-wrap gap-1.5">
            {expiredStations.slice(0, 6).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectStation(st)}
                className="bg-rose-800/60 hover:bg-rose-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-rose-400/30 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[12px]">
                  sports_esports
                </span>
                {st.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};