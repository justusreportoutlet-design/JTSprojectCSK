import React, { useState, useMemo } from 'react';
import { AppState, Outlet, OvertimeEntry, WeeklyOvertimeEntry } from '../types';
import { 
  OUTLETS, 
  REGIONAL_AREAS, 
  MONTHS,
  getStoredOtBudgetSettings,
  saveStoredOtBudgetSettings,
  getStoredDivisionNotes,
  saveStoredDivisionNotes,
  DivisionNotes,
  getActiveOutletNames,
  getActiveRegionalAreas
} from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { createDefaultManpowerData, calculateManpowerSummary, extractOutletManpowerMap, resolveOutletManpowerData } from '../lib/manpowerUtils';

interface Props {
  allOutletsData: Record<string, any>;
  globalData?: AppState;
  selectedMonth: number; // 0..11
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export type OvertimeDivision = 'ALL' | 'BAR' | 'KITCHEN' | 'SERVICE' | 'STORE KEEPER';
export type OvertimeViewMode = 'WEEKLY_TABLE' | 'DIVISION_BREAKDOWN' | 'COMPARE_LAST_MONTH' | 'CREW_DETAIL';

export const RegionalWeeklyOvertimeRecapTable: React.FC<Props> = ({
  allOutletsData,
  globalData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [activeDivision, setActiveDivision] = useState<OvertimeDivision>('ALL');
  const [viewMode, setViewMode] = useState<OvertimeViewMode>('WEEKLY_TABLE');
  const [localArea, setLocalArea] = useState<string>(selectedArea || 'ALL');
  const [localOutlet, setLocalOutlet] = useState<string>(selectedOutlet || '');
  const [selectedOutletForModal, setSelectedOutletForModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Overtime Budget Settings State
  const [otSettings, setOtSettings] = useState<{ budgetHours: number; ratePerHour: number }>(() => getStoredOtBudgetSettings());
  const [showOtSettingsModal, setShowOtSettingsModal] = useState<boolean>(false);
  const [tempBudgetHours, setTempBudgetHours] = useState<number>(otSettings.budgetHours);
  const [tempRatePerHour, setTempRatePerHour] = useState<number>(otSettings.ratePerHour);

  const monthName = MONTHS[selectedMonth];
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // Division Notes State
  const [divisionNotes, setDivisionNotes] = useState<DivisionNotes>(() => getStoredDivisionNotes(monthKey));
  const [editingDivisionNote, setEditingDivisionNote] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');

  // Reload notes if monthKey changes
  React.useEffect(() => {
    setDivisionNotes(getStoredDivisionNotes(monthKey));
  }, [monthKey]);

  // Sync with prop changes if passed
  React.useEffect(() => {
    if (selectedArea) setLocalArea(selectedArea);
  }, [selectedArea]);

  React.useEffect(() => {
    if (selectedOutlet !== undefined) setLocalOutlet(selectedOutlet);
  }, [selectedOutlet]);

  const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
  const prevMonthName = MONTHS[prevMonthIdx];

  // Standard 4 weeks cut-off ranges: 26 prev month to 25 current month
  // Sisa hari setelah Week 3 (16 s/d 25 = 10 hari) tidak sampai 7 hari jika dibuat Week 5 terpisah, sehingga terhitung Week 4
  const weekRanges = useMemo(() => [
    {
      week: 1,
      label: `Week 1 (26 ${prevMonthName.slice(0, 3)} - 1 ${monthName.slice(0, 3)})`,
      shortLabel: 'Week 1',
      startDate: `${prevMonthKey}-26`,
      endDate: `${monthKey}-01`
    },
    {
      week: 2,
      label: `Week 2 (2 - 8 ${monthName.slice(0, 3)})`,
      shortLabel: 'Week 2',
      startDate: `${monthKey}-02`,
      endDate: `${monthKey}-08`
    },
    {
      week: 3,
      label: `Week 3 (9 - 15 ${monthName.slice(0, 3)})`,
      shortLabel: 'Week 3',
      startDate: `${monthKey}-09`,
      endDate: `${monthKey}-15`
    },
    {
      week: 4,
      label: `Week 4 (16 - 25 ${monthName.slice(0, 3)})`,
      shortLabel: 'Week 4',
      startDate: `${monthKey}-16`,
      endDate: `${monthKey}-25`
    }
  ], [prevMonthKey, prevMonthName, monthKey, monthName]);

  // Helper to categorize division into standard categories
  const normalizeDivision = (rawDiv?: string): 'BAR' | 'KITCHEN' | 'SERVICE' | 'STORE KEEPER' | 'OTHER' => {
    if (!rawDiv) return 'OTHER';
    const up = rawDiv.toUpperCase().trim();
    if (up.includes('BAR')) return 'BAR';
    if (up.includes('KITCHEN') || up.includes('COOK') || up.includes('STEWARD') || up.includes('CHEF')) return 'KITCHEN';
    if (up.includes('SERVICE') || up.includes('FLOOR') || up.includes('GREETER') || up.includes('CASHIER') || up.includes('RUNNER') || up.includes('WAITER') || up.includes('WAITRESS')) return 'SERVICE';
    if (up.includes('STORE') || up.includes('LOGISTIK') || up.includes('KEEPER')) return 'STORE KEEPER';
    return 'OTHER';
  };

  // Determine target outlets
  const displayedOutlets = useMemo(() => {
    const activeNames = getActiveOutletNames() as Outlet[];
    const activeAreas = getActiveRegionalAreas();
    let list: Outlet[] = [...activeNames];
    if (localArea !== 'ALL' && activeAreas[localArea]) {
      list = activeAreas[localArea];
    }
    if (localOutlet && localOutlet !== 'ALL') {
      list = list.filter(o => o === localOutlet);
    }
    return list;
  }, [localArea, localOutlet]);

  // Group outlets by area
  const areaGroups = useMemo(() => {
    const activeAreas = getActiveRegionalAreas();
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (localOutlet && localOutlet !== 'ALL') {
      const parentArea = areas.find(a => (activeAreas[a] || []).includes(localOutlet as Outlet)) || 'OTHER';
      return [{ areaName: parentArea, outlets: [localOutlet as Outlet] }];
    }
    if (localArea !== 'ALL' && activeAreas[localArea]) {
      return [{ areaName: localArea, outlets: activeAreas[localArea].filter(o => displayedOutlets.includes(o)) }];
    }
    return areas.map(a => ({
      areaName: a,
      outlets: (activeAreas[a] || []).filter(o => displayedOutlets.includes(o))
    })).filter(g => g.outlets.length > 0);
  }, [localArea, localOutlet, displayedOutlets]);

  // Aggregation of Overtime data for all target outlets
  const outletOvertimeData = useMemo(() => {
    return displayedOutlets.map(outlet => {
      // 1. Resolve staff list for this outlet
      const outletRawData = allOutletsData?.[outlet] || {};
      const currentMonthData = outletRawData[String(selectedMonth)] || outletRawData[selectedMonth] || {};
      const prevMonthData = outletRawData[String(prevMonthIdx)] || outletRawData[prevMonthIdx] || {};

      const rootStaffList = Array.isArray(outletRawData.staffList) ? outletRawData.staffList : [];
      const mStaffList = Array.isArray(currentMonthData.staffList) ? currentMonthData.staffList : [];
      const gStaffList = (globalData?.staffList || []).filter((s: any) => s && s.outlet === outlet);

      // Best staff list
      const staffMap = new Map<string, { id: string; name: string; division: string; normDiv: string; role: string }>();
      [...gStaffList, ...rootStaffList, ...mStaffList].forEach((s: any) => {
        if (!s) return;
        const id = String(s.staffId || s.id || '');
        if (!id) return;
        const normDiv = normalizeDivision(s.division);
        staffMap.set(id, {
          id,
          name: s.name || s.staffName || `Staff ${id}`,
          division: s.division || 'SERVICE',
          normDiv,
          role: s.role || s.position || '-'
        });
      });

      // 2. Daily Overtime Entries collection
      const dailyOTCurrent = currentMonthData.dailyOvertime || outletRawData.dailyOvertime || {};
      const dailyOTPrev = prevMonthData.dailyOvertime || {};
      const globalOT = globalData?.dailyOvertime || {};

      // Combine daily overtime
      const allDailyOT: Record<string, OvertimeEntry[]> = {};

      const mergeOTSource = (source: Record<string, any[]>) => {
        if (!source || typeof source !== 'object') return;
        Object.entries(source).forEach(([dStr, arr]) => {
          if (!Array.isArray(arr)) return;
          if (!allDailyOT[dStr]) allDailyOT[dStr] = [];
          arr.forEach((e: any) => {
            if (!e) return;
            // Check if this overtime belongs to this outlet
            const eOutlet = e.outlet || outlet;
            if (eOutlet === outlet) {
              allDailyOT[dStr].push(e);
            }
          });
        });
      };

      mergeOTSource(dailyOTPrev);
      mergeOTSource(dailyOTCurrent);
      mergeOTSource(globalOT);

      // 3. Weekly Aggregations (Week 1 to Week 5)
      interface WeekStat {
        week: number;
        hours: number;
        pay: number;
        staffCount: number;
        staffIds: Set<string>;
      }

      const weekStats: WeekStat[] = weekRanges.map(w => ({
        week: w.week,
        hours: 0,
        pay: 0,
        staffCount: 0,
        staffIds: new Set<string>()
      }));

      // Division Breakdown
      const divBreakdown = {
        BAR: { hours: 0, pay: 0, staffCount: 0, staffIds: new Set<string>() },
        KITCHEN: { hours: 0, pay: 0, staffCount: 0, staffIds: new Set<string>() },
        SERVICE: { hours: 0, pay: 0, staffCount: 0, staffIds: new Set<string>() },
        'STORE KEEPER': { hours: 0, pay: 0, staffCount: 0, staffIds: new Set<string>() },
        OTHER: { hours: 0, pay: 0, staffCount: 0, staffIds: new Set<string>() }
      };

      // Crew detailed overtime map: staffId -> { info, weekHours: [w1,w2,w3,w4,w5], totalHours, totalPay }
      const crewDetailMap = new Map<string, {
        id: string;
        name: string;
        division: string;
        normDiv: string;
        role: string;
        weekHours: number[];
        weekPay: number[];
        totalHours: number;
        totalPay: number;
      }>();

      // Process each date in cutoff period
      weekRanges.forEach((wRange, wIdx) => {
        Object.entries(allDailyOT).forEach(([dateStr, entries]) => {
          if (dateStr >= wRange.startDate && dateStr <= wRange.endDate && Array.isArray(entries)) {
            entries.forEach(e => {
              if (!e) return;
              const staffId = String(e.staffId || (e as any).id || (e as any).staffName || '');
              const staffInfo = staffMap.get(staffId) || {
                id: staffId,
                name: (e as any).staffName || (e as any).name || staffId || 'Staff',
                division: (e as any).division || 'SERVICE',
                normDiv: normalizeDivision((e as any).division),
                role: '-'
              };

              const rawHours = Number(e.overtimeHours) || Number((e as any).hours) || 0;
              const rawPay = Number(e.overtimePay) || (rawHours * 20000); // Default OT rate Rp 20.000/jam if not specified
              const eDiv = staffInfo.normDiv;

              // Filter by activeDivision if not ALL
              const matchesDivision = activeDivision === 'ALL' || eDiv === activeDivision;

              if (matchesDivision) {
                weekStats[wIdx].hours += rawHours;
                weekStats[wIdx].pay += rawPay;
                if (staffId) weekStats[wIdx].staffIds.add(staffId);
              }

              // Always record in division breakdown
              if (divBreakdown[eDiv as keyof typeof divBreakdown]) {
                divBreakdown[eDiv as keyof typeof divBreakdown].hours += rawHours;
                divBreakdown[eDiv as keyof typeof divBreakdown].pay += rawPay;
                if (staffId) divBreakdown[eDiv as keyof typeof divBreakdown].staffIds.add(staffId);
              }

              // Record in crew detail map
              if (staffId && matchesDivision) {
                if (!crewDetailMap.has(staffId)) {
                  crewDetailMap.set(staffId, {
                    id: staffId,
                    name: staffInfo.name,
                    division: staffInfo.division,
                    normDiv: staffInfo.normDiv,
                    role: staffInfo.role,
                    weekHours: [0, 0, 0, 0, 0],
                    weekPay: [0, 0, 0, 0, 0],
                    totalHours: 0,
                    totalPay: 0
                  });
                }
                const cr = crewDetailMap.get(staffId)!;
                cr.weekHours[wIdx] += rawHours;
                cr.weekPay[wIdx] += rawPay;
                cr.totalHours += rawHours;
                cr.totalPay += rawPay;
              }
            });
          }
        });
      });

      // Update staff counts per week
      weekStats.forEach(ws => {
        ws.staffCount = ws.staffIds.size;
      });

      // Total MTD Overtime for this outlet
      const totalHoursMTD = weekStats.reduce((acc, w) => acc + w.hours, 0);
      const totalPayMTD = weekStats.reduce((acc, w) => acc + w.pay, 0);

      // Staff counts by division (Total Manpower) from the Man Power Table for this outlet
      const allManpower = extractOutletManpowerMap(outletRawData, globalData?.manpowerData);
      const outletMpData = resolveOutletManpowerData(allManpower, outlet, monthKey);
      const mpSummary = calculateManpowerSummary(outletMpData);

      const allStaffArr = Array.from(staffMap.values());
      const barStaffCount = mpSummary.barActual || allStaffArr.filter(s => s.normDiv === 'BAR').length || 0;
      const kitchenStaffCount = mpSummary.kitchenActual || allStaffArr.filter(s => s.normDiv === 'KITCHEN').length || 0;
      const serviceStaffCount = mpSummary.serviceActual || allStaffArr.filter(s => s.normDiv === 'SERVICE').length || 0;
      const storeKeeperStaffCount = mpSummary.storekeeperActual || allStaffArr.filter(s => s.normDiv === 'STORE KEEPER').length || 0;
      const totalManpowerAll = mpSummary.totalInhouseActual || (barStaffCount + kitchenStaffCount + serviceStaffCount + storeKeeperStaffCount) || allStaffArr.length || 1;

      // Active staff in outlet matching division
      const totalOutletStaff = activeDivision === 'ALL'
        ? totalManpowerAll
        : (activeDivision === 'BAR' ? barStaffCount :
           activeDivision === 'KITCHEN' ? kitchenStaffCount :
           activeDivision === 'SERVICE' ? serviceStaffCount : storeKeeperStaffCount) || 1;

      // Budget Overtime: auto multiply budgetHours (contoh 35 Jam) * ratePerHour (contoh 15.000)
      const budgetHours = totalOutletStaff * otSettings.budgetHours;
      const budgetPay = budgetHours * otSettings.ratePerHour;
      const utilization = budgetPay > 0 ? (totalPayMTD / budgetPay) * 100 : 0;
      const avgHoursPerStaff = totalOutletStaff > 0 ? totalHoursMTD / totalOutletStaff : 0;

      // Calculate Last Month Overtime for Compare Last Month
      let lmHours = 0;
      let lmPay = 0;
      const prevOutletData = (allOutletsData[outlet]?.[prevMonthIdx]) || (allOutletsData[outlet]?.[String(prevMonthIdx)]);
      if (prevOutletData) {
        const lmDailyOT = prevOutletData.dailyOvertime || {};
        Object.values(lmDailyOT).forEach((entries: any) => {
          if (Array.isArray(entries)) {
            entries.forEach((e: any) => {
              if (!e) return;
              const normD = normalizeDivision(e.division);
              if (activeDivision === 'ALL' || normD === activeDivision) {
                const h = Number(e.overtimeHours) || Number(e.hours) || 0;
                const p = Number(e.overtimePay) || (h * otSettings.ratePerHour);
                lmHours += h;
                lmPay += p;
              }
            });
          }
        });
      }
      const varHours = totalHoursMTD - lmHours;
      const varPay = totalPayMTD - lmPay;
      const varHoursPct = lmHours > 0 ? (varHours / lmHours) * 100 : 0;
      const varPayPct = lmPay > 0 ? (varPay / lmPay) * 100 : 0;

      return {
        outlet,
        area: REGIONAL_AREAS['JAKARTA'].includes(outlet) ? 'JAKARTA' :
              REGIONAL_AREAS['TANGGERANG'].includes(outlet) ? 'TANGGERANG' : 'BEKASI & CIBUBUR',
        totalStaff: totalOutletStaff,
        barStaffCount,
        kitchenStaffCount,
        serviceStaffCount,
        storeKeeperStaffCount,
        totalManpowerAll,
        lmHours,
        lmPay,
        varHours,
        varPay,
        varHoursPct,
        varPayPct,
        activeOvertimeCrewCount: crewDetailMap.size,
        weekStats,
        w1Hours: weekStats[0]?.hours || 0,
        w1Pay: weekStats[0]?.pay || 0,
        w2Hours: weekStats[1]?.hours || 0,
        w2Pay: weekStats[1]?.pay || 0,
        w3Hours: weekStats[2]?.hours || 0,
        w3Pay: weekStats[2]?.pay || 0,
        w4Hours: weekStats[3]?.hours || 0,
        w4Pay: weekStats[3]?.pay || 0,
        w5Hours: 0,
        w5Pay: 0,
        totalHoursMTD,
        totalPayMTD,
        budgetHours,
        budgetPay,
        utilization,
        avgHoursPerStaff,
        divBreakdown: {
          BAR: { hours: divBreakdown.BAR.hours, pay: divBreakdown.BAR.pay, staff: divBreakdown.BAR.staffIds.size },
          KITCHEN: { hours: divBreakdown.KITCHEN.hours, pay: divBreakdown.KITCHEN.pay, staff: divBreakdown.KITCHEN.staffIds.size },
          SERVICE: { hours: divBreakdown.SERVICE.hours, pay: divBreakdown.SERVICE.pay, staff: divBreakdown.SERVICE.staffIds.size },
          'STORE KEEPER': { hours: divBreakdown['STORE KEEPER'].hours, pay: divBreakdown['STORE KEEPER'].pay, staff: divBreakdown['STORE KEEPER'].staffIds.size }
        },
        crewDetails: Array.from(crewDetailMap.values()).sort((a, b) => b.totalHours - a.totalHours)
      };
    });
  }, [displayedOutlets, allOutletsData, globalData, selectedMonth, selectedYear, prevMonthIdx, weekRanges, activeDivision, otSettings]);

  // Regional Executive Summary
  const regionalSummary = useMemo(() => {
    let totalHours = 0;
    let totalPay = 0;
    let totalStaff = 0;
    let totalCrewWithOT = 0;
    let totalBudget = 0;
    let barHours = 0;
    let barPay = 0;
    let kitchenHours = 0;
    let kitchenPay = 0;
    let serviceHours = 0;
    let servicePay = 0;
    let storeHours = 0;
    let storePay = 0;

    const weekTotals = weekRanges.map(() => 0);
    const weekPayTotals = weekRanges.map(() => 0);

    outletOvertimeData.forEach(d => {
      totalHours += d.totalHoursMTD;
      totalPay += d.totalPayMTD;
      totalStaff += d.totalStaff;
      totalCrewWithOT += d.activeOvertimeCrewCount;
      totalBudget += d.budgetPay;

      d.weekStats.forEach((w, idx) => {
        weekTotals[idx] += w.hours;
        weekPayTotals[idx] += w.pay;
      });

      barHours += d.divBreakdown.BAR.hours;
      barPay += d.divBreakdown.BAR.pay;
      kitchenHours += d.divBreakdown.KITCHEN.hours;
      kitchenPay += d.divBreakdown.KITCHEN.pay;
      serviceHours += d.divBreakdown.SERVICE.hours;
      servicePay += d.divBreakdown.SERVICE.pay;
      storeHours += d.divBreakdown['STORE KEEPER'].hours;
      storePay += d.divBreakdown['STORE KEEPER'].pay;
    });

    const avgHoursPerCrew = totalStaff > 0 ? totalHours / totalStaff : 0;
    const avgUtilization = totalBudget > 0 ? (totalPay / totalBudget) * 100 : 0;

    return {
      totalHours,
      totalPay,
      totalStaff,
      totalCrewWithOT,
      totalBudget,
      avgHoursPerCrew,
      avgUtilization,
      weekTotals,
      weekPayTotals,
      divisionShare: {
        BAR: { hours: barHours, pay: barPay, pct: totalHours > 0 ? (barHours / totalHours) * 100 : 0 },
        KITCHEN: { hours: kitchenHours, pay: kitchenPay, pct: totalHours > 0 ? (kitchenHours / totalHours) * 100 : 0 },
        SERVICE: { hours: serviceHours, pay: servicePay, pct: totalHours > 0 ? (serviceHours / totalHours) * 100 : 0 },
        STORE: { hours: storeHours, pay: storePay, pct: totalHours > 0 ? (storeHours / totalHours) * 100 : 0 }
      }
    };
  }, [outletOvertimeData]);

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Shabu Hachi Regional Analytics';
      workbook.created = new Date();

      // Sheet 1: Rekap Weekly Overtime
      const ws = workbook.addWorksheet('REKAP_WEEKLY_OVERTIME');

      // Title
      ws.addRow(['REKAPITULASI WEEKLY OVERTIME REGIONAL PER DIVISI']);
      ws.addRow([`Periode: Cut-Off 26 ${prevMonthName} ${prevYear} - 25 ${monthName} ${selectedYear}`]);
      ws.addRow([`Filter Divisi: ${activeDivision} | Filter Area: ${localArea}`]);
      ws.addRow([]);

      // Headers
      const headers = [
        'No',
        'Area',
        'Outlet',
        'Total Staff',
        'Crew Lembur',
        'Week 1 (Jam)',
        'Week 1 (Rp)',
        'Week 2 (Jam)',
        'Week 2 (Rp)',
        'Week 3 (Jam)',
        'Week 3 (Rp)',
        'Week 4 (Jam)',
        'Week 4 (Rp)',
        'Total Jam MTD',
        'Total Biaya OT (Rp)',
        'Budget OT (Rp)',
        'Utilisasi (%)',
        'Status'
      ];
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };

      let rowNo = 1;
      areaGroups.forEach(group => {
        // Group Header
        const grpRow = ws.addRow([`AREA: ${group.areaName}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        grpRow.font = { bold: true, color: { argb: 'FFF59E0B' } };
        grpRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' }
        };

        let subHours = 0;
        let subPay = 0;
        let subBudget = 0;
        let subStaff = 0;
        const subWeeks = weekRanges.map(() => 0);
        const subWeeksPay = weekRanges.map(() => 0);

        group.outlets.forEach(outlet => {
          const item = outletOvertimeData.find(d => d.outlet === outlet);
          if (!item) return;

          subHours += item.totalHoursMTD;
          subPay += item.totalPayMTD;
          subBudget += item.budgetPay;
          subStaff += item.totalStaff;
          item.weekStats.forEach((w, idx) => {
            if (subWeeks[idx] !== undefined) subWeeks[idx] += w.hours;
            if (subWeeksPay[idx] !== undefined) subWeeksPay[idx] += w.pay;
          });

          const status = item.utilization > 100 ? 'OVER BUDGET' : item.utilization >= 80 ? 'WASPADA' : 'AMAN';

          ws.addRow([
            rowNo++,
            group.areaName,
            item.outlet,
            item.totalStaff,
            item.activeOvertimeCrewCount,
            Number(item.w1Hours.toFixed(1)),
            item.w1Pay,
            Number(item.w2Hours.toFixed(1)),
            item.w2Pay,
            Number(item.w3Hours.toFixed(1)),
            item.w3Pay,
            Number(item.w4Hours.toFixed(1)),
            item.w4Pay,
            Number(item.totalHoursMTD.toFixed(1)),
            item.totalPayMTD,
            item.budgetPay,
            `${item.utilization.toFixed(1)}%`,
            status
          ]);
        });

        // Area Subtotal Row
        const subUtil = subBudget > 0 ? (subPay / subBudget) * 100 : 0;
        const subRow = ws.addRow([
          '',
          `SUBTOTAL ${group.areaName}`,
          '',
          subStaff,
          '',
          Number((subWeeks[0] || 0).toFixed(1)),
          subWeeksPay[0] || 0,
          Number((subWeeks[1] || 0).toFixed(1)),
          subWeeksPay[1] || 0,
          Number((subWeeks[2] || 0).toFixed(1)),
          subWeeksPay[2] || 0,
          Number((subWeeks[3] || 0).toFixed(1)),
          subWeeksPay[3] || 0,
          Number(subHours.toFixed(1)),
          subPay,
          subBudget,
          `${subUtil.toFixed(1)}%`,
          subUtil > 100 ? 'OVER BUDGET' : 'NORMAL'
        ]);
        subRow.font = { bold: true };
        subRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
      });

      // Grand Total Row
      const gtRow = ws.addRow([
        '',
        'GRAND TOTAL REGIONAL',
        '',
        regionalSummary.totalStaff,
        regionalSummary.totalCrewWithOT,
        Number((regionalSummary.weekTotals[0] || 0).toFixed(1)),
        regionalSummary.weekPayTotals[0] || 0,
        Number((regionalSummary.weekTotals[1] || 0).toFixed(1)),
        regionalSummary.weekPayTotals[1] || 0,
        Number((regionalSummary.weekTotals[2] || 0).toFixed(1)),
        regionalSummary.weekPayTotals[2] || 0,
        Number((regionalSummary.weekTotals[3] || 0).toFixed(1)),
        regionalSummary.weekPayTotals[3] || 0,
        Number(regionalSummary.totalHours.toFixed(1)),
        regionalSummary.totalPay,
        regionalSummary.totalBudget,
        `${regionalSummary.avgUtilization.toFixed(1)}%`,
        regionalSummary.avgUtilization > 100 ? 'OVER BUDGET' : 'AMAN'
      ]);
      gtRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      gtRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' }
      };

      // Sheet 2: Breakdown Divisi
      const wsDiv = workbook.addWorksheet('BREAKDOWN_DIVISI');
      wsDiv.addRow(['BREAKDOWN OVERTIME PER DIVISI (BAR, KITCHEN, SERVICE, STORE)']);
      wsDiv.addRow([`Periode: ${monthName} ${selectedYear}`]);
      wsDiv.addRow([]);

      const divHeaders = [
        'No',
        'Area',
        'Outlet',
        'Bar Jam',
        'Bar Rp',
        'Kitchen Jam',
        'Kitchen Rp',
        'Service Jam',
        'Service Rp',
        'Store Keeper Jam',
        'Store Keeper Rp',
        'Total Jam MTD',
        'Total Biaya OT (Rp)'
      ];
      const divHeaderRow = wsDiv.addRow(divHeaders);
      divHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      divHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };

      let dNo = 1;
      outletOvertimeData.forEach(d => {
        wsDiv.addRow([
          dNo++,
          d.area,
          d.outlet,
          Number(d.divBreakdown.BAR.hours.toFixed(1)),
          d.divBreakdown.BAR.pay,
          Number(d.divBreakdown.KITCHEN.hours.toFixed(1)),
          d.divBreakdown.KITCHEN.pay,
          Number(d.divBreakdown.SERVICE.hours.toFixed(1)),
          d.divBreakdown.SERVICE.pay,
          Number(d.divBreakdown['STORE KEEPER'].hours.toFixed(1)),
          d.divBreakdown['STORE KEEPER'].pay,
          Number(d.totalHoursMTD.toFixed(1)),
          d.totalPayMTD
        ]);
      });

      // Auto-fit columns
      [ws, wsDiv].forEach(sheet => {
        sheet.columns.forEach(col => {
          col.width = 16;
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekap_Weekly_Overtime_Regional_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mendownload Excel Rekap Weekly Overtime!', 'success');
    } catch (err: any) {
      console.error('Error generating Excel:', err);
      showToast?.('Gagal mengekspor data ke Excel.', 'error');
    }
  };

  // Copy WhatsApp Summary
  const handleCopyWhatsApp = () => {
    let text = `*📊 REKAPITULASI WEEKLY OVERTIME REGIONAL*\n`;
    text += `*Periode:* 26 ${prevMonthName.slice(0, 3)} - 25 ${monthName.slice(0, 3)} ${selectedYear}\n`;
    text += `*Divisi:* ${activeDivision} | *Area:* ${localArea}\n`;
    text += `------------------------------------\n\n`;

    text += `*📈 EXECUTIVE REGIONAL KPI:*\n`;
    text += `• Total Overtime: *${regionalSummary.totalHours.toFixed(1)} Jam*\n`;
    text += `• Total Biaya Overtime: *Rp ${regionalSummary.totalPay.toLocaleString('id-ID')}*\n`;
    text += `• Total Crew Terlibat: *${regionalSummary.totalCrewWithOT} Staff*\n`;
    text += `• Rata-rata per Staff: *${regionalSummary.avgHoursPerCrew.toFixed(1)} Jam/Staff*\n`;
    text += `• Utilisasi Budget (40h/staff): *${regionalSummary.avgUtilization.toFixed(1)}%*\n\n`;

    text += `*💼 BREAKDOWN DIVISI:*\n`;
    text += `• Bar: ${regionalSummary.divisionShare.BAR.hours.toFixed(1)} Jam (Rp ${regionalSummary.divisionShare.BAR.pay.toLocaleString('id-ID')}) - ${regionalSummary.divisionShare.BAR.pct.toFixed(1)}%\n`;
    text += `• Kitchen: ${regionalSummary.divisionShare.KITCHEN.hours.toFixed(1)} Jam (Rp ${regionalSummary.divisionShare.KITCHEN.pay.toLocaleString('id-ID')}) - ${regionalSummary.divisionShare.KITCHEN.pct.toFixed(1)}%\n`;
    text += `• Service: ${regionalSummary.divisionShare.SERVICE.hours.toFixed(1)} Jam (Rp ${regionalSummary.divisionShare.SERVICE.pay.toLocaleString('id-ID')}) - ${regionalSummary.divisionShare.SERVICE.pct.toFixed(1)}%\n\n`;

    areaGroups.forEach(group => {
      text += `📍 *AREA ${group.areaName}*\n`;
      let aHours = 0;
      let aPay = 0;

      group.outlets.forEach(outlet => {
        const d = outletOvertimeData.find(item => item.outlet === outlet);
        if (d && (d.totalHoursMTD > 0 || d.totalStaff > 0)) {
          text += `*${d.outlet}*\n`;
          text += `  W1: ${d.w1Hours.toFixed(1)}h | W2: ${d.w2Hours.toFixed(1)}h | W3: ${d.w3Hours.toFixed(1)}h | W4: ${d.w4Hours.toFixed(1)}h\n`;
          text += `  Total: *${d.totalHoursMTD.toFixed(1)} Jam* (Rp ${d.totalPayMTD.toLocaleString('id-ID')}) | Util: ${d.utilization.toFixed(1)}%\n`;
          aHours += d.totalHoursMTD;
          aPay += d.totalPayMTD;
        }
      });
      text += `👉 *Subtotal ${group.areaName}:* ${aHours.toFixed(1)} Jam | Rp ${aPay.toLocaleString('id-ID')}\n`;
      text += `------------------------------------\n\n`;
    });

    text += `_Generated via Shabu Hachi Regional Management Suite_`;

    navigator.clipboard.writeText(text);
    showToast?.('Rekap Weekly Overtime berhasil disalin ke WhatsApp!', 'success');
  };

  const selectedOutletDetail = useMemo(() => {
    if (!selectedOutletForModal) return null;
    return outletOvertimeData.find(d => d.outlet === selectedOutletForModal) || null;
  }, [selectedOutletForModal, outletOvertimeData]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER BANNER WITH EXECUTIVE METRICS */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 p-6 rounded-3xl border border-amber-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <i className="fas fa-business-time text-lg"></i>
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                  Rekap Weekly Overtime Masing-Masing Divisi
                </h2>
                <p className="text-xs text-slate-400 font-bold mt-0.5">
                  Periode Cut-Off: 26 {prevMonthName} {prevYear} - 25 {monthName} {selectedYear} • Budget: Rata-rata 35 Jam × Total Staff Man Power Seluruh Divisi (Rp 15.000/Jam)
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <i className="fas fa-file-excel"></i>
              Export Excel
            </button>
            <button
              onClick={handleCopyWhatsApp}
              className="px-4 py-2.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-700/20 transition-all cursor-pointer"
            >
              <i className="fab fa-whatsapp"></i>
              Salin WA Rekap
            </button>
          </div>
        </div>

        {/* 4 KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Total Jam Lembur</span>
              <i className="fas fa-clock text-amber-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {regionalSummary.totalHours.toFixed(1)} <span className="text-xs text-amber-400 font-bold">JAM</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Rata-rata {regionalSummary.avgHoursPerCrew.toFixed(1)} jam / crew
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Total Biaya Overtime</span>
              <i className="fas fa-money-bill-wave text-emerald-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
              Rp {(regionalSummary.totalPay / 1000000).toFixed(2)} <span className="text-xs font-bold">JT</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Rp {regionalSummary.totalPay.toLocaleString('id-ID')}
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Crew Terlibat Lembur</span>
              <i className="fas fa-users text-indigo-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-300 mt-1">
              {regionalSummary.totalCrewWithOT} <span className="text-xs text-slate-400 font-bold">/ {regionalSummary.totalStaff} Staff</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              {regionalSummary.totalStaff > 0 ? ((regionalSummary.totalCrewWithOT / regionalSummary.totalStaff) * 100).toFixed(0) : 0}% dari total personil
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Utilisasi Budget</span>
              <i className="fas fa-chart-pie text-cyan-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-cyan-300 mt-1">
              {regionalSummary.avgUtilization.toFixed(1)}%
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Plafond: Rp {(regionalSummary.totalBudget / 1000000).toFixed(1)} Jt (40h/stf)
            </p>
          </div>
        </div>

        {/* Division share pills in header */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Distribusi Divisi:</span>
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-xl text-amber-300 text-xs font-bold">
            <i className="fas fa-wine-glass-alt"></i> Bar: {regionalSummary.divisionShare.BAR.hours.toFixed(1)}h ({regionalSummary.divisionShare.BAR.pct.toFixed(0)}%)
          </div>
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-xl text-rose-300 text-xs font-bold">
            <i className="fas fa-utensils"></i> Kitchen: {regionalSummary.divisionShare.KITCHEN.hours.toFixed(1)}h ({regionalSummary.divisionShare.KITCHEN.pct.toFixed(0)}%)
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-xl text-blue-300 text-xs font-bold">
            <i className="fas fa-concierge-bell"></i> Service: {regionalSummary.divisionShare.SERVICE.hours.toFixed(1)}h ({regionalSummary.divisionShare.SERVICE.pct.toFixed(0)}%)
          </div>
          {regionalSummary.divisionShare.STORE.hours > 0 && (
            <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-3 py-1 rounded-xl text-purple-300 text-xs font-bold">
              <i className="fas fa-boxes"></i> Store: {regionalSummary.divisionShare.STORE.hours.toFixed(1)}h
            </div>
          )}
        </div>
      </div>

      {/* FILTER & VIEW CONTROLS */}
      <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* DIVISION FILTER BUTTONS */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pilih Divisi:</label>
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'BAR', 'KITCHEN', 'SERVICE', 'STORE KEEPER'] as OvertimeDivision[]).map(div => {
                const isActive = activeDivision === div;
                const icon = div === 'ALL' ? 'fa-layer-group' :
                             div === 'BAR' ? 'fa-wine-glass-alt' :
                             div === 'KITCHEN' ? 'fa-utensils' :
                             div === 'SERVICE' ? 'fa-concierge-bell' : 'fa-boxes';
                return (
                  <button
                    key={div}
                    onClick={() => setActiveDivision(div)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30 scale-102'
                        : 'bg-slate-950/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-white/5'
                    }`}
                  >
                    <i className={`fas ${icon} text-[11px]`}></i>
                    {div === 'ALL' ? 'Semua Divisi' : div}
                  </button>
                );
              })}
            </div>
          </div>

          {/* VIEW MODE TABS */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tampilan Laporan:</label>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setViewMode('WEEKLY_TABLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'WEEKLY_TABLE'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-table mr-1.5"></i> Rekap Mingguan
              </button>
              <button
                onClick={() => setViewMode('DIVISION_BREAKDOWN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'DIVISION_BREAKDOWN'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-chart-column mr-1.5"></i> Perbandingan Divisi
              </button>
              <button
                onClick={() => setViewMode('COMPARE_LAST_MONTH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'COMPARE_LAST_MONTH'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-arrows-split-up-and-left mr-1.5"></i> Compare Last Month
              </button>
              <button
                onClick={() => setViewMode('CREW_DETAIL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'CREW_DETAIL'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-user-clock mr-1.5"></i> Detail Log Staff
              </button>
            </div>
            {/* SETTING BUDGET OVERTIME BUTTON */}
            <button
              onClick={() => {
                setTempBudgetHours(otSettings.budgetHours);
                setTempRatePerHour(otSettings.ratePerHour);
                setShowOtSettingsModal(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fas fa-sliders-h text-amber-400"></i>
              <span>Setting Budget OT: <b className="text-white">{otSettings.budgetHours} Jam</b> × <b className="text-white">Rp {otSettings.ratePerHour.toLocaleString('id-ID')}</b></span>
            </button>
          </div>
        </div>

        {/* AREA & OUTLET SELECTOR PILLS */}
        <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filter Area:</span>
            {['ALL', 'JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'].map(area => (
              <button
                key={area}
                onClick={() => {
                  setLocalArea(area);
                  if (area !== 'ALL' && localOutlet && !REGIONAL_AREAS[area]?.includes(localOutlet as Outlet)) {
                    setLocalOutlet('');
                  }
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  localArea === area
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {area === 'ALL' ? '🌐 Semua Area' : `📍 ${area}`}
              </button>
            ))}
          </div>

          {/* Search Outlet or Staff */}
          <div className="relative min-w-[200px]">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet atau staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* VIEW 1: REKAPITULASI MINGGUAN (WEEKLY TABLE) */}
      {viewMode === 'WEEKLY_TABLE' && (
        <div className="bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-calendar-week text-amber-400"></i>
                Tabel Rekapitulasi Overtime Mingguan Outlet
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Menampilkan jam dan biaya lemur Week 1 s/d Week 4 per outlet (Divisi: {activeDivision})
              </p>
            </div>
            <div className="text-xs text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              Rate Standard: Rp 20.000 / Jam | Budget: 40 Jam / Staff
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-4 min-w-[170px]">Nama Outlet</th>
                  <th className="py-3 px-3 text-center">Staff</th>
                  {weekRanges.map(w => (
                    <th key={w.week} className="py-3 px-3 text-right min-w-[100px]">
                      <div>{w.shortLabel}</div>
                      <div className="text-[8px] text-slate-500 font-normal lowercase">{w.startDate.slice(5)} - {w.endDate.slice(5)}</div>
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right bg-amber-950/30 text-amber-400 min-w-[100px]">Total Jam</th>
                  <th className="py-3 px-4 text-right bg-amber-950/30 text-amber-400 min-w-[130px]">Biaya OT (Rp)</th>
                  <th className="py-3 px-3 text-right text-slate-400 min-w-[110px]">Budget (Rp)</th>
                  <th className="py-3 px-3 text-center min-w-[90px]">Utilisasi</th>
                  <th className="py-3 px-3 text-center w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {areaGroups.map(group => {
                  const filteredGroupOutlets = group.outlets.filter(o => 
                    !searchQuery || o.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                  if (filteredGroupOutlets.length === 0) return null;

                  let groupHours = 0;
                  let groupPay = 0;
                  let groupBudget = 0;
                  let groupStaff = 0;
                  const groupWeeks = weekRanges.map(() => 0);

                  return (
                    <React.Fragment key={group.areaName}>
                      {/* Area Group Header Row */}
                      <tr className="bg-slate-950/90 text-amber-400 font-black text-[11px] border-y border-amber-500/20">
                        <td colSpan={12} className="py-2.5 px-4 uppercase tracking-widest flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <i className="fas fa-map-marker-alt"></i> AREA {group.areaName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {filteredGroupOutlets.length} Outlet
                          </span>
                        </td>
                      </tr>

                      {filteredGroupOutlets.map((outlet, oIdx) => {
                        const item = outletOvertimeData.find(d => d.outlet === outlet);
                        if (!item) return null;

                        groupHours += item.totalHoursMTD;
                        groupPay += item.totalPayMTD;
                        groupBudget += item.budgetPay;
                        groupStaff += item.totalStaff;
                        item.weekStats.forEach((w, idx) => {
                          groupWeeks[idx] += w.hours;
                        });

                        const isOverBudget = item.utilization > 100;
                        const isWarning = item.utilization >= 80 && !isOverBudget;

                        return (
                          <tr
                            key={outlet}
                            className="hover:bg-white/5 transition-colors border-b border-white/5 group"
                          >
                            <td className="py-3 px-3 text-center text-slate-500 font-bold">{oIdx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="font-black text-white text-xs uppercase tracking-tight flex items-center gap-2">
                                {item.outlet}
                                {item.activeOvertimeCrewCount > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                                    {item.activeOvertimeCrewCount} OT
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                Avg {item.avgHoursPerStaff.toFixed(1)} jam / staff
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-300">
                              {item.totalStaff}
                            </td>
                            {item.weekStats.map(w => (
                              <td key={w.week} className="py-3 px-3 text-right">
                                <div className={`font-black text-xs ${w.hours > 0 ? 'text-white' : 'text-slate-600'}`}>
                                  {w.hours > 0 ? `${w.hours.toFixed(1)} h` : '-'}
                                </div>
                                {w.pay > 0 && (
                                  <div className="text-[9px] text-slate-400 font-mono">
                                    Rp {(w.pay / 1000).toLocaleString('id-ID')}k
                                  </div>
                                )}
                              </td>
                            ))}
                            <td className="py-3 px-3 text-right bg-amber-950/20 font-black text-amber-300 text-xs">
                              {item.totalHoursMTD > 0 ? `${item.totalHoursMTD.toFixed(1)} h` : '-'}
                            </td>
                            <td className="py-3 px-4 text-right bg-amber-950/20 font-mono font-black text-amber-300 text-xs">
                              Rp {item.totalPayMTD.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-400 text-xs">
                              Rp {item.budgetPay.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isOverBudget
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : isWarning
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {item.utilization.toFixed(0)}%
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => setSelectedOutletForModal(item.outlet)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                                title="Lihat rincian lembur staff"
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Area Subtotal Row */}
                      <tr className="bg-slate-950/60 font-black text-xs text-slate-300 border-b border-white/10">
                        <td colSpan={2} className="py-2.5 px-4 uppercase text-amber-400">
                          Subtotal {group.areaName}
                        </td>
                        <td className="py-2.5 px-3 text-center">{groupStaff}</td>
                        {groupWeeks.map((wH, idx) => (
                          <td key={idx} className="py-2.5 px-3 text-right font-black">
                            {wH > 0 ? `${wH.toFixed(1)} h` : '-'}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right font-black text-amber-400 bg-amber-950/40">
                          {groupHours.toFixed(1)} h
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-amber-400 bg-amber-950/40">
                          Rp {groupPay.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                          Rp {groupBudget.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-[10px] text-amber-300">
                            {groupBudget > 0 ? ((groupPay / groupBudget) * 100).toFixed(0) : 0}%
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* GRAND TOTAL REGIONAL ROW */}
                <tr className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 text-white font-black text-xs border-t-2 border-amber-500">
                  <td colSpan={2} className="py-3.5 px-4 uppercase tracking-widest text-amber-300">
                    🏆 GRAND TOTAL REGIONAL
                  </td>
                  <td className="py-3.5 px-3 text-center text-amber-300">
                    {regionalSummary.totalStaff}
                  </td>
                  {regionalSummary.weekTotals.map((wH, idx) => (
                    <td key={idx} className="py-3.5 px-3 text-right font-black text-amber-300">
                      {wH.toFixed(1)} h
                    </td>
                  ))}
                  <td className="py-3.5 px-3 text-right font-black text-amber-400 text-sm bg-amber-900/40">
                    {regionalSummary.totalHours.toFixed(1)} h
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-amber-400 text-sm bg-amber-900/40">
                    Rp {regionalSummary.totalPay.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                    Rp {regionalSummary.totalBudget.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span className="px-2 py-1 rounded-md bg-amber-500 text-slate-950 font-black text-[11px]">
                      {regionalSummary.avgUtilization.toFixed(0)}%
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: PERBANDINGAN DIVISI & TOTAL MANPOWER (DIVISION BREAKDOWN MATRIX) */}
      {viewMode === 'DIVISION_BREAKDOWN' && (
        <div className="bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl space-y-4">
          <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-chart-column text-amber-400"></i>
                Matriks Perbandingan Overtime & Total Manpower Antar Divisi
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Komparasi total manpower staff, jam dan biaya lembur (Bar, Kitchen, Service & Store Keeper) serta catatan per divisi
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">Budget OT:</span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                {otSettings.budgetHours} Jam / Staff × Rp {otSettings.ratePerHour.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-4 min-w-[170px]">Nama Outlet</th>
                  <th className="py-3 px-3 text-center bg-emerald-500/10 text-emerald-300">Total Manpower</th>
                  <th className="py-3 px-3 text-right bg-amber-500/10 text-amber-300">Bar (Staff & Jam / Rp)</th>
                  <th className="py-3 px-3 text-right bg-rose-500/10 text-rose-300">Kitchen (Staff & Jam / Rp)</th>
                  <th className="py-3 px-3 text-right bg-blue-500/10 text-blue-300">Service (Staff & Jam / Rp)</th>
                  <th className="py-3 px-3 text-right bg-purple-500/10 text-purple-300">Store (Staff & Jam / Rp)</th>
                  <th className="py-3 px-3 text-right bg-amber-950/40 text-amber-400 font-black">Total Jam</th>
                  <th className="py-3 px-4 text-right bg-amber-950/40 text-amber-400 font-black">Total Biaya OT</th>
                  <th className="py-3 px-3 text-right text-slate-400 font-bold">Budget OT</th>
                  <th className="py-3 px-3 text-center text-slate-400 font-bold">Utilisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {outletOvertimeData
                  .filter(d => !searchQuery || d.outlet.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, idx) => (
                    <tr key={item.outlet} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 font-black text-white text-xs uppercase">
                        <div>{item.outlet}</div>
                        <div className="text-[10px] text-slate-400 font-normal">Area {item.area}</div>
                      </td>
                      <td className="py-3 px-3 text-center font-black text-emerald-400 bg-emerald-950/20">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                          {item.totalManpowerAll} Staff
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right bg-amber-500/5">
                        <div className="text-[10px] text-amber-400 font-bold">{item.barStaffCount} Staff</div>
                        <div className="font-bold text-amber-300">{item.divBreakdown.BAR.hours > 0 ? `${item.divBreakdown.BAR.hours.toFixed(1)} h` : '-'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.divBreakdown.BAR.pay > 0 ? `Rp ${item.divBreakdown.BAR.pay.toLocaleString('id-ID')}` : '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-right bg-rose-500/5">
                        <div className="text-[10px] text-rose-400 font-bold">{item.kitchenStaffCount} Staff</div>
                        <div className="font-bold text-rose-300">{item.divBreakdown.KITCHEN.hours > 0 ? `${item.divBreakdown.KITCHEN.hours.toFixed(1)} h` : '-'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.divBreakdown.KITCHEN.pay > 0 ? `Rp ${item.divBreakdown.KITCHEN.pay.toLocaleString('id-ID')}` : '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-right bg-blue-500/5">
                        <div className="text-[10px] text-blue-400 font-bold">{item.serviceStaffCount} Staff</div>
                        <div className="font-bold text-blue-300">{item.divBreakdown.SERVICE.hours > 0 ? `${item.divBreakdown.SERVICE.hours.toFixed(1)} h` : '-'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.divBreakdown.SERVICE.pay > 0 ? `Rp ${item.divBreakdown.SERVICE.pay.toLocaleString('id-ID')}` : '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-right bg-purple-500/5">
                        <div className="text-[10px] text-purple-400 font-bold">{item.storeKeeperStaffCount} Staff</div>
                        <div className="font-bold text-purple-300">{item.divBreakdown['STORE KEEPER'].hours > 0 ? `${item.divBreakdown['STORE KEEPER'].hours.toFixed(1)} h` : '-'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.divBreakdown['STORE KEEPER'].pay > 0 ? `Rp ${item.divBreakdown['STORE KEEPER'].pay.toLocaleString('id-ID')}` : '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-amber-400 bg-amber-950/20">
                        {item.totalHoursMTD.toFixed(1)} h
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-amber-400 bg-amber-950/20">
                        Rp {item.totalPayMTD.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        Rp {item.budgetPay.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-black ${
                          item.utilization > 100 
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {item.utilization.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* CATATAN DI MASING-MASING DIVISI */}
          <div className="p-5 bg-slate-950/80 border-t border-white/10 m-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-sticky-note text-amber-400"></i>
                  Catatan Evaluasi Masing-Masing Divisi ({monthName} {selectedYear})
                </h4>
                <p className="text-xs text-slate-400">
                  Tambahkan catatan performa, efisiensi lembur, dan kebutuhan manpower per divisi untuk laporan regional
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'BAR', title: 'Divisi Bar', icon: 'fa-wine-glass-alt', border: 'border-amber-500/30', headerBg: 'bg-amber-500/10 text-amber-300' },
                { key: 'KITCHEN', title: 'Divisi Kitchen', icon: 'fa-utensils', border: 'border-rose-500/30', headerBg: 'bg-rose-500/10 text-rose-300' },
                { key: 'SERVICE', title: 'Divisi Service', icon: 'fa-concierge-bell', border: 'border-blue-500/30', headerBg: 'bg-blue-500/10 text-blue-300' },
                { key: 'STORE KEEPER', title: 'Divisi Store Keeper', icon: 'fa-boxes', border: 'border-purple-500/30', headerBg: 'bg-purple-500/10 text-purple-300' }
              ].map(div => {
                const currentNote = divisionNotes[div.key] || '';
                const isEditing = editingDivisionNote === div.key;

                return (
                  <div key={div.key} className={`bg-slate-900 rounded-xl p-4 border ${div.border} flex flex-col justify-between shadow-lg`}>
                    <div>
                      <div className={`flex items-center justify-between p-2 rounded-lg ${div.headerBg} mb-3`}>
                        <span className="font-black text-xs uppercase flex items-center gap-2">
                          <i className={`fas ${div.icon}`}></i> {div.title}
                        </span>
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingDivisionNote(div.key);
                              setTempNoteText(currentNote);
                            }}
                            className="text-[11px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-all cursor-pointer font-bold"
                          >
                            <i className="fas fa-edit mr-1"></i> Edit
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={tempNoteText}
                            onChange={(e) => setTempNoteText(e.target.value)}
                            placeholder={`Tulis catatan untuk ${div.title}...`}
                            className="w-full text-xs bg-slate-950 text-white rounded-lg p-2.5 border border-white/20 focus:border-amber-400 focus:outline-none h-24 resize-none leading-relaxed"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingDivisionNote(null)}
                              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              onClick={() => {
                                const updated = { ...divisionNotes, [div.key]: tempNoteText };
                                setDivisionNotes(updated);
                                saveStoredDivisionNotes(monthKey, updated);
                                setEditingDivisionNote(null);
                                showToast?.(`Catatan ${div.title} berhasil disimpan`, 'success');
                              }}
                              className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                            >
                              Simpan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-300 italic min-h-[55px] whitespace-pre-wrap leading-relaxed">
                          {currentNote || 'Belum ada catatan untuk divisi ini. Klik Edit untuk menambahkan catatan.'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: COMPARE LAST MONTH OVERTIME */}
      {viewMode === 'COMPARE_LAST_MONTH' && (
        <div className="bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl space-y-4">
          <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-arrows-split-up-and-left text-amber-400"></i>
                Komparasi Lembur: {prevMonthName} {prevYear} vs {monthName} {selectedYear}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Perbandingan total jam lembur, total biaya, selisih variansi, dan rasio pertumbuhan overtime per outlet
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Divisi:</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 font-bold text-xs border border-white/10">
                {activeDivision === 'ALL' ? 'Semua Divisi' : activeDivision}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-4 min-w-[170px]">Nama Outlet</th>
                  <th className="py-3 px-3 text-center bg-slate-800/40 text-slate-300">Manpower</th>
                  <th className="py-3 px-3 text-right bg-slate-800/60 text-slate-300">Jam ({prevMonthName.slice(0, 3)})</th>
                  <th className="py-3 px-3 text-right bg-amber-500/10 text-amber-300">Jam ({monthName.slice(0, 3)})</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-300">Var Jam</th>
                  <th className="py-3 px-4 text-right bg-slate-800/60 text-slate-300">Biaya ({prevMonthName.slice(0, 3)})</th>
                  <th className="py-3 px-4 text-right bg-amber-500/10 text-amber-300">Biaya ({monthName.slice(0, 3)})</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-300">Var Biaya (Rp)</th>
                  <th className="py-3 px-3 text-center font-bold text-slate-300">Pertumbuhan %</th>
                  <th className="py-3 px-3 text-center font-bold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {outletOvertimeData
                  .filter(d => !searchQuery || d.outlet.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, idx) => {
                    const isIncreased = item.varPay > 0;
                    const isDecreased = item.varPay < 0;

                    return (
                      <tr key={item.outlet} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                        <td className="py-3 px-4 font-black text-white text-xs uppercase">
                          <div>{item.outlet}</div>
                          <div className="text-[10px] text-slate-400 font-normal">Area {item.area}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-300 bg-slate-950/30">
                          {item.totalManpowerAll}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400 bg-slate-950/30">
                          {item.lmHours > 0 ? `${item.lmHours.toFixed(1)} h` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-300 bg-amber-500/5">
                          {item.totalHoursMTD > 0 ? `${item.totalHoursMTD.toFixed(1)} h` : '-'}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono font-bold ${
                          item.varHours > 0 ? 'text-rose-400' : item.varHours < 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {item.varHours > 0 ? `+${item.varHours.toFixed(1)} h` : `${item.varHours.toFixed(1)} h`}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400 bg-slate-950/30">
                          {item.lmPay > 0 ? `Rp ${item.lmPay.toLocaleString('id-ID')}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-300 bg-amber-500/5">
                          {item.totalPayMTD > 0 ? `Rp ${item.totalPayMTD.toLocaleString('id-ID')}` : '-'}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${
                          isIncreased ? 'text-rose-400' : isDecreased ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {item.varPay > 0 ? `+Rp ${item.varPay.toLocaleString('id-ID')}` : `Rp ${item.varPay.toLocaleString('id-ID')}`}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            isIncreased ? 'bg-rose-500/20 text-rose-400' : isDecreased ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {item.varPayPct > 0 ? `+${item.varPayPct.toFixed(1)}%` : `${item.varPayPct.toFixed(1)}%`}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isIncreased ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            isDecreased ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            'bg-slate-800 text-slate-400 border border-white/5'
                          }`}>
                            {isIncreased ? 'Naik' : isDecreased ? 'Hemat' : 'Sama'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: DETAIL LOG STAFF (ALL CREW LIST) */}
      {viewMode === 'CREW_DETAIL' && (
        <div className="bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-users-cog text-amber-400"></i>
                Detail Jam Lembur Personil & Staff
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Daftar lengkap seluruh crew yang melakukan lembur pada periode terpilih
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-4">Nama Staff</th>
                  <th className="py-3 px-3">Outlet</th>
                  <th className="py-3 px-3">Divisi</th>
                  <th className="py-3 px-3 text-right">Week 1</th>
                  <th className="py-3 px-3 text-right">Week 2</th>
                  <th className="py-3 px-3 text-right">Week 3</th>
                  <th className="py-3 px-3 text-right">Week 4</th>
                  <th className="py-3 px-3 text-right text-amber-400">Total Jam</th>
                  <th className="py-3 px-4 text-right text-amber-400">Total Biaya OT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(() => {
                  const allCrewList: any[] = [];
                  outletOvertimeData.forEach(out => {
                    out.crewDetails.forEach(cr => {
                      if (!searchQuery || cr.name.toLowerCase().includes(searchQuery.toLowerCase()) || out.outlet.toLowerCase().includes(searchQuery.toLowerCase())) {
                        allCrewList.push({
                          ...cr,
                          outlet: out.outlet,
                          area: out.area
                        });
                      }
                    });
                  });

                  if (allCrewList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500 font-bold">
                          Tidak ada data lembur staff untuk filter yang dipilih.
                        </td>
                      </tr>
                    );
                  }

                  return allCrewList
                    .sort((a, b) => b.totalHours - a.totalHours)
                    .map((cr, idx) => (
                      <tr key={`${cr.outlet}-${cr.id}-${idx}`} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="font-black text-white uppercase text-xs">{cr.name}</div>
                          <div className="text-[10px] text-slate-400">ID: {cr.id}</div>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-300 uppercase text-[11px]">{cr.outlet}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            cr.normDiv === 'BAR' ? 'bg-amber-500/20 text-amber-300' :
                            cr.normDiv === 'KITCHEN' ? 'bg-rose-500/20 text-rose-300' :
                            cr.normDiv === 'SERVICE' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            {cr.division}
                          </span>
                        </td>
                        {cr.weekHours.map((wh: number, wIdx: number) => (
                          <td key={wIdx} className="py-3 px-3 text-right">
                            <span className={wh > 0 ? 'font-bold text-white' : 'text-slate-600'}>
                              {wh > 0 ? `${wh.toFixed(1)} h` : '-'}
                            </span>
                          </td>
                        ))}
                        <td className="py-3 px-3 text-right font-black text-amber-400 bg-amber-950/20">
                          {cr.totalHours.toFixed(1)} h
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-amber-400 bg-amber-950/20">
                          Rp {cr.totalPay.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OUTLET DETAIL MODAL */}
      {selectedOutletDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
            <div className="p-6 bg-slate-950 border-b border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                  Detail Overtime Outlet • Area {selectedOutletDetail.area}
                </span>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mt-0.5">
                  {selectedOutletDetail.outlet}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOutletForModal(null)}
                className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Outlet Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Jam Lembur</span>
                  <div className="text-xl font-black text-amber-400 mt-1">{selectedOutletDetail.totalHoursMTD.toFixed(1)} Jam</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Biaya OT</span>
                  <div className="text-xl font-black text-emerald-400 mt-1">Rp {selectedOutletDetail.totalPayMTD.toLocaleString('id-ID')}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Crew Lembur</span>
                  <div className="text-xl font-black text-indigo-300 mt-1">{selectedOutletDetail.activeOvertimeCrewCount} / {selectedOutletDetail.totalStaff}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Utilisasi Budget</span>
                  <div className="text-xl font-black text-cyan-300 mt-1">{selectedOutletDetail.utilization.toFixed(1)}%</div>
                </div>
              </div>

              {/* Division summary */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Distribusi per Divisi</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] font-black text-amber-300 uppercase block">BAR</span>
                    <div className="text-sm font-black text-white mt-1">{selectedOutletDetail.divBreakdown.BAR.hours.toFixed(1)} Jam</div>
                    <div className="text-[10px] text-slate-400 font-mono">Rp {selectedOutletDetail.divBreakdown.BAR.pay.toLocaleString('id-ID')}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-[10px] font-black text-rose-300 uppercase block">KITCHEN</span>
                    <div className="text-sm font-black text-white mt-1">{selectedOutletDetail.divBreakdown.KITCHEN.hours.toFixed(1)} Jam</div>
                    <div className="text-[10px] text-slate-400 font-mono">Rp {selectedOutletDetail.divBreakdown.KITCHEN.pay.toLocaleString('id-ID')}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <span className="text-[10px] font-black text-blue-300 uppercase block">SERVICE</span>
                    <div className="text-sm font-black text-white mt-1">{selectedOutletDetail.divBreakdown.SERVICE.hours.toFixed(1)} Jam</div>
                    <div className="text-[10px] text-slate-400 font-mono">Rp {selectedOutletDetail.divBreakdown.SERVICE.pay.toLocaleString('id-ID')}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <span className="text-[10px] font-black text-purple-300 uppercase block">STORE KEEPER</span>
                    <div className="text-sm font-black text-white mt-1">{selectedOutletDetail.divBreakdown['STORE KEEPER'].hours.toFixed(1)} Jam</div>
                    <div className="text-[10px] text-slate-400 font-mono">Rp {selectedOutletDetail.divBreakdown['STORE KEEPER'].pay.toLocaleString('id-ID')}</div>
                  </div>
                </div>
              </div>

              {/* Staff table */}
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Daftar Staff Lembur di {selectedOutletDetail.outlet}</h4>
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-white/10 font-bold">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-4">Nama Staff</th>
                        <th className="py-2.5 px-3">Divisi</th>
                        <th className="py-2.5 px-2 text-right">W1</th>
                        <th className="py-2.5 px-2 text-right">W2</th>
                        <th className="py-2.5 px-2 text-right">W3</th>
                        <th className="py-2.5 px-2 text-right">W4</th>
                        <th className="py-2.5 px-2 text-right">W5</th>
                        <th className="py-2.5 px-3 text-right text-amber-400">Total Jam</th>
                        <th className="py-2.5 px-3 text-right text-amber-400">Total Biaya</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedOutletDetail.crewDetails.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-6 text-center text-slate-500 font-bold">
                            Tidak ada record lembur staff untuk outlet ini.
                          </td>
                        </tr>
                      ) : (
                        selectedOutletDetail.crewDetails.map((cr, idx) => (
                          <tr key={cr.id} className="hover:bg-white/5">
                            <td className="py-2 px-3 text-slate-500 font-bold">{idx + 1}</td>
                            <td className="py-2 px-4 font-black text-white uppercase text-xs">{cr.name}</td>
                            <td className="py-2 px-3 text-[11px] text-slate-300 uppercase">{cr.division}</td>
                            {cr.weekHours.map((wh, wIdx) => (
                              <td key={wIdx} className="py-2 px-2 text-right text-slate-300">
                                {wh > 0 ? `${wh.toFixed(1)}h` : '-'}
                              </td>
                            ))}
                            <td className="py-2 px-3 text-right font-black text-amber-400">{cr.totalHours.toFixed(1)}h</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-400">Rp {cr.totalPay.toLocaleString('id-ID')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedOutletForModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SETTING BUDGET OVERTIME */}
      {showOtSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setShowOtSettingsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg cursor-pointer"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                <i className="fas fa-sliders-h"></i>
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-tight">Setting Budget Overtime</h3>
                <p className="text-xs text-slate-400">Atur budget jam dan tarif per jam per karyawan</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Budget Jam Overtime per Karyawan (Jam)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={tempBudgetHours}
                    onChange={(e) => setTempBudgetHours(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-bold text-sm focus:border-amber-400 focus:outline-none"
                    placeholder="Contoh: 35"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">Jam</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Harga / Tarif Overtime per Jam (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={tempRatePerHour}
                    onChange={(e) => setTempRatePerHour(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-bold text-sm focus:border-amber-400 focus:outline-none"
                    placeholder="Contoh: 15000"
                  />
                </div>
              </div>

              {/* LIVE FORMULA CALCULATION */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] font-black uppercase text-amber-400">Hasil Simulasi Kalkulasi Otomatis:</div>
                <div className="text-sm font-black text-white">
                  {tempBudgetHours} Jam × Rp {tempRatePerHour.toLocaleString('id-ID')} = <span className="text-amber-400 font-mono">Rp {(tempBudgetHours * tempRatePerHour).toLocaleString('id-ID')}</span> <span className="text-xs text-slate-400 font-normal">/ staff</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Total budget masing-masing outlet akan otomatis dikalikan dengan jumlah total manpower staff.
                </div>
              </div>

              {/* QUICK PRESETS */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Pilihan Cepat (Presets):</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { h: 35, r: 15000, label: '35 Jam @ Rp 15.000 (Standar)' },
                    { h: 40, r: 15000, label: '40 Jam @ Rp 15.000' },
                    { h: 30, r: 15000, label: '30 Jam @ Rp 15.000' },
                    { h: 35, r: 20000, label: '35 Jam @ Rp 20.000' }
                  ].map(p => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setTempBudgetHours(p.h);
                        setTempRatePerHour(p.r);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 hover:text-white border border-white/5 text-left cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowOtSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  saveStoredOtBudgetSettings({ budgetHours: tempBudgetHours, ratePerHour: tempRatePerHour });
                  setOtSettings({ budgetHours: tempBudgetHours, ratePerHour: tempRatePerHour });
                  setShowOtSettingsModal(false);
                  showToast?.(`Pengaturan Budget OT berhasil disimpan: ${tempBudgetHours} Jam × Rp ${tempRatePerHour.toLocaleString('id-ID')}`, 'success');
                }}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalWeeklyOvertimeRecapTable;
