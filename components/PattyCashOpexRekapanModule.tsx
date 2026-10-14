import React, { useState, useMemo } from 'react';
import { AppState } from '../types';
import { MONTHS } from '../constants';
import ShareActions from './ShareActions';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, any>;
  filters: { startDate: string; month: number; year: number; outlet: string };
  selectedOutlet: string;
  onUpdate?: (field: keyof AppState, value: any) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DAYS_INDONESIAN = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const PattyCashOpexRekapanModule: React.FC<Props> = ({ data, allMonthlyData, filters, selectedOutlet, onUpdate, showToast }) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(filters.month ?? new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(filters.year ?? new Date().getFullYear());

  // Date range filter state (e.g. Tanggal 1 to Tanggal 7)
  const [startDay, setStartDay] = useState<number>(1);
  const [endDay, setEndDay] = useState<number>(7);

  // Month prefixes
  const currentMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const lastMonthIndex = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthPrefix = `${lastMonthYear}-${String(lastMonthIndex + 1).padStart(2, '0')}`;

  // Get state for current selected month & last month
  const currentMonthState = useMemo(() => {
    if (selectedMonth === filters.month && selectedYear === filters.year) {
      return data;
    }
    return allMonthlyData?.[selectedMonth.toString()] || {};
  }, [selectedMonth, selectedYear, filters.month, filters.year, data, allMonthlyData]);

  const lastMonthState = useMemo(() => {
    return allMonthlyData?.[lastMonthIndex.toString()] || {};
  }, [lastMonthIndex, allMonthlyData]);

  const daysInCurrentMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const daysInLastMonth = useMemo(() => {
    return new Date(lastMonthYear, lastMonthIndex + 1, 0).getDate();
  }, [lastMonthYear, lastMonthIndex]);

  // Resolve Category Budgets
  const categoryBudgets = useMemo(() => {
    const monthlyState = currentMonthState.monthlyExpenseCategoryBudgets?.[currentMonthPrefix];
    if (monthlyState) return monthlyState;

    if (currentMonthState.expenseCategoryBudgets) return currentMonthState.expenseCategoryBudgets;

    const savedLocal = localStorage.getItem(`EXPENSE_CATEGORY_BUDGETS_${currentMonthPrefix}`);
    if (savedLocal) {
      try { return JSON.parse(savedLocal); } catch (e) { /* ignore */ }
    }

    const savedGlobal = localStorage.getItem('EXPENSE_CATEGORY_BUDGETS');
    if (savedGlobal) {
      try { return JSON.parse(savedGlobal); } catch (e) { /* ignore */ }
    }

    return {
      commodity: 0,
      nonCommodity: 0,
      chemical: 0,
      maintenance: 0,
      atk: 0,
      asset: 0,
    };
  }, [currentMonthState, currentMonthPrefix]);

  const [isEditingBudgets, setIsEditingBudgets] = useState(false);
  const [tempCategoryBudgets, setTempCategoryBudgets] = useState({
    commodity: String(categoryBudgets.commodity || 0),
    nonCommodity: String(categoryBudgets.nonCommodity || 0),
    chemical: String(categoryBudgets.chemical || 0),
    maintenance: String(categoryBudgets.maintenance || 0),
    atk: String(categoryBudgets.atk || 0),
    asset: String(categoryBudgets.asset || 0),
  });

  const handleSaveBudgets = () => {
    const updated = {
      commodity: Math.max(0, parseFloat(tempCategoryBudgets.commodity) || 0),
      nonCommodity: Math.max(0, parseFloat(tempCategoryBudgets.nonCommodity) || 0),
      chemical: Math.max(0, parseFloat(tempCategoryBudgets.chemical) || 0),
      maintenance: Math.max(0, parseFloat(tempCategoryBudgets.maintenance) || 0),
      atk: Math.max(0, parseFloat(tempCategoryBudgets.atk) || 0),
      asset: Math.max(0, parseFloat(tempCategoryBudgets.asset) || 0),
    };

    if (onUpdate) {
      const newMonthlyMap = {
        ...(currentMonthState.monthlyExpenseCategoryBudgets || {}),
        [currentMonthPrefix]: updated,
      };
      onUpdate('monthlyExpenseCategoryBudgets', newMonthlyMap);
      onUpdate('expenseCategoryBudgets', updated);
    }

    localStorage.setItem(`EXPENSE_CATEGORY_BUDGETS_${currentMonthPrefix}`, JSON.stringify(updated));
    localStorage.setItem('EXPENSE_CATEGORY_BUDGETS', JSON.stringify(updated));

    setIsEditingBudgets(false);
    showToast?.(`Budget Kategori Expense untuk ${MONTHS[selectedMonth]} ${selectedYear} berhasil disimpan!`, 'success');
  };

  // Helper to compute OPEX stats for a single date
  const getDayOpexStats = (dateStr: string, st: any) => {
    const exp = (st.expenses?.[dateStr] || {}) as any;
    if (selectedOutlet && exp.outlet && exp.outlet !== selectedOutlet) {
      return {
        totalExpense: 0,
        nonCommodity: 0,
        commodity: 0,
        cash: 0,
        maintenance: 0,
        asset: 0,
        casual: 0,
        atk: 0,
      };
    }

    const nonCommodity = exp.nonCommodity || 0;
    const commodity = exp.commodity || 0;
    const cash = exp.cash || 0;
    const maintenance = exp.maintenance || 0;
    const asset = exp.asset || 0;
    const casual = exp.casual || 0;
    const atk = exp.atk || 0;

    const sumExp = nonCommodity + commodity + cash + maintenance + asset + casual + atk;

    // Ledgers check
    const ledgerKeys = [
      'dailyNonCommodityLedger', 'dailyCommodityLedger', 'dailyCashLedger',
      'dailyMaintenanceLedger', 'dailyAssetLedger', 'dailyCasualLedger',
      'dailyAtkLedger'
    ];

    let ledgerSum = 0;
    ledgerKeys.forEach((key) => {
      const items = st[key]?.[dateStr] || [];
      items.forEach((item: any) => {
        if (!selectedOutlet || !item.outlet || item.outlet === selectedOutlet) {
          ledgerSum += (item.price || 0) * (item.qty || 1);
        }
      });
    });

    const totalExpense = Math.max(sumExp, ledgerSum);

    return {
      totalExpense,
      nonCommodity,
      commodity,
      cash,
      maintenance,
      asset,
      casual,
      atk,
    };
  };

  // Helper to compute range OPEX stats
  const getRangeOpexStats = (st: any, monthPrefix: string, startD: number, endD: number) => {
    let total = 0;
    let nonComm = 0;
    let comm = 0;
    let cashSum = 0;
    let maint = 0;
    let ast = 0;
    let cas = 0;
    let atkSum = 0;
    let chemSum = 0;

    for (let d = startD; d <= endD; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const stats = getDayOpexStats(dateStr, st);
      total += stats.totalExpense;
      nonComm += stats.nonCommodity;
      comm += stats.commodity;
      cashSum += stats.cash;
      maint += stats.maintenance;
      ast += stats.asset;
      cas += stats.casual;
      atkSum += stats.atk;

      // Chemical check from ledger or exp
      let dayChem = 0;
      const chemItems = st.dailyChemicalLedger?.[dateStr] || [];
      chemItems.forEach((item: any) => {
        if (!selectedOutlet || !item.outlet || item.outlet === selectedOutlet) {
          dayChem += (item.price || 0) * (item.qty || 1);
        }
      });
      const exp = (st.expenses?.[dateStr] || {}) as any;
      chemSum += Math.max(exp.chemical || 0, dayChem);
    }

    return {
      totalExpense: total,
      nonCommodity: nonComm,
      commodity: comm,
      chemical: chemSum,
      cash: cashSum,
      maintenance: maint,
      asset: ast,
      casual: cas,
      atk: atkSum,
    };
  };

  // MTD / Cut-Off Totals for Current Month & Last Month
  const currentMTDStats = useMemo(() => {
    return getRangeOpexStats(currentMonthState, currentMonthPrefix, 1, daysInCurrentMonth);
  }, [currentMonthState, currentMonthPrefix, daysInCurrentMonth]);

  const lastMonthTotalStats = useMemo(() => {
    return getRangeOpexStats(lastMonthState, lastMonthPrefix, 1, daysInLastMonth);
  }, [lastMonthState, lastMonthPrefix, daysInLastMonth]);

  const categoryBudgetList = useMemo(() => {
    return [
      {
        key: 'commodity',
        name: 'COMMODITY',
        budget: categoryBudgets.commodity || 0,
        spent: currentMTDStats.commodity || 0,
        icon: 'fa-box',
        color: 'text-emerald-400',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        barColor: 'bg-emerald-500',
      },
      {
        key: 'nonCommodity',
        name: 'NON COMMODITY',
        budget: categoryBudgets.nonCommodity || 0,
        spent: currentMTDStats.nonCommodity || 0,
        icon: 'fa-boxes-packing',
        color: 'text-blue-400',
        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        barColor: 'bg-blue-500',
      },
      {
        key: 'chemical',
        name: 'CHEMICAL',
        budget: categoryBudgets.chemical || 0,
        spent: currentMTDStats.chemical || 0,
        icon: 'fa-flask',
        color: 'text-teal-400',
        badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        barColor: 'bg-teal-500',
      },
      {
        key: 'maintenance',
        name: 'MAINTENANCE',
        budget: categoryBudgets.maintenance || 0,
        spent: currentMTDStats.maintenance || 0,
        icon: 'fa-tools',
        color: 'text-red-400',
        badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
        barColor: 'bg-red-500',
      },
      {
        key: 'atk',
        name: 'ATK',
        budget: categoryBudgets.atk || 0,
        spent: currentMTDStats.atk || 0,
        icon: 'fa-pencil-ruler',
        color: 'text-pink-400',
        badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        barColor: 'bg-pink-500',
      },
      {
        key: 'asset',
        name: 'ASSET',
        budget: categoryBudgets.asset || 0,
        spent: currentMTDStats.asset || 0,
        icon: 'fa-couch',
        color: 'text-amber-400',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        barColor: 'bg-amber-500',
      },
    ];
  }, [categoryBudgets, currentMTDStats]);

  // Efficiency Calculations vs Last Month
  const efficiency = useMemo(() => {
    const savedExpense = lastMonthTotalStats.totalExpense - currentMTDStats.totalExpense;
    const payPct = lastMonthTotalStats.totalExpense > 0
      ? (savedExpense / lastMonthTotalStats.totalExpense) * 100
      : 0;

    const isEfficient = savedExpense >= 0;

    return { savedExpense, payPct, isEfficient };
  }, [currentMTDStats, lastMonthTotalStats]);

  // Weeks 1, 2, 3, 4 Comparison (Current Month vs Last Month)
  const weeklyComparisons = useMemo(() => {
    const weekRanges = [
      { id: 1, name: 'Week 1', label: 'Tgl 1 - 7', start: 1, end: 7 },
      { id: 2, name: 'Week 2', label: 'Tgl 8 - 14', start: 8, end: 14 },
      { id: 3, name: 'Week 3', label: 'Tgl 15 - 21', start: 15, end: 21 },
      { id: 4, name: 'Week 4', label: `Tgl 22 - ${daysInCurrentMonth}`, start: 22, end: daysInCurrentMonth },
    ];

    return weekRanges.map((w) => {
      const curStats = getRangeOpexStats(currentMonthState, currentMonthPrefix, w.start, w.end);

      const lastEnd = Math.min(w.end, daysInLastMonth);
      const lastStats = getRangeOpexStats(lastMonthState, lastMonthPrefix, w.start, lastEnd);

      const diffPay = curStats.totalExpense - lastStats.totalExpense;
      const pctPay = lastStats.totalExpense > 0 ? (diffPay / lastStats.totalExpense) * 100 : 0;

      return {
        id: w.id,
        name: w.name,
        label: w.label,
        currentPay: curStats.totalExpense,
        lastPay: lastStats.totalExpense,
        diffPay,
        pctPay,
      };
    });
  }, [currentMonthState, currentMonthPrefix, lastMonthState, lastMonthPrefix, daysInCurrentMonth, daysInLastMonth]);

  // Selected Date Range Stats & Daily Breakdown
  const filteredRangeStats = useMemo(() => {
    const validStart = Math.max(1, Math.min(startDay, daysInCurrentMonth));
    const validEnd = Math.max(validStart, Math.min(endDay, daysInCurrentMonth));

    const curRange = getRangeOpexStats(currentMonthState, currentMonthPrefix, validStart, validEnd);

    const validLastEnd = Math.min(validEnd, daysInLastMonth);
    const lastRange = getRangeOpexStats(lastMonthState, lastMonthPrefix, validStart, validLastEnd);

    const dailyList = [];
    for (let d = validStart; d <= validEnd; d++) {
      const dateStr = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth, d);
      const dayName = DAYS_INDONESIAN[dayDate.getDay()];
      const dayStats = getDayOpexStats(dateStr, currentMonthState);

      dailyList.push({
        dateStr,
        dayNumber: d,
        dayName,
        ...dayStats,
      });
    }

    return {
      validStart,
      validEnd,
      curRange,
      lastRange,
      dailyList,
    };
  }, [startDay, endDay, daysInCurrentMonth, daysInLastMonth, currentMonthState, currentMonthPrefix, lastMonthState, lastMonthPrefix, selectedYear, selectedMonth]);

  return (
    <div className="space-y-8 animate-fade-in no-blur pb-20" id="opex-rekapan-container">
      {/* Top Header & Filters */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden bg-slate-900/80">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-600/30 border border-amber-400/30 flex items-center justify-center text-amber-400">
                <i className="fas fa-wallet text-lg"></i>
              </div>
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em] bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/20">
                PATTY CASH & OPEX EXPENSE ANALYTICS
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight italic">
              REKAPAN PATTY CASH EXPENSE (OPEX) ({selectedOutlet || 'ALL OUTLETS'})
            </h2>
            <p className="text-xs font-bold text-slate-400 mt-1">
              Rekapan pengeluaran kas kecil (Patty Cash / OPEX), efisiensi dibanding bulan lalu, dan perbandingan per minggu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Month Picker */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:border-amber-500 uppercase tracking-wider"
            >
              {MONTHS.map((m, idx) => (
                <option key={idx} value={idx}>
                  {m}
                </option>
              ))}
            </select>

            {/* Year Picker */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:border-amber-500 uppercase tracking-wider"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <ShareActions targetId="opex-rekapan-container" title={`Rekapan OPEX - ${MONTHS[selectedMonth]} ${selectedYear}`} />
          </div>
        </div>
      </div>

      {/* Overview Cards: MTD Cut-Off & Efisiensi Biaya */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Card 1: Total OPEX Bulan Ini */}
        <div className="glass-card p-6 rounded-3xl border border-amber-500/20 bg-slate-900/60 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full pointer-events-none"></div>
          <div className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">
            TOTAL OPEX EXPENSE (CUT OFF BULAN INI)
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            Rp {currentMTDStats.totalExpense.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span>Periode: 1 - {daysInCurrentMonth} {MONTHS[selectedMonth]}</span>
            <span className="text-amber-400 font-black">Patty Cash MTD</span>
          </div>
        </div>

        {/* Card 2: Total OPEX Bulan Lalu */}
        <div className="glass-card p-6 rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl relative overflow-hidden">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
            TOTAL OPEX (BULAN SEBELUMNYA)
          </div>
          <div className="text-2xl font-black text-slate-200 tracking-tight">
            Rp {lastMonthTotalStats.totalExpense.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span>Bulan Lalu: {MONTHS[lastMonthIndex]} {lastMonthYear}</span>
            <span className="text-slate-300 font-black">Patty Cash MTD</span>
          </div>
        </div>

        {/* Card 3: Efisiensi Biaya OPEX */}
        <div className={`glass-card p-6 rounded-3xl border shadow-xl relative overflow-hidden ${
          efficiency.isEfficient ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${
              efficiency.isEfficient ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              EFISIENSI BIAYA OPEX
            </span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
              efficiency.isEfficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {efficiency.isEfficient ? 'HEMAT BIAYA' : 'OVER BUDGET'}
            </span>
          </div>
          <div className={`text-xl font-black tracking-tight ${
            efficiency.savedExpense >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {efficiency.savedExpense >= 0 ? `+Rp ${efficiency.savedExpense.toLocaleString('id-ID')}` : `-Rp ${Math.abs(efficiency.savedExpense).toLocaleString('id-ID')}`}
          </div>
          <div className="text-xs font-bold text-slate-400 mt-2">
            {efficiency.payPct >= 0 ? `Penghematan ${efficiency.payPct.toFixed(1)}% biaya OPEX` : `Pembengkakan ${Math.abs(efficiency.payPct).toFixed(1)}% biaya OPEX`} dibanding bulan lalu
          </div>
        </div>

        {/* Card 4: Category Rata-rata Daily OPEX */}
        <div className="glass-card p-6 rounded-3xl border border-indigo-500/20 bg-slate-900/60 shadow-xl relative overflow-hidden">
          <div className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">
            RATA-RATA PENGELUARAN HARIAN
          </div>
          <div className="text-2xl font-black text-indigo-200 tracking-tight">
            Rp {Math.round(currentMTDStats.totalExpense / (daysInCurrentMonth || 1)).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span>Per Hari ({daysInCurrentMonth} Hari)</span>
            <span className="text-indigo-400 font-black">Daily Average</span>
          </div>
        </div>
      </div>

      {/* Week 1, 2, 3, 4 Comparison Table */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-chart-bar text-amber-400"></i>
              WEEKLY OPEX COMPARISON (CURRENT VS LAST MONTH)
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Perbandingan Minggu 1, 2, 3, 4 bulan ini dengan bulan sebelumnya ({MONTHS[lastMonthIndex]}).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">Minggu Ke-</th>
                <th className="p-4">Rentang Tanggal</th>
                <th className="p-4 text-right">Bulan Ini (Rp)</th>
                <th className="p-4 text-right">Bulan Lalu (Rp)</th>
                <th className="p-4 text-right">Selisih Pengeluaran (Rp)</th>
                <th className="p-4 text-center">Status Efisiensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {weeklyComparisons.map((w) => {
                const isSave = w.diffPay <= 0;
                return (
                  <tr key={w.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-black text-white">{w.name}</td>
                    <td className="p-4 text-slate-400 text-[11px]">{w.label}</td>
                    <td className="p-4 text-right font-black text-amber-400">Rp {w.currentPay.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-right font-bold text-slate-400">Rp {w.lastPay.toLocaleString('id-ID')}</td>
                    <td className={`p-4 text-right font-black ${isSave ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isSave ? `-Rp ${Math.abs(w.diffPay).toLocaleString('id-ID')}` : `+Rp ${Math.abs(w.diffPay).toLocaleString('id-ID')}`}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase ${
                        isSave ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {isSave ? 'EFISIEN' : 'OVER'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/10 bg-slate-950/80 text-xs font-black">
                <td colSpan={2} className="p-4 text-white uppercase tracking-wider">TOTAL MTD OPEX EXPENSE</td>
                <td className="p-4 text-right text-amber-400">Rp {currentMTDStats.totalExpense.toLocaleString('id-ID')}</td>
                <td className="p-4 text-right text-slate-400">Rp {lastMonthTotalStats.totalExpense.toLocaleString('id-ID')}</td>
                <td className={`p-4 text-right ${efficiency.savedExpense >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {efficiency.savedExpense >= 0 ? `-Rp ${efficiency.savedExpense.toLocaleString('id-ID')}` : `+Rp ${Math.abs(efficiency.savedExpense).toLocaleString('id-ID')}`}
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase ${
                    efficiency.isEfficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {efficiency.isEfficient ? 'HEMAT BIAYA' : 'OVER BUDGET'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Rekapan Budget vs Realisasi Per Kategori Expense */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-coins text-emerald-400"></i>
              REKAPAN BUDGET VS REALISASI PER KATEGORI EXPENSE ({MONTHS[selectedMonth]} {selectedYear})
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Target budget dan realisasi pengeluaran untuk Commodity, Non Commodity, Chemical, Maintenance, ATK, dan Asset.
            </p>
          </div>
          {onUpdate && (
            <button
              onClick={() => {
                setTempCategoryBudgets({
                  commodity: String(categoryBudgets.commodity || 0),
                  nonCommodity: String(categoryBudgets.nonCommodity || 0),
                  chemical: String(categoryBudgets.chemical || 0),
                  maintenance: String(categoryBudgets.maintenance || 0),
                  atk: String(categoryBudgets.atk || 0),
                  asset: String(categoryBudgets.asset || 0),
                });
                setIsEditingBudgets(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl shadow-lg text-xs uppercase tracking-widest font-black flex items-center gap-2 active:scale-95 transition-all cursor-pointer border border-emerald-400/30"
            >
              <i className="fas fa-edit text-sm"></i> Input Budget Expense Category
            </button>
          )}
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryBudgetList.map((item) => {
            const budget = item.budget;
            const spent = item.spent;
            const remaining = budget - spent;
            const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;

            let statusBadge = 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            let statusLabel = 'Belum Set Budget';

            if (budget > 0) {
              if (spent > budget) {
                statusBadge = 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
                statusLabel = 'OVER BUDGET';
              } else if (pctUsed >= 80) {
                statusBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                statusLabel = 'MENDEKATI LIMIT';
              } else {
                statusBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                statusLabel = 'AMAN / SESUAI';
              }
            }

            return (
              <div key={item.key} className="bg-slate-950/70 p-5 rounded-2xl border border-white/10 space-y-3 relative overflow-hidden group hover:border-white/20 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-xs ${item.color}`}>
                      <i className={`fas ${item.icon}`}></i>
                    </span>
                    <span className="text-xs font-black text-white uppercase tracking-wide">{item.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${statusBadge}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">TARGET BUDGET</span>
                    <span className="text-sm font-black text-white">Rp {budget.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">REALISASI / SPENT</span>
                    <span className={`text-sm font-black ${spent > budget && budget > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                      Rp {spent.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px]">
                  <div>
                    <span className="text-slate-500 font-bold mr-1">Sisa Budget:</span>
                    <span className={`font-black ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      Rp {remaining.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="font-black text-slate-400">
                    {budget > 0 ? `${pctUsed.toFixed(1)}% Terpakai` : '-'}
                  </div>
                </div>

                {budget > 0 && (
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${spent > budget ? 'bg-red-500' : item.barColor}`}
                      style={{ width: `${Math.min(pctUsed, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Table View */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/80 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-3.5">Kategori Expense</th>
                <th className="p-3.5 text-right">Target Budget (Rp)</th>
                <th className="p-3.5 text-right">Realisasi Spent (Rp)</th>
                <th className="p-3.5 text-right">Sisa Budget / Variance</th>
                <th className="p-3.5 text-center">% Pemakaian</th>
                <th className="p-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {categoryBudgetList.map((item) => {
                const budget = item.budget;
                const spent = item.spent;
                const remaining = budget - spent;
                const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;

                let statusClass = 'text-slate-400';
                let statusLabel = 'Belum Set';

                if (budget > 0) {
                  if (spent > budget) {
                    statusClass = 'text-red-400 font-black';
                    statusLabel = 'OVER BUDGET';
                  } else if (pctUsed >= 80) {
                    statusClass = 'text-amber-300 font-black';
                    statusLabel = 'MENDEKATI LIMIT';
                  } else {
                    statusClass = 'text-emerald-400 font-black';
                    statusLabel = 'AMAN';
                  }
                }

                return (
                  <tr key={item.key} className="hover:bg-white/5 transition-colors">
                    <td className="p-3.5 font-black text-white flex items-center gap-2">
                      <i className={`fas ${item.icon} ${item.color}`}></i>
                      {item.name}
                    </td>
                    <td className="p-3.5 text-right font-black text-indigo-300">Rp {budget.toLocaleString('id-ID')}</td>
                    <td className="p-3.5 text-right font-black text-blue-400">Rp {spent.toLocaleString('id-ID')}</td>
                    <td className={`p-3.5 text-right font-black ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      Rp {remaining.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-300">
                      {budget > 0 ? `${pctUsed.toFixed(1)}%` : '-'}
                    </td>
                    <td className={`p-3.5 text-center text-[10px] uppercase ${statusClass}`}>
                      {statusLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totalBudget = categoryBudgetList.reduce((a: number, b: any) => a + b.budget, 0);
                const totalSpent = categoryBudgetList.reduce((a: number, b: any) => a + b.spent, 0);
                const totalRemaining = totalBudget - totalSpent;
                const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

                return (
                  <tr className="border-t-2 border-white/10 bg-slate-950/90 text-xs font-black">
                    <td className="p-3.5 text-white uppercase tracking-wider">TOTAL KATEGORI EXPENSE</td>
                    <td className="p-3.5 text-right text-indigo-300">Rp {totalBudget.toLocaleString('id-ID')}</td>
                    <td className="p-3.5 text-right text-blue-400">Rp {totalSpent.toLocaleString('id-ID')}</td>
                    <td className={`p-3.5 text-right ${totalRemaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      Rp {totalRemaining.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3.5 text-center text-purple-300">{totalBudget > 0 ? `${totalPct.toFixed(1)}%` : '-'}</td>
                    <td className="p-3.5 text-center text-[10px] uppercase text-slate-300">
                      {totalBudget > 0 ? (totalSpent > totalBudget ? 'OVER BUDGET' : 'DALAM LIMIT') : '-'}
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Date Range Custom Filter Section (Example: Tanggal 1 to Tanggal 7) */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-filter text-amber-400"></i>
              FILTER DETAIL RENTANG TANGGAL (CUSTOM DATE RANGE)
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Pilih rentang tanggal (Contoh: Tanggal 1 to Tanggal 7) untuk melihat total & rincian data OPEX harian.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-950 p-2 rounded-2xl border border-white/10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider pl-2">Rentang:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400">Tgl</span>
              <select
                value={startDay}
                onChange={(e) => setStartDay(Number(e.target.value))}
                className="bg-slate-900 text-xs font-black text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-amber-400"
              >
                {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs font-bold text-amber-400">S/D</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400">Tgl</span>
              <select
                value={endDay}
                onChange={(e) => setEndDay(Number(e.target.value))}
                className="bg-slate-900 text-xs font-black text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-amber-400"
              >
                {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              <button
                onClick={() => { setStartDay(1); setEndDay(7); }}
                className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[9px] font-black rounded uppercase transition-all"
              >
                Tgl 1-7
              </button>
              <button
                onClick={() => { setStartDay(1); setEndDay(15); }}
                className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[9px] font-black rounded uppercase transition-all"
              >
                Tgl 1-15
              </button>
              <button
                onClick={() => { setStartDay(1); setEndDay(daysInCurrentMonth); }}
                className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[9px] font-black rounded uppercase transition-all"
              >
                Full Bulan
              </button>
            </div>
          </div>
        </div>

        {/* Selected Range Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/60 p-5 rounded-2xl border border-white/5">
          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              TOTAL OPEX (TGL {filteredRangeStats.validStart} - {filteredRangeStats.validEnd})
            </div>
            <div className="text-xl font-black text-amber-400 mt-1">
              Rp {filteredRangeStats.curRange.totalExpense.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              Bulan Lalu periode sama: Rp {filteredRangeStats.lastRange.totalExpense.toLocaleString('id-ID')}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              PENGHEMATAN / SELISIH
            </div>
            <div className={`text-xl font-black mt-1 ${
              filteredRangeStats.lastRange.totalExpense - filteredRangeStats.curRange.totalExpense >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {filteredRangeStats.lastRange.totalExpense - filteredRangeStats.curRange.totalExpense >= 0
                ? `+Rp ${(filteredRangeStats.lastRange.totalExpense - filteredRangeStats.curRange.totalExpense).toLocaleString('id-ID')}`
                : `-Rp ${Math.abs(filteredRangeStats.lastRange.totalExpense - filteredRangeStats.curRange.totalExpense).toLocaleString('id-ID')}`}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              Vs Periode Bulan Lalu
            </div>
          </div>

          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              RATA-RATA PER HARI
            </div>
            <div className="text-xl font-black text-indigo-400 mt-1">
              Rp {Math.round(filteredRangeStats.curRange.totalExpense / (filteredRangeStats.validEnd - filteredRangeStats.validStart + 1)).toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              {filteredRangeStats.validEnd - filteredRangeStats.validStart + 1} Hari Dipilih
            </div>
          </div>
        </div>

        {/* Daily Breakdown Table for the Filtered Date Range */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Hari</th>
                <th className="p-3 text-right">Non-Comm</th>
                <th className="p-3 text-right">Comm</th>
                <th className="p-3 text-right">Patty Cash</th>
                <th className="p-3 text-right">Maint.</th>
                <th className="p-3 text-right">Asset</th>
                <th className="p-3 text-right">Casual</th>
                <th className="p-3 text-right">ATK</th>
                <th className="p-3 text-right">Total OPEX (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {filteredRangeStats.dailyList.map((day) => (
                <tr key={day.dateStr} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-black text-white">{day.dateStr}</td>
                  <td className="p-3 text-slate-400">{day.dayName}</td>
                  <td className="p-3 text-right text-slate-300">{day.nonCommodity > 0 ? `Rp ${day.nonCommodity.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-slate-300">{day.commodity > 0 ? `Rp ${day.commodity.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-amber-300 font-black">{day.cash > 0 ? `Rp ${day.cash.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-slate-300">{day.maintenance > 0 ? `Rp ${day.maintenance.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-slate-300">{day.asset > 0 ? `Rp ${day.asset.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-slate-300">{day.casual > 0 ? `Rp ${day.casual.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right text-slate-300">{day.atk > 0 ? `Rp ${day.atk.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="p-3 text-right font-black text-amber-400 bg-amber-500/5">
                    {day.totalExpense > 0 ? `Rp ${day.totalExpense.toLocaleString('id-ID')}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PattyCashOpexRekapanModule;
