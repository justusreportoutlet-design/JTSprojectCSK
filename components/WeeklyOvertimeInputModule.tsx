import React, { useState, useMemo, useEffect } from 'react';
import { AppState, WeeklyOvertimeEntry, OvertimeEntry, Outlet } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeStorage } from '../lib/safeStorage';
import { ManpowerTableModule } from './ManpowerTableModule';
import { createDefaultManpowerData, calculateManpowerSummary, resolveOutletManpowerData } from '../lib/manpowerUtils';
import RegionalWeeklyOvertimeRecapTable from './RegionalWeeklyOvertimeRecapTable';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, any>;
  onUpdate: (key: keyof AppState, val: any) => void;
  selectedOutlet?: string;
  selectedArea?: string;
  isRegionalView?: boolean;
  filters?: {
    month?: string;
    year?: string;
    startDate?: string;
    endDate?: string;
  };
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDailyOvertime?: () => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const FIXED_OVERTIME_RATE = 15000; // Fixed rate Rp 15.000 / jam for all divisions

export const WeeklyOvertimeInputModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  onUpdate,
  selectedOutlet = 'SH THE BARN',
  selectedArea = 'ALL',
  isRegionalView = false,
  filters,
  showToast,
  onNavigateToDailyOvertime
}) => {
  const currentDate = new Date();
  const currentMonthIdx = filters?.month ? parseInt(filters.month) : currentDate.getMonth();
  const currentYear = filters?.year ? parseInt(filters.year) : currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [activeTab, setActiveTab] = useState<'REGIONAL_RECAP' | 'WEEKLY_OVERTIME' | 'MANPOWER_TABLE'>(
    isRegionalView ? 'REGIONAL_RECAP' : 'WEEKLY_OVERTIME'
  );
  const [currentSelectedOutlet, setCurrentSelectedOutlet] = useState<string>(selectedOutlet);

  useEffect(() => {
    if (filters?.month !== undefined) setSelectedMonth(parseInt(filters.month));
    if (filters?.year !== undefined) setSelectedYear(parseInt(filters.year));
  }, [filters?.month, filters?.year]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  // Outlet Man Power Summary connection
  const currentManpower = useMemo(() => {
    return resolveOutletManpowerData(data.manpowerData, selectedOutlet, monthKey);
  }, [data.manpowerData, selectedOutlet, monthKey]);

  const manpowerSummary = useMemo(() => {
    return calculateManpowerSummary(currentManpower);
  }, [currentManpower]);

  // Calculate days in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Standard 4 weeks definition with Cut-Off 26 (Bulan Lalu) - 25 (Bulan Ini)
  // Sisa hari setelah Week 3 (16 s/d 25 = 10 hari) tidak sampai 7 hari jika dipisah ke Week 5, sehingga terhitung Week 4
  const defaultWeekRanges = useMemo(() => {
    const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    return [
      {
        week: 1,
        startDate: `${prevMonthKey}-26`,
        endDate: `${monthKey}-01`,
        label: `Week 1 (26 ${prevMonthName.slice(0, 3)} - 1 ${monthName.slice(0, 3)})`
      },
      {
        week: 2,
        startDate: `${monthKey}-02`,
        endDate: `${monthKey}-08`,
        label: `Week 2 (2 - 8 ${monthName.slice(0, 3)})`
      },
      {
        week: 3,
        startDate: `${monthKey}-09`,
        endDate: `${monthKey}-15`,
        label: `Week 3 (9 - 15 ${monthName.slice(0, 3)})`
      },
      {
        week: 4,
        startDate: `${monthKey}-16`,
        endDate: `${monthKey}-25`,
        label: `Week 4 (16 - 25 ${monthName.slice(0, 3)})`
      }
    ];
  }, [selectedYear, selectedMonth, monthKey, monthName]);

  // Read existing weekly records from data.weeklyOvertime
  const weeklyRecordsMap = (data.weeklyOvertime || {}) as Record<string, WeeklyOvertimeEntry[]>;
  const currentMonthRecords = useMemo(() => {
    return weeklyRecordsMap[monthKey] || [];
  }, [weeklyRecordsMap, monthKey]);

  // Auto-calculated aggregated stats from dailyOvertime for comparison / prefilling
  const dailyDerivedWeeks = useMemo(() => {
    const dailyOT = (data.dailyOvertime || {}) as Record<string, OvertimeEntry[]>;
    
    return defaultWeekRanges.map(w => {
      const startDateStr = w.startDate;
      const endDateStr = w.endDate;

      let staffSet = new Set<string>();
      let totalHours = 0;
      let totalPay = 0;
      let serviceHours = 0;
      let barHours = 0;
      let kitchenHours = 0;

      Object.entries(dailyOT).forEach(([dateStr, list]) => {
        if (dateStr >= startDateStr && dateStr <= endDateStr && Array.isArray(list)) {
          list.forEach(e => {
            if (!e) return;
            const hrs = Number(e.overtimeHours) || Number((e as any).hours) || 0;
            const pay = Number(e.overtimePay) || 0;
            totalHours += hrs;
            totalPay += pay;
            const staffId = e.staffId || (e as any).staffName || (e as any).name;
            if (staffId) staffSet.add(staffId);

            const div = String((e as any).division || '').toUpperCase();
            if (div.includes('BAR')) {
              barHours += hrs;
            } else if (div.includes('KITCHEN') || div.includes('COOK') || div.includes('STEWARD')) {
              kitchenHours += hrs;
            } else {
              serviceHours += hrs;
            }
          });
        }
      });

      const totalStaff = staffSet.size;
      const averageOvertime = totalStaff > 0 ? parseFloat((totalHours / totalStaff).toFixed(2)) : 0;

      return {
        week: w.week,
        weekLabel: w.label,
        startDate: startDateStr,
        endDate: endDateStr,
        totalStaff,
        totalOvertime: parseFloat(totalHours.toFixed(1)),
        totalOvertimePay: totalPay,
        averageOvertime,
        serviceHours: parseFloat(serviceHours.toFixed(1)),
        barHours: parseFloat(barHours.toFixed(1)),
        kitchenHours: parseFloat(kitchenHours.toFixed(1))
      };
    });
  }, [data.dailyOvertime, defaultWeekRanges]);

  // Total Manpower Staff from all divisions (connected to ManpowerTable)
  const totalManpowerStaff = useMemo(() => {
    return manpowerSummary.totalInhouseActual > 0 
      ? manpowerSummary.totalInhouseActual 
      : (manpowerSummary.totalInhouseBudget > 0 ? manpowerSummary.totalInhouseBudget : 0);
  }, [manpowerSummary]);

  // Budget Rata-rata Overtime per Staff state (e.g. 35 Jam/Staff)
  const [budgetAvgHoursPerStaff, setBudgetAvgHoursPerStaff] = useState<number>(() => {
    return data.budgetAvgOvertimeHours || 35;
  });

  // State to control freezing division target hours (Frozen by default according to user requirement)
  const [isDivisionBudgetFrozen, setIsDivisionBudgetFrozen] = useState<boolean>(true);

  // Standard Formula: Rata-rata budget overtime (default 35 Jam) dari Seluruh Total Man Power Seluruh Divisi
  const calculatedManpowerBudgetHours = totalManpowerStaff * budgetAvgHoursPerStaff;
  const calculatedManpowerBudgetRp = calculatedManpowerBudgetHours * FIXED_OVERTIME_RATE;

  // Division-specific budget breakdowns based on budgetAvgHoursPerStaff (e.g. 35h per staff)
  const divisionManpowerBudget = useMemo(() => {
    const sMonthly = manpowerSummary.serviceActual * budgetAvgHoursPerStaff;
    const bMonthly = manpowerSummary.barActual * budgetAvgHoursPerStaff;
    const kMonthly = manpowerSummary.kitchenActual * budgetAvgHoursPerStaff;

    // Weekly splits (standard 4 weeks allocation)
    const sWeekly = parseFloat((sMonthly / 4).toFixed(1));
    const bWeekly = parseFloat((bMonthly / 4).toFixed(1));
    const kWeekly = parseFloat((kMonthly / 4).toFixed(1));
    const tWeekly = parseFloat((sWeekly + bWeekly + kWeekly).toFixed(1));

    return {
      service: {
        staff: manpowerSummary.serviceActual,
        monthlyHours: sMonthly,
        weeklyHours: sWeekly,
        hours: sMonthly,
        rp: sMonthly * FIXED_OVERTIME_RATE,
        monthlyRp: sMonthly * FIXED_OVERTIME_RATE,
        weeklyRp: Math.round(sWeekly * FIXED_OVERTIME_RATE)
      },
      bar: {
        staff: manpowerSummary.barActual,
        monthlyHours: bMonthly,
        weeklyHours: bWeekly,
        hours: bMonthly,
        rp: bMonthly * FIXED_OVERTIME_RATE,
        monthlyRp: bMonthly * FIXED_OVERTIME_RATE,
        weeklyRp: Math.round(bWeekly * FIXED_OVERTIME_RATE)
      },
      kitchen: {
        staff: manpowerSummary.kitchenActual,
        monthlyHours: kMonthly,
        weeklyHours: kWeekly,
        hours: kMonthly,
        rp: kMonthly * FIXED_OVERTIME_RATE,
        monthlyRp: kMonthly * FIXED_OVERTIME_RATE,
        weeklyRp: Math.round(kWeekly * FIXED_OVERTIME_RATE)
      },
      total: {
        staff: totalManpowerStaff,
        monthlyHours: calculatedManpowerBudgetHours,
        weeklyHours: tWeekly,
        hours: calculatedManpowerBudgetHours,
        rp: calculatedManpowerBudgetRp,
        monthlyRp: calculatedManpowerBudgetRp,
        weeklyRp: Math.round(tWeekly * FIXED_OVERTIME_RATE)
      }
    };
  }, [manpowerSummary, totalManpowerStaff, budgetAvgHoursPerStaff, calculatedManpowerBudgetHours, calculatedManpowerBudgetRp]);

  // Combined active weekly data:
  // - Total Staff defaults strictly to totalManpowerStaff from Manpower table if not specifically overridden
  // - Saved manual records take precedence for overtime hours & notes
  const combinedWeeks = useMemo(() => {
    return defaultWeekRanges.map(w => {
      const saved = currentMonthRecords.find(r => r.week === w.week);
      const derived = dailyDerivedWeeks.find(d => d.week === w.week);

      // Total Staff is strictly synchronized with Manpower Table by default
      const staffFromManpower = totalManpowerStaff > 0 ? totalManpowerStaff : 0;
      const derivedStaff = derived?.totalStaff || 0;

      if (saved) {
        const staff = (saved.totalStaff !== undefined && saved.totalStaff > 0)
          ? saved.totalStaff
          : (staffFromManpower > 0 ? staffFromManpower : derivedStaff);

        const sumDivHours = parseFloat(((saved.serviceHours || 0) + (saved.barHours || 0) + (saved.kitchenHours || 0)).toFixed(1));
        const totalOt = sumDivHours > 0 ? sumDivHours : (saved.totalOvertime || 0);
        const totalPay = sumDivHours > 0 ? Math.round(totalOt * FIXED_OVERTIME_RATE) : (saved.totalOvertimePay || Math.round(totalOt * FIXED_OVERTIME_RATE));
        const avg = staff > 0 ? parseFloat((totalOt / staff).toFixed(2)) : (saved.averageOvertime || 0);

        return {
          ...saved,
          totalStaff: staff,
          totalOvertime: totalOt,
          totalOvertimePay: totalPay,
          averageOvertime: avg,
          isManual: true,
          weekLabel: saved.weekLabel || w.label,
          startDate: saved.startDate || w.startDate,
          endDate: saved.endDate || w.endDate,
          budgetOvertime: saved.budgetOvertime || 0,
          budgetOvertimeHours: saved.budgetOvertimeHours || 0
        };
      }

      const derivedDivHours = parseFloat(((derived?.serviceHours || 0) + (derived?.barHours || 0) + (derived?.kitchenHours || 0)).toFixed(1));
      const totalOt = derivedDivHours > 0 ? derivedDivHours : (derived?.totalOvertime || 0);
      const finalStaff = staffFromManpower > 0 ? staffFromManpower : derivedStaff;
      const finalAvg = finalStaff > 0 ? parseFloat((totalOt / finalStaff).toFixed(2)) : (derived?.averageOvertime || 0);
      const totalPay = derivedDivHours > 0 ? Math.round(totalOt * FIXED_OVERTIME_RATE) : (derived?.totalOvertimePay || Math.round(totalOt * FIXED_OVERTIME_RATE));

      return {
        week: w.week,
        weekLabel: w.label,
        startDate: derived?.startDate || w.startDate,
        endDate: derived?.endDate || w.endDate,
        totalStaff: finalStaff,
        totalOvertime: totalOt,
        totalOvertimePay: totalPay,
        averageOvertime: finalAvg,
        serviceHours: derived?.serviceHours || 0,
        barHours: derived?.barHours || 0,
        kitchenHours: derived?.kitchenHours || 0,
        budgetOvertime: 0,
        budgetOvertimeHours: 0,
        outlet: selectedOutlet,
        notes: '',
        divisionNotes: {},
        isManual: false
      };
    });
  }, [defaultWeekRanges, currentMonthRecords, dailyDerivedWeeks, totalManpowerStaff, selectedOutlet]);

  // Overall Month Totals
  const monthTotals = useMemo(() => {
    let sumStaff = 0;
    let sumOvertime = 0;
    let sumPay = 0;
    let sumService = 0;
    let sumBar = 0;
    let sumKitchen = 0;
    let sumWeeklyBudget = 0;
    let activeWeeksCount = 0;

    combinedWeeks.forEach(w => {
      sumStaff += w.totalStaff;
      sumOvertime += w.totalOvertime;
      sumPay += w.totalOvertimePay || 0;
      sumService += w.serviceHours || 0;
      sumBar += w.barHours || 0;
      sumKitchen += w.kitchenHours || 0;
      sumWeeklyBudget += w.budgetOvertime || 0;
      if (w.totalStaff > 0 || w.totalOvertime > 0) activeWeeksCount++;
    });

    // Total Orang / Staff sesuai dengan jumlah man power outlet (tidak diakumulasi antar minggu)
    const effectiveStaff = totalManpowerStaff > 0
      ? totalManpowerStaff
      : (combinedWeeks.find(w => w.totalStaff > 0)?.totalStaff || 0);

    const averageOvertime = effectiveStaff > 0 ? parseFloat((sumOvertime / effectiveStaff).toFixed(2)) : 0;
    const weeklyAverageOvertime = activeWeeksCount > 0 ? parseFloat((sumOvertime / activeWeeksCount).toFixed(2)) : 0;

    const serviceAverage = manpowerSummary.serviceActual > 0
      ? parseFloat((sumService / manpowerSummary.serviceActual).toFixed(2))
      : 0;
    const barAverage = manpowerSummary.barActual > 0
      ? parseFloat((sumBar / manpowerSummary.barActual).toFixed(2))
      : 0;
    const kitchenAverage = manpowerSummary.kitchenActual > 0
      ? parseFloat((sumKitchen / manpowerSummary.kitchenActual).toFixed(2))
      : 0;

    return {
      sumStaff: effectiveStaff, // Sesuai jumlah man power (headcount), bukan akumulasi
      accumulatedStaff: sumStaff,
      sumOvertime: parseFloat(sumOvertime.toFixed(1)),
      sumPay,
      sumService: parseFloat(sumService.toFixed(1)),
      sumBar: parseFloat(sumBar.toFixed(1)),
      sumKitchen: parseFloat(sumKitchen.toFixed(1)),
      serviceAverage,
      barAverage,
      kitchenAverage,
      sumWeeklyBudget,
      averageOvertime,
      weeklyAverageOvertime,
      activeWeeksCount
    };
  }, [combinedWeeks, totalManpowerStaff, manpowerSummary]);

  // Monthly Budget Overtime from state or auto-derived from manpower 35h formula
  const monthlyBudgetOvertime = useMemo(() => {
    if (data.weeklyOvertimeBudgetMonthly?.[monthKey] !== undefined) {
      return Number(data.weeklyOvertimeBudgetMonthly[monthKey]) || 0;
    }
    const legacy = (data.monthlyOvertimeBudgets?.[monthKey] as any)?.total ?? (data.overtimeBudgets?.[monthKey]);
    if (legacy !== undefined && Number(legacy) > 0) {
      return Number(legacy);
    }
    if (calculatedManpowerBudgetRp > 0) {
      return calculatedManpowerBudgetRp;
    }
    return monthTotals.sumWeeklyBudget || 0;
  }, [data.weeklyOvertimeBudgetMonthly, data.monthlyOvertimeBudgets, data.overtimeBudgets, monthKey, calculatedManpowerBudgetRp, monthTotals.sumWeeklyBudget]);

  const [inputMonthlyBudget, setInputMonthlyBudget] = useState<number>(monthlyBudgetOvertime);

  useEffect(() => {
    setInputMonthlyBudget(monthlyBudgetOvertime);
  }, [monthlyBudgetOvertime, monthKey]);

  const handleSaveMonthlyBudget = (newAmount?: number) => {
    const val = newAmount !== undefined ? newAmount : Number(inputMonthlyBudget) || 0;
    const updated = {
      ...(data.weeklyOvertimeBudgetMonthly || {}),
      [monthKey]: val
    };
    onUpdate('weeklyOvertimeBudgetMonthly', updated);
    if (showToast) {
      showToast(`Budget Overtime bulan ${monthName} ${selectedYear} disimpan: Rp ${val.toLocaleString('id-ID')}`, 'success');
    }
  };

  const handleApplyManpowerFormulaBudget = () => {
    setInputMonthlyBudget(calculatedManpowerBudgetRp);
    handleSaveMonthlyBudget(calculatedManpowerBudgetRp);
    if (showToast) {
      showToast(`Budget Overtime berhasil diset otomatis: ${calculatedManpowerBudgetHours} Jam (${totalManpowerStaff} Staff × ${budgetAvgHoursPerStaff} Jam) = Rp ${calculatedManpowerBudgetRp.toLocaleString('id-ID')}`, 'success');
    }
  };

  // Sync All Weeks (Week 1, Week 2, Week 3, Week 4) to match Manpower Table staff count
  const handleSyncAllWeeksToManpowerStaff = () => {
    if (totalManpowerStaff <= 0) {
      if (showToast) showToast('Data total staff pada Tabel Man Power masih 0', 'error');
      return;
    }

    const updatedWeeks: WeeklyOvertimeEntry[] = combinedWeeks.map(w => {
      const avg = parseFloat((w.totalOvertime / totalManpowerStaff).toFixed(2));
      return {
        ...w,
        totalStaff: totalManpowerStaff,
        averageOvertime: avg,
        outlet: selectedOutlet,
        updatedAt: new Date().toISOString()
      };
    });

    const updatedWeeklyOvertime = {
      ...weeklyRecordsMap,
      [monthKey]: updatedWeeks
    };

    onUpdate('weeklyOvertime', updatedWeeklyOvertime);
    if (showToast) {
      showToast(`Total Staff seluruh minggu (W1-W5) disamakan ke Man Power: ${totalManpowerStaff} Staff`, 'success');
    }
  };

  // Modal / Form state for Editing a Week
  const [editingWeek, setEditingWeek] = useState<WeeklyOvertimeEntry | null>(null);
  const [formWeek, setFormWeek] = useState<number>(1);
  const [formStartDate, setFormStartDate] = useState<string>('');
  const [formEndDate, setFormEndDate] = useState<string>('');
  const [formTotalStaff, setFormTotalStaff] = useState<number>(0);
  const [formTotalOvertime, setFormTotalOvertime] = useState<number>(0);
  const [formTotalPay, setFormTotalPay] = useState<number>(0);
  const [formBudgetOvertime, setFormBudgetOvertime] = useState<number>(0);
  const [formBudgetOvertimeHours, setFormBudgetOvertimeHours] = useState<number>(0);
  const [formBudgetServiceHours, setFormBudgetServiceHours] = useState<number>(0);
  const [formBudgetBarHours, setFormBudgetBarHours] = useState<number>(0);
  const [formBudgetKitchenHours, setFormBudgetKitchenHours] = useState<number>(0);
  const [formServiceHours, setFormServiceHours] = useState<number>(0);
  const [formBarHours, setFormBarHours] = useState<number>(0);
  const [formKitchenHours, setFormKitchenHours] = useState<number>(0);
  const [formAverageOvertime, setFormAverageOvertime] = useState<number>(0);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formServiceNotes, setFormServiceNotes] = useState<string>('');
  const [formBarNotes, setFormBarNotes] = useState<string>('');
  const [formKitchenNotes, setFormKitchenNotes] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const openEditModal = (weekData: any) => {
    setEditingWeek(weekData);
    setFormWeek(weekData.week);
    setFormStartDate(weekData.startDate);
    setFormEndDate(weekData.endDate);

    // Total staff strictly bound/initialized from Manpower table
    const initialStaff = (weekData.totalStaff && weekData.totalStaff > 0)
      ? weekData.totalStaff
      : (totalManpowerStaff > 0 ? totalManpowerStaff : 0);

    const initialService = weekData.serviceHours || 0;
    const initialBar = weekData.barHours || 0;
    const initialKitchen = weekData.kitchenHours || 0;
    const sumDiv = parseFloat((initialService + initialBar + initialKitchen).toFixed(1));
    const initialTotalOt = sumDiv > 0 ? sumDiv : (weekData.totalOvertime || 0);

    setFormTotalStaff(initialStaff);
    setFormServiceHours(initialService);
    setFormBarHours(initialBar);
    setFormKitchenHours(initialKitchen);
    setFormTotalOvertime(initialTotalOt);
    setFormTotalPay(weekData.totalOvertimePay || (initialTotalOt ? Math.round(initialTotalOt * FIXED_OVERTIME_RATE) : 0));

    const divisionBudget = divisionManpowerBudget;
    setFormBudgetOvertime(weekData.budgetOvertime || divisionBudget.total.weeklyRp);
    setFormBudgetOvertimeHours(weekData.budgetOvertimeHours || divisionBudget.total.weeklyHours);
    setFormBudgetServiceHours(weekData.budgetServiceHours || divisionBudget.service.weeklyHours);
    setFormBudgetBarHours(weekData.budgetBarHours || divisionBudget.bar.weeklyHours);
    setFormBudgetKitchenHours(weekData.budgetKitchenHours || divisionBudget.kitchen.weeklyHours);

    const avg = initialStaff > 0 
      ? parseFloat((initialTotalOt / initialStaff).toFixed(2)) 
      : (weekData.averageOvertime || 0);
    setFormAverageOvertime(avg);

    // Notes per division + general notes
    setFormNotes(weekData.notes || '');
    setFormServiceNotes(weekData.divisionNotes?.SERVICE || '');
    setFormBarNotes(weekData.divisionNotes?.BAR || '');
    setFormKitchenNotes(weekData.divisionNotes?.KITCHEN || '');

    setIsModalOpen(true);
  };

  // Auto-realisasi Total Overtime dari setiap Jam Overtime per Divisi
  const handleServiceHoursChange = (val: number) => {
    const s = Math.max(0, val);
    setFormServiceHours(s);
    const newTotal = parseFloat((s + formBarHours + formKitchenHours).toFixed(1));
    setFormTotalOvertime(newTotal);
    setFormTotalPay(Math.round(newTotal * FIXED_OVERTIME_RATE));
    if (formTotalStaff > 0) {
      setFormAverageOvertime(parseFloat((newTotal / formTotalStaff).toFixed(2)));
    }
  };

  const handleBarHoursChange = (val: number) => {
    const b = Math.max(0, val);
    setFormBarHours(b);
    const newTotal = parseFloat((formServiceHours + b + formKitchenHours).toFixed(1));
    setFormTotalOvertime(newTotal);
    setFormTotalPay(Math.round(newTotal * FIXED_OVERTIME_RATE));
    if (formTotalStaff > 0) {
      setFormAverageOvertime(parseFloat((newTotal / formTotalStaff).toFixed(2)));
    }
  };

  const handleKitchenHoursChange = (val: number) => {
    const k = Math.max(0, val);
    setFormKitchenHours(k);
    const newTotal = parseFloat((formServiceHours + formBarHours + k).toFixed(1));
    setFormTotalOvertime(newTotal);
    setFormTotalPay(Math.round(newTotal * FIXED_OVERTIME_RATE));
    if (formTotalStaff > 0) {
      setFormAverageOvertime(parseFloat((newTotal / formTotalStaff).toFixed(2)));
    }
  };

  // Recalculate frozen division targets when average budget hours changes (e.g. 35h)
  const handleBudgetAvgHoursChange = (newAvg: number) => {
    const val = Math.max(0, newAvg);
    setBudgetAvgHoursPerStaff(val);
    if (isDivisionBudgetFrozen && totalManpowerStaff > 0) {
      const sW = parseFloat(((manpowerSummary.serviceActual * val) / 4).toFixed(1));
      const bW = parseFloat(((manpowerSummary.barActual * val) / 4).toFixed(1));
      const kW = parseFloat(((manpowerSummary.kitchenActual * val) / 4).toFixed(1));
      const tW = parseFloat((sW + bW + kW).toFixed(1));

      setFormBudgetServiceHours(sW);
      setFormBudgetBarHours(bW);
      setFormBudgetKitchenHours(kW);
      setFormBudgetOvertimeHours(tW);
      setFormBudgetOvertime(Math.round(tW * FIXED_OVERTIME_RATE));
    }
  };

  // Toggle freeze on division budget allocation
  const handleToggleFreezeDivisionBudget = () => {
    const nextFrozen = !isDivisionBudgetFrozen;
    setIsDivisionBudgetFrozen(nextFrozen);
    if (nextFrozen && totalManpowerStaff > 0) {
      const sW = parseFloat(((manpowerSummary.serviceActual * budgetAvgHoursPerStaff) / 4).toFixed(1));
      const bW = parseFloat(((manpowerSummary.barActual * budgetAvgHoursPerStaff) / 4).toFixed(1));
      const kW = parseFloat(((manpowerSummary.kitchenActual * budgetAvgHoursPerStaff) / 4).toFixed(1));
      const tW = parseFloat((sW + bW + kW).toFixed(1));

      setFormBudgetServiceHours(sW);
      setFormBudgetBarHours(bW);
      setFormBudgetKitchenHours(kW);
      setFormBudgetOvertimeHours(tW);
      setFormBudgetOvertime(Math.round(tW * FIXED_OVERTIME_RATE));
      if (showToast) {
        showToast('Alokasi target jam per divisi dibekukan sesuai pembagian Man Power', 'info');
      }
    }
  };

  // Auto recalculate Average Overtime when totalStaff or totalOvertime changes in form
  const handleStaffChange = (staff: number) => {
    setFormTotalStaff(staff);
    if (staff > 0) {
      setFormAverageOvertime(parseFloat((formTotalOvertime / staff).toFixed(2)));
    } else {
      setFormAverageOvertime(0);
    }
  };

  const handleTotalOvertimeChange = (ot: number) => {
    setFormTotalOvertime(ot);
    if (formTotalStaff > 0) {
      setFormAverageOvertime(parseFloat((ot / formTotalStaff).toFixed(2)));
    } else {
      setFormAverageOvertime(0);
    }
  };

  // Save changes to weeklyOvertime in AppState
  const handleSaveWeek = () => {
    const updatedRecord: WeeklyOvertimeEntry = {
      week: formWeek,
      weekLabel: `Week ${formWeek} (${new Date(formStartDate).getDate()} - ${new Date(formEndDate).getDate()} ${monthName.slice(0, 3)})`,
      startDate: formStartDate,
      endDate: formEndDate,
      totalStaff: Number(formTotalStaff) || 0,
      totalOvertime: Number(formTotalOvertime) || 0,
      totalOvertimePay: Number(formTotalPay) || 0,
      budgetOvertime: Number(formBudgetOvertime) || 0,
      budgetOvertimeHours: Number(formBudgetOvertimeHours) || 0,
      budgetServiceHours: Number(formBudgetServiceHours) || 0,
      budgetBarHours: Number(formBudgetBarHours) || 0,
      budgetKitchenHours: Number(formBudgetKitchenHours) || 0,
      averageOvertime: Number(formAverageOvertime) || (formTotalStaff > 0 ? parseFloat((formTotalOvertime / formTotalStaff).toFixed(2)) : 0),
      serviceHours: Number(formServiceHours) || 0,
      barHours: Number(formBarHours) || 0,
      kitchenHours: Number(formKitchenHours) || 0,
      outlet: selectedOutlet,
      notes: formNotes,
      divisionNotes: {
        SERVICE: formServiceNotes,
        BAR: formBarNotes,
        KITCHEN: formKitchenNotes
      },
      budgetHoursPerStaff: budgetAvgHoursPerStaff,
      updatedAt: new Date().toISOString()
    };

    const existingMonthRecords = [...currentMonthRecords];
    const existingIdx = existingMonthRecords.findIndex(r => r.week === formWeek);
    if (existingIdx >= 0) {
      existingMonthRecords[existingIdx] = updatedRecord;
    } else {
      existingMonthRecords.push(updatedRecord);
    }
    existingMonthRecords.sort((a, b) => a.week - b.week);

    const updatedWeeklyOvertime = {
      ...weeklyRecordsMap,
      [monthKey]: existingMonthRecords
    };

    onUpdate('weeklyOvertime', updatedWeeklyOvertime);
    if (budgetAvgHoursPerStaff !== data.budgetAvgOvertimeHours) {
      onUpdate('budgetAvgOvertimeHours', budgetAvgHoursPerStaff);
    }

    setIsModalOpen(false);
    if (showToast) {
      showToast(`Berhasil menyimpan data lembur & catatan divisi Week ${formWeek} (${monthName} ${selectedYear})`, 'success');
    }
  };

  // Sync All Weeks from Daily Overtime
  const handleAutoSyncFromDaily = () => {
    const syncedRecords: WeeklyOvertimeEntry[] = dailyDerivedWeeks.map(d => ({
      ...d,
      outlet: selectedOutlet,
      notes: 'Tersinkronisasi otomatis dari Log Lembur Harian',
      updatedAt: new Date().toISOString()
    }));

    const updatedWeeklyOvertime = {
      ...weeklyRecordsMap,
      [monthKey]: syncedRecords
    };

    onUpdate('weeklyOvertime', updatedWeeklyOvertime);
    if (showToast) {
      showToast(`Berhasil menarik dan menyinkronkan data lembur mingguan dari database harian!`, 'success');
    }
  };

  // Copy Summary to WhatsApp
  const handleCopyWhatsApp = () => {
    const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];
    let msg = `*WEEKLY OVERTIME REPORT - ${selectedOutlet}*\n`;
    msg += `Periode: ${monthName} ${selectedYear} (Cut-Off: 26 ${prevMonthName.slice(0, 3)} - 25 ${monthName.slice(0, 3)})\n`;
    msg += `------------------------------------\n`;
    msg += `*RINGKASAN TOTAL BULAN INI*\n`;
    msg += `• Total Staff: ${monthTotals.sumStaff} Orang (Sesuai Man Power)\n`;
    msg += `• Total Overtime: ${monthTotals.sumOvertime} Jam\n`;
    msg += `• Average Overtime: ${monthTotals.averageOvertime} Jam/Staff\n`;
    msg += `• Plafon Budget Overtime: Rp ${monthlyBudgetOvertime.toLocaleString('id-ID')}\n`;
    msg += `• Realisasi Biaya Overtime: Rp ${monthTotals.sumPay.toLocaleString('id-ID')}\n`;
    const variance = monthlyBudgetOvertime - monthTotals.sumPay;
    msg += `• Sisa Budget (Varian): Rp ${variance.toLocaleString('id-ID')} (${variance >= 0 ? 'SURPLUS' : 'OVER BUDGET'})\n`;
    if (monthlyBudgetOvertime > 0) {
      msg += `• Utilisasi Budget: ${((monthTotals.sumPay / monthlyBudgetOvertime) * 100).toFixed(1)}%\n`;
    }
    msg += `• Service: ${monthTotals.sumService}h (Avg ${monthTotals.serviceAverage}h/stf) | Bar: ${monthTotals.sumBar}h (Avg ${monthTotals.barAverage}h/stf) | Kitchen: ${monthTotals.sumKitchen}h (Avg ${monthTotals.kitchenAverage}h/stf)\n`;
    msg += `------------------------------------\n`;
    msg += `*RINCIAN PER MINGGU:*\n`;

    combinedWeeks.forEach(w => {
      const svcAvg = manpowerSummary.serviceActual > 0 ? ((w.serviceHours || 0) / manpowerSummary.serviceActual).toFixed(1) : '0';
      const barAvg = manpowerSummary.barActual > 0 ? ((w.barHours || 0) / manpowerSummary.barActual).toFixed(1) : '0';
      const kitAvg = manpowerSummary.kitchenActual > 0 ? ((w.kitchenHours || 0) / manpowerSummary.kitchenActual).toFixed(1) : '0';
      msg += `\n*${w.weekLabel}*\n`;
      msg += `  Staff: ${w.totalStaff} Orang (Sesuai MP)\n`;
      msg += `  Overtime: ${w.totalOvertime} Jam (Avg: ${w.averageOvertime}h/staff)\n`;
      msg += `  Divisi: Svc ${w.serviceHours || 0}h (Avg ${svcAvg}h) | Bar ${w.barHours || 0}h (Avg ${barAvg}h) | Kit ${w.kitchenHours || 0}h (Avg ${kitAvg}h)\n`;
      if (w.budgetOvertime) msg += `  Budget OT: Rp ${w.budgetOvertime.toLocaleString('id-ID')}\n`;
      if (w.totalOvertimePay) msg += `  Biaya OT: Rp ${w.totalOvertimePay.toLocaleString('id-ID')}\n`;
      if (w.notes) msg += `  Catatan: ${w.notes}\n`;
    });

    msg += `\n_Generated via Barn Management System_`;

    navigator.clipboard.writeText(msg).then(() => {
      if (showToast) showToast('Laporan Mingguan Overtime berhasil disalin ke WhatsApp!', 'success');
    }).catch(() => {
      if (showToast) showToast('Gagal menyalin teks ke clipboard', 'error');
    });
  };

  // Export Excel
  const handleExportExcel = async () => {
    const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Weekly Overtime');

    worksheet.addRow([`LAPORAN WEEKLY OVERTIME - ${selectedOutlet}`]);
    worksheet.addRow([`Periode: ${monthName} ${selectedYear} (Cut-Off: 26 ${prevMonthName.slice(0, 3)} - 25 ${monthName.slice(0, 3)})`]);
    worksheet.addRow([]);

    worksheet.addRow([
      'NO',
      'MINGGU / PERIODE',
      'TANGGAL AWAL',
      'TANGGAL AKHIR',
      'TOTAL STAFF',
      'TOTAL OVERTIME (JAM)',
      'AVG OVERTIME (JAM/STAFF)',
      'SERVICE (JAM)',
      'AVG SERVICE (H/STF)',
      'BAR (JAM)',
      'AVG BAR (H/STF)',
      'KITCHEN (JAM)',
      'AVG KITCHEN (H/STF)',
      'ESTIMASI BIAYA (RP)',
      'STATUS / CATATAN'
    ]);

    combinedWeeks.forEach((w, idx) => {
      const svcAvg = manpowerSummary.serviceActual > 0 ? Number(((w.serviceHours || 0) / manpowerSummary.serviceActual).toFixed(1)) : 0;
      const barAvg = manpowerSummary.barActual > 0 ? Number(((w.barHours || 0) / manpowerSummary.barActual).toFixed(1)) : 0;
      const kitAvg = manpowerSummary.kitchenActual > 0 ? Number(((w.kitchenHours || 0) / manpowerSummary.kitchenActual).toFixed(1)) : 0;

      worksheet.addRow([
        idx + 1,
        w.weekLabel,
        w.startDate,
        w.endDate,
        w.totalStaff,
        w.totalOvertime,
        w.averageOvertime,
        w.serviceHours || 0,
        svcAvg,
        w.barHours || 0,
        barAvg,
        w.kitchenHours || 0,
        kitAvg,
        w.totalOvertimePay || 0,
        w.notes || (w.isManual ? 'Manual Input' : 'Auto Synced')
      ]);
    });

    // Total Row
    worksheet.addRow([
      '',
      'TOTAL / RATA-RATA',
      '',
      '',
      monthTotals.sumStaff,
      monthTotals.sumOvertime,
      monthTotals.averageOvertime,
      monthTotals.sumService,
      monthTotals.serviceAverage,
      monthTotals.sumBar,
      monthTotals.barAverage,
      monthTotals.sumKitchen,
      monthTotals.kitchenAverage,
      monthTotals.sumPay,
      ''
    ]);

    // Simple styling
    worksheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF312E81' }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Weekly_Overtime_${selectedOutlet}_${monthKey}.xlsx`);
    if (showToast) showToast('Export Excel berhasil diunduh!', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* TOP NAVIGATION SUB-TABS: WEEKLY OVERTIME VS MAN POWER TABLE VS REGIONAL RECAP */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {(allMonthlyData || isRegionalView) && (
            <button
              type="button"
              onClick={() => setActiveTab('REGIONAL_RECAP')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'REGIONAL_RECAP'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-sitemap"></i>
              <span>Rekapitulasi Outlet</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('WEEKLY_OVERTIME')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'WEEKLY_OVERTIME'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-business-time"></i>
            <span>Log Lembur Mingguan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANPOWER_TABLE')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'MANPOWER_TABLE'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-users-cog"></i>
            <span>Tabel Man Power</span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-black border border-emerald-500/30">
              {manpowerSummary.totalInhouseActual} Org
            </span>
            {manpowerSummary.totalVacantOpen > 0 && (
              <span className="px-1.5 py-0.5 bg-[#22c55e] text-slate-950 rounded text-[10px] font-black shadow-xs">
                {manpowerSummary.totalVacantOpen} Vacant
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-[11px] font-bold text-slate-400">
          <i className="fas fa-store text-indigo-400"></i>
          <span className="text-white uppercase font-black">{currentSelectedOutlet}</span>
        </div>
      </div>

      {/* RENDER VIEW ACCORDING TO ACTIVE TAB */}
      {activeTab === 'REGIONAL_RECAP' ? (
        <RegionalWeeklyOvertimeRecapTable
          allOutletsData={allMonthlyData || {}}
          globalData={data}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={selectedArea}
          selectedOutlet={currentSelectedOutlet}
          onSelectOutlet={setCurrentSelectedOutlet}
          showToast={showToast}
        />
      ) : activeTab === 'MANPOWER_TABLE' ? (
        <ManpowerTableModule
          data={data}
          onUpdate={onUpdate}
          selectedOutlet={selectedOutlet}
          filters={{ month: selectedMonth.toString(), year: selectedYear.toString() }}
          showToast={showToast}
          onNavigateToWeeklyOvertime={() => setActiveTab('WEEKLY_OVERTIME')}
        />
      ) : (
        <>
          {/* HEADER BAR */}
          <div className="glass-card p-6 md:p-8 border-l-4 border-indigo-500 bg-slate-900/60 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <i className="fas fa-business-time text-[160px]"></i>
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <i className="fas fa-store text-[9px]"></i>
                    {selectedOutlet}
                  </span>
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-black uppercase tracking-widest">
                    Outlet Dashboard
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                  <i className="fas fa-business-time text-indigo-400"></i>
                  Input Weekly Overtime
                </h1>
                <p className="text-slate-400 text-xs font-semibold mt-1">
                  Periode Cut-Off: <strong className="text-amber-300">Tgl 26 {MONTH_NAMES[selectedMonth === 0 ? 11 : selectedMonth - 1]} - 25 {monthName}</strong> — Monitoring & Penginputan Lembur Mingguan: <strong className="text-white">Total Staff</strong>, <strong className="text-indigo-300">Total Overtime</strong>, dan <strong className="text-emerald-300">Average Overtime</strong>.
                </p>
              </div>

              {/* MONTH & PERIOD CONTROLS */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-950/60 p-2.5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider pl-2">Bulan:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white focus:ring-2 ring-indigo-500 outline-none"
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tahun:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white focus:ring-2 ring-indigo-500 outline-none"
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                  <button
                    type="button"
                    onClick={handleAutoSyncFromDaily}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                    title="Tarik & sinkronkan data lembur harian otomatis ke mingguan"
                  >
                    <i className="fas fa-sync-alt"></i>
                    <span className="hidden sm:inline">Sync Log Harian</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyWhatsApp}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                    title="Salin rekap ke WhatsApp"
                  >
                    <i className="fab fa-whatsapp text-xs"></i>
                    <span className="hidden sm:inline">WA</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md"
                    title="Export data ke Excel"
                  >
                    <i className="fas fa-file-excel text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* MANPOWER CONNECTION BANNER (REQUESTED INTEGRATION) */}
          <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-slate-950/80 border border-indigo-500/30 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/25 border border-indigo-500/40 flex items-center justify-center text-indigo-400 text-lg shrink-0 shadow-inner">
                <i className="fas fa-network-wired"></i>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Data Man Power Terhubung ke Weekly Overtime
                  </h4>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-black border border-emerald-500/30 uppercase">
                    Sinkron Real-Time
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mt-1">
                  <span>In-House Aktif: <strong className="text-white font-mono font-black">{manpowerSummary.totalInhouseActual}</strong> / {manpowerSummary.totalInhouseBudget} Org</span>
                  <span className="text-slate-600">•</span>
                  <span>Service: <strong className="text-indigo-300 font-mono font-bold">{manpowerSummary.serviceActual}</strong></span>
                  <span className="text-slate-600">•</span>
                  <span>Bar: <strong className="text-amber-300 font-mono font-bold">{manpowerSummary.barActual}</strong></span>
                  <span className="text-slate-600">•</span>
                  <span>Kitchen: <strong className="text-emerald-300 font-mono font-bold">{manpowerSummary.kitchenActual}</strong></span>
                  {manpowerSummary.externalActual > 0 && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span>External: <strong className="text-purple-300 font-mono font-bold">{manpowerSummary.externalActual}</strong></span>
                    </>
                  )}
                  {manpowerSummary.totalVacantOpen > 0 && (
                    <span className="bg-[#22c55e] text-slate-950 font-black px-2 py-0.5 rounded text-[10px] uppercase">
                      {manpowerSummary.totalVacantOpen} Vacant Open
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('MANPOWER_TABLE')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-900/30 flex items-center gap-2 shrink-0 self-start md:self-auto active:scale-95"
            >
              <i className="fas fa-table text-xs"></i>
              Buka Tabel Man Power
            </button>
          </div>

      {/* BUDGET OVERTIME INPUT & MONITORING HERO CARD (REQUESTED FEATURE) */}
      <div className="glass-card p-6 rounded-2xl border-l-4 border-emerald-500 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-white/10 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="text-xs font-black uppercase text-emerald-400 tracking-widest flex items-center gap-2">
                <i className="fas fa-wallet text-sm"></i>
                Input Budget Overtime ({monthName} {selectedYear})
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Fixed Rate: Rp {FIXED_OVERTIME_RATE.toLocaleString('id-ID')} / Jam
              </span>
            </div>
            <p className="text-slate-400 text-xs font-medium max-w-xl">
              Tentukan target plafon anggaran lembur bulanan outlet dalam <strong className="text-white">Jam</strong> atau <strong className="text-emerald-300">Rupiah</strong> (Rate tetap Rp 15.000/jam untuk seluruh divisi). Sistem otomatis mengkalkulasi realisasi, varian jam &amp; biaya, serta utilisasi budget.
            </p>
          </div>

          {/* Quick Dual Input Form (Hours & Rupiah linked with Rp 15.000/jam) */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2">
              {/* Input Hours */}
              <div className="relative w-28">
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-400 pointer-events-none">JAM</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={inputMonthlyBudget > 0 ? Math.round(inputMonthlyBudget / FIXED_OVERTIME_RATE) : ''}
                  onChange={(e) => {
                    const hrs = Math.max(0, parseFloat(e.target.value) || 0);
                    setInputMonthlyBudget(Math.round(hrs * FIXED_OVERTIME_RATE));
                  }}
                  placeholder="300"
                  className="w-full bg-slate-950/90 border border-emerald-500/30 rounded-xl pl-3 pr-9 py-2.5 text-emerald-300 font-mono font-black text-sm outline-none focus:ring-2 ring-emerald-500"
                  title="Target Total Jam Lembur Bulanan"
                />
              </div>

              <span className="text-slate-500 text-xs font-black">=</span>

              {/* Input Rupiah */}
              <div className="relative w-44">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 pointer-events-none">RP</span>
                <input
                  type="number"
                  min="0"
                  step="15000"
                  value={inputMonthlyBudget || ''}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setInputMonthlyBudget(val);
                  }}
                  placeholder="4.500.000"
                  className="w-full bg-slate-950/90 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white font-mono font-black text-sm outline-none focus:ring-2 ring-emerald-500"
                  title="Plafon Anggaran Rupiah (otomatis terhubung dengan jam × Rp 15.000)"
                />
              </div>
            </div>

            {/* Auto Calculate Button from Manpower Table */}
            {totalManpowerStaff > 0 && (
              <button
                type="button"
                onClick={handleApplyManpowerFormulaBudget}
                className="px-3.5 py-2.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                title="Terapkan Formula: Rata-rata 35 Jam × Total Staff Seluruh Divisi"
              >
                <i className="fas fa-magic text-amber-400"></i>
                <span>Hitung Otomatis: 35 Jam × {totalManpowerStaff} Staff ({calculatedManpowerBudgetHours} Jam)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveMonthlyBudget()}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/40 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <i className="fas fa-check-circle"></i>
              Simpan Budget
            </button>
          </div>
        </div>

        {/* Division Breakdown of 35-Hour Budget Formula */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-950/60 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
              Formula Budget Overtime (35 Jam/Staff Seluruh Divisi):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <span className="text-slate-300">
              Service: <strong className="text-indigo-400 font-bold">{divisionManpowerBudget?.service?.staff ?? 0} Staff</strong> × 35 = <strong className="text-white">{divisionManpowerBudget?.service?.hours ?? 0}h</strong> (Rp {(divisionManpowerBudget?.service?.rp ?? 0).toLocaleString('id-ID')})
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300">
              Bar: <strong className="text-amber-400 font-bold">{divisionManpowerBudget?.bar?.staff ?? 0} Staff</strong> × 35 = <strong className="text-white">{divisionManpowerBudget?.bar?.hours ?? 0}h</strong> (Rp {(divisionManpowerBudget?.bar?.rp ?? 0).toLocaleString('id-ID')})
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300">
              Kitchen: <strong className="text-emerald-400 font-bold">{divisionManpowerBudget?.kitchen?.staff ?? 0} Staff</strong> × 35 = <strong className="text-white">{divisionManpowerBudget?.kitchen?.hours ?? 0}h</strong> (Rp {(divisionManpowerBudget?.kitchen?.rp ?? 0).toLocaleString('id-ID')})
            </span>
            <span className="text-slate-600">•</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black">
              Total: {totalManpowerStaff ?? 0} Staff = {calculatedManpowerBudgetHours ?? 0} Jam (Rp {(calculatedManpowerBudgetRp ?? 0).toLocaleString('id-ID')})
            </span>
          </div>
        </div>

        {/* Budget Comparison Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/10">
          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-black uppercase text-slate-400">Plafon Budget Overtime</span>
              <span className="text-[9px] font-mono font-bold text-emerald-400">
                {Math.round(monthlyBudgetOvertime / FIXED_OVERTIME_RATE)} Jam
              </span>
            </div>
            <div className="text-lg font-black text-white font-mono">
              Rp {monthlyBudgetOvertime.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-black uppercase text-slate-400">Realisasi Biaya Lembur</span>
              <span className="text-[9px] font-mono font-bold text-amber-400">
                {monthTotals.sumOvertime} Jam
              </span>
            </div>
            <div className="text-lg font-black text-amber-400 font-mono">
              Rp {monthTotals.sumPay.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-black uppercase text-slate-400">Sisa Budget (Varian)</span>
              {monthlyBudgetOvertime > 0 && (
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${monthlyBudgetOvertime - monthTotals.sumPay >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {monthlyBudgetOvertime - monthTotals.sumPay >= 0 ? 'SURPLUS' : 'OVER BUDGET'}
                </span>
              )}
            </div>
            <div className={`text-lg font-black font-mono ${monthlyBudgetOvertime - monthTotals.sumPay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Rp {(monthlyBudgetOvertime - monthTotals.sumPay).toLocaleString('id-ID')}
            </div>
            <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
              Sisa: {((monthlyBudgetOvertime - monthTotals.sumPay) / FIXED_OVERTIME_RATE).toFixed(1)} Jam
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-black uppercase text-slate-400">Utilisasi Budget</span>
              <span className="text-xs font-black text-white font-mono">
                {monthlyBudgetOvertime > 0 ? `${((monthTotals.sumPay / monthlyBudgetOvertime) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  (monthTotals.sumPay / (monthlyBudgetOvertime || 1)) > 1 ? 'bg-rose-500' : 
                  (monthTotals.sumPay / (monthlyBudgetOvertime || 1)) > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, monthlyBudgetOvertime > 0 ? (monthTotals.sumPay / monthlyBudgetOvertime) * 100 : 0)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* THREE CORE METRIC CARDS REQUIRED BY USER: TOTAL STAFF, TOTAL OVERTIME, AVERAGE OVERTIME */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL STAFF */}
        <div className="glass-card p-6 bg-slate-900/70 border-t-2 border-indigo-500 rounded-2xl relative overflow-hidden group hover:border-indigo-400 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                1. Total Staff (Man Power)
              </div>
              <div className="text-3xl font-black text-white font-mono mt-2 tracking-tight">
                {monthTotals.sumStaff} <span className="text-xs font-normal text-slate-400">Orang</span>
              </div>
              <p className="text-[10px] font-semibold text-emerald-400 mt-1">
                Sesuai jumlah man power outlet (tidak diakumulasi)
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <i className="fas fa-users text-xl"></i>
            </div>
          </div>
        </div>

        {/* 2. TOTAL OVERTIME */}
        <div className="glass-card p-6 bg-slate-900/70 border-t-2 border-blue-500 rounded-2xl relative overflow-hidden group hover:border-blue-400 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                2. Total Overtime (Hours)
              </div>
              <div className="text-3xl font-black text-white font-mono mt-2 tracking-tight">
                {monthTotals.sumOvertime} <span className="text-xs font-normal text-slate-400">Jam</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 mt-1">
                Estimasi: <strong className="text-emerald-400 font-mono">Rp {monthTotals.sumPay.toLocaleString('id-ID')}</strong>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
              <i className="fas fa-clock text-xl"></i>
            </div>
          </div>
        </div>

        {/* 3. AVERAGE OVERTIME */}
        <div className="glass-card p-6 bg-slate-900/70 border-t-2 border-emerald-500 rounded-2xl relative overflow-hidden group hover:border-emerald-400 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                3. Average Overtime
              </div>
              <div className="text-3xl font-black text-white font-mono mt-2 tracking-tight">
                {monthTotals.averageOvertime} <span className="text-xs font-normal text-slate-400">Jam/Staff</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 mt-1">
                Rasio: Total Jam ÷ Total Staff
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <i className="fas fa-calculator text-xl"></i>
            </div>
          </div>
        </div>

        {/* 4. DIVISION BREAKDOWN & RATA-RATA */}
        <div className="glass-card p-6 bg-slate-900/70 border-t-2 border-amber-500 rounded-2xl relative overflow-hidden group hover:border-amber-400 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                Breakdown & Rata² Divisi
              </div>
              <div className="mt-2 space-y-1.5 text-xs font-bold text-slate-300">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-400">Service:</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-white">{monthTotals.sumService}h</span>
                    <span className="text-[9px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded">
                      Avg {monthTotals.serviceAverage}h
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-400">Bar:</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-white">{monthTotals.sumBar}h</span>
                    <span className="text-[9px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded">
                      Avg {monthTotals.barAverage}h
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-400">Kitchen:</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-white">{monthTotals.sumKitchen}h</span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      Avg {monthTotals.kitchenAverage}h
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <i className="fas fa-layer-group text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN WEEKLY OVERTIME TABLE */}
      <div className="glass-card rounded-2xl overflow-hidden border border-white/10 bg-slate-900/60 shadow-xl">
        <div className="p-5 bg-slate-950/70 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-table-list text-indigo-400"></i>
              Tabel Input & Rekap Mingguan Overtime ({monthName} {selectedYear})
            </h3>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Klik tombol <strong>"Input / Edit"</strong> pada baris minggu yang bersangkutan untuk menginput atau mengedit data.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncAllWeeksToManpowerStaff}
              className="px-4 py-2 bg-indigo-950/70 hover:bg-indigo-900 text-indigo-200 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-indigo-500/40 flex items-center gap-2 shadow-sm"
              title="Samakan Total Staff untuk seluruh minggu (Week 1, Week 2, Week 3, Week 4) sesuai jumlah pada Tabel Man Power"
            >
              <i className="fas fa-users-gear text-amber-400"></i>
              Samakan Staff W1-W4 ke Man Power ({totalManpowerStaff} Org)
            </button>
            {onNavigateToDailyOvertime && (
              <button
                type="button"
                onClick={onNavigateToDailyOvertime}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-white/10 flex items-center gap-2"
              >
                <i className="fas fa-clock"></i>
                Buka Log Lembur Harian
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4">Minggu / Periode</th>
                <th className="py-3.5 px-4 text-center text-indigo-300 bg-indigo-950/30">Total Staff</th>
                <th className="py-3.5 px-4 text-right text-blue-300 bg-blue-950/30">Total Overtime (Jam)</th>
                <th className="py-3.5 px-4 text-center text-emerald-300 bg-emerald-950/30">Average Overtime</th>
                <th className="py-3.5 px-4 text-right text-indigo-300 bg-indigo-950/20">Service (Jam & Rata²)</th>
                <th className="py-3.5 px-4 text-right text-amber-300 bg-amber-950/20">Bar (Jam & Rata²)</th>
                <th className="py-3.5 px-4 text-right text-emerald-300 bg-emerald-950/20">Kitchen (Jam & Rata²)</th>
                <th className="py-3.5 px-4 text-right text-emerald-300 bg-emerald-950/20">Budget OT (Rp)</th>
                <th className="py-3.5 px-4 text-right text-amber-300">Estimasi Biaya</th>
                <th className="py-3.5 px-4 text-right text-slate-300">Sisa / Varian</th>
                <th className="py-3.5 px-4 min-w-[200px]">Catatan / Status</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-slate-200">
              {combinedWeeks.map((w, idx) => {
                const hasDivNotes = w.divisionNotes && (w.divisionNotes.SERVICE || w.divisionNotes.BAR || w.divisionNotes.KITCHEN);
                return (
                  <tr key={w.week} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-4 px-4 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                    <td className="py-4 px-4">
                      <div className="font-black text-white text-xs">{w.weekLabel}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {w.startDate} s/d {w.endDate}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-black text-sm text-indigo-300 bg-indigo-950/10">
                      {w.totalStaff > 0 ? (
                        <div className="flex flex-col items-center">
                          <span>{w.totalStaff} Org</span>
                          {totalManpowerStaff > 0 && w.totalStaff === totalManpowerStaff && (
                            <span className="text-[8px] font-bold text-emerald-400 font-sans tracking-tight">
                              ✓ Sesuai MP
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 font-normal">0</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-black text-sm text-blue-300 bg-blue-950/10">
                      {w.totalOvertime > 0 ? `${w.totalOvertime} h` : <span className="text-slate-600 font-normal">0 h</span>}
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-black text-sm text-emerald-300 bg-emerald-950/10">
                      {w.averageOvertime > 0 ? (
                        <span className="px-2.5 py-1 bg-emerald-500/20 rounded-lg border border-emerald-500/30 text-emerald-300">
                          {w.averageOvertime} h/staff
                        </span>
                      ) : (
                        <span className="text-slate-600 font-normal">0 h</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-mono bg-indigo-950/10">
                      <div className="font-bold text-indigo-300">
                        {w.serviceHours ? `${w.serviceHours}h` : '0h'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono font-medium">
                        Avg: {manpowerSummary.serviceActual > 0 ? ((w.serviceHours || 0) / manpowerSummary.serviceActual).toFixed(1) : 0} h/stf
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono bg-amber-950/10">
                      <div className="font-bold text-amber-300">
                        {w.barHours ? `${w.barHours}h` : '0h'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono font-medium">
                        Avg: {manpowerSummary.barActual > 0 ? ((w.barHours || 0) / manpowerSummary.barActual).toFixed(1) : 0} h/stf
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono bg-emerald-950/10">
                      <div className="font-bold text-emerald-300">
                        {w.kitchenHours ? `${w.kitchenHours}h` : '0h'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono font-medium">
                        Avg: {manpowerSummary.kitchenActual > 0 ? ((w.kitchenHours || 0) / manpowerSummary.kitchenActual).toFixed(1) : 0} h/stf
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-bold text-emerald-300 bg-emerald-950/10">
                      {w.budgetOvertime ? `Rp ${w.budgetOvertime.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-bold text-amber-300">
                      {w.totalOvertimePay ? `Rp ${w.totalOvertimePay.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-xs">
                      {w.budgetOvertime ? (
                        <span className={`font-bold ${w.budgetOvertime - (w.totalOvertimePay || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          Rp {(w.budgetOvertime - (w.totalOvertimePay || 0)).toLocaleString('id-ID')}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-300 max-w-[240px]">
                      <div className="space-y-1">
                        {w.notes && (
                          <div className="text-[11px] text-slate-200 font-medium">
                            {w.notes}
                          </div>
                        )}
                        {hasDivNotes && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {w.divisionNotes?.SERVICE && (
                              <span className="text-[9px] bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-mono" title={`Service: ${w.divisionNotes.SERVICE}`}>
                                <strong>Svc:</strong> {w.divisionNotes.SERVICE}
                              </span>
                            )}
                            {w.divisionNotes?.BAR && (
                              <span className="text-[9px] bg-amber-950/80 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded font-mono" title={`Bar: ${w.divisionNotes.BAR}`}>
                                <strong>Bar:</strong> {w.divisionNotes.BAR}
                              </span>
                            )}
                            {w.divisionNotes?.KITCHEN && (
                              <span className="text-[9px] bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-mono" title={`Kitchen: ${w.divisionNotes.KITCHEN}`}>
                                <strong>Kit:</strong> {w.divisionNotes.KITCHEN}
                              </span>
                            )}
                          </div>
                        )}
                        {!w.notes && !hasDivNotes && (
                          w.isManual ? (
                            <span className="text-[10px] text-indigo-400 uppercase font-black tracking-wider">Input Manual</span>
                          ) : w.totalStaff > 0 ? (
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Auto Synced</span>
                          ) : (
                            <span className="text-slate-600 italic text-[10px]">Belum diinput</span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => openEditModal(w)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md mx-auto active:scale-95 cursor-pointer"
                      >
                        <i className="fas fa-edit text-[9px]"></i>
                        <span>Input / Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* FOOTER TOTAL ROW */}
            <tfoot>
              <tr className="bg-slate-950 text-white font-black text-xs border-t-2 border-indigo-500">
                <td colSpan={2} className="py-4 px-4 uppercase tracking-widest text-indigo-400">
                  TOTAL BULAN {monthName.toUpperCase()}
                </td>
                <td className="py-4 px-4 text-center font-mono text-sm text-indigo-300 bg-indigo-950/40">
                  <div className="flex flex-col items-center">
                    <span>{monthTotals.sumStaff} Org</span>
                    <span className="text-[8px] font-bold text-emerald-400 font-sans tracking-tight">
                      Sesuai Man Power
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-mono text-sm text-blue-300 bg-blue-950/40">
                  {monthTotals.sumOvertime} h
                </td>
                <td className="py-4 px-4 text-center font-mono text-sm text-emerald-300 bg-emerald-950/40">
                  {monthTotals.averageOvertime} h/staff
                </td>
                <td className="py-4 px-4 text-right font-mono text-indigo-300 bg-indigo-950/30">
                  <div className="font-bold">{monthTotals.sumService}h</div>
                  <div className="text-[9px] text-indigo-400 font-mono">
                    Avg: {monthTotals.serviceAverage} h/stf
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-mono text-amber-300 bg-amber-950/30">
                  <div className="font-bold">{monthTotals.sumBar}h</div>
                  <div className="text-[9px] text-amber-400 font-mono">
                    Avg: {monthTotals.barAverage} h/stf
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-mono text-emerald-300 bg-emerald-950/30">
                  <div className="font-bold">{monthTotals.sumKitchen}h</div>
                  <div className="text-[9px] text-emerald-400 font-mono">
                    Avg: {monthTotals.kitchenAverage} h/stf
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-mono text-emerald-300 bg-emerald-950/20">
                  Rp {monthTotals.sumWeeklyBudget.toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4 text-right font-mono text-sm text-amber-300">
                  Rp {monthTotals.sumPay.toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4 text-right font-mono text-xs">
                  {monthTotals.sumWeeklyBudget > 0 ? (
                    <span className={`font-bold ${monthTotals.sumWeeklyBudget - monthTotals.sumPay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      Rp {(monthTotals.sumWeeklyBudget - monthTotals.sumPay).toLocaleString('id-ID')}
                    </span>
                  ) : '-'}
                </td>
                <td colSpan={2} className="py-4 px-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  Rata-rata: {monthTotals.weeklyAverageOvertime} h/minggu
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="p-4 border-t border-white/5">
          <FeatureSubmitSyncButton
            featureName="Weekly Overtime"
            subtext="Sinkronkan data lembur mingguan ke server & perbarui tampilan seluruh pengguna secara realtime."
          />
        </div>
      </div>

      {/* MODAL INPUT / EDIT WEEKLY OVERTIME */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-5 md:p-7 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-5 relative"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-4 sticky top-0 bg-slate-900 z-10">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-edit text-indigo-400"></i>
                    Input Overtime - Week {formWeek}
                  </h3>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">
                    Periode: {formStartDate} s/d {formEndDate} ({monthName} {selectedYear}) • Outlet: <span className="text-indigo-300 font-bold">{selectedOutlet}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. TOTAL STAFF & TOTAL OVERTIME */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-indigo-300 uppercase tracking-wider">
                        1. Total Staff (Orang) *
                      </label>
                      {totalManpowerStaff > 0 && formTotalStaff === totalManpowerStaff && (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                          ✓ Sama dengan Man Power
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formTotalStaff || ''}
                      onChange={(e) => handleStaffChange(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="Contoh: 8"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-white font-mono font-black text-base focus:ring-2 ring-indigo-500 outline-none"
                    />
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
                      <span className="text-[9px] text-slate-400">
                        Man Power MP: <strong>{totalManpowerStaff}</strong> Staff
                      </span>
                      {totalManpowerStaff > 0 && formTotalStaff !== totalManpowerStaff && (
                        <button
                          type="button"
                          onClick={() => handleStaffChange(totalManpowerStaff)}
                          className="text-[9px] text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30 cursor-pointer"
                        >
                          <i className="fas fa-arrows-rotate text-[8px]"></i>
                          Samakan ke MP ({totalManpowerStaff})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-black text-blue-300 uppercase tracking-wider">
                        2. Total Overtime (Jam) *
                      </label>
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        ⚡ Auto Teralisasi
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formTotalOvertime || ''}
                      onChange={(e) => handleTotalOvertimeChange(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="Contoh: 32"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-white font-mono font-black text-base focus:ring-2 ring-blue-500 outline-none"
                    />
                    <span className="text-[9px] text-slate-400 mt-1 block">
                      Teralisasi otomatis dari Service ({formServiceHours}h) + Bar ({formBarHours}h) + Kitchen ({formKitchenHours}h) = <strong>{formTotalOvertime} Jam</strong>
                    </span>
                  </div>
                </div>

                {/* 3. AVERAGE OVERTIME OUTLET */}
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3 sm:p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-0.5">
                        3. Average Overtime Outlet (Jam / Staff)
                      </label>
                      <p className="text-[10px] text-slate-400">
                        Kalkulasi otomatis: <strong>{formTotalOvertime} Jam</strong> ÷ <strong>{formTotalStaff || 1} Staff</strong>
                      </p>
                    </div>
                    <div className="text-2xl font-mono font-black text-emerald-400">
                      {formAverageOvertime} <span className="text-xs text-emerald-300 font-normal">h/staff</span>
                    </div>
                  </div>
                </div>

                {/* REALISASI JAM LEMBUR PER DIVISI */}
                <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block flex items-center gap-1.5">
                      <i className="fas fa-clock text-indigo-400"></i>
                      Realisasi Jam Per Divisi (Week {formWeek}):
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      Total: {formTotalOvertime} Jam (Rp {formTotalPay.toLocaleString('id-ID')})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Service</label>
                        <span className="text-[8px] font-mono text-indigo-400">Rp {(formServiceHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={formServiceHours || ''}
                        onChange={(e) => handleServiceHoursChange(parseFloat(e.target.value) || 0)}
                        placeholder="0 Jam"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-white font-mono font-bold outline-none focus:ring-1 ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Bar</label>
                        <span className="text-[8px] font-mono text-amber-400">Rp {(formBarHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={formBarHours || ''}
                        onChange={(e) => handleBarHoursChange(parseFloat(e.target.value) || 0)}
                        placeholder="0 Jam"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-white font-mono font-bold outline-none focus:ring-1 ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Kitchen</label>
                        <span className="text-[8px] font-mono text-emerald-400">Rp {(formKitchenHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={formKitchenHours || ''}
                        onChange={(e) => handleKitchenHoursChange(parseFloat(e.target.value) || 0)}
                        placeholder="0 Jam"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-white font-mono font-bold outline-none focus:ring-1 ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* RATA-RATA OVERTIME MASING-MASING DIVISI (PENGGANTI ALOKASI TARGET) */}
                <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs bg-indigo-500/20 text-indigo-300">
                        <i className="fas fa-chart-pie"></i>
                      </span>
                      <div>
                        <span className="text-[11px] font-black text-white uppercase tracking-wider block">
                          Rata-rata Overtime Masing-masing Divisi (Week {formWeek})
                        </span>
                        <p className="text-[9px] text-slate-400">
                          Kalkulasi otomatis dari realisasi jam lembur per divisi dibagi jumlah staff man power masing-masing divisi
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      Rate: Rp {FIXED_OVERTIME_RATE.toLocaleString('id-ID')} / Jam
                    </span>
                  </div>

                  {/* 3 Divisi Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* SERVICE */}
                    <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 relative overflow-hidden">
                      <div className="flex justify-between items-center text-[10px] font-black text-indigo-300 uppercase mb-2">
                        <span className="flex items-center gap-1.5">
                          <i className="fas fa-concierge-bell text-xs"></i>
                          Service
                        </span>
                        <span className="bg-indigo-500/20 px-2 py-0.5 rounded text-[9px] text-indigo-200">
                          {manpowerSummary.serviceActual} Staff
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Realisasi Jam:</span>
                          <span className="font-mono font-bold text-white">{formServiceHours} Jam</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Rata² / Staff:</span>
                          <span className="font-mono font-black text-indigo-300 text-sm">
                            {manpowerSummary.serviceActual > 0 ? (formServiceHours / manpowerSummary.serviceActual).toFixed(2) : 0} h/stf
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400 pt-1 border-t border-white/5">
                          <span>Biaya Lembur:</span>
                          <span className="font-mono font-bold text-indigo-400 text-[11px]">
                            Rp {(formServiceHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* BAR */}
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 relative overflow-hidden">
                      <div className="flex justify-between items-center text-[10px] font-black text-amber-300 uppercase mb-2">
                        <span className="flex items-center gap-1.5">
                          <i className="fas fa-cocktail text-xs"></i>
                          Bar
                        </span>
                        <span className="bg-amber-500/20 px-2 py-0.5 rounded text-[9px] text-amber-200">
                          {manpowerSummary.barActual} Staff
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Realisasi Jam:</span>
                          <span className="font-mono font-bold text-white">{formBarHours} Jam</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Rata² / Staff:</span>
                          <span className="font-mono font-black text-amber-300 text-sm">
                            {manpowerSummary.barActual > 0 ? (formBarHours / manpowerSummary.barActual).toFixed(2) : 0} h/stf
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400 pt-1 border-t border-white/5">
                          <span>Biaya Lembur:</span>
                          <span className="font-mono font-bold text-amber-400 text-[11px]">
                            Rp {(formBarHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* KITCHEN */}
                    <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 relative overflow-hidden">
                      <div className="flex justify-between items-center text-[10px] font-black text-emerald-300 uppercase mb-2">
                        <span className="flex items-center gap-1.5">
                          <i className="fas fa-utensils text-xs"></i>
                          Kitchen
                        </span>
                        <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-[9px] text-emerald-200">
                          {manpowerSummary.kitchenActual} Staff
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Realisasi Jam:</span>
                          <span className="font-mono font-bold text-white">{formKitchenHours} Jam</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Rata² / Staff:</span>
                          <span className="font-mono font-black text-emerald-300 text-sm">
                            {manpowerSummary.kitchenActual > 0 ? (formKitchenHours / manpowerSummary.kitchenActual).toFixed(2) : 0} h/stf
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400 pt-1 border-t border-white/5">
                          <span>Biaya Lembur:</span>
                          <span className="font-mono font-bold text-emerald-400 text-[11px]">
                            Rp {(formKitchenHours * FIXED_OVERTIME_RATE).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/5 flex flex-wrap justify-between items-center gap-2 text-xs">
                    <div className="text-slate-300 font-bold flex items-center gap-2">
                      <span className="text-slate-500 text-[10px] uppercase">Ringkasan Week {formWeek}:</span>
                      <span className="text-blue-300 font-mono">{formTotalOvertime} Jam Total</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-indigo-300 font-mono">{formTotalStaff} Staff MP</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-[10px]">Rata² Outlet:</span>
                      <span className="font-mono font-black text-emerald-400 text-sm">
                        {formAverageOvertime} h/staff
                      </span>
                    </div>
                  </div>
                </div>

                {/* CATATAN PADA MASING-MASING DIVISI SETIAP WEEKLY (REQUESTED FEATURE) */}
                <div className="bg-slate-950/70 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="fas fa-clipboard-list text-indigo-400"></i>
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">
                      Catatan Lembur Per Divisi (Week {formWeek})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>
                        Catatan Service:
                      </label>
                      <input
                        type="text"
                        value={formServiceNotes}
                        onChange={(e) => setFormServiceNotes(e.target.value)}
                        placeholder="Contoh: Event wedding, briefing banquet"
                        className="w-full bg-slate-900 border border-indigo-500/30 rounded-xl p-2 text-white text-xs outline-none focus:ring-1 ring-indigo-500 placeholder:text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-amber-300 uppercase mb-1 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                        Catatan Bar:
                      </label>
                      <input
                        type="text"
                        value={formBarNotes}
                        onChange={(e) => setFormBarNotes(e.target.value)}
                        placeholder="Contoh: Restock beer & liquor, prep cocktail"
                        className="w-full bg-slate-900 border border-amber-500/30 rounded-xl p-2 text-white text-xs outline-none focus:ring-1 ring-amber-500 placeholder:text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-emerald-300 uppercase mb-1 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                        Catatan Kitchen:
                      </label>
                      <input
                        type="text"
                        value={formKitchenNotes}
                        onChange={(e) => setFormKitchenNotes(e.target.value)}
                        placeholder="Contoh: Deep cleaning freezer, stock opname"
                        className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl p-2 text-white text-xs outline-none focus:ring-1 ring-emerald-500 placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  {/* Catatan Umum Outlet */}
                  <div className="pt-2 border-t border-white/5">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                      Catatan / Keterangan Umum Week {formWeek}:
                    </label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Contoh: High season weekend, festival musik di area sekitar"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-white font-medium outline-none focus:ring-1 ring-indigo-500 placeholder:text-slate-600 text-xs"
                    />
                  </div>
                </div>

                {/* ESTIMASI BIAYA LEMBUR (RP) */}
                <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-300 uppercase">
                        Estimasi Biaya Lembur (Rp):
                      </label>
                      {formTotalOvertime > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormTotalPay(Math.round(formTotalOvertime * FIXED_OVERTIME_RATE))}
                          className="text-[9px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                        >
                          Hitung ({formTotalOvertime} Jam × Rp 15.000)
                        </button>
                      )}
                    </div>
                    <span className="text-[8px] text-slate-500 block">Rate fixed Rp 15.000 / Jam lembur</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={formTotalPay || ''}
                    onChange={(e) => setFormTotalPay(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="Contoh: 480000"
                    className="w-full sm:w-48 bg-slate-900 border border-amber-500/30 rounded-xl p-2 text-amber-300 font-mono font-black text-right outline-none focus:ring-1 ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10 sticky bottom-0 bg-slate-900 z-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-[10px] rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveWeek}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl shadow-lg shadow-indigo-900/30 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i>
                  Simpan Data Week {formWeek}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default WeeklyOvertimeInputModule;
