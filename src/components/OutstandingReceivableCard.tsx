import React, { useMemo, useState } from 'react';
import { Transaction, GamingStation } from '../types';

interface OutstandingReceivableCardProps {
  transactions: Transaction[];
  stations: GamingStation[];
  onSelectTransaction?: (tx: Transaction) => void;
}

function formatIDR(val: number): string {
  return `Rp ${val.toLocaleString('id-ID')}`;
}

function formatAge(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}

export const OutstandingReceivableCard: React.FC<OutstandingReceivableCardProps> = ({
  transactions,
  stations,
  onSelectTransaction,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const unpaid = useMemo(() => {
    return transactions
      .filter(
        (tx) => tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending'
      )
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first
  }, [transactions]);

  const total = useMemo(
    () => unpaid.reduce((acc, tx) => acc + tx.amount, 0),
    [unpaid]
  );

  const over1Day = useMemo(
    () => unpaid.filter((tx) => Date.now() - tx.timestamp > 24 * 60 * 60 * 1000),
    [unpaid]
  );

  const stationNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    stations.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stations]);

  if (unpaid.length === 0) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-2xl">task_alt</span>
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-emerald-900">
              Tidak ada Piutang Tertunda
            </h3>
            <p className="text-xs text-emerald-700 font-medium">
              Semua transaksi berstatus Lunas. Cash flow lancar! 🎉
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50/30 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <div className="text-left">
            <h3 className="font-extrabold text-sm text-amber-900 uppercase tracking-wider">
              🚨 Piutang Tertunda (Belum Lunas)
            </h3>
            <p className="text-xs text-amber-700 font-medium">
              {unpaid.length} transaksi belum dibayar · {over1Day.length} berumur {'>'}1 hari
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-extrabold text-lg sm:text-xl text-amber-900">
            {formatIDR(total)}
          </div>
          <div className="text-[10px] text-amber-700 font-bold flex items-center gap-1 justify-end">
            <span className="material-symbols-outlined text-xs">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
            {expanded ? 'Sembunyikan' : 'Lihat Detail'}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-amber-200 space-y-2 animate-fade-in max-h-80 overflow-y-auto custom-scrollbar">
          {unpaid.map((tx) => {
            const isOverdue = Date.now() - tx.timestamp > 24 * 60 * 60 * 1000;
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelectTransaction?.(tx)}
                className={`w-full bg-white border-2 rounded-2xl p-3 text-left transition-all cursor-pointer flex items-center gap-3 ${
                  isOverdue
                    ? 'border-rose-300 hover:border-rose-500 hover:bg-rose-50/40'
                    : 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/40'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {isOverdue ? 'priority_high' : 'schedule'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 truncate">
                      {tx.customerName}
                    </span>
                    {isOverdue && (
                      <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded uppercase shrink-0">
                        OVERDUE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">
                    {stationNameMap[tx.stationId] || tx.stationName} ·{' '}
                    {tx.durationLabel} · {tx.timeLabel} · {formatAge(tx.timestamp)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-sm text-slate-900">
                    {formatIDR(tx.amount)}
                  </div>
                  <div className="text-[10px] text-amber-700 font-bold uppercase">
                    Belum Lunas
                  </div>
                </div>
              </button>
            );
          })}
          <div className="text-[10px] text-amber-700 font-medium italic text-center pt-1">
            💡 Klik transaksi untuk melihat struk & tandai Lunas
          </div>
        </div>
      )}
    </div>
  );
};