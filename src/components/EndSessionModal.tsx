import React, { useState, useEffect } from 'react';
import { GamingStation, PaymentMethod } from '../types';

interface EndSessionModalProps {
  station: GamingStation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    station: GamingStation,
    endDetails?: {
      actualMinutes: number;
      finalAmount: number;
      paymentMethod: PaymentMethod;
      paymentStatus: 'Lunas' | 'Belum Lunas';
    }
  ) => void;
}

export const EndSessionModal: React.FC<EndSessionModalProps> = ({
  station,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentStatus, setPaymentStatus] = useState<'Lunas' | 'Belum Lunas'>('Lunas');

  useEffect(() => {
    if (station?.currentSession?.paymentMethod) {
      setPaymentMethod(station.currentSession.paymentMethod);
    }
    if (station?.currentSession?.paymentStatus) {
      const ps = station.currentSession.paymentStatus;
      setPaymentStatus(ps === 'Belum Lunas' || ps === 'Pending' ? 'Belum Lunas' : 'Lunas');
    }
  }, [station]);

  if (!isOpen || !station || !station.currentSession) return null;

  const session = station.currentSession;
  const isMainBebas = session.isMainBebas || session.durationMinutes === 0;

  // Calculate actual played duration
  const now = Date.now();
  const elapsedMs = Math.max(0, now - session.startTime);
  const actualMinutes = Math.max(1, Math.ceil(elapsedMs / (1000 * 60)));
  const rate = station.ratePerHour;
  const calculatedAmount = isMainBebas
    ? Math.round((actualMinutes / 60) * rate)
    : session.amount;

  const handleConfirmAction = () => {
    onConfirm(station, {
      actualMinutes,
      finalAmount: calculatedAmount,
      paymentMethod,
      paymentStatus,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5">
        {/* Header Icon & Title */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">stop_circle</span>
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-slate-900">
              Selesaikan Sesi Rental?
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Konfirmasi penghentian timer & pembayaran terminal
            </p>
          </div>
        </div>

        {/* Station Info Box */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Unit Station:</span>
            <span className="font-bold text-slate-900">{station.name} ({station.consoleType})</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Penyewa:</span>
            <span className="font-bold text-cyan-800">{session.customerName}</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Pola Sesi:</span>
            <span className={`font-bold text-xs px-2 py-0.5 rounded ${isMainBebas ? 'bg-indigo-100 text-indigo-800' : 'bg-cyan-100 text-cyan-800'}`}>
              {isMainBebas ? 'Main Bebas (Pasca Bayar)' : `${session.durationMinutes / 60} Jam (Paket)`}
            </span>
          </div>

          {session.gamePlaying && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Game Dimainkan:</span>
              <span className="font-semibold text-slate-700">{session.gamePlaying}</span>
            </div>
          )}

          {isMainBebas ? (
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Durasi Bermain:</span>
                <span className="font-mono font-bold text-slate-800">
                  {actualMinutes} Menit ({(actualMinutes / 60).toFixed(2)} Jam)
                </span>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl space-y-1">
                <div className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">
                  Rumus Hitung Tagihan:
                </div>
                <div className="text-xs font-mono font-extrabold text-indigo-950">
                  ({actualMinutes} Menit / 60) × Rp {rate.toLocaleString('id-ID')}
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-700">Total Tagihan Final:</span>
                <span className="font-mono text-lg font-black text-emerald-700">
                  Rp {calculatedAmount.toLocaleString('id-ID')}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-medium">Total Paket:</span>
              <span className="font-mono font-bold text-slate-800">
                {session.durationMinutes / 60} Jam (Rp {session.amount.toLocaleString('id-ID')})
              </span>
            </div>
          )}
        </div>

        {/* Payment Method Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
            Metode Pembayaran Final
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['Cash', 'QRIS', 'Debit'] as PaymentMethod[]).map((pm) => (
              <button
                type="button"
                key={pm}
                onClick={() => setPaymentMethod(pm)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  paymentMethod === pm
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {pm === 'QRIS' ? 'qr_code' : pm === 'Cash' ? 'payments' : 'credit_card'}
                </span>
                {pm}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Status Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
            Status Pembayaran
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentStatus('Lunas')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                paymentStatus === 'Lunas'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Sudah Lunas
            </button>
            <button
              type="button"
              onClick={() => setPaymentStatus('Belum Lunas')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                paymentStatus === 'Belum Lunas'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-sm">schedule</span>
              Belum Lunas
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 font-medium leading-relaxed">
          Sesi akan diakhiri, transaksi dicatat, dan status terminal <span className="font-bold text-emerald-700">{station.name}</span> akan dikembalikan menjadi <span className="font-bold text-emerald-700">SIAP / TERSEDIA</span>.
        </p>

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmAction}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">check_circle</span>
            Selesai & Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
};
