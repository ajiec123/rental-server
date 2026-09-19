import React from 'react';

interface RevenueCardProps {
  dailyAmount: number;
  weeklyAmount: number;
  monthlyAmount: number;
}

export const RevenueCard: React.FC<RevenueCardProps> = ({
  dailyAmount,
  weeklyAmount,
  monthlyAmount,
}) => {
  const formatIDR = (val: number): string => {
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {/* Daily Revenue */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden group transition-all hover:border-cyan-400 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <span className="font-label-ts text-xs text-slate-500 uppercase tracking-wider font-semibold">
            PENDAPATAN HARI INI
          </span>
          <span className="material-symbols-outlined text-emerald-600 text-base">
            trending_up
          </span>
        </div>
        <div className="font-bold text-2xl md:text-3xl text-slate-900 mb-2 font-mono-code">
          {formatIDR(dailyAmount)}
        </div>
        <div className="w-full h-10 bg-slate-50 rounded-lg overflow-hidden relative flex items-end border border-slate-100">
          <svg
            className="w-full h-full text-cyan-500 fill-current opacity-15"
            preserveAspectRatio="none"
            viewBox="0 0 100 30"
          >
            <polygon points="0,30 10,20 20,25 30,15 40,22 50,10 60,18 70,5 80,12 90,2 100,8 100,30" />
          </svg>
          <svg
            className="w-full h-full text-cyan-600 stroke-current absolute inset-x-0 bottom-0"
            fill="none"
            preserveAspectRatio="none"
            strokeWidth="2"
            viewBox="0 0 100 30"
          >
            <polyline points="0,30 10,20 20,25 30,15 40,22 50,10 60,18 70,5 80,12 90,2 100,8" />
          </svg>
        </div>
      </div>

      {/* Weekly Revenue */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden group transition-all hover:border-cyan-400 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <span className="font-label-ts text-xs text-slate-500 uppercase tracking-wider font-semibold">
            PENDAPATAN MINGGU INI
          </span>
          <span className="material-symbols-outlined text-emerald-600 text-base">
            trending_up
          </span>
        </div>
        <div className="font-bold text-2xl md:text-3xl text-slate-900 mb-2 font-mono-code">
          {formatIDR(weeklyAmount)}
        </div>
        <div className="w-full h-10 bg-slate-50 rounded-lg overflow-hidden relative flex items-end border border-slate-100">
          <svg
            className="w-full h-full text-teal-500 fill-current opacity-15"
            preserveAspectRatio="none"
            viewBox="0 0 100 30"
          >
            <polygon points="0,30 10,25 20,20 30,22 40,15 50,18 60,10 70,12 80,5 90,8 100,2 100,30" />
          </svg>
          <svg
            className="w-full h-full text-teal-600 stroke-current absolute inset-x-0 bottom-0"
            fill="none"
            preserveAspectRatio="none"
            strokeWidth="2"
            viewBox="0 0 100 30"
          >
            <polyline points="0,30 10,25 20,20 30,22 40,15 50,18 60,10 70,12 80,5 90,8 100,2" />
          </svg>
        </div>
      </div>

      {/* Monthly Revenue */}
      <div className="bg-gradient-to-br from-cyan-50 to-white border border-cyan-200 rounded-2xl p-5 relative overflow-hidden group shadow-sm transition-all hover:border-cyan-400">
        <div className="flex justify-between items-start mb-3 relative z-10">
          <span className="font-label-ts text-xs text-cyan-800 uppercase tracking-wider font-bold">
            PENDAPATAN BULAN INI
          </span>
          <span className="material-symbols-outlined text-emerald-600 text-base">
            rocket_launch
          </span>
        </div>
        <div className="font-bold text-2xl md:text-3xl text-slate-900 mb-2 relative z-10 font-mono-code">
          {formatIDR(monthlyAmount)}
        </div>
        <div className="w-full h-10 bg-white rounded-lg overflow-hidden relative z-10 flex items-end border border-cyan-100">
          <svg
            className="w-full h-full text-cyan-600 fill-current opacity-20"
            preserveAspectRatio="none"
            viewBox="0 0 100 30"
          >
            <polygon points="0,30 10,28 20,22 30,18 40,15 50,10 60,12 70,8 80,5 90,2 100,0 100,30" />
          </svg>
          <svg
            className="w-full h-full text-cyan-600 stroke-current absolute inset-x-0 bottom-0"
            fill="none"
            preserveAspectRatio="none"
            strokeWidth="2"
            viewBox="0 0 100 30"
          >
            <polyline points="0,30 10,28 20,22 30,18 40,15 50,10 60,12 70,8 80,5 90,2 100,0" />
          </svg>
        </div>
      </div>
    </section>
  );
};

