import React, { useState } from 'react';
import { UserAccount } from '../types';
import { BrandingScreensaverForm } from './BrandingScreensaverForm';

export type BrandingPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BrandingConfig {
  text: string;
  subtitle: string;
  color: string;
  bg: string;
  enabled: boolean;
  position: BrandingPosition;
}

export const POSITION_OPTIONS: Array<{ value: BrandingPosition; label: string; icon: string }> = [
  { value: 'top-left', label: 'Kiri Atas', icon: 'north_west' },
  { value: 'top-right', label: 'Kanan Atas', icon: 'north_east' },
  { value: 'bottom-left', label: 'Kiri Bawah', icon: 'south_west' },
  { value: 'bottom-right', label: 'Kanan Bawah', icon: 'south_east' },
];

interface SettingsTabProps {
  rates: Record<string, number>;
  onUpdateRates: (newRates: Record<string, number>) => void;
  currentUser?: UserAccount;
  onOpenPermissionManager?: () => void;
  brandingConfig?: BrandingConfig;
  onUpdateBranding?: (config: BrandingConfig) => void;
  onBroadcastBranding?: (action: 'show' | 'hide' | 'set') => void;
  tvAutoPower?: boolean;
  onUpdateTvAutoPower?: (enabled: boolean) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  rates,
  onUpdateRates,
  currentUser,
  onOpenPermissionManager,
  brandingConfig,
  onUpdateBranding,
  onBroadcastBranding,
  tvAutoPower,
  onUpdateTvAutoPower,
}) => {
  const [localRates, setLocalRates] = useState<Record<string, number>>(rates);
  const [rateUnit, setRateUnit] = useState<'per_jam' | 'per_menit'>('per_jam');
  const [newConsoleName, setNewConsoleName] = useState<string>('');
  const [newConsoleRate, setNewConsoleRate] = useState<string>('15000');
  const [storeName, setStoreName] = useState('COMMAND CENTER');
  const [address, setAddress] = useState('Jl. Cybernetics No. 88, Suite 404, Tech District');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [savedMsg, setSavedMsg] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Sync props if changed externally
  React.useEffect(() => {
    setLocalRates(rates);
  }, [rates]);

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleAddCustomRate = (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = newConsoleName.trim();
    const inputVal = parseFloat(newConsoleRate);

    if (!nameTrimmed) {
      alert('Mohon masukkan nama konsol / jenis sewa (contoh: PS3, PS4 Slim, PS5 Pro, PC Gaming)');
      return;
    }

    if (isNaN(inputVal) || inputVal <= 0) {
      alert('Mohon masukkan angka tarif sewa yang valid');
      return;
    }

    // Convert to rate per hour
    const calculatedRatePerHour = rateUnit === 'per_menit' ? Math.round(inputVal * 60) : Math.round(inputVal);

    if (calculatedRatePerHour <= 0) {
      alert('Tarif sewa terlalu kecil.');
      return;
    }

    const updated = {
      ...localRates,
      [nameTrimmed]: calculatedRatePerHour,
    };
    setLocalRates(updated);
    onUpdateRates(updated);

    setNewConsoleName('');
    setNewConsoleRate(rateUnit === 'per_menit' ? '250' : '15000');
    const perMinute = Math.round(calculatedRatePerHour / 60);
    triggerFeedback(`✓ Custom Tarif "${nameTrimmed}" berhasil disimpan (Rp ${calculatedRatePerHour.toLocaleString('id-ID')}/jam • Rp ${perMinute}/menit)`);
  };

  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // ===== Backup / Restore state =====
  const [backupInfo, setBackupInfo] = useState<{
    counts: { stations: number; transactions: number; vips: number; employees: number; permissions: number };
    pgVersion: string;
  } | null>(null);
  const [backupBusy, setBackupBusy] = useState<'idle' | 'exporting' | 'importing'>('idle');
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [resetBeforeRestore, setResetBeforeRestore] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (currentUser?.role !== 'Owner') return;
    fetch('/api/admin/backup-info')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setBackupInfo(d); })
      .catch(() => {/* offline / first boot — silently ignore */});
  }, [currentUser?.role]);

  const handleDownloadBackup = async () => {
    setBackupBusy('exporting');
    setBackupMsg(null);
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `command-center-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupMsg({ kind: 'ok', text: '✓ Backup berhasil diunduh. Simpan file ini di USB / cloud.' });
    } catch (e) {
      setBackupMsg({ kind: 'err', text: `✗ Gagal export: ${(e as Error).message}` });
    } finally {
      setBackupBusy('idle');
      setTimeout(() => setBackupMsg(null), 5000);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      setBackupMsg({ kind: 'err', text: '✗ Pilih file backup (.json) terlebih dahulu.' });
      return;
    }
    const confirmMsg = resetBeforeRestore
      ? `Restore dengan RESET?\n\nSEMUA data di device ini akan DIHAPUS dan diganti dengan isi file:\n"${restoreFile.name}"\n\nLanjutkan?`
      : `Restore (merge dengan data yang ada)?\n\nData dari file akan digabung dengan data saat ini.\nFile: "${restoreFile.name}"\n\nLanjutkan?`;
    if (!window.confirm(confirmMsg)) return;

    setBackupBusy('importing');
    setBackupMsg(null);
    try {
      const text = await restoreFile.text();
      const payload = JSON.parse(text);
      const url = `/api/admin/restore${resetBeforeRestore ? '?reset=1' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) throw new Error(out.error || `HTTP ${res.status}`);
      setBackupMsg({
        kind: 'ok',
        text: `✓ Restore berhasil. Stations=${out.counts.stations}, TX=${out.counts.transactions}, VIPs=${out.counts.vips}. Halaman akan refresh...`,
      });
      // Refresh page so all clients re-fetch fresh state
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setBackupMsg({ kind: 'err', text: `✗ Gagal restore: ${(e as Error).message}` });
    } finally {
      setBackupBusy('idle');
    }
  };

  const handleRemoveCustomRate = (typeKey: string) => {
    const copy = { ...localRates };
    delete copy[typeKey];
    setLocalRates(copy);
    onUpdateRates(copy);
    setDeletingKey(null);
    triggerFeedback(`Custom tarif "${typeKey}" telah dihapus.`);
  };

  const handleRateChange = (typeKey: string, newRateVal: number) => {
    setLocalRates((prev) => ({
      ...prev,
      [typeKey]: newRateVal,
    }));
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateRates(localRates);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">settings</span>
            Konfigurasi & Custom Tarif Sewa
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Kelola custom tarif per jam untuk berbagai tipe konsol (PS3, PS4, PS5, dll) dan profil rental
          </p>
        </div>
        {savedMsg && (
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl animate-fade-in shrink-0">
            ✓ Pengaturan Tersimpan!
          </span>
        )}
      </div>

      {/* Floating Feedback Notification */}
      {feedbackMsg && (
        <div className="bg-cyan-900 text-white p-3 px-4 rounded-2xl shadow-md text-xs font-bold flex items-center justify-between animate-fade-in">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
            {feedbackMsg}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-300 hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Owner Multi-Level Permissions Section */}
      {currentUser?.role === 'Owner' && onOpenPermissionManager && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-2xl">shield</span>
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Pengaturan Hak Akses Multi-Level (Owner Control)
              </h3>
              <p className="text-xs text-amber-900 font-medium mt-0.5">
                Atur fitur mana saja yang dapat dibuka oleh akun Karyawan / Kasir Shift.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPermissionManager}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            Kelola Izin Karyawan
          </button>
        </div>
      )}

      {/* Custom Tarif Management Section */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-cyan-700">payments</span>
              Kelola Custom Tarif Sewa Konsol
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Bebas menambahkan tarif baru untuk PS3, PS4, PS5, Switch, Sim Rig, atau tipe custom lainnya.
            </p>
          </div>
          <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 text-xs font-bold px-3 py-1 rounded-full self-start sm:self-auto font-mono">
            {Object.keys(localRates).length} Custom Tarif Aktif
          </span>
        </div>

        {/* Form Add Custom Tarif */}
        <form onSubmit={handleAddCustomRate} className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-cyan-700 text-base">add_circle</span>
              Form Tambah Custom Tarif Konsol Baru
            </label>

            {/* Rate Basis Toggle */}
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setRateUnit('per_jam');
                  setNewConsoleRate('15000');
                }}
                className={`text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  rateUnit === 'per_jam'
                    ? 'bg-cyan-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Masukkan tarif dalam Rupiah per Jam"
              >
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                Per Jam
              </button>
              <button
                type="button"
                onClick={() => {
                  setRateUnit('per_menit');
                  setNewConsoleRate('100');
                }}
                className={`text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  rateUnit === 'per_menit'
                    ? 'bg-cyan-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Masukkan tarif dalam Rupiah per Menit (Cocok untuk testing 1 menit)"
              >
                <span className="material-symbols-outlined text-[12px]">timer</span>
                Per Menit
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Nama Konsol / Tipe Sewa *
              </label>
              <input
                type="text"
                value={newConsoleName}
                onChange={(e) => setNewConsoleName(e.target.value)}
                placeholder="Contoh: PS3, PS4 Slim, PS5 Pro, PC Gaming"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {rateUnit === 'per_jam' ? 'Tarif Per Jam (Rp) *' : 'Tarif Per Menit (Rp) *'}
              </label>
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                <span className="text-xs text-slate-500 font-mono font-bold">Rp</span>
                <input
                  type="number"
                  step={rateUnit === 'per_jam' ? '500' : '10'}
                  value={newConsoleRate}
                  onChange={(e) => setNewConsoleRate(e.target.value)}
                  placeholder={rateUnit === 'per_jam' ? '15000' : '250'}
                  className="w-full bg-transparent text-xs font-mono font-extrabold text-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Live Calculation Preview Note */}
          {(() => {
            const num = parseFloat(newConsoleRate) || 0;
            const calculatedHour = rateUnit === 'per_menit' ? Math.round(num * 60) : Math.round(num);
            const calculatedMin = rateUnit === 'per_menit' ? Math.round(num) : Math.round(num / 60);
            const testDurations = [1, 5, 15, 30, 60, 120];

            return (
              <div className="bg-cyan-50/80 border border-cyan-200/80 rounded-xl p-2.5 text-[11px] text-cyan-900 font-medium space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-cyan-700 text-sm">calculator</span>
                    Konversi Otomatis: <strong className="font-mono text-cyan-950 font-bold">Rp {calculatedHour.toLocaleString('id-ID')}/jam</strong> (setara <strong className="font-mono text-cyan-950 font-bold">Rp {calculatedMin.toLocaleString('id-ID')}/menit</strong>)
                  </span>
                  <span className="bg-cyan-200/60 text-cyan-950 font-bold px-2 py-0.5 rounded-md text-[10px] font-mono">
                    Test 1 Menit = Rp {calculatedMin.toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Testing Duration Preview Chips */}
                <div className="pt-2 border-t border-cyan-200/60">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-cyan-700 text-[13px]">science</span>
                    <span className="text-[10px] font-bold text-cyan-900 uppercase tracking-wider">Simulasi Biaya per Durasi:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {testDurations.map((mins) => {
                      const cost = Math.max(1, Math.round(calculatedHour / 60 * mins));
                      return (
                        <span
                          key={mins}
                          className="bg-white/70 border border-cyan-200 text-cyan-950 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md"
                          title={`Biaya untuk ${mins} menit`}
                        >
                          {mins < 60 ? `${mins}m` : `${mins / 60}j`}: <span className="text-cyan-700">Rp {cost.toLocaleString('id-ID')}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          <button
            type="submit"
            className="w-full sm:w-auto bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">save_as</span>
            Simpan Custom Tarif Ini
          </button>
        </form>

        {/* Active Custom Rates Grid */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Daftar Tarif Sewa Aktif ({Object.keys(localRates).length}):
          </label>

          {Object.keys(localRates).length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-center text-xs font-bold text-amber-800">
              Belum ada custom tarif yang ditambahkan. Isi form tambah tarif di atas.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.keys(localRates).map((type) => {
                const hourRate = localRates[type] || 0;
                const minRate = Math.round(hourRate / 60);

                return (
                  <div
                    key={type}
                    className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2 relative group hover:border-cyan-300 transition-all shadow-2xs"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-800 flex items-center justify-center">
                          <span className="material-symbols-outlined text-base">sports_esports</span>
                        </div>
                        <span className="font-extrabold text-sm text-slate-900">
                          {type}
                        </span>
                      </div>

                      {deletingKey === type ? (
                        <div className="flex items-center gap-1 animate-fade-in">
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomRate(type)}
                            className="text-[10px] font-bold bg-rose-600 text-white px-2 py-1 rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingKey(null)}
                            className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingKey(type)}
                          title="Hapus Custom Tarif Ini"
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-500">Tarif / Jam:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono font-bold text-slate-500">Rp</span>
                          <input
                            type="number"
                            step="500"
                            value={hourRate}
                            onChange={(e) => handleRateChange(type, parseInt(e.target.value, 10) || 0)}
                            className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-extrabold text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100 font-mono">
                        <span className="text-slate-400 font-sans">Per Menit:</span>
                        <span className="text-slate-700 font-bold">
                          Rp {minRate.toLocaleString('id-ID')}/menit
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Branding TV Overlay (Owner only) */}
      {currentUser?.role === 'Owner' && onUpdateBranding && onBroadcastBranding && (
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-cyan-700">branding_watermark</span>
                Branding TV Overlay (Nama Rental di Layar TV)
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Owner set sekali → broadcast ke semua TV Android dengan 1 klik.
                Overlay muncul di pojok kanan bawah, tidak mengganggu gameplay.
              </p>
            </div>
            <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider font-mono shrink-0">
              Owner Only
            </span>
          </div>

          {/* Preview */}
          <div className="bg-slate-900 rounded-2xl aspect-video relative border-2 border-slate-200 overflow-hidden">
            <div
              className={`absolute m-3 px-4 py-2 rounded-xl ${
                brandingConfig.position === 'top-left' ? 'top-0 left-0 text-left' :
                brandingConfig.position === 'top-right' ? 'top-0 right-0 text-right' :
                brandingConfig.position === 'bottom-left' ? 'bottom-0 left-0 text-left' :
                'bottom-0 right-0 text-right'
              }`}
              style={{ backgroundColor: brandingConfig.bg }}
            >
              <div
                className="text-lg font-extrabold leading-tight"
                style={{ color: brandingConfig.color }}
              >
                {brandingConfig.text || 'Nama Rental'}
              </div>
              {brandingConfig.subtitle && (
                <div className="text-[11px] text-white opacity-85 leading-tight">
                  {brandingConfig.subtitle}
                </div>
              )}
            </div>
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              TV Preview
            </span>
          </div>

          {/* Position Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Posisi Overlay di TV
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {POSITION_OPTIONS.map((opt) => {
                const selected = brandingConfig.position === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateBranding({ ...brandingConfig, position: opt.value })}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                      selected
                        ? 'border-cyan-600 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-300/40'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Teks Utama (Max 30 char)
              </label>
              <input
                type="text"
                value={brandingConfig.text}
                onChange={(e) => onUpdateBranding({ ...brandingConfig, text: e.target.value.slice(0, 30) })}
                placeholder="Contoh: COMMAND CENTER"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Subtitle (Max 40 char)
              </label>
              <input
                type="text"
                value={brandingConfig.subtitle}
                onChange={(e) => onUpdateBranding({ ...brandingConfig, subtitle: e.target.value.slice(0, 40) })}
                placeholder="Contoh: Station 01 · PS5 Pro"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Warna Teks Utama
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {['#00E5FF', '#FF6B6B', '#FFD93D', '#6BCB77', '#A66CFF', '#FFFFFF'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onUpdateBranding({ ...brandingConfig, color: c })}
                  className={`w-9 h-9 rounded-lg border-2 transition-all ${
                    brandingConfig.color === c
                      ? 'border-slate-900 ring-2 ring-cyan-300 scale-110'
                      : 'border-slate-200 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={brandingConfig.color}
                onChange={(e) => onUpdateBranding({ ...brandingConfig, color: e.target.value })}
                className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer"
              />
              <span className="text-[11px] font-mono text-slate-500 ml-1">{brandingConfig.color}</span>
            </div>
          </div>

          {/* Timer Config */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              ⏱ Posisi Timer Sewa di TV
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {POSITION_OPTIONS.map((opt) => {
                const selected = brandingConfig.timerPosition === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateBranding({ ...brandingConfig, timerPosition: opt.value })}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                      selected
                        ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-300/40'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-300 hover:bg-amber-50/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Warna Timer
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {['#FFD700', '#FF6B6B', '#6BCB77', '#A66CFF', '#FFFFFF', '#00E5FF'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateBranding({ ...brandingConfig, timerColor: c })}
                    className={`w-9 h-9 rounded-lg border-2 transition-all ${
                      brandingConfig.timerColor === c
                        ? 'border-slate-900 ring-2 ring-amber-300 scale-110'
                        : 'border-slate-200 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={brandingConfig.timerColor}
                  onChange={(e) => onUpdateBranding({ ...brandingConfig, timerColor: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-slate-500 ml-1">{brandingConfig.timerColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Ukuran Timer (sp)
              </label>
              <input
                type="number"
                min={10}
                max={48}
                value={brandingConfig.timerSize}
                onChange={(e) => onUpdateBranding({ ...brandingConfig, timerSize: Number(e.target.value) || 16 })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Broadcast actions */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onBroadcastBranding('show')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">cast</span>
              Show All
            </button>
            <button
              type="button"
              onClick={() => onBroadcastBranding('hide')}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">cast_for_education</span>
              Hide All
            </button>
            <button
              type="button"
              onClick={() => onBroadcastBranding('set')}
              className="bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Update All
            </button>
          </div>

          <p className="text-[10px] text-slate-500 italic">
            💡 Perubahan tersimpan otomatis di server. Show/Hide All akan broadcast ke semua station sekaligus.
          </p>
        </div>
      )}

      {/* Screensaver Wallpaper */}
      {currentUser?.role === 'Owner' && (
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-cyan-700">wallpaper</span>
            Screensaver TV (Wallpaper)
          </h3>
          <p className="text-xs text-slate-500">
            Wallpaper yang tampil di TV saat standby (tidak ada sewa aktif) — termasuk saat sesi berakhir, menutup tampilan game HDMI. TV otomatis memuatnya.
          </p>
          <BrandingScreensaverForm />
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* Store Profile */}
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-cyan-700">store</span>
            Profil Terminal & Footer Struk Thermal
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-label-ts text-slate-600 uppercase font-bold mb-1">
                Nama Rental / Branding
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-label-ts text-slate-600 uppercase font-bold mb-1">
                Alamat / Kontak di Struk
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
        </div>

        {/* Audio Alerts */}
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex justify-between items-center">
          <div>
            <h3 className="font-bold text-base text-slate-900">Notifikasi Suara Timer</h3>
            <p className="text-xs text-slate-500 font-medium">
              Bunyikan alarm saat timer sesi bermain mencapai 0 menit
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              soundEnabled ? 'bg-cyan-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                soundEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></span>
          </button>
        </div>

        {/* TV Auto Power */}
        {onUpdateTvAutoPower && (
          <div className={`bg-white border p-5 rounded-3xl shadow-sm flex justify-between items-start gap-4 transition-all ${
            tvAutoPower
              ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/40 to-cyan-50/40'
              : 'border-slate-200'
          }`}>
            <div className="flex items-start gap-3 flex-1">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                tvAutoPower
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                <span className="material-symbols-outlined text-2xl">
                  {tvAutoPower ? 'power_settings_new' : 'power_off'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-slate-900">
                  TV Auto Power Saat Mulai/Akhir Sesi
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  TV otomatis <strong>nyala</strong> saat operator mulai sewa, otomatis <strong>mati</strong> saat timer habis atau sesi diakhiri.
                  Hemat listrik & tidak perlu remote manual. Butuh TV Android receiver aktif di tiap station.
                </p>
                {tvAutoPower && (
                  <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-emerald-800">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      start → power_on
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">timer_off</span>
                      end → power_off
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUpdateTvAutoPower(!tvAutoPower)}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 mt-1 ${
                tvAutoPower ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
              aria-label="Toggle TV Auto Power"
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                  tvAutoPower ? 'translate-x-6' : 'translate-x-0'
                }`}
              ></span>
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm py-3 rounded-2xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined">save</span>
          Simpan Seluruh Konfigurasi Terminal
        </button>
      </form>

      {/* ===== Database Backup & Restore (Owner only) ===== */}
      {currentUser?.role === 'Owner' && (
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-cyan-700">cloud_sync</span>
                Backup & Migrasi Database
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Export seluruh data (stasiun, transaksi, VIP, karyawan, izin, pengaturan) ke file JSON,
                lalu restore di device lain. Aman untuk ganti laptop / backup rutin.
              </p>
            </div>
            <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider font-mono shrink-0">
              Owner Only
            </span>
          </div>

          {/* Current DB snapshot info */}
          {backupInfo && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[11px] font-mono text-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-cyan-700">sports_esports</span>
                <span><strong>{backupInfo.counts.stations}</strong> Station</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-emerald-700">receipt_long</span>
                <span><strong>{backupInfo.counts.transactions}</strong> Transaksi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-700">star</span>
                <span><strong>{backupInfo.counts.vips}</strong> VIP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-purple-700">group</span>
                <span><strong>{backupInfo.counts.employees}</strong> Karyawan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-500">shield</span>
                <span><strong>{backupInfo.counts.permissions}</strong> Izin</span>
              </div>
            </div>
          )}

          {/* Backup button */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">download</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-emerald-900">Download Backup</h4>
                <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                  Ambil snapshot seluruh database saat ini. File <code className="font-mono">.json</code> bisa disimpan di USB, Google Drive, atau dikirim via WA.
                  Lakukan ini <strong>sebelum</strong> ganti device, sebelum update besar, atau rutin tiap minggu.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={backupBusy !== 'idle'}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                {backupBusy === 'exporting' ? 'progress_activity' : 'cloud_download'}
              </span>
              {backupBusy === 'exporting' ? 'Menyiapkan file...' : 'Download Backup Sekarang'}
            </button>
          </div>

          {/* Restore */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">upload</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-amber-900">Restore dari File Backup</h4>
                <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                  Migrasi ke device baru atau pulihkan dari backup. Pilih file <code className="font-mono">.json</code> hasil download sebelumnya.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-600 file:text-white hover:file:bg-amber-700 file:cursor-pointer cursor-pointer bg-white border border-amber-300 rounded-xl"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-2 rounded-xl cursor-pointer"
              >
                {restoreFile ? `📄 ${restoreFile.name.slice(0, 30)}${restoreFile.name.length > 30 ? '…' : ''}` : 'Pilih file…'}
              </button>
            </div>

            <label className="flex items-start gap-2 text-[11px] font-medium text-amber-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetBeforeRestore}
                onChange={(e) => setResetBeforeRestore(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-600 cursor-pointer"
              />
              <span>
                <strong>Reset database sebelum restore</strong> (disarankan). Semua tabel di-drop lalu di-import ulang.
                Cocok untuk migrasi device baru atau pulih dari backup penuh.
                <br />
                <span className="text-amber-700 italic">Uncheck hanya jika ingin merge dengan data yang sudah ada (advanced).</span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleRestore}
              disabled={backupBusy !== 'idle' || !restoreFile}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                {backupBusy === 'importing' ? 'progress_activity' : 'restore'}
              </span>
              {backupBusy === 'importing' ? 'Merestore...' : (resetBeforeRestore ? 'Reset & Restore dari File' : 'Merge Restore dari File')}
            </button>
          </div>

          {/* Feedback */}
          {backupMsg && (
            <div className={`text-xs font-bold p-3 rounded-xl border animate-fade-in flex items-start gap-2 ${
              backupMsg.kind === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <span className="material-symbols-outlined text-base shrink-0">
                {backupMsg.kind === 'ok' ? 'check_circle' : 'error'}
              </span>
              <span className="flex-1">{backupMsg.text}</span>
            </div>
          )}

          {/* CLI hint */}
          <details className="text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
            <summary className="font-bold text-slate-700 cursor-pointer select-none">
              💻 Alternatif via terminal / artisan-style commands
            </summary>
            <div className="mt-2 space-y-1 leading-relaxed">
              <div><code className="text-cyan-800">npm run db:info</code> — lihat jumlah row saat ini</div>
              <div><code className="text-cyan-800">npm run db:export -- backup.json</code> — backup ke file</div>
              <div><code className="text-cyan-800">npm run db:import -- backup.json</code> — restore (merge)</div>
              <div><code className="text-cyan-800">npm run db:fresh -- backup.json</code> — wipe + restore (seperti <code>migrate:fresh --seed</code>)</div>
              <div className="pt-1 text-slate-400 italic">Setelah import via CLI, restart <code>npm run dev</code> agar state di-refresh.</div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};


