import React, { useState, useEffect, useRef } from 'react';
import { GamingStation, PaymentMethod } from '../types';

interface SessionExpiredModalProps {
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

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({
  station,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentStatus, setPaymentStatus] = useState<'Lunas' | 'Belum Lunas'>('Lunas');
  const [now, setNow] = useState<number>(Date.now());
  const [beepCount, setBeepCount] = useState<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<number | null>(null);

  // Initialize payment defaults from session
  useEffect(() => {
    if (station?.currentSession?.paymentMethod) {
      setPaymentMethod(station.currentSession.paymentMethod);
    }
    if (station?.currentSession?.paymentStatus) {
      const ps = station.currentSession.paymentStatus;
      setPaymentStatus(ps === 'Belum Lunas' || ps === 'Pending' ? 'Belum Lunas' : 'Lunas');
    }
  }, [station]);

  // Live ticking timer for "overtime" display
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  // Repeating beep alarm while modal open (max 5 beeps to avoid annoyance)
  useEffect(() => {
    if (!isOpen) return;

    const playBeep = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = 880;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch (e) {
        // AudioContext might be blocked; silently ignore
      }
    };

    // First beep immediately, then every 2.5s, up to 5 times
    playBeep();
    beepIntervalRef.current = window.setInterval(() => {
      setBeepCount((prev) => {
        const next = prev + 1;
        playBeep();
        if (next >= 4 && beepIntervalRef.current) {
          window.clearInterval(beepIntervalRef.current);
          beepIntervalRef.current = null;
        }
        return next;
      });
    }, 2500);

    return () => {
      if (beepIntervalRef.current) {
        window.clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
      setBeepCount(0);
    };
  }, [isOpen]);

  if (!isOpen || !station || !station.currentSession) return null;

  const session = station.currentSession;
  const isMainBebas = session.isMainBebas || session.durationMinutes === 0;

  // Calculate actual played duration (and overtime if beyond endTime)
  const elapsedMs = Math.max(0, now - session.startTime);
  const actualMinutes = Math.max(1, Math.ceil(elapsedMs / (1000 * 60)));
  const overtimeMs = isMainBebas ? 0 : Math.max(0, now - session.endTime);
  const overtimeMinutes = Math.floor(overtimeMs / (1000 * 60));
  const overtimeSeconds = Math.floor((overtimeMs % (1000 * 60)) / 1000);

  const rate = station.ratePerHour;
  const calculatedAmount = isMainBebas
    ? Math.round((actualMinutes / 60) * rate)
    : session.amount;

  const handleConfirmAction = () => {
    if (beepIntervalRef.current) {
      window.clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    onConfirm(station, {
      actualMinutes,
      finalAmount: calculatedAmount,
      paymentMethod,
      paymentStatus,
    });
    onClose();
  };

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rose-900/40 backdrop-blur-md animate-fade-in">
      {/* Pulsing alarm border wrapper */}
      <div className="relative w-full max-w-md">
        {/* Pulse ring */}
        <div className="absolute -inset-1 bg-rose-500/30 rounded-3xl blur-md animate-pulse"></div>

        <div className="relative bg-white border-2 border-rose-500 rounded-3xl w-full overflow-hidden shadow-2xl">
          {/* Animated top alert bar */}
          <div className="bg-gradient-to-r from-rose-600 via-red-600 to-rose-600 px-5 py-2.5 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <span className="font-extrabold text-xs uppercase tracking-wider">
                Alarm Sesi Habis
              </span>
            </div>
            <span className="font-mono text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
              {beepCount > 0 ? `BEEP ${Math.min(beepCount + 1, 5)}/5` : 'BEEP 1/5'}
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Header Icon & Title */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 border-2 border-rose-300 flex items-center justify-center shrink-0 animate-pulse">
                <span className="material-symbols-outlined text-3xl">timer_off</span>
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-xl text-slate-900 leading-tight">
                  Waktu Rental Habis!
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  Segera selesaikan sesi untuk mencegah fraud & kebocoran tagihan
                </p>
              </div>
            </div>

            {/* Station Info Box */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Unit Station:</span>
                <span className="font-bold text-slate-900">
                  {station.name} ({station.consoleType})
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Penyewa:</span>
                <span className="font-bold text-cyan-800">
                  {session.customerName}
                </span>
              </div>

              {!isMainBebas && (
                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-500 font-medium">Lewat Batas:</span>
                  <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                    +{pad(overtimeMinutes)}:{pad(overtimeSeconds)}
                  </span>
                </div>
              )}

              {isMainBebas && (
                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-500 font-medium">Durasi Berjalan:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {actualMinutes} Menit
                  </span>
                </div>
              )}

              {/* Total Tagihan */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-700">
                  Total Tagihan:
                </span>
                <span className="font-mono text-xl font-black text-emerald-700">
                  Rp {calculatedAmount.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Quick Payment Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Metode Pembayaran
              </label>
              <div className="grid grid-cols-3 gap-1.5">
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
                      {pm === 'QRIS'
                        ? 'qr_code'
                        : pm === 'Cash'
                        ? 'payments'
                        : 'credit_card'}
                    </span>
                    {pm}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Status Toggle */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Status Pembayaran
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('Lunas')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    paymentStatus === 'Lunas'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Lunas
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('Belum Lunas')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    paymentStatus === 'Belum Lunas'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  Belum Lunas
                </button>
              </div>
            </div>

            {/* Fraud Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 font-medium leading-relaxed flex items-start gap-1.5">
              <span className="material-symbols-outlined text-base text-amber-700 shrink-0">
                info
              </span>
              <span>
                <strong>Penting:</strong> Sesi yang sudah expired wajib segera
                diselesaikan. Akurasi timer & pembayaran =防止 kebocoran revenue.
              </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (beepIntervalRef.current) {
                    window.clearInterval(beepIntervalRef.current);
                    beepIntervalRef.current = null;
                  }
                  onClose();
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 px-3"
                title="Tunda 30 detik"
              >
                <span className="material-symbols-outlined text-base">snooze</span>
                Tunda
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="flex-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-extrabold py-2.5 rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Selesaikan Sekarang
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};