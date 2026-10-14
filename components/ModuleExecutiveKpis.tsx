import React from 'react';

export interface ModuleExecutiveKpisProps {
  themeColor: 'amber' | 'indigo' | 'sky' | 'rose' | 'emerald' | 'cyan';
  totalSpend: number;
  mtdRevenue: number;
  lastMonthSpend: number;
  lastMonthName: string;
  currentMonthName: string;
  selectedYear: number;
  daysInMonth: number;
  // Optional 4th metric customizer
  fourthCard?: {
    title: string;
    value: string;
    subtext: string;
    icon: string;
  };
  totalQtyAll?: number;
  qtyUnit?: string;
  benchmarkRatioThresholds?: {
    warning: number; // e.g. 2.0%
    danger: number;  // e.g. 4.0%
  };
}

export const ModuleExecutiveKpis: React.FC<ModuleExecutiveKpisProps> = ({
  themeColor,
  totalSpend,
  mtdRevenue,
  lastMonthSpend,
  lastMonthName,
  currentMonthName,
  selectedYear,
  daysInMonth,
  fourthCard,
  totalQtyAll,
  qtyUnit = 'pcs',
  benchmarkRatioThresholds = { warning: 2.0, danger: 4.0 }
}) => {
  // Ratio calculation
  const ratio = mtdRevenue > 0 ? (totalSpend / mtdRevenue) * 100 : 0;
  
  // Variance calculation
  const varianceRp = totalSpend - lastMonthSpend;
  const variancePercent = lastMonthSpend > 0
    ? ((totalSpend - lastMonthSpend) / lastMonthSpend) * 100
    : (totalSpend > 0 ? 100 : 0);

  // Daily Average
  const dailyAverage = Math.round(totalSpend / (daysInMonth || 1));

  // Theme styling
  const colorMap = {
    amber: {
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      bgLight: 'bg-amber-500/10',
      iconBg: 'bg-amber-500/20 text-amber-400',
      gradient: 'from-amber-500/10 to-transparent'
    },
    indigo: {
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      bgLight: 'bg-indigo-500/10',
      iconBg: 'bg-indigo-500/20 text-indigo-400',
      gradient: 'from-indigo-500/10 to-transparent'
    },
    sky: {
      text: 'text-sky-400',
      border: 'border-sky-500/30',
      bgLight: 'bg-sky-500/10',
      iconBg: 'bg-sky-500/20 text-sky-400',
      gradient: 'from-sky-500/10 to-transparent'
    },
    rose: {
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      bgLight: 'bg-rose-500/10',
      iconBg: 'bg-rose-500/20 text-rose-400',
      gradient: 'from-rose-500/10 to-transparent'
    },
    emerald: {
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bgLight: 'bg-emerald-500/10',
      iconBg: 'bg-emerald-500/20 text-emerald-400',
      gradient: 'from-emerald-500/10 to-transparent'
    },
    cyan: {
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgLight: 'bg-cyan-500/10',
      iconBg: 'bg-cyan-500/20 text-cyan-400',
      gradient: 'from-cyan-500/10 to-transparent'
    }
  }[themeColor] || {
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bgLight: 'bg-amber-500/10',
    iconBg: 'bg-amber-500/20 text-amber-400',
    gradient: 'from-amber-500/10 to-transparent'
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CARD 1: TOTAL PENGELUARAN */}
      <div className={`glass-card p-5 bg-slate-900/80 border ${colorMap.border} rounded-2xl relative overflow-hidden shadow-xl`}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pengeluaran Bulan Ini</p>
            <h3 className={`text-2xl font-black ${colorMap.text} mt-1 font-mono`}>
              Rp {Math.round(totalSpend).toLocaleString('id-ID')}
            </h3>
          </div>
          <div className={`w-10 h-10 rounded-xl ${colorMap.iconBg} flex items-center justify-center`}>
            <i className="fas fa-coins text-lg"></i>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-3 pt-2 border-t border-white/5">
          <span className="flex items-center gap-1.5">
            <i className="fas fa-calendar-alt text-slate-400"></i> {currentMonthName} {selectedYear}
          </span>
          <span className="font-mono text-slate-300">
            {daysInMonth} Hari Periode
          </span>
        </div>
      </div>

      {/* CARD 2: RATIO PENGELUARAN VS MTD REVENUE */}
      <div className="glass-card p-5 bg-slate-900/80 border border-purple-500/30 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ratio vs MTD Revenue</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className={`text-2xl font-black font-mono ${
                ratio > benchmarkRatioThresholds.danger ? 'text-rose-400' : ratio > benchmarkRatioThresholds.warning ? 'text-amber-400' : 'text-purple-400'
              }`}>
                {ratio.toFixed(2)}%
              </h3>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                ratio > benchmarkRatioThresholds.danger
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : ratio > benchmarkRatioThresholds.warning
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {ratio > benchmarkRatioThresholds.danger ? 'Perlu Kontrol' : ratio > benchmarkRatioThresholds.warning ? 'Normal' : 'Optimal'}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
            <i className="fas fa-percentage text-lg"></i>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-3 pt-2 border-t border-white/5">
          <span className="truncate">MTD Rev:</span>
          <span className="font-mono font-bold text-purple-300 truncate">
            {mtdRevenue > 0 ? `Rp ${Math.round(mtdRevenue).toLocaleString('id-ID')}` : 'Belum Ada Sales'}
          </span>
        </div>
      </div>

      {/* CARD 3: COMPARE LAST MONTH / VARIANCE */}
      <div className={`glass-card p-5 bg-slate-900/80 border ${
        varianceRp > 0 ? 'border-rose-500/30' : varianceRp < 0 ? 'border-emerald-500/30' : 'border-slate-500/30'
      } rounded-2xl relative overflow-hidden shadow-xl`}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compare Bulan Lalu (Variance)</p>
            <h3 className={`text-2xl font-black mt-1 font-mono flex items-center gap-1.5 ${
              varianceRp > 0 ? 'text-rose-400' : varianceRp < 0 ? 'text-emerald-400' : 'text-slate-300'
            }`}>
              <i className={`fas ${varianceRp > 0 ? 'fa-arrow-trend-up' : varianceRp < 0 ? 'fa-arrow-trend-down' : 'fa-equals'} text-base`}></i>
              <span>{varianceRp >= 0 ? '+' : ''}{Math.round(varianceRp).toLocaleString('id-ID')}</span>
            </h3>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            varianceRp > 0 ? 'bg-rose-500/20 text-rose-400' : varianceRp < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
          }`}>
            <i className="fas fa-scale-balanced text-lg"></i>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-3 pt-2 border-t border-white/5">
          <span className="truncate">{lastMonthName}: Rp {Math.round(lastMonthSpend).toLocaleString('id-ID')}</span>
          <span className={`px-1.5 py-0.2 rounded font-mono font-bold ${
            varianceRp > 0 ? 'text-rose-400' : varianceRp < 0 ? 'text-emerald-400' : 'text-slate-400'
          }`}>
            {variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* CARD 4: RATA-RATA HARIAN / CUSTOM FOURTH */}
      {fourthCard ? (
        <div className="glass-card p-5 bg-slate-900/80 border border-blue-500/30 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{fourthCard.title}</p>
              <h3 className="text-2xl font-black text-blue-400 mt-1 font-mono">{fourthCard.value}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <i className={`fas ${fourthCard.icon} text-lg`}></i>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-500 mt-3 pt-2 border-t border-white/5 flex items-center gap-1.5 truncate">
            <i className="fas fa-info-circle text-blue-400"></i> {fourthCard.subtext}
          </p>
        </div>
      ) : totalQtyAll !== undefined ? (
        <div className="glass-card p-5 bg-slate-900/80 border border-blue-500/30 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Kuantitas (Qty)</p>
              <h3 className="text-2xl font-black text-blue-400 mt-1 font-mono">
                {totalQtyAll.toLocaleString('id-ID')} <span className="text-xs font-sans text-slate-400">{qtyUnit}</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <i className="fas fa-boxes-stacked text-lg"></i>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-3 pt-2 border-t border-white/5">
            <span>Rata-rata/hari:</span>
            <span className="font-mono text-blue-300">Rp {dailyAverage.toLocaleString('id-ID')}</span>
          </div>
        </div>
      ) : (
        <div className="glass-card p-5 bg-slate-900/80 border border-emerald-500/30 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rata-rata Belanja Harian</p>
              <h3 className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                Rp {dailyAverage.toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <i className="fas fa-chart-line text-lg"></i>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-3 pt-2 border-t border-white/5">
            <span>Basis Perhitungan:</span>
            <span className="font-mono text-emerald-300">{daysInMonth} Hari di {currentMonthName}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleExecutiveKpis;
