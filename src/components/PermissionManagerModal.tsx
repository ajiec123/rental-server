import React, { useState, useEffect } from 'react';
import { UserAccount, RolePermissions, FeaturePermission } from '../types';
import { DEFAULT_CASHIER_PERMISSIONS, DEFAULT_FULL_PERMISSIONS } from '../data/authData';
import { Avatar } from './Avatar';

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeAccounts: UserAccount[];
  userPermissionsMap: Record<string, RolePermissions>;
  onSaveUserPermissions: (userId: string, updated: RolePermissions) => void;
  onAddEmployeeAccount?: (newAcc: UserAccount) => void;
}

interface PermissionItem {
  key: FeaturePermission;
  label: string;
  description: string;
  icon: string;
}

export const PermissionManagerModal: React.FC<PermissionManagerModalProps> = ({
  isOpen,
  onClose,
  employeeAccounts,
  userPermissionsMap,
  onSaveUserPermissions,
  onAddEmployeeAccount,
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    employeeAccounts[0]?.id || 'usr-karyawan-01'
  );
  const [permissions, setPermissions] = useState<RolePermissions>(
    userPermissionsMap[selectedEmployeeId] || DEFAULT_CASHIER_PERMISSIONS
  );
  const [savedMsg, setSavedMsg] = useState(false);

  // New Employee Form state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPin, setNewPin] = useState('1234');

  useEffect(() => {
    if (selectedEmployeeId && userPermissionsMap[selectedEmployeeId]) {
      setPermissions(userPermissionsMap[selectedEmployeeId]);
    } else {
      setPermissions(DEFAULT_CASHIER_PERMISSIONS);
    }
  }, [selectedEmployeeId, userPermissionsMap]);

  if (!isOpen) return null;

  const selectedEmployee =
    employeeAccounts.find((acc) => acc.id === selectedEmployeeId) || employeeAccounts[0];

  const items: PermissionItem[] = [
    {
      key: 'dashboard',
      label: 'Dashboard & Arus Kas',
      description: 'Melihat ringkasan grafik pendapatan, okupansi, dan statistik harian.',
      icon: 'dashboard',
    },
    {
      key: 'units',
      label: 'Unit Station & Timer',
      description: 'Mengelola timer sewa, perpanjangan +1 jam, dan penghentian sesi.',
      icon: 'gamepad',
    },
    {
      key: 'new_session',
      label: 'Buat Sesi Sewa Baru',
      description: 'Membuka form pendaftaran sewa baru untuk pelanggan.',
      icon: 'add_circle',
    },
    {
      key: 'history',
      label: 'Log Transaksi & Struk',
      description: 'Melihat riwayat transaksi selesai, cetak ulang struk & unduh CSV.',
      icon: 'receipt_long',
    },
    {
      key: 'users',
      label: 'Daftar Staf & Member VIP',
      description: 'Melihat jadwal staf shif dan mendaftarkan akun member VIP.',
      icon: 'group',
    },
    {
      key: 'absensi',
      label: 'Absensi & Gaji Sendiri',
      description: 'Absen masuk/keluar sendiri, melihat performa & rincian gaji bagi hasil.',
      icon: 'event_available',
    },
    {
      key: 'settings',
      label: 'Konfigurasi & Tarif',
      description: 'Mengubah tarif sewa per jam per konsol dan informasi rental.',
      icon: 'settings',
    },
  ];

  const handleToggle = (key: FeaturePermission) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleGrantAll = () => {
    setPermissions({ ...DEFAULT_FULL_PERMISSIONS });
  };

  const handleCashierPreset = () => {
    setPermissions({ ...DEFAULT_CASHIER_PERMISSIONS });
  };

  const handleSave = () => {
    if (selectedEmployeeId) {
      onSaveUserPermissions(selectedEmployeeId, permissions);
      setSavedMsg(true);
      setTimeout(() => {
        setSavedMsg(false);
      }, 1500);
    }
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const generatedUsername = `karyawan-${Date.now().toString(36)}`;
    const newAcc: UserAccount = {
      id: `usr-karyawan-${Date.now()}`,
      username: generatedUsername,
      name: newName,
      role: 'Karyawan',
      email: newEmail || `${newName.toLowerCase().replace(/\s+/g, '')}@cmdcenter.app`,
      pin: newPin || '1234',
      createdAt: Date.now(),
    };

    if (onAddEmployeeAccount) {
      onAddEmployeeAccount(newAcc);
    }
    setSelectedEmployeeId(newAcc.id);
    setIsAddingNew(false);
    setNewName('');
    setNewEmail('');
    setNewPin('1234');
  };

  const allowedCount = Object.values(permissions).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-900">
                Kelola Hak Akses Per-Karyawan
              </h3>
              <p className="text-xs text-amber-900 font-medium">
                Atur izin fitur spesifik untuk masing-masing staf / karyawan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-white/80 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {savedMsg && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold p-3 rounded-2xl animate-fade-in flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Izin khusus untuk <span className="underline font-extrabold">{selectedEmployee?.name}</span> berhasil disimpan!
            </div>
          )}

          {/* Employee Account Selector Tabs / Cards */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider font-label-ts">
                Pilih Karyawan yang Ingin Diatur:
              </label>
              <button
                type="button"
                onClick={() => setIsAddingNew(!isAddingNew)}
                className="text-xs font-bold text-cyan-700 hover:text-cyan-800 flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">
                  {isAddingNew ? 'cancel' : 'person_add'}
                </span>
                <span>{isAddingNew ? 'Batal Tambah' : '+ Tambah Karyawan'}</span>
              </button>
            </div>

            {/* Form for adding new employee */}
            {isAddingNew && (
              <form
                onSubmit={handleCreateEmployee}
                className="bg-cyan-50/70 border border-cyan-200 p-4 rounded-2xl space-y-3 animate-fade-in"
              >
                <div className="font-bold text-xs text-cyan-900">Form Staf Karyawan Baru</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama Karyawan"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="email"
                    placeholder="Email (Opsional)"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="PIN Akses (cth: 1234)"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Simpan Staf Baru
                </button>
              </form>
            )}

            {/* Selector Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {employeeAccounts.map((acc) => {
                const isSelected = acc.id === selectedEmployeeId;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedEmployeeId(acc.id);
                      setIsAddingNew(false);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Avatar name={acc.name} size="sm" />
                    <div className="overflow-hidden">
                      <div className="font-extrabold text-xs text-slate-900 truncate">
                        {acc.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        PIN: <span className="font-bold text-slate-800">{acc.pin}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currently Selected Employee Details Banner */}
          {selectedEmployee && (
            <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={selectedEmployee.name} size="md" className="border-amber-400" />
                <div>
                  <div className="font-extrabold text-sm text-white">
                    {selectedEmployee.name}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    ID: <span className="font-mono text-cyan-300">{selectedEmployee.id}</span> | Email: {selectedEmployee.email}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase">
                  {allowedCount}/{items.length} Fitur
                </span>
              </div>
            </div>
          )}

          {/* Quick Preset Buttons for this Employee */}
          <div className="flex gap-2 pt-1 pb-1">
            <button
              type="button"
              onClick={handleGrantAll}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-base text-emerald-600">done_all</span>
              Buka Semua Fitur
            </button>
            <button
              type="button"
              onClick={handleCashierPreset}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-base text-cyan-600">point_of_sale</span>
              Preset Kasir Standar
            </button>
          </div>

          {/* Permissions Checklist for selected employee */}
          <div className="space-y-2.5">
            {items.map((item) => {
              const isAllowed = permissions[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => handleToggle(item.key)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isAllowed
                      ? 'bg-slate-50 border-cyan-200 hover:border-cyan-400'
                      : 'bg-slate-50/50 border-slate-200 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isAllowed
                          ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        {item.label}
                        {!isAllowed && (
                          <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full border border-rose-200">
                            Dibatasi
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium leading-tight">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      isAllowed ? 'bg-cyan-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                        isAllowed ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    ></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">save</span>
            Simpan Izin ({selectedEmployee?.name.split(' ')[0]})
          </button>
        </div>
      </div>
    </div>
  );
};

