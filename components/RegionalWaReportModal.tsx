import React, { useState, useMemo } from 'react';
import { AppState, Outlet, Staff } from '../types';
import { 
  getActiveOutletNames, 
  MONTHS, 
  getStoredOtBudgetSettings,
  QA_PASSING_TIERS,
  getQaScoreTier
} from '../constants';
import { 
  extractOutletManpowerMap, 
  resolveOutletManpowerData, 
  calculateManpowerSummary 
} from '../lib/manpowerUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allOutletsData: Record<string, any>;
  globalData?: AppState;
  selectedMonth: number;
  selectedYear: number;
  initialSelectedOutlet?: string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

const formatPct = (val: number): string => {
  if (isNaN(val) || !isFinite(val)) return '0.00%';
  return `${val.toFixed(2)}%`;
};

// Helper to extract Google Review data for a given month
const getGoogleReviewForOutlet = (allOutletsData: any, outlet: string, monthIdx: number, year: number) => {
  const outletDoc = allOutletsData?.[outlet] || {};
  const currentMonthDoc = outletDoc[String(monthIdx)] || outletDoc[monthIdx] || outletDoc.monthlyData?.[String(monthIdx)] || {};
  const googleReviews = currentMonthDoc.googleReviews || currentMonthDoc.dailyGoogleReviews || outletDoc.googleReviews || {};

  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
  const monthPrefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;

  Object.entries(googleReviews).forEach(([d, review]: [string, any]) => {
    if (d.startsWith(monthPrefix) && review) {
      s1 += Number(review.stars1) || 0;
      s2 += Number(review.stars2) || 0;
      s3 += Number(review.stars3) || 0;
      s4 += Number(review.stars4) || 0;
      s5 += Number(review.stars5) || 0;
    }
  });

  const total = s1 + s2 + s3 + s4 + s5;
  const rating = total === 0 ? 0 : ((s1 * 1) + (s2 * 2) + (s3 * 3) + (s4 * 4) + (s5 * 5)) / total;
  return { count: total, rating: Number(rating.toFixed(2)) };
};

// Helper to extract Single Outlet WhatsApp Report Text
export const generateOutletWaReport = (
  outletName: string,
  selectedMonth: number,
  selectedYear: number,
  allOutletsData: Record<string, any>,
  globalData?: AppState,
  outletIndex: number = 1
): string => {
  const monthName = MONTHS[selectedMonth];
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
  const prevMonthName = MONTHS[prevMonthIdx];

  const outletDoc = allOutletsData?.[outletName] || allOutletsData?.[outletName.trim()] || {};
  const monthDoc = outletDoc[String(selectedMonth)] || outletDoc[selectedMonth] || outletDoc.monthlyData?.[String(selectedMonth)] || {};
  const prevMonthDoc = outletDoc[String(prevMonthIdx)] || outletDoc[prevMonthIdx] || outletDoc.monthlyData?.[String(prevMonthIdx)] || {};

  const sales = monthDoc.sales || outletDoc.sales || monthDoc || {};
  const dailyRec = sales.dailyRecording || monthDoc.dailyRecording || outletDoc.dailyRecording || {};
  const cogsData = monthDoc.monthlyCogsData?.[monthKey] || outletDoc.monthlyCogsData?.[monthKey] || {};

  // 1. REVENUE CALCULATION
  const mtdBudgetRevenue = Number((sales.monthlyBudgets || {})[monthKey]) || Number(sales.budgetRevenue) || Number(cogsData.strategyTargetRevenue) || 0;

  let actualRevenue = 0;
  let weekdayRevSum = 0;
  let weekdayCount = 0;
  let weekendRevSum = 0;
  let weekendCount = 0;
  let lunchRevSum = 0;
  let dinnerRevSum = 0;

  // Belanja channels
  let mainStoreBelanja = 0;
  let mainKitchenBelanja = 0;
  let supplierBelanja = 0;
  let cashBelanja = 0;

  // Partner supplier keys
  const supKeys = [
    'dailySaungKubilLedger', 'dailyTgifLedger', 'dailyPanfilaLedger', 
    'dailyEverestLedger', 'dailySukandaLedger', 'dailyIkigaiLedger', 'dailyKebunkuLedger'
  ];

  for (let d = 1; d <= daysInMonth; d++) {
    const dObj = new Date(selectedYear, selectedMonth, d);
    const dayOfWeek = dObj.getDay(); // 0 = Sun, 1..5 = Mon..Fri, 6 = Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;

    // Revenue
    const rec = dailyRec[dateStr];
    let dayRev = 0;
    if (rec) {
      if (rec.revenue !== undefined && Number(rec.revenue) > 0) {
        dayRev = Number(rec.revenue);
      } else {
        const sumBrk = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) +
                       (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
        if (sumBrk > 0) dayRev = sumBrk;
      }

      let l = Number(rec.lunchRevenue) || Number(rec.revenueLunch) || 0;
      let dn = Number(rec.dinnerRevenue) || Number(rec.revenueDinner) || 0;
      if (l === 0 && dn === 0 && dayRev > 0) {
        l = Math.round(dayRev * 0.40);
        dn = dayRev - l;
      }
      lunchRevSum += l;
      dinnerRevSum += dn;
    }

    if (dayRev > 0) {
      actualRevenue += dayRev;
      if (isWeekday) {
        weekdayRevSum += dayRev;
        weekdayCount++;
      } else {
        weekendRevSum += dayRev;
        weekendCount++;
      }
    }

    // Main Store
    const storeList = monthDoc.dailyMainStoreLedger?.[dateStr] || outletDoc.dailyMainStoreLedger?.[dateStr];
    if (Array.isArray(storeList)) {
      mainStoreBelanja += storeList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }
    // Deductions
    const chemList = monthDoc.dailyChemicalLedger?.[dateStr] || outletDoc.dailyChemicalLedger?.[dateStr];
    if (Array.isArray(chemList)) {
      mainStoreBelanja -= chemList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }
    const atkList = monthDoc.dailyAtkLedger?.[dateStr] || outletDoc.dailyAtkLedger?.[dateStr];
    if (Array.isArray(atkList)) {
      mainStoreBelanja -= atkList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }

    // Main Kitchen
    const mkList = monthDoc.dailyMainKitchenLedger?.[dateStr] || outletDoc.dailyMainKitchenLedger?.[dateStr];
    if (Array.isArray(mkList)) {
      mainKitchenBelanja += mkList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }

    // Cash & Commodity
    const cashList = monthDoc.dailyCashLedger?.[dateStr] || outletDoc.dailyCashLedger?.[dateStr];
    if (Array.isArray(cashList)) {
      cashBelanja += cashList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }
    const commList = monthDoc.dailyCommodityLedger?.[dateStr] || outletDoc.dailyCommodityLedger?.[dateStr];
    if (Array.isArray(commList)) {
      cashBelanja += commList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    }

    // Partner Suppliers
    supKeys.forEach(k => {
      const supList = monthDoc[k]?.[dateStr] || outletDoc[k]?.[dateStr];
      if (Array.isArray(supList)) {
        supplierBelanja += supList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    });
  }

  mainStoreBelanja = Math.max(0, mainStoreBelanja);

  // Fallback to expenses if ledgers are 0
  const totalBelanjaFromLedgers = mainStoreBelanja + mainKitchenBelanja + supplierBelanja + cashBelanja;
  if (totalBelanjaFromLedgers === 0 && monthDoc.expenses) {
    Object.values(monthDoc.expenses).forEach((exp: any) => {
      mainKitchenBelanja += Number(exp.mainKitchen) || 0;
      mainStoreBelanja += Number(exp.mainStore) || 0;
      cashBelanja += (Number(exp.cash) || 0) + (Number(exp.commodity) || 0);
      supplierBelanja += (Number(exp.saungKubil) || 0) + (Number(exp.tgif) || 0) + 
                         (Number(exp.panfila) || 0) + (Number(exp.everest) || 0) + 
                         (Number(exp.sukanda) || 0) + (Number(exp.ikigai) || 0) + 
                         (Number(exp.kebunku) || 0);
    });
  }

  const varianceRevenue = actualRevenue - mtdBudgetRevenue;
  const avgWeekdayRev = weekdayCount > 0 ? Math.round(weekdayRevSum / weekdayCount) : 0;
  const avgWeekendRev = weekendCount > 0 ? Math.round(weekendRevSum / weekendCount) : 0;

  // Forecast Full Month
  const recordedDays = weekdayCount + weekendCount;
  const remainingDays = Math.max(0, daysInMonth - recordedDays);
  const remainingWeekdays = Math.max(0, Math.round(remainingDays * (5 / 7)));
  const remainingWeekends = Math.max(0, remainingDays - remainingWeekdays);
  const forecastSisaHari = Math.round((remainingWeekdays * avgWeekdayRev) + (remainingWeekends * avgWeekendRev));
  const mtdForecastRevenue = actualRevenue + forecastSisaHari;

  // Contribution Lunch & Dinner
  const totalMealRev = lunchRevSum + dinnerRevSum;
  const lunchPct = totalMealRev > 0 ? (lunchRevSum / totalMealRev) * 100 : 40.0;
  const dinnerPct = totalMealRev > 0 ? (dinnerRevSum / totalMealRev) * 100 : 60.0;

  // 2. BELANJA & COGS
  let totalBelanja = mainStoreBelanja + mainKitchenBelanja + supplierBelanja + cashBelanja;
  if (cogsData.useManualMtdBelanja && cogsData.manualMtdBelanja !== undefined && Number(cogsData.manualMtdBelanja) > 0) {
    totalBelanja = Number(cogsData.manualMtdBelanja);
  }
  const foodCostPct = actualRevenue > 0 ? (totalBelanja / actualRevenue) * 100 : 0;

  const beginInventory = Number(cogsData.beginningInventory) || 0;
  const rndCost = Number(cogsData.rndExpenses || cogsData.rndCost) || 0;
  const wrongmakerCost = Number(cogsData.wrongMakerExpenses || cogsData.wrongMakerCost) || 0;
  const endingInventory = Number(cogsData.endingInventory) || 0;
  const budgetMarketingKol = Number(cogsData.marketingExpenses || cogsData.kolExpenses) || 0;

  const closingInvPercent = Number(cogsData.closingInventoryPercent) || 10.0;
  const simClosingInv = Math.round(mtdForecastRevenue * (closingInvPercent / 100));
  const effectiveEndingInv = endingInventory > 0 ? endingInventory : simClosingInv;

  const cogsActualNominal = Math.max(0, beginInventory + totalBelanja - effectiveEndingInv - rndCost - wrongmakerCost - budgetMarketingKol);
  const cogsActualPct = actualRevenue > 0 ? (cogsActualNominal / actualRevenue) * 100 : 0;

  // 3. OVERTIME
  // 4 Weeks standard cut-off ranges: 26 prev month to 25 current month
  const weekRanges = [
    { week: 1, start: `${prevMonthKey}-26`, end: `${monthKey}-01` },
    { week: 2, start: `${monthKey}-02`, end: `${monthKey}-08` },
    { week: 3, start: `${monthKey}-09`, end: `${monthKey}-15` },
    { week: 4, start: `${monthKey}-16`, end: `${monthKey}-25` }
  ];

  const otConfig = getStoredOtBudgetSettings();
  const ratePerHour = otConfig.ratePerHour || 15000;

  // Gather daily overtime for this outlet
  const otByDate: Record<string, any[]> = {};
  const addOtEntry = (dStr: string, list: any[]) => {
    if (!otByDate[dStr]) otByDate[dStr] = [];
    if (Array.isArray(list)) otByDate[dStr].push(...list);
  };

  if (monthDoc.dailyOvertime) {
    Object.entries(monthDoc.dailyOvertime).forEach(([d, list]) => addOtEntry(d, list as any[]));
  }
  if (prevMonthDoc.dailyOvertime) {
    Object.entries(prevMonthDoc.dailyOvertime).forEach(([d, list]) => addOtEntry(d, list as any[]));
  }
  if (outletDoc.dailyOvertime) {
    Object.entries(outletDoc.dailyOvertime).forEach(([d, list]) => addOtEntry(d, list as any[]));
  }
  if (globalData && (globalData.outlet === outletName || !globalData.outlet) && globalData.dailyOvertime) {
    Object.entries(globalData.dailyOvertime).forEach(([d, list]) => addOtEntry(d, list as any[]));
  }

  // Helper for division overtime stats
  const getDivOvertime = (divKeyword: string) => {
    const weekly = [1, 2, 3, 4].map(wNum => {
      const wRange = weekRanges[wNum - 1];
      let hours = 0;
      let pay = 0;
      const crewSet = new Set<string>();

      Object.entries(otByDate).forEach(([dStr, entries]) => {
        if (dStr >= wRange.start && dStr <= wRange.end) {
          entries.forEach(e => {
            const divName = (e.division || e.role || '').toUpperCase();
            if (divName.includes(divKeyword)) {
              const h = Number(e.hours) || Number(e.duration) || 0;
              hours += h;
              pay += Number(e.pay) || Number(e.overtimePay) || (h * ratePerHour);
              if (e.staffName || e.name) crewSet.add(e.staffName || e.name);
            }
          });
        }
      });

      const crewCount = crewSet.size || 1;
      const avg = crewCount > 0 ? (hours / crewCount) : 0;
      return { hours, pay, avg };
    });

    const totalHours = weekly.reduce((a, b) => a + b.hours, 0);
    const totalPay = weekly.reduce((a, b) => a + b.pay, 0);
    const totalAvg = weekly.reduce((a, b) => a + b.avg, 0) / 4;

    return { weekly, totalHours, totalPay, totalAvg };
  };

  const otKitchen = getDivOvertime('KITCHEN');
  const otBar = getDivOvertime('BAR');
  const otService = getDivOvertime('SERVICE');

  // Staff Count / Manpower
  const staffList: Staff[] = (outletDoc.staffList || globalData?.staffList || []).filter((s: any) => s && (s.status === 'ACTIVE' || !s.status));
  const totalManpowerCount = staffList.length || 20;

  // 4. MANPOWER STRUCTURE
  const allManpower = extractOutletManpowerMap(outletDoc, globalData?.manpowerData);
  const mpData = resolveOutletManpowerData(allManpower, outletName, monthKey);

  const getSecSlots = (secId: string) => {
    const sec = mpData.sections?.find(s => s.id === secId || s.name.toUpperCase().includes(secId.toUpperCase()));
    return sec ? sec.slots : [];
  };

  const countFilled = (secId: string) => {
    const slots = getSecSlots(secId);
    return slots.filter(s => s.status === 'FILLED').length;
  };

  const countVacantOpen = (divName: string) => {
    const secs = (mpData.sections || []).filter(s => s.division === divName);
    return secs.reduce((acc, s) => acc + s.slots.filter(sl => sl.status === 'VACANT_OPEN').length, 0);
  };

  const countVacantHold = (divName: string) => {
    const secs = (mpData.sections || []).filter(s => s.division === divName);
    return secs.reduce((acc, s) => acc + s.slots.filter(sl => sl.status === 'VACANT_HOLD').length, 0);
  };

  // Kitchen details
  const kitchenLeaderCount = countFilled('sec_kitchen_leader');
  const grillCount = countFilled('sec_grill');
  const asianCount = countFilled('sec_asian');
  const fryerCount = countFilled('sec_fryer');
  const prepCount = countFilled('sec_prep');
  const stewardCount = countFilled('sec_steward');
  const storeKeeperCount = countFilled('sec_store_keeper');
  const kitchenVacOpen = countVacantOpen('KITCHEN');
  const kitchenVacHold = countVacantHold('KITCHEN');

  // Bar details
  const barLeaderCount = getSecSlots('sec_bar').filter(s => s.status === 'FILLED' && s.position?.toLowerCase().includes('captain')).length || 1;
  const baristaCount = getSecSlots('sec_bar').filter(s => s.status === 'FILLED' && !s.position?.toLowerCase().includes('captain')).length || 3;
  const barVacOpen = countVacantOpen('BAR');
  const barVacHold = countVacantHold('BAR');

  // Service details
  const serviceLeaderCount = countFilled('sec_service_leader');
  const cashierCount = countFilled('sec_fb_cashier');
  const greeterCount = countFilled('sec_greeter');
  const checkerCount = countFilled('sec_food_checker');
  const serverCount = countFilled('sec_server');
  const serviceVacOpen = countVacantOpen('SERVICE');
  const serviceVacHold = countVacantHold('SERVICE');

  // 5. GOOGLE REVIEW
  const currentGoogle = getGoogleReviewForOutlet(allOutletsData, outletName, selectedMonth, selectedYear);
  const prevGoogle = getGoogleReviewForOutlet(allOutletsData, outletName, prevMonthIdx, prevYear);
  const varianceGoogleReview = currentGoogle.count - prevGoogle.count;

  // 6. GSI (Guest Satisfaction Index)
  let gsiPoints = 0;
  let gsiMaxPoints = 0;
  let gsiTotalReviews = 0;

  const currentDailyGSI = monthDoc.dailyGSI || outletDoc.dailyGSI || {};
  Object.entries(currentDailyGSI).forEach(([d, rows]: [string, any]) => {
    if (d.startsWith(monthKey) && Array.isArray(rows)) {
      rows.forEach(r => {
        const ex = Number(r.excellent) || 0;
        const g = Number(r.good) || 0;
        const avg = Number(r.average) || 0;
        const p = Number(r.poor) || 0;
        const tot = ex + g + avg + p;
        if (tot > 0) {
          gsiTotalReviews += tot;
          gsiPoints += (ex * 4) + (g * 3) + (avg * 2) + (p * 1);
          gsiMaxPoints += (tot * 4);
        }
      });
    }
  });

  const gsiPerformance = gsiMaxPoints > 0 ? (gsiPoints / gsiMaxPoints) * 100 : 0;

  // Last Month GSI
  let lmGsiTotal = 0;
  let lmGsiPoints = 0;
  let lmGsiMax = 0;
  const prevDailyGSI = prevMonthDoc.dailyGSI || {};
  Object.entries(prevDailyGSI).forEach(([d, rows]: [string, any]) => {
    if (d.startsWith(prevMonthKey) && Array.isArray(rows)) {
      rows.forEach(r => {
        const tot = (Number(r.excellent) || 0) + (Number(r.good) || 0) + (Number(r.average) || 0) + (Number(r.poor) || 0);
        if (tot > 0) {
          lmGsiTotal += tot;
          lmGsiPoints += ((Number(r.excellent) || 0) * 4) + ((Number(r.good) || 0) * 3) + ((Number(r.average) || 0) * 2) + ((Number(r.poor) || 0) * 1);
          lmGsiMax += (tot * 4);
        }
      });
    }
  });
  const lmGsiPerf = lmGsiMax > 0 ? (lmGsiPoints / lmGsiMax) * 100 : 0;
  const varGsiReview = gsiTotalReviews - lmGsiTotal;
  const varGsiPerf = gsiPerformance - lmGsiPerf;

  // 7. CITY LEDGER
  const cityLedgerList: any[] = [];
  const dailyCity = monthDoc.dailyCityLedger || outletDoc.dailyCityLedger || {};
  Object.entries(dailyCity).forEach(([d, items]: [string, any]) => {
    if (d.startsWith(monthKey) && Array.isArray(items)) {
      cityLedgerList.push(...items);
    }
  });
  const cityLedgerTotal = cityLedgerList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);

  // 8. GUEST SATISFACTION
  const gsList: any[] = [];
  const dailyGS = monthDoc.dailyGuestSatisfaction || monthDoc.dailySatisfaction || outletDoc.dailyGuestSatisfaction || {};
  Object.entries(dailyGS).forEach(([d, items]: [string, any]) => {
    if (d.startsWith(monthKey) && Array.isArray(items)) {
      gsList.push(...items);
    }
  });
  const gsTotal = gsList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);

  // 9. COMPLIMENTARY
  const compList: any[] = [];
  const dailyComp = monthDoc.dailyComplimentary || outletDoc.dailyComplimentary || {};
  Object.entries(dailyComp).forEach(([d, items]: [string, any]) => {
    if (d.startsWith(monthKey) && Array.isArray(items)) {
      compList.push(...items);
    }
  });
  const compTotal = compList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);

  // 10. VOID BILL
  const voidRecords: any[] = [];
  const dailyVoid = monthDoc.dailyVoidBills || outletDoc.dailyVoidBills || {};
  Object.entries(dailyVoid).forEach(([d, items]: [string, any]) => {
    if (d.startsWith(monthKey) && Array.isArray(items)) {
      voidRecords.push(...items);
    }
  });
  if (Array.isArray(monthDoc.voidBills)) {
    monthDoc.voidBills.forEach((vb: any) => {
      if (vb.date?.startsWith(monthKey) && !voidRecords.some(x => x.id === vb.id)) {
        voidRecords.push(vb);
      }
    });
  }

  // 11. QA REPORT
  const auditsMap: Record<string, any> = {};
  if (monthDoc.dailyQA) {
    Object.entries(monthDoc.dailyQA).forEach(([d, q]) => {
      if (d.startsWith(monthKey) && q) auditsMap[d] = q;
    });
  }
  if (outletDoc.dailyQA) {
    Object.entries(outletDoc.dailyQA).forEach(([d, q]) => {
      if (d.startsWith(monthKey) && q) auditsMap[d] = q;
    });
  }

  let qaKitchenScore = 0;
  let qaBarScore = 0;
  let qaServiceScore = 0;
  let qaCount = 0;

  Object.values(auditsMap).forEach((qa: any) => {
    const getSec = (sec?: any) => {
      if (!sec) return 0;
      const vals = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const k = getSec(qa.kitchen);
    const b = getSec(qa.bar);
    const s = getSec(qa.service);
    if (k > 0 || b > 0 || s > 0) {
      qaKitchenScore += k;
      qaBarScore += b;
      qaServiceScore += s;
      qaCount++;
    }
  });

  const avgQaKitchen = qaCount > 0 ? (qaKitchenScore / qaCount) : 0;
  const avgQaBar = qaCount > 0 ? (qaBarScore / qaCount) : 0;
  const avgQaService = qaCount > 0 ? (qaServiceScore / qaCount) : 0;
  const avgQaOverall = qaCount > 0 ? ((avgQaKitchen + avgQaBar + avgQaService) / 3) : 0;

  const getTier = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Satisfactory';
    return 'Parameters To Improve';
  };

  const qaStatusAll = getTier(avgQaOverall);

  // BUILD EXACT REQUESTED TEMPLATE TEXT
  let text = '';
  text += `${outletIndex}. *${outletName.toUpperCase()}*\n\n`;

  // *REVENUE*
  text += `*REVENUE*\n`;
  text += `- MTD Revenue : Rp ${formatIDR(actualRevenue)}\n`;
  text += `- MTD Budget Revenue : Rp ${formatIDR(mtdBudgetRevenue)}\n`;
  text += `- Variance : Rp ${formatIDR(varianceRevenue)}\n`;
  text += `- MTD Forecast : Rp ${formatIDR(mtdForecastRevenue)}\n\n`;

  text += `- Total Revenue Weekdays : Rp. ${formatIDR(weekdayRevSum)}\n`;
  text += `- Total Revenue Weekend : Rp. ${formatIDR(weekendRevSum)}\n`;
  text += `- Rata² Revenue Weekdays : Rp. ${formatIDR(avgWeekdayRev)}\n`;
  text += `- Rata² Revenue Weekend : Rp. ${formatIDR(avgWeekendRev)}\n`;
  text += `- MTD Rata" Contribution Lunch : ${lunchPct.toFixed(1)}%\n`;
  text += `- MTD Rata" Contribution Dinner : ${dinnerPct.toFixed(1)}%\n\n`;

  // *BELANJA*
  text += `*BELANJA*\n`;
  text += `- Main Store : Rp ${formatIDR(mainStoreBelanja)}\n`;
  text += `- Main Kitchen : Rp ${formatIDR(mainKitchenBelanja)}\n`;
  text += `- Supplier : Rp ${formatIDR(supplierBelanja)}\n`;
  text += `- Cash : Rp ${formatIDR(cashBelanja)}\n`;
  text += `- Total Belanja : Rp ${formatIDR(totalBelanja)}\n`;
  text += `- Food Cost : ${foodCostPct.toFixed(2)}%\n\n`;

  // *COGS*
  text += `*COGS*\n`;
  text += `- Begin Inventory : Rp ${formatIDR(beginInventory)}\n`;
  text += `- Actual Total Belanja : Rp ${formatIDR(totalBelanja)}\n`;
  text += `- Rnd : Rp ${formatIDR(rndCost)}\n`;
  text += `- Wrongmaker : Rp ${formatIDR(wrongmakerCost)}\n`;
  text += `- Ending Inventory : Rp ${formatIDR(effectiveEndingInv)}\n`;
  text += `- Budget Marketing/KOL : Rp ${formatIDR(budgetMarketingKol)}\n`;
  text += `- COGS Actual : Rp ${formatIDR(cogsActualNominal)}\n`;
  text += `- COGS (%) : ${cogsActualPct.toFixed(2)}%\n`;
  text += `- FOOD COST (%) : ${foodCostPct.toFixed(2)}%\n\n`;

  // *OVERTIME*
  text += `*OVERTIME*\n`;
  text += `- Total Man Power : ${totalManpowerCount} Orang\n\n`;

  text += `- *Kitchen* :\n`;
  text += `_Week 1_: Rp ${formatIDR(otKitchen.weekly[0].pay)} / ${otKitchen.weekly[0].hours.toFixed(1)} Jam (Rata² Overtime: ${otKitchen.weekly[0].avg.toFixed(1)} Jam)\n`;
  text += `_Week 2_: Rp ${formatIDR(otKitchen.weekly[1].pay)} / ${otKitchen.weekly[1].hours.toFixed(1)} Jam (Rata² Overtime: ${otKitchen.weekly[1].avg.toFixed(1)} Jam)\n`;
  text += `_Week 3_: Rp ${formatIDR(otKitchen.weekly[2].pay)} / ${otKitchen.weekly[2].hours.toFixed(1)} Jam (Rata² Overtime: ${otKitchen.weekly[2].avg.toFixed(1)} Jam)\n`;
  text += `_Week 4_: Rp ${formatIDR(otKitchen.weekly[3].pay)} / ${otKitchen.weekly[3].hours.toFixed(1)} Jam (Rata² Overtime: ${otKitchen.weekly[3].avg.toFixed(1)} Jam)\n`;
  text += `_Total Overtime_ : Rp ${formatIDR(otKitchen.totalPay)} / ${otKitchen.totalHours.toFixed(1)} Jam (Rata² Overtime: ${otKitchen.totalAvg.toFixed(1)} Jam)\n\n`;

  text += `- *Bar* :\n`;
  text += `_Week 1_: Rp ${formatIDR(otBar.weekly[0].pay)} / ${otBar.weekly[0].hours.toFixed(1)} Jam (Rata² Overtime: ${otBar.weekly[0].avg.toFixed(1)} Jam)\n`;
  text += `_Week 2_: Rp ${formatIDR(otBar.weekly[1].pay)} / ${otBar.weekly[1].hours.toFixed(1)} Jam (Rata² Overtime: ${otBar.weekly[1].avg.toFixed(1)} Jam)\n`;
  text += `_Week 3_: Rp ${formatIDR(otBar.weekly[2].pay)} / ${otBar.weekly[2].hours.toFixed(1)} Jam (Rata² Overtime: ${otBar.weekly[2].avg.toFixed(1)} Jam)\n`;
  text += `_Week 4_: Rp ${formatIDR(otBar.weekly[3].pay)} / ${otBar.weekly[3].hours.toFixed(1)} Jam (Rata² Overtime: ${otBar.weekly[3].avg.toFixed(1)} Jam)\n`;
  text += `_Total Overtime_ : Rp ${formatIDR(otBar.totalPay)} / ${otBar.totalHours.toFixed(1)} Jam (Rata² Overtime: ${otBar.totalAvg.toFixed(1)} Jam)\n\n`;

  text += `- *Service*:\n`;
  text += `_Week 1_: Rp ${formatIDR(otService.weekly[0].pay)} / ${otService.weekly[0].hours.toFixed(1)} Jam (Rata² Overtime: ${otService.weekly[0].avg.toFixed(1)} Jam)\n`;
  text += `_Week 2_: Rp ${formatIDR(otService.weekly[1].pay)} / ${otService.weekly[1].hours.toFixed(1)} Jam (Rata² Overtime: ${otService.weekly[1].avg.toFixed(1)} Jam)\n`;
  text += `_Week 3_: Rp ${formatIDR(otService.weekly[2].pay)} / ${otService.weekly[2].hours.toFixed(1)} Jam (Rata² Overtime: ${otService.weekly[2].avg.toFixed(1)} Jam)\n`;
  text += `_Week 4_: Rp ${formatIDR(otService.weekly[3].pay)} / ${otService.weekly[3].hours.toFixed(1)} Jam (Rata² Overtime: ${otService.weekly[3].avg.toFixed(1)} Jam)\n`;
  text += `_Total Overtime_ : Rp ${formatIDR(otService.totalPay)} / ${otService.totalHours.toFixed(1)} Jam (Rata² Overtime: ${otService.totalAvg.toFixed(1)} Jam)\n\n\n`;

  // *MAN POWER*
  text += `*MAN POWER*\n`;
  text += `*Kitchen* :\n`;
  text += `_Leader_ : ${kitchenLeaderCount} Orang\n`;
  text += `_Grilled Section_ : ${grillCount} Orang\n`;
  text += `_Asian Section_ : ${asianCount} Orang\n`;
  text += `_Fryer Section_ : ${fryerCount} Orang\n`;
  text += `_Preparation_ : ${prepCount} Orang\n`;
  text += `_Steward_ : ${stewardCount} Orang\n`;
  text += `_Store Keeper_: ${storeKeeperCount} Orang\n`;
  text += `*Vacant Open*: ${kitchenVacOpen} Posisi\n`;
  text += `*Vacant Hold*: ${kitchenVacHold} Posisi\n\n`;

  text += `*Bar*:\n`;
  text += `_Leader_: ${barLeaderCount} Orang\n`;
  text += `_Barista_: ${baristaCount} Orang\n`;
  text += `*Vacant Open*: ${barVacOpen} Posisi\n`;
  text += `*Vacant Hold*: ${barVacHold} Posisi\n\n`;

  text += `*Service* :\n`;
  text += `_Leader_ : ${serviceLeaderCount} Orang\n`;
  text += `_Cashier_: ${cashierCount} Orang\n`;
  text += `_Greeter_: ${greeterCount} Orang\n`;
  text += `_Checker_: ${checkerCount} Orang\n`;
  text += `_Server_: ${serverCount} Orang\n`;
  text += `*Vacant Open*: ${serviceVacOpen} Posisi\n`;
  text += `*Vacant Hold*: ${serviceVacHold} Posisi\n\n`;

  // *GOOGLE REVIEW*
  text += `*GOOGLE REVIEW*\n`;
  text += `- Total Review : ${currentGoogle.count}\n`;
  text += `- Total Rating : ${currentGoogle.rating.toFixed(2)} ★\n`;
  text += `- Variance Total Review VS Last Month : ${varianceGoogleReview >= 0 ? `+${varianceGoogleReview}` : varianceGoogleReview}\n\n`;

  // *GSI*
  text += `*GSI*\n`;
  text += `- Total Review : ${gsiTotalReviews}\n`;
  text += `- Performance : ${gsiPerformance.toFixed(1)}%\n`;
  text += `- Variance MTD Total Review Vs MTD Last Month : ${varGsiReview >= 0 ? `+${varGsiReview}` : varGsiReview}\n`;
  text += `- Variance MTD Performance Vs MTD Last Month : ${varGsiPerf >= 0 ? `+${varGsiPerf.toFixed(1)}%` : `${varGsiPerf.toFixed(1)}%`}\n`;
  text += `- Performance (%) : ${gsiPerformance.toFixed(1)}%\n\n`;

  // *CITY LEDGER*
  text += `*CITY LEDGER*\n`;
  text += `- Total Price : Rp. ${formatIDR(cityLedgerTotal)}\n`;
  if (cityLedgerList.length === 0) {
    text += `_Tidak ada transaksi City Ledger bulan ini_\n`;
  } else {
    cityLedgerList.slice(0, 5).forEach((item: any) => {
      text += `_${item.name || item.customerName || 'Item'}_ : Rp ${formatIDR((Number(item.qty) || 1) * (Number(item.price) || 0))}\n`;
      text += `_Reason_: ${item.reason || item.pic || '-'}\n`;
    });
    if (cityLedgerList.length > 5) {
      text += `_...dan ${cityLedgerList.length - 5} item lainnya_\n`;
    }
  }
  text += `\n`;

  // *GUEST SATISFACTION*
  text += `*GUEST SATISFACTION*\n`;
  text += `- Total Price : Rp. ${formatIDR(gsTotal)}\n`;
  if (gsList.length === 0) {
    text += `_Tidak ada transaksi Guest Satisfaction bulan ini_\n`;
  } else {
    gsList.slice(0, 5).forEach((item: any) => {
      text += `_${item.name || item.itemName || 'Menu'}_ : Rp ${formatIDR((Number(item.qty) || 1) * (Number(item.price) || 0))}\n`;
      text += `_Reason_: ${item.reason || item.problem || '-'}\n`;
    });
    if (gsList.length > 5) {
      text += `_...dan ${gsList.length - 5} item lainnya_\n`;
    }
  }
  text += `\n`;

  // *COMPLIMENTARY*
  text += `*COMPLIMENTARY*\n`;
  text += `- Total Price : Rp. ${formatIDR(compTotal)}\n`;
  if (compList.length === 0) {
    text += `_Tidak ada transaksi Complimentary bulan ini_\n`;
  } else {
    compList.slice(0, 5).forEach((item: any) => {
      text += `_${item.name || item.itemName || 'Menu'}_ : Rp ${formatIDR((Number(item.qty) || 1) * (Number(item.price) || 0))}\n`;
      text += `_Reason_: ${item.reason || item.to || '-'}\n`;
    });
    if (compList.length > 5) {
      text += `_...dan ${compList.length - 5} item lainnya_\n`;
    }
  }
  text += `\n`;

  // *VOID BIL*
  text += `*VOID BIL*\n`;
  if (voidRecords.length === 0) {
    text += `_Tidak ada void bill tercatat bulan ini_\n`;
  } else {
    voidRecords.slice(0, 5).forEach((item: any, i: number) => {
      text += `_${i + 1}. Nama Staff_: ${item.staffName || item.pic || '-'}\n`;
      text += `_Total Kesalahan_: ${item.qty || 1} Void\n`;
      text += `_Total Price_: Rp ${formatIDR(Number(item.totalPrice) || Number(item.amount) || Number(item.price) || 0)}\n`;
      text += `_Reason_: ${item.reason || '-'}\n`;
    });
    if (voidRecords.length > 5) {
      text += `_...dan ${voidRecords.length - 5} void bill lainnya_\n`;
    }
  }
  text += `\n`;

  // *QA REPORT*
  text += `*QA REPORT* (Parameters To Improve, Satisfactory / Excellent)\n\n`;
  text += `- *Service* \n`;
  text += `_Nilai_ (%) : ${avgQaService.toFixed(1)}%\n`;
  text += `_Parameters_: ${getTier(avgQaService)}\n`;
  text += `- *Bar* :\n`;
  text += `_Nilai_ (%) : ${avgQaBar.toFixed(1)}%\n`;
  text += `_Parameters_: ${getTier(avgQaBar)}\n`;
  text += `- *Kitchen*\n`;
  text += `_Nilai_ (%) : ${avgQaKitchen.toFixed(1)}%\n`;
  text += `_Parameters_ : ${getTier(avgQaKitchen)}\n`;
  text += `*Total Nilai (%)*: ${avgQaOverall.toFixed(1)}%\n`;
  text += `*Status Parameters All Divisi* : ${qaStatusAll}\n\n`;

  return text;
};

export const RegionalWaReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  allOutletsData,
  globalData,
  selectedMonth,
  selectedYear,
  initialSelectedOutlet = 'SH CIPETE',
  showToast
}) => {
  const [reportScope, setReportScope] = useState<'SELECTED' | 'ALL'>('SELECTED');
  const [selectedOutlet, setSelectedOutlet] = useState<string>(initialSelectedOutlet || 'SH CIPETE');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [searchOutletQuery, setSearchOutletQuery] = useState<string>('');

  const activeOutlets = useMemo(() => {
    const fromConfig = getActiveOutletNames();
    const fromData = Object.keys(allOutletsData || {});
    const combined = Array.from(new Set([...fromConfig, ...fromData]));
    return combined.filter(name => {
      const d = allOutletsData?.[name];
      return !d || !d.isDeleted;
    });
  }, [allOutletsData]);

  React.useEffect(() => {
    if (initialSelectedOutlet && activeOutlets.includes(initialSelectedOutlet)) {
      setSelectedOutlet(initialSelectedOutlet);
    } else if (activeOutlets.length > 0 && !activeOutlets.includes(selectedOutlet)) {
      setSelectedOutlet(activeOutlets[0]);
    }
  }, [initialSelectedOutlet, activeOutlets]);

  // Generate full text
  const generatedReportText = useMemo(() => {
    let result = `*REKAPITULATION OUTLET*\n`;
    result += `*Periode:* ${MONTHS[selectedMonth]} ${selectedYear}\n\n`;

    if (reportScope === 'SELECTED') {
      const singleOutlet = selectedOutlet || activeOutlets[0] || 'SH CIPETE';
      result += generateOutletWaReport(singleOutlet, selectedMonth, selectedYear, allOutletsData, globalData, 1);
    } else {
      activeOutlets.forEach((outletName, idx) => {
        result += generateOutletWaReport(outletName, selectedMonth, selectedYear, allOutletsData, globalData, idx + 1);
        if (idx < activeOutlets.length - 1) {
          result += `------------------------------------\n\n`;
        }
      });
    }

    result += `*BENTUK FONT*\n- BOLD (TEBAL)\n- UNDERSCORE (_) MIRING\n\n`;
    result += `_Generated automatically from Regional Performance Management_`;
    return result;
  }, [reportScope, selectedOutlet, activeOutlets, selectedMonth, selectedYear, allOutletsData, globalData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedReportText).then(() => {
      setIsCopied(true);
      showToast?.('Template WA Report Outlet berhasil disalin ke Clipboard!', 'success');
      setTimeout(() => setIsCopied(false), 3000);
    }).catch(err => {
      console.error(err);
      showToast?.('Gagal menyalin text ke clipboard.', 'error');
    });
  };

  const handleOpenWhatsAppWeb = () => {
    const encoded = encodeURIComponent(generatedReportText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-lg shadow-lg shadow-emerald-950/40">
              <i className="fab fa-whatsapp"></i>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span>WA Report Rekapitulasi Outlet</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  {MONTHS[selectedMonth]} {selectedYear}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Template otomatis mencakup Revenue, Belanja, COGS, Overtime, Man Power, Review, GSI, Ledgers & QA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer self-end sm:self-center"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Scope Selector Bar */}
        <div className="p-4 bg-slate-950/70 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase text-slate-400 mr-1">
              Cakupan Laporan:
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setReportScope('SELECTED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  reportScope === 'SELECTED'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Outlet yang Dipilih
              </button>
              <button
                type="button"
                onClick={() => setReportScope('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  reportScope === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Seluruh Outlet ({activeOutlets.length})
              </button>
            </div>
          </div>

          {/* If Single Outlet Selected: Dropdown to pick outlet */}
          {reportScope === 'SELECTED' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-slate-400">
                Pilih Outlet:
              </span>
              <select
                value={selectedOutlet}
                onChange={e => setSelectedOutlet(e.target.value)}
                className="bg-slate-900 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-300 outline-none focus:ring-2 ring-emerald-500 cursor-pointer"
              >
                {activeOutlets.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Live Preview Content Area */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-950/90 custom-scrollbar">
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              <i className="fas fa-file-alt text-emerald-400"></i>
              <span className="font-bold text-white uppercase text-[11px]">
                Pratinjau Format Pesan WhatsApp:
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {generatedReportText.length.toLocaleString('id-ID')} Karakter
            </span>
          </div>

          <div className="relative">
            <textarea
              readOnly
              value={generatedReportText}
              className="w-full h-80 sm:h-96 p-4 rounded-2xl bg-slate-900 border border-white/10 text-slate-200 font-mono text-xs leading-relaxed outline-none focus:border-emerald-500 custom-scrollbar selection:bg-emerald-600 selection:text-white resize-none"
            />
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {reportScope === 'SELECTED' ? (
              <span>Menyiapkan format WhatsApp untuk <strong>{selectedOutlet}</strong></span>
            ) : (
              <span>Menyiapkan format WhatsApp rekapitulasi untuk <strong>{activeOutlets.length} Outlet</strong></span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase transition-all cursor-pointer"
            >
              Tutup
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 cursor-pointer"
              title="Buka langsung di WhatsApp Web"
            >
              <i className="fab fa-whatsapp"></i>
              <span>Buka WA Web</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer active:scale-95"
            >
              <i className={`fas ${isCopied ? 'fa-check' : 'fa-copy'}`}></i>
              <span>{isCopied ? 'Tersalin!' : 'Salin Template WA'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegionalWaReportModal;
