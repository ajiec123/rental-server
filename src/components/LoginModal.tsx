import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { verifyPin } from '../utils/pinCrypto';
import { Avatar } from './Avatar';

interface LoginModalProps {
  isOpen: boolean;
  isAuthGate: boolean; // Jika true, modal tidak bisa ditutup (wajib login)
  currentUser: UserAccount | null;
  employeeAccounts: UserAccount[];
  /**
   * Owner profile (dari App.tsx, persisted ke localStorage).
   * Wajib di-pass karena DEFAULT_OWNER_ACCOUNT tidak immutable —
   * setelah Owner ganti PIN via ProfileSettingsModal, hash yang dipakai
   * login harus dari ownerProfile, bukan DEFAULT_OWNER_ACCOUNT hard-code.
   */
  ownerProfile: UserAccount;
  onLogin: (user: UserAccount) => void;
  onClose: () => void;
  onOpenPermissionManager: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  isAuthGate,
  currentUser,
  employeeAccounts,
  ownerProfile,
  onLogin,
  onClose,
  onOpenPermissionManager,
}) => {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);

  // Reset attempts when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFailedAttempts(0);
      setLockoutUntil(0);
      setErrorMsg('');
      setPin('');
      setUsername('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLocked = Date.now() < lockoutUntil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    const u = username.trim().toLowerCase();
    if (!u || !pin) {
      setErrorMsg('Username dan PIN wajib diisi.');
      return;
    }

    // Cari akun berdasarkan username (case-insensitive).
    // Owner dicek duluan (dari ownerProfile yang mutable), lalu daftar karyawan.
    const candidates: UserAccount[] = [
      ownerProfile,
      ...employeeAccounts,
    ];

    const matched = candidates.find(
      (acc) => (acc.username || '').toLowerCase() === u
    );

    if (!matched) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        setLockoutUntil(Date.now() + 30_000);
        setErrorMsg('🚫 Terlalu banyak percobaan gagal. Dikunci selama 30 detik.');
        setPin('');
      } else {
        setErrorMsg(
          `Username tidak ditemukan. Sisa percobaan: ${5 - nextAttempts}x.`
        );
      }
      return;
    }

    const ok = await verifyPin(pin, matched.pin || '');
    if (ok) {
      onLogin(matched);
      setPin('');
      setErrorMsg('');
      setFailedAttempts(0);
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        setLockoutUntil(Date.now() + 30_000);
        setErrorMsg('🚫 Terlalu banyak percobaan gagal. Dikunci selama 30 detik.');
        setPin('');
      } else {
        setErrorMsg(
          `PIN salah untuk ${matched.name}. Sisa percobaan: ${5 - nextAttempts}x.`
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-2xl">lock</span>
            </div>
            <div>
              <h3 className="font-extrabold text-xl text-slate-900">
                {isAuthGate ? 'Login Wajib' : 'Ganti Akun'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isAuthGate
                  ? 'Masukkan kredensial untuk membuka Command Center'
                  : 'Login sebagai akun lain'}
              </p>
            </div>
          </div>
          {!isAuthGate && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Tutup"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {/* Current Active Account Banner (hanya kalau bukan auth gate) */}
        {!isAuthGate && currentUser && (
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={currentUser.name} size="md" />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {currentUser.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      currentUser.role === 'Owner'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {currentUser.role}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Sedang Aktif
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 font-label-ts uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                person
              </span>
              <input
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMsg('');
                }}
                disabled={isLocked}
                placeholder="contoh: owner-rental / rian / maya"
                className={`w-full bg-slate-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 ${
                  isLocked
                    ? 'border-rose-300 text-rose-400 cursor-not-allowed'
                    : 'border-slate-300 focus:border-cyan-500 focus:ring-cyan-500/20'
                }`}
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700 font-label-ts uppercase tracking-wider">
                PIN
              </label>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                PIN Aman (Hashed)
              </span>
            </div>
            <input
              type="password"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                setErrorMsg('');
              }}
              disabled={isLocked}
              placeholder={isLocked ? '⏱️ Terkunci — tunggu...' : '••••••'}
              className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-center tracking-widest font-mono text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                isLocked
                  ? 'border-rose-300 text-rose-400 cursor-not-allowed'
                  : 'border-slate-300 focus:border-cyan-500 focus:ring-cyan-500/20'
              }`}
            />
            {errorMsg && (
              <p
                className={`text-xs font-bold mt-1.5 ${
                  isLocked ? 'text-rose-700' : 'text-rose-600'
                }`}
              >
                {errorMsg}
              </p>
            )}
            {failedAttempts > 0 && !isLocked && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < failedAttempts ? 'bg-rose-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
                <span className="text-[10px] text-slate-500 font-bold">
                  {5 - failedAttempts}/5
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLocked}
            className={`w-full font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
              isLocked
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-xs cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-base">login</span>
            {isLocked
              ? `⏱️ Terkunci ${Math.ceil((lockoutUntil - Date.now()) / 1000)}s`
              : 'Masuk'}
          </button>
        </form>

        {/* Petunjuk akun default untuk auth gate */}
        {isAuthGate && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-[11px] text-amber-900 font-medium leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-700 text-base shrink-0 mt-0.5">
                info
              </span>
              <div className="space-y-1">
                <p className="font-bold uppercase tracking-wider text-amber-800">
                  Akun Default Seed
                </p>
                <p>
                  <strong>Owner:</strong> username{' '}
                  <code className="bg-white border border-amber-300 px-1.5 py-0.5 rounded font-mono text-amber-900">
                    owner-rental
                  </code>{' '}
                  · PIN{' '}
                  <code className="bg-white border border-amber-300 px-1.5 py-0.5 rounded font-mono text-amber-900">
                    681232
                  </code>
                </p>
                <p>
                  Owner dapat membuat akun karyawan baru dari menu{' '}
                  <strong>Users → Staf</strong> setelah login.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-start gap-2 text-[11px] text-emerald-900 font-medium leading-relaxed">
          <span className="material-symbols-outlined text-emerald-700 text-sm shrink-0 mt-0.5">
            verified_user
          </span>
          <span>
            PIN disimpan terenkripsi (SHA-256 + salt). Maksimal 5 percobaan gagal
            akan mengunci sementara selama 30 detik.
          </span>
        </div>

        {/* Owner Permission Management Shortcut (saat owner sudah login & ganti akun) */}
        {!isAuthGate && currentUser?.role === 'Owner' && (
          <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span className="material-symbols-outlined text-cyan-700">
                admin_panel_settings
              </span>
              <span>Kelola izin per-karyawan</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenPermissionManager();
              }}
              className="text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Atur Izin
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
