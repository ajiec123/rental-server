import React from 'react';
import { TabType, UserAccount, FeaturePermission } from '../types';
import { Avatar } from './Avatar';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onOpenNewSession?: () => void;
  occupiedCount: number;
  totalCount: number;
  isWsConnected?: boolean;
  currentUser: UserAccount;
  onOpenLoginModal: () => void;
  onOpenPermissionManager: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  hasPermission: (feature: FeaturePermission) => boolean;
}

export const Header: React.FC<HeaderProps> = ({
  setActiveTab,
  onOpenNewSession,
  occupiedCount,
  totalCount,
  isWsConnected = true,
  currentUser,
  onOpenLoginModal,
  onOpenPermissionManager,
  onOpenProfile,
  onLogout,
  hasPermission,
}) => {
  return (
    <header className="w-full sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between text-slate-800 shadow-sm">
      <div className="flex items-center gap-3 md:gap-4">
        {/* Cashier / Owner avatar & Role switcher trigger */}
        <div className="relative group cursor-pointer" onClick={onOpenLoginModal} title="Klik untuk Ganti Akun / Peran">
          <Avatar
            name={currentUser.name}
            size="md"
            className="group-hover:opacity-90 transition-all"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${
              currentUser.role === 'Owner' ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          ></span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold tracking-tight text-slate-900 text-lg sm:text-2xl leading-none flex items-center gap-2">
              COMMAND CENTER
            </h1>
            <button
              onClick={onOpenLoginModal}
              className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold tracking-wider uppercase border cursor-pointer transition-all ${
                currentUser.role === 'Owner'
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
              }`}
            >
              {currentUser.role}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-label-ts text-[10px] text-slate-600 font-bold hidden sm:inline-block">
              {currentUser.name}
            </span>
            <span className="font-label-ts text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 font-medium">
              {occupiedCount}/{totalCount} AKTIF
            </span>

            {/* WebSocket Timer Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                isWsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <span>{isWsConnected ? 'WebSocket Live' : 'WS Connecting...'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Owner Permission Manager Button */}
        {currentUser.role === 'Owner' && (
          <button
            onClick={onOpenPermissionManager}
            title="Kelola Hak Akses Fitur Karyawan"
            className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 p-2 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">shield</span>
          </button>
        )}

        {/* Profile Settings Button (semua user) */}
        <button
          onClick={onOpenProfile}
          title="Pengaturan Profil (Nama, Email, PIN)"
          className="bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 p-2 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl">manage_accounts</span>
        </button>

        {/* Settings button */}
        {hasPermission('settings') ? (
          <button
            onClick={() => setActiveTab('settings')}
            title="Terminal Settings"
            className="hover:bg-slate-100 text-slate-600 transition-colors rounded-full p-2 active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        ) : (
          <button
            disabled
            title="Dibatasi oleh Owner"
            className="text-slate-300 rounded-full p-2 cursor-not-allowed"
          >
            <span className="material-symbols-outlined">lock</span>
          </button>
        )}

        {/* Switch Account Button */}
        <button
          onClick={onOpenLoginModal}
          title="Switch Role / Ganti Akun"
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer hidden md:flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">swap_horiz</span>
          <span>Ganti Role</span>
        </button>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          title="Logout dari sesi saat ini"
          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 p-2 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
        </button>
      </div>
    </header>
  );
};


