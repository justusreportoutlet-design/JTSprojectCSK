import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Outlet } from '../types';
import { MONTHS, OUTLETS, getAreaForOutlet, getActiveOutletNames } from '../constants';

interface Props {
  data: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  displayedOutlets: Outlet[];
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isPreviewMode?: boolean;
  selectedArea?: string;
  selectedOutlet?: string;
}

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDONESIAN_DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const RegionalDailyRevenueTable: React.FC<Props> = ({
  data,
  selectedMonth,
  selectedYear,
  displayedOutlets,
  showToast,
  isPreviewMode = false,
  selectedArea: initialArea = 'ALL',
  selectedOutlet: initialOutlet = ''
}) => {
  // View Modes:
  // 'PER_TANGGAL' = Tabel Vertikal Matriks Harian (Setiap baris adalah tanggal 1-31, kolom Lunch, Dinner, Total, Target, % Pencapaian)
  // 'HORIZONTAL'  = Matriks Kalender Horizontal (Setiap outlet baris Lunch, Dinner, Total x Kolom Tanggal 1-31)
  // 'SINGLE_DATE' = Drilldown Outlet pada Tanggal Spesifik
  const [viewMode, setViewMode] = useState<'PER_TANGGAL' | 'HORIZONTAL' | 'SINGLE_DATE'>('PER_TANGGAL');
  const [formatMode, setFormatMode] = useState<'FULL' | 'MILLIONS'>('FULL');
  const [dayTypeFilter, setDayTypeFilter] = useState<'ALL' | 'WEEKDAY' | 'WEEKEND'>('ALL');
  const [expandedDates, setExpandedDates] = useState<Record<number, boolean>>({});
  const [selectedFocusDay, setSelectedFocusDay] = useState<number>(() => {
    const today = new Date();
    if (today.getMonth() === selectedMonth && today.getFullYear() === selectedYear) {
      return today.getDate();
    }
    return 1;
  });
  const [internalArea, setInternalArea] = useState<string>(initialArea || 'ALL');
  const [internalOutlet, setInternalOutlet] = useState<string>(initialOutlet || '');
  const [searchOutlet, setSearchOutlet] = useState<string>('');

  const safeYear = (!selectedYear || isNaN(Number(selectedYear))) ? new Date().getFullYear() : Number(selectedYear);
  const safeMonth = (selectedMonth === undefined || selectedMonth === null || isNaN(Number(selectedMonth))) ? new Date().getMonth() : Math.max(0, Math.min(11, Number(selectedMonth)));

  const daysInMonth = useMemo(() => {
    const d = new Date(safeYear, safeMonth + 1, 0).getDate();
    return (isNaN(d) || d < 28) ? 30 : d;
  }, [safeYear, safeMonth]);

  const days = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  const monthStr = useMemo(() => {
    return `${safeYear}-${String(safeMonth + 1).padStart(2, '0')}`;
  }, [safeYear, safeMonth]);

  // Compute active outlets
  const targetOutlets = useMemo(() => {
    const baseList = displayedOutlets && displayedOutlets.length > 0 
      ? displayedOutlets 
      : Array.from(new Set([...getActiveOutletNames(), ...Object.keys(data || {})])).filter(o => !data?.[o]?.isDeleted) as Outlet[];

    return baseList.filter(outlet => {
      const area = getAreaForOutlet(outlet);
      if (internalArea !== 'ALL' && area !== internalArea) return false;
      if (internalOutlet && internalOutlet !== 'ALL' && outlet !== internalOutlet) return false;
      if (searchOutlet.trim()) {
        const q = searchOutlet.toLowerCase();
        return outlet.toLowerCase().includes(q) || area.toLowerCase().includes(q);
      }
      return true;
    });
  }, [displayedOutlets, data, internalArea, internalOutlet, searchOutlet]);

  // Helper to extract Daily Revenue for an outlet
  const extractOutletDailyRevenue = (outletMonths: any, dateStr: string, day: number) => {
    const currentMonth = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
    const sales = currentMonth.sales || outletMonths.sales || {};
    const dailyRec = sales.dailyRecording || currentMonth.dailyRecording || outletMonths.dailyRecording || {};
    let rec = dailyRec[dateStr] || dailyRec[String(day)];

    if (!rec) {
      for (const mKey of Object.keys(outletMonths)) {
        const cand = outletMonths[mKey]?.sales?.dailyRecording?.[dateStr] || outletMonths[mKey]?.dailyRecording?.[dateStr];
        if (cand) {
          rec = cand;
          break;
        }
      }
    }

    const tot = Number(rec?.revenue) || Number(rec?.totalRevenue) || Number(rec?.actual) || 0;
    let lunch = Number(rec?.lunchRevenue) || Number(rec?.revenueLunch) || Number(rec?.lunchActual) || Number(rec?.lunchRev) || 0;
    let dinner = Number(rec?.dinnerRevenue) || Number(rec?.revenueDinner) || Number(rec?.dinnerActual) || Number(rec?.dinnerRev) || 0;

    if (lunch === 0 && dinner === 0 && tot > 0) {
      lunch = Math.round(tot * 0.40);
      dinner = tot - lunch;
    } else if (dinner === 0 && tot > lunch && lunch > 0) {
      dinner = tot - lunch;
    } else if (lunch === 0 && tot > dinner && dinner > 0) {
      lunch = tot - dinner;
    }
    const finalTotal = tot > 0 ? tot : (lunch + dinner);

    // Target Calculation
    let target = 0;
    if (rec?.target !== undefined && Number(rec.target) > 0) {
      target = Number(rec.target);
    } else if (currentMonth.dailyTargets?.[dateStr] !== undefined && Number(currentMonth.dailyTargets[dateStr]) > 0) {
      target = Number(currentMonth.dailyTargets[dateStr]);
    } else if (currentMonth.dailyTargets?.[String(day)] !== undefined && Number(currentMonth.dailyTargets[String(day)]) > 0) {
      target = Number(currentMonth.dailyTargets[String(day)]);
    } else if (sales.dailyTargets?.[dateStr] !== undefined && Number(sales.dailyTargets[dateStr]) > 0) {
      target = Number(sales.dailyTargets[dateStr]);
    } else if (sales.dailyTargets?.[String(day)] !== undefined && Number(sales.dailyTargets[String(day)]) > 0) {
      target = Number(sales.dailyTargets[String(day)]);
    } else {
      const budget = (sales.monthlyBudgets || {})[monthStr] || sales.budgetRevenue || (sales.monthlyBudgets || {})[String(selectedMonth)] || 0;
      target = budget > 0 ? Math.round(budget / daysInMonth) : 0;
    }

    return { lunch, dinner, total: finalTotal, target };
  };

  // Build aggregated matrix data
  const matrixData = useMemo(() => {
    const outletData = targetOutlets.map(outlet => {
      const outletMonths = (data && (data as any)[outlet]) || {};

      const dailyStats = days.map(day => {
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const dateObj = new Date(selectedYear, selectedMonth, day);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayName = INDONESIAN_DAYS[dayOfWeek];
        const dayShort = INDONESIAN_DAYS_SHORT[dayOfWeek];

        const { lunch, dinner, total, target } = extractOutletDailyRevenue(outletMonths, dateStr, day);

        return {
          day,
          dateStr,
          dayOfWeek,
          dayName,
          dayShort,
          isWeekend,
          lunch,
          dinner,
          total,
          target
        };
      });

      const totalLunch = dailyStats.reduce((sum, d) => sum + d.lunch, 0);
      const totalDinner = dailyStats.reduce((sum, d) => sum + d.dinner, 0);
      const totalRevenue = dailyStats.reduce((sum, d) => sum + d.total, 0);
      const totalTarget = dailyStats.reduce((sum, d) => sum + d.target, 0);

      return {
        outlet,
        area: getAreaForOutlet(outlet),
        dailyStats,
        totalLunch,
        totalDinner,
        totalRevenue,
        totalTarget
      };
    });

    // Grand totals per day across all selected outlets
    const regionalDailyTotals = days.map(day => {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(selectedYear, selectedMonth, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayName = INDONESIAN_DAYS[dayOfWeek];
      const dayShort = INDONESIAN_DAYS_SHORT[dayOfWeek];

      let dayLunch = 0;
      let dayDinner = 0;
      let dayTotal = 0;
      let dayTarget = 0;

      const outletsBreakdown = outletData.map(od => {
        const stat = od.dailyStats[day - 1];
        dayLunch += stat.lunch;
        dayDinner += stat.dinner;
        dayTotal += stat.total;
        dayTarget += stat.target;

        return {
          outlet: od.outlet,
          area: od.area,
          lunch: stat.lunch,
          dinner: stat.dinner,
          total: stat.total,
          target: stat.target
        };
      });

      const lunchPct = dayTotal > 0 ? (dayLunch / dayTotal) * 100 : 0;
      const dinnerPct = dayTotal > 0 ? (dayDinner / dayTotal) * 100 : 0;
      const variance = dayTotal - dayTarget;
      const achievementPct = dayTarget > 0 ? (dayTotal / dayTarget) * 100 : 0;

      return {
        day,
        dateStr,
        dayOfWeek,
        dayName,
        dayShort,
        isWeekend,
        lunch: dayLunch,
        dinner: dayDinner,
        total: dayTotal,
        target: dayTarget,
        lunchPct,
        dinnerPct,
        variance,
        achievementPct,
        outletsBreakdown
      };
    });

    const grandTotalLunch = regionalDailyTotals.reduce((sum, d) => sum + d.lunch, 0);
    const grandTotalDinner = regionalDailyTotals.reduce((sum, d) => sum + d.dinner, 0);
    const grandTotalRevenue = regionalDailyTotals.reduce((sum, d) => sum + d.total, 0);
    const grandTotalTarget = regionalDailyTotals.reduce((sum, d) => sum + d.target, 0);
    const grandVariance = grandTotalRevenue - grandTotalTarget;
    const grandAchievementPct = grandTotalTarget > 0 ? (grandTotalRevenue / grandTotalTarget) * 100 : 0;
    const grandLunchPct = grandTotalRevenue > 0 ? (grandTotalLunch / grandTotalRevenue) * 100 : 0;
    const grandDinnerPct = grandTotalRevenue > 0 ? (grandTotalDinner / grandTotalRevenue) * 100 : 0;

    // Filtered Daily Totals (Weekday vs Weekend)
    const filteredDailyTotals = regionalDailyTotals.filter(d => {
      if (dayTypeFilter === 'WEEKDAY') return !d.isWeekend;
      if (dayTypeFilter === 'WEEKEND') return d.isWeekend;
      return true;
    });

    // Peak & Lowest Days calculation
    const daysWithRevenue = regionalDailyTotals.filter(d => d.total > 0);
    const peakDay = daysWithRevenue.length > 0 
      ? [...daysWithRevenue].sort((a, b) => b.total - a.total)[0] 
      : null;
    const lowestDay = daysWithRevenue.length > 0 
      ? [...daysWithRevenue].sort((a, b) => a.total - b.total)[0] 
      : null;

    // Weekday vs Weekend Average
    const weekdayDays = regionalDailyTotals.filter(d => !d.isWeekend && d.total > 0);
    const weekendDays = regionalDailyTotals.filter(d => d.isWeekend && d.total > 0);
    const avgWeekdayRev = weekdayDays.length > 0 
      ? weekdayDays.reduce((sum, d) => sum + d.total, 0) / weekdayDays.length 
      : 0;
    const avgWeekendRev = weekendDays.length > 0 
      ? weekendDays.reduce((sum, d) => sum + d.total, 0) / weekendDays.length 
      : 0;
    const avgDailyRev = daysWithRevenue.length > 0 
      ? grandTotalRevenue / daysWithRevenue.length 
      : 0;

    return {
      outletData,
      regionalDailyTotals,
      filteredDailyTotals,
      grandTotalLunch,
      grandTotalDinner,
      grandTotalRevenue,
      grandTotalTarget,
      grandVariance,
      grandAchievementPct,
      grandLunchPct,
      grandDinnerPct,
      peakDay,
      lowestDay,
      avgWeekdayRev,
      avgWeekendRev,
      avgDailyRev,
      activeDaysCount: daysWithRevenue.length
    };
  }, [data, targetOutlets, days, monthStr, selectedMonth, selectedYear, dayTypeFilter, daysInMonth]);

  const formatCell = (val: number, isTotal = false) => {
    if (!val || val === 0) return '-';
    if (formatMode === 'MILLIONS') {
      const m = val / 1000000;
      return `${m.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    }
    return val.toLocaleString('id-ID');
  };

  const toggleExpandDate = (day: number) => {
    setExpandedDates(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const monthName = INDONESIAN_MONTHS[selectedMonth] || MONTHS[selectedMonth];

      // SHEET 1: REKAPAN PER TANGGAL (DAILY BREAKDOWN)
      const sheet1 = workbook.addWorksheet(`Daily Revenue Per Tanggal`);
      sheet1.views = [{ showGridLines: true }];

      // Sheet 1 Header
      sheet1.addRow([`LAPORAN REVENUE HARIAN (LUNCH / DINNER / TOTAL) PER TANGGAL`]);
      sheet1.addRow([`Bulan: ${monthName} ${selectedYear} | Filter Area: ${internalArea} | Outlet: ${internalOutlet || 'SEMUA OUTLET'}`]);
      sheet1.addRow([]);

      sheet1.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
      sheet1.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

      const s1HeaderRow = sheet1.addRow([
        'TANGGAL', 'HARI', 'TIPE HARI', 
        'LUNCH (RP)', '% LUNCH', 
        'DINNER (RP)', '% DINNER', 
        'TOTAL REVENUE (RP)', 'TARGET HARIAN (RP)', 
        'VARIANCE (RP)', '% ACH'
      ]);
      s1HeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      s1HeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      s1HeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

      matrixData.regionalDailyTotals.forEach(d => {
        const row = sheet1.addRow([
          `${String(d.day).padStart(2, '0')}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`,
          d.dayName,
          d.isWeekend ? 'WEEKEND' : 'WEEKDAY',
          d.lunch,
          `${d.lunchPct.toFixed(1)}%`,
          d.dinner,
          `${d.dinnerPct.toFixed(1)}%`,
          d.total,
          d.target,
          d.variance,
          `${d.achievementPct.toFixed(1)}%`
        ]);

        row.alignment = { vertical: 'middle' };
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.getCell(3).alignment = { horizontal: 'center' };
        row.getCell(5).alignment = { horizontal: 'center' };
        row.getCell(7).alignment = { horizontal: 'center' };
        row.getCell(11).alignment = { horizontal: 'center' };

        // Color weekend rows
        if (d.isWeekend) {
          row.getCell(3).font = { bold: true, color: { argb: 'FFD97706' } };
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        }
      });

      // Sheet 1 Total Row
      const s1TotalRow = sheet1.addRow([
        'TOTAL MTD', '', '',
        matrixData.grandTotalLunch,
        `${matrixData.grandLunchPct.toFixed(1)}%`,
        matrixData.grandTotalDinner,
        `${matrixData.grandDinnerPct.toFixed(1)}%`,
        matrixData.grandTotalRevenue,
        matrixData.grandTotalTarget,
        matrixData.grandVariance,
        `${matrixData.grandAchievementPct.toFixed(1)}%`
      ]);
      s1TotalRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      s1TotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
      s1TotalRow.alignment = { vertical: 'middle' };
      s1TotalRow.getCell(1).alignment = { horizontal: 'center' };

      // Number formatting Sheet 1
      sheet1.getColumn(4).numFmt = '#,##0';
      sheet1.getColumn(6).numFmt = '#,##0';
      sheet1.getColumn(8).numFmt = '#,##0';
      sheet1.getColumn(9).numFmt = '#,##0';
      sheet1.getColumn(10).numFmt = '#,##0';

      sheet1.columns.forEach((col, idx) => {
        col.width = [14, 12, 12, 16, 10, 16, 10, 20, 18, 16, 12][idx] || 15;
      });

      // SHEET 2: MATRIKS KALENDER HORIZONTAL (OUTLET X TANGGAL)
      const sheet2 = workbook.addWorksheet(`Matriks Horizontal (1-${daysInMonth})`);
      sheet2.views = [{ showGridLines: true }];

      const s2HeaderValues: any[] = ['OUTLET', 'REVENUE', ...days.map(d => `${INDONESIAN_DAYS_SHORT[new Date(selectedYear, selectedMonth, d).getDay()]} ${d}`), 'TOTAL MTD'];
      const s2HeaderRow = sheet2.addRow(s2HeaderValues);
      s2HeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      s2HeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      s2HeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

      let s2CurrentRow = 2;
      matrixData.outletData.forEach(od => {
        const startR = s2CurrentRow;

        // Lunch
        const rLunch = sheet2.addRow([od.outlet, 'LUNCH', ...od.dailyStats.map(d => d.lunch), od.totalLunch]);
        rLunch.getCell(2).font = { bold: true, color: { argb: 'FFD97706' } };
        rLunch.getCell(2).alignment = { horizontal: 'center' };

        // Dinner
        const rDinner = sheet2.addRow(['', 'DINNER', ...od.dailyStats.map(d => d.dinner), od.totalDinner]);
        rDinner.getCell(2).font = { bold: true, color: { argb: 'FF4F46E5' } };
        rDinner.getCell(2).alignment = { horizontal: 'center' };

        // Total
        const rTotal = sheet2.addRow(['', 'TOTAL', ...od.dailyStats.map(d => d.total), od.totalRevenue]);
        rTotal.font = { bold: true };
        rTotal.getCell(2).font = { bold: true, color: { argb: 'FF059669' } };
        rTotal.getCell(2).alignment = { horizontal: 'center' };
        rTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        sheet2.mergeCells(startR, 1, startR + 2, 1);
        const mergedCell = sheet2.getCell(startR, 1);
        mergedCell.alignment = { horizontal: 'center', vertical: 'middle' };
        mergedCell.font = { bold: true };

        s2CurrentRow += 3;
      });

      // Sheet 2 Regional Total
      const s2GrandStart = s2CurrentRow;
      sheet2.addRow(['TOTAL REGIONAL', 'LUNCH', ...matrixData.regionalDailyTotals.map(d => d.lunch), matrixData.grandTotalLunch]);
      sheet2.addRow(['', 'DINNER', ...matrixData.regionalDailyTotals.map(d => d.dinner), matrixData.grandTotalDinner]);
      sheet2.addRow(['', 'TOTAL', ...matrixData.regionalDailyTotals.map(d => d.total), matrixData.grandTotalRevenue]);

      sheet2.mergeCells(s2GrandStart, 1, s2GrandStart + 2, 1);
      const mergedGrand = sheet2.getCell(s2GrandStart, 1);
      mergedGrand.alignment = { horizontal: 'center', vertical: 'middle' };
      mergedGrand.font = { bold: true, size: 11 };

      sheet2.getColumn(1).width = 22;
      sheet2.getColumn(2).width = 12;
      for (let c = 3; c <= daysInMonth + 3; c++) {
        sheet2.getColumn(c).width = 14;
        sheet2.getColumn(c).numFmt = '#,##0';
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Matriks_Daily_Revenue_Lunch_Dinner_${monthName}_${selectedYear}.xlsx`);

      showToast?.('Berhasil mengunduh Excel Matriks Daily Revenue Per Tanggal!', 'success');
    } catch (error) {
      console.error('Error exporting daily revenue matrix excel:', error);
      showToast?.('Gagal mengunduh Excel. Silakan coba lagi.', 'error');
    }
  };

  const handleCopySummaryWA = () => {
    const monthName = INDONESIAN_MONTHS[selectedMonth] || MONTHS[selectedMonth];
    let template = `*📊 REGIONAL DAILY REVENUE (LUNCH / DINNER / TOTAL) PER TANGGAL*\n`;
    template += `📅 *Periode:* ${monthName} ${selectedYear}\n`;
    if (internalArea !== 'ALL') template += `📍 *Area:* ${internalArea}\n`;
    if (internalOutlet) template += `🏬 *Outlet:* ${internalOutlet}\n`;
    template += `------------------------------------\n\n`;

    template += `*📈 RINGKASAN REVENUE PER TANGGAL:*\n`;
    matrixData.filteredDailyTotals.forEach(d => {
      const typeTag = d.isWeekend ? '🌴 [WKD]' : '💼 [WKY]';
      template += `• *Tgl ${String(d.day).padStart(2, '0')} (${d.dayShort})* ${typeTag}:\n`;
      template += `  - Lunch : Rp ${d.lunch.toLocaleString('id-ID')} (${d.lunchPct.toFixed(0)}%)\n`;
      template += `  - Dinner: Rp ${d.dinner.toLocaleString('id-ID')} (${d.dinnerPct.toFixed(0)}%)\n`;
      template += `  - *TOTAL*: Rp ${d.total.toLocaleString('id-ID')} (Ach: ${d.achievementPct.toFixed(1)}%)\n`;
    });

    template += `\n------------------------------------\n`;
    template += `🏆 *GRAND TOTAL REGIONAL MTD:*\n`;
    template += `• Total Lunch : Rp ${matrixData.grandTotalLunch.toLocaleString('id-ID')} (${matrixData.grandLunchPct.toFixed(1)}%)\n`;
    template += `• Total Dinner: Rp ${matrixData.grandTotalDinner.toLocaleString('id-ID')} (${matrixData.grandDinnerPct.toFixed(1)}%)\n`;
    template += `• *GRAND TOTAL REVENUE*: Rp ${matrixData.grandTotalRevenue.toLocaleString('id-ID')}\n`;
    template += `• Target MTD  : Rp ${matrixData.grandTotalTarget.toLocaleString('id-ID')}\n`;
    template += `• Pencapaian  : ${matrixData.grandAchievementPct.toFixed(1)}%\n`;
    template += `• Rata-rata/Hari: Rp ${Math.round(matrixData.avgDailyRev).toLocaleString('id-ID')}\n`;
    if (matrixData.peakDay) {
      template += `• Hari Tertinggi: Tgl ${matrixData.peakDay.day} (${matrixData.peakDay.dayName}) - Rp ${matrixData.peakDay.total.toLocaleString('id-ID')}\n`;
    }

    navigator.clipboard.writeText(template).then(() => {
      showToast?.('Ringkasan Daily Revenue Per Tanggal berhasil disalin ke WhatsApp!', 'success');
    });
  };

  const monthLabel = INDONESIAN_MONTHS[selectedMonth] || MONTHS[selectedMonth];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Banner / Toolbar */}
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-inner">
              <i className="fas fa-calendar-check text-xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-wider">
                  Matriks Daily Revenue (Lunch / Dinner / Total)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest">
                  Tampilkan Per Tanggal
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                  {monthLabel} {selectedYear}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Laporan komprehensif harian breakdown omzet Lunch vs Dinner, kontribusi %, target & pencapaian harian seluruh outlet
              </p>
            </div>
          </div>

          {/* Quick Actions (Format, Excel, WA) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Format Mode */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10 text-[10px] font-black shadow-inner">
              <button
                onClick={() => setFormatMode('FULL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  formatMode === 'FULL'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Rp Penuh
              </button>
              <button
                onClick={() => setFormatMode('MILLIONS')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  formatMode === 'MILLIONS'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Jutaan (M)
              </button>
            </div>

            {/* WA Copy */}
            <button
              onClick={handleCopySummaryWA}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md cursor-pointer border border-emerald-500/40"
              title="Salin rekapitulasi ke format WhatsApp"
            >
              <i className="fab fa-whatsapp text-sm"></i>
              <span>Copy WA</span>
            </button>

            {/* Excel Export */}
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer border border-emerald-400/30"
              title="Download Excel dua lembar: Per Tanggal & Matriks Horizontal"
            >
              <i className="fas fa-file-excel text-sm"></i>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* View Mode Tabs & Filters Bar */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Main 3 View Modes */}
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-white/10 text-xs font-black w-full md:w-auto">
            <button
              onClick={() => setViewMode('PER_TANGGAL')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                viewMode === 'PER_TANGGAL'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-list-ol text-xs"></i>
              <span>1. Tabel Rincian Per Tanggal (1-{daysInMonth})</span>
            </button>

            <button
              onClick={() => setViewMode('HORIZONTAL')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                viewMode === 'HORIZONTAL'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table-cells text-xs"></i>
              <span>2. Matriks Kalender Horizontal</span>
            </button>

            <button
              onClick={() => setViewMode('SINGLE_DATE')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                viewMode === 'SINGLE_DATE'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 border border-amber-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-day text-xs"></i>
              <span>3. Fokus Tanggal Spesifik</span>
            </button>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Area */}
            <select
              value={internalArea}
              onChange={(e) => {
                setInternalArea(e.target.value);
                if (e.target.value !== 'ALL' && internalOutlet && getAreaForOutlet(internalOutlet) !== e.target.value) {
                  setInternalOutlet('');
                }
              }}
              className="bg-slate-950 border border-amber-500/40 rounded-xl px-2.5 py-1.5 text-amber-300 font-black text-[10px] outline-none tracking-wider uppercase cursor-pointer"
            >
              <option value="ALL">🌐 SEMUA AREA</option>
              <option value="JAKARTA">📍 JAKARTA</option>
              <option value="TANGGERANG">📍 TANGGERANG</option>
              <option value="BEKASI & CIBUBUR">📍 BEKASI & CIBUBUR</option>
            </select>

            {/* Filter Outlet */}
            <select
              value={internalOutlet}
              onChange={(e) => setInternalOutlet(e.target.value)}
              className="bg-slate-950 border border-indigo-500/40 rounded-xl px-2.5 py-1.5 text-white font-black text-[10px] outline-none tracking-wider uppercase cursor-pointer"
            >
              <option value="">-- SEMUA OUTLET --</option>
              {OUTLETS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            {/* Day Type Filter for PER_TANGGAL mode */}
            {viewMode === 'PER_TANGGAL' && (
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10 text-[9px] font-black">
                <button
                  onClick={() => setDayTypeFilter('ALL')}
                  className={`px-2 py-1 rounded-lg transition-all ${
                    dayTypeFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400'
                  }`}
                >
                  Semua Hari
                </button>
                <button
                  onClick={() => setDayTypeFilter('WEEKDAY')}
                  className={`px-2 py-1 rounded-lg transition-all ${
                    dayTypeFilter === 'WEEKDAY' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Weekday
                </button>
                <button
                  onClick={() => setDayTypeFilter('WEEKEND')}
                  className={`px-2 py-1 rounded-lg transition-all ${
                    dayTypeFilter === 'WEEKEND' ? 'bg-amber-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Weekend
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Highlight Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Revenue */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>Total Revenue</span>
            <i className="fas fa-coins text-emerald-400"></i>
          </div>
          <div className="mt-2">
            <span className="text-base md:text-lg font-black text-emerald-400 tracking-tight">
              Rp {formatCell(matrixData.grandTotalRevenue, true)}
            </span>
            <div className="text-[9px] text-slate-400 mt-0.5">
              Target: Rp {formatCell(matrixData.grandTotalTarget)}
            </div>
          </div>
        </div>

        {/* Total Lunch */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>Total Lunch</span>
            <i className="fas fa-sun text-amber-400"></i>
          </div>
          <div className="mt-2">
            <span className="text-base md:text-lg font-black text-amber-400 tracking-tight">
              Rp {formatCell(matrixData.grandTotalLunch)}
            </span>
            <div className="text-[9px] text-amber-300/80 font-bold mt-0.5">
              {matrixData.grandLunchPct.toFixed(1)}% dari Total MTD
            </div>
          </div>
        </div>

        {/* Total Dinner */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>Total Dinner</span>
            <i className="fas fa-moon text-indigo-400"></i>
          </div>
          <div className="mt-2">
            <span className="text-base md:text-lg font-black text-indigo-400 tracking-tight">
              Rp {formatCell(matrixData.grandTotalDinner)}
            </span>
            <div className="text-[9px] text-indigo-300/80 font-bold mt-0.5">
              {matrixData.grandDinnerPct.toFixed(1)}% dari Total MTD
            </div>
          </div>
        </div>

        {/* Achievement % */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>% Pencapaian Target</span>
            <i className="fas fa-bullseye text-cyan-400"></i>
          </div>
          <div className="mt-2">
            <span className={`text-base md:text-lg font-black tracking-tight ${
              matrixData.grandAchievementPct >= 100 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {matrixData.grandAchievementPct.toFixed(1)}%
            </span>
            <div className="text-[9px] text-slate-400 mt-0.5">
              Var: {matrixData.grandVariance >= 0 ? '+' : ''}Rp {formatCell(matrixData.grandVariance)}
            </div>
          </div>
        </div>

        {/* Rata-rata Harian */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>Avg Revenue / Hari</span>
            <i className="fas fa-chart-line text-purple-400"></i>
          </div>
          <div className="mt-2">
            <span className="text-base md:text-lg font-black text-purple-400 tracking-tight">
              Rp {formatCell(Math.round(matrixData.avgDailyRev))}
            </span>
            <div className="text-[9px] text-slate-400 mt-0.5">
              {matrixData.activeDaysCount} hari aktif input
            </div>
          </div>
        </div>

        {/* Peak Day */}
        <div className="glass-card bg-slate-900/90 border border-white/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
            <span>Peak Day Tertinggi</span>
            <i className="fas fa-trophy text-yellow-400"></i>
          </div>
          <div className="mt-2">
            {matrixData.peakDay ? (
              <>
                <span className="text-sm md:text-base font-black text-yellow-300 tracking-tight">
                  Tgl {matrixData.peakDay.day} ({matrixData.peakDay.dayShort})
                </span>
                <div className="text-[9px] font-mono text-emerald-400 font-bold mt-0.5">
                  Rp {formatCell(matrixData.peakDay.total)}
                </div>
              </>
            ) : (
              <span className="text-xs text-slate-500 font-bold">-</span>
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: TABEL VERTICAL RINCIAN PER TANGGAL (1 s/d 31) */}
      {viewMode === 'PER_TANGGAL' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border-2 border-slate-700/80 rounded-3xl shadow-2xl bg-slate-900 relative max-h-[750px] custom-scrollbar">
            <table className="w-full text-center border-collapse text-[11px]">
              <thead className="sticky top-0 z-30 shadow-md">
                <tr className="bg-slate-950 text-white font-black uppercase tracking-wider text-[10px] border-b-2 border-slate-600">
                  <th className="p-3.5 border-r border-slate-800 text-center w-12">NO</th>
                  <th className="p-3.5 border-r border-slate-800 text-center min-w-[130px]">TANGGAL</th>
                  <th className="p-3.5 border-r border-slate-800 text-center min-w-[100px]">HARI</th>
                  <th className="p-3.5 border-r border-slate-800 text-center w-24">TIPE</th>
                  <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-amber-400 bg-amber-950/20">
                    <div className="flex items-center justify-end gap-1.5">
                      <i className="fas fa-sun text-amber-400 text-xs"></i>
                      <span>LUNCH (RP)</span>
                    </div>
                  </th>
                  <th className="p-3.5 border-r border-slate-800 text-center w-20 text-amber-300 bg-amber-950/10">% LUNCH</th>
                  <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-indigo-400 bg-indigo-950/20">
                    <div className="flex items-center justify-end gap-1.5">
                      <i className="fas fa-moon text-indigo-400 text-xs"></i>
                      <span>DINNER (RP)</span>
                    </div>
                  </th>
                  <th className="p-3.5 border-r border-slate-800 text-center w-20 text-indigo-300 bg-indigo-950/10">% DINNER</th>
                  <th className="p-3.5 border-r border-slate-800 text-right min-w-[140px] text-emerald-400 bg-emerald-950/20 font-black">
                    TOTAL REVENUE (RP)
                  </th>
                  <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-slate-300">
                    TARGET HARIAN (RP)
                  </th>
                  <th className="p-3.5 border-r border-slate-800 text-right min-w-[120px]">
                    VARIANCE (RP)
                  </th>
                  <th className="p-3.5 border-r border-slate-800 text-center w-28">
                    % ACH
                  </th>
                  <th className="p-3.5 text-center w-24">
                    DETAIL OUTLET
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/80 text-[11px]">
                {matrixData.filteredDailyTotals.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-slate-500 font-bold">
                      Tidak ada data untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  matrixData.filteredDailyTotals.map((d) => {
                    const isExpanded = !!expandedDates[d.day];
                    const isAchieved = d.target > 0 && d.total >= d.target;
                    const achColor = d.total === 0 
                      ? 'text-slate-500' 
                      : d.achievementPct >= 100 
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
                        : d.achievementPct >= 80 
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' 
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                    return (
                      <React.Fragment key={`row-${d.day}`}>
                        <tr className={`transition-colors border-t border-slate-800 hover:bg-slate-800/40 ${
                          d.isWeekend ? 'bg-amber-950/[0.04]' : 'bg-transparent'
                        }`}>
                          {/* No */}
                          <td className="p-3 border-r border-slate-800 font-mono text-slate-500 font-bold">
                            {d.day}
                          </td>

                          {/* Tanggal */}
                          <td className="p-3 border-r border-slate-800 font-bold text-white text-center whitespace-nowrap">
                            <span className="font-mono">{String(d.day).padStart(2, '0')}</span> {INDONESIAN_MONTHS[selectedMonth].substring(0, 3)} {selectedYear}
                          </td>

                          {/* Hari */}
                          <td className="p-3 border-r border-slate-800 font-black text-center">
                            <span className={d.isWeekend ? 'text-amber-400' : 'text-slate-300'}>
                              {d.dayName}
                            </span>
                          </td>

                          {/* Tipe Hari */}
                          <td className="p-3 border-r border-slate-800 text-center">
                            {d.isWeekend ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-widest">
                                Weekend
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-widest">
                                Weekday
                              </span>
                            )}
                          </td>

                          {/* Lunch */}
                          <td className="p-3 border-r border-slate-800 text-right font-mono font-bold text-amber-200 tabular-nums">
                            {formatCell(d.lunch)}
                          </td>

                          {/* % Lunch */}
                          <td className="p-3 border-r border-slate-800 text-center font-mono text-amber-400 font-bold">
                            {d.total > 0 ? `${d.lunchPct.toFixed(1)}%` : '-'}
                          </td>

                          {/* Dinner */}
                          <td className="p-3 border-r border-slate-800 text-right font-mono font-bold text-indigo-200 tabular-nums">
                            {formatCell(d.dinner)}
                          </td>

                          {/* % Dinner */}
                          <td className="p-3 border-r border-slate-800 text-center font-mono text-indigo-400 font-bold">
                            {d.total > 0 ? `${d.dinnerPct.toFixed(1)}%` : '-'}
                          </td>

                          {/* Total Revenue */}
                          <td className="p-3 border-r border-slate-800 text-right font-mono font-black text-emerald-400 tabular-nums text-xs bg-emerald-950/10">
                            {formatCell(d.total, true)}
                          </td>

                          {/* Target Harian */}
                          <td className="p-3 border-r border-slate-800 text-right font-mono font-bold text-slate-300 tabular-nums">
                            {formatCell(d.target)}
                          </td>

                          {/* Variance */}
                          <td className={`p-3 border-r border-slate-800 text-right font-mono font-bold tabular-nums ${
                            d.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {d.total > 0 ? `${d.variance >= 0 ? '+' : ''}${formatCell(d.variance)}` : '-'}
                          </td>

                          {/* % Achievement */}
                          <td className="p-3 border-r border-slate-800 text-center">
                            {d.total > 0 && d.target > 0 ? (
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono border ${achColor}`}>
                                {d.achievementPct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>

                          {/* Detail Button */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => toggleExpandDate(d.day)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 mx-auto ${
                                isExpanded
                                  ? 'bg-emerald-600 text-white shadow-md'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5'
                              }`}
                            >
                              <span>Outlet</span>
                              <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[8px]`}></i>
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Outlets Breakdown for this Date */}
                        {isExpanded && (
                          <tr className="bg-slate-950/80 border-b-2 border-slate-700">
                            <td colSpan={13} className="p-4">
                              <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl text-left">
                                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                      Rincian Revenue Per Outlet - Tgl {d.day} {INDONESIAN_MONTHS[selectedMonth]} {selectedYear} ({d.dayName})
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400">
                                    Total: <strong className="text-emerald-400">Rp {formatCell(d.total, true)}</strong>
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {d.outletsBreakdown.map((ob) => {
                                    const outletAch = ob.target > 0 ? (ob.total / ob.target) * 100 : 0;
                                    return (
                                      <div 
                                        key={ob.outlet}
                                        className="bg-slate-950 border border-white/5 rounded-xl p-3 space-y-2 hover:border-emerald-500/40 transition-all"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-black text-white uppercase">{ob.outlet}</span>
                                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{ob.area}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-white/5">
                                          <div>
                                            <span className="text-slate-500 text-[8px] uppercase font-bold block">Lunch</span>
                                            <span className="font-mono text-amber-300 font-bold">Rp {formatCell(ob.lunch)}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-500 text-[8px] uppercase font-bold block">Dinner</span>
                                            <span className="font-mono text-indigo-300 font-bold">Rp {formatCell(ob.dinner)}</span>
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                                          <div>
                                            <span className="text-slate-500 text-[8px] uppercase font-bold block">Total Rev</span>
                                            <span className="font-mono text-emerald-400 font-black text-xs">Rp {formatCell(ob.total, true)}</span>
                                          </div>
                                          <div className="text-right">
                                            <span className="text-slate-500 text-[8px] uppercase font-bold block">Target & Ach</span>
                                            <span className={`text-[10px] font-black font-mono ${
                                              outletAch >= 100 ? 'text-emerald-400' : 'text-amber-400'
                                            }`}>
                                              {ob.target > 0 ? `${outletAch.toFixed(0)}%` : '-'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Grand Total Footer */}
              <tfoot className="sticky bottom-0 z-30 shadow-2xl bg-slate-950 border-t-2 border-emerald-500">
                <tr className="bg-slate-950 text-white font-black text-[11px]">
                  <td colSpan={4} className="p-4 text-center font-black uppercase tracking-wider text-xs border-r border-slate-800 bg-slate-950">
                    TOTAL REGIONAL MTD
                  </td>

                  {/* Grand Lunch */}
                  <td className="p-3 text-right font-mono font-black text-amber-300 tabular-nums border-r border-slate-800 bg-amber-950/20 text-xs">
                    Rp {formatCell(matrixData.grandTotalLunch)}
                  </td>

                  {/* Grand % Lunch */}
                  <td className="p-3 text-center font-mono font-black text-amber-400 border-r border-slate-800 bg-amber-950/10">
                    {matrixData.grandLunchPct.toFixed(1)}%
                  </td>

                  {/* Grand Dinner */}
                  <td className="p-3 text-right font-mono font-black text-indigo-300 tabular-nums border-r border-slate-800 bg-indigo-950/20 text-xs">
                    Rp {formatCell(matrixData.grandTotalDinner)}
                  </td>

                  {/* Grand % Dinner */}
                  <td className="p-3 text-center font-mono font-black text-indigo-400 border-r border-slate-800 bg-indigo-950/10">
                    {matrixData.grandDinnerPct.toFixed(1)}%
                  </td>

                  {/* Grand Total */}
                  <td className="p-3 text-right font-mono font-black text-emerald-300 tabular-nums border-r border-slate-800 bg-emerald-950/40 text-sm">
                    Rp {formatCell(matrixData.grandTotalRevenue, true)}
                  </td>

                  {/* Grand Target */}
                  <td className="p-3 text-right font-mono font-black text-slate-200 tabular-nums border-r border-slate-800 text-xs">
                    Rp {formatCell(matrixData.grandTotalTarget)}
                  </td>

                  {/* Grand Variance */}
                  <td className={`p-3 text-right font-mono font-black tabular-nums border-r border-slate-800 text-xs ${
                    matrixData.grandVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {matrixData.grandVariance >= 0 ? '+' : ''}Rp {formatCell(matrixData.grandVariance)}
                  </td>

                  {/* Grand Ach % */}
                  <td className="p-3 text-center font-mono font-black text-emerald-400 border-r border-slate-800 text-xs">
                    {matrixData.grandAchievementPct.toFixed(1)}%
                  </td>

                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: MATRIKS KALENDER HORIZONTAL (OUTLET X TANGGAL 1-31) */}
      {viewMode === 'HORIZONTAL' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border-2 border-slate-700/80 rounded-3xl shadow-2xl bg-slate-900 relative max-h-[750px] custom-scrollbar">
            <table className="w-full text-center border-collapse text-[10px]">
              <thead className="sticky top-0 z-30 shadow-md">
                <tr className="bg-slate-950 text-white font-black uppercase tracking-wider text-[10px] border-b-2 border-slate-600">
                  <th className="p-3 border-r border-slate-700 sticky left-0 z-40 bg-slate-950 min-w-[140px] text-center">
                    OUTLET
                  </th>
                  <th className="p-3 border-r border-slate-700 sticky left-[140px] z-40 bg-slate-950 min-w-[80px] text-center">
                    REVENUE
                  </th>
                  {days.map(day => {
                    const dateObj = new Date(selectedYear, selectedMonth, day);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                    const dayShort = INDONESIAN_DAYS_SHORT[dateObj.getDay()];

                    return (
                      <th
                        key={day}
                        className={`p-2 border-r border-slate-700 min-w-[70px] text-center font-black ${
                          isWeekend ? 'bg-amber-950/40 text-amber-300' : 'bg-slate-950 text-slate-200'
                        }`}
                      >
                        <div className="text-[8px] font-bold opacity-75">{dayShort}</div>
                        <div className="text-[11px] font-black">{day}</div>
                      </th>
                    );
                  })}
                  <th className="p-3 border-l-2 border-slate-700 sticky right-0 z-40 bg-slate-950 min-w-[120px] text-center text-emerald-400 font-black">
                    TOTAL MTD
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800 text-[10px]">
                {matrixData.outletData.length === 0 ? (
                  <tr>
                    <td colSpan={((daysInMonth && !isNaN(daysInMonth)) ? daysInMonth : 30) + 3} className="py-12 text-center text-slate-500 font-bold">
                      Tidak ada outlet yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  matrixData.outletData.map((od) => (
                    <React.Fragment key={od.outlet}>
                      {/* Row 1: LUNCH */}
                      <tr className="hover:bg-white/[0.02] transition-colors border-t border-slate-700/60">
                        <td
                          rowSpan={3}
                          className="p-3 border-r-2 border-slate-700 font-black text-white text-center align-middle sticky left-0 z-20 bg-slate-900 min-w-[140px] shadow-sm uppercase tracking-wide"
                        >
                          <div className="font-extrabold text-[11px] leading-tight text-white">{od.outlet}</div>
                          <span className="text-[8px] text-slate-400 font-bold mt-1 block">{od.area}</span>
                        </td>

                        <td className="p-2 border-r border-slate-700 font-bold text-amber-400 sticky left-[140px] z-20 bg-slate-900/95 min-w-[80px] text-center uppercase tracking-tight">
                          LUNCH
                        </td>

                        {od.dailyStats.map(d => (
                          <td
                            key={`lunch-${d.day}`}
                            title={`${od.outlet} - Tgl ${d.day} Lunch: Rp ${d.lunch.toLocaleString('id-ID')}`}
                            className={`p-2 border-r border-slate-800 text-right font-mono tabular-nums ${
                              d.lunch > 0 ? 'text-amber-200 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {formatCell(d.lunch)}
                          </td>
                        ))}

                        <td className="p-2 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-amber-400 sticky right-0 z-20 bg-slate-900/95 shadow-sm text-xs">
                          {formatCell(od.totalLunch)}
                        </td>
                      </tr>

                      {/* Row 2: DINNER */}
                      <tr className="hover:bg-white/[0.02] transition-colors border-t border-slate-800/80">
                        <td className="p-2 border-r border-slate-700 font-bold text-indigo-400 sticky left-[140px] z-20 bg-slate-900/95 min-w-[80px] text-center uppercase tracking-tight">
                          DINNER
                        </td>

                        {od.dailyStats.map(d => (
                          <td
                            key={`dinner-${d.day}`}
                            title={`${od.outlet} - Tgl ${d.day} Dinner: Rp ${d.dinner.toLocaleString('id-ID')}`}
                            className={`p-2 border-r border-slate-800 text-right font-mono tabular-nums ${
                              d.dinner > 0 ? 'text-indigo-200 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {formatCell(d.dinner)}
                          </td>
                        ))}

                        <td className="p-2 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-indigo-400 sticky right-0 z-20 bg-slate-900/95 shadow-sm text-xs">
                          {formatCell(od.totalDinner)}
                        </td>
                      </tr>

                      {/* Row 3: TOTAL */}
                      <tr className="bg-slate-950/40 hover:bg-slate-950/60 transition-colors border-b-2 border-slate-600">
                        <td className="p-2 border-r border-slate-700 font-black text-emerald-400 sticky left-[140px] z-20 bg-slate-950 min-w-[80px] text-center uppercase tracking-tight">
                          TOTAL
                        </td>

                        {od.dailyStats.map(d => (
                          <td
                            key={`total-${d.day}`}
                            title={`${od.outlet} - Tgl ${d.day} Total: Rp ${d.total.toLocaleString('id-ID')}`}
                            className={`p-2 border-r border-slate-800 text-right font-black font-mono tabular-nums ${
                              d.total > 0 ? 'text-emerald-300' : 'text-slate-600'
                            }`}
                          >
                            {formatCell(d.total, true)}
                          </td>
                        ))}

                        <td className="p-2 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-emerald-400 sticky right-0 z-20 bg-slate-950 shadow-sm text-xs">
                          {formatCell(od.totalRevenue, true)}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>

              {/* Table Footer: GRAND TOTAL REGIONAL */}
              <tfoot className="sticky bottom-0 z-30 shadow-2xl border-t-2 border-emerald-500 bg-slate-950">
                {/* Grand Lunch */}
                <tr className="bg-slate-950 text-white font-bold border-t border-slate-700">
                  <td
                    rowSpan={3}
                    className="p-3 border-r-2 border-slate-700 font-black text-white text-center align-middle sticky left-0 z-40 bg-slate-950 min-w-[140px] uppercase tracking-wider text-xs"
                  >
                    TOTAL REGIONAL
                  </td>
                  <td className="p-2 border-r border-slate-700 font-black text-amber-400 sticky left-[140px] z-40 bg-slate-950 min-w-[80px] text-center text-[10px] uppercase">
                    LUNCH
                  </td>
                  {matrixData.regionalDailyTotals.map(d => (
                    <td
                      key={`grand-lunch-${d.day}`}
                      className="p-2 border-r border-slate-800 text-right font-mono font-bold tabular-nums text-amber-300"
                    >
                      {formatCell(d.lunch)}
                    </td>
                  ))}
                  <td className="p-2 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-amber-400 sticky right-0 z-40 bg-slate-950 text-xs">
                    {formatCell(matrixData.grandTotalLunch)}
                  </td>
                </tr>

                {/* Grand Dinner */}
                <tr className="bg-slate-950 text-white font-bold border-t border-slate-800">
                  <td className="p-2 border-r border-slate-700 font-black text-indigo-400 sticky left-[140px] z-40 bg-slate-950 min-w-[80px] text-center text-[10px] uppercase">
                    DINNER
                  </td>
                  {matrixData.regionalDailyTotals.map(d => (
                    <td
                      key={`grand-dinner-${d.day}`}
                      className="p-2 border-r border-slate-800 text-right font-mono font-bold tabular-nums text-indigo-300"
                    >
                      {formatCell(d.dinner)}
                    </td>
                  ))}
                  <td className="p-2 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-indigo-400 sticky right-0 z-40 bg-slate-950 text-xs">
                    {formatCell(matrixData.grandTotalDinner)}
                  </td>
                </tr>

                {/* Grand Total */}
                <tr className="bg-slate-950 text-white font-black border-t border-slate-700">
                  <td className="p-2 border-r border-slate-700 font-black text-emerald-400 sticky left-[140px] z-40 bg-slate-950 min-w-[80px] text-center text-[10px] uppercase">
                    TOTAL
                  </td>
                  {matrixData.regionalDailyTotals.map(d => (
                    <td
                      key={`grand-total-${d.day}`}
                      className="p-2 border-r border-slate-800 text-right font-mono font-black tabular-nums text-emerald-400"
                    >
                      {formatCell(d.total, true)}
                    </td>
                  ))}
                  <td className="p-2.5 border-l-2 border-slate-700 text-right font-black font-mono tabular-nums text-emerald-300 bg-emerald-950/40 sticky right-0 z-40 text-xs">
                    {formatCell(matrixData.grandTotalRevenue, true)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: SINGLE DATE DRILLDOWN */}
      {viewMode === 'SINGLE_DATE' && (
        <div className="space-y-4">
          {/* Quick Date Selector Bar */}
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-2 md:pb-0 no-scrollbar">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">
                Pilih Tanggal:
              </span>
              {days.map(d => {
                const dateObj = new Date(selectedYear, selectedMonth, d);
                const isW = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isSelected = selectedFocusDay === d;

                return (
                  <button
                    key={`btn-day-${d}`}
                    onClick={() => setSelectedFocusDay(d)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-xs font-black transition-all cursor-pointer flex flex-col items-center min-w-[42px] ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-black scale-105 shadow-lg shadow-amber-900/30'
                        : isW
                          ? 'bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-[8px] opacity-75">{INDONESIAN_DAYS_SHORT[dateObj.getDay()]}</span>
                    <span>{d}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Date Summary Tag */}
            {(() => {
              const dayData = matrixData.regionalDailyTotals[selectedFocusDay - 1];
              if (!dayData) return null;

              return (
                <div className="bg-slate-950 px-4 py-2 rounded-xl border border-white/10 flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-bold">Tanggal Terpilih</span>
                    <strong className="text-white font-black">{dayData.dayName}, {dayData.day} {monthLabel} {selectedYear}</strong>
                  </div>
                  <div className="h-6 w-px bg-white/10"></div>
                  <div>
                    <span className="text-[9px] text-slate-400 block font-bold">Total Hari Ini</span>
                    <strong className="text-emerald-400 font-mono font-black">Rp {formatCell(dayData.total, true)}</strong>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Table of Outlets for this Specific Date */}
          {(() => {
            const dayData = matrixData.regionalDailyTotals[selectedFocusDay - 1];
            if (!dayData) return null;

            return (
              <div className="overflow-x-auto border-2 border-slate-700 rounded-3xl shadow-2xl bg-slate-900">
                <table className="w-full text-center border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-white font-black uppercase text-[10px] tracking-wider border-b-2 border-slate-700">
                      <th className="p-3.5 border-r border-slate-800 w-12">NO</th>
                      <th className="p-3.5 border-r border-slate-800 text-left min-w-[160px]">OUTLET</th>
                      <th className="p-3.5 border-r border-slate-800 text-center w-28">AREA</th>
                      <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-amber-400 bg-amber-950/20">LUNCH (RP)</th>
                      <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-indigo-400 bg-indigo-950/20">DINNER (RP)</th>
                      <th className="p-3.5 border-r border-slate-800 text-right min-w-[140px] text-emerald-400 bg-emerald-950/20 font-black">TOTAL REVENUE (RP)</th>
                      <th className="p-3.5 border-r border-slate-800 text-center w-28">LUNCH vs DINNER</th>
                      <th className="p-3.5 border-r border-slate-800 text-right min-w-[130px] text-slate-300">TARGET OUTLET (RP)</th>
                      <th className="p-3.5 text-center w-28">% PENCAPAIAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {dayData.outletsBreakdown.map((ob, idx) => {
                      const lPct = ob.total > 0 ? (ob.lunch / ob.total) * 100 : 0;
                      const dPct = ob.total > 0 ? (ob.dinner / ob.total) * 100 : 0;
                      const ach = ob.target > 0 ? (ob.total / ob.target) * 100 : 0;

                      return (
                        <tr key={ob.outlet} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 border-r border-slate-800 font-mono text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-3.5 border-r border-slate-800 font-black text-white text-left uppercase">{ob.outlet}</td>
                          <td className="p-3.5 border-r border-slate-800 font-bold text-slate-400 text-center">{ob.area}</td>
                          <td className="p-3.5 border-r border-slate-800 font-mono text-right text-amber-200 font-bold">
                            {formatCell(ob.lunch)}
                          </td>
                          <td className="p-3.5 border-r border-slate-800 font-mono text-right text-indigo-200 font-bold">
                            {formatCell(ob.dinner)}
                          </td>
                          <td className="p-3.5 border-r border-slate-800 font-mono text-right text-emerald-400 font-black bg-emerald-950/10">
                            {formatCell(ob.total, true)}
                          </td>
                          <td className="p-3.5 border-r border-slate-800 text-center font-mono text-[10px]">
                            {ob.total > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="text-amber-400 font-bold">{lPct.toFixed(0)}% L</span>
                                <span className="text-indigo-400 font-bold">{dPct.toFixed(0)}% D</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3.5 border-r border-slate-800 font-mono text-right text-slate-300 font-bold">
                            {formatCell(ob.target)}
                          </td>
                          <td className="p-3.5 text-center">
                            {ob.total > 0 && ob.target > 0 ? (
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono border ${
                                ach >= 100 
                                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
                                  : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                              }`}>
                                {ach.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-emerald-500 bg-slate-950 font-black text-xs">
                    <tr className="text-white">
                      <td colSpan={3} className="p-3.5 text-center uppercase tracking-wider text-xs border-r border-slate-800">
                        TOTAL HARI INI ({dayData.dayName}, {dayData.day} {monthLabel})
                      </td>
                      <td className="p-3.5 text-right font-mono text-amber-300 border-r border-slate-800 bg-amber-950/20">
                        Rp {formatCell(dayData.lunch)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-indigo-300 border-r border-slate-800 bg-indigo-950/20">
                        Rp {formatCell(dayData.dinner)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-emerald-300 border-r border-slate-800 bg-emerald-950/30 text-sm">
                        Rp {formatCell(dayData.total, true)}
                      </td>
                      <td className="p-3.5 text-center font-mono text-[10px] border-r border-slate-800">
                        <span className="text-amber-300">{dayData.lunchPct.toFixed(0)}% L</span> / <span className="text-indigo-300">{dayData.dinnerPct.toFixed(0)}% D</span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-200 border-r border-slate-800">
                        Rp {formatCell(dayData.target)}
                      </td>
                      <td className="p-3.5 text-center font-mono text-emerald-400">
                        {dayData.achievementPct.toFixed(1)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default RegionalDailyRevenueTable;
