import React, { useState, useEffect } from 'react';
import { GamingStation, PaymentMethod, VIPMember } from '../types';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  stations: GamingStation[];
  selectedStationId?: string;
  vipList?: VIPMember[];
  onConfirmSession: (sessionData: {
    stationId: string;
    customerName: string;
    customerPhone: string;
    vipId?: string;
    durationMinutes: number;
    isMainBebas?: boolean;
    paymentMethod: PaymentMethod;
    paymentStatus: 'Lunas' | 'Belum Lunas';
    amount: number;
    gamePlaying: string;
    cashierName: string;
  }) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  isOpen,
  onClose,
  stations,
  selectedStationId,
  vipList = [],
  onConfirmSession,
}) => {
  const [stationId, setStationId] = useState<string>(
    selectedStationId || (stations.find((s) => s.status === 'available')?.id || stations[0]?.id || '')
  );
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [selectedVip, setSelectedVip] = useState<VIPMember | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [showMemberDropdown, setShowMemberDropdown] = useState<boolean>(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [customVal, setCustomVal] = useState<string>('1');
  const [customUnit, setCustomUnit] = useState<'menit' | 'jam'>('menit');
  const [isMainBebas, setIsMainBebas] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [cashierName, setCashierName] = useState<string>('Alex Rivera');
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [showPaymentAlert, setShowPaymentAlert] = useState<boolean>(false);

  // Sync stationId with prop whenever it changes or modal opens. Without this,
  // selecting a station card → opening modal → the local state can stay pinned
  // to the initial pick from a previous session, causing
  // `handleFinalizeSession` to fire onConfirmSession with a stale stationId
  // that the parent's `stations` array no longer contains — which made
  // handleConfirmNewSession return early and the timer never started.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedStationId) {
      setStationId(selectedStationId);
    } else {
      const fallback = stations.find((s) => s.status === 'available')?.id || stations[0]?.id || '';
      if (fallback) setStationId(fallback);
    }
    // Reset payment alert + QR state every time the modal is freshly opened
    // so users don't get stuck on a previous modal step.
    setShowPaymentAlert(false);
    setShowQrCode(false);
  }, [isOpen, selectedStationId, stations]);

  if (!isOpen) return null;

  const currentStation = stations.find((s) => s.id === stationId) || stations[0];
  const ratePerHour = currentStation?.ratePerHour || 20000;
  
  // Calculate total amount per minute precision
  const totalAmount = isMainBebas
    ? 0
    : Math.max(1, Math.round((ratePerHour / 60) * durationMinutes));

  const formatDurationText = (mins: number) => {
    if (isMainBebas) return 'Main Bebas (Pasca Bayar)';
    if (mins < 60) return `${mins} Menit Paket`;
    if (mins % 60 === 0) return `${mins / 60} Jam Paket`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} Jam ${m} Menit Paket`;
  };

  // Filter VIP Members by search query
  const matchingMembers = vipList.filter((m) =>
    memberSearchQuery.trim()
      ? m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
        m.phone.includes(memberSearchQuery)
      : false
  );

  const handleSelectMember = (member: VIPMember) => {
    setSelectedVip(member);
    setCustomerName(member.name);
    setCustomerPhone(member.phone);
    setMemberSearchQuery('');
    setShowMemberDropdown(false);
  };

  const handleClearSelectedMember = () => {
    setSelectedVip(null);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentMethod === 'QRIS' && !showQrCode && !isMainBebas) {
      setShowQrCode(true);
      return;
    }

    // Show alert card for payment status confirmation (Lunas vs Belum Lunas)
    setShowPaymentAlert(true);
  };

  const handleFinalizeSession = (status: 'Lunas' | 'Belum Lunas') => {
    const finalCustomerName = customerName.trim() || 'Pelanggan Umum';

    onConfirmSession({
      stationId,
      customerName: finalCustomerName,
      customerPhone: customerPhone.trim(),
      vipId: selectedVip?.id,
      durationMinutes: isMainBebas ? 0 : durationMinutes,
      isMainBebas,
      paymentMethod,
      paymentStatus: status,
      amount: totalAmount,
      gamePlaying: '',
      cashierName,
    });
    setShowPaymentAlert(false);
    onClose();
  };

  const handleCloseModal = () => {
    setShowPaymentAlert(false);
    setShowQrCode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">play_circle</span>
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-900">
                {showPaymentAlert ? 'Konfirmasi Status Pembayaran' : 'Sewa Station Baru'}
              </h2>
              <p className="font-label-ts text-xs text-slate-500 font-medium">
                COMMAND CENTER TERMINAL
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {showPaymentAlert ? (
          <div className="p-6 space-y-5 animate-fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0 border border-cyan-200 shadow-2xs">
                <span className="material-symbols-outlined text-2xl">payments</span>
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  Status Pembayaran Pelanggan
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">
                  Apakah transaksi sewa ini sudah dibayar oleh pelanggan atau belum?
                </p>
              </div>
            </div>

            {/* Order Summary Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs font-medium text-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Unit Station:</span>
                <span className="font-bold text-slate-900">{currentStation?.name} ({currentStation?.consoleType})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Pelanggan:</span>
                <span className="font-bold text-cyan-800">{customerName.trim() || 'Pelanggan Umum'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Pola Sesi:</span>
                <span className="font-bold text-slate-800">{formatDurationText(durationMinutes)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Metode Bayar:</span>
                <span className="font-bold text-slate-800">{paymentMethod}</span>
              </div>
              {!isMainBebas && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-extrabold">
                  <span className="text-slate-900">Total Biaya:</span>
                  <span className="text-emerald-700 font-mono-code text-base">Rp {totalAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            {/* Alert Option Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleFinalizeSession('Belum Lunas')}
                className="bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold p-4 rounded-2xl transition-all shadow-2xs hover:shadow-md active:scale-95 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center group"
              >
                <span className="material-symbols-outlined text-amber-600 text-2xl group-hover:scale-110 transition-transform">schedule</span>
                <span className="text-xs font-black uppercase tracking-wide text-amber-900">Belum Lunas</span>
                <span className="text-[10px] text-amber-700 font-semibold">Bayar Nanti / Piutang</span>
              </button>

              <button
                type="button"
                onClick={() => handleFinalizeSession('Lunas')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 font-bold p-4 rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-95 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center group"
              >
                <span className="material-symbols-outlined text-emerald-100 text-2xl group-hover:scale-110 transition-transform">check_circle</span>
                <span className="text-xs font-black uppercase tracking-wide text-white">Sudah Lunas</span>
                <span className="text-[10px] text-emerald-100 font-semibold">Pembayaran Diterima</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowPaymentAlert(false)}
              className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Kembali Ubah Form
            </button>
          </div>
        ) : (

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Station Display:
              - If user clicked "Mulai Timer" from a specific station card, show a locked info-card
                (no confusing re-selection).
              - If opened from topbar (no specific station), show the dropdown picker. */}
          {(() => {
            const lockedStation = selectedStationId
              ? stations.find((s) => s.id === selectedStationId)
              : null;

            if (lockedStation) {
              return (
                <div className="bg-gradient-to-r from-cyan-50 to-cyan-100/60 border-2 border-cyan-300 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-2xl">sports_esports</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-cyan-700 uppercase tracking-wider">
                      Station Terpilih Otomatis
                    </div>
                    <div className="font-extrabold text-base text-slate-900 leading-tight truncate">
                      {lockedStation.name}
                    </div>
                    <div className="text-[11px] text-slate-600 font-medium">
                      {lockedStation.consoleType} • Rp {lockedStation.ratePerHour.toLocaleString('id-ID')}/jam
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 bg-white border border-cyan-300 text-cyan-800 text-[10px] font-bold px-2 py-1 rounded-lg">
                    <span className="material-symbols-outlined text-sm">lock</span>
                    LOCKED
                  </div>
                </div>
              );
            }

            return (
              <div>
                <label className="block font-label-ts text-xs text-slate-600 uppercase mb-1.5 font-bold">
                  Pilih Station Game
                </label>
                <select
                  value={stationId}
                  onChange={(e) => {
                    setStationId(e.target.value);
                    setShowQrCode(false);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {stations.map((st) => (
                    <option
                      key={st.id}
                      value={st.id}
                      disabled={st.status === 'occupied' && st.id !== selectedStationId}
                    >
                      {st.name} ({st.consoleType}) - Rp {st.ratePerHour.toLocaleString('id-ID')}/jam{' '}
                      {st.status === 'occupied' ? '[TERPAKAI]' : '[TERSEDIA]'}
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}

          {/* Customer Name Section (Optional & VIP Member Search) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block font-label-ts text-xs text-slate-600 uppercase font-bold">
                Nama Pelanggan <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              <span className="text-[11px] text-cyan-700 font-bold">
                Cari & Pilih Member VIP
              </span>
            </div>

            {/* Selected Member Badge */}
            {selectedVip ? (
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-2.5 flex justify-between items-center text-xs font-bold text-cyan-900">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-700 text-base">stars</span>
                  <div>
                    <span className="font-extrabold">{selectedVip.name}</span>
                    <span className="ml-2 font-mono text-[10px] bg-cyan-200 text-cyan-900 px-2 py-0.5 rounded-full uppercase">
                      {selectedVip.tier}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelectedMember}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  title="Batalkan pilihan member"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setMemberSearchQuery(e.target.value);
                      setShowMemberDropdown(true);
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    placeholder="Ketik nama / cari member (Kosongkan = Pelanggan Umum)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3.5 pr-9 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <span className="material-symbols-outlined text-slate-400 absolute right-3 top-3 text-lg pointer-events-none">
                    search
                  </span>
                </div>

                {/* VIP Autocomplete Suggestions */}
                {showMemberDropdown && memberSearchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg z-20 overflow-hidden max-h-48 overflow-y-auto">
                    <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Hasil Pencarian Member VIP:
                    </div>
                    {matchingMembers.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center font-medium">
                        Tidak ditemukan member dengan nama "{memberSearchQuery}". Nama akan disimpan sebagai "{customerName}".
                      </div>
                    ) : (
                      matchingMembers.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => handleSelectMember(m)}
                          className="w-full text-left p-2.5 hover:bg-cyan-50 border-b border-slate-50 flex justify-between items-center transition-colors cursor-pointer"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-cyan-600 text-sm">person</span>
                              {m.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              HP: {m.phone || '-'}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                            {m.tier}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}


          </div>

          {/* Duration Selector */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="block font-label-ts text-xs text-slate-600 uppercase font-bold">
                Pilih Durasi / Pola Bermain
              </label>
              {!isMainBebas && (
                <span className="text-[11px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full font-mono">
                  {formatDurationText(durationMinutes)}
                </span>
              )}
            </div>

            {/* Quick Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Special 1-Minute Testing Preset */}
              <button
                type="button"
                onClick={() => {
                  setDurationMinutes(1);
                  setIsCustomDuration(false);
                  setIsMainBebas(false);
                  setShowQrCode(false);
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isMainBebas && !isCustomDuration && durationMinutes === 1
                    ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">timer</span>
                1 Menit (Test)
              </button>

              <button
                type="button"
                onClick={() => {
                  setDurationMinutes(15);
                  setIsCustomDuration(false);
                  setIsMainBebas(false);
                  setShowQrCode(false);
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  !isMainBebas && !isCustomDuration && durationMinutes === 15
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                15 Menit
              </button>

              <button
                type="button"
                onClick={() => {
                  setDurationMinutes(30);
                  setIsCustomDuration(false);
                  setIsMainBebas(false);
                  setShowQrCode(false);
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  !isMainBebas && !isCustomDuration && durationMinutes === 30
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                30 Menit
              </button>

              {[1, 2, 3].map((h) => {
                const targetMins = h * 60;
                return (
                  <button
                    type="button"
                    key={h}
                    onClick={() => {
                      setDurationMinutes(targetMins);
                      setIsCustomDuration(false);
                      setIsMainBebas(false);
                      setShowQrCode(false);
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      !isMainBebas && !isCustomDuration && durationMinutes === targetMins
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {h} Jam
                  </button>
                );
              })}

              {/* Custom Duration Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsCustomDuration(true);
                  setIsMainBebas(false);
                  setShowQrCode(false);
                  const parsed = customUnit === 'jam' ? Math.round((parseFloat(customVal) || 1) * 60) : Math.round(parseFloat(customVal) || 1);
                  setDurationMinutes(Math.max(1, parsed));
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  !isMainBebas && isCustomDuration
                    ? 'bg-cyan-700 text-white border-cyan-700 shadow-md ring-2 ring-cyan-300'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">edit_calendar</span>
                Custom Durasi
              </button>

              {/* Main Bebas */}
              <button
                type="button"
                onClick={() => {
                  setIsMainBebas(true);
                  setIsCustomDuration(false);
                  setShowQrCode(false);
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  isMainBebas
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">all_inclusive</span>
                Main Bebas
              </button>
            </div>

            {/* Custom Duration Input Box */}
            {!isMainBebas && isCustomDuration && (
              <div className="bg-slate-50 border border-cyan-300 p-3 rounded-2xl space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">
                    Masukkan Durasi Custom:
                  </label>
                  <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomUnit('menit');
                        const raw = parseFloat(customVal) || 1;
                        setDurationMinutes(Math.max(1, Math.round(raw)));
                      }}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        customUnit === 'menit' ? 'bg-cyan-700 text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Menit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomUnit('jam');
                        const raw = parseFloat(customVal) || 1;
                        setDurationMinutes(Math.max(1, Math.round(raw * 60)));
                      }}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        customUnit === 'jam' ? 'bg-cyan-700 text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Jam
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step={customUnit === 'menit' ? '1' : '0.5'}
                    value={customVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomVal(val);
                      const raw = parseFloat(val) || 1;
                      const mins = customUnit === 'jam' ? Math.round(raw * 60) : Math.round(raw);
                      setDurationMinutes(Math.max(1, mins));
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-extrabold text-slate-900 focus:outline-none focus:border-cyan-500 font-mono"
                    placeholder={customUnit === 'menit' ? 'Contoh: 1, 10, 45' : 'Contoh: 1.5'}
                  />
                  <span className="text-xs font-bold text-slate-600 shrink-0 font-mono">
                    {customUnit === 'menit' ? 'Menit' : 'Jam'}
                  </span>
                </div>
              </div>
            )}

            {/* Total Cost & Per-Minute Calculation Badge */}
            {!isMainBebas && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-2.5 flex justify-between items-center text-xs text-cyan-900 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-cyan-700 text-base">payments</span>
                  <span>Total Biaya: <strong className="text-cyan-950 font-extrabold font-mono text-sm">Rp {totalAmount.toLocaleString('id-ID')}</strong></span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  (Rp {Math.round(ratePerHour / 60).toLocaleString('id-ID')}/menit)
                </span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="block font-label-ts text-xs text-slate-600 uppercase mb-1.5 font-bold">
              Metode Pembayaran {isMainBebas ? '(Pasca Bayar)' : ''}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['QRIS', 'Cash', 'Debit'] as PaymentMethod[]).map((pm) => (
                <button
                  type="button"
                  key={pm}
                  onClick={() => {
                    setPaymentMethod(pm);
                    setShowQrCode(false);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === pm
                      ? 'bg-cyan-50 text-cyan-800 border-cyan-500'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
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

          {/* QRIS Display */}
          {paymentMethod === 'QRIS' && showQrCode && !isMainBebas && (
            <div className="bg-slate-50 border border-cyan-300 rounded-2xl p-4 text-center space-y-2 animate-fade-in">
              <div className="text-xs font-label-ts text-cyan-800 font-bold uppercase">PINDAI QRIS UNTUK PEMBAYARAN</div>
              <div className="w-36 h-36 mx-auto bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                <svg className="w-full h-full text-slate-900" viewBox="0 0 100 100">
                  <path
                    fill="currentColor"
                    d="M0,0 h30 v30 h-30 z M5,5 v20 h20 v-20 z M10,10 h10 v10 h-10 z M70,0 h30 v30 h-30 z M75,5 v20 h20 v-20 z M80,10 h10 v10 h-10 z M0,70 h30 v30 h-30 z M5,75 v20 h20 v-20 z M10,80 h10 v10 h-10 z M35,10 h10 v10 h-10 z M50,10 h10 v10 h-10 z M35,35 h30 v10 h-30 z M70,35 h10 v20 h-10 z M85,35 h10 v10 h-10 z M10,35 h15 v15 h-15 z M35,50 h15 v20 h-15 z M55,55 h20 v10 h-20 z M80,60 h10 v20 h-10 z M35,75 h20 v20 h-20 z M60,75 h15 v10 h-15 z M80,85 h15 v15 h-15 z"
                  />
                </svg>
              </div>
              <div className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-base animate-spin">sync</span>
                Menunggu Konfirmasi Pembayaran...
              </div>
            </div>
          )}

          {/* Pricing Summary */}
          {isMainBebas ? (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-1">
              <div className="flex justify-between items-center text-indigo-900 font-extrabold text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-indigo-600 text-base">schedule</span>
                  Pola Main Bebas (Pasca Bayar)
                </span>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono px-2 py-0.5 rounded-full uppercase border border-indigo-200">
                  Per Menit
                </span>
              </div>
              <p className="text-xs text-indigo-700 font-medium leading-relaxed pt-1">
                Total biaya dihitung saat sesi diselesaikan dengan rumus:<br />
                <strong className="font-mono bg-indigo-100/80 px-2 py-0.5 rounded text-indigo-950 font-bold inline-block mt-1">
                  (Jumlah Menit / 60) × Rp {ratePerHour.toLocaleString('id-ID')}
                </strong>
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex justify-between items-center">
              <div>
                <span className="font-label-ts text-xs text-slate-600 font-bold block">
                  TOTAL BAYAR ({formatDurationText(durationMinutes)} × Rp {Math.round(ratePerHour / 60).toLocaleString('id-ID')}/menit)
                </span>
                <span className="text-xs text-emerald-600 font-medium">Aktivasi Timer WebSocket Langsung</span>
              </div>
              <div className="font-mono-code font-extrabold text-xl text-slate-900">
                Rp {totalAmount.toLocaleString('id-ID')}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">check_circle</span>
              {paymentMethod === 'QRIS' && !showQrCode ? 'Tampilkan QRIS' : 'Konfirmasi & Mulai'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};

