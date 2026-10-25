import { AppState, Outlet, GSIRow, QAData, VoidBillRecord, OutletManpowerData } from '../types';
import { 
  OUTLETS, 
  getActiveOutletNames, 
  getAreaForOutlet, 
  getQaScoreTier, 
  QA_PASSING_SCORES,
  MONTHS,
  getActiveRegionalAreas
} from '../constants';
import { 
  extractOutletManpowerMap, 
  resolveOutletManpowerData, 
  calculateManpowerSummary 
} from './manpowerUtils';

export const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

export type WaReportPeriod = 'MTD' | 'WEEK_1' | 'WEEK_2' | 'WEEK_3' | 'WEEK_4';
export type WaReportScope = 'SELECTED' | 'AREA' | 'ALL';

const normalizeDivision = (rawDiv?: string): 'BAR' | 'KITCHEN' | 'SERVICE' | 'STORE KEEPER' | 'OTHER' => {
  if (!rawDiv) return 'OTHER';
  const up = rawDiv.toUpperCase().trim();
  if (up.includes('BAR')) return 'BAR';
  if (up.includes('KITCHEN') || up.includes('COOK') || up.includes('STEWARD') || up.includes('CHEF')) return 'KITCHEN';
  if (up.includes('SERVICE') || up.includes('FLOOR') || up.includes('GREETER') || up.includes('CASHIER') || up.includes('RUNNER') || up.includes('WAITER') || up.includes('WAITRESS')) return 'SERVICE';
  if (up.includes('STORE') || up.includes('LOGISTIK') || up.includes('KEEPER')) return 'STORE KEEPER';
  return 'OTHER';
};

/**
 * Returns date boundary for regular features according to chosen period (MTD, Week 1..4)
 */
export const getPeriodDayRange = (period: WaReportPeriod, daysInMonth: number): { startDay: number; endDay: number; label: string } => {
  switch (period) {
    case 'WEEK_1':
      return { startDay: 1, endDay: Math.min(7, daysInMonth), label: 'Week 1 (Tgl 01 - 07)' };
    case 'WEEK_2':
      return { startDay: 8, endDay: Math.min(14, daysInMonth), label: 'Week 2 (Tgl 08 - 14)' };
    case 'WEEK_3':
      return { startDay: 15, endDay: Math.min(21, daysInMonth), label: 'Week 3 (Tgl 15 - 21)' };
    case 'WEEK_4':
      return { startDay: 22, endDay: daysInMonth, label: `Week 4 (Tgl 22 - ${daysInMonth})` };
    case 'MTD':
    default:
      return { startDay: 1, endDay: daysInMonth, label: `MTD (Tgl 01 - ${daysInMonth})` };
  }
};

/**
 * Builds the exact structured WhatsApp report section for a single outlet
 */
export const buildSingleOutletWaReport = (
  outletName: string,
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData?: AppState,
  outletIndex: number = 1,
  period: WaReportPeriod = 'MTD',
  forcedAreaName?: string
): string => {
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;

  const { startDay, endDay, label: periodLabel } = getPeriodDayRange(period, daysInMonth);

  // Area resolution
  const areaName = forcedAreaName || getAreaForOutlet(outletName) || 'JAKARTA';

  // Outlet data resolution
  const outletDoc = (allOutletsData && allOutletsData[outletName]) || (allOutletsData && allOutletsData[outletName.trim()]) || {};
  const monthDoc = outletDoc[String(selectedMonth)] || outletDoc[selectedMonth] || outletDoc.monthlyData?.[String(selectedMonth)] || {};
  const prevMonthDoc = outletDoc[String(prevMonthIdx)] || outletDoc[prevMonthIdx] || outletDoc.monthlyData?.[String(prevMonthIdx)] || {};

  const sales = monthDoc.sales || outletDoc.sales || (globalData && globalData.outlet === outletName ? globalData.sales : {});
  const dailyRec = sales?.dailyRecording || monthDoc.dailyRecording || outletDoc.dailyRecording || {};
  const cogsData = monthDoc.monthlyCogsData?.[monthKey] || outletDoc.monthlyCogsData?.[monthKey] || {};

  // ==========================================
  // 1. REVENUE
  // ==========================================
  let mtdBudgetRevenue = 0;
  if (sales?.monthlyBudgets && sales.monthlyBudgets[monthKey] !== undefined) {
    mtdBudgetRevenue = Number(sales.monthlyBudgets[monthKey]) || 0;
  } else if (sales?.budgetRevenue !== undefined && Number(sales.budgetRevenue) > 0) {
    mtdBudgetRevenue = Number(sales.budgetRevenue) || 0;
  } else if (cogsData.strategyTargetRevenue !== undefined && Number(cogsData.strategyTargetRevenue) > 0) {
    mtdBudgetRevenue = Number(cogsData.strategyTargetRevenue) || 0;
  } else if (monthDoc.budgetRevenue !== undefined && Number(monthDoc.budgetRevenue) > 0) {
    mtdBudgetRevenue = Number(monthDoc.budgetRevenue) || 0;
  }

  // If a specific week is chosen, proportionally scale the budget for variance comparison
  if (period !== 'MTD') {
    const fraction = (endDay - startDay + 1) / daysInMonth;
    mtdBudgetRevenue = Math.round(mtdBudgetRevenue * fraction);
  }

  let totalActualRevenue = 0;
  let totalRevenueWeekdays = 0;
  let totalRevenueWeekend = 0;
  let pastWeekdayCount = 0;
  let pastWeekendCount = 0;
  let remainingWeekdayCount = 0;
  let remainingWeekendCount = 0;
  let totalLunchRevenue = 0;
  let totalDinnerRevenue = 0;

  // Belanja accumulators
  let belanjaMainStore = 0;
  let belanjaMainKitchen = 0;
  let belanjaCash = 0;
  let belanjaSupplier = 0;

  const partnerKeys = [
    'dailyTgifLedger', 'dailySukandaLedger', 'dailyPanfilaLedger', 
    'dailyEverestLedger', 'dailyIkigaiLedger', 'dailySaungKubilLedger', 'dailyKebunkuLedger'
  ];

  for (let d = startDay; d <= endDay; d++) {
    const dObj = new Date(selectedYear, selectedMonth, d);
    const dayOfWeek = dObj.getDay(); // 0 = Sun, 1..5 = Mon..Fri, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWeekday = !isWeekend;
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Revenue
    let dayRev = 0;
    let dayLunch = 0;
    let dayDinner = 0;
    const rec = dailyRec[dateStr] || dailyRec[String(d)];
    if (rec) {
      if (rec.revenue !== undefined && Number(rec.revenue) > 0) {
        dayRev = Number(rec.revenue);
      } else {
        const sumBreakdown = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) +
                             (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
        if (sumBreakdown > 0) dayRev = sumBreakdown;
      }

      dayLunch = Number(rec.lunchRevenue) || Number(rec.revenueLunch) || Number(rec.lunchActual) || Number(rec.lunchRev) || 0;
      dayDinner = Number(rec.dinnerRevenue) || Number(rec.revenueDinner) || Number(rec.dinnerActual) || Number(rec.dinnerRev) || 0;

      if (dayLunch === 0 && dayDinner === 0 && dayRev > 0) {
        dayLunch = Math.round(dayRev * 0.40);
        dayDinner = dayRev - dayLunch;
      } else if (dayDinner === 0 && dayRev > dayLunch && dayLunch > 0) {
        dayDinner = dayRev - dayLunch;
      } else if (dayLunch === 0 && dayRev > dayDinner && dayDinner > 0) {
        dayLunch = dayRev - dayDinner;
      }
    }

    if (dayRev > 0) {
      totalActualRevenue += dayRev;
      totalLunchRevenue += dayLunch;
      totalDinnerRevenue += dayDinner;

      if (isWeekday) {
        totalRevenueWeekdays += dayRev;
        pastWeekdayCount++;
      } else {
        totalRevenueWeekend += dayRev;
        pastWeekendCount++;
      }
    } else {
      if (isWeekday) remainingWeekdayCount++;
      else remainingWeekendCount++;
    }

    // Belanja calculation for dateStr
    // Main Store
    const storeList = monthDoc.dailyMainStoreLedger?.[dateStr] || outletDoc.dailyMainStoreLedger?.[dateStr];
    if (Array.isArray(storeList) && storeList.length > 0) {
      const storeSum = storeList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      let deductions = 0;
      const chemList = monthDoc.dailyChemicalLedger?.[dateStr] || outletDoc.dailyChemicalLedger?.[dateStr];
      if (Array.isArray(chemList)) deductions += chemList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      const atkList = monthDoc.dailyAtkLedger?.[dateStr] || outletDoc.dailyAtkLedger?.[dateStr];
      if (Array.isArray(atkList)) deductions += atkList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      belanjaMainStore += Math.max(0, storeSum - deductions);
    }

    // Main Kitchen
    const mkList = monthDoc.dailyMainKitchenLedger?.[dateStr] || outletDoc.dailyMainKitchenLedger?.[dateStr];
    if (Array.isArray(mkList) && mkList.length > 0) {
      belanjaMainKitchen += mkList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }

    // Cash & Commodity (Commodity Expense)
    const cashList = monthDoc.dailyCashLedger?.[dateStr] || outletDoc.dailyCashLedger?.[dateStr];
    if (Array.isArray(cashList) && cashList.length > 0) {
      belanjaCash += cashList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }
    const commList = monthDoc.dailyCommodityLedger?.[dateStr] || outletDoc.dailyCommodityLedger?.[dateStr];
    if (Array.isArray(commList) && commList.length > 0) {
      belanjaCash += commList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }

    // Partner Suppliers
    partnerKeys.forEach(k => {
      const supList = monthDoc[k]?.[dateStr] || outletDoc[k]?.[dateStr];
      if (Array.isArray(supList) && supList.length > 0) {
        belanjaSupplier += supList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    });
  }

  // Fallback expenses if ledgers are empty
  if (belanjaMainStore === 0 && belanjaMainKitchen === 0 && belanjaSupplier === 0 && belanjaCash === 0) {
    const expensesObj = monthDoc.expenses || outletDoc.expenses || {};
    Object.entries(expensesObj).forEach(([dStr, exp]: [string, any]) => {
      if (!exp) return;
      // Check date bounds
      const parts = dStr.split('-');
      if (parts.length >= 3) {
        const dNum = parseInt(parts[2], 10);
        if (dNum < startDay || dNum > endDay) return;
      }
      belanjaMainStore += Number(exp.mainStore) || 0;
      belanjaMainKitchen += Number(exp.mainKitchen) || 0;
      belanjaCash += (Number(exp.cash) || 0) + (Number(exp.commodity) || 0);
      belanjaSupplier += (Number(exp.tgif) || 0) + (Number(exp.sukanda) || 0) + 
                         (Number(exp.panfila) || 0) + (Number(exp.everest) || 0) + 
                         (Number(exp.ikigai) || 0) + (Number(exp.saungKubil) || 0) + 
                         (Number(exp.kebunku) || 0);
    });
  }

  const avgRevWeekdays = pastWeekdayCount > 0 ? Math.round(totalRevenueWeekdays / pastWeekdayCount) : 0;
  const avgRevWeekend = pastWeekendCount > 0 ? Math.round(totalRevenueWeekend / pastWeekendCount) : 0;

  const forecastSisaHari = Math.round((remainingWeekdayCount * avgRevWeekdays) + (remainingWeekendCount * avgRevWeekend));
  const mtdForecast = totalActualRevenue + forecastSisaHari;
  const revVariance = totalActualRevenue - mtdBudgetRevenue;

  const lunchContribPct = totalActualRevenue > 0 ? (totalLunchRevenue / totalActualRevenue) * 100 : 0;
  const dinnerContribPct = totalActualRevenue > 0 ? (totalDinnerRevenue / totalActualRevenue) * 100 : 0;

  // ==========================================
  // 2. BELANJA & 3. COGS
  // ==========================================
  let totalBelanja = belanjaMainStore + belanjaMainKitchen + belanjaSupplier + belanjaCash;
  if (cogsData.useManualMtdBelanja && Number(cogsData.manualMtdBelanja) > 0 && period === 'MTD') {
    totalBelanja = Number(cogsData.manualMtdBelanja);
  }
  const foodCostPct = totalActualRevenue > 0 ? (totalBelanja / totalActualRevenue) * 100 : 0;

  const beginInventory = Number(cogsData.beginningInventory) || 0;
  const rnd = Number(cogsData.rndCost || cogsData.rndExpenses || cogsData.rnd) || 0;
  const wrongmaker = Number(cogsData.wrongMakerCost || cogsData.wrongMakerExpenses || cogsData.wrongmaker) || 0;
  const budgetMarketing = Number(cogsData.marketingExpenses || cogsData.kolExpenses || cogsData.marketingKol || cogsData.budgetMarketing) || 0;

  const closingInvPercent = cogsData.closingInventoryPercent !== undefined 
    ? Number(cogsData.closingInventoryPercent) 
    : 10.0;
  const simulatedClosing = Math.round(mtdForecast * (closingInvPercent / 100));
  const hasEndingInv = cogsData.endingInventory !== undefined && Number(cogsData.endingInventory) > 0;
  const endingInventory = hasEndingInv ? Number(cogsData.endingInventory) : simulatedClosing;

  const cogsActual = Math.max(0, beginInventory + totalBelanja - endingInventory - rnd - wrongmaker - budgetMarketing);
  const cogsActualPct = totalActualRevenue > 0 ? (cogsActual / totalActualRevenue) * 100 : 0;

  // COGS PROJECTION
  const targetBudgetPercent = Number(cogsData.targetBudgetPercent || cogsData.targetCogsPercent) || 43.0;
  const budgetBelanja = Math.round(mtdForecast * (targetBudgetPercent / 100));
  const sisaBelanja = budgetBelanja - totalBelanja;
  const cogsProjected = Math.max(0, beginInventory + budgetBelanja - simulatedClosing);
  const cogsProjectedPct = mtdForecast > 0 ? (cogsProjected / mtdForecast) * 100 : 0;

  // ==========================================
  // 4. OVERTIME (Cut-off 26 - 25)
  // ==========================================
  const allManpower = extractOutletManpowerMap(outletDoc, globalData?.manpowerData);
  const mpData: OutletManpowerData = resolveOutletManpowerData(allManpower, outletName, monthKey);
  const mpSummary = calculateManpowerSummary(mpData);
  const totalManPower = mpSummary.grandTotalActual;

  const weekRanges = [
    { week: 1, startDate: `${prevMonthKey}-26`, endDate: `${monthKey}-01` },
    { week: 2, startDate: `${monthKey}-02`, endDate: `${monthKey}-08` },
    { week: 3, startDate: `${monthKey}-09`, endDate: `${monthKey}-15` },
    { week: 4, startDate: `${monthKey}-16`, endDate: `${monthKey}-25` },
  ];

  const allDailyOT: Record<string, any[]> = {};
  const mergeOT = (source: Record<string, any[]>) => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([dStr, arr]) => {
      if (!Array.isArray(arr)) return;
      if (!allDailyOT[dStr]) allDailyOT[dStr] = [];
      arr.forEach((e: any) => {
        if (!e) return;
        if (!e.outlet || e.outlet === outletName) allDailyOT[dStr].push(e);
      });
    });
  };
  mergeOT(prevMonthDoc.dailyOvertime || {});
  mergeOT(monthDoc.dailyOvertime || outletDoc.dailyOvertime || {});

  const kWeeklyHours = [0, 0, 0, 0];
  const bWeeklyHours = [0, 0, 0, 0];
  const sWeeklyHours = [0, 0, 0, 0];

  const kWeeklyPay = [0, 0, 0, 0];
  const bWeeklyPay = [0, 0, 0, 0];
  const sWeeklyPay = [0, 0, 0, 0];

  weekRanges.forEach((wRange, wIdx) => {
    Object.entries(allDailyOT).forEach(([dateStr, entries]) => {
      if (dateStr >= wRange.startDate && dateStr <= wRange.endDate && Array.isArray(entries)) {
        entries.forEach(e => {
          if (!e) return;
          const rawHours = Number(e.overtimeHours) || Number(e.hours) || Number(e.duration) || 0;
          const rawPay = Number(e.pay) || Number(e.overtimePay) || (rawHours * 15000);
          const div = normalizeDivision(e.division || e.role);

          if (div === 'KITCHEN' || div === 'STORE KEEPER') {
            kWeeklyHours[wIdx] += rawHours;
            kWeeklyPay[wIdx] += rawPay;
          } else if (div === 'BAR') {
            bWeeklyHours[wIdx] += rawHours;
            bWeeklyPay[wIdx] += rawPay;
          } else if (div === 'SERVICE') {
            sWeeklyHours[wIdx] += rawHours;
            sWeeklyPay[wIdx] += rawPay;
          }
        });
      }
    });
  });

  const kStaffDivCount = Math.max(0, mpSummary.kitchenActual + mpSummary.stewardActual + mpSummary.storekeeperActual);
  const bStaffDivCount = Math.max(0, mpSummary.barActual);
  const sStaffDivCount = Math.max(0, mpSummary.serviceActual + mpSummary.paActual);

  const kTotalHours = kWeeklyHours.reduce((a, b) => a + b, 0);
  const bTotalHours = bWeeklyHours.reduce((a, b) => a + b, 0);
  const sTotalHours = sWeeklyHours.reduce((a, b) => a + b, 0);

  // Format overtime line: "12.5 / Jam" or "0 / Jam"
  const formatOtHours = (h: number): string => {
    return `${h > 0 ? h.toFixed(1) : '0'} / Jam`;
  };

  // ==========================================
  // 5. MAN POWER DETAILS
  // ==========================================
  const sections = mpData?.sections || [];

  const getSectionStaffCount = (matcher: RegExp, div?: string): string => {
    const sec = sections.find(s => matcher.test(s.name) && (!div || s.division === div));
    if (!sec) return '0 Orang';
    const filledCount = sec.slots.filter(sl => sl.status === 'FILLED').length;
    return `${filledCount} Orang`;
  };

  const getVacantList = (div: string, status: 'VACANT_OPEN' | 'VACANT_HOLD'): string => {
    const divSecs = sections.filter(s => {
      if (div === 'KITCHEN') return s.division === 'KITCHEN' || s.name.includes('STEWARD') || s.name.includes('STORE');
      if (div === 'SERVICE') return s.division === 'SERVICE' || s.name.includes('PUBLIC');
      return s.division === div;
    });
    const slots = divSecs.flatMap(s => s.slots).filter(sl => sl.status === status);
    const bullet = status === 'VACANT_OPEN' ? '*' : (div === 'SERVICE' ? '*' : '-');
    if (slots.length === 0) {
      return status === 'VACANT_OPEN' ? '* ' : (div === 'SERVICE' ? '* ' : '-');
    }
    
    const map: Record<string, number> = {};
    slots.forEach(s => {
      const role = (s.position || 'Staff').trim();
      map[role] = (map[role] || 0) + 1;
    });
    return Object.entries(map).map(([r, c]) => `${bullet} ${c} ${r}`).join('\n');
  };

  // Kitchen
  const kLeader = getSectionStaffCount(/leader|chef|spv|supervisor/i, 'KITCHEN');
  const kGrill = getSectionStaffCount(/grill/i, 'KITCHEN');
  const kAsian = getSectionStaffCount(/asian/i, 'KITCHEN');
  const kFryer = getSectionStaffCount(/fryer/i, 'KITCHEN');
  const kPrep = getSectionStaffCount(/prep/i, 'KITCHEN');
  const kSteward = getSectionStaffCount(/steward/i);
  const kStore = getSectionStaffCount(/store/i);
  const kVacantOpen = getVacantList('KITCHEN', 'VACANT_OPEN');
  const kVacantHold = getVacantList('KITCHEN', 'VACANT_HOLD');

  // Bar
  const barSec = sections.find(s => s.division === 'BAR');
  const barSlots = barSec ? barSec.slots : [];
  const barLeaderCount = barSlots.filter(s => s.status === 'FILLED' && /captain|leader|spv|supervisor|head/i.test(s.position)).length;
  const barBaristaCount = barSlots.filter(s => s.status === 'FILLED' && !/captain|leader|spv|supervisor|head/i.test(s.position)).length;
  const bLeader = `${barLeaderCount} Orang`;
  const bBarista = `${barBaristaCount} Orang`;
  const bVacantOpen = getVacantList('BAR', 'VACANT_OPEN');
  const bVacantHold = getVacantList('BAR', 'VACANT_HOLD');

  // Service
  const sLeader = getSectionStaffCount(/leader|manager|supervisor|captain/i, 'SERVICE');
  const sCashier = getSectionStaffCount(/cashier/i, 'SERVICE');
  const sGreeter = getSectionStaffCount(/greeter/i, 'SERVICE');
  const sChecker = getSectionStaffCount(/checker/i, 'SERVICE');
  const sServer = getSectionStaffCount(/server|waiter/i, 'SERVICE');
  const sVacantOpen = getVacantList('SERVICE', 'VACANT_OPEN');
  const sVacantHold = getVacantList('SERVICE', 'VACANT_HOLD');

  // ==========================================
  // 6. GOOGLE REVIEW
  // ==========================================
  const dailyGR: Record<string, any> = {
    ...(outletDoc.dailyGoogleReview || {}),
    ...(monthDoc.dailyGoogleReview || {})
  };
  let grS1 = 0, grS2 = 0, grS3 = 0, grS4 = 0, grS5 = 0;
  Object.entries(dailyGR).forEach(([dStr, r]: [string, any]) => {
    if (dStr.startsWith(monthKey) && r) {
      grS1 += Number(r.stars1) || 0;
      grS2 += Number(r.stars2) || 0;
      grS3 += Number(r.stars3) || 0;
      grS4 += Number(r.stars4) || 0;
      grS5 += Number(r.stars5) || 0;
    }
  });
  let totalReviewMtd = grS1 + grS2 + grS3 + grS4 + grS5;
  let totalPointsMtd = (grS1 * 1) + (grS2 * 2) + (grS3 * 3) + (grS4 * 4) + (grS5 * 5);
  let currentRating = totalReviewMtd > 0 ? Number((totalPointsMtd / totalReviewMtd).toFixed(2)) : 0;

  const directGr = monthDoc.googleReview || outletDoc.googleReview || {};
  if (totalReviewMtd === 0 && Number(directGr.totalReview) > 0) {
    totalReviewMtd = Number(directGr.totalReview) || 0;
    currentRating = Number(directGr.currentRating) || 0;
  }

  const prevGR: Record<string, any> = {
    ...(outletDoc.dailyGoogleReview || {}),
    ...(prevMonthDoc.dailyGoogleReview || {})
  };
  let prevS1 = 0, prevS2 = 0, prevS3 = 0, prevS4 = 0, prevS5 = 0;
  Object.entries(prevGR).forEach(([dStr, r]: [string, any]) => {
    if (dStr.startsWith(prevMonthKey) && r) {
      prevS1 += Number(r.stars1) || 0;
      prevS2 += Number(r.stars2) || 0;
      prevS3 += Number(r.stars3) || 0;
      prevS4 += Number(r.stars4) || 0;
      prevS5 += Number(r.stars5) || 0;
    }
  });
  const prevTotalRev = prevS1 + prevS2 + prevS3 + prevS4 + prevS5;
  const prevRating = prevTotalRev > 0 ? ((prevS1 * 1) + (prevS2 * 2) + (prevS3 * 3) + (prevS4 * 4) + (prevS5 * 5)) / prevTotalRev : 0;

  const varianceReview = totalReviewMtd - prevTotalRev;
  const varianceRating = currentRating - prevRating;

  // ==========================================
  // 7. GSI
  // ==========================================
  const dailyGSI: Record<string, GSIRow[]> = {
    ...(outletDoc.dailyGSI || {}),
    ...(monthDoc.dailyGSI || {})
  };
  let gsiTotalResponses = 0;
  let gsiPointsSum = 0;
  let gsiMaxPointsSum = 0;

  Object.entries(dailyGSI).forEach(([dStr, rows]) => {
    if (dStr.startsWith(monthKey) && Array.isArray(rows)) {
      let dayMax = 0;
      rows.forEach(r => {
        const exc = Number(r.excellent) || 0;
        const gd = Number(r.good) || 0;
        const avg = Number(r.average) || 0;
        const pr = Number(r.poor) || 0;
        const abs = Number(r.abstain) || 0;
        const resp = exc + gd + avg + pr + abs;
        if (resp > dayMax) dayMax = resp;

        const pts = (exc * 4) + (gd * 3) + (avg * 2) + (pr * 1);
        const maxPts = (exc + gd + avg + pr) * 4;
        gsiPointsSum += pts;
        gsiMaxPointsSum += maxPts;
      });
      gsiTotalResponses += dayMax;
    }
  });

  const gsiPerformance = gsiMaxPointsSum > 0 ? (gsiPointsSum / gsiMaxPointsSum) * 100 : 0;

  const prevDailyGSI: Record<string, GSIRow[]> = {
    ...(outletDoc.dailyGSI || {}),
    ...(prevMonthDoc.dailyGSI || {})
  };
  let prevGsiResponses = 0;
  let prevGsiPts = 0;
  let prevGsiMaxPts = 0;
  Object.entries(prevDailyGSI).forEach(([dStr, rows]) => {
    if (dStr.startsWith(prevMonthKey) && Array.isArray(rows)) {
      let dayMax = 0;
      rows.forEach(r => {
        const exc = Number(r.excellent) || 0;
        const gd = Number(r.good) || 0;
        const avg = Number(r.average) || 0;
        const pr = Number(r.poor) || 0;
        const abs = Number(r.abstain) || 0;
        const resp = exc + gd + avg + pr + abs;
        if (resp > dayMax) dayMax = resp;
        prevGsiPts += (exc * 4) + (gd * 3) + (avg * 2) + (pr * 1);
        prevGsiMaxPts += (exc + gd + avg + pr) * 4;
      });
      prevGsiResponses += dayMax;
    }
  });
  const prevGsiPerf = prevGsiMaxPts > 0 ? (prevGsiPts / prevGsiMaxPts) * 100 : 0;

  const varGsiResponses = gsiTotalResponses - prevGsiResponses;
  const varGsiPerf = gsiPerformance - prevGsiPerf;

  // ==========================================
  // 8. CITY LEDGER, GUEST SATISFACTION, COMPLIMENTARY
  // ==========================================
  const extractLedgerSummary = (ledgerObj?: Record<string, any[]>) => {
    if (!ledgerObj || typeof ledgerObj !== 'object') {
      return { total: 0, items: [] as { name: string; qty: number; price: number; reason: string }[] };
    }
    let total = 0;
    const items: { name: string; qty: number; price: number; reason: string }[] = [];
    Object.entries(ledgerObj).forEach(([dStr, list]) => {
      // Date filter check
      let inRange = dStr.startsWith(monthKey);
      if (period !== 'MTD' && inRange) {
        const parts = dStr.split('-');
        if (parts.length >= 3) {
          const dayNum = parseInt(parts[2], 10);
          inRange = dayNum >= startDay && dayNum <= endDay;
        }
      }

      if (inRange && Array.isArray(list)) {
        list.forEach(it => {
          if (!it) return;
          const q = Number(it.qty) || 1;
          const p = Number(it.price) || 0;
          const sub = q * p;
          total += sub;
          items.push({
            name: it.name || it.itemName || it.description || 'Item',
            qty: q,
            price: p,
            reason: it.reason || it.notes || it.keterangan || '-'
          });
        });
      }
    });
    return { total, items };
  };

  const cityLedgerData = extractLedgerSummary(monthDoc.dailyCityLedger || outletDoc.dailyCityLedger);
  const guestSatData = extractLedgerSummary(monthDoc.dailyGuestSatisfaction || monthDoc.dailySatisfaction || outletDoc.dailyGuestSatisfaction);
  const compData = extractLedgerSummary(monthDoc.dailyComplimentary || outletDoc.dailyComplimentary);

  const formatLedgerLines = (data: { total: number; items: { name: string; qty: number; price: number; reason: string }[] }) => {
    if (data.items.length === 0) {
      return `_Nama Item_ :\n_Reason_ :`;
    }
    const itemNames = data.items.map(it => `${it.name}${it.qty > 1 ? ` (${it.qty}x)` : ''}`).slice(0, 5).join(', ');
    const reasons = Array.from(new Set(data.items.map(it => it.reason).filter(r => r && r !== '-'))).slice(0, 3).join(', ') || '-';
    return `_Nama Item_ : ${itemNames}\n_Reason_ : ${reasons}`;
  };

  // ==========================================
  // 9. VOID BIL
  // ==========================================
  const voidRecords: VoidBillRecord[] = [];
  const addVoids = (vObj?: any) => {
    if (!vObj) return;
    if (Array.isArray(vObj)) {
      vObj.forEach((r: any) => {
        if (r && String(r.date || '').startsWith(monthKey)) {
          if (period !== 'MTD') {
            const dayNum = parseInt(String(r.date || '').split('-')[2], 10);
            if (dayNum < startDay || dayNum > endDay) return;
          }
          if (!r.outlet || r.outlet === outletName) voidRecords.push(r);
        }
      });
    } else if (typeof vObj === 'object') {
      Object.entries(vObj).forEach(([dKey, list]) => {
        let inRange = String(dKey).startsWith(monthKey);
        if (period !== 'MTD' && inRange) {
          const dayNum = parseInt(dKey.split('-')[2], 10);
          inRange = dayNum >= startDay && dayNum <= endDay;
        }
        if (inRange && Array.isArray(list)) {
          list.forEach((r: any) => {
            if (r && (!r.outlet || r.outlet === outletName)) voidRecords.push(r);
          });
        }
      });
    }
  };
  addVoids(monthDoc.dailyVoidBills || outletDoc.dailyVoidBills);
  addVoids(monthDoc.voidBills || outletDoc.voidBills);

  const staffVoidMap = new Map<string, Array<{ amount: number; reason: string }>>();
  voidRecords.forEach(r => {
    const sName = (r.staffName || (r as any).name || 'Staff').trim();
    if (!staffVoidMap.has(sName)) {
      staffVoidMap.set(sName, []);
    }
    const amt = Number(r.amount) || Number((r as any).price) || Number((r as any).totalPrice) || 0;
    const rsn = r.reason || (r as any).notes || (r as any).keterangan || '-';
    staffVoidMap.get(sName)!.push({ amount: amt, reason: rsn });
  });

  const staffVoidList = Array.from(staffVoidMap.entries()).sort((a, b) => b[1].length - a[1].length);
  let voidBillSectionText = '';
  if (staffVoidList.length > 0) {
    voidBillSectionText = staffVoidList.map(([name, errs], idx) => {
      const repeatTag = ` (${errs.length}x Kesalahan)`;
      const staffHeader = `_${idx + 1}. Nama Staff_: ${name}${repeatTag}`;
      const errsText = errs.map((err, eIdx) => {
        return `_Kesalahan ${eIdx + 1}_\n_Total Price_: Rp. ${formatIDR(err.amount)}\n_Reason_: ${err.reason}`;
      }).join('\n\n');
      return `${staffHeader}\n${errsText}`;
    }).join('\n\n');
  } else {
    voidBillSectionText = `_1. Nama Staff_:\n_Kesalahan 1_\n_Total Price_: Rp. 0\n_Reason_: -`;
  }

  // ==========================================
  // 10. QA REPORT
  // ==========================================
  const dailyQA: Record<string, QAData> = {
    ...(outletDoc.dailyQA || {}),
    ...(monthDoc.dailyQA || {})
  };
  let qaKSum = 0, qaKCount = 0;
  let qaBSum = 0, qaBCount = 0;
  let qaSSum = 0, qaSCount = 0;

  Object.entries(dailyQA).forEach(([dStr, qa]) => {
    if (dStr.startsWith(monthKey) && qa) {
      const getSecAvg = (sec?: any) => {
        if (!sec) return 0;
        const vals = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const k = getSecAvg(qa.kitchen);
      const b = getSecAvg(qa.bar);
      const s = getSecAvg(qa.service);

      if (k > 0) { qaKSum += k; qaKCount++; }
      if (b > 0) { qaBSum += b; qaBCount++; }
      if (s > 0) { qaSSum += s; qaSCount++; }
    }
  });

  const qaKitchenScore = qaKCount > 0 ? Number((qaKSum / qaKCount).toFixed(1)) : 0;
  const qaBarScore = qaBCount > 0 ? Number((qaBSum / qaBCount).toFixed(1)) : 0;
  const qaServiceScore = qaSCount > 0 ? Number((qaSSum / qaSCount).toFixed(1)) : 0;

  const validDivs = [qaKitchenScore, qaBarScore, qaServiceScore].filter(v => v > 0);
  const qaTotalScore = validDivs.length > 0 ? Number((validDivs.reduce((a, b) => a + b, 0) / validDivs.length).toFixed(1)) : 0;

  const getTierLabel = (score: number): string => {
    if (score === 0) return 'Parameters To Improve';
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Satisfactory';
    return 'Parameters To Improve';
  };

  const qaKitchenParam = getTierLabel(qaKitchenScore);
  const qaBarParam = getTierLabel(qaBarScore);
  const qaServiceParam = getTierLabel(qaServiceScore);
  const qaAllStatus = getTierLabel(qaTotalScore);

  // ==========================================
  // ASSEMBLE COMPLETE REPORT ACCORDING TO USER'S EXACT TEMPLATE
  // ==========================================
  let text = '';
  text += `*REKAPITULATION OUTLET*\n`;
  text += `*AREA* : ${areaName.toUpperCase()}\n\n`;
  text += `${outletIndex}. *${outletName.toUpperCase()}*\n\n`;

  // *REVENUE*
  text += `*REVENUE*\n`;
  text += `* MTD Revenue : Rp. ${formatIDR(totalActualRevenue)}\n`;
  text += `* MTD Budget Revenue : Rp. ${formatIDR(mtdBudgetRevenue)}\n`;
  text += `* Variance MTD Budget : ${revVariance < 0 ? '-Rp. ' : 'Rp. '}${formatIDR(Math.abs(revVariance))}\n`;
  text += `* MTD Forecast : Rp. ${formatIDR(mtdForecast)}\n\n`;

  text += `* Total Revenue Weekdays : Rp. ${formatIDR(totalRevenueWeekdays)}\n`;
  text += `* Total Revenue Weekend : Rp. ${formatIDR(totalRevenueWeekend)}\n`;
  text += `* Rata² Revenue Weekdays : Rp. ${formatIDR(avgRevWeekdays)}\n`;
  text += `* Rata² Revenue Weekend : Rp. ${formatIDR(avgRevWeekend)}\n`;
  text += `* MTD Rata" Contribution Lunch : ${lunchContribPct.toFixed(1)}%\n`;
  text += `* MTD Rata" Contribution Dinner : ${dinnerContribPct.toFixed(1)}%\n\n`;

  // *BELANJA*
  text += `*BELANJA*\n`;
  text += `* Main Store : Rp. ${formatIDR(belanjaMainStore)}\n`;
  text += `* Main Kitchen : Rp. ${formatIDR(belanjaMainKitchen)}\n`;
  text += `* Supplier : Rp. ${formatIDR(belanjaSupplier)}\n`;
  text += `* Cash : Rp. ${formatIDR(belanjaCash)} (Commodity Expense)\n`;
  text += `* Total Belanja : Rp. ${formatIDR(totalBelanja)}\n`;
  text += `* Food Cost : ${foodCostPct.toFixed(2)}%\n\n`;

  // *COGS ACTUAL*
  text += `*COGS ACTUAL*\n`;
  text += `* Begin Inventory : Rp. ${formatIDR(beginInventory)}\n`;
  text += `* Actual Total Belanja : Rp. ${formatIDR(totalBelanja)}\n`;
  text += `* Rnd : Rp. ${formatIDR(rnd)}\n`;
  text += `* Wrongmaker : Rp. ${formatIDR(wrongmaker)}\n`;
  text += `* Budget Marketing/KOL : Rp. ${formatIDR(budgetMarketing)}\n`;
  text += `* Ending Inventory : Rp. ${formatIDR(endingInventory)}\n`;
  text += `* COGS Actual : Rp. ${formatIDR(cogsActual)}\n`;
  text += `* COGS (%) : ${cogsActualPct.toFixed(2)}%\n`;
  text += `* FOOD COST (%) : ${foodCostPct.toFixed(2)}%\n\n`;

  // *COGS PROJECTION*
  text += `*COGS PROJECTION*\n`;
  text += `* Begin Inventory : Rp. ${formatIDR(beginInventory)}\n`;
  text += `* Budget Belanja : Rp. ${formatIDR(budgetBelanja)}\n`;
  text += `* Total Belanja : Rp. ${formatIDR(totalBelanja)}\n`;
  text += `* Sisa Belanja : Rp. ${formatIDR(sisaBelanja)}\n`;
  text += `* Closing Inventory : Rp. ${formatIDR(simulatedClosing)}\n`;
  text += `* COGS Actual : Rp. ${formatIDR(cogsProjected)}\n`;
  text += `* COGS (%) : ${cogsProjectedPct.toFixed(2)}%\n\n`;

  // *OVERTIME* (Cut Off 26 - 25)
  text += `*OVERTIME*\n`;
  text += `TOTAL MANA POWER : ${totalManPower} Orang\n`;
  text += `* *Kitchen* : ${kStaffDivCount} Orang\n`;
  text += `_Week 1_: ${formatOtHours(kWeeklyHours[0])}\n`;
  text += `_Week 2_: ${formatOtHours(kWeeklyHours[1])}\n`;
  text += `_Week 3_: ${formatOtHours(kWeeklyHours[2])}\n`;
  text += `_Week 4_: ${formatOtHours(kWeeklyHours[3])}\n`;
  text += `_Total Overtime_ : ${formatOtHours(kTotalHours)}\n\n`;

  text += `* *Bar* : ${bStaffDivCount} Orang\n`;
  text += `_Week 1_: ${formatOtHours(bWeeklyHours[0])}\n`;
  text += `_Week 2_: ${formatOtHours(bWeeklyHours[1])}\n`;
  text += `_Week 3_: ${formatOtHours(bWeeklyHours[2])}\n`;
  text += `_Week 4_: ${formatOtHours(bWeeklyHours[3])}\n`;
  text += `_Total Overtime_ : ${formatOtHours(bTotalHours)}\n\n`;

  text += `* *Service*: ${sStaffDivCount} Orang\n`;
  text += `_Week 1_: ${formatOtHours(sWeeklyHours[0])}\n`;
  text += `_Week 2_: ${formatOtHours(sWeeklyHours[1])}\n`;
  text += `_Week 3_: ${formatOtHours(sWeeklyHours[2])}\n`;
  text += `_Week 4_: ${formatOtHours(sWeeklyHours[3])}\n`;
  text += `_Total Overtime_ : ${formatOtHours(sTotalHours)}\n\n\n`;

  // *MAN POWER*
  text += `*MAN POWER*\n`;
  text += `*Kitchen* : ${kStaffDivCount} Orang\n`;
  text += `_Leader_ : ${kLeader}\n`;
  text += `_Grilled Section_ : ${kGrill}\n`;
  text += `_Asian Section_ : ${kAsian}\n`;
  text += `_Fryer Section_ : ${kFryer}\n`;
  text += `_Preparation_ : ${kPrep}\n`;
  text += `_Steward_ : ${kSteward}\n`;
  text += `_Store Keeper_: ${kStore}\n`;
  text += `*Vacant Open*\n${kVacantOpen}\n`;
  text += `*Vacant Hold*\n${kVacantHold}\n\n\n\n`;

  text += `*Bar*: ${bStaffDivCount} Orang\n`;
  text += `_Leader_: ${bLeader}\n`;
  text += `_Barista_: ${bBarista}\n`;
  text += `*Vacant Open*\n${bVacantOpen}\n`;
  text += `*Vacant Hold*\n${bVacantHold}\n\n\n`;

  text += `*Service* : ${sStaffDivCount} Orang\n`;
  text += `_Leader_ : ${sLeader}\n`;
  text += `_Cashier_: ${sCashier}\n`;
  text += `_Greeter_: ${sGreeter}\n`;
  text += `_Checker_: ${sChecker}\n`;
  text += `_Server_: ${sServer}\n`;
  text += `*Vacant Open*\n${sVacantOpen}\n`;
  text += `*Vacant Hold*\n${sVacantHold}\n\n`;

  // *GOOGLE REVIEW*
  text += `*GOOGLE REVIEW*\n`;
  text += `* Total Review : ${totalReviewMtd} Review\n`;
  text += `* Total Rating : ${currentRating > 0 ? `${currentRating.toFixed(2)} ⭐` : '0 ⭐'}\n`;
  text += `* Variance Total MTD Review VS Last Month : ${varianceReview >= 0 ? '+' : ''}${varianceReview} Review\n`;
  text += `* Variance MTD Total Rating Vs Last Month : ${varianceRating >= 0 ? '+' : ''}${varianceRating.toFixed(2)} ⭐\n\n`;

  // *GSI*
  text += `*GSI*\n`;
  text += `* Total Review : ${gsiTotalResponses} Review\n`;
  text += `* Performance : ${gsiPerformance.toFixed(1)}%\n`;
  text += `* Variance MTD Total Review Vs MTD Last Month : ${varGsiResponses >= 0 ? '+' : ''}${varGsiResponses} Review\n`;
  text += `* Variance MTD Performance Vs MTD Last Month : ${varGsiPerf >= 0 ? '+' : ''}${varGsiPerf.toFixed(1)}%\n`;
  text += `* Performance (%) : ${gsiPerformance.toFixed(1)}%\n\n`;

  // *CITY LEDGER*
  text += `*CITY LEDGER*\n`;
  text += `* Total Price : Rp. ${formatIDR(cityLedgerData.total)}\n`;
  text += `${formatLedgerLines(cityLedgerData)}\n\n`;

  // *GUEST SATISFACTION*
  text += `*GUEST SATISFACTION*\n`;
  text += `* Total Price : Rp. ${formatIDR(guestSatData.total)}\n`;
  text += `${formatLedgerLines(guestSatData)}\n\n`;

  // *COMPLIMENTARY*
  text += `*COMPLIMENTARY*\n`;
  text += `* Total Price : Rp. ${formatIDR(compData.total)}\n`;
  text += `${formatLedgerLines(compData)}\n\n\n`;

  // *VOID BIL*
  text += `*VOID BIL*\n`;
  text += `${voidBillSectionText}\n\n`;

  // *QA REPORT*
  text += `*QA REPORT* (Parameters To Improve, Satisfactory / Excellent)\n\n`;
  text += `* *Service* \n`;
  text += `_Nilai_ (%) : ${qaServiceScore > 0 ? `${qaServiceScore.toFixed(1)}%` : '0%'}\n`;
  text += `_Parameters_: ${qaServiceParam}\n`;
  text += `* *Bar* :\n`;
  text += `_Nilai_ (%) : ${qaBarScore > 0 ? `${qaBarScore.toFixed(1)}%` : '0%'}\n`;
  text += `_Parameters_: ${qaBarParam}\n`;
  text += `* *Kitchen*\n`;
  text += `_Nilai_ (%) : ${qaKitchenScore > 0 ? `${qaKitchenScore.toFixed(1)}%` : '0%'}\n`;
  text += `_Parameters_ : ${qaKitchenParam}\n`;
  text += `*Total Nilai Outlet (%)*: ${qaTotalScore > 0 ? `${qaTotalScore.toFixed(1)}%` : '0%'}\n`;
  text += `*Status Parameters All Divisi* : ${qaAllStatus}`;

  return text;
};

/**
 * Builds report for a selected Area (e.g. JAKARTA, TANGGERANG, BEKASI)
 */
export const buildAreaWaReport = (
  areaName: string,
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData?: AppState,
  period: WaReportPeriod = 'MTD'
): string => {
  const activeAreas = getActiveRegionalAreas();
  const outletList = activeAreas[areaName] || [];

  if (outletList.length === 0) {
    return `*REKAPITULATION OUTLET*\n*AREA* : ${areaName.toUpperCase()}\n\n_Tidak ada outlet aktif di area ini._`;
  }

  const sections = outletList.map((oName, idx) => {
    return buildSingleOutletWaReport(oName, selectedMonth, selectedYear, allOutletsData, globalData, idx + 1, period, areaName);
  });

  return sections.join('\n\n==============================\n\n');
};

/**
 * Builds the complete WhatsApp report for ALL outlets across all areas
 */
export const buildAllOutletsWaReport = (
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData?: AppState,
  targetOutlets?: string[],
  period: WaReportPeriod = 'MTD'
): string => {
  const activeNames = targetOutlets && targetOutlets.length > 0
    ? targetOutlets
    : getActiveOutletNames().filter(name => {
        const d = allOutletsData?.[name];
        return !d || !d.isDeleted;
      });

  const outletSections = activeNames.map((oName, idx) => {
    const area = getAreaForOutlet(oName) || 'JAKARTA';
    return buildSingleOutletWaReport(oName, selectedMonth, selectedYear, allOutletsData, globalData, idx + 1, period, area);
  });

  return outletSections.join('\n\n==============================\n\n');
};

export interface GenerateWaReportOptions {
  allOutletsData: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  scope?: WaReportScope;
  period?: WaReportPeriod;
  targetOutlet?: string;
  targetArea?: string;
  globalData?: AppState;
}

/**
 * High-level unified generator for WhatsApp report
 */
export const generateRegionalWaReport = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  scope = 'SELECTED',
  period = 'MTD',
  targetOutlet,
  targetArea,
  globalData,
}: GenerateWaReportOptions): string => {
  if (scope === 'SELECTED') {
    const outlet = targetOutlet || getActiveOutletNames()[0] || 'SH CIPETE';
    const area = targetArea || getAreaForOutlet(outlet) || 'JAKARTA';
    return buildSingleOutletWaReport(outlet, selectedMonth, selectedYear, allOutletsData, globalData, 1, period, area);
  }
  if (scope === 'AREA') {
    const area = targetArea || 'JAKARTA';
    return buildAreaWaReport(area, selectedMonth, selectedYear, allOutletsData, globalData, period);
  }
  return buildAllOutletsWaReport(selectedMonth, selectedYear, allOutletsData, globalData, undefined, period);
};
