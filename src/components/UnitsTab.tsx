import React, { useState } from 'react';
import { GamingStation } from '../types';
import { StationCard } from './StationCard';
import { StationFormModal } from './StationFormModal';

interface UnitsTabProps {
  stations: GamingStation[];
  ratesPreset?: Record<string, number>;
  onStartSession: (station: GamingStation) => void;
  onEndSession: (station: GamingStation) => void;
  onExtendSession: (station: GamingStation, minutes: number) => void;
  onMoveSession: (station: GamingStation) => void;
  onTvControl: (station: GamingStation) => void;
  onSaveStation: (stationData: {
    id?: string;
    name: string;
    consoleType: string;
    ratePerHour: number;
  }) => void;
  onDeleteStation: (stationId: string) => void;
  tvStatusMap?: Record<string, { status: 'online' | 'idle' | 'offline' | 'unknown'; latencyMs: number | null; subscribers: number }>;
  onReconnectTv?: (station: GamingStation) => void;
}

export const UnitsTab: React.FC<UnitsTabProps> = ({
  stations,
  ratesPreset,
  onStartSession,
  onEndSession,
  onExtendSession,
  onMoveSession,
  onTvControl,
  onSaveStation,
  onDeleteStation,
  tvStatusMap,
  onReconnectTv,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<GamingStation | null>(null);
  const [stationToDelete, setStationToDelete] = useState<GamingStation | null>(null);

  const occupiedCount = stations.filter((s) => s.status === 'occupied' || s.status === 'warning').length;
  const availableCount = stations.filter((s) => s.status === 'available').length;
  const occupancyRate = stations.length > 0 ? Math.round((occupiedCount / stations.length) * 100) : 0;

  const handleOpenAddModal = () => {
    setEditingStation(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (st: GamingStation) => {
    setEditingStation(st);
    setIsModalOpen(true);
  };

  const filteredStations = stations.filter((st) => {
    const matchesSearch =
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.consoleType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'READY' && st.status === 'available') ||
      (filterStatus === 'BUSY' && (st.status === 'occupied' || st.status === 'warning'));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">gamepad</span>
            Unit Gaming Station ({stations.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Status terminal real-time, pengontrol timer, dan kelola unit custom
          </p>
        </div>

        {/* Action & Quick Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            + Tambah Unit Station Baru
          </button>

          <div className="flex items-center gap-2 text-xs font-label-ts">
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold">
              {availableCount} SIAP
            </div>
            <div className="bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-xl font-bold">
              {occupiedCount} TERPAKAI
            </div>
            <div className="bg-cyan-50 text-cyan-800 border border-cyan-200 px-3 py-1.5 rounded-xl font-bold">
              {occupancyRate}% OKUPANSI
            </div>
          </div>
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-slate-400 text-xl">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari station atau konsol (contoh: PS3, PS4, PS5 Pro, Sim Rig)..."
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-xs"
          />
        </div>

        <div className="flex bg-white p-1 border border-slate-200 rounded-2xl sm:w-64 shadow-xs">
          {['ALL', 'READY', 'BUSY'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterStatus === st
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL' ? 'SEMUA' : st === 'READY' ? 'SIAP' : 'TERPAKAI'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Station Cards */}
      {filteredStations.length === 0 ? (
        <div className="bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-300">gamepad</span>
          <p className="text-sm font-bold text-slate-600">
            Tidak ada Unit Station yang sesuai pencarian.
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Buat Unit Station Baru Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredStations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              onStartSession={onStartSession}
              onEndSession={onEndSession}
              onExtendSession={onExtendSession}
              onMoveSession={onMoveSession}
              onTvControl={onTvControl}
              onEditStation={handleOpenEditModal}
              onDeleteStation={(id) => {
                const target = stations.find((s) => s.id === id);
                if (target) setStationToDelete(target);
              }}
              tvStatus={tvStatusMap ? tvStatusMap[station.id] : undefined}
              onReconnectTv={onReconnectTv}
            />
          ))}
        </div>
      )}

      {/* Station Form Modal (Add / Edit) */}
      <StationFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        stationToEdit={editingStation}
        ratesPreset={ratesPreset}
        onSaveStation={onSaveStation}
      />

      {/* Custom Delete Confirmation Modal */}
      {stationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                <span className="material-symbols-outlined text-2xl">delete_forever</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-slate-900">
                  Hapus Unit Station?
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Apakah Anda yakin ingin menghapus unit <strong className="text-slate-900">{stationToDelete.name}</strong> ({stationToDelete.consoleType})?
                </p>
                {stationToDelete.status !== 'available' && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">warning</span>
                    <span>Unit ini sedang terpakai. Menghapus unit akan memberhentikan tampilan unit ini.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStationToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-2xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteStation(stationToDelete.id);
                  setStationToDelete(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                Ya, Hapus Station
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

