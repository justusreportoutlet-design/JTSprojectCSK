import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, getActiveOutletNames } from '../constants';
import { RegionalRevenueContributionTable } from './RegionalRevenueContributionTable';
import { RegionalWeekdayWeekendRevenueTable } from './RegionalWeekdayWeekendRevenueTable';

interface Props {
  allOutletsData: Record<string, any>;
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

export interface DayWeeklyData {
  day: number;
  dateStr: string;
  dayName: string;
  isWeekend: boolean;
  dailyTarget: number;
  targetLunch: number; // Daily target * 40%
  lunchActual: number;
  lunchAch: number; // (lunchActual / targetLunch) * 100
  targetDinner: number; // Daily target * 60%
  dinnerActual: number;
  dinnerAch: number; // (dinnerActual / targetDinner) * 100
  totalTarget: number; // targetLunch + targetDinner
  totalActual: number; // lunchActual + dinnerActual
  overallPerformance: number; // (totalActual / totalTarget) * 100
}

export interface WeekSummary {
  weekNum: number;
  label: string;
  dateRange: string;
  days: DayWeeklyData[];
  subtotalDailyTarget: number;
  subtotalTargetLunch: number;
  subtotalLunchActual: number;
  subtotalLunchAch: number;
  subtotalTargetDinner: number;
  subtotalDinnerActual: number;
  subtotalDinnerAch: number;
  subtotalTotalTarget: number;
  subtotalTotalActual: number;
  subtotalPerformance: number;
}

export const RegionalWeeklyRevenueRecapTable: React.FC<Props> = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [activeArea, setActiveArea] = useState<string>(selectedArea || 'ALL');
  const [activeOutlet, setActiveOutlet] = useState<string>(selectedOutlet || 'ALL');
  const [viewMode, setViewMode] = useState<'FULL_MATRIX' | 'CONTRIBUTION_TABLE' | 'WEEKDAY_WEEKEND_AVG' | 'WEEK_CARDS' | 'OUTLET_MATRIX'>('FULL_MATRIX');
  const [searchTerm, setSearchTerm] = useState<string>('');

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

  // List of outlets filtered by area & search
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

  // Compute daily data for the selected scope of outlets
  const dailyDataList = useMemo<DayWeeklyData[]>(() => {
    const targetOutlets = activeOutlet !== 'ALL'
      ? [activeOutlet]
      : (activeArea !== 'ALL' ? activeOutletsList.filter(o => getAreaForOutlet(o) === activeArea) : activeOutletsList);

    // 1. Calculate each outlet's MTD actual Lunch and Dinner to derive its own MTD contribution percentage
    const outletRatios: Record<string, { lunchRatio: number; dinnerRatio: number; lunchPct: number; dinnerPct: number }> = {};

    targetOutlets.forEach(outletName => {
      const outletMonths = allOutletsData?.[outletName] || allOutletsData?.[outletName.trim()] || Object.entries(allOutletsData || {}).find(([k]) => k.trim().toUpperCase() === outletName.trim().toUpperCase())?.[1] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || outletMonths.monthlyData?.[String(selectedMonth)] || outletMonths.monthlyData?.[selectedMonth] || {};
      const sales = mData.sales || outletMonths.sales || mData || {};
      const dailyRec = sales.dailyRecording || mData.dailyRecording || outletMonths.dailyRecording || outletMonths.dailySales || {};

      let oLunch = 0;
      let oDinner = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        const entry = dailyRec[dateStr] || dailyRec[String(d)] || {};
        let l = Number(entry.lunchRevenue) || Number(entry.revenueLunch) || Number(entry.lunchActual) || Number(entry.lunchRev) || 0;
        let dn = Number(entry.dinnerRevenue) || Number(entry.revenueDinner) || Number(entry.dinnerActual) || Number(entry.dinnerRev) || 0;
        const tot = Number(entry.revenue) || Number(entry.totalRevenue) || Number(entry.actual) || 0;
        if (l === 0 && dn === 0 && tot > 0) {
          l = Math.round(tot * 0.40);
          dn = tot - l;
        } else if (dn === 0 && tot > l && l > 0) {
          dn = tot - l;
        } else if (l === 0 && tot > dn && dn > 0) {
          l = tot - dn;
        }
        oLunch += l;
        oDinner += dn;
      }

      const oTot = oLunch + oDinner;
      const lunchRatio = oTot > 0 ? (oLunch / oTot) : 0.40;
      const dinnerRatio = oTot > 0 ? (oDinner / oTot) : 0.60;
      outletRatios[outletName] = {
        lunchRatio,
        dinnerRatio,
        lunchPct: lunchRatio * 100,
        dinnerPct: dinnerRatio * 100
      };
    });

    const result: DayWeeklyData[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
      const dt = new Date(selectedYear, selectedMonth, d);
      const dayName = DAY_NAMES[dt.getDay()];
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;

      let dayTargetSum = 0;
      let dayTargetLunchSum = 0;
      let dayTargetDinnerSum = 0;
      let dayLunchSum = 0;
      let dayDinnerSum = 0;

      targetOutlets.forEach(outletName => {
        const outletMonths = allOutletsData?.[outletName] || allOutletsData?.[outletName.trim()] || Object.entries(allOutletsData || {}).find(([k]) => k.trim().toUpperCase() === outletName.trim().toUpperCase())?.[1] || {};
        const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || outletMonths.monthlyData?.[String(selectedMonth)] || outletMonths.monthlyData?.[selectedMonth] || {};
        const sales = mData.sales || outletMonths.sales || mData || {};
        const dailyRec = sales.dailyRecording || mData.dailyRecording || outletMonths.dailyRecording || outletMonths.dailySales || {};
        const entry = dailyRec[dateStr] || dailyRec[String(d)] || {};

        // 1. Target Harian
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
          const budget = (sales.monthlyBudgets || {})[monthKey] || sales.budgetRevenue || (sales.monthlyBudgets || {})[String(selectedMonth)] || 0;
          outletTarget = budget > 0 ? Math.round(budget / daysInMonth) : 0;
        }

        dayTargetSum += outletTarget;

        // Target Lunch & Dinner dynamically derived from each outlet's actual MTD contribution percentage
        const { lunchRatio } = outletRatios[outletName] || { lunchRatio: 0.40, dinnerRatio: 0.60 };
        const oTargetLunch = Math.round(outletTarget * lunchRatio);
        const oTargetDinner = Math.max(0, outletTarget - oTargetLunch);

        dayTargetLunchSum += oTargetLunch;
        dayTargetDinnerSum += oTargetDinner;

        // 2. Lunch Actual
        let lunch = Number(entry.lunchRevenue) || Number(entry.revenueLunch) || Number(entry.lunchActual) || Number(entry.lunchRev) || 0;

        // 3. Dinner Actual
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

        dayLunchSum += lunch;
        dayDinnerSum += dinner;
      });

      const lunchAch = dayTargetLunchSum > 0 ? (dayLunchSum / dayTargetLunchSum) * 100 : 0;
      const dinnerAch = dayTargetDinnerSum > 0 ? (dayDinnerSum / dayTargetDinnerSum) * 100 : 0;

      const totalTarget = dayTargetSum;
      const totalActual = dayLunchSum + dayDinnerSum;
      const overallPerformance = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

      result.push({
        day: d,
        dateStr,
        dayName,
        isWeekend,
        dailyTarget: dayTargetSum,
        targetLunch: dayTargetLunchSum,
        lunchActual: dayLunchSum,
        lunchAch,
        targetDinner: dayTargetDinnerSum,
        dinnerActual: dayDinnerSum,
        dinnerAch,
        totalTarget,
        totalActual,
        overallPerformance
      });
    }

    return result;
  }, [allOutletsData, selectedMonth, selectedYear, activeArea, activeOutlet, daysInMonth, monthKey]);

  // Group into 4 Weeks (Cut-off 1 - 30 / Akhir Bulan, sisa hari tidak sampai 7 hari terhitung Week 4 sehingga Week 4 bisa lebih dari 7 hari)
  const weekSummaries = useMemo<WeekSummary[]>(() => {
    const weeks: { weekNum: number; label: string; startDay: number; endDay: number }[] = [
      { weekNum: 1, label: 'Week 1', startDay: 1, endDay: 7 },
      { weekNum: 2, label: 'Week 2', startDay: 8, endDay: 14 },
      { weekNum: 3, label: 'Week 3', startDay: 15, endDay: 21 },
      { weekNum: 4, label: 'Week 4', startDay: 22, endDay: daysInMonth }
    ];

    return weeks.map(w => {
      const days = dailyDataList.filter(d => d.day >= w.startDay && d.day <= w.endDay);
      const subtotalDailyTarget = days.reduce((sum, d) => sum + d.dailyTarget, 0);
      const subtotalTargetLunch = days.reduce((sum, d) => sum + d.targetLunch, 0);
      const subtotalLunchActual = days.reduce((sum, d) => sum + d.lunchActual, 0);
      const subtotalLunchAch = subtotalTargetLunch > 0 ? (subtotalLunchActual / subtotalTargetLunch) * 100 : 0;

      const subtotalTargetDinner = days.reduce((sum, d) => sum + d.targetDinner, 0);
      const subtotalDinnerActual = days.reduce((sum, d) => sum + d.dinnerActual, 0);
      const subtotalDinnerAch = subtotalTargetDinner > 0 ? (subtotalDinnerActual / subtotalTargetDinner) * 100 : 0;

      const subtotalTotalTarget = subtotalTargetLunch + subtotalTargetDinner;
      const subtotalTotalActual = subtotalLunchActual + subtotalDinnerActual;
      const subtotalPerformance = subtotalTotalTarget > 0 ? (subtotalTotalActual / subtotalTotalTarget) * 100 : 0;

      return {
        weekNum: w.weekNum,
        label: w.label,
        dateRange: `Tgl ${w.startDay} - ${Math.min(w.endDay, daysInMonth)}`,
        days,
        subtotalDailyTarget,
        subtotalTargetLunch,
        subtotalLunchActual,
        subtotalLunchAch,
        subtotalTargetDinner,
        subtotalDinnerActual,
        subtotalDinnerAch,
        subtotalTotalTarget,
        subtotalTotalActual,
        subtotalPerformance
      };
    });
  }, [dailyDataList, daysInMonth]);

  // Grand MTD Totals
  const mtdTotals = useMemo(() => {
    const totalDailyTarget = dailyDataList.reduce((sum, d) => sum + d.dailyTarget, 0);
    const totalTargetLunch = dailyDataList.reduce((sum, d) => sum + d.targetLunch, 0);
    const totalLunchActual = dailyDataList.reduce((sum, d) => sum + d.lunchActual, 0);
    const totalLunchAch = totalTargetLunch > 0 ? (totalLunchActual / totalTargetLunch) * 100 : 0;

    const totalTargetDinner = dailyDataList.reduce((sum, d) => sum + d.targetDinner, 0);
    const totalDinnerActual = dailyDataList.reduce((sum, d) => sum + d.dinnerActual, 0);
    const totalDinnerAch = totalTargetDinner > 0 ? (totalDinnerActual / totalTargetDinner) * 100 : 0;

    const grandTotalTarget = totalTargetLunch + totalTargetDinner;
    const grandTotalActual = totalLunchActual + totalDinnerActual;
    const grandPerformance = grandTotalTarget > 0 ? (grandTotalActual / grandTotalTarget) * 100 : 0;

    const lunchPct = grandTotalActual > 0 ? (totalLunchActual / grandTotalActual) * 100 : (grandTotalTarget > 0 ? (totalTargetLunch / grandTotalTarget) * 100 : 40.0);
    const dinnerPct = grandTotalActual > 0 ? (totalDinnerActual / grandTotalActual) * 100 : (grandTotalTarget > 0 ? (totalTargetDinner / grandTotalTarget) * 100 : 60.0);

    return {
      totalDailyTarget,
      totalTargetLunch,
      totalLunchActual,
      totalLunchAch,
      totalTargetDinner,
      totalDinnerActual,
      totalDinnerAch,
      grandTotalTarget,
      grandTotalActual,
      grandPerformance,
      lunchPct,
      dinnerPct
    };
  }, [dailyDataList]);

  // Outlet-by-outlet summaries for OUTLET_MATRIX view
  const outletSummaries = useMemo(() => {
    return filteredOutlets.map(outletName => {
      const area = getAreaForOutlet(outletName);
      const outletMonths = allOutletsData?.[outletName] || allOutletsData?.[outletName.trim()] || Object.entries(allOutletsData || {}).find(([k]) => k.trim().toUpperCase() === outletName.trim().toUpperCase())?.[1] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || outletMonths.monthlyData?.[String(selectedMonth)] || outletMonths.monthlyData?.[selectedMonth] || {};
      const sales = mData.sales || outletMonths.sales || mData || {};
      const dailyRec = sales.dailyRecording || mData.dailyRecording || outletMonths.dailyRecording || outletMonths.dailySales || {};

      let totalTarget = 0;
      let totalLunch = 0;
      let totalDinner = 0;
      const weekActuals = [0, 0, 0, 0, 0];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        const entry = dailyRec[dateStr] || dailyRec[String(d)] || {};

        let outletTarget = 0;
        if (entry.target !== undefined && Number(entry.target) > 0) {
          outletTarget = Number(entry.target);
        } else if (mData.dailyTargets?.[dateStr] !== undefined) {
          outletTarget = Number(mData.dailyTargets[dateStr]) || 0;
        } else if (mData.dailyTargets?.[String(d)] !== undefined) {
          outletTarget = Number(mData.dailyTargets[String(d)]) || 0;
        } else if (sales.dailyTargets?.[dateStr] !== undefined) {
          outletTarget = Number(sales.dailyTargets[dateStr]) || 0;
        } else {
          const budget = (sales.monthlyBudgets || {})[monthKey] || sales.budgetRevenue || (sales.monthlyBudgets || {})[String(selectedMonth)] || 0;
          outletTarget = budget > 0 ? Math.round(budget / daysInMonth) : 0;
        }
        totalTarget += outletTarget;

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

        totalLunch += lunch;
        totalDinner += dinner;

        const wIdx = d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : d <= 28 ? 3 : 4;
        weekActuals[wIdx] += (lunch + dinner);
      }

      const totalActual = totalLunch + totalDinner;
      const lunchRatio = totalActual > 0 ? (totalLunch / totalActual) : 0.40;
      const dinnerRatio = totalActual > 0 ? (totalDinner / totalActual) : 0.60;
      const lunchPct = lunchRatio * 100;
      const dinnerPct = dinnerRatio * 100;

      const targetLunch = Math.round(totalTarget * lunchRatio);
      const targetDinner = Math.max(0, totalTarget - targetLunch);
      const lunchAch = targetLunch > 0 ? (totalLunch / targetLunch) * 100 : 0;
      const dinnerAch = targetDinner > 0 ? (totalDinner / targetDinner) * 100 : 0;
      const overallPerformance = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

      return {
        outlet: outletName,
        area,
        totalTarget,
        targetLunch,
        totalLunch,
        lunchAch,
        lunchPct,
        targetDinner,
        totalDinner,
        dinnerAch,
        dinnerPct,
        totalActual,
        overallPerformance,
        weekActuals
      };
    });
  }, [filteredOutlets, allOutletsData, selectedMonth, selectedYear, daysInMonth, monthKey]);

  // Helper formatter
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(val || 0);
  };

  const getAchColor = (ach: number) => {
    if (ach >= 100) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (ach >= 85) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    if (ach >= 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Weekly Recap ${monthName} ${selectedYear}`);

    worksheet.columns = [
      { header: 'Minggu', key: 'week', width: 12 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Hari', key: 'dayName', width: 12 },
      { header: 'Daily Target (100%)', key: 'dailyTarget', width: 22 },
      { header: `Target Lunch (MTD ${mtdTotals.lunchPct.toFixed(1)}%)`, key: 'targetLunch', width: 24 },
      { header: 'Actual Lunch', key: 'lunchActual', width: 20 },
      { header: 'Ach Lunch (%)', key: 'lunchAch', width: 15 },
      { header: `Target Dinner (MTD ${mtdTotals.dinnerPct.toFixed(1)}%)`, key: 'targetDinner', width: 24 },
      { header: 'Actual Dinner', key: 'dinnerActual', width: 20 },
      { header: 'Ach Dinner (%)', key: 'dinnerAch', width: 15 },
      { header: 'Total Target', key: 'totalTarget', width: 22 },
      { header: 'Total Actual', key: 'totalActual', width: 22 },
      { header: 'Performance (%)', key: 'performance', width: 16 }
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    weekSummaries.forEach(week => {
      week.days.forEach(d => {
        worksheet.addRow({
          week: week.label,
          date: d.dateStr,
          dayName: d.dayName,
          dailyTarget: d.dailyTarget,
          targetLunch: d.targetLunch,
          lunchActual: d.lunchActual,
          lunchAch: Number(d.lunchAch.toFixed(1)),
          targetDinner: d.targetDinner,
          dinnerActual: d.dinnerActual,
          dinnerAch: Number(d.dinnerAch.toFixed(1)),
          totalTarget: d.totalTarget,
          totalActual: d.totalActual,
          performance: Number(d.overallPerformance.toFixed(1))
        });
      });

      // Subtotal Row
      const subRow = worksheet.addRow({
        week: `TOTAL ${week.label}`,
        date: week.dateRange,
        dayName: '-',
        dailyTarget: week.subtotalDailyTarget,
        targetLunch: week.subtotalTargetLunch,
        lunchActual: week.subtotalLunchActual,
        lunchAch: Number(week.subtotalLunchAch.toFixed(1)),
        targetDinner: week.subtotalTargetDinner,
        dinnerActual: week.subtotalDinnerActual,
        dinnerAch: Number(week.subtotalDinnerAch.toFixed(1)),
        totalTarget: week.subtotalTotalTarget,
        totalActual: week.subtotalTotalActual,
        performance: Number(week.subtotalPerformance.toFixed(1))
      });
      subRow.font = { bold: true };
      subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });

    // Grand Total Row
    const grandRow = worksheet.addRow({
      week: 'GRAND TOTAL MTD',
      date: `${monthName} ${selectedYear}`,
      dayName: '-',
      dailyTarget: mtdTotals.totalDailyTarget,
      targetLunch: mtdTotals.totalTargetLunch,
      lunchActual: mtdTotals.totalLunchActual,
      lunchAch: Number(mtdTotals.totalLunchAch.toFixed(1)),
      targetDinner: mtdTotals.totalTargetDinner,
      dinnerActual: mtdTotals.totalDinnerActual,
      dinnerAch: Number(mtdTotals.totalDinnerAch.toFixed(1)),
      totalTarget: mtdTotals.grandTotalTarget,
      totalActual: mtdTotals.grandTotalActual,
      performance: Number(mtdTotals.grandPerformance.toFixed(1))
    });
    grandRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    grandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Rekapan_Weekly_Revenue_${activeArea}_${monthName}_${selectedYear}.xlsx`);
    showToast?.('Rekapan Weekly berhasil diekspor ke Excel', 'success');
  };

  // Copy WhatsApp Summary
  const handleCopyWhatsApp = () => {
    let msg = `*REKAPAN WEEKLY REVENUE REGIONAL*\n`;
    msg += `*Periode:* ${monthName} ${selectedYear}\n`;
    msg += `*Area:* ${activeArea} | *Outlet:* ${activeOutlet}\n`;
    msg += `------------------------------------\n\n`;

    weekSummaries.forEach(w => {
      msg += `*${w.label} (${w.dateRange})*\n`;
      msg += `* Target Lunch (${mtdTotals.lunchPct.toFixed(1)}% MTD): Rp.${formatIDR(w.subtotalTargetLunch)}\n`;
      msg += `* Actual Lunch: Rp.${formatIDR(w.subtotalLunchActual)} (${w.subtotalLunchAch.toFixed(1)}%)\n`;
      msg += `* Target Dinner (${mtdTotals.dinnerPct.toFixed(1)}% MTD): Rp.${formatIDR(w.subtotalTargetDinner)}\n`;
      msg += `* Actual Dinner: Rp.${formatIDR(w.subtotalDinnerActual)} (${w.subtotalDinnerAch.toFixed(1)}%)\n`;
      msg += `* Total Target: Rp.${formatIDR(w.subtotalTotalTarget)}\n`;
      msg += `* Total Actual: Rp.${formatIDR(w.subtotalTotalActual)}\n`;
      msg += `* *Performance:* ${w.subtotalPerformance.toFixed(1)}%\n\n`;
    });

    msg += `------------------------------------\n`;
    msg += `*GRAND TOTAL MTD:*\n`;
    msg += `* Total Target: Rp.${formatIDR(mtdTotals.grandTotalTarget)}\n`;
    msg += `* Total Lunch (${mtdTotals.lunchPct.toFixed(1)}% MTD): Rp.${formatIDR(mtdTotals.totalLunchActual)} / Target Rp.${formatIDR(mtdTotals.totalTargetLunch)} (${mtdTotals.totalLunchAch.toFixed(1)}%)\n`;
    msg += `* Total Dinner (${mtdTotals.dinnerPct.toFixed(1)}% MTD): Rp.${formatIDR(mtdTotals.totalDinnerActual)} / Target Rp.${formatIDR(mtdTotals.totalTargetDinner)} (${mtdTotals.totalDinnerAch.toFixed(1)}%)\n`;
    msg += `* Total Revenue: Rp.${formatIDR(mtdTotals.grandTotalActual)}\n`;
    msg += `* *MTD Performance:* ${mtdTotals.grandPerformance.toFixed(1)}%\n`;

    navigator.clipboard.writeText(msg);
    showToast?.('Ringkasan Weekly disalin ke clipboard!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-5">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                REGIONAL REVENUE FORMULA
              </span>
              <span className="text-xs text-slate-400">• Sesuai MTD Kontribusi Lunch ({mtdTotals.lunchPct.toFixed(1)}%) & Dinner ({mtdTotals.dinnerPct.toFixed(1)}%)</span>
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <i className="fas fa-calendar-week text-amber-400"></i>
              Rekapan Weekly Revenue
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Perhitungan Target Lunch &amp; Dinner disesuaikan dinamis dengan MTD rata-rata persentase kontribusi pencapaian Lunch &amp; Dinner setiap outlet.
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
              Salin WA Summary
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

        {/* FILTERS & VIEW MODE */}
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
                        ? 'bg-amber-500 text-slate-950 shadow-md'
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
                className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-amber-500"
              >
                <option value="ALL">Semua Outlet ({filteredOutlets.length})</option>
                {filteredOutlets.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex flex-wrap rounded-xl overflow-hidden border border-white/10 bg-slate-950 p-1 self-start md:self-auto gap-1">
            <button
              type="button"
              onClick={() => setViewMode('FULL_MATRIX')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'FULL_MATRIX'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table text-[10px]"></i>
              Matriks Tanggal (1-31)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CONTRIBUTION_TABLE')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'CONTRIBUTION_TABLE'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-pie-chart text-[10px]"></i>
              % Kontribusi Lunch/Dinner
            </button>
            <button
              type="button"
              onClick={() => setViewMode('WEEKDAY_WEEKEND_AVG')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'WEEKDAY_WEEKEND_AVG'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-arrows-split-up-and-left text-[10px]"></i>
              Rata2 Weekday vs Weekend
            </button>
            <button
              type="button"
              onClick={() => setViewMode('WEEK_CARDS')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'WEEK_CARDS'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-th-large text-[10px]"></i>
              Kartu Mingguan (W1-W5)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('OUTLET_MATRIX')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'OUTLET_MATRIX'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-store text-[10px]"></i>
              Matriks Per Outlet
            </button>
          </div>
        </div>

        {/* TOP KPI CARDS (MTD SUMMARY) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* 1. LUNCH METRICS */}
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-400">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-sun"></i> LUNCH ({mtdTotals.lunchPct.toFixed(1)}% TARGET MTD)
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[9px] ${getAchColor(mtdTotals.totalLunchAch)}`}>
                {mtdTotals.totalLunchAch.toFixed(1)}% Ach
              </span>
            </div>
            <div className="text-xl font-black text-white">
              Rp {formatIDR(mtdTotals.totalLunchActual)}
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Target: Rp {formatIDR(mtdTotals.totalTargetLunch)}</span>
              <span className={mtdTotals.totalLunchActual >= mtdTotals.totalTargetLunch ? 'text-emerald-400' : 'text-rose-400'}>
                {mtdTotals.totalLunchActual >= mtdTotals.totalTargetLunch ? '+' : ''}
                {formatIDR(mtdTotals.totalLunchActual - mtdTotals.totalTargetLunch)}
              </span>
            </div>
          </div>

          {/* 2. DINNER METRICS */}
          <div className="bg-slate-950/60 border border-indigo-500/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-indigo-400">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-moon"></i> DINNER ({mtdTotals.dinnerPct.toFixed(1)}% TARGET MTD)
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[9px] ${getAchColor(mtdTotals.totalDinnerAch)}`}>
                {mtdTotals.totalDinnerAch.toFixed(1)}% Ach
              </span>
            </div>
            <div className="text-xl font-black text-white">
              Rp {formatIDR(mtdTotals.totalDinnerActual)}
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Target: Rp {formatIDR(mtdTotals.totalTargetDinner)}</span>
              <span className={mtdTotals.totalDinnerActual >= mtdTotals.totalTargetDinner ? 'text-emerald-400' : 'text-rose-400'}>
                {mtdTotals.totalDinnerActual >= mtdTotals.totalTargetDinner ? '+' : ''}
                {formatIDR(mtdTotals.totalDinnerActual - mtdTotals.totalTargetDinner)}
              </span>
            </div>
          </div>

          {/* 3. TOTAL REVENUE MTD */}
          <div className="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-400">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-cash-register"></i> TOTAL REVENUE MTD
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[9px] ${getAchColor(mtdTotals.grandPerformance)}`}>
                {mtdTotals.grandPerformance.toFixed(1)}%
              </span>
            </div>
            <div className="text-xl font-black text-white">
              Rp {formatIDR(mtdTotals.grandTotalActual)}
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Target: Rp {formatIDR(mtdTotals.grandTotalTarget)}</span>
              <span className="text-emerald-400 font-bold">Lunch + Dinner</span>
            </div>
          </div>

          {/* 4. OVERALL PERFORMANCE */}
          <div className="bg-slate-950/60 border border-purple-500/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-purple-400">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-chart-pie"></i> PERFORMANCE TARGET
              </span>
              <span className="text-xs text-slate-400">{monthName} {selectedYear}</span>
            </div>
            <div className="text-xl font-black text-white flex items-center gap-2">
              <span>{mtdTotals.grandPerformance.toFixed(1)}%</span>
              <span className="text-xs text-slate-400 font-normal">dari target</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  mtdTotals.grandPerformance >= 100
                    ? 'bg-emerald-500'
                    : mtdTotals.grandPerformance >= 80
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, mtdTotals.grandPerformance)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW 0A: REVENUE CONTRIBUTION TABLE (% LUNCH & DINNER VS TARGET TODAY) */}
      {viewMode === 'CONTRIBUTION_TABLE' && (
        <RegionalRevenueContributionTable
          allOutletsData={allOutletsData}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={activeArea}
          selectedOutlet={activeOutlet}
          onSelectOutlet={(o) => {
            setActiveOutlet(o);
            onSelectOutlet?.(o);
          }}
          showToast={showToast}
        />
      )}

      {/* VIEW 0B: WEEKDAY VS WEEKEND REVENUE AVERAGE TABLE */}
      {viewMode === 'WEEKDAY_WEEKEND_AVG' && (
        <RegionalWeekdayWeekendRevenueTable
          allOutletsData={allOutletsData}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={activeArea}
          selectedOutlet={activeOutlet}
          onSelectOutlet={(o) => {
            setActiveOutlet(o);
            onSelectOutlet?.(o);
          }}
          showToast={showToast}
        />
      )}

      {/* VIEW 1: FULL MATRIX (1 - 31 GROUPED BY WEEKS) */}
      {viewMode === 'FULL_MATRIX' && (
        <div className="space-y-6">
          {weekSummaries.map(week => (
            <div
              key={week.weekNum}
              className="bg-slate-900/80 border border-white/10 rounded-3xl overflow-hidden shadow-xl"
            >
              {/* Week Header */}
              <div className="px-6 py-4 bg-slate-950/80 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs border border-amber-500/30">
                    W{week.weekNum}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                      {week.label} <span className="text-slate-400 font-bold lowercase">({week.dateRange})</span>
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {week.days.length} Hari Operasional • Formula: Daily Target × MTD Kontribusi Lunch ({mtdTotals.lunchPct.toFixed(1)}%) & Dinner ({mtdTotals.dinnerPct.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-black">Performance Minggu Ini</div>
                    <div className="text-sm font-black text-amber-400">
                      {week.subtotalPerformance.toFixed(1)}%{' '}
                      <span className="text-[10px] text-slate-400 font-normal">
                        (Rp {formatIDR(week.subtotalTotalActual)} / Rp {formatIDR(week.subtotalTotalTarget)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4 font-black">Tanggal</th>
                      <th className="py-3 px-4 font-black">Hari</th>
                      <th className="py-3 px-4 font-black text-right">Daily Target</th>
                      <th className="py-3 px-4 font-black text-right text-amber-300">Target Lunch ({mtdTotals.lunchPct.toFixed(1)}%)</th>
                      <th className="py-3 px-4 font-black text-right text-amber-300">Actual Lunch</th>
                      <th className="py-3 px-4 font-black text-center text-amber-300">Ach Lunch (%)</th>
                      <th className="py-3 px-4 font-black text-right text-indigo-300">Target Dinner ({mtdTotals.dinnerPct.toFixed(1)}%)</th>
                      <th className="py-3 px-4 font-black text-right text-indigo-300">Actual Dinner</th>
                      <th className="py-3 px-4 font-black text-center text-indigo-300">Ach Dinner (%)</th>
                      <th className="py-3 px-4 font-black text-right text-emerald-300">Total Target</th>
                      <th className="py-3 px-4 font-black text-right text-emerald-300">Total Actual</th>
                      <th className="py-3 px-4 font-black text-center text-purple-300">Performance (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {week.days.map(d => (
                      <tr
                        key={d.day}
                        className={`hover:bg-white/[0.03] transition-colors ${
                          d.isWeekend ? 'bg-amber-500/[0.02]' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-bold text-white font-sans">
                          {String(d.day).padStart(2, '0')} {monthName.slice(0, 3)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 font-sans">
                          <span className={d.isWeekend ? 'text-amber-400 font-bold' : ''}>
                            {d.dayName}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-200">
                          {formatIDR(d.dailyTarget)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-amber-300">
                          {formatIDR(d.targetLunch)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-white">
                          {formatIDR(d.lunchActual)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(d.lunchAch)}`}>
                            {d.lunchAch.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-indigo-300">
                          {formatIDR(d.targetDinner)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-white">
                          {formatIDR(d.dinnerActual)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(d.dinnerAch)}`}>
                            {d.dinnerAch.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {formatIDR(d.totalTarget)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-black text-white">
                          {formatIDR(d.totalActual)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getAchColor(d.overallPerformance)}`}>
                            {d.overallPerformance.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Subtotal Row */}
                    <tr className="bg-slate-950/80 font-black text-xs border-t-2 border-white/10 text-white">
                      <td colSpan={2} className="py-3 px-4 uppercase text-amber-400 font-sans tracking-wider">
                        Subtotal {week.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-200">
                        {formatIDR(week.subtotalDailyTarget)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-300">
                        {formatIDR(week.subtotalTargetLunch)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white">
                        {formatIDR(week.subtotalLunchActual)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(week.subtotalLunchAch)}`}>
                          {week.subtotalLunchAch.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-indigo-300">
                        {formatIDR(week.subtotalTargetDinner)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white">
                        {formatIDR(week.subtotalDinnerActual)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(week.subtotalDinnerAch)}`}>
                          {week.subtotalDinnerAch.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">
                        {formatIDR(week.subtotalTotalTarget)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-300">
                        {formatIDR(week.subtotalTotalActual)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getAchColor(week.subtotalPerformance)}`}>
                          {week.subtotalPerformance.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* GRAND TOTAL MTD TABLE */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4 mb-4">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">KONSOLIDASI AKUMULATIF</span>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">Grand Total MTD ({monthName} {selectedYear})</h4>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Total Performance MTD: </span>
                <span className={`px-3 py-1 rounded-full text-sm font-black border ml-2 ${getAchColor(mtdTotals.grandPerformance)}`}>
                  {mtdTotals.grandPerformance.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-black">Total Target Lunch ({mtdTotals.lunchPct.toFixed(1)}%)</span>
                <div className="text-sm font-black text-amber-300">Rp {formatIDR(mtdTotals.totalTargetLunch)}</div>
                <div className="text-[10px] text-slate-400">Actual: Rp {formatIDR(mtdTotals.totalLunchActual)} ({mtdTotals.totalLunchAch.toFixed(1)}%)</div>
              </div>
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-black">Total Target Dinner ({mtdTotals.dinnerPct.toFixed(1)}%)</span>
                <div className="text-sm font-black text-indigo-300">Rp {formatIDR(mtdTotals.totalTargetDinner)}</div>
                <div className="text-[10px] text-slate-400">Actual: Rp {formatIDR(mtdTotals.totalDinnerActual)} ({mtdTotals.totalDinnerAch.toFixed(1)}%)</div>
              </div>
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-black">Total Target Revenue</span>
                <div className="text-sm font-black text-white">Rp {formatIDR(mtdTotals.grandTotalTarget)}</div>
                <div className="text-[10px] text-slate-400">100% Target Operasional</div>
              </div>
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
                <span className="text-[10px] text-emerald-400 uppercase font-black">Total Revenue Actual</span>
                <div className="text-base font-black text-emerald-300">Rp {formatIDR(mtdTotals.grandTotalActual)}</div>
                <div className="text-[10px] text-emerald-400 font-bold">Variance: Rp {formatIDR(mtdTotals.grandTotalActual - mtdTotals.grandTotalTarget)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WEEK CARDS (SIDE-BY-SIDE SUMMARY) */}
      {viewMode === 'WEEK_CARDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {weekSummaries.map(w => (
            <div
              key={w.weekNum}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-xl space-y-5 hover:border-amber-500/30 transition-all"
            >
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-black flex items-center justify-center border border-amber-500/30">
                      W{w.weekNum}
                    </span>
                    <h4 className="text-base font-black text-white uppercase tracking-tight">{w.label}</h4>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">{w.dateRange}</span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getAchColor(w.subtotalPerformance)}`}>
                  {w.subtotalPerformance.toFixed(1)}%
                </span>
              </div>

              {/* Lunch Breakdown */}
              <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-amber-500/20">
                <div className="flex justify-between text-[10px] font-black uppercase text-amber-400">
                  <span>LUNCH ({mtdTotals.lunchPct.toFixed(1)}% Target MTD)</span>
                  <span>{w.subtotalLunchAch.toFixed(1)}% Ach</span>
                </div>
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span className="text-slate-400">Target: Rp {formatIDR(w.subtotalTargetLunch)}</span>
                  <span className="text-white">Actual: Rp {formatIDR(w.subtotalLunchActual)}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-amber-400 h-full" style={{ width: `${Math.min(100, w.subtotalLunchAch)}%` }}></div>
                </div>
              </div>

              {/* Dinner Breakdown */}
              <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-indigo-500/20">
                <div className="flex justify-between text-[10px] font-black uppercase text-indigo-400">
                  <span>DINNER ({mtdTotals.dinnerPct.toFixed(1)}% Target MTD)</span>
                  <span>{w.subtotalDinnerAch.toFixed(1)}% Ach</span>
                </div>
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span className="text-slate-400">Target: Rp {formatIDR(w.subtotalTargetDinner)}</span>
                  <span className="text-white">Actual: Rp {formatIDR(w.subtotalDinnerActual)}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-400 h-full" style={{ width: `${Math.min(100, w.subtotalDinnerAch)}%` }}></div>
                </div>
              </div>

              {/* Total Week Result */}
              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black block">Total Actual</span>
                  <span className="text-base font-black text-emerald-400">Rp {formatIDR(w.subtotalTotalActual)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-black block">Target Total</span>
                  <span className="text-xs font-bold text-slate-300">Rp {formatIDR(w.subtotalTotalTarget)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: OUTLET MATRIX TABLE */}
      {viewMode === 'OUTLET_MATRIX' && (
        <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/10 pb-4">
            <div>
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">BREAKDOWN PER OUTLET</span>
              <h4 className="text-xl font-black text-white uppercase tracking-tight">Matriks Revenue Per Outlet ({monthName} {selectedYear})</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Lunch &amp; Dinner dihitung dinamis sesuai MTD rata-rata persentase kontribusi pencapaian Actual Lunch &amp; Dinner setiap outlet.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Total Outlet: <strong className="text-white font-mono">{outletSummaries.length}</strong>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
              <thead className="bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider sticky top-0 z-20">
                <tr className="border-b border-white/10">
                  <th className="py-3 px-3 w-10 text-center">No</th>
                  <th className="py-3 px-3">Outlet</th>
                  <th className="py-3 px-3 text-center">Area</th>
                  <th className="py-3 px-3 text-right text-amber-300">Target Lunch (MTD %)</th>
                  <th className="py-3 px-3 text-right text-amber-200">Actual Lunch</th>
                  <th className="py-3 px-3 text-center text-amber-400">Ach Lunch</th>
                  <th className="py-3 px-3 text-right text-indigo-300">Target Dinner (MTD %)</th>
                  <th className="py-3 px-3 text-right text-indigo-200">Actual Dinner</th>
                  <th className="py-3 px-3 text-center text-indigo-400">Ach Dinner</th>
                  <th className="py-3 px-3 text-right text-slate-300">Total Target</th>
                  <th className="py-3 px-3 text-right text-emerald-300 font-bold">Total Actual</th>
                  <th className="py-3 px-3 text-center text-emerald-400">Performance</th>
                  <th className="py-3 px-3 text-right text-slate-400">W1</th>
                  <th className="py-3 px-3 text-right text-slate-400">W2</th>
                  <th className="py-3 px-3 text-right text-slate-400">W3</th>
                  <th className="py-3 px-3 text-right text-slate-400">W4</th>
                  <th className="py-3 px-3 text-right text-slate-400">W5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs">
                {outletSummaries.map((item, idx) => (
                  <tr key={item.outlet} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-sans">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-white font-sans">{item.outlet}</td>
                    <td className="py-2.5 px-3 text-center text-[10px] text-slate-400 font-sans">{item.area}</td>
                    <td className="py-2.5 px-3 text-right text-amber-300/90">
                      <div>{formatIDR(item.targetLunch)}</div>
                      <div className="text-[9px] text-amber-400/80 font-mono">({item.lunchPct.toFixed(1)}%)</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">{formatIDR(item.totalLunch)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(item.lunchAch)}`}>
                        {item.lunchAch.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-indigo-300/90">
                      <div>{formatIDR(item.targetDinner)}</div>
                      <div className="text-[9px] text-indigo-400/80 font-mono">({item.dinnerPct.toFixed(1)}%)</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">{formatIDR(item.totalDinner)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(item.dinnerAch)}`}>
                        {item.dinnerAch.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.totalTarget)}</td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-300">{formatIDR(item.totalActual)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getAchColor(item.overallPerformance)}`}>
                        {item.overallPerformance.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.weekActuals[0])}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.weekActuals[1])}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.weekActuals[2])}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.weekActuals[3])}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{formatIDR(item.weekActuals[4])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 font-black text-xs border-t-2 border-white/20 text-white font-mono">
                <tr>
                  <td colSpan={3} className="py-3 px-3 uppercase text-amber-400 font-sans tracking-wider">
                    Total Regional ({outletSummaries.length} Outlet)
                  </td>
                  <td className="py-3 px-3 text-right text-amber-300">
                    <div>{formatIDR(outletSummaries.reduce((s, o) => s + o.targetLunch, 0))}</div>
                    <div className="text-[9px] text-amber-400/80 font-mono">({mtdTotals.lunchPct.toFixed(1)}%)</div>
                  </td>
                  <td className="py-3 px-3 text-right text-white">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.totalLunch, 0))}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(mtdTotals.totalLunchAch)}`}>
                      {mtdTotals.totalLunchAch.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-indigo-300">
                    <div>{formatIDR(outletSummaries.reduce((s, o) => s + o.targetDinner, 0))}</div>
                    <div className="text-[9px] text-indigo-400/80 font-mono">({mtdTotals.dinnerPct.toFixed(1)}%)</div>
                  </td>
                  <td className="py-3 px-3 text-right text-white">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.totalDinner, 0))}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getAchColor(mtdTotals.totalDinnerAch)}`}>
                      {mtdTotals.totalDinnerAch.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.totalTarget, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-400">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.totalActual, 0))}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getAchColor(mtdTotals.grandPerformance)}`}>
                      {mtdTotals.grandPerformance.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.weekActuals[0], 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.weekActuals[1], 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.weekActuals[2], 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.weekActuals[3], 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    {formatIDR(outletSummaries.reduce((s, o) => s + o.weekActuals[4], 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalWeeklyRevenueRecapTable;
