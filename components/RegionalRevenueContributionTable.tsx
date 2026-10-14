import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, getAreaForOutlet, MONTHS, getActiveOutletNames } from '../constants';
import { AppState } from '../types';

interface Props {
  allOutletsData: Record<string, any>;
  data?: AppState;
  selectedMonth: number;
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

export const RegionalRevenueContributionTable: React.FC<Props> = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = 'ALL',
  onSelectOutlet,
  showToast
}) => {
  const [activeArea, setActiveArea] = useState<string>(selectedArea || 'ALL');
  const [activeOutlet, setActiveOutlet] = useState<string>(selectedOutlet || 'ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewPeriod, setViewPeriod] = useState<'HARIAN' | 'WEEKLY' | 'MONTHLY' | 'YTD'>('HARIAN');

  React.useEffect(() => {
    setActiveArea(selectedArea || 'ALL');
  }, [selectedArea]);

  React.useEffect(() => {
    setActiveOutlet(selectedOutlet || 'ALL');
  }, [selectedOutlet]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  const activeOutletsList = useMemo(() => {
    const fromConfig = getActiveOutletNames();
    const fromData = Object.keys(allOutletsData || {});
    const combined = Array.from(new Set([...fromConfig, ...fromData]));
    return combined.filter(name => {
      const d = allOutletsData?.[name];
      return !d || !d.isDeleted;
    });
  }, [allOutletsData]);

  // Filtered Outlets list
  const filteredOutlets = useMemo(() => {
    let list = activeOutletsList;
    if (activeArea !== 'ALL') {
      list = list.filter(o => getAreaForOutlet(o) === activeArea);
    }
    if (activeOutlet !== 'ALL') {
      list = list.filter(o => o === activeOutlet);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(o => o.toLowerCase().includes(q));
    }
    return list;
  }, [activeArea, activeOutlet, searchTerm, activeOutletsList]);

  // Target outlets for current query
  const queryOutlets = useMemo(() => {
    if (activeOutlet !== 'ALL') return [activeOutlet];
    if (activeArea !== 'ALL') return activeOutletsList.filter(o => getAreaForOutlet(o) === activeArea);
    return activeOutletsList;
  }, [activeArea, activeOutlet, activeOutletsList]);

  // Helper to extract Daily Data for specific date
  const getDailyRevenue = (outlets: string[], y: number, m: number, d: number) => {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daysInM = new Date(y, m + 1, 0).getDate();

    let targetSum = 0;
    let lunchSum = 0;
    let dinnerSum = 0;

    outlets.forEach(oName => {
      const outletMonths = allOutletsData?.[oName] || allOutletsData?.[oName.trim()] || Object.entries(allOutletsData || {}).find(([k]) => k.trim().toUpperCase() === oName.trim().toUpperCase())?.[1] || {};
      const mData = outletMonths[String(m)] || outletMonths[m] || outletMonths.monthlyData?.[String(m)] || outletMonths.monthlyData?.[m] || {};
      const sales = mData.sales || outletMonths.sales || mData || {};
      const dailyRec = sales.dailyRecording || mData.dailyRecording || outletMonths.dailyRecording || outletMonths.dailySales || {};
      const entry = dailyRec[dateStr] || dailyRec[String(d)] || {};

      // Target
      let outletTarget = 0;
      if (entry.target !== undefined && Number(entry.target) > 0) {
        outletTarget = Number(entry.target);
      } else if (mData.dailyTargets?.[dateStr] !== undefined) {
        outletTarget = Number(mData.dailyTargets[dateStr]) || 0;
      } else if (mData.dailyTargets?.[String(d)] !== undefined) {
        outletTarget = Number(mData.dailyTargets[String(d)]) || 0;
      } else if (sales.dailyTargets?.[dateStr] !== undefined) {
        outletTarget = Number(sales.dailyTargets[dateStr]) || 0;
      } else if (sales.dailyTargets?.[String(d)] !== undefined) {
        outletTarget = Number(sales.dailyTargets[String(d)]) || 0;
      } else {
        const budget = (sales.monthlyBudgets || {})[`${y}-${String(m + 1).padStart(2, '0')}`] || sales.budgetRevenue || (sales.monthlyBudgets || {})[String(m)] || 0;
        outletTarget = budget > 0 ? Math.round(budget / daysInM) : 0;
      }

      targetSum += outletTarget;

      // Lunch & Dinner
      let lunch = Number(entry.lunchRevenue) || Number(entry.revenueLunch) || Number(entry.lunchActual) || Number(entry.lunchRev) || 0;
      let dinner = Number(entry.dinnerRevenue) || Number(entry.revenueDinner) || Number(entry.dinnerActual) || Number(entry.dinnerRev) || 0;
      const totalEntered = Number(entry.revenue) || Number(entry.totalRevenue) || Number(entry.actual) || 0;

      if (lunch === 0 && dinner === 0 && totalEntered > 0) {
        lunch = Math.round(totalEntered * 0.40);
        dinner = totalEntered - lunch;
      } else if (dinner === 0 && totalEntered > lunch && lunch > 0) {
        dinner = totalEntered - lunch;
      } else if (lunch === 0 && totalEntered > dinner && dinner > 0) {
        lunch = totalEntered - dinner;
      }

      lunchSum += lunch;
      dinnerSum += dinner;
    });

    return {
      target: targetSum,
      lunch: lunchSum,
      dinner: dinnerSum,
      totalActual: lunchSum + dinnerSum
    };
  };

  // 1. DATA HARIAN (Day 1 - 31)
  const dailyRows = useMemo(() => {
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(selectedYear, selectedMonth, d);
      const dayName = DAY_NAMES[dt.getDay()];
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;

      const { target, lunch, dinner, totalActual } = getDailyRevenue(queryOutlets, selectedYear, selectedMonth, d);

      const lunchContrib = target > 0 ? (lunch / target) * 100 : 0;
      const dinnerContrib = target > 0 ? (dinner / target) * 100 : 0;
      const totalAch = target > 0 ? (totalActual / target) * 100 : 0;
      const variance = totalActual - target;

      const lunchSplit = totalActual > 0 ? (lunch / totalActual) * 100 : 0;
      const dinnerSplit = totalActual > 0 ? (dinner / totalActual) * 100 : 0;

      rows.push({
        day: d,
        dateStr,
        dayName,
        isWeekend,
        targetToday: target,
        lunchActual: lunch,
        lunchContrib, // % Kontribusi Lunch terhadap Target Today
        dinnerActual: dinner,
        dinnerContrib, // % Kontribusi Dinner terhadap Target Today
        totalActual,
        totalAch, // % Total Pencapaian terhadap Target Today
        variance,
        lunchSplit,
        dinnerSplit
      });
    }
    return rows;
  }, [queryOutlets, selectedYear, selectedMonth, daysInMonth, monthKey, allOutletsData]);

  // 2. DATA WEEKLY (Week 1 - Week 5)
  const weeklyRows = useMemo(() => {
    const weeksDef = [
      { weekNum: 1, label: 'Week 1', range: 'Tgl 1 - 7', startDay: 1, endDay: 7 },
      { weekNum: 2, label: 'Week 2', range: 'Tgl 8 - 14', startDay: 8, endDay: 14 },
      { weekNum: 3, label: 'Week 3', range: 'Tgl 15 - 21', startDay: 15, endDay: 21 },
      { weekNum: 4, label: 'Week 4', range: `Tgl 22 - ${daysInMonth}`, startDay: 22, endDay: daysInMonth }
    ];

    return weeksDef.map(w => {
      const days = dailyRows.filter(d => d.day >= w.startDay && d.day <= w.endDay);
      const targetSum = days.reduce((sum, d) => sum + d.targetToday, 0);
      const lunchSum = days.reduce((sum, d) => sum + d.lunchActual, 0);
      const dinnerSum = days.reduce((sum, d) => sum + d.dinnerActual, 0);
      const totalActualSum = lunchSum + dinnerSum;

      const lunchContrib = targetSum > 0 ? (lunchSum / targetSum) * 100 : 0;
      const dinnerContrib = targetSum > 0 ? (dinnerSum / targetSum) * 100 : 0;
      const totalAch = targetSum > 0 ? (totalActualSum / targetSum) * 100 : 0;
      const variance = totalActualSum - targetSum;

      const lunchSplit = totalActualSum > 0 ? (lunchSum / totalActualSum) * 100 : 0;
      const dinnerSplit = totalActualSum > 0 ? (dinnerSum / totalActualSum) * 100 : 0;

      return {
        weekNum: w.weekNum,
        label: w.label,
        range: w.range,
        dayCount: days.length,
        targetPeriod: targetSum,
        lunchActual: lunchSum,
        lunchContrib, // % Kontribusi Lunch terhadap Target Periode
        dinnerActual: dinnerSum,
        dinnerContrib, // % Kontribusi Dinner terhadap Target Periode
        totalActual: totalActualSum,
        totalAch,
        variance,
        lunchSplit,
        dinnerSplit
      };
    });
  }, [dailyRows, daysInMonth]);

  // 3. DATA MONTHLY (Jan - Des)
  const monthlyRows = useMemo(() => {
    const list = [];
    for (let m = 0; m < 12; m++) {
      const daysInM = new Date(selectedYear, m + 1, 0).getDate();
      let mTarget = 0;
      let mLunch = 0;
      let mDinner = 0;

      for (let d = 1; d <= daysInM; d++) {
        const { target, lunch, dinner } = getDailyRevenue(queryOutlets, selectedYear, m, d);
        mTarget += target;
        mLunch += lunch;
        mDinner += dinner;
      }

      const totalActual = mLunch + mDinner;
      const lunchContrib = mTarget > 0 ? (mLunch / mTarget) * 100 : 0;
      const dinnerContrib = mTarget > 0 ? (mDinner / mTarget) * 100 : 0;
      const totalAch = mTarget > 0 ? (totalActual / mTarget) * 100 : 0;
      const variance = totalActual - mTarget;

      const lunchSplit = totalActual > 0 ? (mLunch / totalActual) * 100 : 0;
      const dinnerSplit = totalActual > 0 ? (mDinner / totalActual) * 100 : 0;

      list.push({
        monthIdx: m,
        monthName: MONTH_NAMES[m],
        isCurrentMonth: m === selectedMonth,
        targetPeriod: mTarget,
        lunchActual: mLunch,
        lunchContrib,
        dinnerActual: mDinner,
        dinnerContrib,
        totalActual,
        totalAch,
        variance,
        lunchSplit,
        dinnerSplit
      });
    }
    return list;
  }, [queryOutlets, selectedYear, selectedMonth, allOutletsData]);

  // 4. DATA YTD (Kumulatif Jan s/d Bulan Dipilih)
  const ytdRows = useMemo(() => {
    let cumTarget = 0;
    let cumLunch = 0;
    let cumDinner = 0;

    return monthlyRows.map(m => {
      cumTarget += m.targetPeriod;
      cumLunch += m.lunchActual;
      cumDinner += m.dinnerActual;
      const cumTotalActual = cumLunch + cumDinner;

      const lunchContrib = cumTarget > 0 ? (cumLunch / cumTarget) * 100 : 0;
      const dinnerContrib = cumTarget > 0 ? (cumDinner / cumTarget) * 100 : 0;
      const totalAch = cumTarget > 0 ? (cumTotalActual / cumTarget) * 100 : 0;
      const variance = cumTotalActual - cumTarget;

      const lunchSplit = cumTotalActual > 0 ? (cumLunch / cumTotalActual) * 100 : 0;
      const dinnerSplit = cumTotalActual > 0 ? (cumDinner / cumTotalActual) * 100 : 0;

      return {
        monthIdx: m.monthIdx,
        label: `YTD ${m.monthName}`,
        isCurrentMonth: m.isCurrentMonth,
        targetPeriod: cumTarget,
        lunchActual: cumLunch,
        lunchContrib,
        dinnerActual: cumDinner,
        dinnerContrib,
        totalActual: cumTotalActual,
        totalAch,
        variance,
        lunchSplit,
        dinnerSplit
      };
    });
  }, [monthlyRows]);

  // Summary Totals for Active View Period
  const activeSummary = useMemo(() => {
    if (viewPeriod === 'HARIAN' || viewPeriod === 'WEEKLY') {
      const totalTarget = dailyRows.reduce((sum, r) => sum + r.targetToday, 0);
      const totalLunch = dailyRows.reduce((sum, r) => sum + r.lunchActual, 0);
      const totalDinner = dailyRows.reduce((sum, r) => sum + r.dinnerActual, 0);
      const totalActual = totalLunch + totalDinner;

      const lunchContrib = totalTarget > 0 ? (totalLunch / totalTarget) * 100 : 0;
      const dinnerContrib = totalTarget > 0 ? (totalDinner / totalTarget) * 100 : 0;
      const totalAch = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
      const variance = totalActual - totalTarget;

      const lunchSplit = totalActual > 0 ? (totalLunch / totalActual) * 100 : 0;
      const dinnerSplit = totalActual > 0 ? (totalDinner / totalActual) * 100 : 0;

      return {
        label: `TOTAL MTD (${monthName} ${selectedYear})`,
        totalTarget,
        totalLunch,
        lunchContrib,
        totalDinner,
        dinnerContrib,
        totalActual,
        totalAch,
        variance,
        lunchSplit,
        dinnerSplit
      };
    } else if (viewPeriod === 'MONTHLY') {
      const totalTarget = monthlyRows.reduce((sum, r) => sum + r.targetPeriod, 0);
      const totalLunch = monthlyRows.reduce((sum, r) => sum + r.lunchActual, 0);
      const totalDinner = monthlyRows.reduce((sum, r) => sum + r.dinnerActual, 0);
      const totalActual = totalLunch + totalDinner;

      const lunchContrib = totalTarget > 0 ? (totalLunch / totalTarget) * 100 : 0;
      const dinnerContrib = totalTarget > 0 ? (totalDinner / totalTarget) * 100 : 0;
      const totalAch = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
      const variance = totalActual - totalTarget;

      const lunchSplit = totalActual > 0 ? (totalLunch / totalActual) * 100 : 0;
      const dinnerSplit = totalActual > 0 ? (totalDinner / totalActual) * 100 : 0;

      return {
        label: `TOTAL ANNUAL ${selectedYear} (12 BULAN)`,
        totalTarget,
        totalLunch,
        lunchContrib,
        totalDinner,
        dinnerContrib,
        totalActual,
        totalAch,
        variance,
        lunchSplit,
        dinnerSplit
      };
    } else {
      // YTD Summary is the current month entry
      const currentYtd = ytdRows[selectedMonth] || ytdRows[ytdRows.length - 1];
      return {
        label: `KUMULATIF YTD S/D ${monthName.toUpperCase()} ${selectedYear}`,
        totalTarget: currentYtd.targetPeriod,
        totalLunch: currentYtd.lunchActual,
        lunchContrib: currentYtd.lunchContrib,
        totalDinner: currentYtd.dinnerActual,
        dinnerContrib: currentYtd.dinnerContrib,
        totalActual: currentYtd.totalActual,
        totalAch: currentYtd.totalAch,
        variance: currentYtd.variance,
        lunchSplit: currentYtd.lunchSplit,
        dinnerSplit: currentYtd.dinnerSplit
      };
    }
  }, [viewPeriod, dailyRows, monthlyRows, ytdRows, selectedMonth, monthName, selectedYear]);

  // Export Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetName = `Kontribusi ${viewPeriod}`;
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: 'No / Periode', key: 'period', width: 22 },
      { header: 'Hari / Detail', key: 'detail', width: 14 },
      { header: 'Target Today / Periode', key: 'target', width: 22 },
      { header: 'Revenue Lunch (Rp)', key: 'lunch', width: 20 },
      { header: '% Kontribusi Lunch vs Target', key: 'lunchContrib', width: 25 },
      { header: 'Revenue Dinner (Rp)', key: 'dinner', width: 20 },
      { header: '% Kontribusi Dinner vs Target', key: 'dinnerContrib', width: 25 },
      { header: 'Total Revenue Actual (Rp)', key: 'totalActual', width: 22 },
      { header: '% Total Pencapaian vs Target', key: 'totalAch', width: 25 },
      { header: 'Selisih (+/- Rp)', key: 'variance', width: 20 },
      { header: 'Split Lunch (%)', key: 'lunchSplit', width: 15 },
      { header: 'Split Dinner (%)', key: 'dinnerSplit', width: 15 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    let dataToExport: any[] = [];
    if (viewPeriod === 'HARIAN') {
      dataToExport = dailyRows.map(r => ({
        period: r.dateStr,
        detail: r.dayName,
        target: r.targetToday,
        lunch: r.lunchActual,
        lunchContrib: Number(r.lunchContrib.toFixed(1)),
        dinner: r.dinnerActual,
        dinnerContrib: Number(r.dinnerContrib.toFixed(1)),
        totalActual: r.totalActual,
        totalAch: Number(r.totalAch.toFixed(1)),
        variance: r.variance,
        lunchSplit: Number(r.lunchSplit.toFixed(1)),
        dinnerSplit: Number(r.dinnerSplit.toFixed(1))
      }));
    } else if (viewPeriod === 'WEEKLY') {
      dataToExport = weeklyRows.map(r => ({
        period: r.label,
        detail: r.range,
        target: r.targetPeriod,
        lunch: r.lunchActual,
        lunchContrib: Number(r.lunchContrib.toFixed(1)),
        dinner: r.dinnerActual,
        dinnerContrib: Number(r.dinnerContrib.toFixed(1)),
        totalActual: r.totalActual,
        totalAch: Number(r.totalAch.toFixed(1)),
        variance: r.variance,
        lunchSplit: Number(r.lunchSplit.toFixed(1)),
        dinnerSplit: Number(r.dinnerSplit.toFixed(1))
      }));
    } else if (viewPeriod === 'MONTHLY') {
      dataToExport = monthlyRows.map(r => ({
        period: r.monthName,
        detail: String(selectedYear),
        target: r.targetPeriod,
        lunch: r.lunchActual,
        lunchContrib: Number(r.lunchContrib.toFixed(1)),
        dinner: r.dinnerActual,
        dinnerContrib: Number(r.dinnerContrib.toFixed(1)),
        totalActual: r.totalActual,
        totalAch: Number(r.totalAch.toFixed(1)),
        variance: r.variance,
        lunchSplit: Number(r.lunchSplit.toFixed(1)),
        dinnerSplit: Number(r.dinnerSplit.toFixed(1))
      }));
    } else {
      dataToExport = ytdRows.map(r => ({
        period: r.label,
        detail: 'Kumulatif YTD',
        target: r.targetPeriod,
        lunch: r.lunchActual,
        lunchContrib: Number(r.lunchContrib.toFixed(1)),
        dinner: r.dinnerActual,
        dinnerContrib: Number(r.dinnerContrib.toFixed(1)),
        totalActual: r.totalActual,
        totalAch: Number(r.totalAch.toFixed(1)),
        variance: r.variance,
        lunchSplit: Number(r.lunchSplit.toFixed(1)),
        dinnerSplit: Number(r.dinnerSplit.toFixed(1))
      }));
    }

    dataToExport.forEach(row => worksheet.addRow(row));

    // Summary Row
    const sumRow = worksheet.addRow({
      period: activeSummary.label,
      detail: '-',
      target: activeSummary.totalTarget,
      lunch: activeSummary.totalLunch,
      lunchContrib: Number(activeSummary.lunchContrib.toFixed(1)),
      dinner: activeSummary.totalDinner,
      dinnerContrib: Number(activeSummary.dinnerContrib.toFixed(1)),
      totalActual: activeSummary.totalActual,
      totalAch: Number(activeSummary.totalAch.toFixed(1)),
      variance: activeSummary.variance,
      lunchSplit: Number(activeSummary.lunchSplit.toFixed(1)),
      dinnerSplit: Number(activeSummary.dinnerSplit.toFixed(1))
    });
    sumRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Rekapan_Kontribusi_Revenue_${viewPeriod}_${monthName}_${selectedYear}.xlsx`);
    showToast?.('Laporan Kontribusi Revenue berhasil diekspor!', 'success');
  };

  // Copy WhatsApp
  const handleCopyWhatsApp = () => {
    let msg = `*REKAPAN % KONTRIBUSI REVENUE LUNCH & DINNER VS TARGET TODAY*\n`;
    msg += `*Periode:* ${viewPeriod} (${monthName} ${selectedYear})\n`;
    msg += `*Area:* ${activeArea} | *Outlet:* ${activeOutlet}\n`;
    msg += `------------------------------------\n\n`;

    msg += `*RINGKASAN ${activeSummary.label}:*\n`;
    msg += `• *Target Today / Periode:* Rp ${formatIDR(activeSummary.totalTarget)}\n`;
    msg += `• *Revenue Lunch:* Rp ${formatIDR(activeSummary.totalLunch)} (*${activeSummary.lunchContrib.toFixed(1)}%* vs Target | MTD ${activeSummary.lunchSplit.toFixed(1)}%)\n`;
    msg += `• *Revenue Dinner:* Rp ${formatIDR(activeSummary.totalDinner)} (*${activeSummary.dinnerContrib.toFixed(1)}%* vs Target | MTD ${activeSummary.dinnerSplit.toFixed(1)}%)\n`;
    msg += `• *Total Revenue Actual:* Rp ${formatIDR(activeSummary.totalActual)} (*${activeSummary.totalAch.toFixed(1)}%* Pencapaian)\n`;
    msg += `• *Selisih:* ${activeSummary.variance >= 0 ? '+' : ''}Rp ${formatIDR(activeSummary.variance)}\n`;
    msg += `• *Actual Split:* Lunch ${activeSummary.lunchSplit.toFixed(1)}% : Dinner ${activeSummary.dinnerSplit.toFixed(1)}%\n\n`;

    if (viewPeriod === 'WEEKLY') {
      msg += `*DETAIL PER WEEKLY:*\n`;
      weeklyRows.forEach(w => {
        msg += `*${w.label} (${w.range})*\n`;
        msg += `  - Target: Rp ${formatIDR(w.targetPeriod)}\n`;
        msg += `  - Lunch: Rp ${formatIDR(w.lunchActual)} (${w.lunchContrib.toFixed(1)}% vs Target)\n`;
        msg += `  - Dinner: Rp ${formatIDR(w.dinnerActual)} (${w.dinnerContrib.toFixed(1)}% vs Target)\n`;
        msg += `  - Total: Rp ${formatIDR(w.totalActual)} (${w.totalAch.toFixed(1)}%)\n`;
      });
    }

    navigator.clipboard.writeText(msg);
    showToast?.('Ringkasan Kontribusi disalin ke clipboard!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-5">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                PROPORSI PENJUALAN HARIAN
              </span>
              <span className="text-xs text-slate-400">• Formulasi Kontribusi terhadap Target Today</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <i className="fas fa-pie-chart text-emerald-400"></i>
              Rekapan % Kontribusi Revenue Lunch &amp; Dinner
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Perhitungan persentase kontribusi omset siang (Lunch) dan malam (Dinner) terhadap Target Harian (Target Today), Mingguan (Weekly), Bulanan (Monthly), dan Kumulatif (YTD).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-emerald-500/30 flex items-center gap-2 active:scale-95 cursor-pointer shadow-sm"
            >
              <i className="fab fa-whatsapp text-sm"></i>
              Salin WA
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-indigo-500/30 flex items-center gap-2 active:scale-95 cursor-pointer shadow-sm"
            >
              <i className="fas fa-file-excel text-sm"></i>
              Ekspor Excel
            </button>
          </div>
        </div>

        {/* FILTERS & VIEW PERIOD SELECTOR */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Area */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Area:</span>
              <div className="flex rounded-xl overflow-hidden border border-white/10 bg-slate-950 p-1">
                {['ALL', 'JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'].map(area => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setActiveArea(area)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                      activeArea === area
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {area === 'ALL' ? 'Semua Area' : area}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Outlet */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Outlet:</span>
              <select
                value={activeOutlet}
                onChange={(e) => {
                  setActiveOutlet(e.target.value);
                  onSelectOutlet?.(e.target.value);
                }}
                className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">Semua Outlet ({filteredOutlets.length})</option>
                {filteredOutlets.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 View Periods: HARIAN, WEEKLY, MONTHLY, YTD */}
          <div className="flex rounded-xl overflow-hidden border border-white/10 bg-slate-950 p-1 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewPeriod('HARIAN')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewPeriod === 'HARIAN'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-day text-[10px]"></i>
              Harian (1-31)
            </button>
            <button
              type="button"
              onClick={() => setViewPeriod('WEEKLY')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewPeriod === 'WEEKLY'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-week text-[10px]"></i>
              Weekly (W1-W5)
            </button>
            <button
              type="button"
              onClick={() => setViewPeriod('MONTHLY')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewPeriod === 'MONTHLY'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar text-[10px]"></i>
              Monthly (Jan-Des)
            </button>
            <button
              type="button"
              onClick={() => setViewPeriod('YTD')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewPeriod === 'YTD'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-chart-line text-[10px]"></i>
              YTD Kumulatif
            </button>
          </div>
        </div>

        {/* TOP KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* TARGET */}
          <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>TARGET {viewPeriod === 'HARIAN' ? 'TODAY MTD' : viewPeriod}</span>
              <span className="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded font-mono">100% BASE</span>
            </div>
            <div className="text-xl font-black text-white font-mono">
              Rp {formatIDR(activeSummary.totalTarget)}
            </div>
            <div className="text-[10px] text-slate-400">
              Tolok ukur target 100% regional
            </div>
          </div>

          {/* LUNCH */}
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-sun"></i> KONTRIBUSI LUNCH
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Target MTD {activeSummary.lunchSplit.toFixed(1)}%
              </span>
            </div>
            <div className="text-xl font-black text-amber-300 font-mono">
              Rp {formatIDR(activeSummary.totalLunch)}
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-amber-400 font-mono">
                {activeSummary.lunchContrib.toFixed(1)}% vs Target
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Proporsi: {activeSummary.lunchSplit.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* DINNER */}
          <div className="bg-slate-950/60 border border-indigo-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-moon"></i> KONTRIBUSI DINNER
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Target MTD {activeSummary.dinnerSplit.toFixed(1)}%
              </span>
            </div>
            <div className="text-xl font-black text-indigo-300 font-mono">
              Rp {formatIDR(activeSummary.totalDinner)}
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-indigo-400 font-mono">
                {activeSummary.dinnerContrib.toFixed(1)}% vs Target
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Proporsi: {activeSummary.dinnerSplit.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* TOTAL ACTUAL & PERFORMANCE */}
          <div className="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-cash-register"></i> TOTAL REVENUE
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                activeSummary.totalAch >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                {activeSummary.totalAch.toFixed(1)}% Pencapaian
              </span>
            </div>
            <div className="text-xl font-black text-emerald-300 font-mono">
              Rp {formatIDR(activeSummary.totalActual)}
            </div>
            <div className="text-[10px] flex items-center justify-between font-mono">
              <span className={activeSummary.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {activeSummary.variance >= 0 ? '+' : ''}Rp {formatIDR(activeSummary.variance)}
              </span>
              <span className="text-slate-400">
                {activeSummary.variance >= 0 ? 'Surplus' : 'Defisit'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-table text-emerald-400"></i>
              Tabel Rekapan % Kontribusi ({viewPeriod}) - {activeArea === 'ALL' ? 'Seluruh Regional' : activeArea}
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Kolom Kontribusi Lunch (% terhadap Target) dan Kontribusi Dinner (% terhadap Target) dihitung langsung terhadap Target Today / Periode.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span> Lunch Benchmark 40%
            </span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Dinner Benchmark 60%
            </span>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[1250px]">
            <thead>
              {/* Row 1: Super Headers */}
              <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                <th rowSpan={2} className="py-3 px-3 text-center border-r border-white/5 w-12">NO</th>
                <th rowSpan={2} className="py-3 px-4 border-r border-white/5 min-w-[150px]">
                  {viewPeriod === 'HARIAN' ? 'TANGGAL & HARI' : viewPeriod === 'WEEKLY' ? 'MINGGU & PERIODE' : viewPeriod === 'MONTHLY' ? 'BULAN' : 'PERIODE YTD'}
                </th>
                <th rowSpan={2} className="py-3 px-3 text-right border-r border-white/5 bg-slate-950 min-w-[140px]">
                  TARGET TODAY / PERIODE
                </th>
                <th colSpan={3} className="py-2.5 px-3 text-center border-b border-white/10 bg-amber-950/40 text-amber-300 border-r border-white/5">
                  <i className="fas fa-sun mr-1.5 text-amber-400"></i>REVENUE LUNCH (SIANG)
                </th>
                <th colSpan={3} className="py-2.5 px-3 text-center border-b border-white/10 bg-indigo-950/40 text-indigo-300 border-r border-white/5">
                  <i className="fas fa-moon mr-1.5 text-indigo-400"></i>REVENUE DINNER (MALAM)
                </th>
                <th colSpan={3} className="py-2.5 px-3 text-center border-b border-white/10 bg-emerald-950/40 text-emerald-300 border-r border-white/5">
                  <i className="fas fa-cash-register mr-1.5 text-emerald-400"></i>TOTAL REVENUE ACTUAL
                </th>
                <th rowSpan={2} className="py-3 px-3 text-center min-w-[110px]">
                  SPLIT L / D
                </th>
              </tr>

              {/* Row 2: Sub-headers */}
              <tr className="bg-slate-950/90 text-slate-400 font-black uppercase text-[9px] tracking-wider border-b border-white/10">
                {/* LUNCH */}
                <th className="py-2 px-3 text-right bg-amber-950/20 text-amber-400">Actual (Rp)</th>
                <th className="py-2 px-3 text-right bg-amber-950/20 text-amber-300">% Kontribusi vs Target</th>
                <th className="py-2 px-3 text-right bg-amber-950/20 text-slate-400 border-r border-white/5">Vs Target Lunch ({activeSummary.lunchSplit.toFixed(0)}%)</th>

                {/* DINNER */}
                <th className="py-2 px-3 text-right bg-indigo-950/20 text-indigo-400">Actual (Rp)</th>
                <th className="py-2 px-3 text-right bg-indigo-950/20 text-indigo-300">% Kontribusi vs Target</th>
                <th className="py-2 px-3 text-right bg-indigo-950/20 text-slate-400 border-r border-white/5">Vs Target Dinner ({activeSummary.dinnerSplit.toFixed(0)}%)</th>

                {/* TOTAL */}
                <th className="py-2 px-3 text-right bg-emerald-950/20 text-emerald-400">Total Actual (Rp)</th>
                <th className="py-2 px-3 text-right bg-emerald-950/20 text-emerald-300">% Pencapaian</th>
                <th className="py-2 px-3 text-right bg-emerald-950/20 text-slate-400 border-r border-white/5">Selisih (+/-)</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
              {/* HARIAN MODE */}
              {viewPeriod === 'HARIAN' && dailyRows.map((r, idx) => {
                const targetLunchRef = Math.round(r.targetToday * (activeSummary.lunchSplit / 100));
                const targetDinnerRef = Math.max(0, r.targetToday - targetLunchRef);
                const diffLunch = r.lunchActual - targetLunchRef;
                const diffDinner = r.dinnerActual - targetDinnerRef;

                return (
                  <tr key={r.dateStr} className={`hover:bg-white/5 transition-colors ${r.isWeekend ? 'bg-amber-950/10' : ''}`}>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-white border-r border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-200">{r.dateStr}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                          r.isWeekend ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {r.dayName}
                        </span>
                      </div>
                    </td>
                    {/* TARGET TODAY */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200 border-r border-white/5 bg-slate-950/30">
                      {formatIDR(r.targetToday)}
                    </td>

                    {/* LUNCH ACTUAL */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                      {formatIDR(r.lunchActual)}
                    </td>
                    {/* % KONTRIBUSI LUNCH VS TARGET TODAY */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-amber-400 bg-amber-950/10 text-xs">
                      {r.targetToday > 0 ? `${r.lunchContrib.toFixed(1)}%` : '-'}
                    </td>
                    {/* VS TARGET 40% */}
                    <td className="py-2.5 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-amber-950/10">
                      <span className={diffLunch >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffLunch >= 0 ? '+' : ''}{formatIDR(diffLunch)}
                      </span>
                    </td>

                    {/* DINNER ACTUAL */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-300 bg-indigo-950/10">
                      {formatIDR(r.dinnerActual)}
                    </td>
                    {/* % KONTRIBUSI DINNER VS TARGET TODAY */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-400 bg-indigo-950/10 text-xs">
                      {r.targetToday > 0 ? `${r.dinnerContrib.toFixed(1)}%` : '-'}
                    </td>
                    {/* VS TARGET 60% */}
                    <td className="py-2.5 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-indigo-950/10">
                      <span className={diffDinner >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffDinner >= 0 ? '+' : ''}{formatIDR(diffDinner)}
                      </span>
                    </td>

                    {/* TOTAL ACTUAL */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/10">
                      {formatIDR(r.totalActual)}
                    </td>
                    {/* % TOTAL PENCAPAIAN */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-xs bg-emerald-950/10">
                      <span className={r.totalAch >= 100 ? 'text-emerald-400' : r.totalAch >= 85 ? 'text-blue-400' : 'text-rose-400'}>
                        {r.targetToday > 0 ? `${r.totalAch.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    {/* SELISIH */}
                    <td className="py-2.5 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-emerald-950/10">
                      <span className={r.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.variance >= 0 ? '+' : ''}{formatIDR(r.variance)}
                      </span>
                    </td>

                    {/* SPLIT L / D */}
                    <td className="py-2.5 px-3 text-center font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{r.lunchSplit.toFixed(0)}%</span>
                      <span className="text-slate-500 mx-1">:</span>
                      <span className="text-indigo-400 font-bold">{r.dinnerSplit.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}

              {/* WEEKLY MODE */}
              {viewPeriod === 'WEEKLY' && weeklyRows.map((r, idx) => {
                const targetLunchRef = Math.round(r.targetPeriod * (activeSummary.lunchSplit / 100));
                const targetDinnerRef = Math.max(0, r.targetPeriod - targetLunchRef);
                const diffLunch = r.lunchActual - targetLunchRef;
                const diffDinner = r.dinnerActual - targetDinnerRef;

                return (
                  <tr key={r.weekNum} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-black text-white border-r border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-white">{r.label}</span>
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                          {r.range} ({r.dayCount} Hari)
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-200 border-r border-white/5 bg-slate-950/30">
                      {formatIDR(r.targetPeriod)}
                    </td>

                    {/* LUNCH */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                      {formatIDR(r.lunchActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-amber-400 bg-amber-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.lunchContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-amber-950/10">
                      <span className={diffLunch >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffLunch >= 0 ? '+' : ''}{formatIDR(diffLunch)}
                      </span>
                    </td>

                    {/* DINNER */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-indigo-300 bg-indigo-950/10">
                      {formatIDR(r.dinnerActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-400 bg-indigo-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.dinnerContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-indigo-950/10">
                      <span className={diffDinner >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffDinner >= 0 ? '+' : ''}{formatIDR(diffDinner)}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/10">
                      {formatIDR(r.totalActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-xs bg-emerald-950/10">
                      <span className={r.totalAch >= 100 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.targetPeriod > 0 ? `${r.totalAch.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-emerald-950/10">
                      <span className={r.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.variance >= 0 ? '+' : ''}{formatIDR(r.variance)}
                      </span>
                    </td>

                    {/* SPLIT */}
                    <td className="py-3 px-3 text-center font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{r.lunchSplit.toFixed(0)}%</span>
                      <span className="text-slate-500 mx-1">:</span>
                      <span className="text-indigo-400 font-bold">{r.dinnerSplit.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}

              {/* MONTHLY MODE */}
              {viewPeriod === 'MONTHLY' && monthlyRows.map((r, idx) => {
                const targetLunchRef = Math.round(r.targetPeriod * (activeSummary.lunchSplit / 100));
                const targetDinnerRef = Math.max(0, r.targetPeriod - targetLunchRef);
                const diffLunch = r.lunchActual - targetLunchRef;
                const diffDinner = r.dinnerActual - targetDinnerRef;

                return (
                  <tr key={r.monthIdx} className={`hover:bg-white/5 transition-colors ${r.isCurrentMonth ? 'bg-emerald-950/20 font-bold' : ''}`}>
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-black text-white border-r border-white/5">
                      <div className="flex items-center justify-between">
                        <span>{r.monthName}</span>
                        {r.isCurrentMonth && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Bulan Aktif
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-200 border-r border-white/5 bg-slate-950/30">
                      {formatIDR(r.targetPeriod)}
                    </td>

                    {/* LUNCH */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                      {formatIDR(r.lunchActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-amber-400 bg-amber-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.lunchContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-amber-950/10">
                      <span className={diffLunch >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffLunch >= 0 ? '+' : ''}{formatIDR(diffLunch)}
                      </span>
                    </td>

                    {/* DINNER */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-indigo-300 bg-indigo-950/10">
                      {formatIDR(r.dinnerActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-400 bg-indigo-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.dinnerContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-indigo-950/10">
                      <span className={diffDinner >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffDinner >= 0 ? '+' : ''}{formatIDR(diffDinner)}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/10">
                      {formatIDR(r.totalActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-xs bg-emerald-950/10">
                      <span className={r.totalAch >= 100 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.targetPeriod > 0 ? `${r.totalAch.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-emerald-950/10">
                      <span className={r.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.variance >= 0 ? '+' : ''}{formatIDR(r.variance)}
                      </span>
                    </td>

                    {/* SPLIT */}
                    <td className="py-3 px-3 text-center font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{r.lunchSplit.toFixed(0)}%</span>
                      <span className="text-slate-500 mx-1">:</span>
                      <span className="text-indigo-400 font-bold">{r.dinnerSplit.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}

              {/* YTD MODE */}
              {viewPeriod === 'YTD' && ytdRows.map((r, idx) => {
                const targetLunchRef = Math.round(r.targetPeriod * (activeSummary.lunchSplit / 100));
                const targetDinnerRef = Math.max(0, r.targetPeriod - targetLunchRef);
                const diffLunch = r.lunchActual - targetLunchRef;
                const diffDinner = r.dinnerActual - targetDinnerRef;

                return (
                  <tr key={r.monthIdx} className={`hover:bg-white/5 transition-colors ${r.isCurrentMonth ? 'bg-indigo-950/20 font-bold' : ''}`}>
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-black text-white border-r border-white/5">
                      <div className="flex items-center justify-between">
                        <span>{r.label}</span>
                        {r.isCurrentMonth && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Bulan Berjalan
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-200 border-r border-white/5 bg-slate-950/30">
                      {formatIDR(r.targetPeriod)}
                    </td>

                    {/* LUNCH */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                      {formatIDR(r.lunchActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-amber-400 bg-amber-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.lunchContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-amber-950/10">
                      <span className={diffLunch >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffLunch >= 0 ? '+' : ''}{formatIDR(diffLunch)}
                      </span>
                    </td>

                    {/* DINNER */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-indigo-300 bg-indigo-950/10">
                      {formatIDR(r.dinnerActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-400 bg-indigo-950/10 text-xs">
                      {r.targetPeriod > 0 ? `${r.dinnerContrib.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-indigo-950/10">
                      <span className={diffDinner >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diffDinner >= 0 ? '+' : ''}{formatIDR(diffDinner)}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/10">
                      {formatIDR(r.totalActual)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-xs bg-emerald-950/10">
                      <span className={r.totalAch >= 100 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.targetPeriod > 0 ? `${r.totalAch.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-emerald-950/10">
                      <span className={r.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.variance >= 0 ? '+' : ''}{formatIDR(r.variance)}
                      </span>
                    </td>

                    {/* SPLIT */}
                    <td className="py-3 px-3 text-center font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{r.lunchSplit.toFixed(0)}%</span>
                      <span className="text-slate-500 mx-1">:</span>
                      <span className="text-indigo-400 font-bold">{r.dinnerSplit.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* SUMMARY FOOTER */}
            <tfoot>
              <tr className="bg-slate-950 font-black text-white text-xs border-t-2 border-emerald-500">
                <td colSpan={2} className="py-4 px-4 uppercase tracking-wider text-emerald-400 border-r border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-sigma text-emerald-400"></i>
                      {activeSummary.label}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono font-normal">
                      {activeArea === 'ALL' ? 'Seluruh Regional' : activeArea}
                    </span>
                  </div>
                </td>
                {/* TARGET */}
                <td className="py-4 px-3 text-right font-mono font-black text-white border-r border-white/10 bg-slate-950">
                  {formatIDR(activeSummary.totalTarget)}
                </td>

                {/* LUNCH ACTUAL */}
                <td className="py-4 px-3 text-right font-mono font-black text-amber-300 bg-amber-950/30">
                  {formatIDR(activeSummary.totalLunch)}
                </td>
                {/* % KONTRIBUSI LUNCH */}
                <td className="py-4 px-3 text-right font-mono font-black text-amber-400 bg-amber-950/30 text-sm">
                  {activeSummary.lunchContrib.toFixed(1)}%
                </td>
                {/* VS TARGET LUNCH */}
                <td className="py-4 px-3 text-right font-mono text-xs border-r border-white/10 bg-amber-950/30">
                  <span className={activeSummary.totalLunch >= activeSummary.totalTarget * (activeSummary.lunchSplit / 100) ? 'text-emerald-400' : 'text-rose-400'}>
                    {activeSummary.totalLunch >= activeSummary.totalTarget * (activeSummary.lunchSplit / 100) ? '+' : ''}
                    {formatIDR(activeSummary.totalLunch - Math.round(activeSummary.totalTarget * (activeSummary.lunchSplit / 100)))}
                  </span>
                </td>

                {/* DINNER ACTUAL */}
                <td className="py-4 px-3 text-right font-mono font-black text-indigo-300 bg-indigo-950/30">
                  {formatIDR(activeSummary.totalDinner)}
                </td>
                {/* % KONTRIBUSI DINNER */}
                <td className="py-4 px-3 text-right font-mono font-black text-indigo-400 bg-indigo-950/30 text-sm">
                  {activeSummary.dinnerContrib.toFixed(1)}%
                </td>
                {/* VS TARGET DINNER */}
                <td className="py-4 px-3 text-right font-mono text-xs border-r border-white/10 bg-indigo-950/30">
                  <span className={activeSummary.totalDinner >= activeSummary.totalTarget * (activeSummary.dinnerSplit / 100) ? 'text-emerald-400' : 'text-rose-400'}>
                    {activeSummary.totalDinner >= activeSummary.totalTarget * (activeSummary.dinnerSplit / 100) ? '+' : ''}
                    {formatIDR(activeSummary.totalDinner - Math.round(activeSummary.totalTarget * (activeSummary.dinnerSplit / 100)))}
                  </span>
                </td>

                {/* TOTAL ACTUAL */}
                <td className="py-4 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/30">
                  {formatIDR(activeSummary.totalActual)}
                </td>
                {/* % PENCAPAIAN */}
                <td className="py-4 px-3 text-right font-mono font-black text-sm bg-emerald-950/30">
                  <span className={activeSummary.totalAch >= 100 ? 'text-emerald-400' : 'text-rose-400'}>
                    {activeSummary.totalAch.toFixed(1)}%
                  </span>
                </td>
                {/* SELISIH */}
                <td className="py-4 px-3 text-right font-mono text-xs border-r border-white/10 bg-emerald-950/30">
                  <span className={activeSummary.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {activeSummary.variance >= 0 ? '+' : ''}{formatIDR(activeSummary.variance)}
                  </span>
                </td>

                {/* SPLIT */}
                <td className="py-4 px-3 text-center font-mono text-xs font-black">
                  <span className="text-amber-400">{activeSummary.lunchSplit.toFixed(0)}%</span>
                  <span className="text-slate-500 mx-1">:</span>
                  <span className="text-indigo-400">{activeSummary.dinnerSplit.toFixed(0)}%</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
