import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { AppState, Outlet, DivisionAllocationItem } from '../types';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';

interface Props {
  data: AppState;
  selectedOutlet?: Outlet;
  selectedMonth: number;
  selectedYear: number;
  cutoffDay: number;
  targetBudgetPercent: number;
  onUpdateTargetBudgetPercent?: (p: number) => void;
  divisionAllocations: DivisionAllocationItem[];
  onUpdateDivisionAllocations?: (allocs: DivisionAllocationItem[]) => void;
  calculationModel: any;
  dailyTableData: any[];
  onUpdate: (updatedData: Partial<AppState>, isPriority?: boolean) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  allMonthlyData?: Record<string, AppState>;
  selectedOrderDays?: number[];
}

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export interface DayWeeklyCogsRow {
  day: number;
  dateStr: string;
  dayName: string;
  isWeekday: boolean;
  isWeekend: boolean;
  isOrderDay: boolean;
  isPastOrCutoff: boolean;
  isRecorded: boolean;
  // Revenue
  targetRevenue: number;
  actualRevenue: number;
  varianceRevenue: number; // actual - target
  revenueAchievement: number; // (actual / target) * 100
  // Budget Belanja 3 Divisi
  basisForecastRevenue: number;
  totalBudgetBelanja: number; // basisForecastRevenue * (targetBudgetPercent / 100)
  budgetKitchen: number; // totalBudgetBelanja * (kitchenPercent / 100)
  budgetBar: number; // totalBudgetBelanja * (barPercent / 100)
  budgetService: number; // totalBudgetBelanja * (servicePercent / 100)
  // Actual Belanja
  actualBelanjaTotal: number;
  actualBelanjaPercent: number; // (actualBelanjaTotal / actualRevenue) * 100
  // Variance Belanja
  varianceBelanja: number; // totalBudgetBelanja - actualBelanjaTotal (Positif = Hemat, Negatif = Over)
  isBelanjaEfficient: boolean;
}

export interface WeekCogsGroup {
  weekNum: number;
  label: string;
  dateRange: string;
  startDay: number;
  endDay: number;
  days: DayWeeklyCogsRow[];
  // Subtotals
  subtotalTargetRevenue: number;
  subtotalActualRevenue: number;
  subtotalVarianceRevenue: number;
  subtotalRevenueAch: number;
  subtotalBasisForecastRev: number;
  subtotalBudgetKitchen: number;
  subtotalBudgetBar: number;
  subtotalBudgetService: number;
  subtotalTotalBudgetBelanja: number;
  subtotalActualBelanja: number;
  subtotalVarianceBelanja: number;
  subtotalBelanjaPercent: number;
}

export const CogsWeeklyControlTable: React.FC<Props> = ({
  data,
  selectedOutlet = 'SH THE BARN',
  selectedMonth,
  selectedYear,
  cutoffDay,
  targetBudgetPercent,
  onUpdateTargetBudgetPercent,
  divisionAllocations,
  onUpdateDivisionAllocations,
  calculationModel,
  dailyTableData,
  onUpdate,
  showToast,
  allMonthlyData,
  selectedOrderDays = []
}) => {
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<'ALL' | '1' | '2' | '3' | '4'>('ALL');
  const [isEditingBudgetPercent, setIsEditingBudgetPercent] = useState<boolean>(false);
  const [tempBudgetPercent, setTempBudgetPercent] = useState<number>(targetBudgetPercent);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync temp budget percent if parent target changes
  React.useEffect(() => {
    setTempBudgetPercent(targetBudgetPercent);
  }, [targetBudgetPercent]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = INDO_MONTHS[selectedMonth];

  // Division Percentages
  const kitchenPercent = useMemo(() => {
    const k = divisionAllocations.find(d => d.id === 'kitchen');
    return k?.percent !== undefined ? k.percent : 70;
  }, [divisionAllocations]);

  const barPercent = useMemo(() => {
    const b = divisionAllocations.find(d => d.id === 'bar');
    return b?.percent !== undefined ? b.percent : 20;
  }, [divisionAllocations]);

  const servicePercent = useMemo(() => {
    const s = divisionAllocations.find(d => d.id === 'service');
    return s?.percent !== undefined ? s.percent : 10;
  }, [divisionAllocations]);

  // Handle Save Target Budget Percent
  const handleSaveBudgetPercent = () => {
    const val = Math.max(1, Math.min(100, isNaN(tempBudgetPercent) ? 43 : tempBudgetPercent));
    if (onUpdateTargetBudgetPercent) {
      onUpdateTargetBudgetPercent(val);
    }
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updated = {
      ...currentSaved,
      targetBudgetPercent: val,
      targetCogsPercent: val
    };
    onUpdate({
      monthlyCogsData: {
        ...(data.monthlyCogsData || {}),
        [monthKey]: updated
      }
    }, true);
    setIsEditingBudgetPercent(false);
    if (showToast) {
      showToast(`Target Budget Belanja diatur ke ${val.toFixed(2)}%`, 'success');
    }
  };

  // Helper to extract Daily Target Revenue
  const getDailyTargetRevenue = (dateStr: string, isWeekday: boolean): number => {
    let t = data?.dailyTargets?.[dateStr];
    if (t === undefined) {
      const dNum = parseInt(dateStr.split('-')[2] || '0', 10);
      if (dNum > 0 && data?.dailyTargets?.[String(dNum)] !== undefined) {
        t = data.dailyTargets[String(dNum)];
      }
    }
    if (t === undefined && data?.sales?.dailyTargets) {
      t = data.sales.dailyTargets[dateStr];
    }
    if (t === undefined && data?.sales?.dailyTarget) {
      t = data.sales.dailyTarget;
    }
    if (!t || t <= 0) {
      t = isWeekday ? (calculationModel?.avgWeekdaySales || 0) : (calculationModel?.avgWeekendSales || 0);
    }
    return t || 0;
  };

  // Build rows for each day
  const dailyRows = useMemo<DayWeeklyCogsRow[]>(() => {
    return (dailyTableData || []).map((row) => {
      const day = row.day;
      const dateStr = row.dateStr;
      const dayName = row.dayName || INDO_DAYS[row.dayOfWeek || 0];
      const isWeekday = row.isWeekday;
      const isWeekend = row.isWeekend;
      const isOrderDay = selectedOrderDays.includes(row.dayOfWeek);
      const isPastOrCutoff = row.isPastOrCutoff;
      const isRecorded = row.isRecorded || (row.actualRevenue > 0);

      // 1. Target Revenue
      const targetRevenue = getDailyTargetRevenue(dateStr, isWeekday);

      // 2. Actual Revenue
      const actualRevenue = isPastOrCutoff ? (row.actualRevenue || 0) : 0;

      // 3. Variance Revenue
      const varianceRevenue = actualRevenue - targetRevenue;
      const revenueAchievement = targetRevenue > 0 ? (actualRevenue / targetRevenue) * 100 : 0;

      // 4. Basis Forecast Revenue untuk Belanja
      // Sesuai rumus COGS: Jika sudah lewat / actual ada, basis forecast adalah Target Revenue hari itu
      // (atau appliedRevenue forecast harian jika belum tercatat)
      const basisForecastRevenue = targetRevenue > 0
        ? targetRevenue
        : (isWeekday ? (calculationModel?.avgWeekdaySales || 0) : (calculationModel?.avgWeekendSales || 0));

      // 5. Budget Belanja 3 Divisi dari % Set Budget dari Forecast Revenue
      const totalBudgetBelanja = Math.round(basisForecastRevenue * (targetBudgetPercent / 100));
      const budgetKitchen = Math.round(totalBudgetBelanja * (kitchenPercent / 100));
      const budgetBar = Math.round(totalBudgetBelanja * (barPercent / 100));
      const budgetService = Math.round(totalBudgetBelanja * (servicePercent / 100));

      // 6. Actual Belanja (dari Receiving Sheet harian)
      const actualBelanjaTotal = isPastOrCutoff ? (row.purchases?.total || 0) : 0;
      const actualBelanjaPercent = actualRevenue > 0 ? (actualBelanjaTotal / actualRevenue) * 100 : 0;

      // 7. Variance Belanja: Budget Belanja - Actual Belanja
      // Positif = Hemat / Sisa Budget, Negatif = Over Budget
      const varianceBelanja = totalBudgetBelanja - actualBelanjaTotal;
      const isBelanjaEfficient = varianceBelanja >= 0;

      return {
        day,
        dateStr,
        dayName,
        isWeekday,
        isWeekend,
        isOrderDay,
        isPastOrCutoff,
        isRecorded,
        targetRevenue,
        actualRevenue,
        varianceRevenue,
        revenueAchievement,
        basisForecastRevenue,
        totalBudgetBelanja,
        budgetKitchen,
        budgetBar,
        budgetService,
        actualBelanjaTotal,
        actualBelanjaPercent,
        varianceBelanja,
        isBelanjaEfficient
      };
    });
  }, [
    dailyTableData,
    data,
    calculationModel,
    targetBudgetPercent,
    kitchenPercent,
    barPercent,
    servicePercent,
    selectedOrderDays
  ]);

  // Group into 4 Weeks (W1: 1-7, W2: 8-14, W3: 15-21, W4: 22-Akhir Bulan)
  const weeklyGroups = useMemo<WeekCogsGroup[]>(() => {
    const definitions = [
      { weekNum: 1, label: 'Week 1', startDay: 1, endDay: 7 },
      { weekNum: 2, label: 'Week 2', startDay: 8, endDay: 14 },
      { weekNum: 3, label: 'Week 3', startDay: 15, endDay: 21 },
      { weekNum: 4, label: 'Week 4', startDay: 22, endDay: daysInMonth }
    ];

    return definitions.map(def => {
      const days = dailyRows.filter(d => d.day >= def.startDay && d.day <= def.endDay);
      const subtotalTargetRevenue = days.reduce((sum, d) => sum + d.targetRevenue, 0);
      const subtotalActualRevenue = days.reduce((sum, d) => sum + d.actualRevenue, 0);
      const subtotalVarianceRevenue = subtotalActualRevenue - subtotalTargetRevenue;
      const subtotalRevenueAch = subtotalTargetRevenue > 0 ? (subtotalActualRevenue / subtotalTargetRevenue) * 100 : 0;

      const subtotalBasisForecastRev = days.reduce((sum, d) => sum + d.basisForecastRevenue, 0);
      const subtotalTotalBudgetBelanja = days.reduce((sum, d) => sum + d.totalBudgetBelanja, 0);
      const subtotalBudgetKitchen = days.reduce((sum, d) => sum + d.budgetKitchen, 0);
      const subtotalBudgetBar = days.reduce((sum, d) => sum + d.budgetBar, 0);
      const subtotalBudgetService = days.reduce((sum, d) => sum + d.budgetService, 0);

      const subtotalActualBelanja = days.reduce((sum, d) => sum + d.actualBelanjaTotal, 0);
      const subtotalVarianceBelanja = subtotalTotalBudgetBelanja - subtotalActualBelanja;
      const subtotalBelanjaPercent = subtotalActualRevenue > 0 ? (subtotalActualBelanja / subtotalActualRevenue) * 100 : 0;

      return {
        weekNum: def.weekNum,
        label: def.label,
        dateRange: `Tgl ${def.startDay} - ${def.endDay} ${monthName}`,
        startDay: def.startDay,
        endDay: def.endDay,
        days,
        subtotalTargetRevenue,
        subtotalActualRevenue,
        subtotalVarianceRevenue,
        subtotalRevenueAch,
        subtotalBasisForecastRev,
        subtotalBudgetKitchen,
        subtotalBudgetBar,
        subtotalBudgetService,
        subtotalTotalBudgetBelanja,
        subtotalActualBelanja,
        subtotalVarianceBelanja,
        subtotalBelanjaPercent
      };
    });
  }, [dailyRows, daysInMonth, monthName]);

  // Filtered Groups for rendering
  const displayedWeeks = useMemo<WeekCogsGroup[]>(() => {
    if (selectedWeekFilter === 'ALL') return weeklyGroups;
    const num = parseInt(selectedWeekFilter, 10);
    return weeklyGroups.filter(w => w.weekNum === num);
  }, [weeklyGroups, selectedWeekFilter]);

  // Grand Total MTD
  const grandTotal = useMemo(() => {
    const targetRev = weeklyGroups.reduce((acc, w) => acc + w.subtotalTargetRevenue, 0);
    const actualRev = weeklyGroups.reduce((acc, w) => acc + w.subtotalActualRevenue, 0);
    const varianceRev = actualRev - targetRev;
    const revAch = targetRev > 0 ? (actualRev / targetRev) * 100 : 0;

    const forecastRev = weeklyGroups.reduce((acc, w) => acc + w.subtotalBasisForecastRev, 0);
    const budgetKitchen = weeklyGroups.reduce((acc, w) => acc + w.subtotalBudgetKitchen, 0);
    const budgetBar = weeklyGroups.reduce((acc, w) => acc + w.subtotalBudgetBar, 0);
    const budgetService = weeklyGroups.reduce((acc, w) => acc + w.subtotalBudgetService, 0);
    const totalBudgetBelanja = weeklyGroups.reduce((acc, w) => acc + w.subtotalTotalBudgetBelanja, 0);

    const actualBelanja = weeklyGroups.reduce((acc, w) => acc + w.subtotalActualBelanja, 0);
    const varianceBelanja = totalBudgetBelanja - actualBelanja;
    const belanjaPercent = actualRev > 0 ? (actualBelanja / actualRev) * 100 : 0;

    return {
      targetRev,
      actualRev,
      varianceRev,
      revAch,
      forecastRev,
      budgetKitchen,
      budgetBar,
      budgetService,
      totalBudgetBelanja,
      actualBelanja,
      varianceBelanja,
      belanjaPercent
    };
  }, [weeklyGroups]);

  // Submit and Live Sync Handler
  const handleSyncWeeklyTable = async () => {
    setIsSubmitting(true);
    try {
      const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
      const updated = {
        ...currentSaved,
        targetBudgetPercent,
        targetCogsPercent: targetBudgetPercent,
        kitchenSharePercent: kitchenPercent,
        barSharePercent: barPercent,
        serviceSharePercent: servicePercent,
        divisionAllocations
      };

      onUpdate({
        monthlyCogsData: {
          ...(data.monthlyCogsData || {}),
          [monthKey]: updated
        }
      }, true);

      if (selectedOutlet) {
        try {
          await fetch(`/api/sync/outlet/${encodeURIComponent(selectedOutlet)}?_t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            body: JSON.stringify({
              data: { [monthKey]: { monthlyCogsData: { [monthKey]: updated } } },
              email: 'cogs-weekly-submit'
            })
          });
        } catch (e) {
          console.warn('[Weekly Control] Fallback sync:', e);
        }
      }

      window.dispatchEvent(
        new CustomEvent('appSubmitSyncFeature', {
          detail: { featureName: 'Tabel Weekly Control COGS', timestamp: Date.now() }
        })
      );

      if (showToast) {
        showToast(`Tabel Weekly Control ${selectedOutlet} berhasil disimpan & disinkronkan ke seluruh sistem!`, 'success');
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Gagal menyinkronkan data weekly.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy WhatsApp Format
  const handleCopyWhatsApp = () => {
    let text = `*LAPORAN WEEKLY CONTROL COGS & REVENUE*\n`;
    text += `*OUTLET* : ${selectedOutlet}\n`;
    text += `*PERIODE* : ${monthName} ${selectedYear}\n`;
    text += `*SET BUDGET BELANJA* : ${targetBudgetPercent.toFixed(1)}% dari Forecast Revenue\n`;
    text += `*PORSI 3 DIVISI* : Kitchen ${kitchenPercent}% | Bar ${barPercent}% | Service ${servicePercent}%\n\n`;

    weeklyGroups.forEach(w => {
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `*${w.label.toUpperCase()} (${w.dateRange})*\n`;
      text += `• *Target Revenue*: Rp ${w.subtotalTargetRevenue.toLocaleString('id-ID')}\n`;
      text += `• *Actual Revenue*: Rp ${w.subtotalActualRevenue.toLocaleString('id-ID')}\n`;
      text += `• *Variance Revenue*: ${w.subtotalVarianceRevenue >= 0 ? '+' : ''}Rp ${w.subtotalVarianceRevenue.toLocaleString('id-ID')} (${w.subtotalRevenueAch.toFixed(1)}% Ach)\n`;
      text += `• *Total Budget Belanja*: Rp ${w.subtotalTotalBudgetBelanja.toLocaleString('id-ID')}\n`;
      text += `  - Kitchen (${kitchenPercent}%): Rp ${w.subtotalBudgetKitchen.toLocaleString('id-ID')}\n`;
      text += `  - Bar (${barPercent}%): Rp ${w.subtotalBudgetBar.toLocaleString('id-ID')}\n`;
      text += `  - Service (${servicePercent}%): Rp ${w.subtotalBudgetService.toLocaleString('id-ID')}\n`;
      text += `• *Actual Belanja*: Rp ${w.subtotalActualBelanja.toLocaleString('id-ID')}\n`;
      text += `• *Variance Belanja*: ${w.subtotalVarianceBelanja >= 0 ? '+' : ''}Rp ${w.subtotalVarianceBelanja.toLocaleString('id-ID')} (${w.subtotalVarianceBelanja >= 0 ? 'HEMAT/EFISIEN ✅' : 'OVER BUDGET ⚠️'})\n`;
      text += `• *Belanja % Realisasi*: ${w.subtotalBelanjaPercent.toFixed(2)}%\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*GRAND TOTAL MTD (${monthName} ${selectedYear})*\n`;
    text += `• Total Target Revenue: Rp ${grandTotal.targetRev.toLocaleString('id-ID')}\n`;
    text += `• Total Actual Revenue: Rp ${grandTotal.actualRev.toLocaleString('id-ID')}\n`;
    text += `• Variance Revenue: ${grandTotal.varianceRev >= 0 ? '+' : ''}Rp ${grandTotal.varianceRev.toLocaleString('id-ID')} (${grandTotal.revAch.toFixed(1)}% Ach)\n`;
    text += `• Total Budget Belanja 3 Divisi: Rp ${grandTotal.totalBudgetBelanja.toLocaleString('id-ID')}\n`;
    text += `• Total Actual Belanja: Rp ${grandTotal.actualBelanja.toLocaleString('id-ID')}\n`;
    text += `• Total Variance Belanja: ${grandTotal.varianceBelanja >= 0 ? '+' : ''}Rp ${grandTotal.varianceBelanja.toLocaleString('id-ID')} (${grandTotal.varianceBelanja >= 0 ? 'HEMAT ✅' : 'OVER BUDGET ⚠️'})\n`;
    text += `• Belanja MTD %: ${grandTotal.belanjaPercent.toFixed(2)}%\n`;

    navigator.clipboard.writeText(text).then(() => {
      if (showToast) showToast('Format WA Weekly Control berhasil disalin ke clipboard!', 'success');
    });
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus App';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('WEEKLY_CONTROL_COGS');

      // Title
      sheet.addRow([`LAPORAN WEEKLY CONTROL REVENUE & BUDGET BELANJA 3 DIVISI`]);
      sheet.addRow([`Outlet: ${selectedOutlet} | Periode: ${monthName} ${selectedYear} | Target Budget: ${targetBudgetPercent}%`]);
      sheet.addRow([`Alokasi 3 Divisi: Kitchen (${kitchenPercent}%) | Bar (${barPercent}%) | Service (${servicePercent}%)`]);
      sheet.addRow([]);

      // Headers
      sheet.addRow([
        'WEEK',
        'TANGGAL',
        'HARI',
        'TIPE HARI',
        'TARGET REVENUE (Rp)',
        'ACTUAL REVENUE (Rp)',
        'VARIANCE REVENUE (Rp)',
        'REVENUE ACH (%)',
        'BASIS FORECAST REV (Rp)',
        `BUDGET KITCHEN (${kitchenPercent}%)`,
        `BUDGET BAR (${barPercent}%)`,
        `BUDGET SERVICE (${servicePercent}%)`,
        'TOTAL BUDGET BELANJA (Rp)',
        'ACTUAL BELANJA (Rp)',
        'VARIANCE BELANJA (Rp)',
        'STATUS BELANJA',
        'BELANJA %'
      ]);

      // Populate Rows by Week
      weeklyGroups.forEach(w => {
        w.days.forEach(d => {
          sheet.addRow([
            w.label,
            d.dateStr,
            d.dayName,
            d.isWeekday ? 'WEEKDAY' : 'WEEKEND',
            d.targetRevenue,
            d.actualRevenue,
            d.varianceRevenue,
            `${d.revenueAchievement.toFixed(1)}%`,
            d.basisForecastRevenue,
            d.budgetKitchen,
            d.budgetBar,
            d.budgetService,
            d.totalBudgetBelanja,
            d.actualBelanjaTotal,
            d.varianceBelanja,
            d.isBelanjaEfficient ? 'HEMAT' : 'OVER',
            `${d.actualBelanjaPercent.toFixed(1)}%`
          ]);
        });

        // Subtotal row
        sheet.addRow([
          `SUBTOTAL ${w.label.toUpperCase()}`,
          w.dateRange,
          '',
          '',
          w.subtotalTargetRevenue,
          w.subtotalActualRevenue,
          w.subtotalVarianceRevenue,
          `${w.subtotalRevenueAch.toFixed(1)}%`,
          w.subtotalBasisForecastRev,
          w.subtotalBudgetKitchen,
          w.subtotalBudgetBar,
          w.subtotalBudgetService,
          w.subtotalTotalBudgetBelanja,
          w.subtotalActualBelanja,
          w.subtotalVarianceBelanja,
          w.subtotalVarianceBelanja >= 0 ? 'HEMAT' : 'OVER',
          `${w.subtotalBelanjaPercent.toFixed(1)}%`
        ]);
        sheet.addRow([]);
      });

      // Grand Total Row
      sheet.addRow([
        'GRAND TOTAL MTD',
        `1 - ${daysInMonth} ${monthName}`,
        '',
        '',
        grandTotal.targetRev,
        grandTotal.actualRev,
        grandTotal.varianceRev,
        `${grandTotal.revAch.toFixed(1)}%`,
        grandTotal.forecastRev,
        grandTotal.budgetKitchen,
        grandTotal.budgetBar,
        grandTotal.budgetService,
        grandTotal.totalBudgetBelanja,
        grandTotal.actualBelanja,
        grandTotal.varianceBelanja,
        grandTotal.varianceBelanja >= 0 ? 'HEMAT' : 'OVER',
        `${grandTotal.belanjaPercent.toFixed(1)}%`
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Weekly_Control_COGS_${selectedOutlet.replace(/\s+/g, '_')}_${monthName}_${selectedYear}.xlsx`);

      if (showToast) showToast('File Excel Weekly Control berhasil diexport!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Gagal export Excel', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">
      {/* HEADER SECTION: CONTROL BAR & SETTINGS */}
      <div className="glass-card p-6 bg-slate-900/95 border border-emerald-500/20 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-black">
                <i className="fas fa-calendar-week"></i>
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">
                Tabel Weekly Control (Revenue & Belanja 3 Divisi)
              </h2>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-black uppercase">
                {selectedOutlet}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl">
              Kontrol terintegrasi <strong className="text-white">Target Revenue</strong>, <strong className="text-white">Actual Revenue</strong>, <strong className="text-white">Variance Revenue</strong>, <strong className="text-emerald-400">Budget Belanja 3 Divisi</strong> (Kitchen, Bar, Service dari {targetBudgetPercent}% Forecast Revenue), <strong className="text-white">Actual Belanja</strong>, dan <strong className="text-white">Variance Belanja</strong> per hari dalam 1 tabel setiap weekly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncWeeklyTable}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-cloud-arrow-up"></i>
                  <span>Submit Data</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              title="Salin Ringkasan WhatsApp"
            >
              <i className="fab fa-whatsapp text-sm"></i>
              <span>Salin WA</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              title="Export File Excel"
            >
              <i className="fas fa-file-excel text-sm"></i>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* PARAMETERS STRIP: % SET BUDGET & 3 DIVISI */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Setting % Set Budget */}
            <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-2 rounded-2xl border border-white/10">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                <i className="fas fa-percentage text-emerald-400"></i> Set Target Belanja:
              </span>
              {isEditingBudgetPercent ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={tempBudgetPercent}
                    onChange={(e) => setTempBudgetPercent(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-slate-900 border border-emerald-500 rounded px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 text-center focus:outline-none"
                    autoFocus
                  />
                  <span className="text-xs text-emerald-400 font-bold">%</span>
                  <button
                    type="button"
                    onClick={handleSaveBudgetPercent}
                    className="px-2 py-0.5 rounded bg-emerald-600 text-slate-950 text-[10px] font-black uppercase cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempBudgetPercent(targetBudgetPercent);
                      setIsEditingBudgetPercent(false);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black font-mono text-emerald-400">
                    {targetBudgetPercent.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-slate-400">(dari Forecast Rev)</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingBudgetPercent(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    Ubah
                  </button>
                </div>
              )}
            </div>

            {/* Division Share Pills */}
            <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-2 rounded-2xl border border-white/10 text-xs">
              <span className="text-slate-400 font-bold">Porsi 3 Divisi:</span>
              <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-black font-mono border border-blue-500/30">
                Kitchen {kitchenPercent}%
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-black font-mono border border-amber-500/30">
                Bar {barPercent}%
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 font-black font-mono border border-purple-500/30">
                Service {servicePercent}%
              </span>
            </div>
          </div>

          {/* Week Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setSelectedWeekFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[11px] transition-all cursor-pointer ${
                selectedWeekFilter === 'ALL'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Week (MTD)
            </button>
            {['1', '2', '3', '4'].map(wk => (
              <button
                key={wk}
                type="button"
                onClick={() => setSelectedWeekFilter(wk as any)}
                className={`px-3 py-1.5 rounded-xl font-black uppercase text-[11px] transition-all cursor-pointer ${
                  selectedWeekFilter === wk
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Week {wk}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* EXECUTIVE KPI SUMMARY CARDS FOR MTD / CURRENT FILTER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Target Revenue */}
        <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Target Revenue {selectedWeekFilter === 'ALL' ? 'MTD' : `Week ${selectedWeekFilter}`}
              </span>
              <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">
                <i className="fas fa-bullseye"></i>
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-white mt-1">
              Rp {(selectedWeekFilter === 'ALL' ? grandTotal.targetRev : (displayedWeeks[0]?.subtotalTargetRevenue || 0)).toLocaleString('id-ID')}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Rencana omzet berdasarkan target harian sistem
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex justify-between text-[11px] text-slate-300">
            <span>Forecast Belanja:</span>
            <span className="font-mono font-bold text-indigo-300">
              Rp {(selectedWeekFilter === 'ALL' ? grandTotal.forecastRev : (displayedWeeks[0]?.subtotalBasisForecastRev || 0)).toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Card 2: Actual Revenue & Variance */}
        <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Actual Revenue & Ach
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                (selectedWeekFilter === 'ALL' ? grandTotal.revAch : (displayedWeeks[0]?.subtotalRevenueAch || 0)) >= 100
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {(selectedWeekFilter === 'ALL' ? grandTotal.revAch : (displayedWeeks[0]?.subtotalRevenueAch || 0)).toFixed(1)}% Ach
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
              Rp {(selectedWeekFilter === 'ALL' ? grandTotal.actualRev : (displayedWeeks[0]?.subtotalActualRevenue || 0)).toLocaleString('id-ID')}
            </p>
            <div className="flex items-center justify-between text-[11px] mt-1">
              <span className="text-slate-400">Variance:</span>
              <span className={`font-mono font-black ${
                (selectedWeekFilter === 'ALL' ? grandTotal.varianceRev : (displayedWeeks[0]?.subtotalVarianceRevenue || 0)) >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}>
                {(selectedWeekFilter === 'ALL' ? grandTotal.varianceRev : (displayedWeeks[0]?.subtotalVarianceRevenue || 0)) >= 0 ? '+' : ''}
                Rp {(selectedWeekFilter === 'ALL' ? grandTotal.varianceRev : (displayedWeeks[0]?.subtotalVarianceRevenue || 0)).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex justify-between text-[11px] text-slate-300">
            <span>Status Capaian:</span>
            <span className="font-bold text-white">
              {(selectedWeekFilter === 'ALL' ? grandTotal.revAch : (displayedWeeks[0]?.subtotalRevenueAch || 0)) >= 100 ? '✅ TERCAPAI' : '⏳ DALAM PROGRES'}
            </span>
          </div>
        </div>

        {/* Card 3: Total Budget Belanja 3 Divisi */}
        <div className="glass-card p-5 bg-gradient-to-br from-slate-900 to-indigo-950/30 border border-indigo-500/30 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                Budget Belanja 3 Divisi ({targetBudgetPercent}%)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
                Forecast Rev
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-white mt-1">
              Rp {(selectedWeekFilter === 'ALL' ? grandTotal.totalBudgetBelanja : (displayedWeeks[0]?.subtotalTotalBudgetBelanja || 0)).toLocaleString('id-ID')}
            </p>
            <div className="mt-2 space-y-0.5 text-[10px] text-slate-300">
              <div className="flex justify-between">
                <span>• Kitchen ({kitchenPercent}%):</span>
                <span className="font-mono font-bold text-blue-300">
                  Rp {(selectedWeekFilter === 'ALL' ? grandTotal.budgetKitchen : (displayedWeeks[0]?.subtotalBudgetKitchen || 0)).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>• Bar ({barPercent}%):</span>
                <span className="font-mono font-bold text-amber-300">
                  Rp {(selectedWeekFilter === 'ALL' ? grandTotal.budgetBar : (displayedWeeks[0]?.subtotalBudgetBar || 0)).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>• Service ({servicePercent}%):</span>
                <span className="font-mono font-bold text-purple-300">
                  Rp {(selectedWeekFilter === 'ALL' ? grandTotal.budgetService : (displayedWeeks[0]?.subtotalBudgetService || 0)).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex justify-between text-[11px] text-slate-400">
            <span>Dasar Perhitungan:</span>
            <span className="text-white font-mono">{targetBudgetPercent}% × Forecast</span>
          </div>
        </div>

        {/* Card 4: Actual Belanja & Variance Belanja */}
        <div className="glass-card p-5 bg-gradient-to-br from-slate-900 to-emerald-950/30 border border-emerald-500/30 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Actual Belanja & Variance
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                (selectedWeekFilter === 'ALL' ? grandTotal.varianceBelanja : (displayedWeeks[0]?.subtotalVarianceBelanja || 0)) >= 0
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}>
                {(selectedWeekFilter === 'ALL' ? grandTotal.varianceBelanja : (displayedWeeks[0]?.subtotalVarianceBelanja || 0)) >= 0 ? 'HEMAT' : 'OVER BUDGET'}
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-white mt-1">
              Rp {(selectedWeekFilter === 'ALL' ? grandTotal.actualBelanja : (displayedWeeks[0]?.subtotalActualBelanja || 0)).toLocaleString('id-ID')}
            </p>
            <div className="flex items-center justify-between text-[11px] mt-1">
              <span className="text-slate-400">Variance Belanja:</span>
              <span className={`font-mono font-black ${
                (selectedWeekFilter === 'ALL' ? grandTotal.varianceBelanja : (displayedWeeks[0]?.subtotalVarianceBelanja || 0)) >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}>
                {(selectedWeekFilter === 'ALL' ? grandTotal.varianceBelanja : (displayedWeeks[0]?.subtotalVarianceBelanja || 0)) >= 0 ? '+' : ''}
                Rp {(selectedWeekFilter === 'ALL' ? grandTotal.varianceBelanja : (displayedWeeks[0]?.subtotalVarianceBelanja || 0)).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex justify-between text-[11px] text-slate-300">
            <span>Rasio Food Cost / Belanja:</span>
            <span className={`font-mono font-bold ${
              (selectedWeekFilter === 'ALL' ? grandTotal.belanjaPercent : (displayedWeeks[0]?.subtotalBelanjaPercent || 0)) <= targetBudgetPercent
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}>
              {(selectedWeekFilter === 'ALL' ? grandTotal.belanjaPercent : (displayedWeeks[0]?.subtotalBelanjaPercent || 0)).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* SYNC BANNER */}
      <FeatureSubmitSyncButton
        featureName="Tabel Weekly Control COGS"
        onSync={handleSyncWeeklyTable}
        className="shadow-xl"
      />

      {/* COMPREHENSIVE TABLES FOR EACH WEEK */}
      <div className="space-y-8">
        {displayedWeeks.map((week) => (
          <div
            key={week.weekNum}
            className="glass-card border border-white/10 rounded-3xl overflow-hidden shadow-2xl bg-slate-900/80"
          >
            {/* Week Header Strip */}
            <div className="p-4 bg-slate-950/80 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm uppercase tracking-wider shadow">
                  {week.label}
                </span>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    {week.dateRange} ({week.days.length} Hari Operasional)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Target Revenue: <span className="text-white font-bold">Rp {week.subtotalTargetRevenue.toLocaleString('id-ID')}</span> | Actual: <span className="text-emerald-400 font-bold">Rp {week.subtotalActualRevenue.toLocaleString('id-ID')}</span> | Total Budget Belanja: <span className="text-indigo-400 font-bold">Rp {week.subtotalTotalBudgetBelanja.toLocaleString('id-ID')}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2.5 py-1 rounded-lg font-mono font-bold ${
                  week.subtotalVarianceRevenue >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  Rev: {week.subtotalVarianceRevenue >= 0 ? '+' : ''}Rp {week.subtotalVarianceRevenue.toLocaleString('id-ID')}
                </span>
                <span className={`px-2.5 py-1 rounded-lg font-mono font-bold ${
                  week.subtotalVarianceBelanja >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  Belanja: {week.subtotalVarianceBelanja >= 0 ? 'Sisa' : 'Over'} Rp {Math.abs(week.subtotalVarianceBelanja).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Unified Comprehensive Table */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {/* Super Header Row */}
                  <tr className="bg-slate-950/90 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-white/10">
                    <th colSpan={3} className="p-3 text-center border-r border-white/10 bg-slate-950">
                      INFORMASI HARI
                    </th>
                    <th colSpan={4} className="p-3 text-center border-r border-white/10 bg-indigo-950/30 text-indigo-300">
                      REVENUE OPERASIONAL
                    </th>
                    <th colSpan={5} className="p-3 text-center border-r border-white/10 bg-cyan-950/30 text-cyan-300">
                      BUDGET BELANJA 3 DIVISI ({targetBudgetPercent}% DARI FORECAST)
                    </th>
                    <th colSpan={2} className="p-3 text-center border-r border-white/10 bg-amber-950/30 text-amber-300">
                      ACTUAL BELANJA
                    </th>
                    <th colSpan={2} className="p-3 text-center bg-emerald-950/30 text-emerald-300">
                      VARIANCE & EVALUASI
                    </th>
                  </tr>
                  {/* Detailed Column Header Row */}
                  <tr className="bg-slate-900/90 text-slate-300 text-[10px] font-black uppercase tracking-wider border-b border-white/10">
                    <th className="p-3 whitespace-nowrap">Tgl & Hari</th>
                    <th className="p-3 text-center whitespace-nowrap">Tipe</th>
                    <th className="p-3 text-center border-r border-white/10 whitespace-nowrap">Order</th>

                    {/* Revenue Columns */}
                    <th className="p-3 text-right bg-indigo-950/20 whitespace-nowrap">Target Rev (Rp)</th>
                    <th className="p-3 text-right bg-indigo-950/20 whitespace-nowrap">Actual Rev (Rp)</th>
                    <th className="p-3 text-right bg-indigo-950/20 whitespace-nowrap">Variance (Rp)</th>
                    <th className="p-3 text-center bg-indigo-950/20 border-r border-white/10 whitespace-nowrap">% Ach</th>

                    {/* Budget Belanja 3 Divisi Columns */}
                    <th className="p-3 text-right bg-cyan-950/20 whitespace-nowrap">Basis Forecast</th>
                    <th className="p-3 text-right bg-cyan-950/20 text-blue-300 whitespace-nowrap">Kitchen ({kitchenPercent}%)</th>
                    <th className="p-3 text-right bg-cyan-950/20 text-amber-300 whitespace-nowrap">Bar ({barPercent}%)</th>
                    <th className="p-3 text-right bg-cyan-950/20 text-purple-300 whitespace-nowrap">Service ({servicePercent}%)</th>
                    <th className="p-3 text-right bg-cyan-950/20 font-black text-white border-r border-white/10 whitespace-nowrap">Total Budget (Rp)</th>

                    {/* Actual Belanja Columns */}
                    <th className="p-3 text-right bg-amber-950/20 whitespace-nowrap">Actual Belanja (Rp)</th>
                    <th className="p-3 text-center bg-amber-950/20 border-r border-white/10 whitespace-nowrap">Cost %</th>

                    {/* Variance Belanja Columns */}
                    <th className="p-3 text-right bg-emerald-950/20 whitespace-nowrap">Variance Belanja (Rp)</th>
                    <th className="p-3 text-center bg-emerald-950/20 whitespace-nowrap">Status Efisiensi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {week.days.map((row) => {
                    const isRevAchieved = row.actualRevenue >= row.targetRevenue && row.actualRevenue > 0;
                    const isPassed = row.isPastOrCutoff;

                    return (
                      <tr
                        key={row.day}
                        className={`hover:bg-white/[0.04] transition-colors ${
                          row.isOrderDay ? 'bg-emerald-500/[0.02]' : ''
                        }`}
                      >
                        {/* 1. Tgl & Hari */}
                        <td className="p-3 font-sans font-bold text-white whitespace-nowrap">
                          {row.dayName}, {row.day} {monthName.substring(0, 3)}
                        </td>

                        {/* 2. Tipe Hari */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            row.isWeekday ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {row.isWeekday ? 'WD' : 'WE'}
                          </span>
                        </td>

                        {/* 3. Order Day */}
                        <td className="p-3 text-center border-r border-white/10 whitespace-nowrap">
                          {row.isOrderDay ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-sans font-bold text-[9px] border border-emerald-500/30">
                              Order
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 4. Target Revenue */}
                        <td className="p-3 text-right bg-indigo-950/10 text-slate-300">
                          Rp {row.targetRevenue.toLocaleString('id-ID')}
                        </td>

                        {/* 5. Actual Revenue */}
                        <td className="p-3 text-right bg-indigo-950/10 font-bold text-white">
                          {isPassed && row.actualRevenue > 0 ? (
                            <span className="text-emerald-400">Rp {row.actualRevenue.toLocaleString('id-ID')}</span>
                          ) : isPassed ? (
                            <span className="text-slate-500 font-sans italic text-[10px]">- Belum ada data -</span>
                          ) : (
                            <span className="text-slate-500 font-sans italic text-[10px]">Forecast</span>
                          )}
                        </td>

                        {/* 6. Variance Revenue */}
                        <td className="p-3 text-right bg-indigo-950/10 font-bold">
                          {isPassed && row.actualRevenue > 0 ? (
                            <span className={row.varianceRevenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {row.varianceRevenue >= 0 ? '+' : ''}Rp {row.varianceRevenue.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 7. % Ach */}
                        <td className="p-3 text-center bg-indigo-950/10 border-r border-white/10">
                          {isPassed && row.actualRevenue > 0 ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isRevAchieved ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {row.revenueAchievement.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 8. Basis Forecast Rev */}
                        <td className="p-3 text-right bg-cyan-950/10 text-slate-300">
                          Rp {row.basisForecastRevenue.toLocaleString('id-ID')}
                        </td>

                        {/* 9. Budget Kitchen */}
                        <td className="p-3 text-right bg-cyan-950/10 text-blue-300 font-semibold">
                          Rp {row.budgetKitchen.toLocaleString('id-ID')}
                        </td>

                        {/* 10. Budget Bar */}
                        <td className="p-3 text-right bg-cyan-950/10 text-amber-300 font-semibold">
                          Rp {row.budgetBar.toLocaleString('id-ID')}
                        </td>

                        {/* 11. Budget Service */}
                        <td className="p-3 text-right bg-cyan-950/10 text-purple-300 font-semibold">
                          Rp {row.budgetService.toLocaleString('id-ID')}
                        </td>

                        {/* 12. Total Budget Belanja 3 Divisi */}
                        <td className="p-3 text-right bg-cyan-950/10 font-black text-white border-r border-white/10">
                          Rp {row.totalBudgetBelanja.toLocaleString('id-ID')}
                        </td>

                        {/* 13. Actual Belanja Total */}
                        <td className="p-3 text-right bg-amber-950/10 font-bold text-white">
                          {isPassed && row.actualBelanjaTotal > 0 ? (
                            <span className="text-amber-300">Rp {row.actualBelanjaTotal.toLocaleString('id-ID')}</span>
                          ) : isPassed ? (
                            <span className="text-slate-500 font-sans italic text-[10px]">Rp 0</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 14. Cost % */}
                        <td className="p-3 text-center bg-amber-950/10 border-r border-white/10">
                          {isPassed && row.actualRevenue > 0 && row.actualBelanjaTotal > 0 ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              row.actualBelanjaPercent <= targetBudgetPercent
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {row.actualBelanjaPercent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 15. Variance Belanja (Budget - Actual) */}
                        <td className="p-3 text-right bg-emerald-950/10 font-black">
                          {isPassed ? (
                            <span className={row.varianceBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {row.varianceBelanja >= 0 ? '+' : ''}Rp {row.varianceBelanja.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-slate-400">Rp {row.totalBudgetBelanja.toLocaleString('id-ID')}</span>
                          )}
                        </td>

                        {/* 16. Status Efisiensi */}
                        <td className="p-3 text-center bg-emerald-950/10 font-sans whitespace-nowrap">
                          {isPassed ? (
                            row.isBelanjaEfficient ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-black border border-emerald-500/30">
                                <i className="fas fa-check mr-1"></i> HEMAT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[9px] font-black border border-rose-500/30">
                                <i className="fas fa-exclamation-triangle mr-1"></i> OVER BUDGET
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Sisa Periode</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal Week Row */}
                  <tr className="bg-slate-950/90 font-black border-t-2 border-white/20 text-white">
                    <td colSpan={3} className="p-3 font-sans text-xs uppercase tracking-wider text-emerald-300 border-r border-white/10">
                      SUBTOTAL {week.label.toUpperCase()} ({week.dateRange})
                    </td>

                    {/* Subtotal Revenue */}
                    <td className="p-3 text-right bg-indigo-950/30 text-slate-200">
                      Rp {week.subtotalTargetRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-indigo-950/30 text-emerald-400">
                      Rp {week.subtotalActualRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-indigo-950/30">
                      <span className={week.subtotalVarianceRevenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {week.subtotalVarianceRevenue >= 0 ? '+' : ''}Rp {week.subtotalVarianceRevenue.toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="p-3 text-center bg-indigo-950/30 border-r border-white/10 text-white">
                      {week.subtotalRevenueAch.toFixed(1)}%
                    </td>

                    {/* Subtotal Budget 3 Divisi */}
                    <td className="p-3 text-right bg-cyan-950/30 text-slate-300">
                      Rp {week.subtotalBasisForecastRev.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-cyan-950/30 text-blue-300">
                      Rp {week.subtotalBudgetKitchen.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-cyan-950/30 text-amber-300">
                      Rp {week.subtotalBudgetBar.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-cyan-950/30 text-purple-300">
                      Rp {week.subtotalBudgetService.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right bg-cyan-950/30 text-white font-black border-r border-white/10">
                      Rp {week.subtotalTotalBudgetBelanja.toLocaleString('id-ID')}
                    </td>

                    {/* Subtotal Actual Belanja */}
                    <td className="p-3 text-right bg-amber-950/30 text-amber-300">
                      Rp {week.subtotalActualBelanja.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center bg-amber-950/30 border-r border-white/10 text-white">
                      {week.subtotalBelanjaPercent.toFixed(1)}%
                    </td>

                    {/* Subtotal Variance Belanja */}
                    <td className="p-3 text-right bg-emerald-950/30">
                      <span className={week.subtotalVarianceBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {week.subtotalVarianceBelanja >= 0 ? '+' : ''}Rp {week.subtotalVarianceBelanja.toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="p-3 text-center bg-emerald-950/30 font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        week.subtotalVarianceBelanja >= 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {week.subtotalVarianceBelanja >= 0 ? 'HEMAT' : 'OVER BUDGET'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* GRAND TOTAL MTD ROW TABLE SUMMARY */}
        <div className="glass-card border-2 border-emerald-500/40 rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
          <div className="p-5 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase block">
                REKAPITULASI AKUMULASI SEBULAN PENUH
              </span>
              <h3 className="text-lg font-black text-white uppercase tracking-tight">
                Grand Total MTD ({monthName} {selectedYear} · {selectedOutlet})
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono font-bold text-slate-300">
                Target Budget Belanja: {targetBudgetPercent.toFixed(1)}%
              </span>
              <span className={`px-3 py-1 rounded-xl font-mono text-xs font-black border ${
                grandTotal.varianceBelanja >= 0
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                Total Variance Belanja: {grandTotal.varianceBelanja >= 0 ? '+' : ''}Rp {grandTotal.varianceBelanja.toLocaleString('id-ID')} ({grandTotal.varianceBelanja >= 0 ? 'HEMAT' : 'OVER'})
              </span>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-white/10">
                  <th className="p-3.5">Kategori Rekap</th>
                  <th className="p-3.5 text-right">Target Revenue</th>
                  <th className="p-3.5 text-right">Actual Revenue</th>
                  <th className="p-3.5 text-right">Variance Revenue</th>
                  <th className="p-3.5 text-center">Capaian %</th>
                  <th className="p-3.5 text-right text-blue-300">Kitchen ({kitchenPercent}%)</th>
                  <th className="p-3.5 text-right text-amber-300">Bar ({barPercent}%)</th>
                  <th className="p-3.5 text-right text-purple-300">Service ({servicePercent}%)</th>
                  <th className="p-3.5 text-right font-black text-white">Total Budget Belanja</th>
                  <th className="p-3.5 text-right text-amber-300">Actual Belanja</th>
                  <th className="p-3.5 text-right font-black">Variance Belanja</th>
                  <th className="p-3.5 text-center">Cost %</th>
                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="font-bold text-white">
                <tr className="bg-slate-900/90 text-sm">
                  <td className="p-3.5 font-sans font-black text-emerald-300 uppercase">
                    MTD 1 - {daysInMonth} {monthName}
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    Rp {grandTotal.targetRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right text-emerald-400 font-black">
                    Rp {grandTotal.actualRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right">
                    <span className={grandTotal.varianceRev >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {grandTotal.varianceRev >= 0 ? '+' : ''}Rp {grandTotal.varianceRev.toLocaleString('id-ID')}
                    </span>
                  </td>
                  <td className="p-3.5 text-center text-xs">
                    {grandTotal.revAch.toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-blue-300">
                    Rp {grandTotal.budgetKitchen.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right text-amber-300">
                    Rp {grandTotal.budgetBar.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right text-purple-300">
                    Rp {grandTotal.budgetService.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right font-black text-white text-base">
                    Rp {grandTotal.totalBudgetBelanja.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right text-amber-300 text-base">
                    Rp {grandTotal.actualBelanja.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3.5 text-right text-base">
                    <span className={grandTotal.varianceBelanja >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                      {grandTotal.varianceBelanja >= 0 ? '+' : ''}Rp {grandTotal.varianceBelanja.toLocaleString('id-ID')}
                    </span>
                  </td>
                  <td className="p-3.5 text-center text-xs">
                    {grandTotal.belanjaPercent.toFixed(2)}%
                  </td>
                  <td className="p-3.5 text-center font-sans">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                      grandTotal.varianceBelanja >= 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {grandTotal.varianceBelanja >= 0 ? 'HEMAT' : 'OVER BUDGET'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CogsWeeklyControlTable;
