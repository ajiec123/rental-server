import React from 'react';
import { TabType, FeaturePermission } from '../types';

interface BottomNavBarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  hasPermission: (feature: FeaturePermission) => boolean;
  onRestrictedClick: (label: string) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  setActiveTab,
  hasPermission,
  onRestrictedClick,
}) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: 'dashboard' },
    { id: 'units', label: 'UNITS', icon: 'gamepad' },
    { id: 'absensi', label: 'ABSENSI', icon: 'event_available' },
    { id: 'history', label: 'RIWAYAT', icon: 'receipt_long' },
    { id: 'users', label: 'STAF & VIP', icon: 'group' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-white/90 border-t border-slate-200 shadow-lg px-3 pb-4 pt-2 flex justify-around items-center max-w-container-max-width mx-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const permitted = hasPermission(tab.id);

        return (
          <button
            key={tab.id}
            onClick={() => {
              if (permitted) {
                setActiveTab(tab.id);
              } else {
                onRestrictedClick(tab.label);
              }
            }}
            className={`flex flex-col items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer rounded-xl px-3 sm:px-5 py-1.5 relative ${
              isActive
                ? 'text-cyan-700 bg-cyan-50 font-bold border border-cyan-200/80 shadow-sm'
                : permitted
                ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                : 'text-slate-300 opacity-60 hover:opacity-100'
            }`}
          >
            {!permitted && (
              <span className="absolute -top-1 -right-1 text-[10px] bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-xs">
                🔒
              </span>
            )}
            <span
              className="material-symbols-outlined mb-0.5 text-2xl"
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="font-label-ts uppercase tracking-wider text-[10px]">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};


