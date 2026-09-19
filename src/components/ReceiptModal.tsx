import React from 'react';
import { Transaction } from '../types';

interface ReceiptModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  onClose,
}) => {
  if (!transaction) return null;

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

  const formattedDateTime = formatTransactionDateTime(transaction);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const text = `==================================
   COMMAND CENTER
     Rental Management Terminal
==================================
No. Struk : ${transaction.receiptNumber}
Tanggal   : ${formattedDateTime}
Kasir     : ${transaction.cashierName}
Pelanggan : ${transaction.customerName}
----------------------------------
Station   : ${transaction.stationName} (${transaction.consoleType})
Durasi    : ${transaction.durationLabel}
Metode    : ${transaction.paymentMethod}
----------------------------------
TOTAL     : ${transaction.formattedAmount} (Rp ${transaction.amount.toLocaleString('id-ID')})
STATUS    : LUNAS / BERHASIL
==================================
Terima kasih telah bermain di tempat kami!
==================================`;

    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Struk_${transaction.receiptNumber}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white print:text-black">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl print:border-none print:shadow-none print:w-full print:max-w-none print:bg-white">
        {/* Receipt Top Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-700">receipt_long</span>
            <span className="font-bold text-sm text-slate-900">Struk Thermal Resmi</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Thermal Receipt Paper Layout */}
        <div className="p-6 bg-slate-50 text-slate-800 font-mono-code text-xs space-y-4 print:bg-white print:text-black print:p-2">
          {/* Header Branding */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <div className="font-black text-base text-slate-900 tracking-tight">
              COMMAND CENTER
            </div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">
              Rental Management Terminal
            </div>
            <div className="text-[10px] text-slate-500">
              Jl. Cybernetics No. 88, Suite 404
            </div>
          </div>

          {/* Metadata */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">No. Struk:</span>
              <span className="font-bold text-slate-900">
                {transaction.receiptNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Waktu:</span>
              <span className="font-medium text-slate-800 font-mono">
                {formattedDateTime}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Kasir:</span>
              <span className="font-medium text-slate-800">{transaction.cashierName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pelanggan:</span>
              <span className="font-bold text-slate-900">{transaction.customerName}</span>
            </div>
          </div>

          {/* Line Items */}
          <div className="py-2 border-y border-dashed border-slate-300 space-y-2">
            <div className="flex justify-between items-start font-bold">
              <div>
                <div className="text-slate-900">{transaction.stationName}</div>
                <div className="text-[10px] text-slate-500 font-normal">
                  {transaction.consoleType} • Sewa {transaction.durationLabel}
                </div>
              </div>
              <div className="text-right font-extrabold text-slate-900">
                Rp {transaction.amount.toLocaleString('id-ID')}
              </div>
            </div>
          </div>

          {/* Totals & Payment Method */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal:</span>
              <span className="font-medium">Rp {transaction.amount.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pajak / Layanan (0%):</span>
              <span className="font-medium">Rp 0</span>
            </div>
            <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-slate-300">
              <span>TOTAL BAYAR:</span>
              <span className="text-slate-900">
                Rp {transaction.amount.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between text-[11px] pt-1">
              <span className="text-slate-500">Metode & Status:</span>
              <span
                className={`font-extrabold uppercase ${
                  transaction.paymentStatus === 'Belum Lunas' || transaction.paymentStatus === 'Pending'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {transaction.paymentMethod} (
                {transaction.paymentStatus === 'Belum Lunas' || transaction.paymentStatus === 'Pending'
                  ? 'BELUM LUNAS'
                  : 'LUNAS'}
                )
              </span>
            </div>
          </div>

          {/* Barcode graphic */}
          <div className="pt-2 text-center space-y-1">
            <div className="bg-white p-2 rounded-xl border border-slate-200 flex justify-center items-center shadow-xs">
              <div className="h-8 w-4/5 flex justify-between items-center bg-slate-900 px-1">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white h-full"
                    style={{ width: i % 3 === 0 ? '3px' : i % 2 === 0 ? '1px' : '2px' }}
                  ></div>
                ))}
              </div>
            </div>
            <div className="text-[9px] text-slate-500 tracking-widest uppercase font-bold">
              * {transaction.receiptNumber} *
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-300">
            Terima kasih telah bermain bersama kami!
            <br />
            Simpan struk ini untuk klaim garansi sesi.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-2 print:hidden">
          <button
            onClick={handleDownloadTxt}
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Simpan TXT
          </button>
          <button
            onClick={handlePrint}
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
};
