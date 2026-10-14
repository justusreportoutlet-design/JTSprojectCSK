import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, getAreaForOutlet, getActiveOutletNames } from '../constants';
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

// Day index 0: Minggu, 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu
const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

export const RegionalWeekdayWeekendRevenueTable: React.FC<Props> = ({
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
  const [viewSubTab, setViewSubTab] = useState<'WEEKLY_RECAP' | 'DAILY_DATA' | 'DAY_BREAKDOWN' | 'OUTLET_COMPARISON'>('WEEKLY_RECAP');
  const [expandedWeekNums, setExpandedWeekNums] = useState<number[]>([1, 2, 3, 4]);
  const [dailyCategoryFilter, setDailyCategoryFilter] = useState<'ALL' | 'WEEKDAY' | 'WEEKEND'>('ALL');
  const [dailyWeekFilter, setDailyWeekFilter] = useState<'ALL' | number>('ALL');
  const [dailyDayNameFilter, setDailyDayNameFilter] = useState<'ALL' | string>('ALL');
  const [expandedDayDetail, setExpandedDayDetail] = useState<number | null>(null);

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

  // Outlets filter
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

  const queryOutlets = useMemo(() => {
    if (activeOutlet !== 'ALL') return [activeOutlet];
    if (activeArea !== 'ALL') return activeOutletsList.filter(o => getAreaForOutlet(o) === activeArea);
    return activeOutletsList;
  }, [activeArea, activeOutlet, activeOutletsList]);

  // Helper: Extract single outlet daily values
  const getOutletDailyVal = (oName: string, dateStr: string, d: number) => {
    const outletMonths = allOutletsData?.[oName] || allOutletsData?.[oName.trim()] || Object.entries(allOutletsData || {}).find(([k]) => k.trim().toUpperCase() === oName.trim().toUpperCase())?.[1] || {};
    const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || outletMonths.monthlyData?.[String(selectedMonth)] || outletMonths.monthlyData?.[selectedMonth] || {};
    const sales = mData.sales || outletMonths.sales || mData || {};
    const dailyRec = sales.dailyRecording || mData.dailyRecording || outletMonths.dailyRecording || outletMonths.dailySales || {};
    const entry = dailyRec[dateStr] || dailyRec[String(d)] || {};

    let target = 0;
    if (entry.target !== undefined && Number(entry.target) > 0) {
      target = Number(entry.target);
    } else if (mData.dailyTargets?.[dateStr] !== undefined) {
      target = Number(mData.dailyTargets[dateStr]) || 0;
    } else if (mData.dailyTargets?.[String(d)] !== undefined) {
      target = Number(mData.dailyTargets[String(d)]) || 0;
    } else if (sales.dailyTargets?.[dateStr] !== undefined) {
      target = Number(sales.dailyTargets[dateStr]) || 0;
    } else if (sales.dailyTargets?.[String(d)] !== undefined) {
      target = Number(sales.dailyTargets[String(d)]) || 0;
    } else {
      const budget = (sales.monthlyBudgets || {})[monthKey] || sales.budgetRevenue || (sales.monthlyBudgets || {})[String(selectedMonth)] || 0;
      target = budget > 0 ? Math.round(budget / daysInMonth) : 0;
    }

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

    return {
      target,
      lunch,
      dinner,
      total: lunch + dinner
    };
  };

  // Base daily data for query outlets
  const allDaysData = useMemo(() => {
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(selectedYear, selectedMonth, d);
      const dayIdx = dt.getDay(); // 0: Minggu, 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu
      const dayName = DAY_LABELS[dayIdx];
      const isWeekend = dayIdx === 0 || dayIdx === 6; // Sabtu (6) atau Minggu (0)
      const isWeekday = !isWeekend; // Senin (1), Selasa (2), Rabu (3), Kamis (4), Jumat (5)
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
      const weekNum = d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4;
      const weekLabel = `Week ${weekNum}`;

      let targetSum = 0;
      let lunchSum = 0;
      let dinnerSum = 0;
      const outletDetails: Array<{
        outlet: string;
        area: string;
        target: number;
        lunch: number;
        dinner: number;
        total: number;
        ach: number;
      }> = [];

      queryOutlets.forEach(oName => {
        const val = getOutletDailyVal(oName, dateStr, d);
        targetSum += val.target;
        lunchSum += val.lunch;
        dinnerSum += val.dinner;
        const tot = val.lunch + val.dinner;
        const oAch = val.target > 0 ? (tot / val.target) * 100 : 0;
        outletDetails.push({
          outlet: oName,
          area: getAreaForOutlet(oName),
          target: val.target,
          lunch: val.lunch,
          dinner: val.dinner,
          total: tot,
          ach: oAch
        });
      });

      const totalActual = lunchSum + dinnerSum;
      const ach = targetSum > 0 ? (totalActual / targetSum) * 100 : 0;
      const diff = totalActual - targetSum;
      const lunchSplit = totalActual > 0 ? (lunchSum / totalActual) * 100 : 0;
      const dinnerSplit = totalActual > 0 ? (dinnerSum / totalActual) * 100 : 0;

      list.push({
        day: d,
        dateStr,
        dayIdx,
        dayName,
        isWeekend,
        isWeekday,
        weekNum,
        weekLabel,
        target: targetSum,
        lunch: lunchSum,
        dinner: dinnerSum,
        totalActual,
        ach,
        diff,
        lunchSplit,
        dinnerSplit,
        outletDetails
      });
    }
    return list;
  }, [queryOutlets, selectedYear, selectedMonth, daysInMonth, monthKey, allOutletsData]);

  // 1. DATA PER WEEKLY: W1 (1-7), W2 (8-14), W3 (15-21), W4 (22-end)
  const weeklyRecapData = useMemo(() => {
    const weeksDef = [
      { num: 1, label: 'Week 1', range: 'Tgl 1 - 7', startDay: 1, endDay: 7 },
      { num: 2, label: 'Week 2', range: 'Tgl 8 - 14', startDay: 8, endDay: 14 },
      { num: 3, label: 'Week 3', range: 'Tgl 15 - 21', startDay: 15, endDay: 21 },
      { num: 4, label: 'Week 4', range: `Tgl 22 - ${daysInMonth}`, startDay: 22, endDay: daysInMonth }
    ];

    return weeksDef.map(w => {
      const days = allDaysData.filter(d => d.day >= w.startDay && d.day <= w.endDay);
      const weekdayDays = days.filter(d => d.isWeekday);
      const weekendDays = days.filter(d => d.isWeekend);

      // WEEKDAY AGGREGATION
      const weekdayCount = weekdayDays.length;
      const weekdayTargetSum = weekdayDays.reduce((sum, d) => sum + d.target, 0);
      const weekdayRevenueSum = weekdayDays.reduce((sum, d) => sum + d.totalActual, 0);
      const weekdayLunchSum = weekdayDays.reduce((sum, d) => sum + d.lunch, 0);
      const weekdayDinnerSum = weekdayDays.reduce((sum, d) => sum + d.dinner, 0);

      const weekdayAvgRevenue = weekdayCount > 0 ? Math.round(weekdayRevenueSum / weekdayCount) : 0;
      const weekdayAvgTarget = weekdayCount > 0 ? Math.round(weekdayTargetSum / weekdayCount) : 0;
      const weekdayAch = weekdayTargetSum > 0 ? (weekdayRevenueSum / weekdayTargetSum) * 100 : 0;
      const weekdayAvgLunch = weekdayCount > 0 ? Math.round(weekdayLunchSum / weekdayCount) : 0;
      const weekdayAvgDinner = weekdayCount > 0 ? Math.round(weekdayDinnerSum / weekdayCount) : 0;

      // WEEKEND AGGREGATION
      const weekendCount = weekendDays.length;
      const weekendTargetSum = weekendDays.reduce((sum, d) => sum + d.target, 0);
      const weekendRevenueSum = weekendDays.reduce((sum, d) => sum + d.totalActual, 0);
      const weekendLunchSum = weekendDays.reduce((sum, d) => sum + d.lunch, 0);
      const weekendDinnerSum = weekendDays.reduce((sum, d) => sum + d.dinner, 0);

      const weekendAvgRevenue = weekendCount > 0 ? Math.round(weekendRevenueSum / weekendCount) : 0;
      const weekendAvgTarget = weekendCount > 0 ? Math.round(weekendTargetSum / weekendCount) : 0;
      const weekendAch = weekendTargetSum > 0 ? (weekendRevenueSum / weekendTargetSum) * 100 : 0;
      const weekendAvgLunch = weekendCount > 0 ? Math.round(weekendLunchSum / weekendCount) : 0;
      const weekendAvgDinner = weekendCount > 0 ? Math.round(weekendDinnerSum / weekendCount) : 0;

      // COMPARISONS
      const diffAvg = weekendAvgRevenue - weekdayAvgRevenue;
      const upliftPct = weekdayAvgRevenue > 0 ? ((weekendAvgRevenue - weekdayAvgRevenue) / weekdayAvgRevenue) * 100 : 0;
      const ratio = weekdayAvgRevenue > 0 ? weekendAvgRevenue / weekdayAvgRevenue : 0;

      const totalWeekRevenue = weekdayRevenueSum + weekendRevenueSum;
      const weekdayShare = totalWeekRevenue > 0 ? (weekdayRevenueSum / totalWeekRevenue) * 100 : 0;
      const weekendShare = totalWeekRevenue > 0 ? (weekendRevenueSum / totalWeekRevenue) * 100 : 0;

      return {
        num: w.num,
        label: w.label,
        range: w.range,
        daysCount: days.length,
        days,
        weekdayDays,
        weekendDays,
        // Weekday
        weekdayCount,
        weekdayTargetSum,
        weekdayRevenueSum,
        weekdayAvgRevenue, // RATA-RATA REVENUE WEEKDAY
        weekdayAvgTarget,
        weekdayAch,
        weekdayAvgLunch,
        weekdayAvgDinner,
        // Weekend
        weekendCount,
        weekendTargetSum,
        weekendRevenueSum,
        weekendAvgRevenue, // RATA-RATA REVENUE WEEKEND
        weekendAvgTarget,
        weekendAch,
        weekendAvgLunch,
        weekendAvgDinner,
        // Comparative
        diffAvg,
        upliftPct,
        ratio,
        totalWeekRevenue,
        weekdayShare,
        weekendShare
      };
    });
  }, [allDaysData, daysInMonth]);

  // Filtered daily data for dedicated tab
  const filteredDailyData = useMemo(() => {
    return allDaysData.filter(d => {
      if (dailyCategoryFilter === 'WEEKDAY' && !d.isWeekday) return false;
      if (dailyCategoryFilter === 'WEEKEND' && !d.isWeekend) return false;
      if (dailyWeekFilter !== 'ALL' && d.weekNum !== dailyWeekFilter) return false;
      if (dailyDayNameFilter !== 'ALL' && d.dayName !== dailyDayNameFilter) return false;
      return true;
    });
  }, [allDaysData, dailyCategoryFilter, dailyWeekFilter, dailyDayNameFilter]);

  const dailySummaryStats = useMemo(() => {
    const count = filteredDailyData.length;
    const targetSum = filteredDailyData.reduce((s, d) => s + d.target, 0);
    const revenueSum = filteredDailyData.reduce((s, d) => s + d.totalActual, 0);
    const lunchSum = filteredDailyData.reduce((s, d) => s + d.lunch, 0);
    const dinnerSum = filteredDailyData.reduce((s, d) => s + d.dinner, 0);
    const avgRevenue = count > 0 ? Math.round(revenueSum / count) : 0;
    const avgTarget = count > 0 ? Math.round(targetSum / count) : 0;
    const ach = targetSum > 0 ? (revenueSum / targetSum) * 100 : 0;
    const diff = revenueSum - targetSum;
    return { count, targetSum, revenueSum, lunchSum, dinnerSum, avgRevenue, avgTarget, ach, diff };
  }, [filteredDailyData]);

  // Overall MTD Totals for Weekday & Weekend
  const mtdSummary = useMemo(() => {
    const weekdayDays = allDaysData.filter(d => d.isWeekday);
    const weekendDays = allDaysData.filter(d => d.isWeekend);

    const totalWeekdayDays = weekdayDays.length;
    const totalWeekdayTarget = weekdayDays.reduce((sum, d) => sum + d.target, 0);
    const totalWeekdayRevenue = weekdayDays.reduce((sum, d) => sum + d.totalActual, 0);
    const avgWeekdayRevenue = totalWeekdayDays > 0 ? Math.round(totalWeekdayRevenue / totalWeekdayDays) : 0;
    const avgWeekdayTarget = totalWeekdayDays > 0 ? Math.round(totalWeekdayTarget / totalWeekdayDays) : 0;
    const weekdayAch = totalWeekdayTarget > 0 ? (totalWeekdayRevenue / totalWeekdayTarget) * 100 : 0;

    const totalWeekendDays = weekendDays.length;
    const totalWeekendTarget = weekendDays.reduce((sum, d) => sum + d.target, 0);
    const totalWeekendRevenue = weekendDays.reduce((sum, d) => sum + d.totalActual, 0);
    const avgWeekendRevenue = totalWeekendDays > 0 ? Math.round(totalWeekendRevenue / totalWeekendDays) : 0;
    const avgWeekendTarget = totalWeekendDays > 0 ? Math.round(totalWeekendTarget / totalWeekendDays) : 0;
    const weekendAch = totalWeekendTarget > 0 ? (totalWeekendRevenue / totalWeekendTarget) * 100 : 0;

    const diffAvg = avgWeekendRevenue - avgWeekdayRevenue;
    const upliftPct = avgWeekdayRevenue > 0 ? ((avgWeekendRevenue - avgWeekdayRevenue) / avgWeekdayRevenue) * 100 : 0;
    const ratio = avgWeekdayRevenue > 0 ? avgWeekendRevenue / avgWeekdayRevenue : 0;

    const totalMonthRevenue = totalWeekdayRevenue + totalWeekendRevenue;
    const weekdayShare = totalMonthRevenue > 0 ? (totalWeekdayRevenue / totalMonthRevenue) * 100 : 0;
    const weekendShare = totalMonthRevenue > 0 ? (totalWeekendRevenue / totalMonthRevenue) * 100 : 0;

    return {
      totalWeekdayDays,
      totalWeekdayTarget,
      totalWeekdayRevenue,
      avgWeekdayRevenue,
      avgWeekdayTarget,
      weekdayAch,
      totalWeekendDays,
      totalWeekendTarget,
      totalWeekendRevenue,
      avgWeekendRevenue,
      avgWeekendTarget,
      weekendAch,
      diffAvg,
      upliftPct,
      ratio,
      totalMonthRevenue,
      weekdayShare,
      weekendShare
    };
  }, [allDaysData]);

  // 2. DAY BREAKDOWN (Senin s/d Minggu)
  const dayBreakdownData = useMemo(() => {
    // 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu, 0: Minggu
    const orderedIndices = [1, 2, 3, 4, 5, 6, 0];

    return orderedIndices.map(dayIdx => {
      const days = allDaysData.filter(d => d.dayIdx === dayIdx);
      const count = days.length;
      const targetSum = days.reduce((sum, d) => sum + d.target, 0);
      const revenueSum = days.reduce((sum, d) => sum + d.totalActual, 0);
      const lunchSum = days.reduce((sum, d) => sum + d.lunch, 0);
      const dinnerSum = days.reduce((sum, d) => sum + d.dinner, 0);

      const avgRevenue = count > 0 ? Math.round(revenueSum / count) : 0;
      const avgTarget = count > 0 ? Math.round(targetSum / count) : 0;
      const avgLunch = count > 0 ? Math.round(lunchSum / count) : 0;
      const avgDinner = count > 0 ? Math.round(dinnerSum / count) : 0;
      const ach = targetSum > 0 ? (revenueSum / targetSum) * 100 : 0;

      const lunchSplit = revenueSum > 0 ? (lunchSum / revenueSum) * 100 : 0;
      const dinnerSplit = revenueSum > 0 ? (dinnerSum / revenueSum) * 100 : 0;

      return {
        dayIdx,
        dayName: DAY_LABELS[dayIdx],
        isWeekend: dayIdx === 0 || dayIdx === 6,
        count,
        targetSum,
        revenueSum,
        avgRevenue,
        avgTarget,
        avgLunch,
        avgDinner,
        ach,
        lunchSplit,
        dinnerSplit
      };
    });
  }, [allDaysData]);

  // 3. OUTLET COMPARISON (Weekday Avg vs Weekend Avg per Outlet)
  const outletComparisonData = useMemo(() => {
    return filteredOutlets.map((oName, idx) => {
      const area = getAreaForOutlet(oName);
      let weekdayCount = 0;
      let weekdayRev = 0;
      let weekendCount = 0;
      let weekendRev = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(selectedYear, selectedMonth, d);
        const isWknd = dt.getDay() === 0 || dt.getDay() === 6;
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        const val = getOutletDailyVal(oName, dateStr, d);

        if (isWknd) {
          weekendCount++;
          weekendRev += val.total;
        } else {
          weekdayCount++;
          weekdayRev += val.total;
        }
      }

      const avgWeekday = weekdayCount > 0 ? Math.round(weekdayRev / weekdayCount) : 0;
      const avgWeekend = weekendCount > 0 ? Math.round(weekendRev / weekendCount) : 0;
      const diff = avgWeekend - avgWeekday;
      const uplift = avgWeekday > 0 ? ((avgWeekend - avgWeekday) / avgWeekday) * 100 : 0;
      const totalRev = weekdayRev + weekendRev;

      return {
        no: idx + 1,
        outlet: oName,
        area,
        avgWeekday,
        avgWeekend,
        diff,
        uplift,
        totalRev
      };
    });
  }, [filteredOutlets, selectedYear, selectedMonth, daysInMonth, monthKey, allOutletsData]);

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Weekday_Weekend_${monthName}_${selectedYear}`);

    worksheet.columns = [
      { header: 'Minggu', key: 'week', width: 14 },
      { header: 'Rentang', key: 'range', width: 16 },
      { header: 'Hari Weekday', key: 'wkDayCount', width: 14 },
      { header: 'Total Rev Weekday', key: 'wkDayRev', width: 20 },
      { header: 'RATA-RATA WEEKDAY', key: 'wkDayAvg', width: 22 },
      { header: 'Ach Weekday (%)', key: 'wkDayAch', width: 16 },
      { header: 'Hari Weekend', key: 'wkEndCount', width: 14 },
      { header: 'Total Rev Weekend', key: 'wkEndRev', width: 20 },
      { header: 'RATA-RATA WEEKEND', key: 'wkEndAvg', width: 22 },
      { header: 'Ach Weekend (%)', key: 'wkEndAch', width: 16 },
      { header: 'Selisih (Weekend - Weekday)', key: 'diff', width: 25 },
      { header: 'Weekend Uplift (%)', key: 'uplift', width: 20 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    weeklyRecapData.forEach(w => {
      worksheet.addRow({
        week: w.label,
        range: w.range,
        wkDayCount: w.weekdayCount,
        wkDayRev: w.weekdayRevenueSum,
        wkDayAvg: w.weekdayAvgRevenue,
        wkDayAch: Number(w.weekdayAch.toFixed(1)),
        wkEndCount: w.weekendCount,
        wkEndRev: w.weekendRevenueSum,
        wkEndAvg: w.weekendAvgRevenue,
        wkEndAch: Number(w.weekendAch.toFixed(1)),
        diff: w.diffAvg,
        uplift: Number(w.upliftPct.toFixed(1))
      });
    });

    // Grand Total Row
    const grandRow = worksheet.addRow({
      week: 'TOTAL MTD',
      range: `${monthName} ${selectedYear}`,
      wkDayCount: mtdSummary.totalWeekdayDays,
      wkDayRev: mtdSummary.totalWeekdayRevenue,
      wkDayAvg: mtdSummary.avgWeekdayRevenue,
      wkDayAch: Number(mtdSummary.weekdayAch.toFixed(1)),
      wkEndCount: mtdSummary.totalWeekendDays,
      wkEndRev: mtdSummary.totalWeekendRevenue,
      wkEndAvg: mtdSummary.avgWeekendRevenue,
      wkEndAch: Number(mtdSummary.weekendAch.toFixed(1)),
      diff: mtdSummary.diffAvg,
      uplift: Number(mtdSummary.upliftPct.toFixed(1))
    });
    grandRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    grandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    // Sheet 2: Data Harian Detail (Weekday & Weekend)
    const wsDaily = workbook.addWorksheet(`Data_Harian_${monthName}_${selectedYear}`);
    wsDaily.columns = [
      { header: 'No', key: 'no', width: 8 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Nama Hari', key: 'dayName', width: 14 },
      { header: 'Kategori', key: 'category', width: 22 },
      { header: 'Minggu', key: 'week', width: 12 },
      { header: 'Target (Rp)', key: 'target', width: 18 },
      { header: 'Lunch (Rp)', key: 'lunch', width: 18 },
      { header: 'Dinner (Rp)', key: 'dinner', width: 18 },
      { header: 'Total Revenue (Rp)', key: 'total', width: 22 },
      { header: 'Ach (%)', key: 'ach', width: 14 },
      { header: 'Selisih (Rp)', key: 'diff', width: 18 }
    ];

    const h2Row = wsDaily.getRow(1);
    h2Row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h2Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
    h2Row.alignment = { horizontal: 'center', vertical: 'middle' };

    allDaysData.forEach((d, idx) => {
      wsDaily.addRow({
        no: idx + 1,
        date: d.dateStr,
        dayName: d.dayName,
        category: d.isWeekday ? 'WEEKDAY (Senin-Jumat)' : 'WEEKEND (Sabtu-Minggu)',
        week: d.weekLabel,
        target: d.target,
        lunch: d.lunch,
        dinner: d.dinner,
        total: d.totalActual,
        ach: Number(d.ach.toFixed(1)),
        diff: d.diff
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Rekapan_RataRata_Weekday_Weekend_${monthName}_${selectedYear}.xlsx`);
    showToast?.('Laporan Rata-rata & Data Harian Weekday vs Weekend berhasil diekspor!', 'success');
  };

  // Salin WA
  const handleCopyWhatsApp = () => {
    let msg = `*REKAPAN RATA-RATA REVENUE WEEKDAY (SENIN-JUMAT) VS WEEKEND (SABTU-MINGGU)*\n`;
    msg += `*Periode:* ${monthName} ${selectedYear}\n`;
    msg += `*Area:* ${activeArea} | *Outlet:* ${activeOutlet}\n`;
    msg += `------------------------------------\n\n`;

    msg += `*RINGKASAN TOTAL MTD:*\n`;
    msg += `• *RATA-RATA WEEKDAY (Senin-Jumat):* Rp ${formatIDR(mtdSummary.avgWeekdayRevenue)} / Hari (Total: Rp ${formatIDR(mtdSummary.totalWeekdayRevenue)} dari ${mtdSummary.totalWeekdayDays} hari)\n`;
    msg += `• *RATA-RATA WEEKEND (Sabtu-Minggu):* Rp ${formatIDR(mtdSummary.avgWeekendRevenue)} / Hari (Total: Rp ${formatIDR(mtdSummary.totalWeekendRevenue)} dari ${mtdSummary.totalWeekendDays} hari)\n`;
    msg += `• *Weekend Uplift:* *+${mtdSummary.upliftPct.toFixed(1)}%* (${mtdSummary.ratio.toFixed(2)}x lebih tinggi dari weekday)\n`;
    msg += `• *Selisih Rata-rata:* +Rp ${formatIDR(mtdSummary.diffAvg)} / Hari\n\n`;

    msg += `*DETAIL PER WEEKLY:*\n`;
    weeklyRecapData.forEach(w => {
      msg += `*${w.label} (${w.range})*\n`;
      msg += `  - Rata-Rata Weekday: Rp ${formatIDR(w.weekdayAvgRevenue)} (${w.weekdayCount} Hari)\n`;
      msg += `  - Rata-Rata Weekend: Rp ${formatIDR(w.weekendAvgRevenue)} (${w.weekendCount} Hari)\n`;
      msg += `  - Weekend Uplift: ${w.upliftPct >= 0 ? '+' : ''}${w.upliftPct.toFixed(1)}%\n`;
    });

    msg += `\n*RATA-RATA PER HARI (SENIN - MINGGU):*\n`;
    dayBreakdownData.forEach(d => {
      msg += `• ${d.dayName} (${d.isWeekend ? 'Weekend' : 'Weekday'}): Rp ${formatIDR(d.avgRevenue)} / hari (${d.count} hari)\n`;
    });

    navigator.clipboard.writeText(msg);
    showToast?.('Ringkasan Weekday vs Weekend disalin ke clipboard!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-5">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                POLA REVENUE MINGGUAN
              </span>
              <span className="text-xs text-slate-400">• Senin-Jumat (Weekday) vs Sabtu-Minggu (Weekend)</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <i className="fas fa-arrows-split-up-and-left text-indigo-400"></i>
              Rekapan Rata-Rata Revenue Weekday vs Weekend
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Evaluasi rata-rata revenue hari kerja (Senin, Selasa, Rabu, Kamis, Jumat) dibanding hari libur akhir pekan (Sabtu, Minggu) per mingguan (Weekly) dan performa bulanan.
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

        {/* FILTERS & SUB-TABS */}
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
                        ? 'bg-indigo-500 text-white shadow-md'
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
                className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">Semua Outlet ({filteredOutlets.length})</option>
                {filteredOutlets.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex flex-wrap rounded-xl overflow-hidden border border-white/10 bg-slate-950 p-1 self-start md:self-auto gap-1">
            <button
              type="button"
              onClick={() => setViewSubTab('WEEKLY_RECAP')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewSubTab === 'WEEKLY_RECAP'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-week text-[10px]"></i>
              Rekapan Per Weekly
            </button>
            <button
              type="button"
              onClick={() => setViewSubTab('DAILY_DATA')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewSubTab === 'DAILY_DATA'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-day text-[10px]"></i>
              Data Harian (Senin - Minggu)
            </button>
            <button
              type="button"
              onClick={() => setViewSubTab('DAY_BREAKDOWN')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewSubTab === 'DAY_BREAKDOWN'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-days text-[10px]"></i>
              Rata-Rata Per Hari (Sen-Min)
            </button>
            <button
              type="button"
              onClick={() => setViewSubTab('OUTLET_COMPARISON')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                viewSubTab === 'OUTLET_COMPARISON'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-store text-[10px]"></i>
              Komparasi Outlet
            </button>
          </div>
        </div>

        {/* TOP SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* RATA-RATA WEEKDAY */}
          <div className="bg-slate-950/60 border border-blue-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-briefcase"></i> RATA-RATA WEEKDAY
              </span>
              <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono font-bold">
                Senin - Jumat
              </span>
            </div>
            <div className="text-xl font-black text-blue-300 font-mono">
              Rp {formatIDR(mtdSummary.avgWeekdayRevenue)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>{mtdSummary.totalWeekdayDays} Hari Kerja</span>
              <span>Total: Rp {formatIDR(mtdSummary.totalWeekdayRevenue)}</span>
            </div>
          </div>

          {/* RATA-RATA WEEKEND */}
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-champagne-glasses"></i> RATA-RATA WEEKEND
              </span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                Sabtu - Minggu
              </span>
            </div>
            <div className="text-xl font-black text-amber-300 font-mono">
              Rp {formatIDR(mtdSummary.avgWeekendRevenue)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>{mtdSummary.totalWeekendDays} Hari Libur</span>
              <span>Total: Rp {formatIDR(mtdSummary.totalWeekendRevenue)}</span>
            </div>
          </div>

          {/* WEEKEND UPLIFT */}
          <div className="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-arrow-trend-up"></i> WEEKEND UPLIFT
              </span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                Multiplier
              </span>
            </div>
            <div className="text-xl font-black text-emerald-300 font-mono">
              +{mtdSummary.upliftPct.toFixed(1)}%
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Rasio: {mtdSummary.ratio.toFixed(2)}x Weekday</span>
              <span className="text-emerald-400 font-bold">+Rp {formatIDR(mtdSummary.diffAvg)}</span>
            </div>
          </div>

          {/* PROPORSI KONTRIBUSI */}
          <div className="bg-slate-950/60 border border-purple-500/20 rounded-2xl p-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-purple-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <i className="fas fa-chart-pie"></i> PROPORSI REVENUE
              </span>
              <span className="text-[9px] text-slate-400">MTD Total</span>
            </div>
            <div className="text-xl font-black text-white font-mono">
              Rp {formatIDR(mtdSummary.totalMonthRevenue)}
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-blue-400">Weekday {mtdSummary.weekdayShare.toFixed(1)}%</span>
              <span className="text-slate-500">:</span>
              <span className="text-amber-400">Weekend {mtdSummary.weekendShare.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. TABLE: REKAPAN PER WEEKLY */}
      {viewSubTab === 'WEEKLY_RECAP' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-table-cells text-indigo-400"></i>
                Tabel Rekapan Rata-Rata Revenue Weekday &amp; Weekend Per Weekly
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Weekday (Senin, Selasa, Rabu, Kamis, Jumat) vs Weekend (Sabtu, Minggu) per mingguan beserta rincian data harian di bawah setiap minggu.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (expandedWeekNums.length === 4) {
                    setExpandedWeekNums([]);
                  } else {
                    setExpandedWeekNums([1, 2, 3, 4]);
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <i className={`fas fa-arrows-alt-v text-[10px]`}></i>
                {expandedWeekNums.length === 4 ? 'Tutup Semua Rincian Harian' : 'Buka Semua Rincian Data Harian'}
              </button>
              <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-white/10">
                {monthName} {selectedYear}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[1250px]">
              <thead>
                {/* Row 1: Super Headers */}
                <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                  <th rowSpan={2} className="py-3 px-3 text-center border-r border-white/5 w-12">NO</th>
                  <th rowSpan={2} className="py-3 px-4 border-r border-white/5 min-w-[200px]">
                    MINGGU (WEEKLY) &amp; RINCIAN HARIAN
                  </th>
                  <th colSpan={4} className="py-2.5 px-3 text-center border-b border-white/10 bg-blue-950/40 text-blue-300 border-r border-white/5">
                    <i className="fas fa-briefcase mr-1.5 text-blue-400"></i>WEEKDAY (SENIN - JUMAT)
                  </th>
                  <th colSpan={4} className="py-2.5 px-3 text-center border-b border-white/10 bg-amber-950/40 text-amber-300 border-r border-white/5">
                    <i className="fas fa-champagne-glasses mr-1.5 text-amber-400"></i>WEEKEND (SABTU - MINGGU)
                  </th>
                  <th colSpan={3} className="py-2.5 px-3 text-center border-b border-white/10 bg-purple-950/40 text-purple-300">
                    <i className="fas fa-code-compare mr-1.5 text-purple-400"></i>KOMPARASI &amp; UPLIFT
                  </th>
                </tr>

                {/* Row 2: Sub-headers */}
                <tr className="bg-slate-950/90 text-slate-400 font-black uppercase text-[9px] tracking-wider border-b border-white/10">
                  {/* WEEKDAY */}
                  <th className="py-2 px-2.5 text-center bg-blue-950/20 text-slate-400 w-16">Jml Hari</th>
                  <th className="py-2 px-3 text-right bg-blue-950/20 text-blue-400">Total Weekday (Rp)</th>
                  <th className="py-2 px-3 text-right bg-blue-950/20 text-blue-300 font-black">RATA-RATA WEEKDAY</th>
                  <th className="py-2 px-3 text-right bg-blue-950/20 text-slate-400 border-r border-white/5">Ach (%)</th>

                  {/* WEEKEND */}
                  <th className="py-2 px-2.5 text-center bg-amber-950/20 text-slate-400 w-16">Jml Hari</th>
                  <th className="py-2 px-3 text-right bg-amber-950/20 text-amber-400">Total Weekend (Rp)</th>
                  <th className="py-2 px-3 text-right bg-amber-950/20 text-amber-300 font-black">RATA-RATA WEEKEND</th>
                  <th className="py-2 px-3 text-right bg-amber-950/20 text-slate-400 border-r border-white/5">Ach (%)</th>

                  {/* COMPARISON */}
                  <th className="py-2 px-3 text-right bg-purple-950/20 text-purple-300">Selisih Rata2 (+/-)</th>
                  <th className="py-2 px-3 text-center bg-purple-950/20 text-emerald-400">Weekend Uplift (%)</th>
                  <th className="py-2 px-3 text-center bg-purple-950/20 text-slate-300">Proporsi Wkday : Wknd</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
                {weeklyRecapData.map((w, idx) => {
                  const isExpanded = expandedWeekNums.includes(w.num);
                  return (
                    <React.Fragment key={w.num}>
                      <tr className="hover:bg-white/5 transition-colors group">
                        <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-black text-white border-r border-white/5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedWeekNums(prev =>
                                    prev.includes(w.num) ? prev.filter(n => n !== w.num) : [...prev, w.num]
                                  );
                                }}
                                className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-[10px] transition-all cursor-pointer"
                                title={isExpanded ? 'Tutup Data Harian' : 'Buka Data Harian'}
                              >
                                <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'}`}></i>
                              </button>
                              <span className="text-sm font-black text-white">{w.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                {w.range}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedWeekNums(prev =>
                                    prev.includes(w.num) ? prev.filter(n => n !== w.num) : [...prev, w.num]
                                  );
                                }}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                                  isExpanded
                                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                                    : 'bg-white/5 text-slate-400 hover:text-white border-white/10'
                                }`}
                              >
                                {isExpanded ? 'Sembunyikan' : 'Data Harian'}
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* WEEKDAY METRICS */}
                        <td className="py-3 px-2.5 text-center font-mono font-bold text-slate-300 bg-blue-950/10">
                          {w.weekdayCount} Hari
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 bg-blue-950/10">
                          {formatIDR(w.weekdayRevenueSum)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-blue-300 bg-blue-950/20 text-xs">
                          Rp {formatIDR(w.weekdayAvgRevenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-blue-950/10">
                          <span className={w.weekdayAch >= 100 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            {w.weekdayAch.toFixed(1)}%
                          </span>
                        </td>

                        {/* WEEKEND METRICS */}
                        <td className="py-3 px-2.5 text-center font-mono font-bold text-slate-300 bg-amber-950/10">
                          {w.weekendCount} Hari
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 bg-amber-950/10">
                          {formatIDR(w.weekendRevenueSum)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-amber-300 bg-amber-950/20 text-xs">
                          Rp {formatIDR(w.weekendAvgRevenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[10px] border-r border-white/5 bg-amber-950/10">
                          <span className={w.weekendAch >= 100 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            {w.weekendAch.toFixed(1)}%
                          </span>
                        </td>

                        {/* COMPARISONS */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-200 bg-purple-950/10">
                          <span className={w.diffAvg >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {w.diffAvg >= 0 ? '+' : ''}Rp {formatIDR(w.diffAvg)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-black text-emerald-400 bg-purple-950/10 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            +{w.upliftPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[10px] bg-purple-950/10">
                          <span className="text-blue-400 font-bold">{w.weekdayShare.toFixed(0)}%</span>
                          <span className="text-slate-500 mx-1">:</span>
                          <span className="text-amber-400 font-bold">{w.weekendShare.toFixed(0)}%</span>
                        </td>
                      </tr>

                      {/* EXPANDED ROW: RINCIAN DATA HARIAN (SENIN-JUMAT & SABTU-MINGGU) */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80 border-b-2 border-indigo-500/30">
                          <td colSpan={13} className="p-3 sm:p-5">
                            <div className="space-y-4 bg-slate-900/90 rounded-2xl p-4 border border-white/10 shadow-2xl">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/10 pb-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="w-7 h-7 rounded-xl bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center border border-indigo-500/30">
                                    W{w.num}
                                  </span>
                                  <div>
                                    <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                      <i className="fas fa-calendar-day text-indigo-400"></i>
                                      Data Harian Weekday &amp; Weekend — {w.label} ({w.range})
                                    </h5>
                                    <span className="text-[10px] text-slate-400">
                                      Rincian performa per tanggal: Senin, Selasa, Rabu, Kamis, Jumat (Weekday) vs Sabtu, Minggu (Weekend)
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono">
                                  <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                                    {w.weekdayDays.length} Hari Weekday
                                  </span>
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                    {w.weekendDays.length} Hari Weekend
                                  </span>
                                </div>
                              </div>

                              {/* 2 GRUP TABEL: WEEKDAY & WEEKEND */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* GRUP 1: WEEKDAY (SENIN, SELASA, RABU, KAMIS, JUMAT) */}
                                <div className="bg-slate-950/90 rounded-xl border border-blue-500/30 overflow-hidden flex flex-col justify-between">
                                  <div>
                                    <div className="px-3.5 py-2.5 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between">
                                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-300 flex items-center gap-2">
                                        <i className="fas fa-briefcase text-blue-400"></i>
                                        Weekday (Senin, Selasa, Rabu, Kamis, Jumat)
                                      </span>
                                      <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                                        Rata2: Rp {formatIDR(w.weekdayAvgRevenue)}/hari
                                      </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px]">
                                        <thead>
                                          <tr className="bg-slate-900/90 text-slate-400 uppercase text-[9px] font-black tracking-wider border-b border-white/10">
                                            <th className="py-2 px-2.5 text-center w-10">Tgl</th>
                                            <th className="py-2 px-3">Hari</th>
                                            <th className="py-2 px-2.5 text-right">Target (Rp)</th>
                                            <th className="py-2 px-2.5 text-right">Lunch (Rp)</th>
                                            <th className="py-2 px-2.5 text-right">Dinner (Rp)</th>
                                            <th className="py-2 px-3 text-right text-blue-300 font-black">Total (Rp)</th>
                                            <th className="py-2 px-2 text-center">Ach</th>
                                            <th className="py-2 px-2.5 text-right">Selisih</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 font-mono">
                                          {w.weekdayDays.map(d => (
                                            <tr key={d.day} className="hover:bg-blue-500/5 transition-colors">
                                              <td className="py-2 px-2.5 text-center text-slate-400 font-bold">
                                                {String(d.day).padStart(2, '0')}
                                              </td>
                                              <td className="py-2 px-3 font-sans font-black text-white">
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                  {d.dayName}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-slate-400">
                                                {formatIDR(d.target)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-amber-300">
                                                {formatIDR(d.lunch)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-indigo-300">
                                                {formatIDR(d.dinner)}
                                              </td>
                                              <td className="py-2 px-3 text-right font-black text-blue-300 text-xs">
                                                Rp {formatIDR(d.totalActual)}
                                              </td>
                                              <td className="py-2 px-2 text-center font-bold text-[10px]">
                                                <span className={d.ach >= 100 ? 'text-emerald-400' : 'text-slate-400'}>
                                                  {d.ach.toFixed(0)}%
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-bold text-[10px]">
                                                <span className={d.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                  {d.diff >= 0 ? '+' : ''}{formatIDR(d.diff)}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                          {w.weekdayDays.length === 0 && (
                                            <tr>
                                              <td colSpan={8} className="py-3 text-center text-slate-500 text-xs italic">
                                                Tidak ada hari weekday pada minggu ini
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  {/* Subtotal Weekday Footer */}
                                  <div className="px-3.5 py-2.5 bg-blue-950/40 border-t border-blue-500/20 flex flex-wrap items-center justify-between text-[11px] font-mono gap-2">
                                    <span className="font-sans font-black text-blue-300 text-[10px] uppercase">
                                      Total Weekday ({w.weekdayDays.length} Hari)
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-slate-400 text-[10px]">
                                        Total: <b className="text-white">Rp {formatIDR(w.weekdayRevenueSum)}</b>
                                      </span>
                                      <span className="text-blue-300 font-black text-xs">
                                        Rata2: Rp {formatIDR(w.weekdayAvgRevenue)}/hari
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* GRUP 2: WEEKEND (SABTU, MINGGU) */}
                                <div className="bg-slate-950/90 rounded-xl border border-amber-500/30 overflow-hidden flex flex-col justify-between">
                                  <div>
                                    <div className="px-3.5 py-2.5 bg-amber-950/40 border-b border-amber-500/20 flex items-center justify-between">
                                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                                        <i className="fas fa-champagne-glasses text-amber-400"></i>
                                        Weekend (Sabtu, Minggu)
                                      </span>
                                      <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                                        Rata2: Rp {formatIDR(w.weekendAvgRevenue)}/hari
                                      </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px]">
                                        <thead>
                                          <tr className="bg-slate-900/90 text-slate-400 uppercase text-[9px] font-black tracking-wider border-b border-white/10">
                                            <th className="py-2 px-2.5 text-center w-10">Tgl</th>
                                            <th className="py-2 px-3">Hari</th>
                                            <th className="py-2 px-2.5 text-right">Target (Rp)</th>
                                            <th className="py-2 px-2.5 text-right">Lunch (Rp)</th>
                                            <th className="py-2 px-2.5 text-right">Dinner (Rp)</th>
                                            <th className="py-2 px-3 text-right text-amber-300 font-black">Total (Rp)</th>
                                            <th className="py-2 px-2 text-center">Ach</th>
                                            <th className="py-2 px-2.5 text-right">Selisih</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 font-mono">
                                          {w.weekendDays.map(d => (
                                            <tr key={d.day} className="hover:bg-amber-500/5 transition-colors">
                                              <td className="py-2 px-2.5 text-center text-slate-400 font-bold">
                                                {String(d.day).padStart(2, '0')}
                                              </td>
                                              <td className="py-2 px-3 font-sans font-black text-white">
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                  {d.dayName}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-slate-400">
                                                {formatIDR(d.target)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-amber-300">
                                                {formatIDR(d.lunch)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right text-indigo-300">
                                                {formatIDR(d.dinner)}
                                              </td>
                                              <td className="py-2 px-3 text-right font-black text-amber-300 text-xs">
                                                Rp {formatIDR(d.totalActual)}
                                              </td>
                                              <td className="py-2 px-2 text-center font-bold text-[10px]">
                                                <span className={d.ach >= 100 ? 'text-emerald-400' : 'text-slate-400'}>
                                                  {d.ach.toFixed(0)}%
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-bold text-[10px]">
                                                <span className={d.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                  {d.diff >= 0 ? '+' : ''}{formatIDR(d.diff)}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                          {w.weekendDays.length === 0 && (
                                            <tr>
                                              <td colSpan={8} className="py-3 text-center text-slate-500 text-xs italic">
                                                Tidak ada hari weekend pada minggu ini
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  {/* Subtotal Weekend Footer */}
                                  <div className="px-3.5 py-2.5 bg-amber-950/40 border-t border-amber-500/20 flex flex-wrap items-center justify-between text-[11px] font-mono gap-2">
                                    <span className="font-sans font-black text-amber-300 text-[10px] uppercase">
                                      Total Weekend ({w.weekendDays.length} Hari)
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-slate-400 text-[10px]">
                                        Total: <b className="text-white">Rp {formatIDR(w.weekendRevenueSum)}</b>
                                      </span>
                                      <span className="text-amber-300 font-black text-xs">
                                        Rata2: Rp {formatIDR(w.weekendAvgRevenue)}/hari
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* FOOTER */}
              <tfoot>
                <tr className="bg-slate-950 font-black text-white text-xs border-t-2 border-indigo-500">
                  <td colSpan={2} className="py-4 px-4 uppercase tracking-wider text-indigo-400 border-r border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <i className="fas fa-sigma text-indigo-400"></i>
                        TOTAL &amp; RATA-RATA MTD ({monthName} {selectedYear})
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono font-normal">
                        {activeArea === 'ALL' ? 'Seluruh Regional' : activeArea}
                      </span>
                    </div>
                  </td>

                  {/* WEEKDAY FOOTER */}
                  <td className="py-4 px-2.5 text-center font-mono font-bold text-slate-300 bg-blue-950/30">
                    {mtdSummary.totalWeekdayDays} Hari
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-blue-300 bg-blue-950/30">
                    {formatIDR(mtdSummary.totalWeekdayRevenue)}
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-black text-blue-300 bg-blue-950/40 text-sm">
                    Rp {formatIDR(mtdSummary.avgWeekdayRevenue)}
                  </td>
                  <td className="py-4 px-3 text-right font-mono text-xs border-r border-white/10 bg-blue-950/30">
                    {mtdSummary.weekdayAch.toFixed(1)}%
                  </td>

                  {/* WEEKEND FOOTER */}
                  <td className="py-4 px-2.5 text-center font-mono font-bold text-slate-300 bg-amber-950/30">
                    {mtdSummary.totalWeekendDays} Hari
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/30">
                    {formatIDR(mtdSummary.totalWeekendRevenue)}
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-black text-amber-300 bg-amber-950/40 text-sm">
                    Rp {formatIDR(mtdSummary.avgWeekendRevenue)}
                  </td>
                  <td className="py-4 px-3 text-right font-mono text-xs border-r border-white/10 bg-amber-950/30">
                    {mtdSummary.weekendAch.toFixed(1)}%
                  </td>

                  {/* COMPARISON FOOTER */}
                  <td className="py-4 px-3 text-right font-mono font-black text-emerald-400 bg-purple-950/30">
                    +Rp {formatIDR(mtdSummary.diffAvg)}
                  </td>
                  <td className="py-4 px-3 text-center font-mono font-black text-emerald-300 bg-purple-950/30 text-sm">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      +{mtdSummary.upliftPct.toFixed(1)}% ({mtdSummary.ratio.toFixed(2)}x)
                    </span>
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-xs font-black bg-purple-950/30">
                    <span className="text-blue-400">{mtdSummary.weekdayShare.toFixed(0)}%</span>
                    <span className="text-slate-500 mx-1">:</span>
                    <span className="text-amber-400">{mtdSummary.weekendShare.toFixed(0)}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 1B. TABLE: DEDICATED FULL DATA HARIAN (SENIN S/D MINGGU) */}
      {viewSubTab === 'DAILY_DATA' && (
        <div className="space-y-6">
          {/* DAILY CONTROLS & SUMMARY */}
          <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-calendar-days text-indigo-400"></i>
                  Data Harian Weekday (Senin, Selasa, Rabu, Kamis, Jumat) &amp; Weekend (Sabtu, Minggu)
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Daftar lengkap performa harian operasional tanggal 1 s/d {daysInMonth} {monthName} {selectedYear} dengan filter kategori, minggu, dan nama hari.
                </p>
              </div>

              {/* Category Quick Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                    dailyCategoryFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  Semua ({allDaysData.length} Hari)
                </button>
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('WEEKDAY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                    dailyCategoryFilter === 'WEEKDAY'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-950 text-blue-400 hover:text-white border border-blue-500/20'
                  }`}
                >
                  <i className="fas fa-briefcase text-[10px]"></i>
                  Weekday: Senin-Jumat ({allDaysData.filter(d => d.isWeekday).length} Hari)
                </button>
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('WEEKEND')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                    dailyCategoryFilter === 'WEEKEND'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-slate-950 text-amber-400 hover:text-white border border-amber-500/20'
                  }`}
                >
                  <i className="fas fa-champagne-glasses text-[10px]"></i>
                  Weekend: Sabtu-Minggu ({allDaysData.filter(d => d.isWeekend).length} Hari)
                </button>
              </div>
            </div>

            {/* Filter Week & Day Name */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Filter Minggu */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Minggu:</span>
                  <div className="flex rounded-xl overflow-hidden border border-white/10 bg-slate-950 p-1">
                    {(['ALL', 1, 2, 3, 4] as const).map(wNum => (
                      <button
                        key={String(wNum)}
                        type="button"
                        onClick={() => setDailyWeekFilter(wNum)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                          dailyWeekFilter === wNum
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {wNum === 'ALL' ? 'Semua Week' : `W${wNum}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Nama Hari */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Hari:</span>
                  <select
                    value={dailyDayNameFilter}
                    onChange={(e) => setDailyDayNameFilter(e.target.value)}
                    className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="ALL">Semua Nama Hari</option>
                    {DAY_LABELS.map(name => (
                      <option key={name} value={name}>
                        {name} ({name === 'Sabtu' || name === 'Minggu' ? 'Weekend' : 'Weekday'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Hari Terpilih */}
              <div className="text-xs font-mono text-slate-400">
                Menampilkan <b className="text-white">{filteredDailyData.length}</b> dari {allDaysData.length} hari operasional
              </div>
            </div>

            {/* FILTER STATS SUMMARY CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-white/10">
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Jumlah Hari</span>
                <div className="text-lg font-black text-white font-mono">{dailySummaryStats.count} Hari</div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Target</span>
                <div className="text-lg font-black text-slate-300 font-mono">Rp {formatIDR(dailySummaryStats.targetSum)}</div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-indigo-500/20 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-400">Total Revenue</span>
                <div className="text-lg font-black text-indigo-300 font-mono">Rp {formatIDR(dailySummaryStats.revenueSum)}</div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-emerald-500/20 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Rata-Rata / Hari</span>
                <div className="text-lg font-black text-emerald-300 font-mono">Rp {formatIDR(dailySummaryStats.avgRevenue)}</div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-amber-500/20 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Achievement</span>
                <div className={`text-lg font-black font-mono ${dailySummaryStats.ach >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {dailySummaryStats.ach.toFixed(1)}%
                </div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-purple-500/20 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-purple-400">Selisih Target</span>
                <div className={`text-lg font-black font-mono ${dailySummaryStats.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {dailySummaryStats.diff >= 0 ? '+' : ''}{formatIDR(dailySummaryStats.diff)}
                </div>
              </div>
            </div>
          </div>

          {/* TABLE DATA HARIAN */}
          <div className="bg-slate-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                    <th className="py-3 px-3 text-center w-12 border-r border-white/5">NO</th>
                    <th className="py-3 px-4 min-w-[120px] border-r border-white/5">TANGGAL</th>
                    <th className="py-3 px-4 min-w-[140px] border-r border-white/5">HARI</th>
                    <th className="py-3 px-4 text-center min-w-[150px] border-r border-white/5">KATEGORI</th>
                    <th className="py-3 px-3 text-center w-16 border-r border-white/5">MINGGU</th>
                    <th className="py-3 px-3 text-right">TARGET (RP)</th>
                    <th className="py-3 px-3 text-right text-amber-400">LUNCH (RP)</th>
                    <th className="py-3 px-3 text-right text-indigo-400">DINNER (RP)</th>
                    <th className="py-3 px-4 text-right text-white font-black">TOTAL REVENUE (RP)</th>
                    <th className="py-3 px-3 text-center">ACH (%)</th>
                    <th className="py-3 px-3 text-right">SELISIH</th>
                    <th className="py-3 px-3 text-center">L / D SPLIT</th>
                    {activeOutlet === 'ALL' && (
                      <th className="py-3 px-3 text-center w-24">OUTLET</th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-mono text-[11px] text-slate-300">
                  {filteredDailyData.map((d, idx) => {
                    const isWeekend = d.isWeekend;
                    const isDayExpanded = expandedDayDetail === d.day;
                    return (
                      <React.Fragment key={d.day}>
                        <tr className={`hover:bg-white/5 transition-colors ${isWeekend ? 'bg-amber-950/5' : 'bg-blue-950/5'}`}>
                          <td className="py-2.5 px-3 text-center text-slate-500 font-bold border-r border-white/5">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-white border-r border-white/5">
                            {String(d.day).padStart(2, '0')} {monthName.substring(0, 3)} {selectedYear}
                          </td>
                          <td className="py-2.5 px-4 font-sans font-black border-r border-white/5">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase inline-block border ${
                                isWeekend
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {d.dayName}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center font-sans font-black border-r border-white/5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 border ${
                                isWeekend
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              }`}
                            >
                              <i className={`fas ${isWeekend ? 'fa-champagne-glasses' : 'fa-briefcase'} text-[8px]`}></i>
                              {isWeekend ? 'WEEKEND (Sabtu-Minggu)' : 'WEEKDAY (Senin-Jumat)'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400 border-r border-white/5">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                              W{d.weekNum}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {formatIDR(d.target)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-300">
                            {formatIDR(d.lunch)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-indigo-300">
                            {formatIDR(d.dinner)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-white text-xs">
                            <span className={isWeekend ? 'text-amber-300' : 'text-blue-300'}>
                              Rp {formatIDR(d.totalActual)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${
                                d.ach >= 100
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-white/5 text-slate-400'
                              }`}
                            >
                              {d.ach.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[10px]">
                            <span className={d.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {d.diff >= 0 ? '+' : ''}{formatIDR(d.diff)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans text-[10px]">
                            <span className="text-amber-400 font-bold">{d.lunchSplit.toFixed(0)}%</span>
                            <span className="text-slate-500 mx-1">:</span>
                            <span className="text-indigo-400 font-bold">{d.dinnerSplit.toFixed(0)}%</span>
                          </td>
                          {activeOutlet === 'ALL' && (
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedDayDetail(isDayExpanded ? null : d.day)}
                                className={`px-2 py-0.5 rounded text-[9px] font-sans font-bold border transition-all cursor-pointer ${
                                  isDayExpanded
                                    ? 'bg-indigo-600 text-white border-indigo-500'
                                    : 'bg-white/5 text-slate-400 hover:text-white border-white/10'
                                }`}
                              >
                                {isDayExpanded ? 'Tutup' : 'Outlet'}
                              </button>
                            </td>
                          )}
                        </tr>

                        {/* OUTLET BREAKDOWN ROW FOR A SPECIFIC DATE */}
                        {isDayExpanded && activeOutlet === 'ALL' && (
                          <tr className="bg-slate-950/90 border-b border-indigo-500/20">
                            <td colSpan={13} className="p-3">
                              <div className="bg-slate-900 rounded-xl p-3 border border-white/10 space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-white border-b border-white/10 pb-2">
                                  <span className="flex items-center gap-2">
                                    <i className="fas fa-store text-indigo-400"></i>
                                    Kontribusi Revenue Outlet pada {d.dayName}, {String(d.day).padStart(2, '0')} {monthName} {selectedYear}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {d.outletDetails.length} Outlet Tercatat
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                  {d.outletDetails.map(o => (
                                    <div key={o.outlet} className="bg-slate-950 p-2.5 rounded-lg border border-white/5 space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-black text-white">
                                        <span className="truncate">{o.outlet}</span>
                                        <span className={`text-[10px] ${o.ach >= 100 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                          {o.ach.toFixed(0)}%
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                        <span>Target: Rp {formatIDR(o.target)}</span>
                                        <span className="font-bold text-white">Rp {formatIDR(o.total)}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                                        <span>L: Rp {formatIDR(o.lunch)}</span>
                                        <span>D: Rp {formatIDR(o.dinner)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredDailyData.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400 text-xs">
                        Tidak ada data harian yang cocok dengan filter yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* DAILY FOOTER */}
                <tfoot>
                  <tr className="bg-slate-950 font-black text-white text-xs border-t-2 border-indigo-500">
                    <td colSpan={5} className="py-4 px-4 uppercase tracking-wider text-indigo-400 border-r border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-sigma text-indigo-400"></i>
                          TOTAL &amp; RATA-RATA ({dailySummaryStats.count} HARI TERPILIH)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-normal">
                          Rata-rata: Rp {formatIDR(dailySummaryStats.avgRevenue)}/hari
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-right font-mono text-slate-300">
                      Rp {formatIDR(dailySummaryStats.targetSum)}
                    </td>
                    <td className="py-4 px-3 text-right font-mono text-amber-300">
                      Rp {formatIDR(dailySummaryStats.lunchSum)}
                    </td>
                    <td className="py-4 px-3 text-right font-mono text-indigo-300">
                      Rp {formatIDR(dailySummaryStats.dinnerSum)}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-indigo-300 font-black text-sm">
                      Rp {formatIDR(dailySummaryStats.revenueSum)}
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-bold text-emerald-400">
                      {dailySummaryStats.ach.toFixed(1)}%
                    </td>
                    <td className="py-4 px-3 text-right font-mono font-bold">
                      <span className={dailySummaryStats.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {dailySummaryStats.diff >= 0 ? '+' : ''}Rp {formatIDR(dailySummaryStats.diff)}
                      </span>
                    </td>
                    <td colSpan={activeOutlet === 'ALL' ? 2 : 1} className="py-4 px-3 text-center text-slate-500 text-[10px]">
                      —
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. TABLE: RATA-RATA PER HARI (SENIN S/D MINGGU) */}
      {viewSubTab === 'DAY_BREAKDOWN' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-calendar-days text-indigo-400"></i>
                Rata-Rata Revenue Harian per Nama Hari (Senin - Minggu)
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Akumulasi rata-rata revenue harian untuk setiap hari dalam seminggu selama bulan {monthName} {selectedYear}.
              </p>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Total 7 Hari dalam Seminggu
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                  <th className="py-3 px-3 text-center w-12 border-r border-white/5">NO</th>
                  <th className="py-3 px-4 border-r border-white/5 min-w-[150px]">NAMA HARI</th>
                  <th className="py-3 px-3 text-center border-r border-white/5 w-28">KATEGORI</th>
                  <th className="py-3 px-3 text-center border-r border-white/5 w-24">JML HARI</th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[140px]">TOTAL REVENUE (RP)</th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[150px] bg-indigo-950/40 text-indigo-300">
                    RATA-RATA REVENUE (RP)
                  </th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[120px]">RATA-RATA LUNCH</th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[120px]">RATA-RATA DINNER</th>
                  <th className="py-3 px-3 text-center border-r border-white/5 w-24">ACH (%)</th>
                  <th className="py-3 px-3 text-center min-w-[110px]">SPLIT L / D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
                {dayBreakdownData.map((d, idx) => (
                  <tr key={d.dayIdx} className={`hover:bg-white/5 transition-colors ${d.isWeekend ? 'bg-amber-950/10' : ''}`}>
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-black text-white border-r border-white/5">
                      <span className="text-sm">{d.dayName}</span>
                    </td>
                    <td className="py-3 px-3 text-center border-r border-white/5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        d.isWeekend
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}>
                        {d.isWeekend ? 'Weekend' : 'Weekday'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-300 border-r border-white/5">
                      {d.count} Hari
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300 border-r border-white/5">
                      {formatIDR(d.revenueSum)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-300 bg-indigo-950/20 text-xs border-r border-white/5">
                      Rp {formatIDR(d.avgRevenue)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-400 border-r border-white/5">
                      {formatIDR(d.avgLunch)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-indigo-400 border-r border-white/5">
                      {formatIDR(d.avgDinner)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold border-r border-white/5">
                      <span className={d.ach >= 100 ? 'text-emerald-400' : 'text-slate-400'}>
                        {d.ach.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{d.lunchSplit.toFixed(0)}%</span>
                      <span className="text-slate-500 mx-1">:</span>
                      <span className="text-indigo-400 font-bold">{d.dinnerSplit.toFixed(0)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. TABLE: KOMPARASI OUTLET */}
      {viewSubTab === 'OUTLET_COMPARISON' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-store text-indigo-400"></i>
                Komparasi Rata-Rata Weekday vs Weekend per Outlet
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Perbandingan performa harian hari kerja (Senin-Jumat) dibanding akhir pekan (Sabtu-Minggu) untuk masing-masing outlet.
              </p>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {outletComparisonData.length} Outlet Terdaftar
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                  <th className="py-3 px-3 text-center w-12 border-r border-white/5">NO</th>
                  <th className="py-3 px-4 border-r border-white/5 min-w-[180px]">OUTLET</th>
                  <th className="py-3 px-3 text-center border-r border-white/5 w-32">AREA</th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[150px] bg-blue-950/30 text-blue-300">
                    RATA-RATA WEEKDAY
                  </th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[150px] bg-amber-950/30 text-amber-300">
                    RATA-RATA WEEKEND
                  </th>
                  <th className="py-3 px-3 text-right border-r border-white/5 min-w-[130px]">SELISIH (+/-)</th>
                  <th className="py-3 px-3 text-center border-r border-white/5 min-w-[120px]">WEEKEND UPLIFT</th>
                  <th className="py-3 px-3 text-right min-w-[140px]">TOTAL REVENUE MTD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
                {outletComparisonData.map(o => (
                  <tr key={o.outlet} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                      {o.no}
                    </td>
                    <td className="py-3 px-4 font-black text-white border-r border-white/5">
                      <span className="text-sm">{o.outlet}</span>
                    </td>
                    <td className="py-3 px-3 text-center border-r border-white/5">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-800 text-slate-300 border border-white/10">
                        {o.area}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-blue-300 bg-blue-950/10 border-r border-white/5">
                      Rp {formatIDR(o.avgWeekday)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300 bg-amber-950/10 border-r border-white/5">
                      Rp {formatIDR(o.avgWeekend)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold border-r border-white/5">
                      <span className={o.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {o.diff >= 0 ? '+' : ''}Rp {formatIDR(o.diff)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black text-emerald-400 border-r border-white/5">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                        +{o.uplift.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-white">
                      Rp {formatIDR(o.totalRev)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
