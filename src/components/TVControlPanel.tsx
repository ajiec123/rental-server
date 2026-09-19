import React, { useState, useEffect } from 'react';
import { GamingStation } from '../types';
import { StationTvPairing, buildDerivedStationChannel } from '../utils/tvPairing';

import { POSITION_OPTIONS, type BrandingPosition } from './SettingsTab';

/**
 * Generate channel name dari Station ID.
 * Convention: st-01 → ST-01, st-02 → ST-02, dst.
 * (TV receiver subscribe ke channel "tv:<nama>".)
 */
function channelForStation(stationId: string): string {
  return stationId.replace(/^st-/, '').toUpperCase();
}

interface BrandingConfig {
  text: string;
  subtitle: string;
  color: string;
  bg: string;
  enabled: boolean;
  position?: BrandingPosition;
}

export interface TvClaim {
  deviceId: string;
  model: string;
  version: string;
  claimedAt: number;
}

interface TVControlPanelProps {
  station: GamingStation | null;
  isOpen: boolean;
  onClose: () => void;
  onSendCommand: (stationId: string, command: string) => void;
  onSendBranding?: (
    stationId: string,
    payload: { action: 'show' | 'hide' | 'set'; text?: string; subtitle?: string; color?: string; bg?: string }
  ) => void;
  onBroadcastBrandingAll?: (action: 'show' | 'hide' | 'set') => void;
  brandingConfig?: BrandingConfig;
  allStations?: GamingStation[];
  pairings?: StationTvPairing[];
  /** Klaim channel dari TV receiver asli (POST /api/tv/pair saat TV boot). */
  tvClaims?: Record<string, TvClaim>;
  onSavePairing?: (pairing: StationTvPairing) => void;
}

const TV_COMMANDS: Array<{
  command: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}> = [
  {
    command: 'power_on',
    label: 'Nyalakan TV',
    icon: 'power_settings_new',
    color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'TV untuk customer yang baru mulai sewa',
  },
  {
    command: 'power_off',
    label: 'Matikan TV',
    icon: 'power_off',
    color: 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300',
    description: 'TV mati saat sesi berakhir',
  },
  {
    command: 'volume_up',
    label: 'Volume +',
    icon: 'volume_up',
    color: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-300',
    description: 'Perbesar volume TV',
  },
  {
    command: 'volume_down',
    label: 'Volume −',
    icon: 'volume_down',
    color: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-300',
    description: 'Kecilkan volume TV',
  },
  {
    command: 'mute',
    label: 'Mute',
    icon: 'volume_off',
    color: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300',
    description: 'Bisukan TV sementara',
  },
  {
    command: 'unmute',
    label: 'Unmute',
    icon: 'volume_up',
    color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'Aktifkan kembali suara TV',
  },
];

/**
 * ReceiverUrlBox — sebelumnya menampilkan URL web receiver.
 * Sudah dihapus: web receiver sudah tidak dipakai (Owner memilih APK-only).
 */
export const TVControlPanel: React.FC<TVControlPanelProps> = ({
  station,
  isOpen,
  onClose,
  onSendCommand,
  onSendBranding,
  onBroadcastBrandingAll,
  brandingConfig,
  allStations,
  pairings = [],
  tvClaims = {} as Record<string, TvClaim>,
  onSavePairing,
}) => {
  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'commands' | 'branding'>('commands');
  const [brandingText, setBrandingText] = useState<string>(brandingConfig?.text || 'COMMAND CENTER');
  const [brandingSubtitle, setBrandingSubtitle] = useState<string>(brandingConfig?.subtitle || '');
  const [brandingColor, setBrandingColor] = useState<string>(brandingConfig?.color || '#00E5FF');
  const [brandingPosition, setBrandingPosition] = useState<BrandingPosition>(brandingConfig?.position || 'bottom-right');
  const [pairingChannel, setPairingChannel] = useState<string>('');
  const [pairingLabel, setPairingLabel] = useState<string>('');

  // Sync from global config when modal opens
  useEffect(() => {
    if (isOpen && brandingConfig) {
      setBrandingText(brandingConfig.text);
      setBrandingSubtitle(brandingConfig.subtitle);
      setBrandingColor(brandingConfig.color);
      if (brandingConfig.position) setBrandingPosition(brandingConfig.position);
    }
  }, [isOpen, brandingConfig]);

  useEffect(() => {
    if (isOpen && station) {
      const current = pairings.find((p) => p.stationId === station.id);
      setPairingChannel(current?.tvChannel || buildDerivedStationChannel(station));
      setPairingLabel(current?.label || station.name);
    }
  }, [isOpen, station, pairings]);

  if (!isOpen || !station) return null;

  const handleSendBranding = (action: 'show' | 'hide' | 'set') => {
    if (!onSendBranding) return;
    onSendBranding(station.id, {
      action,
      text: brandingText,
      subtitle: brandingSubtitle,
      color: brandingColor,
      position: brandingPosition,
    });
  };

  const handleSend = (command: string) => {
    setBusyCmd(command);
    onSendCommand(station.id, command);
    setTimeout(() => setBusyCmd(null), 800);
  };

  const handleSavePairing = () => {
    if (!station || !onSavePairing) return;
    onSavePairing({
      stationId: station.id,
      tvChannel: pairingChannel.trim() || buildDerivedStationChannel(station),
      label: pairingLabel.trim() || station.name,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-slate-900">Kontrol TV</h2>
              <p className="font-label-ts text-[11px] text-slate-500 font-medium">
                {station.name} · {station.consoleType}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="flex bg-slate-200/80 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setActiveSection('commands')}
              className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeSection === 'commands'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-sm">settings_remote</span>
              Perintah TV
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('branding')}
              className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeSection === 'branding'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-sm">branding_watermark</span>
              Branding Overlay
            </button>
          </div>
        </div>

        {activeSection === 'commands' ? (
          <div className="p-5 space-y-2.5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700">Pairing channel</div>
              <input
                value={pairingChannel}
                onChange={(e) => setPairingChannel(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="tv:PS5PRO_01"
              />
              <input
                value={pairingLabel}
                onChange={(e) => setPairingLabel(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Nama receiver"
              />
              <div className="text-[10px] text-slate-500">Channel default: {buildDerivedStationChannel(station)}</div>
              {Object.keys(tvClaims).length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                    TV terdeteksi (klik untuk pakai channel-nya):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(tvClaims).map(([ch, claim]) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setPairingChannel(ch)}
                        title={`deviceId: ${claim.deviceId} · model: ${claim.model || 'unknown'}`}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          pairingChannel.trim() === ch
                            ? 'bg-cyan-600 text-white border-cyan-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-cyan-500'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[12px] align-[-2px] mr-0.5">tv</span>
                        {ch}
                        {claim.model ? ` · ${claim.model}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleSavePairing}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Simpan pairing ke server
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-medium mb-3 leading-relaxed">
              Kirim perintah ke TV station ini via WebSocket → server.ts → TV adapter
              (HDMI CEC / Smart TV API / MQTT).
            </p>

            {TV_COMMANDS.map((c) => {
              const isBusy = busyCmd === c.command;
              return (
                <button
                  key={c.command}
                  type="button"
                  onClick={() => handleSend(c.command)}
                  disabled={isBusy}
                  className={`w-full border-2 rounded-2xl p-3 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-60 cursor-pointer ${c.color}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shrink-0">
                    <span className={`material-symbols-outlined text-2xl ${
                      isBusy ? 'animate-spin' : ''
                    }`}>
                      {isBusy ? 'progress_activity' : c.icon}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-extrabold text-sm">{c.label}</div>
                    <div className="text-[10px] font-medium opacity-75">
                      {c.description}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-base opacity-50">
                    send
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Tampilkan teks nama rental di <strong>pojok kanan bawah</strong> TV,
              overlay di atas game / app apapun. Butuh permission{' '}
              <code className="font-mono bg-slate-100 px-1 rounded text-[10px]">
                SYSTEM_ALERT_WINDOW
              </code>{' '}
              di TV (Settings → Apps → Special Access).
            </p>

            {/* Preview */}
            <div className="bg-slate-900 rounded-2xl aspect-video relative border-2 border-slate-200 overflow-hidden">
              <div
                className={`absolute m-3 px-4 py-2 rounded-xl ${
                  brandingPosition === 'top-left' ? 'top-0 left-0 text-left' :
                  brandingPosition === 'top-right' ? 'top-0 right-0 text-right' :
                  brandingPosition === 'bottom-left' ? 'bottom-0 left-0 text-left' :
                  'bottom-0 right-0 text-right'
                }`}
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <div
                  className="text-lg font-extrabold leading-tight"
                  style={{ color: brandingColor }}
                >
                  {brandingText || 'Nama Rental'}
                </div>
                {brandingSubtitle && (
                  <div className="text-[11px] text-white opacity-85 leading-tight">
                    {brandingSubtitle}
                  </div>
                )}
              </div>
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                TV Preview
              </span>
            </div>

            {/* Position Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Posisi Overlay
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {POSITION_OPTIONS.map((opt) => {
                  const selected = brandingPosition === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBrandingPosition(opt.value)}
                      title={opt.label}
                      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border-2 transition-all cursor-pointer ${
                        selected
                          ? 'border-cyan-600 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-300/40'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-300 hover:bg-cyan-50/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{opt.icon}</span>
                      <span className="text-[9px] font-bold uppercase tracking-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inputs */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Teks Utama (Nama Rental)
              </label>
              <input
                type="text"
                value={brandingText}
                onChange={(e) => setBrandingText(e.target.value.slice(0, 30))}
                placeholder="Contoh: COMMAND CENTER"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
              <div className="text-[10px] text-slate-400 mt-0.5">{brandingText.length}/30 karakter</div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Subtitle (Opsional)
              </label>
              <input
                type="text"
                value={brandingSubtitle}
                onChange={(e) => setBrandingSubtitle(e.target.value.slice(0, 40))}
                placeholder="Contoh: Station 01 · PS5 Pro"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Warna Teks
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {['#00E5FF', '#FF6B6B', '#FFD93D', '#6BCB77', '#A66CFF', '#FFFFFF'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrandingColor(c)}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${
                      brandingColor === c
                        ? 'border-slate-900 ring-2 ring-cyan-300 scale-110'
                        : 'border-slate-200 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={brandingColor}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-500 ml-1">{brandingColor}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSendBranding('show')}
                disabled={!onSendBranding || !brandingText.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">visibility</span>
                Tampilkan di {station.name}
              </button>
              <button
                type="button"
                onClick={() => handleSendBranding('hide')}
                disabled={!onSendBranding}
                className="bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">visibility_off</span>
                Sembunyikan di {station.name}
              </button>
            </div>

            {/* Broadcast to all stations */}
            {onBroadcastBrandingAll && allStations && allStations.length > 1 && (
              <div className="bg-gradient-to-r from-cyan-50 to-amber-50 border-2 border-cyan-300 rounded-2xl p-3 mt-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-cyan-700 text-sm">broadcast_on_personal</span>
                  <span className="text-[10px] font-extrabold text-cyan-900 uppercase tracking-wider">
                    Terapkan ke {allStations.length} Station Sekaligus
                  </span>
                </div>
                <p className="text-[10px] text-cyan-800 font-medium leading-relaxed mb-2">
                  Owner tinggal set sekali → klik tombol untuk broadcast ke semua TV.
                  Cocok untuk setup harian.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onBroadcastBrandingAll('show')}
                    disabled={!onSendBranding || !brandingText.trim()}
                    className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-[11px] py-2 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">cast</span>
                    Show All
                  </button>
                  <button
                    type="button"
                    onClick={() => onBroadcastBrandingAll('hide')}
                    disabled={!onSendBranding}
                    className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-[11px] py-2 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">cast_for_education</span>
                    Hide All
                  </button>
                </div>
              </div>
            )}

            {!onSendBranding && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-900 font-medium flex items-start gap-1.5">
                <span className="material-symbols-outlined text-amber-700 text-sm shrink-0">
                  warning
                </span>
                <span>TV receiver belum terdaftar di server.ts. Branding tidak akan terkirim.</span>
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-start gap-2 text-[10px] text-slate-600 leading-relaxed">
            <span className="material-symbols-outlined text-cyan-600 text-sm shrink-0">
              tips_and_updates
            </span>
            <span>
              <strong>Mode TV Receiver:</strong> APK Native Android TV
              (lihat <code className="font-mono bg-white px-1 rounded">SETUP_ANDROID_TV.md</code>).
              Channel WebSocket: <code className="font-mono bg-white px-1 rounded">tv:{channelForStation(station.id)}</code>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};