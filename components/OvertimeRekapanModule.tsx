import React, { useState, useMemo, useEffect } from 'react';
import { AppState, Outlet } from '../types';
import { MONTHS } from '../constants';
import { getExtraHoursFromNotes } from './OvertimeModule';
import ShareActions from './ShareActions';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, any>;
  filters: { startDate: string; month: number; year: number; outlet: string };
  selectedOutlet: string;
  division?: string;
  onUpdate?: (partial: Partial<AppState>) => void;
  showToast?: (msg: string, type?: string) => void;
}

const DAYS_INDONESIAN = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const OvertimeRekapanModule: React.FC<Props> = ({ data, allMonthlyData, filters, selectedOutlet, division = 'ALL', onUpdate, showToast }) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(filters.month ?? new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(filters.year ?? new Date().getFullYear());
  const [selectedDivision, setSelectedDivision] = useState<string>(division || 'ALL');

  // Budget Avg Overtime State (Hours per staff per cut-off)
  const [budgetAvgInput, setBudgetAvgInput] = useState<string>(() => {
    return String(data.budgetAvgOvertimeHours ?? 10);
  });

  useEffect(() => {
    if (data.budgetAvgOvertimeHours !== undefined) {
      setBudgetAvgInput(String(data.budgetAvgOvertimeHours));
    }
  }, [data.budgetAvgOvertimeHours]);

  const budgetAvgHours = useMemo(() => {
    const val = parseFloat(budgetAvgInput);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [budgetAvgInput]);

  const handleSaveBudgetAvg = (targetVal?: number) => {
    const valNum = targetVal !== undefined ? targetVal : budgetAvgHours;
    setBudgetAvgInput(String(valNum));
    if (onUpdate) {
      onUpdate({ budgetAvgOvertimeHours: valNum });
    }
    if (showToast) {
      showToast(`Budget Avg Overtime berhasil disimpan: ${valNum} Jam / Staff`, 'success');
    }
  };

  // Staff Search & Filter State for Budget Compliance Table
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [staffFilterMode, setStaffFilterMode] = useState<'ALL' | 'OVER_BUDGET' | 'WITHIN_BUDGET'>('ALL');

  // Helper for state lookup per month & year
  const getStateForMonth = (mIndex: number, yYear: number) => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      if (allMonthlyData?.[selectedOutlet]?.[mIndex.toString()]) {
        return allMonthlyData[selectedOutlet][mIndex.toString()];
      }
    }
    if (mIndex === filters.month && yYear === filters.year) {
      return data;
    }
    return allMonthlyData?.[mIndex.toString()] || {};
  };

  // Month indices and years for cut-off calculations (26th prev month to 25th current month)
  const currentMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const lastMonthIndex = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthPrefix = `${lastMonthYear}-${String(lastMonthIndex + 1).padStart(2, '0')}`;

  const twoMonthsAgoIndex = lastMonthIndex === 0 ? 11 : lastMonthIndex - 1;
  const twoMonthsAgoYear = lastMonthIndex === 0 ? lastMonthYear - 1 : lastMonthYear;
  const twoMonthsAgoPrefix = `${twoMonthsAgoYear}-${String(twoMonthsAgoIndex + 1).padStart(2, '0')}`;

  const daysInLastMonth = useMemo(() => {
    return new Date(lastMonthYear, lastMonthIndex + 1, 0).getDate();
  }, [lastMonthYear, lastMonthIndex]);

  const daysInTwoMonthsAgo = useMemo(() => {
    return new Date(twoMonthsAgoYear, twoMonthsAgoIndex + 1, 0).getDate();
  }, [twoMonthsAgoYear, twoMonthsAgoIndex]);

  // Helper to reliably find overtime entries for a given date from any available state source
  const getEntriesForDate = (dateStr: string, st: any) => {
    if (st?.dailyOvertime?.[dateStr] && Array.isArray(st.dailyOvertime[dateStr]) && st.dailyOvertime[dateStr].length > 0) {
      return st.dailyOvertime[dateStr];
    }
    if (data?.dailyOvertime?.[dateStr] && Array.isArray(data.dailyOvertime[dateStr]) && data.dailyOvertime[dateStr].length > 0) {
      return data.dailyOvertime[dateStr];
    }
    if (allMonthlyData) {
      if (selectedOutlet && selectedOutlet !== 'ALL' && allMonthlyData[selectedOutlet]) {
        for (const mKey of Object.keys(allMonthlyData[selectedOutlet])) {
          const mData = allMonthlyData[selectedOutlet][mKey];
          if (mData?.dailyOvertime?.[dateStr] && Array.isArray(mData.dailyOvertime[dateStr]) && mData.dailyOvertime[dateStr].length > 0) {
            return mData.dailyOvertime[dateStr];
          }
        }
      } else {
        for (const mKey of Object.keys(allMonthlyData)) {
          if (allMonthlyData[mKey]?.dailyOvertime?.[dateStr] && Array.isArray(allMonthlyData[mKey].dailyOvertime[dateStr]) && allMonthlyData[mKey].dailyOvertime[dateStr].length > 0) {
            return allMonthlyData[mKey].dailyOvertime[dateStr];
          }
        }
      }
    }
    return [];
  };

  // Helper to compute OT stats for a specific single date
  const getDayOTStats = (dateStr: string, st: any) => {
    const rawEntries: any[] = getEntriesForDate(dateStr, st);
    const entries = rawEntries.filter((e: any) => {
      if (selectedOutlet && selectedOutlet !== 'ALL') {
        if (e.outlet) {
          if (e.outlet !== selectedOutlet) return false;
        } else if (e.staffId && st?.staffList) {
          const staff = st.staffList.find((s: any) => s.staffId === e.staffId);
          if (staff && staff.outlet && staff.outlet !== selectedOutlet) {
            return false;
          }
        }
      }
      if (selectedDivision && selectedDivision !== 'ALL') {
        const staff = (st?.staffList || data?.staffList || []).find((s: any) => s.staffId === e.staffId);
        const div = (e.division || staff?.division || 'SERVICE').toUpperCase();
        if (div !== selectedDivision.toUpperCase()) {
          return false;
        }
      }
      return true;
    });

    let totalHours = 0;
    entries.forEach((e: any) => {
      const baseOT = Math.max(0, (e.totalHours || 0) - (e.breakTime || 0) - 8);
      const extraOT = getExtraHoursFromNotes(e.notes);
      const h = Math.max(e.overtimeHours || 0, baseOT + extraOT);
      totalHours += h;
    });
    const totalPay = totalHours * 15000;
    return { entries, staffCount: entries.length, totalHours, totalPay };
  };

  // Helper to compute OT stats for an array of date strings
  const getListOTStats = (dateList: string[]) => {
    let hours = 0;
    let pay = 0;
    let staffEntriesCount = 0;

    dateList.forEach((dateStr) => {
      const [yStr, mStr] = dateStr.split('-');
      const mIdx = parseInt(mStr, 10) - 1;
      const yYr = parseInt(yStr, 10);
      const st = getStateForMonth(mIdx, yYr);

      const stats = getDayOTStats(dateStr, st);
      hours += stats.totalHours;
      pay += stats.totalPay;
      staffEntriesCount += stats.staffCount;
    });

    return { totalHours: hours, totalPay: pay, staffEntriesCount };
  };

  // Current Cut-Off Dates (26 Last Month -> 25 Current Month)
  const currentCutoffDates = useMemo(() => {
    const dates: string[] = [];
    for (let d = 26; d <= daysInLastMonth; d++) {
      dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
    }
    for (let d = 1; d <= 25; d++) {
      dates.push(`${currentMonthPrefix}-${String(d).padStart(2, '0')}`);
    }
    return dates;
  }, [lastMonthPrefix, daysInLastMonth, currentMonthPrefix]);

  // Last Month Cut-Off Dates (26 Two Months Ago -> 25 Last Month)
  const lastCutoffDates = useMemo(() => {
    const dates: string[] = [];
    for (let d = 26; d <= daysInTwoMonthsAgo; d++) {
      dates.push(`${twoMonthsAgoPrefix}-${String(d).padStart(2, '0')}`);
    }
    for (let d = 1; d <= 25; d++) {
      dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
    }
    return dates;
  }, [twoMonthsAgoPrefix, daysInTwoMonthsAgo, lastMonthPrefix]);

  // MTD / Cut-Off Totals for Current Cut-Off & Last Cut-Off
  const currentMTDStats = useMemo(() => {
    return getListOTStats(currentCutoffDates);
  }, [currentCutoffDates, allMonthlyData, data, filters]);

  const lastMonthTotalStats = useMemo(() => {
    return getListOTStats(lastCutoffDates);
  }, [lastCutoffDates, allMonthlyData, data, filters]);

  // Efficiency Calculations vs Last Month Cut-off
  const efficiency = useMemo(() => {
    const savedHours = lastMonthTotalStats.totalHours - currentMTDStats.totalHours;
    const savedPay = lastMonthTotalStats.totalPay - currentMTDStats.totalPay;
    const hoursPct = lastMonthTotalStats.totalHours > 0
      ? (savedHours / lastMonthTotalStats.totalHours) * 100
      : 0;
    const payPct = lastMonthTotalStats.totalPay > 0
      ? (savedPay / lastMonthTotalStats.totalPay) * 100
      : 0;

    const isEfficient = savedPay >= 0;

    return { savedHours, savedPay, hoursPct, payPct, isEfficient };
  }, [currentMTDStats, lastMonthTotalStats]);

  // Weeks 1, 2, 3, 4 Comparison starting from 26th
  // Week 1: 26 Last Month - 1 Current Month
  // Week 2: 2 Current Month - 8 Current Month
  // Week 3: 9 Current Month - 15 Current Month
  // Week 4: 16 Current Month - 25 Current Month
  const weeklyComparisons = useMemo(() => {
    const getWeekCurrentDates = (wId: number) => {
      const dates: string[] = [];
      if (wId === 1) {
        for (let d = 26; d <= daysInLastMonth; d++) dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
        dates.push(`${currentMonthPrefix}-01`);
      } else if (wId === 2) {
        for (let d = 2; d <= 8; d++) dates.push(`${currentMonthPrefix}-${String(d).padStart(2, '0')}`);
      } else if (wId === 3) {
        for (let d = 9; d <= 15; d++) dates.push(`${currentMonthPrefix}-${String(d).padStart(2, '0')}`);
      } else if (wId === 4) {
        for (let d = 16; d <= 25; d++) dates.push(`${currentMonthPrefix}-${String(d).padStart(2, '0')}`);
      }
      return dates;
    };

    const getWeekLastDates = (wId: number) => {
      const dates: string[] = [];
      if (wId === 1) {
        for (let d = 26; d <= daysInTwoMonthsAgo; d++) dates.push(`${twoMonthsAgoPrefix}-${String(d).padStart(2, '0')}`);
        dates.push(`${lastMonthPrefix}-01`);
      } else if (wId === 2) {
        for (let d = 2; d <= 8; d++) dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
      } else if (wId === 3) {
        for (let d = 9; d <= 15; d++) dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
      } else if (wId === 4) {
        for (let d = 16; d <= 25; d++) dates.push(`${lastMonthPrefix}-${String(d).padStart(2, '0')}`);
      }
      return dates;
    };

    const weekDefinitions = [
      {
        id: 1,
        name: 'Week 1',
        label: `Tgl 26 (${MONTHS[lastMonthIndex].slice(0, 3)}) - Tgl 1 (${MONTHS[selectedMonth].slice(0, 3)})`,
      },
      {
        id: 2,
        name: 'Week 2',
        label: `Tgl 2 - Tgl 8 (${MONTHS[selectedMonth].slice(0, 3)})`,
      },
      {
        id: 3,
        name: 'Week 3',
        label: `Tgl 9 - Tgl 15 (${MONTHS[selectedMonth].slice(0, 3)})`,
      },
      {
        id: 4,
        name: 'Week 4',
        label: `Tgl 16 - Tgl 25 (${MONTHS[selectedMonth].slice(0, 3)})`,
      },
    ];

    return weekDefinitions.map((w) => {
      const curDates = getWeekCurrentDates(w.id);
      const lastDates = getWeekLastDates(w.id);

      const curStats = getListOTStats(curDates);
      const lastStats = getListOTStats(lastDates);

      const diffHours = curStats.totalHours - lastStats.totalHours;
      const diffPay = curStats.totalPay - lastStats.totalPay;
      const pctPay = lastStats.totalPay > 0 ? (diffPay / lastStats.totalPay) * 100 : 0;

      return {
        id: w.id,
        name: w.name,
        label: w.label,
        currentHours: curStats.totalHours,
        currentPay: curStats.totalPay,
        lastHours: lastStats.totalHours,
        lastPay: lastStats.totalPay,
        diffHours,
        diffPay,
        pctPay,
      };
    });
  }, [daysInLastMonth, daysInTwoMonthsAgo, lastMonthPrefix, currentMonthPrefix, twoMonthsAgoPrefix, lastMonthIndex, selectedMonth, allMonthlyData, data, filters]);

  // Active Staff List per outlet
  const currentOutletStaff = useMemo(() => {
    return (data.staffList || []).filter((s) => {
      if (selectedOutlet && selectedOutlet !== 'ALL' && s.outlet && s.outlet !== selectedOutlet) return false;
      if (selectedDivision && selectedDivision !== 'ALL') {
        const div = (s.division || 'SERVICE').toUpperCase();
        if (div !== selectedDivision.toUpperCase()) return false;
      }
      return s.status === 'ACTIVE' || !s.status;
    });
  }, [data.staffList, selectedOutlet, selectedDivision]);

  // Total staff grouped by division
  const divisionStaffCount = useMemo(() => {
    const map: Record<string, number> = {};
    currentOutletStaff.forEach((s) => {
      const div = (s.division || 'SERVICE').toUpperCase();
      map[div] = (map[div] || 0) + 1;
    });
    return map;
  }, [currentOutletStaff]);

  // Helper to compute Division Overtime Breakdown & Averages for an array of date strings
  const getDivisionOTStats = (dateList: string[]) => {
    const divMap: Record<string, { totalHours: number; totalPay: number; activeStaffIds: Set<string> }> = {};

    const defaultDivs = ['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER'];
    defaultDivs.forEach((div) => {
      divMap[div] = { totalHours: 0, totalPay: 0, activeStaffIds: new Set() };
    });

    dateList.forEach((dateStr) => {
      const [yStr, mStr] = dateStr.split('-');
      const mIdx = parseInt(mStr, 10) - 1;
      const yYr = parseInt(yStr, 10);
      const st = getStateForMonth(mIdx, yYr);

      const rawEntries: any[] = getEntriesForDate(dateStr, st);
      const entries = rawEntries.filter((e: any) => {
        if (selectedOutlet && selectedOutlet !== 'ALL') {
          if (e.outlet && e.outlet !== selectedOutlet) return false;
          if (e.staffId && st?.staffList) {
            const staff = st.staffList.find((s: any) => s.staffId === e.staffId);
            if (staff && staff.outlet && staff.outlet !== selectedOutlet) return false;
          }
        }
        return true;
      });

      entries.forEach((e: any) => {
        const staff = (st?.staffList || data.staffList || []).find((s: any) => s.staffId === e.staffId);
        const div = (e.division || staff?.division || 'SERVICE').toUpperCase();

        if (!divMap[div]) {
          divMap[div] = { totalHours: 0, totalPay: 0, activeStaffIds: new Set() };
        }

        const baseOT = Math.max(0, (e.totalHours || 0) - (e.breakTime || 0) - 8);
        const extraOT = getExtraHoursFromNotes(e.notes);
        const h = Math.max(e.overtimeHours || 0, baseOT + extraOT);
        const pay = h * 15000;

        divMap[div].totalHours += h;
        divMap[div].totalPay += pay;
        if (e.staffId) {
          divMap[div].activeStaffIds.add(e.staffId);
        }
      });
    });

    return Object.keys(divMap).map((div) => {
      const totalStaff = divisionStaffCount[div] || 0;
      const otStaffCount = divMap[div].activeStaffIds.size;
      const totalHours = divMap[div].totalHours;
      const totalPay = divMap[div].totalPay;

      const avgHoursPerStaff = totalStaff > 0 ? totalHours / totalStaff : 0;
      const avgPayPerStaff = totalStaff > 0 ? totalPay / totalStaff : 0;
      const avgHoursPerOTStaff = otStaffCount > 0 ? totalHours / otStaffCount : 0;

      return {
        division: div,
        totalStaff,
        otStaffCount,
        totalHours,
        totalPay,
        avgHoursPerStaff,
        avgPayPerStaff,
        avgHoursPerOTStaff,
      };
    });
  };

  const currentCutoffDivisionStats = useMemo(() => {
    return getDivisionOTStats(currentCutoffDates);
  }, [currentCutoffDates, divisionStaffCount, allMonthlyData, data, filters, selectedOutlet]);

  // Individual Staff Overtime Aggregation & Budget Evaluation
  const staffOvertimeReport = useMemo(() => {
    const staffMap: Record<string, {
      staffId: string;
      staffName: string;
      division: string;
      outlet: string;
      totalHours: number;
      totalPay: number;
      dates: string[];
    }> = {};

    currentCutoffDates.forEach((dateStr) => {
      const [yStr, mStr] = dateStr.split('-');
      const mIdx = parseInt(mStr, 10) - 1;
      const yYr = parseInt(yStr, 10);
      const st = getStateForMonth(mIdx, yYr);

      const rawEntries: any[] = getEntriesForDate(dateStr, st);
      const entries = rawEntries.filter((e: any) => {
        if (selectedOutlet && selectedOutlet !== 'ALL') {
          if (e.outlet && e.outlet !== selectedOutlet) return false;
          if (e.staffId && st?.staffList) {
            const staff = st.staffList.find((s: any) => s.staffId === e.staffId);
            if (staff && staff.outlet && staff.outlet !== selectedOutlet) return false;
          }
        }
        if (selectedDivision && selectedDivision !== 'ALL') {
          const staffObj = (st?.staffList || data.staffList || []).find((s: any) => s.staffId === e.staffId);
          const div = (e.division || staffObj?.division || 'SERVICE').toUpperCase();
          if (div !== selectedDivision.toUpperCase()) return false;
        }
        return true;
      });

      entries.forEach((e: any) => {
        const staffObj = (st?.staffList || data.staffList || []).find((s: any) => s.staffId === e.staffId);
        const staffId = e.staffId || e.staffName || 'UNKNOWN';
        const staffName = e.staffName || staffObj?.name || staffId;
        const division = (e.division || staffObj?.division || 'SERVICE').toUpperCase();
        const outlet = e.outlet || staffObj?.outlet || selectedOutlet || '-';

        const baseOT = Math.max(0, (e.totalHours || 0) - (e.breakTime || 0) - 8);
        const extraOT = getExtraHoursFromNotes(e.notes);
        const h = Math.max(e.overtimeHours || 0, baseOT + extraOT);
        const pay = h * 15000;

        if (!staffMap[staffId]) {
          staffMap[staffId] = {
            staffId,
            staffName,
            division,
            outlet,
            totalHours: 0,
            totalPay: 0,
            dates: [],
          };
        }

        staffMap[staffId].totalHours += h;
        staffMap[staffId].totalPay += pay;
        if (!staffMap[staffId].dates.includes(dateStr)) {
          staffMap[staffId].dates.push(dateStr);
        }
      });
    });

    return Object.values(staffMap);
  }, [currentCutoffDates, selectedOutlet, allMonthlyData, data]);

  const staffOvertimeWithBudget = useMemo(() => {
    return staffOvertimeReport.map((s) => {
      const isExceeded = s.totalHours > budgetAvgHours;
      const excessHours = Math.max(0, s.totalHours - budgetAvgHours);
      const excessPay = excessHours * 15000;
      return {
        ...s,
        isExceeded,
        excessHours,
        excessPay,
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [staffOvertimeReport, budgetAvgHours]);

  const exceededStaffList = useMemo(() => {
    return staffOvertimeWithBudget.filter((s) => s.isExceeded);
  }, [staffOvertimeWithBudget]);

  const totalExcessHours = useMemo(() => {
    return exceededStaffList.reduce((acc, s) => acc + s.excessHours, 0);
  }, [exceededStaffList]);

  const totalExcessPay = useMemo(() => {
    return exceededStaffList.reduce((acc, s) => acc + s.excessPay, 0);
  }, [exceededStaffList]);

  const filteredStaffList = useMemo(() => {
    return staffOvertimeWithBudget.filter((s) => {
      if (staffFilterMode === 'OVER_BUDGET' && !s.isExceeded) return false;
      if (staffFilterMode === 'WITHIN_BUDGET' && s.isExceeded) return false;
      if (staffSearchQuery.trim()) {
        const q = staffSearchQuery.toLowerCase();
        const matchName = s.staffName.toLowerCase().includes(q);
        const matchDiv = s.division.toLowerCase().includes(q);
        const matchId = s.staffId.toLowerCase().includes(q);
        return matchName || matchDiv || matchId;
      }
      return true;
    });
  }, [staffOvertimeWithBudget, staffFilterMode, staffSearchQuery]);

  // Custom Cut-Off Date Range Filter state
  const periodList = useMemo(() => {
    const list: {
      dateStr: string;
      dayLabel: string;
      dayName: string;
      isPrevMonth: boolean;
    }[] = [];

    for (let d = 26; d <= daysInLastMonth; d++) {
      const dateStr = `${lastMonthPrefix}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(lastMonthYear, lastMonthIndex, d);
      list.push({
        dateStr,
        dayLabel: `26 ${MONTHS[lastMonthIndex].slice(0, 3)} - ${d} ${MONTHS[lastMonthIndex].slice(0, 3)}`,
        dayName: DAYS_INDONESIAN[dayDate.getDay()],
        isPrevMonth: true,
      });
    }

    for (let d = 1; d <= 25; d++) {
      const dateStr = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(selectedYear, selectedMonth, d);
      list.push({
        dateStr,
        dayLabel: `${d} ${MONTHS[selectedMonth].slice(0, 3)}`,
        dayName: DAYS_INDONESIAN[dayDate.getDay()],
        isPrevMonth: false,
      });
    }

    return list;
  }, [lastMonthPrefix, daysInLastMonth, lastMonthYear, lastMonthIndex, currentMonthPrefix, selectedYear, selectedMonth]);

  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(periodList.length - 1);

  // Sync index boundaries if periodList changes
  const validStartIdx = Math.max(0, Math.min(startIndex, periodList.length - 1));
  const validEndIdx = Math.max(validStartIdx, Math.min(endIndex, periodList.length - 1));

  const filteredRangeStats = useMemo(() => {
    const selectedDatesList = periodList.slice(validStartIdx, validEndIdx + 1);
    const dateStrings = selectedDatesList.map((item) => item.dateStr);

    const curRange = getListOTStats(dateStrings);

    // Map last period corresponding dates
    const prevPeriodOffset = daysInTwoMonthsAgo - 26 + 1; // offset of prev month in periodList
    const lastDateStrings = selectedDatesList.map((item) => {
      if (item.isPrevMonth) {
        // Was from last month (26..31) -> mapped to two months ago (26..31)
        const d = parseInt(item.dateStr.split('-')[2], 10);
        return `${twoMonthsAgoPrefix}-${String(d).padStart(2, '0')}`;
      } else {
        // Was from current month (1..25) -> mapped to last month (1..25)
        const d = parseInt(item.dateStr.split('-')[2], 10);
        return `${lastMonthPrefix}-${String(d).padStart(2, '0')}`;
      }
    });

    const lastRange = getListOTStats(lastDateStrings);

    const dailyList = selectedDatesList.map((item) => {
      const [yStr, mStr] = item.dateStr.split('-');
      const mIdx = parseInt(mStr, 10) - 1;
      const yYr = parseInt(yStr, 10);
      const st = getStateForMonth(mIdx, yYr);
      const dayStats = getDayOTStats(item.dateStr, st);

      return {
        dateStr: item.dateStr,
        dayName: item.dayName,
        isPrevMonth: item.isPrevMonth,
        ...dayStats,
      };
    });

    return {
      curRange,
      lastRange,
      dailyList,
    };
  }, [periodList, validStartIdx, validEndIdx, twoMonthsAgoPrefix, lastMonthPrefix, allMonthlyData, data, filters]);

  return (
    <div className="space-y-8 animate-fade-in no-blur pb-20" id="overtime-rekapan-container">
      {/* Top Header & Filters */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden bg-slate-900/80 space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                <i className="fas fa-clock text-lg"></i>
              </div>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-500/20">
                OVERTIME ANALYTICS & EFFICIENCY
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight italic">
              REKAPAN OVERTIME ({selectedOutlet || 'ALL OUTLETS'})
            </h2>
            <p className="text-xs font-bold text-slate-400 mt-1">
              Rekapan lembur, efisiensi biaya dibanding bulan lalu, dan analisis per minggu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Division Picker */}
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:border-indigo-500 uppercase tracking-wider"
            >
              <option value="ALL">SEMUA DIVISI</option>
              <option value="SERVICE">SERVICE</option>
              <option value="BAR">BAR</option>
              <option value="KITCHEN">KITCHEN</option>
              <option value="STEWARD">STEWARD</option>
              <option value="STORE KEEPER">STORE KEEPER</option>
            </select>

            {/* Month Picker */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:border-indigo-500 uppercase tracking-wider"
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
              className="px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:border-indigo-500 uppercase tracking-wider"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <ShareActions targetId="overtime-rekapan-container" title={`Rekapan Overtime - ${MONTHS[selectedMonth]} ${selectedYear}`} />
          </div>
        </div>

        {/* INPUT BUDGET AVG OVERTIME CONTROL BAR */}
        <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-2xl border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <i className="fas fa-sliders-h text-sm"></i>
            </div>
            <div>
              <span className="text-[10px] font-black text-purple-300 uppercase tracking-wider block">
                INPUT BUDGET AVG OVERTIME PER CREW
              </span>
              <p className="text-[11px] font-bold text-slate-400">
                Target batas rata-rata jam lembur per staff dalam 1 periode cut-off (26 - 25).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-purple-500">
              <input
                type="number"
                step="0.5"
                min="0"
                value={budgetAvgInput}
                onChange={(e) => setBudgetAvgInput(e.target.value)}
                className="w-20 bg-transparent text-sm font-black text-white outline-none text-right pr-1"
              />
              <span className="text-xs font-bold text-slate-400 uppercase">Jam/Staff</span>
            </div>

            {/* Preset Buttons */}
            <div className="flex items-center gap-1">
              {[8, 10, 12, 15, 20].map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleSaveBudgetAvg(preset)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                    budgetAvgHours === preset
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-900 text-slate-400 border border-white/10 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {preset}h
                </button>
              ))}
            </div>

            <button
              onClick={() => handleSaveBudgetAvg()}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 shrink-0 flex items-center gap-2"
            >
              <i className="fas fa-save"></i> Simpan
            </button>
          </div>
        </div>
      </div>

      {/* WARNING ALERT BANNER IF ANY STAFF EXCEEDS BUDGET */}
      {exceededStaffList.length > 0 ? (
        <div className="glass-card p-6 rounded-3xl border border-rose-500/50 bg-rose-950/40 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-bl-full pointer-events-none"></div>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start md:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-600/30 border border-rose-500/60 flex items-center justify-center text-rose-400 text-xl shrink-0 animate-pulse">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-rose-600 text-white px-2.5 py-0.5 rounded">
                    PERINGATAN OVER BUDGET STAFF
                  </span>
                  <span className="text-xs font-bold text-rose-200">
                    Batas Target: {budgetAvgHours} Jam / Staff
                  </span>
                </div>
                <h3 className="text-lg md:text-xl font-black text-white mt-1 uppercase tracking-tight">
                  {exceededStaffList.length} STAFF SUDAH MELEBIHI BUDGET AVERAGE OVERTIME!
                </h3>
                <p className="text-xs text-rose-200 mt-1 font-medium">
                  Total kelebihan jam lembur: <strong className="text-white font-black">{totalExcessHours.toFixed(1)} Jam</strong> (Pembengkakan Biaya: <strong className="text-emerald-300 font-black">Rp {totalExcessPay.toLocaleString('id-ID')}</strong>)
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('staff-budget-report-table');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 shrink-0 flex items-center gap-2"
            >
              <i className="fas fa-list-check"></i> Lihat Laporan Staff Over Budget
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card p-4 md:p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 text-white shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">
              <i className="fas fa-shield-check"></i>
            </div>
            <div>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                STATUS COMPLIANCE BUDGET OVERTIME
              </span>
              <h4 className="text-sm font-black text-white uppercase">
                Semua Staff Dalam Batas Target ({budgetAvgHours} Jam/Staff)
              </h4>
            </div>
          </div>
          <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30 uppercase">
            0 Staff Over Budget
          </span>
        </div>
      )}

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {/* Card 1: Total Overtime Cut-Off Bulan Ini */}
        <div className="glass-card p-5 rounded-2xl border border-blue-500/20 bg-slate-900/60 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-full pointer-events-none"></div>
          <div className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">
            TOTAL OVERTIME (BULAN INI)
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {currentMTDStats.totalHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">Jam</span>
          </div>
          <div className="text-sm font-black text-emerald-400 mt-1">
            Rp {currentMTDStats.totalPay.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span>26 {MONTHS[lastMonthIndex].slice(0, 3)} - 25 {MONTHS[selectedMonth].slice(0, 3)}</span>
            <span className="text-blue-400 font-black">{currentMTDStats.staffEntriesCount} Transaksi</span>
          </div>
        </div>

        {/* Card 2: Total Overtime Cut-Off Bulan Lalu */}
        <div className="glass-card p-5 rounded-2xl border border-white/10 bg-slate-900/60 shadow-xl relative overflow-hidden">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
            TOTAL OVERTIME (BULAN LALU)
          </div>
          <div className="text-2xl font-black text-slate-200 tracking-tight">
            {lastMonthTotalStats.totalHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">Jam</span>
          </div>
          <div className="text-sm font-black text-slate-300 mt-1">
            Rp {lastMonthTotalStats.totalPay.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span>26 {MONTHS[twoMonthsAgoIndex].slice(0, 3)} - 25 {MONTHS[lastMonthIndex].slice(0, 3)}</span>
            <span className="text-slate-300 font-black">{lastMonthTotalStats.staffEntriesCount} Transaksi</span>
          </div>
        </div>

        {/* Card 3: Efisiensi Jam Overtime */}
        <div className={`glass-card p-5 rounded-2xl border shadow-xl relative overflow-hidden ${
          efficiency.isEfficient ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${
              efficiency.isEfficient ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              EFISIENSI JAM
            </span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
              efficiency.isEfficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {efficiency.isEfficient ? 'HEMAT' : 'OVER'}
            </span>
          </div>
          <div className={`text-2xl font-black tracking-tight ${
            efficiency.savedHours >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {efficiency.savedHours >= 0 ? `+${efficiency.savedHours.toFixed(1)}` : efficiency.savedHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">Jam</span>
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-2">
            {efficiency.hoursPct >= 0 ? `Hemat ${efficiency.hoursPct.toFixed(1)}% jam` : `Naik ${Math.abs(efficiency.hoursPct).toFixed(1)}% jam`} vs cut-off lalu
          </div>
        </div>

        {/* Card 4: Efisiensi Biaya Overtime */}
        <div className={`glass-card p-5 rounded-2xl border shadow-xl relative overflow-hidden ${
          efficiency.isEfficient ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${
              efficiency.isEfficient ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              EFISIENSI BIAYA
            </span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
              efficiency.isEfficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {efficiency.isEfficient ? 'HEMAT' : 'OVER'}
            </span>
          </div>
          <div className={`text-lg font-black tracking-tight ${
            efficiency.savedPay >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {efficiency.savedPay >= 0 ? `+Rp ${efficiency.savedPay.toLocaleString('id-ID')}` : `-Rp ${Math.abs(efficiency.savedPay).toLocaleString('id-ID')}`}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-2">
            {efficiency.payPct >= 0 ? `Hemat ${efficiency.payPct.toFixed(1)}% biaya` : `Bengkak ${Math.abs(efficiency.payPct).toFixed(1)}% biaya`}
          </div>
        </div>

        {/* Card 5: Budget Avg Overtime & Exceeded Staff Status */}
        <div className={`glass-card p-5 rounded-2xl border shadow-xl relative overflow-hidden ${
          exceededStaffList.length > 0 ? 'border-rose-500/40 bg-rose-950/30' : 'border-purple-500/30 bg-purple-950/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-purple-300 uppercase tracking-[0.2em]">
              BUDGET AVG / CREW
            </span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
              exceededStaffList.length > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              {exceededStaffList.length > 0 ? `${exceededStaffList.length} STAFF OVER` : 'OK'}
            </span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {budgetAvgHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">Jam/Staff</span>
          </div>
          <div className="text-xs font-bold mt-2">
            {exceededStaffList.length > 0 ? (
              <span className="text-rose-400 font-black">
                Over Cost: +Rp {totalExcessPay.toLocaleString('id-ID')}
              </span>
            ) : (
              <span className="text-emerald-400 font-bold">
                Semua staff aman &lt;= {budgetAvgHours}h
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Week 1, 2, 3, 4 Comparison Table */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-chart-line text-indigo-400"></i>
              WEEKLY OVERTIME COMPARISON (CUT-OFF 26 - 25)
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Perbandingan Minggu 1 (Tgl 26-1), W2 (2-8), W3 (9-15), dan W4 (16-25) vs cut-off bulan sebelumnya.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">Minggu Ke-</th>
                <th className="p-4">Rentang Tanggal Cut-off</th>
                <th className="p-4 text-center">Cut-Off Ini (Jam)</th>
                <th className="p-4 text-right">Cut-Off Ini (Rp)</th>
                <th className="p-4 text-center">Cut-Off Lalu (Jam)</th>
                <th className="p-4 text-right">Cut-Off Lalu (Rp)</th>
                <th className="p-4 text-center">Selisih Jam</th>
                <th className="p-4 text-right">Efisiensi Biaya (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {weeklyComparisons.map((w) => {
                const isSave = w.diffPay <= 0;
                return (
                  <tr key={w.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-black text-white">{w.name}</td>
                    <td className="p-4 text-slate-400 text-[11px]">{w.label}</td>
                    <td className="p-4 text-center font-black text-blue-400">{w.currentHours.toFixed(1)}h</td>
                    <td className="p-4 text-right font-black text-emerald-400">Rp {w.currentPay.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-center font-bold text-slate-400">{w.lastHours.toFixed(1)}h</td>
                    <td className="p-4 text-right font-bold text-slate-400">Rp {w.lastPay.toLocaleString('id-ID')}</td>
                    <td className={`p-4 text-center font-black ${w.diffHours <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {w.diffHours <= 0 ? `${w.diffHours.toFixed(1)}h` : `+${w.diffHours.toFixed(1)}h`}
                    </td>
                    <td className={`p-4 text-right font-black ${isSave ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isSave ? `+Rp ${Math.abs(w.diffPay).toLocaleString('id-ID')}` : `-Rp ${Math.abs(w.diffPay).toLocaleString('id-ID')}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/10 bg-slate-950/80 text-xs font-black">
                <td colSpan={2} className="p-4 text-white uppercase tracking-wider">TOTAL OVERTIME CUT-OFF (26 - 25)</td>
                <td className="p-4 text-center text-blue-400">{currentMTDStats.totalHours.toFixed(1)}h</td>
                <td className="p-4 text-right text-emerald-400">Rp {currentMTDStats.totalPay.toLocaleString('id-ID')}</td>
                <td className="p-4 text-center text-slate-400">{lastMonthTotalStats.totalHours.toFixed(1)}h</td>
                <td className="p-4 text-right text-slate-400">Rp {lastMonthTotalStats.totalPay.toLocaleString('id-ID')}</td>
                <td className={`p-4 text-center ${efficiency.savedHours >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {efficiency.savedHours >= 0 ? `-${efficiency.savedHours.toFixed(1)}h` : `+${Math.abs(efficiency.savedHours).toFixed(1)}h`}
                </td>
                <td className={`p-4 text-right ${efficiency.savedPay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {efficiency.savedPay >= 0 ? `+Rp ${efficiency.savedPay.toLocaleString('id-ID')}` : `-Rp ${Math.abs(efficiency.savedPay).toLocaleString('id-ID')}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Average Overtime per Division Section */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-users-gear text-purple-400"></i>
              RATA-RATA OVERTIME PER DIVISI (SESUAI JUMLAH STAFF)
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Analisis rata-rata jam lembur dan efisiensi biaya per staff berdasarkan masing-masing divisi (Cut-Off 26 {MONTHS[lastMonthIndex].slice(0, 3)} - 25 {MONTHS[selectedMonth].slice(0, 3)}).
            </p>
          </div>
          <div className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Total {currentOutletStaff.length} Staff Active
          </div>
        </div>

        {/* Division Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentCutoffDivisionStats.map((item) => {
            const isService = item.division === 'SERVICE';
            const isKitchen = item.division === 'KITCHEN';
            const isBar = item.division === 'BAR';

            const badgeColor = isService
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              : isKitchen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              : isBar
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

            return (
              <div key={item.division} className="bg-slate-950/70 p-5 rounded-2xl border border-white/10 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${badgeColor}`}>
                    {item.division}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {item.totalStaff} Staff
                  </span>
                </div>

                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    RATA-RATA JAM / STAFF
                  </div>
                  <div className="text-2xl font-black text-white mt-0.5">
                    {item.avgHoursPerStaff.toFixed(1)} <span className="text-xs text-slate-400 font-bold">Jam/Staff</span>
                  </div>
                  <div className="text-[10px] font-bold text-indigo-400 mt-1">
                    Rp {Math.round(item.avgPayPerStaff).toLocaleString('id-ID')} / Staff
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-500 block font-bold">Total OT:</span>
                    <span className="font-black text-blue-400">{item.totalHours.toFixed(1)} Jam</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-bold">OT Staff:</span>
                    <span className="font-black text-purple-300">{item.otStaffCount} Staff Active</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Division Detailed Breakdown Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">Divisi</th>
                <th className="p-4 text-center">Jumlah Staff (Divisi)</th>
                <th className="p-4 text-center">Staff OT (Active)</th>
                <th className="p-4 text-center">Total Jam Lembur</th>
                <th className="p-4 text-right">Total Biaya Lembur</th>
                <th className="p-4 text-center bg-purple-950/30 text-purple-300">Rata-Rata Jam / Total Staff</th>
                <th className="p-4 text-right bg-purple-950/30 text-purple-300">Rata-Rata Biaya / Total Staff</th>
                <th className="p-4 text-center">Rata-Rata Jam / Staff OT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {currentCutoffDivisionStats.map((item) => (
                <tr key={item.division} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-black text-white">{item.division}</td>
                  <td className="p-4 text-center text-slate-300">{item.totalStaff} Staff</td>
                  <td className="p-4 text-center text-purple-300">{item.otStaffCount} Staff</td>
                  <td className="p-4 text-center font-black text-blue-400">{item.totalHours.toFixed(1)}h</td>
                  <td className="p-4 text-right font-black text-emerald-400">Rp {item.totalPay.toLocaleString('id-ID')}</td>
                  <td className="p-4 text-center font-black text-purple-300 bg-purple-950/20">
                    {item.avgHoursPerStaff.toFixed(1)} Jam
                  </td>
                  <td className="p-4 text-right font-black text-purple-300 bg-purple-950/20">
                    Rp {Math.round(item.avgPayPerStaff).toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center font-bold text-slate-400">
                    {item.avgHoursPerOTStaff.toFixed(1)} Jam
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(() => {
                const totalStaff = currentCutoffDivisionStats.reduce((acc, curr) => acc + curr.totalStaff, 0);
                const otStaff = currentCutoffDivisionStats.reduce((acc, curr) => acc + curr.otStaffCount, 0);
                const totalHours = currentCutoffDivisionStats.reduce((acc, curr) => acc + curr.totalHours, 0);
                const totalPay = currentCutoffDivisionStats.reduce((acc, curr) => acc + curr.totalPay, 0);
                const avgHours = totalStaff > 0 ? totalHours / totalStaff : 0;
                const avgPay = totalStaff > 0 ? totalPay / totalStaff : 0;
                const avgOtHours = otStaff > 0 ? totalHours / otStaff : 0;

                return (
                  <tr className="border-t-2 border-white/10 bg-slate-950/80 text-xs font-black">
                    <td className="p-4 text-white uppercase tracking-wider">TOTAL ALL DIVISI</td>
                    <td className="p-4 text-center text-slate-200">{totalStaff} Staff</td>
                    <td className="p-4 text-center text-purple-300">{otStaff} Staff</td>
                    <td className="p-4 text-center text-blue-400">{totalHours.toFixed(1)}h</td>
                    <td className="p-4 text-right text-emerald-400">Rp {totalPay.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-center text-purple-300 bg-purple-950/40 font-black">{avgHours.toFixed(1)} Jam</td>
                    <td className="p-4 text-right text-purple-300 bg-purple-950/40 font-black">Rp {Math.round(avgPay).toLocaleString('id-ID')}</td>
                    <td className="p-4 text-center text-slate-300">{avgOtHours.toFixed(1)} Jam</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Staff Budget Compliance Report Table Section */}
      <div id="staff-budget-report-table" className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                STAFF OVERTIME COMPLIANCE REPORT
              </span>
              <span className="text-xs font-bold text-slate-400">
                Target: {budgetAvgHours} Jam / Staff
              </span>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-user-clock text-purple-400"></i>
              REKAPAN OVERTIME PER STAFF & DETEKSI OVER BUDGET
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Laporan total akumulasi jam lembur per individu staff pada periode cut-off (26 {MONTHS[lastMonthIndex].slice(0, 3)} - 25 {MONTHS[selectedMonth].slice(0, 3)}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                value={staffSearchQuery}
                onChange={(e) => setStaffSearchQuery(e.target.value)}
                placeholder="Cari nama staff / divisi..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:border-purple-500 placeholder:text-slate-600"
              />
              {staffSearchQuery && (
                <button
                  onClick={() => setStaffSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/10 text-[10px] font-black uppercase">
              <button
                onClick={() => setStaffFilterMode('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  staffFilterMode === 'ALL'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua ({staffOvertimeWithBudget.length})
              </button>
              <button
                onClick={() => setStaffFilterMode('OVER_BUDGET')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  staffFilterMode === 'OVER_BUDGET'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                Over Budget ({exceededStaffList.length})
              </button>
              <button
                onClick={() => setStaffFilterMode('WITHIN_BUDGET')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  staffFilterMode === 'WITHIN_BUDGET'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                Aman ({staffOvertimeWithBudget.length - exceededStaffList.length})
              </button>
            </div>
          </div>
        </div>

        {/* Stats Mini Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TOTAL STAFF LEMBUR</span>
            <div className="text-xl font-black text-white mt-1">
              {staffOvertimeWithBudget.length} <span className="text-xs font-bold text-slate-400">Staff</span>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${
            exceededStaffList.length > 0 ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' : 'bg-slate-950/60 border-white/5'
          }`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">STAFF OVER BUDGET</span>
            <div className={`text-xl font-black mt-1 ${exceededStaffList.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {exceededStaffList.length} <span className="text-xs font-bold text-slate-400">Staff</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TOTAL KELEBIHAN JAM</span>
            <div className="text-xl font-black text-rose-400 mt-1">
              +{totalExcessHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">Jam</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PEMBENGKAKAN BIAYA (OVER)</span>
            <div className="text-xl font-black text-emerald-400 mt-1">
              +Rp {totalExcessPay.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">No</th>
                <th className="p-4">Nama Staff</th>
                <th className="p-4 text-center">Divisi</th>
                <th className="p-4 text-center">Outlet</th>
                <th className="p-4 text-center">Total Jam Lembur</th>
                <th className="p-4 text-center">Target Budget</th>
                <th className="p-4 text-center">Status Budget</th>
                <th className="p-4 text-center">Kelebihan Jam</th>
                <th className="p-4 text-right">Pembengkakan Biaya</th>
                <th className="p-4 text-right">Total Biaya OT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {filteredStaffList.length > 0 ? (
                filteredStaffList.map((s, idx) => (
                  <tr
                    key={s.staffId || idx}
                    className={`transition-colors ${
                      s.isExceeded
                        ? 'bg-rose-950/30 hover:bg-rose-950/50 border-l-4 border-l-rose-500'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <td className="p-4 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                    <td className="p-4">
                      <div className="font-black text-white">{s.staffName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {s.staffId}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-slate-300 border border-white/10 uppercase">
                        {s.division}
                      </span>
                    </td>
                    <td className="p-4 text-center text-slate-400 text-[11px] uppercase">
                      {s.outlet}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-sm font-black ${s.isExceeded ? 'text-rose-400' : 'text-blue-400'}`}>
                        {s.totalHours.toFixed(1)} Jam
                      </span>
                    </td>
                    <td className="p-4 text-center text-slate-400 font-bold">
                      {budgetAvgHours} Jam
                    </td>
                    <td className="p-4 text-center">
                      {s.isExceeded ? (
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-rose-600 text-white uppercase tracking-wider animate-pulse flex items-center justify-center gap-1 mx-auto w-fit">
                          <i className="fas fa-exclamation-circle"></i> OVER BUDGET
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider flex items-center justify-center gap-1 mx-auto w-fit">
                          <i className="fas fa-check-circle"></i> AMAN
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center font-black">
                      {s.isExceeded ? (
                        <span className="text-rose-400">+{s.excessHours.toFixed(1)} Jam</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-black">
                      {s.isExceeded ? (
                        <span className="text-rose-400">+Rp {s.excessPay.toLocaleString('id-ID')}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-black text-emerald-400">
                      Rp {s.totalPay.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 font-bold">
                    <i className="fas fa-search text-2xl mb-2 block"></i>
                    Tidak ada staff yang sesuai dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {(() => {
                const totalHoursSum = filteredStaffList.reduce((acc, s) => acc + s.totalHours, 0);
                const totalPaySum = filteredStaffList.reduce((acc, s) => acc + s.totalPay, 0);
                const totalExcessHoursSum = filteredStaffList.reduce((acc, s) => acc + s.excessHours, 0);
                const totalExcessPaySum = filteredStaffList.reduce((acc, s) => acc + s.excessPay, 0);

                return (
                  <tr className="border-t-2 border-white/20 bg-slate-950/80 font-black text-white text-xs">
                    <td colSpan={4} className="p-4 uppercase tracking-wider text-purple-300">
                      TOTAL ({filteredStaffList.length} STAFF)
                    </td>
                    <td className="p-4 text-center text-blue-400 font-black">{totalHoursSum.toFixed(1)} Jam</td>
                    <td className="p-4 text-center text-slate-500">-</td>
                    <td className="p-4 text-center text-rose-400">
                      {exceededStaffList.length} Over
                    </td>
                    <td className="p-4 text-center text-rose-400">+{totalExcessHoursSum.toFixed(1)} Jam</td>
                    <td className="p-4 text-right text-rose-400">+Rp {totalExcessPaySum.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-right text-emerald-400 font-black">Rp {totalPaySum.toLocaleString('id-ID')}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Date Range Custom Filter Section (26 Cut-Off Range) */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
              <i className="fas fa-filter text-amber-400"></i>
              FILTER DETAIL RENTANG TANGGAL CUT-OFF
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Pilih rentang tanggal cut-off (26 {MONTHS[lastMonthIndex].slice(0,3)} - 25 {MONTHS[selectedMonth].slice(0,3)}) untuk melihat rincian harian.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-950 p-2 rounded-2xl border border-white/10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider pl-2">Dari:</span>
            <select
              value={validStartIdx}
              onChange={(e) => setStartIndex(Number(e.target.value))}
              className="bg-slate-900 text-xs font-black text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-indigo-400"
            >
              {periodList.map((item, idx) => (
                <option key={idx} value={idx}>
                  {item.dayLabel} ({item.dayName})
                </option>
              ))}
            </select>

            <span className="text-xs font-bold text-amber-400">S/D</span>

            <select
              value={validEndIdx}
              onChange={(e) => setEndIndex(Number(e.target.value))}
              className="bg-slate-900 text-xs font-black text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-indigo-400"
            >
              {periodList.map((item, idx) => (
                <option key={idx} value={idx}>
                  {item.dayLabel} ({item.dayName})
                </option>
              ))}
            </select>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              <button
                onClick={() => {
                  setStartIndex(0);
                  setEndIndex(daysInLastMonth - 26 + 1); // 26th to 1st
                }}
                className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[9px] font-black rounded uppercase transition-all"
              >
                W1 (26 - 1)
              </button>
              <button
                onClick={() => {
                  const offset = daysInLastMonth - 26 + 1;
                  setStartIndex(offset + 1); // 2nd
                  setEndIndex(offset + 7); // 8th
                }}
                className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[9px] font-black rounded uppercase transition-all"
              >
                W2 (2 - 8)
              </button>
              <button
                onClick={() => {
                  const offset = daysInLastMonth - 26 + 1;
                  setStartIndex(offset + 8); // 9th
                  setEndIndex(offset + 14); // 15th
                }}
                className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 text-[9px] font-black rounded uppercase transition-all"
              >
                W3 (9 - 15)
              </button>
              <button
                onClick={() => {
                  const offset = daysInLastMonth - 26 + 1;
                  setStartIndex(offset + 15); // 16th
                  setEndIndex(periodList.length - 1); // 25th
                }}
                className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 text-[9px] font-black rounded uppercase transition-all"
              >
                W4 (16 - 25)
              </button>
              <button
                onClick={() => {
                  setStartIndex(0);
                  setEndIndex(periodList.length - 1);
                }}
                className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[9px] font-black rounded uppercase transition-all"
              >
                Full Cut-Off
              </button>
            </div>
          </div>
        </div>

        {/* Selected Range Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/60 p-5 rounded-2xl border border-white/5">
          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              TOTAL JAM OVERTIME ({periodList[validStartIdx]?.dayLabel || ''} - {periodList[validEndIdx]?.dayLabel || ''})
            </div>
            <div className="text-xl font-black text-blue-400 mt-1">
              {filteredRangeStats.curRange.totalHours.toFixed(1)} Jam
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              Cut-off Lalu periode sama: {filteredRangeStats.lastRange.totalHours.toFixed(1)} Jam
            </div>
          </div>

          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              TOTAL BIAYA OVERTIME
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1">
              Rp {filteredRangeStats.curRange.totalPay.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              Cut-off Lalu periode sama: Rp {filteredRangeStats.lastRange.totalPay.toLocaleString('id-ID')}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              TOTAL TRANSAKSI STAFF
            </div>
            <div className="text-xl font-black text-purple-400 mt-1">
              {filteredRangeStats.curRange.staffEntriesCount} Staff Active
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              Rata-rata: {(filteredRangeStats.curRange.totalHours / (filteredRangeStats.curRange.staffEntriesCount || 1)).toFixed(1)} Jam/Staff
            </div>
          </div>
        </div>

        {/* Daily Breakdown Table for the Filtered Date Range */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">Tanggal</th>
                <th className="p-4">Hari</th>
                <th className="p-4 text-center">Jumlah Staff Active</th>
                <th className="p-4 text-center">Total Overtime (Jam)</th>
                <th className="p-4 text-right">Total Biaya (Rp)</th>
                <th className="p-4">Catatan / Rincian Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {filteredRangeStats.dailyList.map((day) => (
                <tr key={day.dateStr} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-black text-white">{day.dateStr}</td>
                  <td className="p-4 text-slate-400">{day.dayName}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                      day.staffCount > 0 ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {day.staffCount} Staff
                    </span>
                  </td>
                  <td className="p-4 text-center font-black text-blue-400">
                    {day.totalHours > 0 ? `${day.totalHours.toFixed(1)}h` : '-'}
                  </td>
                  <td className="p-4 text-right font-black text-emerald-400">
                    {day.totalPay > 0 ? `Rp ${day.totalPay.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-4 text-[10px] text-slate-300 max-w-xs truncate">
                    {day.entries.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {day.entries.map((e: any, idx: number) => (
                          <span key={idx} className="bg-slate-950 px-2 py-0.5 rounded border border-white/10 text-[9px] text-slate-300">
                            {e.staffName || e.staffId}: {e.overtimeHours?.toFixed(1)}h {e.notes ? `(${e.notes})` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-600 italic">Tidak ada lembur</span>
                    )}
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

export default OvertimeRekapanModule;
