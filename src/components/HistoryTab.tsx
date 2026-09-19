import React, { useState } from 'react';
import { Transaction, UserAccount } from '../types';

interface HistoryTabProps {
  transactions: Transaction[];
  currentUser?: UserAccount;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenNewSession: () => void;
  onDeleteTransaction?: (txId: string) => void;
  onDeleteMultipleTransactions?: (txIds: string[]) => void;
  onTogglePaymentStatus?: (txId: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  transactions,
  currentUser,
  onSelectTransaction,
  onOpenNewSession,
  onDeleteTransaction,
  onDeleteMultipleTransactions,
  onTogglePaymentStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Date range state in YYYY-MM-DD
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Delete modal states
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);

  const isOwner = currentUser?.role === 'Owner';

  // Helper to format YYYY-MM-DD to DD/MM/YYYY for UI display
  const formatISOToDDMMYYYY = (isoStr: string): string => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  };

  // Helper to format full transaction timestamp/dateLabel as HH:mm DD/MM/YYYY (e.g. 14:30 09/08/2026)
  const formatTransactionDateTime = (tx: Transaction): string => {
    let day = '01';
    let month = '01';
    let year = '2026';

    if (tx.dateLabel && tx.dateLabel.includes('-')) {
      const parts = tx.dateLabel.split('-');
      if (parts.length === 3) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }
    } else if (tx.timestamp) {
      const d = new Date(tx.timestamp);
      const pad = (n: number) => n.toString().padStart(2, '0');
      day = pad(d.getDate());
      month = pad(d.getMonth() + 1);
      year = d.getFullYear().toString();
    }

    const time = tx.timeLabel || '12:00';
    return `${time} ${day}/${month}/${year}`;
  };

  // Preset date filter handlers
  const handleSetToday = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setStartDate(todayStr);
    setEndDate(todayStr);
  };

  const handleSetLast7Days = () => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 7);

    setStartDate(past.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  };

  const handleResetDates = () => {
    setStartDate('');
    setEndDate('');
  };

  // Filter transactions
  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.stationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.cashierName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesMethod =
      selectedMethod === 'ALL' || tx.paymentMethod === selectedMethod;

    const matchesStatus =
      selectedStatus === 'ALL' ||
      (selectedStatus === 'Lunas' && (tx.paymentStatus === 'Lunas' || tx.paymentStatus === 'Paid' || !tx.paymentStatus)) ||
      (selectedStatus === 'Belum Lunas' && (tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending'));

    // Date range filter matching
    let matchesDate = true;
    if (tx.dateLabel) {
      if (startDate && tx.dateLabel < startDate) {
        matchesDate = false;
      }
      if (endDate && tx.dateLabel > endDate) {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesMethod && matchesStatus && matchesDate;
  });

  const totalFilteredRevenue = filtered.reduce((acc, curr) => acc + curr.amount, 0);

  const exportCsv = () => {
    const headers = ['No Struk', 'Station', 'Konsol', 'Pelanggan', 'Durasi', 'Pembayaran', 'Jumlah (IDR)', 'Waktu Spesifik', 'Kasir'];
    const rows = filtered.map((tx) => [
      tx.receiptNumber,
      tx.stationName,
      tx.consoleType,
      tx.customerName,
      tx.durationLabel,
      tx.paymentMethod,
      tx.amount,
      formatTransactionDateTime(tx),
      tx.cashierName,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Transactions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">receipt_long</span>
            Log Audit Transaksi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Riwayat lengkap sesi bermain dan struk transaksi
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={exportCsv}
            className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Ekspor CSV
          </button>

          <button
            onClick={onOpenNewSession}
            className="flex-1 sm:flex-none bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            + Sesi Baru
          </button>
        </div>
      </div>

      {/* Date Range & Search Toolbar Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        {/* Date Filter Bar (DD/MM/YYYY) */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-label-ts">
              <span className="material-symbols-outlined text-cyan-700 text-base">calendar_month</span>
              Filter Rentang Tanggal (DD/MM/YYYY):
            </label>

            {/* Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSetToday}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={handleSetLast7Days}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                7 Hari Terakhir
              </button>
              <button
                type="button"
                onClick={handleSetThisMonth}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Bulan Ini
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={handleResetDates}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">clear</span>
                  Reset Tanggal
                </button>
              )}
            </div>
          </div>

          {/* Date Picker Input Fields with formatted DD/MM/YYYY badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Start Date */}
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">Dari:</span>
                <span className="font-mono text-xs font-extrabold text-cyan-900 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-2xs">
                  {startDate ? formatISOToDDMMYYYY(startDate) : 'DD/MM/YYYY'}
                </span>
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-cyan-500 cursor-pointer shrink-0"
              />
            </div>

            {/* End Date */}
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">Sampai:</span>
                <span className="font-mono text-xs font-extrabold text-cyan-900 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-2xs">
                  {endDate ? formatISOToDDMMYYYY(endDate) : 'DD/MM/YYYY'}
                </span>
              </div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-cyan-500 cursor-pointer shrink-0"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-slate-400 text-xl">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama pelanggan, station, atau no. struk..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-2xs"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-1 bg-slate-50 p-1 border border-slate-200 rounded-2xl">
            {[
              { id: 'ALL', label: 'SEMUA' },
              { id: 'Lunas', label: 'LUNAS' },
              { id: 'Belum Lunas', label: 'BELUM LUNAS' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id)}
                className={`flex-1 py-1 px-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer truncate ${
                  selectedStatus === st.id
                    ? st.id === 'Belum Lunas'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Payment Method Filter */}
          <div className="flex gap-1 bg-slate-50 p-1 border border-slate-200 rounded-2xl">
            {['ALL', 'QRIS', 'Cash', 'Debit'].map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setSelectedMethod(pm)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedMethod === pm
                    ? 'bg-cyan-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {pm === 'ALL' ? 'SEMUA' : pm}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Filter Pill & Owner Bulk Delete */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-label-ts text-slate-600 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200 font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <span>MENAMPILKAN <span className="text-cyan-800 font-extrabold">{filtered.length}</span> TRANSAKSI</span>
          {selectedStatus !== 'ALL' && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${selectedStatus === 'Belum Lunas' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`}>
              STATUS: {selectedStatus.toUpperCase()}
            </span>
          )}
          {(startDate || endDate) && (
            <span className="bg-cyan-100 text-cyan-900 border border-cyan-300 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold">
              🗓️ {startDate ? formatISOToDDMMYYYY(startDate) : 'Awal'} - {endDate ? formatISOToDDMMYYYY(endDate) : 'Akhir'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div>
            TOTAL PENDAPATAN:{' '}
            <span className="text-emerald-700 font-black font-mono-code text-sm">
              Rp {totalFilteredRevenue.toLocaleString('id-ID')}
            </span>
          </div>

          {isOwner && filtered.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(true)}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Hapus semua transaksi hasil filter saat ini (Akses Owner)"
            >
              <span className="material-symbols-outlined text-sm">delete_sweep</span>
              Hapus ({filtered.length})
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-label-ts text-slate-600 uppercase tracking-wider font-bold">
                <th className="p-4">Station & Konsol</th>
                <th className="p-4">Pelanggan</th>
                <th className="p-4">Durasi</th>
                <th className="p-4">Metode</th>
                <th className="p-4">Status Bayar</th>
                <th className="p-4">Jumlah</th>
                <th className="p-4">Waktu (HH:MM DD/MM/YYYY)</th>
                <th className="p-4 text-right">Aksi {isOwner ? '(Struk & Hapus)' : '(Struk)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    Tidak ada transaksi yang cocok dengan kriteria filter Anda.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => onSelectTransaction(tx)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="p-4 font-bold text-slate-900 group-hover:text-cyan-700">
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-cyan-700 text-lg">
                          gamepad
                        </span>
                        <div>
                          <div>{tx.stationName}</div>
                          <div className="text-[10px] text-slate-500 font-medium font-label-ts">
                            {tx.consoleType}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-slate-800">{tx.customerName}</td>
                    <td className="p-4 text-slate-600">
                      <span className="bg-slate-100 px-2.5 py-0.5 rounded-full text-xs border border-slate-200 font-medium">
                        {tx.durationLabel}
                      </span>
                    </td>
                    <td className="p-4 font-semibold">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          tx.paymentMethod === 'QRIS'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {tx.paymentMethod}
                      </span>
                    </td>
                    <td className="p-4">
                      {tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending' ? (
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 shadow-2xs">
                            <span className="material-symbols-outlined text-xs text-amber-700">schedule</span>
                            Belum Lunas
                          </span>
                          {onTogglePaymentStatus && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePaymentStatus(tx.id);
                              }}
                              title="Klik untuk ubah menjadi Lunas"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-2xs active:scale-95 flex items-center gap-0.5"
                            >
                              <span className="material-symbols-outlined text-[12px]">check</span>
                              Tandai Lunas
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-extrabold inline-flex items-center gap-1 shadow-2xs">
                          <span className="material-symbols-outlined text-xs text-emerald-700">check_circle</span>
                          Lunas
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-extrabold text-slate-900 font-mono-code">
                      {tx.formattedAmount}
                    </td>
                    <td className="p-4 text-xs font-mono font-bold text-slate-700">
                      {formatTransactionDateTime(tx)}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTransaction(tx);
                          }}
                          title="Lihat Struk Transaksi"
                          className="bg-slate-100 hover:bg-slate-200 text-cyan-700 p-1.5 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">
                            receipt_long
                          </span>
                        </button>

                        {isOwner && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTxToDelete(tx);
                            }}
                            title="Hapus Transaksi Ini (Owner)"
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base">
                              delete
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Single Transaction Delete */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                <span className="material-symbols-outlined text-2xl">delete_forever</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-slate-900">
                  Hapus Riwayat Transaksi?
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Anda akan menghapus transaksi <strong className="text-slate-900">{txToDelete.stationName}</strong> atas nama <strong className="text-slate-900">{txToDelete.customerName}</strong> ({txToDelete.formattedAmount}).
                </p>
                <div className="mt-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">warning</span>
                  <span>Tindakan ini tidak dapat dibatalkan dan hanya dapat dilakukan oleh Owner.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-2xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTransaction) {
                    onDeleteTransaction(txToDelete.id);
                  }
                  setTxToDelete(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                Ya, Hapus Transaksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Delete Filtered Transactions */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                <span className="material-symbols-outlined text-2xl">delete_sweep</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-slate-900">
                  Hapus ({filtered.length}) Transaksi Terfilter?
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Apakah Anda yakin ingin menghapus seluruh <strong className="text-slate-900">{filtered.length} transaksi</strong> yang saat ini tampil di hasil filter?
                </p>
                <div className="mt-2 bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">priority_high</span>
                  <span>Seluruh data riwayat transaksi ini akan dihapus permanen dari sistem.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-2xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const idsToDelete = filtered.map((t) => t.id);
                  if (onDeleteMultipleTransactions) {
                    onDeleteMultipleTransactions(idsToDelete);
                  } else if (onDeleteTransaction) {
                    idsToDelete.forEach((id) => onDeleteTransaction(id));
                  }
                  setShowBulkDeleteModal(false);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">delete_forever</span>
                Hapus Semuanya
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


