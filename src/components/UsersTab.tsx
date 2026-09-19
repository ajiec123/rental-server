import React, { useState, useEffect } from 'react';
import {
  StaffUser,
  VIPMember,
  UserAccount,
  UserRole,
  AttendanceRecord,
} from '../types';
import { hashPin } from '../utils/pinCrypto';
import { Avatar } from './Avatar';

interface UsersTabProps {
  currentUser: UserAccount;
  staffList: StaffUser[];
  vipList: VIPMember[];
  employeeAccounts: UserAccount[];
  /**
   * Map absensi: attendanceMap[employeeId][dateKey 'YYYY-MM-DD'] = record.
   * Wajib di-pass agar Owner bisa melihat rekap absen & gaji setiap karyawan.
   */
  attendanceMap: Record<string, Record<string, AttendanceRecord>>;
  /** Tarif tunjangan makan per hari (default: 10000) */
  mealAllowancePerDay?: number;
  /** Persentase bagi hasil dari revenue (default: 0.25 = 25%) */
  profitShareRate?: number;
  onAddVip: (vip: Omit<VIPMember, 'id'>) => void;
  onUpdateVip: (id: string, updates: Partial<VIPMember>) => void;
  onDeleteVip: (id: string) => void;
  onAddEmployee: (acc: UserAccount) => void;
  onUpdateEmployee: (id: string, updates: Partial<UserAccount>) => void;
  onDeleteEmployee: (id: string) => void;
  onClockIn: (employeeId: string) => void;
  onClockOut: (employeeId: string) => void;
}

type VipFormData = Omit<VIPMember, 'id'>;
type EmployeeFormData = {
  username: string;
  name: string;
  email: string;
  pin: string;
  role: UserRole;
};

const DEFAULT_VIP_FORM: VipFormData = {
  name: '',
  phone: '',
  tier: 'Standard',
  playHoursTotal: 0,
  loyaltyPoints: 50,
  totalSpent: 0,
};

const DEFAULT_EMPLOYEE_FORM: EmployeeFormData = {
  username: '',
  name: '',
  email: '',
  pin: '',
  role: 'Karyawan',
};

/** Format tanggal hari ini ke 'YYYY-MM-DD' untuk attendance lookup */
function getTodayKey(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  currentUser,
  staffList,
  vipList,
  employeeAccounts,
  attendanceMap,
  mealAllowancePerDay = 10000,
  profitShareRate = 0.25,
  onAddVip,
  onUpdateVip,
  onDeleteVip,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onClockIn,
  onClockOut,
}) => {
  const isOwner = currentUser.role === 'Owner';

  const [activeSubTab, setActiveSubTab] = useState<'ABSEN' | 'VIPS' | 'EMPLOYEES'>(
    isOwner ? 'EMPLOYEES' : 'VIPS'
  );

  // ===== VIP Modal state =====
  const [showAddVipModal, setShowAddVipModal] = useState(false);
  const [editingVip, setEditingVip] = useState<VIPMember | null>(null);
  const [deletingVip, setDeletingVip] = useState<VIPMember | null>(null);
  const [vipForm, setVipForm] = useState<VipFormData>(DEFAULT_VIP_FORM);

  // ===== Employee Modal state (Owner only) =====
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<UserAccount | null>(null);
  const [deletingEmp, setDeletingEmp] = useState<UserAccount | null>(null);
  const [empForm, setEmpForm] = useState<EmployeeFormData>(DEFAULT_EMPLOYEE_FORM);
  const [empFormError, setEmpFormError] = useState('');

  // Reset tab jika role karyawan lalu owner logout & karyawan login
  useEffect(() => {
    if (!isOwner && activeSubTab === 'EMPLOYEES') {
      setActiveSubTab('VIPS');
    }
  }, [isOwner, activeSubTab]);

  // ===== Handlers VIP =====
  const openCreateVip = () => {
    setEditingVip(null);
    setVipForm(DEFAULT_VIP_FORM);
    setShowAddVipModal(true);
  };

  const openEditVip = (vip: VIPMember) => {
    setEditingVip(vip);
    setVipForm({
      name: vip.name,
      phone: vip.phone,
      tier: vip.tier,
      playHoursTotal: vip.playHoursTotal,
      loyaltyPoints: vip.loyaltyPoints,
      totalSpent: vip.totalSpent,
    });
    setShowAddVipModal(true);
  };

  const handleSubmitVip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipForm.name.trim()) return;
    if (editingVip) {
      onUpdateVip(editingVip.id, vipForm);
    } else {
      onAddVip(vipForm);
    }
    setShowAddVipModal(false);
    setEditingVip(null);
    setVipForm(DEFAULT_VIP_FORM);
  };

  const confirmDeleteVip = () => {
    if (!deletingVip) return;
    onDeleteVip(deletingVip.id);
    setDeletingVip(null);
  };

  // ===== Handlers Employee (Owner only) =====
  const openCreateEmp = () => {
    setEditingEmp(null);
    setEmpForm(DEFAULT_EMPLOYEE_FORM);
    setEmpFormError('');
    setShowAddEmpModal(true);
  };

  const openEditEmp = (emp: UserAccount) => {
    setEditingEmp(emp);
    setEmpForm({
      username: emp.username,
      name: emp.name,
      email: emp.email || '',
      pin: '', // kosong = tidak diubah saat edit
      role: emp.role,
    });
    setEmpFormError('');
    setShowAddEmpModal(true);
  };

  const handleSubmitEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpFormError('');

    const u = empForm.username.trim().toLowerCase();
    if (!u) return setEmpFormError('Username wajib diisi.');
    if (!empForm.name.trim()) return setEmpFormError('Nama wajib diisi.');
    if (!editingEmp && !empForm.pin)
      return setEmpFormError('PIN wajib diisi untuk akun baru.');
    if (empForm.pin && (empForm.pin.length < 6 || !/^\d+$/.test(empForm.pin)))
      return setEmpFormError('PIN minimal 6 digit angka.');

    // Cek username unik
    const isOwnerUsername = u === 'owner-rental';
    if (!editingEmp && isOwnerUsername)
      return setEmpFormError('Username "owner-rental" dicadangkan untuk Owner.');
    const conflict = employeeAccounts.find(
      (acc) => acc.username.toLowerCase() === u && acc.id !== editingEmp?.id
    );
    if (conflict)
      return setEmpFormError(`Username "${u}" sudah dipakai oleh ${conflict.name}.`);

    if (editingEmp) {
      const updates: Partial<UserAccount> = {
        username: u,
        name: empForm.name.trim(),
        email: empForm.email.trim() || undefined,
        role: empForm.role,
      };
      if (empForm.pin) {
        updates.pin = await hashPin(empForm.pin);
      }
      onUpdateEmployee(editingEmp.id, updates);
    } else {
      const newId = `usr-karyawan-${Date.now()}`;
      const newAcc: UserAccount = {
        id: newId,
        username: u,
        name: empForm.name.trim(),
        role: empForm.role,
        email: empForm.email.trim() || undefined,
        pin: await hashPin(empForm.pin),
        createdAt: Date.now(),
        createdBy: currentUser.id,
      };
      onAddEmployee(newAcc);
    }
    setShowAddEmpModal(false);
    setEditingEmp(null);
    setEmpForm(DEFAULT_EMPLOYEE_FORM);
  };

  const confirmDeleteEmp = () => {
    if (!deletingEmp) return;
    onDeleteEmployee(deletingEmp.id);
    setDeletingEmp(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header & Subtabs */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">group</span>
            {isOwner ? 'Manajemen User & VIP' : 'Daftar Member VIP'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            {isOwner
              ? 'Owner: CRUD akun karyawan & member VIP. Karyawan: hanya CRUD VIP.'
              : 'Login sebagai Karyawan — Anda hanya dapat mengelola data VIP.'}
          </p>
        </div>

        <div
          className={`flex bg-slate-50 p-1 border border-slate-200 rounded-2xl w-full ${
            isOwner ? 'sm:w-96' : 'sm:w-64'
          } shadow-xs`}
        >
          {isOwner && (
            <button
              onClick={() => setActiveSubTab('EMPLOYEES')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'EMPLOYEES'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Akun ({employeeAccounts.length})
            </button>
          )}
          <button
            onClick={() => setActiveSubTab('VIPS')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'VIPS'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Member VIP ({vipList.length})
          </button>
          {isOwner && (
            <button
              onClick={() => setActiveSubTab('ABSEN')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'ABSEN'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Absen ({staffList.length})
            </button>
          )}
        </div>
      </div>

      {/* ====== TAB: AKUN KARYAWAN (Owner only) ====== */}
      {activeSubTab === 'EMPLOYEES' && isOwner && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-slate-900">
              Akun Login Karyawan
            </h3>
            <button
              onClick={openCreateEmp}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Tambah Akun Karyawan
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-label-ts text-slate-600 uppercase font-bold">
                  <th className="p-4">Inisial</th>
                  <th className="p-4">Username</th>
                  <th className="p-4">Nama</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Role</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {employeeAccounts.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-slate-500 text-sm"
                    >
                      Belum ada akun karyawan.
                    </td>
                  </tr>
                )}
                {employeeAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-3">
                      <Avatar name={acc.name} size="md" />
                    </td>
                    <td className="p-4 font-mono-code text-xs font-bold text-slate-900">
                      {acc.username}
                    </td>
                    <td className="p-4 font-bold text-slate-900">{acc.name}</td>
                    <td className="p-4 text-slate-600 text-xs">
                      {acc.email || '-'}
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {acc.role}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => openEditEmp(acc)}
                          title="Edit akun"
                          className="text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 p-2 rounded-lg transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">
                            edit
                          </span>
                        </button>
                        <button
                          onClick={() => setDeletingEmp(acc)}
                          title="Hapus akun"
                          className="text-slate-500 hover:text-rose-700 hover:bg-rose-50 p-2 rounded-lg transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">
                            delete
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== TAB: ABSEN (Owner only) ====== */}
      {activeSubTab === 'ABSEN' && isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staffList
            .filter((s) => s.role !== 'Owner')
            .map((staff) => {
            const todayKey = getTodayKey();
            const todayRecord = attendanceMap[staff.id]?.[todayKey];
            const isPresent = !!todayRecord && !todayRecord.clockOut;
            const daysPresent = Object.keys(attendanceMap[staff.id] || {}).length;
            const mealAllowance = daysPresent * mealAllowancePerDay;
            const profitShare = Math.round(staff.revenueHandled * profitShareRate);
            const totalSalary = mealAllowance + profitShare;
            return (
              <div
                key={staff.id}
                className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col gap-4 hover:border-cyan-400 hover:shadow-md transition-all shadow-sm"
              >
                {/* Header: avatar + nama + status */}
                <div className="flex items-center gap-4">
                  <Avatar name={staff.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-base text-slate-900 truncate">
                      {staff.name}
                    </h3>
                    <div className="text-[11px] font-label-ts text-cyan-700 font-bold uppercase tracking-wider">
                      {staff.role}
                    </div>
                    <span
                      className={`mt-1.5 inline-block text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        isPresent
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {isPresent ? 'Hadir' : 'Tidak Hadir'}
                    </span>
                  </div>
                </div>

                {/* Statistik kerja — baris demi baris, ukuran konsisten */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Hari Hadir</span>
                    <span className="text-slate-900 font-extrabold font-mono-code">
                      {daysPresent} hari
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Transaksi Hari Ini</span>
                    <span className="text-slate-900 font-extrabold font-mono-code">
                      {staff.transactionsTodayCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Pendapatan Ditangani</span>
                    <span className="text-emerald-700 font-extrabold font-mono-code">
                      Rp {staff.revenueHandled.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200" />

                {/* Rincian Gaji — uang makan & bagi hasil dipisah jelas */}
                <div className="space-y-3">
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">
                    Rincian Gaji Periode Ini
                  </div>

                  {/* Uang Makan — benefit harian */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-800 font-semibold text-sm flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">restaurant</span>
                        Uang Makan
                      </span>
                      <span className="text-amber-900 font-extrabold text-base font-mono-code">
                        Rp {mealAllowance.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-700 mt-1">
                      Benefit harian: Rp 10.000 × {daysPresent} hari
                    </div>
                  </div>

                  {/* Gaji / Bagi Hasil */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-800 font-semibold text-sm flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">payments</span>
                        Gaji (Bagi Hasil)
                      </span>
                      <span className="text-emerald-900 font-extrabold text-base font-mono-code">
                        Rp {profitShare.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-1">
                      25% × Rp {staff.revenueHandled.toLocaleString('id-ID')} revenue
                    </div>
                  </div>

                  {/* Total Gaji */}
                  <div className="bg-slate-900 text-white rounded-xl p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-300 font-semibold text-sm flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                        Total Gaji
                      </span>
                      <span className="text-white font-extrabold text-lg font-mono-code">
                        Rp {totalSalary.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tombol Absen — layout atas-bawah, full-width */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => onClockIn(staff.id)}
                    disabled={isPresent}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                      isPresent
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 cursor-pointer'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">login</span>
                    Absen Masuk
                  </button>
                  <button
                    onClick={() => onClockOut(staff.id)}
                    disabled={!isPresent}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                      !isPresent
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 cursor-pointer'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                    Absen Keluar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== TAB: VIP (Owner & Karyawan) ====== */}
      {activeSubTab === 'VIPS' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-slate-900">
              Gamer VIP Terdaftar
            </h3>
            <button
              onClick={openCreateVip}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              {isOwner ? 'Tambah VIP' : 'Daftar Gamer VIP'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-label-ts text-slate-600 uppercase font-bold">
                  <th className="p-4">Nama Member</th>
                  <th className="p-4">Telepon</th>
                  <th className="p-4">Peringkat Tier</th>
                  <th className="p-4">Total Jam Bermain</th>
                  <th className="p-4">Poin Loyalitas</th>
                  <th className="p-4">Total Pengeluaran</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {vipList.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-500 text-sm"
                    >
                      Belum ada member VIP.
                    </td>
                  </tr>
                )}
                {vipList.map((vip) => (
                  <tr key={vip.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-500">
                        stars
                      </span>
                      {vip.name}
                    </td>
                    <td className="p-4 font-mono-code text-xs text-slate-600 font-medium">
                      {vip.phone}
                    </td>
                    <td className="p-4">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-label-ts font-bold uppercase ${
                          vip.tier === 'Cyber Elite'
                            ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                            : vip.tier === 'Platinum'
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {vip.tier}
                      </span>
                    </td>
                    <td className="p-4 text-slate-800 font-bold">
                      {vip.playHoursTotal} Jam
                    </td>
                    <td className="p-4 font-extrabold text-emerald-700 font-mono-code">
                      {vip.loyaltyPoints} PTS
                    </td>
                    <td className="p-4 font-extrabold text-slate-900 font-mono-code">
                      Rp {vip.totalSpent.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => openEditVip(vip)}
                          title="Edit VIP"
                          className="text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 p-2 rounded-lg transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">
                            edit
                          </span>
                        </button>
                        <button
                          onClick={() => setDeletingVip(vip)}
                          title="Hapus VIP"
                          className="text-slate-500 hover:text-rose-700 hover:bg-rose-50 p-2 rounded-lg transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">
                            delete
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MODAL: Add/Edit VIP ===== */}
      {showAddVipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-700">
                {editingVip ? 'edit' : 'person_add'}
              </span>
              {editingVip ? 'Edit Member VIP' : 'Daftar Member VIP Baru'}
            </h3>
            <form onSubmit={handleSubmitVip} className="space-y-3">
              <div>
                <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={vipForm.name}
                  onChange={(e) =>
                    setVipForm({ ...vipForm, name: e.target.value })
                  }
                  placeholder="Contoh: Andi Wijaya"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                  Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={vipForm.phone}
                  onChange={(e) =>
                    setVipForm({ ...vipForm, phone: e.target.value })
                  }
                  placeholder="Contoh: 08123456789"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                    Tier
                  </label>
                  <select
                    value={vipForm.tier}
                    onChange={(e) =>
                      setVipForm({
                        ...vipForm,
                        tier: e.target.value as VIPMember['tier'],
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Gold">Gold</option>
                    <option value="Platinum">Platinum</option>
                    <option value="Cyber Elite">Cyber Elite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                    Poin Loyalitas
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={vipForm.loyaltyPoints}
                    onChange={(e) =>
                      setVipForm({
                        ...vipForm,
                        loyaltyPoints: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddVipModal(false);
                    setEditingVip(null);
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer shadow-sm"
                >
                  {editingVip ? 'Simpan Perubahan' : 'Daftarkan Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: Add/Edit Karyawan (Owner only) ===== */}
      {showAddEmpModal && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-700">
                {editingEmp ? 'edit' : 'person_add'}
              </span>
              {editingEmp ? 'Edit Akun Karyawan' : 'Tambah Akun Karyawan'}
            </h3>
            <form onSubmit={handleSubmitEmp} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={empForm.username}
                    onChange={(e) =>
                      setEmpForm({
                        ...empForm,
                        username: e.target.value.replace(/\s/g, '').toLowerCase(),
                      })
                    }
                    placeholder="contoh: andi"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium font-mono-code focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                    Role
                  </label>
                  <select
                    value={empForm.role}
                    onChange={(e) =>
                      setEmpForm({
                        ...empForm,
                        role: e.target.value as UserRole,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    <option value="Karyawan">Karyawan</option>
                    <option value="Owner">Owner</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={empForm.name}
                  onChange={(e) =>
                    setEmpForm({ ...empForm, name: e.target.value })
                  }
                  placeholder="Contoh: Andi Wijaya"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={empForm.email}
                  onChange={(e) =>
                    setEmpForm({ ...empForm, email: e.target.value })
                  }
                  placeholder="andi@cmdcenter.app"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-label-ts text-slate-600 font-bold mb-1">
                  PIN{' '}
                  {editingEmp && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      (kosongkan jika tidak diubah)
                    </span>
                  )}{' '}
                  {!editingEmp && '*'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required={!editingEmp}
                  value={empForm.pin}
                  onChange={(e) =>
                    setEmpForm({
                      ...empForm,
                      pin: e.target.value.replace(/\D/g, '').slice(0, 8),
                    })
                  }
                  placeholder="Minimal 6 digit angka"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium font-mono-code focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              {empFormError && (
                <p className="text-xs font-bold text-rose-600">{empFormError}</p>
              )}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddEmpModal(false);
                    setEditingEmp(null);
                    setEmpFormError('');
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer shadow-sm"
                >
                  {editingEmp ? 'Simpan Perubahan' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: Konfirmasi Hapus VIP ===== */}
      {deletingVip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600">
                warning
              </span>
              Hapus Member VIP?
            </h3>
            <p className="text-sm text-slate-600">
              Anda akan menghapus VIP{' '}
              <strong className="text-slate-900">{deletingVip.name}</strong>{' '}
              ({deletingVip.phone}). Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingVip(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={confirmDeleteVip}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: Konfirmasi Hapus Karyawan ===== */}
      {deletingEmp && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600">
                warning
              </span>
              Hapus Akun Karyawan?
            </h3>
            <p className="text-sm text-slate-600">
              Anda akan menghapus akun{' '}
              <strong className="text-slate-900">{deletingEmp.name}</strong>{' '}
              (@{deletingEmp.username}). Akun ini tidak bisa login lagi.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingEmp(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={confirmDeleteEmp}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
