import React, { useState } from 'react';

/**
 * LicenseActivationModal — ditampilkan saat lisensi server tidak valid
 * (belum pernah diaktifkan / kedaluwarsa). Operator menempelkan key lisensi
 * yang diberikan vendor, lalu mengaktifkannya. Aktivasi bersifat offline:
 * server memverifikasi tanda tangan Ed25519 tanpa internet.
 */
export const LicenseActivationModal: React.FC<{
  isOpen: boolean;
  reason?: string;
  licensee?: string | null;
  machineId?: string;
  onActivated: (info: { licensee: string | null; maxStations: number | null }) => void;
  onLogout: () => void;
}> = ({ isOpen, reason, licensee, machineId, onActivated, onLogout }) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleActivate = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onActivated({
          licensee: data.license?.licensee ?? null,
          maxStations: data.license?.maxStations ?? null,
        });
      } else {
        setError(data.error || 'Aktivasi gagal — periksa kembali key lisensi.');
      }
    } catch (e) {
      setError(`Tidak dapat menghubungi server: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950 animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-2xl">key_vertical</span>
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900">Aktivasi Lisensi</h2>
            <p className="text-xs text-slate-500 font-medium">
              Command Center memerlukan lisensi untuk mulai beroperasi
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Status info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-medium text-amber-900 leading-relaxed">
            <strong>{reason || 'Lisensi belum diaktifkan.'}</strong>
            {licensee && (
              <> Lisensi atas nama <strong>{licensee}</strong> sudah tidak berlaku — silakan hubungi vendor untuk perpanjangan.</>
            )}
            <> Tempelkan key lisensi dari vendor di bawah ini. Aktivasi berjalan offline.</>
          </div>

          {/* Key input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
              Key Lisensi
            </label>
            <textarea
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              rows={4}
              placeholder="CC1.eyJsaWNlbnNlZSI6...."
              className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:outline-none font-mono-code resize-none ${
                error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-amber-500'
              }`}
            />
            <p className="text-[10px] text-slate-400 mt-1 font-medium">
              Key berformat CC1.xxx.yyy — diberikan oleh vendor lisensi Command Center.
            </p>
          </div>

          {/* Machine ID — customer kirim ini ke vendor agar key di-bind ke device */}
          {machineId && (
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Machine ID (kirim ke vendor)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(machineId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-[10px] font-bold text-cyan-700 hover:text-cyan-900 cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'Tersalin' : 'Salin'}
                </button>
              </div>
              <div className="text-[11px] font-mono-code font-bold text-slate-700 mt-1 break-all select-all">
                {machineId}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleActivate}
            disabled={busy || !key.trim()}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-2xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-lg ${busy ? 'animate-spin' : ''}`}>
              {busy ? 'progress_activity' : 'check_circle'}
            </span>
            {busy ? 'Memverifikasi...' : 'Aktifkan Lisensi'}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Keluar / Login sebagai user lain
          </button>
        </div>
      </div>
    </div>
  );
};
