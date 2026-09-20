import React, { useState, useEffect } from 'react';
import { GamingStation } from '../types';
import { StationTvPairing, buildDerivedStationChannel } from '../utils/tvPairing';

/**
 * Generate channel name dari Station ID.
 * Convention: st-01 → ST-01, st-02 → ST-02, dst.
 * (TV receiver subscribe ke channel "tv:<nama>".)
 */
function channelForStation(stationId: string): string {
  return stationId.replace(/^st-/, '').toUpperCase();
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
];

export const TVControlPanel: React.FC<TVControlPanelProps> = ({
  station,
  isOpen,
  onClose,
  onSendCommand,
  pairings = [],
  tvClaims = {} as Record<string, TvClaim>,
  onSavePairing,
}) => {
  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [pairingChannel, setPairingChannel] = useState<string>('');
  const [pairingLabel, setPairingLabel] = useState<string>('');

  useEffect(() => {
    if (isOpen && station) {
      const current = pairings.find((p) => p.stationId === station.id);
      setPairingChannel(current?.tvChannel || buildDerivedStationChannel(station));
      setPairingLabel(current?.label || station.name);
    }
  }, [isOpen, station, pairings]);

  if (!isOpen || !station) return null;

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
                  TV terdeteksi ({Object.keys(tvClaims).length} · klik untuk pakai channel-nya):
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
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
            Kirim perintah ke TV station ini via WebSocket → server.ts → TV adapter.
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

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-start gap-2 text-[10px] text-slate-600 leading-relaxed">
            <span className="material-symbols-outlined text-cyan-600 text-sm shrink-0">
              tips_and_updates
            </span>
            <span>
              <strong>Mode TV Receiver:</strong> APK Native Android TV.
              Channel WebSocket: <code className="font-mono bg-white px-1 rounded">tv:{channelForStation(station.id)}</code>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
