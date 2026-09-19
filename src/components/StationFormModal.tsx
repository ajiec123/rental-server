import React, { useState, useEffect } from 'react';
import { GamingStation } from '../types';

interface StationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  stationToEdit?: GamingStation | null;
  ratesPreset?: Record<string, number>;
  onSaveStation: (stationData: {
    id?: string;
    name: string;
    consoleType: string;
    ratePerHour: number;
  }) => void;
}

export const StationFormModal: React.FC<StationFormModalProps> = ({
  isOpen,
  onClose,
  stationToEdit,
  ratesPreset = {},
  onSaveStation,
}) => {
  const [name, setName] = useState<string>('');
  const [consoleType, setConsoleType] = useState<string>('PS3');
  const [customConsole, setCustomConsole] = useState<string>('');
  const [ratePerHour, setRatePerHour] = useState<number>(15000);

  // Derive console presets from the rates table (the user's actual "Kelola Custom Tarif Sewa"
  // list in Settings). Falls back to a small sensible default if the table is empty so the
  // form is still usable for fresh installs.
  const consolePresets = React.useMemo(() => {
    const fromRates = Object.keys(ratesPreset).filter((k) => k.trim().length > 0);
    const base = fromRates.length > 0 ? fromRates : ['PS3', 'PS4', 'PS5'];
    return [...base, 'Lainnya (Custom)'];
  }, [ratesPreset]);

  const defaultConsole = consolePresets[0] || 'PS3';
  const defaultRate = (ratesPreset[defaultConsole] as number | undefined) ?? 15000;

  useEffect(() => {
    if (stationToEdit) {
      setName(stationToEdit.name);
      if (consolePresets.slice(0, -1).includes(stationToEdit.consoleType)) {
        setConsoleType(stationToEdit.consoleType);
        setCustomConsole('');
      } else {
        setConsoleType('Lainnya (Custom)');
        setCustomConsole(stationToEdit.consoleType);
      }
      setRatePerHour(stationToEdit.ratePerHour);
    } else {
      setName('');
      setConsoleType(defaultConsole);
      setCustomConsole('');
      setRatePerHour(defaultRate);
    }
  }, [stationToEdit, isOpen, consolePresets, defaultConsole, defaultRate]);

  // If user picks console type from preset, auto suggest rate if preset exists
  const handleSelectConsolePreset = (type: string) => {
    setConsoleType(type);
    if (type !== 'Lainnya (Custom)' && ratesPreset[type]) {
      setRatePerHour(ratesPreset[type]);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalConsole = consoleType === 'Lainnya (Custom)' ? customConsole.trim() : consoleType;

    if (!name.trim()) {
      alert('Mohon masukkan nama unit station (contoh: Station 13 atau PS3 Room 1)');
      return;
    }

    if (!finalConsole) {
      alert('Mohon pilih atau tulis tipe konsol (contoh: PS3, PS4, PS5, Custom)');
      return;
    }

    if (!ratePerHour || ratePerHour <= 0) {
      alert('Mohon masukkan tarif sewa per jam yang valid');
      return;
    }

    onSaveStation({
      id: stationToEdit?.id,
      name: name.trim(),
      consoleType: finalConsole,
      ratePerHour: Number(ratePerHour),
    });

    onClose();
  };

  const currentConsoleTypeLabel = consoleType === 'Lainnya (Custom)' ? (customConsole || 'Custom Konsol') : consoleType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-xl space-y-5 relative overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center border border-cyan-200">
              <span className="material-symbols-outlined text-2xl">
                {stationToEdit ? 'edit' : 'add_circle'}
              </span>
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-900">
                {stationToEdit ? 'Edit Unit Gaming Station' : 'Tambah Unit Station Baru'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {stationToEdit
                  ? 'Ubah nama, tipe konsol, atau tarif per jam unit ini'
                  : 'Buat unit rental baru dengan nama dan tarif custom bebas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Station Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Nama Unit Station *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Station 13, PS3 VIP Room 1, Unit Lesehan 02"
              className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              required
            />
          </div>

          {/* Console Type Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Tipe Konsol / Perangkat *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {consolePresets.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => handleSelectConsolePreset(preset)}
                  className={`text-xs font-bold p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    consoleType === preset
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {consoleType === 'Lainnya (Custom)' && (
              <input
                type="text"
                value={customConsole}
                onChange={(e) => setCustomConsole(e.target.value)}
                placeholder="Tulis nama konsol custom (contoh: PS3 Slim, Arcade Cabinet, PC VR)"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500 mt-2"
                required
              />
            )}
          </div>

          {/* Rate Per Hour Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Tarif Sewa Per Jam (Rp) *
            </label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2 mb-2">
              <span className="text-sm font-mono font-extrabold text-slate-500">Rp</span>
              <input
                type="number"
                step="1000"
                value={ratePerHour}
                onChange={(e) => setRatePerHour(Number(e.target.value))}
                placeholder="15000"
                className="w-full bg-transparent text-base font-mono font-extrabold text-slate-900 focus:outline-none"
                required
              />
            </div>

            </div>

          {/* Live Card Preview Box */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">
              Pratinjau Card Station:
            </span>
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-cyan-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">gamepad</span>
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    {name || 'Nama Station'}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500">
                    {currentConsoleTypeLabel}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-extrabold text-slate-900">
                  Rp {(ratePerHour || 0).toLocaleString('id-ID')} / jam
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                  SIAP
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-2xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs py-2.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">save</span>
              {stationToEdit ? 'Simpan Perubahan' : 'Tambah Station Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
