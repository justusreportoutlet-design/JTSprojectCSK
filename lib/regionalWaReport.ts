import { AppState, Outlet, GSIRow, QAData, VoidBillRecord, OutletManpowerData } from '../types';
import { 
  OUTLETS, 
  getActiveOutletNames, 
  getAreaForOutlet, 
  getQaScoreTier, 
  QA_PASSING_SCORES 
} from '../constants';
import { 
  extractOutletManpowerMap, 
  resolveOutletManpowerData, 
  calculateManpowerSummary, 
  getFilledStaff 
} from './manpowerUtils';

export const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

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
 * Builds the exact structured WhatsApp report section for a single outlet
 */
export const buildSingleOutletWaReport = (
  outletName: string,
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData: AppState,
  outletIndex: number = 1
): string => {
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;

  // Outlet data resolution
  const outletDoc = (allOutletsData && allOutletsData[outletName]) || {};
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

  for (let d = 1; d <= daysInMonth; d++) {
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

    // Cash & Commodity
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
    Object.values(expensesObj).forEach((exp: any) => {
      if (!exp) return;
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
  // 2. BELANJA
  // ==========================================
  let totalBelanja = belanjaMainStore + belanjaMainKitchen + belanjaSupplier + belanjaCash;
  if (cogsData.useManualMtdBelanja && Number(cogsData.manualMtdBelanja) > 0) {
    totalBelanja = Number(cogsData.manualMtdBelanja);
  }
  const foodCostPct = totalActualRevenue > 0 ? (totalBelanja / totalActualRevenue) * 100 : 0;

  // ==========================================
  // 3. COGS
  // ==========================================
  const beginInventory = Number(cogsData.beginningInventory) || 0;
  const rnd = Number(cogsData.rnd) || 0;
  const wrongmaker = Number(cogsData.wrongMaker) || 0;
  const budgetMarketing = Number(cogsData.marketingKol) || 0;

  const closingInvPercent = cogsData.closingInventoryPercent !== undefined 
    ? Number(cogsData.closingInventoryPercent) 
    : 10.0;
  const simulatedClosing = Math.round(mtdForecast * (closingInvPercent / 100));
  const hasEndingInv = cogsData.endingInventory !== undefined && Number(cogsData.endingInventory) > 0;
  const endingInventory = hasEndingInv ? Number(cogsData.endingInventory) : simulatedClosing;

  const cogsActual = Math.max(0, beginInventory + totalBelanja - endingInventory);
  const cogsActualPct = totalActualRevenue > 0 ? (cogsActual / totalActualRevenue) * 100 : 0;

  // ==========================================
  // 4. OVERTIME & MANPOWER
  // ==========================================
  const allManpower = extractOutletManpowerMap(outletDoc, globalData?.manpowerData);
  const mpData: OutletManpowerData = resolveOutletManpowerData(allManpower, outletName, monthKey);
  const mpSummary = calculateManpowerSummary(mpData);
  const totalManPower = mpSummary.grandTotalActual;

  // Overtime 4 Weeks cut-off
  const weekRanges = [
    { week: 1, startDate: `${prevMonthKey}-26`, endDate: `${monthKey}-01` },
    { week: 2, startDate: `${monthKey}-02`, endDate: `${monthKey}-08` },
    { week: 3, startDate: `${monthKey}-09`, endDate: `${monthKey}-15` },
    { week: 4, startDate: `${monthKey}-16`, endDate: `${monthKey}-25` },
  ];

  // Merge daily overtime
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

  // Kitchen, Bar, Service hours per week
  const kWeeklyHours = [0, 0, 0, 0];
  const bWeeklyHours = [0, 0, 0, 0];
  const sWeeklyHours = [0, 0, 0, 0];

  const kWeeklyStaff = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  const bWeeklyStaff = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  const sWeeklyStaff = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];

  weekRanges.forEach((wRange, wIdx) => {
    Object.entries(allDailyOT).forEach(([dateStr, entries]) => {
      if (dateStr >= wRange.startDate && dateStr <= wRange.endDate && Array.isArray(entries)) {
        entries.forEach(e => {
          if (!e) return;
          const rawHours = Number(e.overtimeHours) || Number(e.hours) || 0;
          const div = normalizeDivision(e.division);
          const sId = String(e.staffId || e.id || e.staffName || '');

          if (div === 'KITCHEN' || div === 'STORE KEEPER') {
            kWeeklyHours[wIdx] += rawHours;
            if (sId) kWeeklyStaff[wIdx].add(sId);
          } else if (div === 'BAR') {
            bWeeklyHours[wIdx] += rawHours;
            if (sId) bWeeklyStaff[wIdx].add(sId);
          } else if (div === 'SERVICE') {
            sWeeklyHours[wIdx] += rawHours;
            if (sId) sWeeklyStaff[wIdx].add(sId);
          }
        });
      }
    });
  });

  const kStaffDivCount = Math.max(1, mpSummary.kitchenActual + mpSummary.stewardActual + mpSummary.storekeeperActual);
  const bStaffDivCount = Math.max(1, mpSummary.barActual);
  const sStaffDivCount = Math.max(1, mpSummary.serviceActual + mpSummary.paActual);

  const kWeeklyAvg = kWeeklyHours.map((h, i) => {
    const count = kWeeklyStaff[i].size > 0 ? kWeeklyStaff[i].size : kStaffDivCount;
    return count > 0 ? h / count : 0;
  });
  const bWeeklyAvg = bWeeklyHours.map((h, i) => {
    const count = bWeeklyStaff[i].size > 0 ? bWeeklyStaff[i].size : bStaffDivCount;
    return count > 0 ? h / count : 0;
  });
  const sWeeklyAvg = sWeeklyHours.map((h, i) => {
    const count = sWeeklyStaff[i].size > 0 ? sWeeklyStaff[i].size : sStaffDivCount;
    return count > 0 ? h / count : 0;
  });

  const kTotalHours = kWeeklyHours.reduce((a, b) => a + b, 0);
  const bTotalHours = bWeeklyHours.reduce((a, b) => a + b, 0);
  const sTotalHours = sWeeklyHours.reduce((a, b) => a + b, 0);

  const kTotalAvg = kStaffDivCount > 0 ? kTotalHours / kStaffDivCount : 0;
  const bTotalAvg = bStaffDivCount > 0 ? bTotalHours / bStaffDivCount : 0;
  const sTotalAvg = sStaffDivCount > 0 ? sTotalHours / sStaffDivCount : 0;

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

  const getVacantSummary = (div: string, status: 'VACANT_OPEN' | 'VACANT_HOLD'): string => {
    const divSecs = sections.filter(s => {
      if (div === 'KITCHEN') return s.division === 'KITCHEN' || s.name.includes('STEWARD') || s.name.includes('STORE');
      if (div === 'SERVICE') return s.division === 'SERVICE' || s.name.includes('PUBLIC');
      return s.division === div;
    });
    const slots = divSecs.flatMap(s => s.slots).filter(sl => sl.status === status);
    if (slots.length === 0) return '-';
    
    // Group by role
    const map: Record<string, number> = {};
    slots.forEach(s => {
      const role = (s.position || 'Staff').trim();
      map[role] = (map[role] || 0) + 1;
    });
    return Object.entries(map).map(([r, c]) => `${c} ${r}`).join(', ');
  };

  // Kitchen
  const kLeader = getSectionStaffCount(/leader|chef/i, 'KITCHEN');
  const kGrill = getSectionStaffCount(/grill/i, 'KITCHEN');
  const kAsian = getSectionStaffCount(/asian/i, 'KITCHEN');
  const kFryer = getSectionStaffCount(/fryer/i, 'KITCHEN');
  const kPrep = getSectionStaffCount(/prep/i, 'KITCHEN');
  const kSteward = getSectionStaffCount(/steward/i);
  const kStore = getSectionStaffCount(/store/i);
  const kVacantOpen = getVacantSummary('KITCHEN', 'VACANT_OPEN');
  const kVacantHold = getVacantSummary('KITCHEN', 'VACANT_HOLD');

  // Bar
  const barSec = sections.find(s => s.division === 'BAR');
  const barSlots = barSec ? barSec.slots : [];
  const barLeaderCount = barSlots.filter(s => s.status === 'FILLED' && /captain|leader|spv|supervisor|head/i.test(s.position)).length;
  const barBaristaCount = barSlots.filter(s => s.status === 'FILLED' && !/captain|leader|spv|supervisor|head/i.test(s.position)).length;
  const bLeader = `${barLeaderCount} Orang`;
  const bBarista = `${barBaristaCount} Orang`;
  const bVacantOpen = getVacantSummary('BAR', 'VACANT_OPEN');
  const bVacantHold = getVacantSummary('BAR', 'VACANT_HOLD');

  // Service
  const sLeader = getSectionStaffCount(/leader|manager|supervisor/i, 'SERVICE');
  const sCashier = getSectionStaffCount(/cashier/i, 'SERVICE');
  const sGreeter = getSectionStaffCount(/greeter/i, 'SERVICE');
  const sChecker = getSectionStaffCount(/checker/i, 'SERVICE');
  const sServer = getSectionStaffCount(/server|waiter/i, 'SERVICE');
  const sVacantOpen = getVacantSummary('SERVICE', 'VACANT_OPEN');
  const sVacantHold = getVacantSummary('SERVICE', 'VACANT_HOLD');

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
  let currentRating = totalReviewMtd > 0 ? Number((totalPointsMtd / totalReviewMtd).toFixed(1)) : 0;

  // Fallback to direct state
  const directGr = monthDoc.googleReview || outletDoc.googleReview || {};
  if (totalReviewMtd === 0 && Number(directGr.totalReview) > 0) {
    totalReviewMtd = Number(directGr.totalReview) || 0;
    currentRating = Number(directGr.currentRating) || 0;
  }

  // Previous month review
  const prevGR: Record<string, any> = {
    ...(outletDoc.dailyGoogleReview || {}),
    ...(prevMonthDoc.dailyGoogleReview || {})
  };
  let prevTotalRev = 0;
  Object.entries(prevGR).forEach(([dStr, r]: [string, any]) => {
    if (dStr.startsWith(prevMonthKey) && r) {
      prevTotalRev += (Number(r.stars1) || 0) + (Number(r.stars2) || 0) + (Number(r.stars3) || 0) + (Number(r.stars4) || 0) + (Number(r.stars5) || 0);
    }
  });
  const varianceReview = totalReviewMtd - prevTotalRev;

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

  // Previous month GSI
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
      if (dStr.startsWith(monthKey) && Array.isArray(list)) {
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
  const guestSatData = extractLedgerSummary(monthDoc.dailyGuestSatisfaction || outletDoc.dailyGuestSatisfaction);
  const compData = extractLedgerSummary(monthDoc.dailyComplimentary || outletDoc.dailyComplimentary);

  const formatLedgerLines = (data: { total: number; items: { name: string; qty: number; price: number; reason: string }[] }) => {
    if (data.items.length === 0) {
      return `_Nama Item_ : -\n_Reason_ : -`;
    }
    const itemNames = data.items.map(it => `${it.name}${it.qty > 1 ? ` (${it.qty}x)` : ''}`).slice(0, 3).join(', ');
    const reasons = Array.from(new Set(data.items.map(it => it.reason).filter(r => r && r !== '-'))).slice(0, 3).join(', ') || '-';
    return `_Nama Item_ : ${itemNames}\n_Reason_ : ${reasons}`;
  };

  // ==========================================
  // 9. VOID BILL
  // ==========================================
  const voidRecords: VoidBillRecord[] = [];
  const addVoids = (vObj?: any) => {
    if (!vObj) return;
    if (Array.isArray(vObj)) {
      vObj.forEach((r: any) => {
        if (r && String(r.date || '').startsWith(monthKey)) {
          if (!r.outlet || r.outlet === outletName) voidRecords.push(r);
        }
      });
    } else if (typeof vObj === 'object') {
      Object.entries(vObj).forEach(([dKey, list]) => {
        if (String(dKey).startsWith(monthKey) && Array.isArray(list)) {
          list.forEach((r: any) => {
            if (r && (!r.outlet || r.outlet === outletName)) voidRecords.push(r);
          });
        }
      });
    }
  };
  addVoids(monthDoc.dailyVoidBills || outletDoc.dailyVoidBills);
  addVoids(monthDoc.voidBills || outletDoc.voidBills);

  // Group voids by staff
  const staffVoidMap = new Map<string, { name: string; count: number; total: number; reasons: Set<string> }>();
  voidRecords.forEach(r => {
    const sName = (r.staffName || (r as any).name || 'Staff').trim();
    if (!staffVoidMap.has(sName)) {
      staffVoidMap.set(sName, { name: sName, count: 0, total: 0, reasons: new Set<string>() });
    }
    const entry = staffVoidMap.get(sName)!;
    entry.count += 1;
    entry.total += Number(r.amount) || Number((r as any).price) || Number((r as any).totalPrice) || 0;
    if (r.reason) entry.reasons.add(r.reason);
  });

  const staffVoidList = Array.from(staffVoidMap.values()).sort((a, b) => b.total - a.total);
  let voidBillSectionText = '';
  if (staffVoidList.length > 0) {
    voidBillSectionText = staffVoidList.map((st, idx) => {
      const reasonStr = Array.from(st.reasons).join(', ') || '-';
      return `_${idx + 1}. Nama Staff_: ${st.name}
_Total Kesalahan_: ${st.count}
_Total Price_: Rp. ${formatIDR(st.total)}
_Reason_: ${reasonStr}`;
    }).join('\n\n');
  } else {
    voidBillSectionText = `_1. Nama Staff_: -
_Total Kesalahan_: 0
_Total Price_: Rp. 0
_Reason_: -`;
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
    if (score === 0) return '-';
    return getQaScoreTier(score).label;
  };

  const qaKitchenParam = getTierLabel(qaKitchenScore);
  const qaBarParam = getTierLabel(qaBarScore);
  const qaServiceParam = getTierLabel(qaServiceScore);
  const qaAllStatus = getTierLabel(qaTotalScore);

  // ==========================================
  // ASSEMBLE COMPLETE REPORT FOR SINGLE OUTLET
  // ==========================================
  return `${outletIndex}. *${outletName.toUpperCase()}*

*REVENUE*
- MTD Revenue : Rp. ${formatIDR(totalActualRevenue)}
- MTD Budget Revenue : Rp. ${formatIDR(mtdBudgetRevenue)}
- Variance : ${revVariance >= 0 ? '+' : '-'}Rp. ${formatIDR(Math.abs(revVariance))} (${mtdBudgetRevenue > 0 ? ((revVariance / mtdBudgetRevenue) * 100).toFixed(1) : '0.0'}%)
- MTD Forecast : Rp. ${formatIDR(mtdForecast)}

- Total Revenue Weekdays : Rp. ${formatIDR(totalRevenueWeekdays)}
- Total Revenue Weekend : Rp. ${formatIDR(totalRevenueWeekend)}
- Rata² Revenue Weekdays : Rp. ${formatIDR(avgRevWeekdays)}
- Rata² Revenue Weekend : Rp. ${formatIDR(avgRevWeekend)}
- MTD Rata" Contribution Lunch : ${lunchContribPct.toFixed(1)}%
- MTD Rata" Contribution Dinner : ${dinnerContribPct.toFixed(1)}%

*BELANJA*
- Main Store : Rp. ${formatIDR(belanjaMainStore)}
- Main Kitchen : Rp. ${formatIDR(belanjaMainKitchen)}
- Supplier : Rp. ${formatIDR(belanjaSupplier)}
- Cash : Rp. ${formatIDR(belanjaCash)}
- Total Belanja : Rp. ${formatIDR(totalBelanja)}
- Food Cost : ${foodCostPct.toFixed(1)}%

*COGS*
- Begin Inventory : Rp. ${formatIDR(beginInventory)}
- Actual Total Belanja : Rp. ${formatIDR(totalBelanja)}
- Rnd : Rp. ${formatIDR(rnd)}
- Wrongmaker : Rp. ${formatIDR(wrongmaker)}
- Ending Inventory : Rp. ${formatIDR(endingInventory)}
- Budget Marketing/KOL : Rp. ${formatIDR(budgetMarketing)}
- COGS Actual : Rp. ${formatIDR(cogsActual)}
- COGS (%) : ${cogsActualPct.toFixed(1)}%
- FOOD COST (%) : ${foodCostPct.toFixed(1)}%

*OVERTIME*
- Total Man Power : ${totalManPower} Orang

- *Kitchen* :
_Week 1_: ${kWeeklyHours[0].toFixed(1)} Jam / ${kWeeklyAvg[0].toFixed(1)} Jam (Rata² Overtime)
_Week 2_: ${kWeeklyHours[1].toFixed(1)} Jam / ${kWeeklyAvg[1].toFixed(1)} Jam (Rata² Overtime)
_Week 3_: ${kWeeklyHours[2].toFixed(1)} Jam / ${kWeeklyAvg[2].toFixed(1)} Jam (Rata² Overtime)
_Week 4_: ${kWeeklyHours[3].toFixed(1)} Jam / ${kWeeklyAvg[3].toFixed(1)} Jam (Rata² Overtime)
_Total Overtime_ : ${kTotalHours.toFixed(1)} Jam / ${kTotalAvg.toFixed(1)} Jam (Rata² Overtime)

- *Bar* :
_Week 1_: ${bWeeklyHours[0].toFixed(1)} Jam / ${bWeeklyAvg[0].toFixed(1)} Jam (Rata² Overtime)
_Week 2_: ${bWeeklyHours[1].toFixed(1)} Jam / ${bWeeklyAvg[1].toFixed(1)} Jam (Rata² Overtime)
_Week 3_: ${bWeeklyHours[2].toFixed(1)} Jam / ${bWeeklyAvg[2].toFixed(1)} Jam (Rata² Overtime)
_Week 4_: ${bWeeklyHours[3].toFixed(1)} Jam / ${bWeeklyAvg[3].toFixed(1)} Jam (Rata² Overtime)
_Total Overtime_ : ${bTotalHours.toFixed(1)} Jam / ${bTotalAvg.toFixed(1)} Jam (Rata² Overtime)

- *Service*:
_Week 1_: ${sWeeklyHours[0].toFixed(1)} Jam / ${sWeeklyAvg[0].toFixed(1)} Jam (Rata² Overtime)
_Week 2_: ${sWeeklyHours[1].toFixed(1)} Jam / ${sWeeklyAvg[1].toFixed(1)} Jam (Rata² Overtime)
_Week 3_: ${sWeeklyHours[2].toFixed(1)} Jam / ${sWeeklyAvg[2].toFixed(1)} Jam (Rata² Overtime)
_Week 4_: ${sWeeklyHours[3].toFixed(1)} Jam / ${sWeeklyAvg[3].toFixed(1)} Jam (Rata² Overtime)
_Total Overtime_ : ${sTotalHours.toFixed(1)} Jam / ${sTotalAvg.toFixed(1)} Jam (Rata² Overtime)


*MAN POWER*
*Kitchen* :
_Leader_ : ${kLeader}
_Grilled Section_ : ${kGrill}
_Asian Section_ : ${kAsian}
_Fryer Section_ : ${kFryer}
_Preparation_ : ${kPrep}
_Steward_ : ${kSteward}
_Store Keeper_: ${kStore}
*Vacant Open* : ${kVacantOpen}
*Vacant Hold* : ${kVacantHold}


*Bar*:
_Leader_: ${bLeader}
_Barista_: ${bBarista}
*Vacant Open* : ${bVacantOpen}
*Vacant Hold* : ${bVacantHold}

*Service* :
_Leader_ : ${sLeader}
_Cashier_: ${sCashier}
_Greeter_: ${sGreeter}
_Checker_: ${sChecker}
_Server_: ${sServer}
*Vacant Open* : ${sVacantOpen}
*Vacant Hold* : ${sVacantHold}

*GOOGLE REVIEW*
- Total Review : ${totalReviewMtd}
- Total Rating : ${currentRating.toFixed(1)}
- Variance Total Review VS Last Month : ${varianceReview >= 0 ? '+' : ''}${varianceReview}

*GSI*
- Total Review : ${gsiTotalResponses}
- Performance : ${gsiPerformance.toFixed(1)}%
- Variance MTD Total Review Vs MTD Last Month : ${varGsiResponses >= 0 ? '+' : ''}${varGsiResponses}
- Variance MTD Performance Vs MTD Last Month : ${varGsiPerf >= 0 ? '+' : ''}${varGsiPerf.toFixed(1)}%
- Performance (%) : ${gsiPerformance.toFixed(1)}%

*CITY LEDGER*
- Total Price : Rp. ${formatIDR(cityLedgerData.total)}
${formatLedgerLines(cityLedgerData)}

*GUEST SATISFACTION*
- Total Price : Rp. ${formatIDR(guestSatData.total)}
${formatLedgerLines(guestSatData)}

*COMPLIMENTARY*
- Total Price : Rp. ${formatIDR(compData.total)}
${formatLedgerLines(compData)}


*VOID BIL*
${voidBillSectionText}

*QA REPORT* (Parameters To Imorove, Satisfactory / Excellent)

- *Service* 
_Nilai_ (%) : ${qaServiceScore > 0 ? `${qaServiceScore.toFixed(1)}%` : '-'}
_Parameters_: ${qaServiceParam}
- *Bar* :
_Nilai_ (%) : ${qaBarScore > 0 ? `${qaBarScore.toFixed(1)}%` : '-'}
_Parameters_: ${qaBarParam}
- *Kitchen*
_Nilai_ (%) : ${qaKitchenScore > 0 ? `${qaKitchenScore.toFixed(1)}%` : '-'}
_Parameters_ : ${qaKitchenParam}
*Total Nilai (%)*: ${qaTotalScore > 0 ? `${qaTotalScore.toFixed(1)}%` : '-'}
*Status Parameters All Divisi* : ${qaAllStatus}`;
};

/**
 * Builds the complete WhatsApp report for ALL outlets under header *REKAPITULATION OUTLET*
 */
export const buildAllOutletsWaReport = (
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData: AppState,
  targetOutlets?: string[]
): string => {
  const activeNames = targetOutlets && targetOutlets.length > 0
    ? targetOutlets
    : getActiveOutletNames().filter(name => {
        const d = allOutletsData?.[name];
        return !d || !d.isDeleted;
      });

  const outletSections = activeNames.map((oName, idx) => {
    return buildSingleOutletWaReport(oName, selectedMonth, selectedYear, allOutletsData, globalData, idx + 1);
  });

  return `*REKAPITULATION OUTLET*

${outletSections.join('\n\n==============================\n\n')}`;
};
