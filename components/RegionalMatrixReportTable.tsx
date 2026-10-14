import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, MONTHS } from '../constants';
import { AppState, Outlet } from '../types';

export interface RegionalMatrixReportProps {
  title: string;
  subtitle?: string;
  badgeLabel: string;
  icon: string;
  themeColor: 'indigo' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'cyan' | 'teal';
  allOutletsData: Record<string, any>;
  data?: AppState;
  selectedMonth: number;
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  // Function to extract numeric value for an outlet on a specific date (YYYY-MM-DD)
  extractDailyValue: (outletMonths: any, dateStr: string, outlet: string) => number;
  // Function to extract transaction count (optional)
  extractDailyTxCount?: (outletMonths: any, dateStr: string, outlet: string) => number;
  // Format mode: 'CURRENCY' (Rp) | 'NUMBER' | 'RATING'
  valueType?: 'CURRENCY' | 'NUMBER' | 'RATING';
  initialViewMode?: 'HARIAN' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_WEEK' | 'COMPARE_MONTH' | 'COMPARE_LAST_WEEK' | 'COMPARE_LAST_MONTH';
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const RegionalMatrixReportTable: React.FC<RegionalMatrixReportProps> = ({
  title,
  subtitle,
  badgeLabel,
  icon,
  themeColor,
  allOutletsData,
  data,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast,
  extractDailyValue,
  extractDailyTxCount,
  valueType = 'CURRENCY',
  initialViewMode
}) => {
  const resolveViewMode = (mode?: string): 'HARIAN' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_WEEK' | 'COMPARE_MONTH' => {
    if (mode === 'COMPARE_LAST_WEEK' || mode === 'COMPARE_WEEK') return 'COMPARE_WEEK';
    if (mode === 'COMPARE_LAST_MONTH' || mode === 'COMPARE_MONTH') return 'COMPARE_MONTH';
    if (mode === 'WEEKLY') return 'WEEKLY';
    if (mode === 'MONTHLY') return 'MONTHLY';
    if (mode === 'YTD') return 'YTD';
    return 'HARIAN';
  };

  const [activeArea, setActiveArea] = useState<string>(selectedArea);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'HARIAN' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_WEEK' | 'COMPARE_MONTH'>(() => resolveViewMode(initialViewMode));
  const [selectedWeekForCompare, setSelectedWeekForCompare] = useState<number>(() => {
    // Default to current week based on today's day of month
    const today = new Date();
    const curDay = today.getDate();
    if (curDay <= 7) return 1;
    if (curDay <= 14) return 2;
    if (curDay <= 21) return 3;
    if (curDay <= 28) return 4;
    return 5;
  });

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  // 4 Standard Weeks Definition (Cut-off 1 - 30 / Akhir Bulan, sisa hari tidak sampai 7 hari terhitung Week 4 sehingga Week 4 bisa lebih dari 7 hari)
  const weeks = useMemo(() => [
    { num: 1, label: 'Week 1', range: 'Tgl 1 - 7', startDay: 1, endDay: 7 },
    { num: 2, label: 'Week 2', range: 'Tgl 8 - 14', startDay: 8, endDay: 14 },
    { num: 3, label: 'Week 3', range: 'Tgl 15 - 21', startDay: 15, endDay: 21 },
    { num: 4, label: 'Week 4', range: `Tgl 22 - ${daysInMonth}`, startDay: 22, endDay: daysInMonth }
  ], [daysInMonth]);

  // Filtered outlets
  const filteredOutlets = useMemo(() => {
    return OUTLETS.filter(outlet => {
      const area = getAreaForOutlet(outlet);
      if (activeArea !== 'ALL' && area !== activeArea) return false;
      if (selectedOutlet && selectedOutlet !== 'ALL' && outlet !== selectedOutlet) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return outlet.toLowerCase().includes(q) || area.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeArea, selectedOutlet, searchTerm]);

  // Daily Matrix Calculation for the entire month
  // outlet -> day (1..daysInMonth) -> value
  const dailyMatrix = useMemo(() => {
    const matrix: Record<string, Record<number, number>> = {};
    const txMatrix: Record<string, Record<number, number>> = {};

    OUTLETS.forEach(outlet => {
      const outletMonths = allOutletsData?.[outlet] || {};
      matrix[outlet] = {};
      txMatrix[outlet] = {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        const val = extractDailyValue(outletMonths, dateStr, outlet);
        const tx = extractDailyTxCount ? extractDailyTxCount(outletMonths, dateStr, outlet) : 0;
        matrix[outlet][d] = val;
        txMatrix[outlet][d] = tx;
      }
    });

    return { matrix, txMatrix };
  }, [allOutletsData, selectedMonth, selectedYear, monthKey, daysInMonth, extractDailyValue, extractDailyTxCount]);

  // Weekly Matrix: outlet -> weekNum -> value
  const weeklyMatrix = useMemo(() => {
    const res: Record<string, Record<number, number>> = {};

    OUTLETS.forEach(outlet => {
      res[outlet] = {};
      weeks.forEach(w => {
        let sum = 0;
        for (let d = w.startDay; d <= Math.min(w.endDay, daysInMonth); d++) {
          sum += dailyMatrix.matrix[outlet]?.[d] || 0;
        }
        res[outlet][w.num] = sum;
      });
    });

    return res;
  }, [dailyMatrix, weeks, daysInMonth]);

  // Monthly Matrix for all 12 months of the year
  // outlet -> monthIndex (0..11) -> value
  const monthlyMatrix = useMemo(() => {
    const res: Record<string, Record<number, number>> = {};

    OUTLETS.forEach(outlet => {
      res[outlet] = {};
      const outletMonths = allOutletsData?.[outlet] || {};

      for (let m = 0; m < 12; m++) {
        let mSum = 0;
        const mKey = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
        const daysInM = new Date(selectedYear, m + 1, 0).getDate();

        for (let d = 1; d <= daysInM; d++) {
          const dateStr = `${mKey}-${String(d).padStart(2, '0')}`;
          mSum += extractDailyValue(outletMonths, dateStr, outlet);
        }
        res[outlet][m] = mSum;
      }
    });

    return res;
  }, [allOutletsData, selectedYear, extractDailyValue]);

  // YTD Calculation: sum of months 0..selectedMonth
  const ytdMatrix = useMemo(() => {
    const res: Record<string, { totalYtd: number; avgMonthly: number; mtdShare: number }> = {};
    let grandYtd = 0;

    OUTLETS.forEach(outlet => {
      let sum = 0;
      for (let m = 0; m <= selectedMonth; m++) {
        sum += monthlyMatrix[outlet]?.[m] || 0;
      }
      const monthsCount = selectedMonth + 1;
      const avg = monthsCount > 0 ? sum / monthsCount : 0;
      res[outlet] = { totalYtd: sum, avgMonthly: avg, mtdShare: 0 };
      grandYtd += sum;
    });

    // Compute share
    OUTLETS.forEach(outlet => {
      if (grandYtd > 0) {
        res[outlet].mtdShare = (res[outlet].totalYtd / grandYtd) * 100;
      }
    });

    return { outletYtd: res, grandYtd };
  }, [monthlyMatrix, selectedMonth]);

  // Compare Last Week Data
  // Compare week W vs week W-1
  const compareWeekData = useMemo(() => {
    const curW = selectedWeekForCompare;
    const prevW = curW > 1 ? curW - 1 : 1;
    const isFirstWeek = curW === 1;

    const rows = filteredOutlets.map(outlet => {
      const curVal = weeklyMatrix[outlet]?.[curW] || 0;
      const prevVal = !isFirstWeek ? (weeklyMatrix[outlet]?.[prevW] || 0) : 0;
      const diff = curVal - prevVal;
      const pct = prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : (curVal > 0 ? 100 : 0);

      return {
        outlet,
        area: getAreaForOutlet(outlet),
        curVal,
        prevVal,
        diff,
        pct,
        trend: diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'EQUAL'
      };
    });

    const totalCur = rows.reduce((s, r) => s + r.curVal, 0);
    const totalPrev = rows.reduce((s, r) => s + r.prevVal, 0);
    const totalDiff = totalCur - totalPrev;
    const totalPct = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev) * 100 : (totalCur > 0 ? 100 : 0);

    return {
      curW,
      prevW,
      isFirstWeek,
      rows,
      totalCur,
      totalPrev,
      totalDiff,
      totalPct
    };
  }, [selectedWeekForCompare, filteredOutlets, weeklyMatrix]);

  // MTD Summary per outlet
  const mtdPerOutlet = useMemo(() => {
    const res: Record<string, number> = {};
    OUTLETS.forEach(outlet => {
      let sum = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        sum += dailyMatrix.matrix[outlet]?.[d] || 0;
      }
      res[outlet] = sum;
    });
    return res;
  }, [dailyMatrix, daysInMonth]);

  // Previous Month Calculations for Compare Last Month
  const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevMonthName = MONTH_NAMES[prevMonthIdx];
  const prevMonthKey = `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
  const daysInPrevMonth = useMemo(() => new Date(prevMonthYear, prevMonthIdx + 1, 0).getDate(), [prevMonthYear, prevMonthIdx]);

  // Previous Month MTD per outlet
  const prevMonthPerOutlet = useMemo(() => {
    const res: Record<string, number> = {};
    OUTLETS.forEach(outlet => {
      const outletMonths = allOutletsData?.[outlet] || {};
      let sum = 0;
      for (let d = 1; d <= daysInPrevMonth; d++) {
        const dateStr = `${prevMonthKey}-${String(d).padStart(2, '0')}`;
        sum += extractDailyValue(outletMonths, dateStr, outlet);
      }
      res[outlet] = sum;
    });
    return res;
  }, [allOutletsData, prevMonthIdx, prevMonthYear, prevMonthKey, daysInPrevMonth, extractDailyValue]);

  // Compare Last Month Data
  const compareMonthData = useMemo(() => {
    const rows = filteredOutlets.map(outlet => {
      const curVal = mtdPerOutlet[outlet] || 0;
      const prevVal = prevMonthPerOutlet[outlet] || 0;
      const diff = curVal - prevVal;
      const pct = prevVal > 0 ? (diff / prevVal) * 100 : (curVal > 0 ? 100 : 0);
      return {
        outlet,
        area: getAreaForOutlet(outlet),
        curVal,
        prevVal,
        diff,
        pct,
        trend: diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'EQUAL'
      };
    });

    const totalCur = rows.reduce((s, r) => s + r.curVal, 0);
    const totalPrev = rows.reduce((s, r) => s + r.prevVal, 0);
    const totalDiff = totalCur - totalPrev;
    const totalPct = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev) * 100 : (totalCur > 0 ? 100 : 0);

    return {
      curMonthName: monthName,
      prevMonthName,
      curYear: selectedYear,
      prevYear: prevMonthYear,
      rows,
      totalCur,
      totalPrev,
      totalDiff,
      totalPct
    };
  }, [filteredOutlets, mtdPerOutlet, prevMonthPerOutlet, monthName, prevMonthName, selectedYear, prevMonthYear]);

  // Grand Totals for Daily
  const dailyGrandTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      let sum = 0;
      filteredOutlets.forEach(o => {
        sum += dailyMatrix.matrix[o]?.[d] || 0;
      });
      totals[d] = sum;
    }
    const mtdTotal = filteredOutlets.reduce((s, o) => s + (mtdPerOutlet[o] || 0), 0);
    return { totals, mtdTotal };
  }, [filteredOutlets, dailyMatrix, daysInMonth, mtdPerOutlet]);

  // Grand Totals for Weekly
  const weeklyGrandTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    weeks.forEach(w => {
      let sum = 0;
      filteredOutlets.forEach(o => {
        sum += weeklyMatrix[o]?.[w.num] || 0;
      });
      totals[w.num] = sum;
    });
    return totals;
  }, [weeks, filteredOutlets, weeklyMatrix]);

  // Grand Totals for Monthly
  const monthlyGrandTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (let m = 0; m < 12; m++) {
      let sum = 0;
      filteredOutlets.forEach(o => {
        sum += monthlyMatrix[o]?.[m] || 0;
      });
      totals[m] = sum;
    }
    const yearTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    return { totals, yearTotal };
  }, [filteredOutlets, monthlyMatrix]);

  // Format Helper
  const formatVal = (val: number, compact = false) => {
    if (!val || val === 0) return '-';
    if (valueType === 'CURRENCY') {
      if (compact && Math.abs(val) >= 1_000_000) {
        return `${(val / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`;
      }
      return `Rp ${val.toLocaleString('id-ID')}`;
    }
    if (valueType === 'RATING') {
      return val.toFixed(2);
    }
    return val.toLocaleString('id-ID');
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheetName = `${title.slice(0, 20)} ${monthName} ${selectedYear}`;
      const sheet = workbook.addWorksheet(sheetName);

      sheet.views = [{ showGridLines: true }];

      // Title
      sheet.mergeCells('A1:J1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `LAPORAN REGIONAL: ${title.toUpperCase()} - ${monthName.toUpperCase()} ${selectedYear}`;
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 34;

      if (viewMode === 'HARIAN') {
        // Headers: No, Outlet, Area, Tgl 1..daysInMonth, Total MTD
        const headers = ['NO', 'OUTLET', 'AREA', ...Array.from({ length: daysInMonth }, (_, i) => `TGL ${i + 1}`), 'TOTAL MTD'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        filteredOutlets.forEach((o, idx) => {
          const rowVals: any[] = [
            idx + 1,
            o,
            getAreaForOutlet(o),
            ...Array.from({ length: daysInMonth }, (_, i) => dailyMatrix.matrix[o]?.[i + 1] || 0),
            mtdPerOutlet[o] || 0
          ];
          sheet.addRow(rowVals);
        });

        // Total Row
        const totRowVals: any[] = [
          '',
          'TOTAL REGIONAL',
          activeArea,
          ...Array.from({ length: daysInMonth }, (_, i) => dailyGrandTotals.totals[i + 1] || 0),
          dailyGrandTotals.mtdTotal
        ];
        const totRow = sheet.addRow(totRowVals);
        totRow.font = { bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
      } else if (viewMode === 'WEEKLY') {
        const headers = ['NO', 'OUTLET', 'AREA', 'WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4', 'WEEK 5', 'TOTAL MTD'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        filteredOutlets.forEach((o, idx) => {
          sheet.addRow([
            idx + 1,
            o,
            getAreaForOutlet(o),
            weeklyMatrix[o]?.[1] || 0,
            weeklyMatrix[o]?.[2] || 0,
            weeklyMatrix[o]?.[3] || 0,
            weeklyMatrix[o]?.[4] || 0,
            weeklyMatrix[o]?.[5] || 0,
            mtdPerOutlet[o] || 0
          ]);
        });

        sheet.addRow([
          '',
          'TOTAL REGIONAL',
          activeArea,
          weeklyGrandTotals[1] || 0,
          weeklyGrandTotals[2] || 0,
          weeklyGrandTotals[3] || 0,
          weeklyGrandTotals[4] || 0,
          weeklyGrandTotals[5] || 0,
          dailyGrandTotals.mtdTotal
        ]);
      } else if (viewMode === 'MONTHLY') {
        const headers = ['NO', 'OUTLET', 'AREA', ...MONTH_NAMES, 'TOTAL TAHUNAN'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        filteredOutlets.forEach((o, idx) => {
          let yrSum = 0;
          for (let m = 0; m < 12; m++) yrSum += monthlyMatrix[o]?.[m] || 0;
          sheet.addRow([
            idx + 1,
            o,
            getAreaForOutlet(o),
            ...MONTH_NAMES.map((_, mIdx) => monthlyMatrix[o]?.[mIdx] || 0),
            yrSum
          ]);
        });
      } else if (viewMode === 'YTD') {
        const headers = ['NO', 'OUTLET', 'AREA', `TOTAL YTD (JAN - ${monthName.toUpperCase()})`, 'RATA-RATA / BULAN', 'KONTRIBUSI REGIONAL (%)'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        filteredOutlets.forEach((o, idx) => {
          const y = ytdMatrix.outletYtd[o];
          sheet.addRow([
            idx + 1,
            o,
            getAreaForOutlet(o),
            y?.totalYtd || 0,
            y?.avgMonthly || 0,
            `${(y?.mtdShare || 0).toFixed(1)}%`
          ]);
        });
      } else if (viewMode === 'COMPARE_MONTH') {
        // COMPARE MONTH
        const headers = ['NO', 'OUTLET', 'AREA', `${compareMonthData.curMonthName.toUpperCase()} ${compareMonthData.curYear} (BULAN INI)`, `${compareMonthData.prevMonthName.toUpperCase()} ${compareMonthData.prevYear} (BULAN LALU)`, 'VARIAN (SELISIH)', 'PERTUMBUHAN (%)'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        compareMonthData.rows.forEach((r, idx) => {
          sheet.addRow([
            idx + 1,
            r.outlet,
            r.area,
            r.curVal,
            r.prevVal,
            r.diff,
            `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`
          ]);
        });
      } else {
        // COMPARE WEEK
        const headers = ['NO', 'OUTLET', 'AREA', `MINGGU INI (W${compareWeekData.curW})`, `MINGGU LALU (W${compareWeekData.prevW})`, 'VARIAN (SELISIH)', 'PERTUMBUHAN (%)'];
        const hRow = sheet.addRow(headers);
        hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        compareWeekData.rows.forEach((r, idx) => {
          sheet.addRow([
            idx + 1,
            r.outlet,
            r.area,
            r.curVal,
            r.prevVal,
            r.diff,
            `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`
          ]);
        });
      }

      sheet.columns.forEach(col => {
        col.width = 16;
      });
      sheet.getColumn(2).width = 24;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Rekap_Regional_${title.replace(/\s+/g, '_')}_${viewMode}_${monthName}_${selectedYear}.xlsx`);
      showToast?.(`Berhasil mengunduh Excel Laporan ${title} (${viewMode})`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast?.('Gagal mengunduh Excel: ' + err.message, 'error');
    }
  };

  // Color schemes
  const colorMap = {
    indigo: {
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      activeTab: 'bg-indigo-600 text-white shadow-indigo-900/40',
      icon: 'text-indigo-400',
      borderAccent: 'border-indigo-500/40',
      headerBg: 'bg-indigo-950/70 text-indigo-300'
    },
    emerald: {
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      activeTab: 'bg-emerald-600 text-white shadow-emerald-900/40',
      icon: 'text-emerald-400',
      borderAccent: 'border-emerald-500/40',
      headerBg: 'bg-emerald-950/70 text-emerald-300'
    },
    amber: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      activeTab: 'bg-amber-600 text-white shadow-amber-900/40',
      icon: 'text-amber-400',
      borderAccent: 'border-amber-500/40',
      headerBg: 'bg-amber-950/70 text-amber-300'
    },
    rose: {
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      activeTab: 'bg-rose-600 text-white shadow-rose-900/40',
      icon: 'text-rose-400',
      borderAccent: 'border-rose-500/40',
      headerBg: 'bg-rose-950/70 text-rose-300'
    },
    blue: {
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      activeTab: 'bg-blue-600 text-white shadow-blue-900/40',
      icon: 'text-blue-400',
      borderAccent: 'border-blue-500/40',
      headerBg: 'bg-blue-950/70 text-blue-300'
    },
    purple: {
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      activeTab: 'bg-purple-600 text-white shadow-purple-900/40',
      icon: 'text-purple-400',
      borderAccent: 'border-purple-500/40',
      headerBg: 'bg-purple-950/70 text-purple-300'
    },
    cyan: {
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      activeTab: 'bg-cyan-600 text-white shadow-cyan-900/40',
      icon: 'text-cyan-400',
      borderAccent: 'border-cyan-500/40',
      headerBg: 'bg-cyan-950/70 text-cyan-300'
    },
    teal: {
      badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      activeTab: 'bg-teal-600 text-white shadow-teal-900/40',
      icon: 'text-teal-400',
      borderAccent: 'border-teal-500/40',
      headerBg: 'bg-teal-950/70 text-teal-300'
    }
  };

  const scheme = colorMap[themeColor] || colorMap.indigo;

  return (
    <div className="space-y-6 animate-fade-in text-slate-200">
      
      {/* TOP HEADER CONTROLS */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${scheme.badge}`}>
              {badgeLabel}
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-xs font-bold text-slate-300">
              Periode: <strong className="text-white">{monthName} {selectedYear}</strong>
            </span>
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1 flex items-center gap-3">
            <i className={`fas ${icon} ${scheme.icon}`}></i>
            Laporan Regional {title}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {subtitle || `Konsolidasi matriks harian, mingguan, bulanan, YTD, dan perbandingan minggu lalu untuk seluruh outlet.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Area Selector */}
          <select
            value={activeArea}
            onChange={(e) => setActiveArea(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
          >
            <option value="ALL">Semua Area</option>
            <option value="JAKARTA">JAKARTA</option>
            <option value="TANGGERANG">TANGGERANG</option>
            <option value="BEKASI & CIBUBUR">BEKASI & CIBUBUR</option>
          </select>

          {/* Search */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white outline-none w-36 focus:w-48 transition-all"
            />
          </div>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>

      {/* VIEW MODE SELECTOR (HARIAN, WEEKLY, MONTHLY, YTD, COMPARE LAST WEEK) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-2 rounded-2xl border border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setViewMode('HARIAN')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'HARIAN' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-calendar-days"></i>
            <span>Matrix Harian</span>
            <span className="text-[9px] opacity-75 font-mono">(1-{daysInMonth})</span>
          </button>

          <button
            onClick={() => setViewMode('WEEKLY')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'WEEKLY' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-calendar-week"></i>
            <span>Matrix Weekly</span>
            <span className="text-[9px] opacity-75 font-mono">(W1-W5)</span>
          </button>

          <button
            onClick={() => setViewMode('MONTHLY')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'MONTHLY' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-calendar-alt"></i>
            <span>Matrix Monthly</span>
            <span className="text-[9px] opacity-75 font-mono">(Jan-Des)</span>
          </button>

          <button
            onClick={() => setViewMode('YTD')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'YTD' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-chart-line"></i>
            <span>Matrix YTD</span>
            <span className="text-[9px] opacity-75 font-mono">(Kumulatif)</span>
          </button>

          <button
            onClick={() => setViewMode('COMPARE_WEEK')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'COMPARE_WEEK' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-code-compare"></i>
            <span>Compare Last Week</span>
            <span className="text-[9px] opacity-75 font-mono">(Δ Growth)</span>
          </button>

          <button
            onClick={() => setViewMode('COMPARE_MONTH')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === 'COMPARE_MONTH' ? scheme.activeTab : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-arrows-split-up-and-left"></i>
            <span>Compare Last Month</span>
            <span className="text-[9px] opacity-75 font-mono">(MoM Growth)</span>
          </button>
        </div>

        {/* Sub-selector for Compare Week */}
        {viewMode === 'COMPARE_WEEK' && (
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Bandingkan:</span>
            <select
              value={selectedWeekForCompare}
              onChange={(e) => setSelectedWeekForCompare(Number(e.target.value))}
              className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-xs font-black text-amber-300 outline-none cursor-pointer"
            >
              {weeks.map(w => (
                <option key={w.num} value={w.num}>
                  {w.label} vs {w.num > 1 ? `Week ${w.num - 1}` : 'Target/Awal'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total MTD */}
        <div className="glass-card p-4 rounded-2xl bg-slate-900/80 border border-white/10">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Total {title} (MTD)
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1">
            {formatVal(dailyGrandTotals.mtdTotal)}
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
            Bulan {monthName} {selectedYear}
          </div>
        </div>

        {/* Rata-rata Harian */}
        <div className="glass-card p-4 rounded-2xl bg-slate-900/80 border border-white/10">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Rata-rata Regional / Hari
          </div>
          <div className="text-2xl font-black text-blue-300 font-mono mt-1">
            {daysInMonth > 0 ? formatVal(Math.round(dailyGrandTotals.mtdTotal / daysInMonth)) : '-'}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {daysInMonth} Hari Operasional
          </div>
        </div>

        {/* Kumulatif YTD */}
        <div className="glass-card p-4 rounded-2xl bg-slate-900/80 border border-white/10">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Kumulatif YTD (Jan-{monthName.slice(0, 3)})
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
            {formatVal(ytdMatrix.grandYtd)}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            Tahun Berjalan {selectedYear}
          </div>
        </div>

        {/* Status Perbandingan Minggu Ini vs Minggu Lalu */}
        <div className="glass-card p-4 rounded-2xl bg-slate-900/80 border border-white/10">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Varian W{compareWeekData.curW} vs W{compareWeekData.prevW}
          </div>
          <div className={`text-2xl font-black font-mono mt-1 flex items-center gap-1.5 ${
            compareWeekData.totalDiff > 0 ? 'text-amber-400' : compareWeekData.totalDiff < 0 ? 'text-emerald-400' : 'text-slate-300'
          }`}>
            <span>{compareWeekData.totalDiff >= 0 ? `+${formatVal(compareWeekData.totalDiff, true)}` : formatVal(compareWeekData.totalDiff, true)}</span>
            <span className="text-xs">({compareWeekData.totalPct >= 0 ? '+' : ''}{compareWeekData.totalPct.toFixed(1)}%)</span>
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {compareWeekData.totalDiff >= 0 ? 'Kenaikan Pengeluaran' : 'Penurunan / Efisiensi'}
          </div>
        </div>
      </div>

      {/* TABLE RENDERING BASED ON ACTIVE VIEW */}
      <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
        <div className="overflow-x-auto custom-scrollbar max-h-[75vh]">
          
          {/* 1. VIEW HARIAN */}
          {viewMode === 'HARIAN' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1200px]">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-amber-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[170px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[90px]">
                    AREA
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                    <th key={d} className="p-2 text-center border-r border-white/10 bg-slate-900 min-w-[75px]">
                      <span className="text-[10px] font-black text-amber-300">TGL {d}</span>
                    </th>
                  ))}
                  <th className={`p-2.5 text-center border-r border-white/10 ${scheme.headerBg} min-w-[110px]`}>
                    TOTAL MTD
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {filteredOutlets.map((outlet, idx) => (
                  <tr key={outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20 truncate">
                      <button
                        onClick={() => onSelectOutlet && onSelectOutlet(outlet)}
                        className="hover:underline hover:text-amber-300 text-left cursor-pointer"
                      >
                        {outlet}
                      </button>
                    </td>
                    <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                      {getAreaForOutlet(outlet)}
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const val = dailyMatrix.matrix[outlet]?.[d] || 0;
                      return (
                        <td key={d} className={`p-2 text-right border-r border-white/5 ${val > 0 ? 'text-white' : 'text-slate-600'}`}>
                          {formatVal(val, true)}
                        </td>
                      );
                    })}
                    <td className="p-2.5 text-right font-black text-amber-300 border-r border-white/5 bg-amber-950/20">
                      {formatVal(mtdPerOutlet[outlet] || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-amber-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-amber-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                    <td key={d} className="p-2 text-right font-mono font-black text-amber-300 border-r border-white/10 bg-slate-900">
                      {formatVal(dailyGrandTotals.totals[d] || 0, true)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-mono font-black text-amber-300 bg-amber-950/60 border-l border-white/10">
                    {formatVal(dailyGrandTotals.mtdTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* 2. VIEW WEEKLY */}
          {viewMode === 'WEEKLY' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-indigo-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[180px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[90px]">
                    AREA
                  </th>
                  {weeks.map(w => (
                    <th key={w.num} className="p-3 text-center border-r border-white/10 bg-slate-900 min-w-[110px]">
                      <div className="flex flex-col items-center">
                        <span className="text-[11px] font-black text-indigo-300">{w.label}</span>
                        <span className="text-[8px] text-slate-400 font-mono font-normal">{w.range}</span>
                      </div>
                    </th>
                  ))}
                  <th className={`p-3 text-center border-r border-white/10 ${scheme.headerBg} min-w-[120px]`}>
                    TOTAL MTD
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {filteredOutlets.map((outlet, idx) => (
                  <tr key={outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20 truncate">
                      {outlet}
                    </td>
                    <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                      {getAreaForOutlet(outlet)}
                    </td>
                    {weeks.map(w => {
                      const val = weeklyMatrix[outlet]?.[w.num] || 0;
                      return (
                        <td key={w.num} className={`p-3 text-right border-r border-white/5 ${val > 0 ? 'text-white' : 'text-slate-600'}`}>
                          {formatVal(val)}
                        </td>
                      );
                    })}
                    <td className="p-3 text-right font-black text-indigo-300 border-r border-white/5 bg-indigo-950/20">
                      {formatVal(mtdPerOutlet[outlet] || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-indigo-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-indigo-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  {weeks.map(w => (
                    <td key={w.num} className="p-3 text-right font-mono font-black text-indigo-300 border-r border-white/10 bg-slate-900">
                      {formatVal(weeklyGrandTotals[w.num] || 0)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-mono font-black text-indigo-300 bg-indigo-950/60 border-l border-white/10">
                    {formatVal(dailyGrandTotals.mtdTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* 3. VIEW MONTHLY */}
          {viewMode === 'MONTHLY' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1300px]">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-blue-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[180px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[90px]">
                    AREA
                  </th>
                  {MONTH_NAMES.map((m, mIdx) => (
                    <th key={m} className={`p-2.5 text-center border-r border-white/10 min-w-[85px] ${mIdx === selectedMonth ? 'bg-blue-900/60 text-amber-300' : 'bg-slate-900 text-slate-300'}`}>
                      {m.slice(0, 3).toUpperCase()}
                    </th>
                  ))}
                  <th className="p-3 text-center border-r border-white/10 bg-blue-950/60 text-blue-300 min-w-[120px]">
                    TOTAL {selectedYear}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {filteredOutlets.map((outlet, idx) => {
                  let yrSum = 0;
                  for (let m = 0; m < 12; m++) yrSum += monthlyMatrix[outlet]?.[m] || 0;
                  return (
                    <tr key={outlet} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20 truncate">
                        {outlet}
                      </td>
                      <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                        {getAreaForOutlet(outlet)}
                      </td>
                      {MONTH_NAMES.map((_, mIdx) => {
                        const val = monthlyMatrix[outlet]?.[mIdx] || 0;
                        const isCur = mIdx === selectedMonth;
                        return (
                          <td key={mIdx} className={`p-2.5 text-right border-r border-white/5 ${isCur ? 'bg-blue-950/20 font-black text-white' : val > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
                            {formatVal(val, true)}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-black text-blue-300 border-r border-white/5 bg-blue-950/30">
                        {formatVal(yrSum)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-blue-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-blue-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  {MONTH_NAMES.map((_, mIdx) => (
                    <td key={mIdx} className="p-2.5 text-right font-mono font-black text-blue-300 border-r border-white/10 bg-slate-900">
                      {formatVal(monthlyGrandTotals.totals[mIdx] || 0, true)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-mono font-black text-blue-300 bg-blue-950/60 border-l border-white/10">
                    {formatVal(monthlyGrandTotals.yearTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* 4. VIEW YTD */}
          {viewMode === 'YTD' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-emerald-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[200px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[100px]">
                    AREA
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-emerald-300 min-w-[150px]">
                    TOTAL YTD (JAN - {monthName.slice(0, 3).toUpperCase()})
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-blue-300 min-w-[140px]">
                    RATA-RATA / BULAN
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 text-amber-300 min-w-[130px]">
                    KONTRIBUSI REGIONAL
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 text-slate-300 min-w-[140px]">
                    STATUS KINERJA
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {filteredOutlets.map((outlet, idx) => {
                  const y = ytdMatrix.outletYtd[outlet] || { totalYtd: 0, avgMonthly: 0, mtdShare: 0 };
                  return (
                    <tr key={outlet} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20">
                        {outlet}
                      </td>
                      <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                        {getAreaForOutlet(outlet)}
                      </td>
                      <td className="p-3 text-right font-black text-emerald-300 border-r border-white/5 bg-emerald-950/10">
                        {formatVal(y.totalYtd)}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-300 border-r border-white/5">
                        {formatVal(Math.round(y.avgMonthly))}
                      </td>
                      <td className="p-3 text-center border-r border-white/5">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-black text-amber-300">{y.mtdShare.toFixed(1)}%</span>
                          <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.min(100, y.mtdShare * 3)}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center border-r border-white/5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          y.totalYtd > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {y.totalYtd > 0 ? 'Aktif Beroperasi' : 'Tanpa Transaksi'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-emerald-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-emerald-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-300 bg-emerald-950/60 border-r border-white/10">
                    {formatVal(ytdMatrix.grandYtd)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-blue-300 bg-slate-900 border-r border-white/10">
                    {formatVal(Math.round(ytdMatrix.grandYtd / (selectedMonth + 1)))}
                  </td>
                  <td className="p-3 text-center font-mono font-black text-amber-300 bg-slate-900 border-r border-white/10">
                    100.0%
                  </td>
                  <td className="p-3 text-center bg-slate-900 text-slate-400 text-[10px]">
                    Periode Kumulatif YTD
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* 5. VIEW COMPARE LAST WEEK */}
          {viewMode === 'COMPARE_WEEK' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-purple-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[200px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[100px]">
                    AREA
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-purple-300 min-w-[140px]">
                    WEEK {compareWeekData.curW} (MINGGU INI)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-slate-400 min-w-[140px]">
                    WEEK {compareWeekData.prevW} (MINGGU LALU)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-amber-300 min-w-[130px]">
                    VARIAN (SELISIH)
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 min-w-[120px]">
                    PERTUMBUHAN (%)
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 min-w-[120px]">
                    TREND
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {compareWeekData.rows.map((r, idx) => (
                  <tr key={r.outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20">
                      {r.outlet}
                    </td>
                    <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                      {r.area}
                    </td>
                    <td className="p-3 text-right font-black text-purple-300 border-r border-white/5 bg-purple-950/10">
                      {formatVal(r.curVal)}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-400 border-r border-white/5">
                      {formatVal(r.prevVal)}
                    </td>
                    <td className={`p-3 text-right font-black border-r border-white/5 ${r.diff > 0 ? 'text-amber-400' : r.diff < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {r.diff >= 0 ? `+${formatVal(r.diff)}` : formatVal(r.diff)}
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        r.pct > 0 ? 'bg-amber-500/20 text-amber-300' : r.pct < 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {r.pct >= 0 ? `+${r.pct.toFixed(1)}%` : `${r.pct.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      {r.trend === 'UP' ? (
                        <span className="text-amber-400 flex items-center justify-center gap-1 font-bold text-[10px]">
                          <i className="fas fa-arrow-trend-up"></i> Naik
                        </span>
                      ) : r.trend === 'DOWN' ? (
                        <span className="text-emerald-400 flex items-center justify-center gap-1 font-bold text-[10px]">
                          <i className="fas fa-arrow-trend-down"></i> Turun
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">- Stabil</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-purple-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-purple-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-purple-300 bg-purple-950/60 border-r border-white/10">
                    {formatVal(compareWeekData.totalCur)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-slate-400 bg-slate-900 border-r border-white/10">
                    {formatVal(compareWeekData.totalPrev)}
                  </td>
                  <td className={`p-3 text-right font-mono font-black border-r border-white/10 bg-slate-900 ${
                    compareWeekData.totalDiff >= 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}>
                    {compareWeekData.totalDiff >= 0 ? `+${formatVal(compareWeekData.totalDiff)}` : formatVal(compareWeekData.totalDiff)}
                  </td>
                  <td className="p-3 text-center font-mono font-black bg-slate-900 border-r border-white/10">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      compareWeekData.totalPct >= 0 ? 'text-amber-300' : 'text-emerald-300'
                    }`}>
                      {compareWeekData.totalPct >= 0 ? `+${compareWeekData.totalPct.toFixed(1)}%` : `${compareWeekData.totalPct.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="p-3 text-center bg-slate-900 text-slate-400 text-[10px]">
                    Perbandingan Mingguan
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* 6. VIEW COMPARE LAST MONTH */}
          {viewMode === 'COMPARE_MONTH' && (
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-purple-500/40">
                <tr>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                    NO
                  </th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[200px]">
                    OUTLET / STORE
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[100px]">
                    AREA
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-purple-300 min-w-[150px]">
                    {compareMonthData.curMonthName.toUpperCase()} {compareMonthData.curYear} (BULAN INI)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-slate-400 min-w-[150px]">
                    {compareMonthData.prevMonthName.toUpperCase()} {compareMonthData.prevYear} (BULAN LALU)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-slate-900 text-amber-300 min-w-[140px]">
                    VARIAN (SELISIH)
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 min-w-[120px]">
                    PERTUMBUHAN (%)
                  </th>
                  <th className="p-3 text-center border-r border-white/10 bg-slate-900 min-w-[120px]">
                    TREND
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {compareMonthData.rows.map((r, idx) => (
                  <tr key={r.outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-500 border-r border-white/5 bg-slate-950/80 sticky left-0 z-20">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/80 sticky left-12 z-20">
                      {r.outlet}
                    </td>
                    <td className="p-3 text-center text-slate-400 border-r border-white/5 text-[10px]">
                      {r.area}
                    </td>
                    <td className="p-3 text-right font-black text-purple-300 border-r border-white/5 bg-purple-950/10">
                      {formatVal(r.curVal)}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-400 border-r border-white/5">
                      {formatVal(r.prevVal)}
                    </td>
                    <td className={`p-3 text-right font-black border-r border-white/5 ${r.diff > 0 ? 'text-amber-400' : r.diff < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {r.diff >= 0 ? `+${formatVal(r.diff)}` : formatVal(r.diff)}
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        r.pct > 0 ? 'bg-amber-500/20 text-amber-300' : r.pct < 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {r.pct >= 0 ? `+${r.pct.toFixed(1)}%` : `${r.pct.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      {r.trend === 'UP' ? (
                        <span className="text-amber-400 flex items-center justify-center gap-1 font-bold text-[10px]">
                          <i className="fas fa-arrow-trend-up"></i> Naik
                        </span>
                      ) : r.trend === 'DOWN' ? (
                        <span className="text-emerald-400 flex items-center justify-center gap-1 font-bold text-[10px]">
                          <i className="fas fa-arrow-trend-down"></i> Turun
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">- Stabil</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-purple-500/40">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-purple-300 sticky left-0 z-40 bg-slate-950">
                    TOTAL REGIONAL ({filteredOutlets.length} OUTLET)
                  </td>
                  <td className="p-3 text-right font-mono font-black text-purple-300 bg-purple-950/60 border-r border-white/10">
                    {formatVal(compareMonthData.totalCur)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-slate-400 bg-slate-900 border-r border-white/10">
                    {formatVal(compareMonthData.totalPrev)}
                  </td>
                  <td className={`p-3 text-right font-mono font-black border-r border-white/10 bg-slate-900 ${
                    compareMonthData.totalDiff >= 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}>
                    {compareMonthData.totalDiff >= 0 ? `+${formatVal(compareMonthData.totalDiff)}` : formatVal(compareMonthData.totalDiff)}
                  </td>
                  <td className="p-3 text-center font-mono font-black bg-slate-900 border-r border-white/10">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      compareMonthData.totalPct >= 0 ? 'text-amber-300' : 'text-emerald-300'
                    }`}>
                      {compareMonthData.totalPct >= 0 ? `+${compareMonthData.totalPct.toFixed(1)}%` : `${compareMonthData.totalPct.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="p-3 text-center bg-slate-900 text-slate-400 text-[10px]">
                    Perbandingan Bulanan (MoM)
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

        </div>
      </div>

    </div>
  );
};

export default RegionalMatrixReportTable;
