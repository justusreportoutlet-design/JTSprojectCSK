import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface DateMatrixItemDetail {
  name: string;
  qty?: number;
  unit?: string;
  price?: number;
  amount: number;
  category?: string;
}

export interface DateMatrixDayInfo {
  dateStr: string;       // "2026-08-01"
  dayNum: number;        // 1
  dayNameShort: string;  // "Sab"
  dayNameFull: string;   // "Sabtu"
  isWeekend: boolean;
  spend: number;         // Nominal belanja / transaksi pada tanggal ini
  txCount: number;       // Jumlah transaksi / item pada tanggal ini
  items?: DateMatrixItemDetail[]; // Rincian setiap item yang diinput pada hari ini
}

export interface CategoryVarianceItem {
  key: string;
  label: string;
  currentSpend: number;
  lastMonthSpend: number;
  currentQty?: number;
  lastMonthQty?: number;
  qtyUnit?: string;
  colorClass?: string;
  badgeBg?: string;
}

export interface ModuleDateMatrixSidebarProps {
  themeColor: 'amber' | 'indigo' | 'sky' | 'rose' | 'emerald' | 'cyan' | 'purple' | 'blue';
  moduleTitle: string;
  iconClass: string;
  selectedMonth: number;
  selectedYear: number;
  onSelectMonth: (monthIdx: number) => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  dailyMatrix: DateMatrixDayInfo[];
  currentSpend: number;
  lastMonthSpend: number;
  currentMtdRevenue: number;
  lastMonthMtdRevenue: number;
  monthlyOverviewStats: Record<number, { totalSpend: number; txCount: number }>;
  categoryVariances?: CategoryVarianceItem[];
  itemVariances?: CategoryVarianceItem[];
  itemUnit?: string;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const ModuleDateMatrixSidebar: React.FC<ModuleDateMatrixSidebarProps> = ({
  themeColor,
  moduleTitle,
  iconClass,
  selectedMonth,
  selectedYear,
  onSelectMonth,
  selectedDate,
  onSelectDate,
  dailyMatrix,
  currentSpend,
  lastMonthSpend,
  currentMtdRevenue,
  lastMonthMtdRevenue,
  monthlyOverviewStats,
  categoryVariances = [],
  itemVariances = [],
  itemUnit = 'item'
}) => {
  const [sidebarTab, setSidebarTab] = useState<'MATRIX' | 'VARIANCE' | 'MONTHS'>('MATRIX');
  const [onlyShowWithTx, setOnlyShowWithTx] = useState<boolean>(false);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [varianceMode, setVarianceMode] = useState<'CATEGORY' | 'ITEMS'>('CATEGORY');

  const monthName = MONTH_NAMES[selectedMonth];
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthName = MONTH_NAMES[lastMonthIdx];

  // Variance calculations
  const varianceRp = currentSpend - lastMonthSpend;
  const variancePercent = lastMonthSpend > 0
    ? ((currentSpend - lastMonthSpend) / lastMonthSpend) * 100
    : (currentSpend > 0 ? 100 : 0);
  const isIncrease = varianceRp > 0;

  // Ratio calculations
  const currentRatio = currentMtdRevenue > 0 ? (currentSpend / currentMtdRevenue) * 100 : 0;
  const lastMonthRatio = lastMonthMtdRevenue > 0 ? (lastMonthSpend / lastMonthMtdRevenue) * 100 : 0;
  const ratioDiff = currentRatio - lastMonthRatio;

  // Days with transactions
  const daysWithTransactions = useMemo(() => {
    return dailyMatrix.filter(d => d.spend > 0 || d.txCount > 0 || (d.items && d.items.length > 0));
  }, [dailyMatrix]);

  const filteredDays = useMemo(() => {
    if (onlyShowWithTx) {
      return daysWithTransactions;
    }
    return dailyMatrix;
  }, [dailyMatrix, onlyShowWithTx, daysWithTransactions]);

  const toggleExpandDate = (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation();
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  // Color config map
  const themeClasses = useMemo(() => {
    switch (themeColor) {
      case 'amber':
        return {
          primary: 'text-amber-400',
          bgLight: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          borderActive: 'border-amber-400',
          activeBg: 'bg-gradient-to-r from-amber-500/25 to-orange-500/25',
          glow: 'shadow-amber-500/20',
          pillBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          btnActive: 'bg-amber-600 text-white shadow-amber-500/30'
        };
      case 'indigo':
        return {
          primary: 'text-indigo-400',
          bgLight: 'bg-indigo-500/10',
          border: 'border-indigo-500/30',
          borderActive: 'border-indigo-400',
          activeBg: 'bg-gradient-to-r from-indigo-500/25 to-purple-500/25',
          glow: 'shadow-indigo-500/20',
          pillBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          btnActive: 'bg-indigo-600 text-white shadow-indigo-500/30'
        };
      case 'sky':
      case 'blue':
        return {
          primary: 'text-sky-400',
          bgLight: 'bg-sky-500/10',
          border: 'border-sky-500/30',
          borderActive: 'border-sky-400',
          activeBg: 'bg-gradient-to-r from-sky-500/25 to-blue-500/25',
          glow: 'shadow-sky-500/20',
          pillBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
          btnActive: 'bg-sky-600 text-white shadow-sky-500/30'
        };
      case 'rose':
        return {
          primary: 'text-rose-400',
          bgLight: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          borderActive: 'border-rose-400',
          activeBg: 'bg-gradient-to-r from-rose-500/25 to-pink-500/25',
          glow: 'shadow-rose-500/20',
          pillBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          btnActive: 'bg-rose-600 text-white shadow-rose-500/30'
        };
      case 'purple':
        return {
          primary: 'text-purple-400',
          bgLight: 'bg-purple-500/10',
          border: 'border-purple-500/30',
          borderActive: 'border-purple-400',
          activeBg: 'bg-gradient-to-r from-purple-500/25 to-pink-500/25',
          glow: 'shadow-purple-500/20',
          pillBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          btnActive: 'bg-purple-600 text-white shadow-purple-500/30'
        };
      case 'emerald':
        return {
          primary: 'text-emerald-400',
          bgLight: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          borderActive: 'border-emerald-400',
          activeBg: 'bg-gradient-to-r from-emerald-500/25 to-teal-500/25',
          glow: 'shadow-emerald-500/20',
          pillBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          btnActive: 'bg-emerald-600 text-white shadow-emerald-500/30'
        };
      case 'cyan':
      default:
        return {
          primary: 'text-cyan-400',
          bgLight: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          borderActive: 'border-cyan-400',
          activeBg: 'bg-gradient-to-r from-cyan-500/25 to-teal-500/25',
          glow: 'shadow-cyan-500/20',
          pillBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          btnActive: 'bg-cyan-600 text-white shadow-cyan-500/30'
        };
    }
  }, [themeColor]);

  const activeVarianceList = useMemo(() => {
    if (varianceMode === 'ITEMS' && itemVariances.length > 0) {
      return itemVariances;
    }
    return categoryVariances;
  }, [varianceMode, itemVariances, categoryVariances]);

  return (
    <div className="w-full lg:w-80 xl:w-88 shrink-0 bg-slate-900/95 border border-white/10 rounded-3xl p-4 space-y-4 shadow-2xl lg:sticky lg:top-4 text-slate-200 backdrop-blur-md">
      {/* SIDEBAR HEADER */}
      <div className="border-b border-white/10 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${themeClasses.bgLight} border ${themeClasses.border} flex items-center justify-center ${themeClasses.primary}`}>
              <i className={`fas ${iconClass} text-sm`}></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block leading-none">Sidebar Matrix</span>
              <h3 className="text-xs font-black uppercase text-white tracking-tight leading-snug mt-0.5">{moduleTitle}</h3>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${themeClasses.pillBg}`}>
            {monthName.substring(0, 3)} {selectedYear}
          </span>
        </div>

        {/* NAVIGATION SEGMENTED BUTTONS */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/5 mt-3">
          <button
            type="button"
            onClick={() => setSidebarTab('MATRIX')}
            className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
              sidebarTab === 'MATRIX'
                ? `${themeClasses.btnActive} shadow-sm`
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Matrix Tanggal & Item Harian"
          >
            <i className="fas fa-calendar-day text-[10px]"></i>
            <span>Matrix Tgl</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('VARIANCE')}
            className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
              sidebarTab === 'VARIANCE'
                ? `${themeClasses.btnActive} shadow-sm`
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Compare Bulan Lalu & Variance Qty/Nominal"
          >
            <i className="fas fa-chart-line text-[10px]"></i>
            <span>Compare LM</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('MONTHS')}
            className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
              sidebarTab === 'MONTHS'
                ? `${themeClasses.btnActive} shadow-sm`
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Rekap 12 Bulan Sepanjang Tahun"
          >
            <i className="fas fa-calendar-alt text-[10px]"></i>
            <span>12 Bulan</span>
          </button>
        </div>
      </div>

      {/* QUICK SUMMARY METRICS PILL */}
      <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Total Periode Ini:</span>
          <span className={`font-mono font-black ${themeClasses.primary}`}>
            Rp {currentSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/5">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Ratio vs MTD Rev:</span>
          <div className="flex items-center gap-1.5">
            <span className={`font-mono font-black ${currentRatio > 4 ? 'text-rose-400' : currentRatio > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {currentRatio.toFixed(2)}%
            </span>
            <span className="text-[8px] font-bold text-slate-500 uppercase">
              ({currentMtdRevenue > 0 ? `Rev Rp ${(currentMtdRevenue / 1000000).toFixed(0)}M` : 'No Rev'})
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/5">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Variance vs LM:</span>
          <span className={`font-mono font-black text-[10px] flex items-center gap-1 ${
            varianceRp > 0 ? 'text-rose-400' : varianceRp < 0 ? 'text-emerald-400' : 'text-slate-400'
          }`}>
            <i className={`fas ${varianceRp > 0 ? 'fa-arrow-up' : varianceRp < 0 ? 'fa-arrow-down' : 'fa-minus'} text-[9px]`}></i>
            {varianceRp >= 0 ? '+' : ''}{varianceRp.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            <span className="text-[9px]">({variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%)</span>
          </span>
        </div>
      </div>

      {/* TAB 1: MATRIX TANGGAL WITH ITEM-LEVEL BREAKDOWN */}
      {sidebarTab === 'MATRIX' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Matrix Tanggal & Item ({monthName})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOnlyShowWithTx(!onlyShowWithTx)}
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                onlyShowWithTx
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {onlyShowWithTx ? `Ada Input (${daysWithTransactions.length})` : `Semua (${dailyMatrix.length})`}
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto custom-scrollbar pr-1 space-y-2">
            {filteredDays.length === 0 ? (
              <div className="text-center py-8 bg-slate-950/40 rounded-2xl border border-white/5 p-4">
                <i className="fas fa-inbox text-slate-600 text-2xl mb-2"></i>
                <p className="text-xs font-bold text-slate-400">Belum ada data input di bulan ini.</p>
                <button
                  type="button"
                  onClick={() => setOnlyShowWithTx(false)}
                  className="mt-2 text-[10px] text-amber-400 underline font-bold"
                >
                  Tampilkan semua tanggal
                </button>
              </div>
            ) : (
              filteredDays.map((d) => {
                const isSelected = selectedDate === d.dateStr;
                const hasSpend = d.spend > 0;
                const hasItems = d.items && d.items.length > 0;
                const isExpanded = expandedDates[d.dateStr] ?? isSelected;

                return (
                  <div
                    key={d.dateStr}
                    onClick={() => onSelectDate(d.dateStr)}
                    className={`w-full rounded-2xl transition-all border p-2.5 cursor-pointer ${
                      isSelected
                        ? `${themeClasses.activeBg} ${themeClasses.borderActive} shadow-lg text-white ring-1 ring-white/20`
                        : hasSpend || hasItems
                        ? 'bg-slate-950/70 hover:bg-white/5 border-white/10 text-slate-200'
                        : 'bg-slate-950/30 hover:bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {/* Top Row: Date Box, Info, Total, Item Count */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Day Box */}
                        <div className={`w-8 h-8 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                          isSelected
                            ? `${themeClasses.bgLight} ${themeClasses.borderActive} text-white font-black`
                            : hasSpend || hasItems
                            ? `${themeClasses.bgLight} ${themeClasses.border} ${themeClasses.primary} font-bold`
                            : 'bg-slate-900 border-white/5 text-slate-500'
                        }`}>
                          <span className="text-[8px] font-bold uppercase leading-none opacity-80">{d.dayNameShort}</span>
                          <span className="text-xs font-black font-mono leading-none mt-0.5">{String(d.dayNum).padStart(2, '0')}</span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : hasSpend ? 'text-slate-200' : 'text-slate-400'}`}>
                              Tgl {String(d.dayNum).padStart(2, '0')} {d.dayNameShort}
                            </span>
                            {d.isWeekend && (
                              <span className="text-[8px] font-bold px-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">W</span>
                            )}
                          </div>
                          <span className={`text-[10px] font-mono block mt-0.5 font-black truncate ${
                            hasSpend ? themeClasses.primary : 'text-slate-600'
                          }`}>
                            {hasSpend ? `Rp ${d.spend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '-'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {(hasItems || d.txCount > 0) ? (
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold block border ${
                            isSelected
                              ? 'bg-white/20 text-white border-white/30'
                              : 'bg-white/5 text-slate-300 border-white/10'
                          }`}>
                            {hasItems ? d.items!.length : d.txCount} {itemUnit}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-700 font-mono">0</span>
                        )}

                        {hasItems && (
                          <button
                            type="button"
                            onClick={(e) => toggleExpandDate(e, d.dateStr)}
                            className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-400 hover:text-white transition-all text-[9px]"
                            title="Buka/Tutup Rincian Item"
                          >
                            <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* EXPANDABLE LIST OF ITEMS INPUT ON THIS DATE */}
                    {hasItems && isExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-400">
                          <span>Daftar Item Diinput ({d.items!.length}):</span>
                          <span>Jumlah & Nominal</span>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                          {d.items!.map((it, itemIdx) => (
                            <div
                              key={itemIdx}
                              className="flex items-center justify-between text-[10px] bg-slate-900/90 hover:bg-slate-800/90 px-2 py-1.5 rounded-lg border border-white/5 transition-all"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="text-white font-bold block truncate">{it.name}</span>
                                {it.category && (
                                  <span className="text-[8px] text-slate-400 font-bold uppercase block truncate">
                                    {it.category}
                                  </span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                {it.qty !== undefined && it.qty > 0 && (
                                  <span className="text-slate-300 font-mono font-bold text-[9px] block">
                                    {it.qty} {it.unit || 'pcs'}
                                  </span>
                                )}
                                <span className={`font-mono font-bold text-[9px] block ${themeClasses.primary}`}>
                                  Rp {it.amount.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPARE LAST MONTH / VARIANCE WITH ITEM & CATEGORY QUANTITY */}
      {sidebarTab === 'VARIANCE' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Analisis Variance vs Bulan Lalu
            </span>
            <span className="text-[9px] font-mono text-slate-500">
              {lastMonthName.substring(0, 3)} ➔ {monthName.substring(0, 3)}
            </span>
          </div>

          {/* SIDE-BY-SIDE MONTHLY COMPARISON CARD */}
          <div className="bg-slate-950/70 p-3 rounded-2xl border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-white/5">
                <span className="text-[8px] font-black uppercase text-slate-400 block tracking-widest">
                  Bulan Ini ({monthName.substring(0, 3)})
                </span>
                <span className={`text-xs font-black font-mono mt-1 block ${themeClasses.primary}`}>
                  Rp {currentSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">
                  Ratio: <strong className="text-slate-300">{currentRatio.toFixed(2)}%</strong>
                </span>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-white/5">
                <span className="text-[8px] font-black uppercase text-slate-400 block tracking-widest">
                  Bulan Lalu ({lastMonthName.substring(0, 3)})
                </span>
                <span className="text-xs font-black font-mono mt-1 block text-slate-300">
                  Rp {lastMonthSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">
                  Ratio: <strong className="text-slate-300">{lastMonthRatio.toFixed(2)}%</strong>
                </span>
              </div>
            </div>

            {/* VARIANCE RESULT HIGHLIGHT */}
            <div className={`p-3 rounded-xl border ${
              varianceRp > 0
                ? 'bg-rose-500/10 border-rose-500/30'
                : varianceRp < 0
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-slate-900 border-white/10'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">
                    Selisih / Variance
                  </span>
                  <div className={`text-sm font-black font-mono mt-0.5 flex items-center gap-1 ${
                    varianceRp > 0 ? 'text-rose-400' : varianceRp < 0 ? 'text-emerald-400' : 'text-slate-300'
                  }`}>
                    <i className={`fas ${varianceRp > 0 ? 'fa-arrow-trend-up' : varianceRp < 0 ? 'fa-arrow-trend-down' : 'fa-equals'}`}></i>
                    <span>{varianceRp >= 0 ? '+' : ''}Rp {varianceRp.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-xl text-center font-mono font-black text-xs border ${
                  varianceRp > 0
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : varianceRp < 0
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}>
                  {variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%
                </div>
              </div>

              <p className="text-[9px] font-bold mt-2 text-slate-400 flex items-center gap-1.5">
                <i className={`fas ${varianceRp > 0 ? 'fa-exclamation-triangle text-rose-400' : varianceRp < 0 ? 'fa-check-circle text-emerald-400' : 'fa-info-circle text-slate-400'}`}></i>
                {varianceRp > 0
                  ? `Pengeluaran naik Rp ${varianceRp.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} dibanding ${lastMonthName}.`
                  : varianceRp < 0
                  ? `Efisiensi! Pengeluaran hemat Rp ${Math.round(Math.abs(varianceRp)).toLocaleString('id-ID')} vs ${lastMonthName}.`
                  : `Pengeluaran stabil dan sama persis dengan ${lastMonthName}.`}
              </p>
            </div>

            {/* RATIO COMPARISON BOX */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Pergeseran Ratio:</span>
                <span className={`font-mono font-black ${ratioDiff > 0 ? 'text-rose-400' : ratioDiff < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {ratioDiff >= 0 ? '+' : ''}{ratioDiff.toFixed(2)}% pts
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full mt-1.5 overflow-hidden flex">
                <div 
                  className={`h-full ${currentRatio > 4 ? 'bg-rose-500' : currentRatio > 2 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${Math.min(currentRatio * 15, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* TOGGLE SUB-VIEW FOR VARIANCE: CATEGORIES VS ITEMS */}
          {itemVariances.length > 0 && categoryVariances.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setVarianceMode('CATEGORY')}
                className={`flex-1 py-1 text-center rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  varianceMode === 'CATEGORY' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Kategori ({categoryVariances.length})
              </button>
              <button
                type="button"
                onClick={() => setVarianceMode('ITEMS')}
                className={`flex-1 py-1 text-center rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  varianceMode === 'ITEMS' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Item ({itemVariances.length})
              </button>
            </div>
          )}

          {/* ITEM / CATEGORY BREAKDOWN WITH DETAILED QUANTITY COMPARISON */}
          {activeVarianceList.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">
                {varianceMode === 'ITEMS' ? 'Compare Volume & Nominal Per Item:' : 'Variance Rincian Kategori & Jumlah Input:'}
              </span>
              <div className="max-h-[260px] overflow-y-auto custom-scrollbar pr-1 space-y-1.5">
                {activeVarianceList.map(c => {
                  const catDiff = c.currentSpend - c.lastMonthSpend;
                  const catPct = c.lastMonthSpend > 0
                    ? ((c.currentSpend - c.lastMonthSpend) / c.lastMonthSpend) * 100
                    : (c.currentSpend > 0 ? 100 : 0);

                  const curQty = c.currentQty ?? 0;
                  const lastQty = c.lastMonthQty ?? 0;
                  const qtyDiff = curQty - lastQty;
                  const unit = c.qtyUnit || 'pcs';

                  return (
                    <div key={c.key} className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-white block truncate">{c.label}</span>
                        <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded border shrink-0 ${
                          catDiff > 0
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : catDiff < 0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 border-white/10'
                        }`}>
                          {catDiff >= 0 ? '+' : ''}{catPct.toFixed(0)}%
                        </span>
                      </div>

                      {/* QUANTITY COMPARISON ROW */}
                      {(curQty > 0 || lastQty > 0) && (
                        <div className="flex items-center justify-between text-[9px] bg-slate-900/60 px-2 py-1 rounded-lg border border-white/5 font-mono">
                          <span className="text-slate-400 font-bold uppercase text-[8px]">Jumlah:</span>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-white font-bold">{curQty} {unit}</span>
                            <span className="text-slate-600">vs</span>
                            <span className="text-slate-400">{lastQty} {unit}</span>
                            <span className={`font-bold ${qtyDiff > 0 ? 'text-rose-400' : qtyDiff < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                              ({qtyDiff >= 0 ? '+' : ''}{qtyDiff})
                            </span>
                          </div>
                        </div>
                      )}

                      {/* SPEND COMPARISON ROW */}
                      <div className="flex items-center justify-between text-[9px] pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-300 font-bold">
                            Rp {c.currentSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[8px] text-slate-600">vs</span>
                          <span className="font-mono text-slate-500">
                            Rp {c.lastMonthSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <span className={`font-mono font-bold text-[9px] ${catDiff > 0 ? 'text-rose-400' : catDiff < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {catDiff >= 0 ? '+' : ''}Rp {catDiff.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REKAP 12 BULAN */}
      {sidebarTab === 'MONTHS' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Rekap 12 Bulan ({selectedYear})
            </span>
            <span className="text-[9px] font-mono text-slate-500">Pilih Bulan</span>
          </div>

          <div className="max-h-[480px] overflow-y-auto custom-scrollbar pr-1 space-y-1.5">
            {MONTH_NAMES.map((name, idx) => {
              const stats = monthlyOverviewStats[idx] || { totalSpend: 0, txCount: 0 };
              const isActive = selectedMonth === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectMonth(idx)}
                  className={`w-full text-left p-2.5 rounded-2xl transition-all border flex items-center justify-between gap-2 cursor-pointer ${
                    isActive
                      ? `${themeClasses.activeBg} ${themeClasses.borderActive} text-white shadow-md ring-1 ring-white/20`
                      : 'bg-slate-950/40 hover:bg-white/5 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isActive
                          ? 'bg-white shadow-sm'
                          : stats.totalSpend > 0
                          ? themeClasses.primary.replace('text-', 'bg-')
                          : 'bg-slate-600'
                      }`}></span>
                      <span className={`text-xs font-bold truncate ${isActive ? 'text-white font-black' : ''}`}>{name}</span>
                    </div>
                    <span className={`text-[10px] font-mono block mt-0.5 font-bold truncate ${
                      isActive ? 'text-white' : stats.totalSpend > 0 ? themeClasses.primary : 'text-slate-600'
                    }`}>
                      {stats.totalSpend > 0 ? `Rp ${stats.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '-'}
                    </span>
                  </div>
                  {stats.txCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-[9px] font-mono text-slate-300 shrink-0 font-bold">
                      {stats.txCount} {itemUnit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleDateMatrixSidebar;
