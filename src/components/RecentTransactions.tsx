import React from 'react';
import { Transaction } from '../types';

interface RecentTransactionsProps {
  transactions: Transaction[];
  onViewAll: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  onViewAll,
  onSelectTransaction,
}) => {
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

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex justify-between items-center">
        <h2 className="font-bold text-lg sm:text-xl text-slate-900">
          Transaksi Terbaru
        </h2>
        <button
          onClick={onViewAll}
          className="font-label-ts text-xs text-cyan-700 hover:text-cyan-800 transition-colors uppercase font-bold tracking-wider cursor-pointer"
        >
          LIHAT SEMUA
        </button>
      </div>

      <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto custom-scrollbar">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Belum ada transaksi hari ini.
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              onClick={() => onSelectTransaction(tx)}
              className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center text-cyan-700 group-hover:border-cyan-400 group-hover:bg-cyan-50 transition-all">
                  <span className="material-symbols-outlined text-xl sm:text-2xl">
                    gamepad
                  </span>
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg text-slate-900 mb-0.5 group-hover:text-cyan-700 transition-colors">
                    {tx.stationName}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium font-label-ts mb-1">
                    {tx.consoleType}
                  </div>
                  <div className="flex items-center gap-2 font-label-ts text-xs text-slate-500">
                    <span className="bg-slate-100 px-2 py-0.5 rounded-full text-slate-700 border border-slate-200 font-medium">
                      {tx.durationLabel}
                    </span>
                    <span>•</span>
                    <span
                      className={
                        tx.paymentMethod === 'QRIS'
                          ? 'text-emerald-700 font-bold'
                          : 'text-slate-700 font-medium'
                      }
                    >
                      {tx.paymentMethod}
                    </span>
                    <span>•</span>
                    {tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending' ? (
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.2 rounded-full text-[10px] font-extrabold">
                        Belum Lunas
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.2 rounded-full text-[10px] font-extrabold">
                        Lunas
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-right">
                  <div className="font-extrabold text-base sm:text-lg text-slate-900 font-mono-code">
                    {tx.formattedAmount}
                  </div>
                  <div className="font-mono text-[11px] sm:text-xs text-slate-500 font-bold">
                    {formatTransactionDateTime(tx)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTransaction(tx);
                  }}
                  title="Lihat Struk Thermal"
                  className="text-slate-400 hover:text-cyan-700 hover:bg-slate-100 transition-all p-2 rounded-full active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg sm:text-xl">
                    receipt_long
                  </span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

