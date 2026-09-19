import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { Avatar } from './Avatar';
import { hashPin, verifyPin } from '../utils/pinCrypto';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  /**
   * Simpan update profil. Field yang bisa diubah:
   *  - name
   *  - email
   *  - pin (akan di-hash otomatis di parent sebelum disimpan)
   *
   * Catatan: username TIDAK bisa diubah (dipakai sebagai identitas login).
   */
  onSaveProfile: (
    userId: string,
    updates: { name?: string; email?: string; pin?: string }
  ) => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSaveProfile,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email || '');

  // Untuk ganti PIN: harus isi PIN lama dulu sebagai konfirmasi
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Reset form ketika modal DIBUKA (transisi false → true).
  //
  // Penting: deps HANYA [isOpen], JANGAN ikutkan currentUser.name/email.
  // Kalau ikut, setiap kali parent update profil sukses akan trigger
  // re-run useEffect ini dan mereset successMsg sebelum sempat tampil,
  // sehingga user harus klik Simpan 2x untuk melihat pesan sukses.
  useEffect(() => {
    if (isOpen) {
      setName(currentUser.name);
      setEmail(currentUser.email || '');
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setErrorMsg('');
      setSuccessMsg('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Nama wajib diisi.');
      return;
    }

    setSavingProfile(true);
    onSaveProfile(currentUser.id, {
      name: name.trim(),
      email: email.trim() || undefined,
    });
    setSuccessMsg('Profil berhasil diperbarui.');
    setSavingProfile(false);
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newPin || !confirmNewPin || !currentPin) {
      setErrorMsg('PIN lama, PIN baru, dan konfirmasi PIN wajib diisi.');
      return;
    }
    if (newPin.length < 6 || !/^\d+$/.test(newPin)) {
      setErrorMsg('PIN baru minimal 6 digit angka.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setErrorMsg('Konfirmasi PIN baru tidak cocok.');
      return;
    }

    setSavingPin(true);
    const ok = await verifyPin(currentPin, currentUser.pin || '');
    if (!ok) {
      setErrorMsg('PIN lama salah.');
      setSavingPin(false);
      return;
    }

    const hashed = await hashPin(newPin);
    onSaveProfile(currentUser.id, { pin: hashed });
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setSuccessMsg('PIN berhasil diganti. Silakan login ulang nanti.');
    setSavingPin(false);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const usernameDisplay = currentUser.username;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-2xl">manage_accounts</span>
            </div>
            <div>
              <h3 className="font-extrabold text-xl text-slate-900">
                Pengaturan Profil
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Perbarui nama, email, dan PIN Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Identitas akun (read-only) */}
        <div className="bg-gradient-to-br from-slate-50 to-cyan-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Username (identitas login)
            </div>
            <div className="font-mono-code text-base font-extrabold text-slate-900 truncate">
              {usernameDisplay}
            </div>
            <div className="mt-1">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                  currentUser.role === 'Owner'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {currentUser.role}
              </span>
            </div>
          </div>
        </div>

        {/* Form: Nama & Email */}
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
            � Identitas
          </div>

          <div>
            <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
              Nama Lengkap *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              placeholder="Nama Anda"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              placeholder="anda@email.com"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">save</span>
            Simpan Perubahan Profil
          </button>
        </form>

        {/* Divider */}
        <div className="border-t border-slate-200" />

        {/* Form: Ganti PIN */}
        <form onSubmit={handleChangePin} className="space-y-3">
          <div className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
            🔐 Ganti PIN Login
          </div>

          <div>
            <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
              PIN Saat Ini *
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              required
              value={currentPin}
              onChange={(e) => {
                setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                setErrorMsg('');
                setSuccessMsg('');
              }}
              placeholder="••••••"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium font-mono-code focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                PIN Baru *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                placeholder="Min. 6 digit"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium font-mono-code focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                Konfirmasi PIN *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                value={confirmNewPin}
                onChange={(e) => {
                  setConfirmNewPin(
                    e.target.value.replace(/\D/g, '').slice(0, 8)
                  );
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                placeholder="Ulangi PIN baru"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium font-mono-code focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPin}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">lock_reset</span>
            Ganti PIN
          </button>
        </form>

        {/* Status message */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {successMsg}
          </div>
        )}

        {/* Footer note */}
        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-start gap-2 text-[11px] text-slate-600 font-medium leading-relaxed">
          <span className="material-symbols-outlined text-slate-400 text-sm shrink-0 mt-0.5">
            info
          </span>
          <span>
            Username tidak dapat diubah (dipakai untuk login). PIN akan
            di-hash SHA-256 + salt sebelum disimpan.
          </span>
        </div>
      </div>
    </div>
  );
};
