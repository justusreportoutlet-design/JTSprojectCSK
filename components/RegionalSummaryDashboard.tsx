import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { AppState, Outlet, OutletConfig } from '../types';
import { 
  OUTLETS, 
  REGIONAL_AREAS, 
  getAreaForOutlet, 
  getQaScoreTier, 
  getActiveOutletNames, 
  getActiveRegionalAreas, 
  getActiveOutletConfigs 
} from '../constants';
import { createDefaultManpowerData, calculateManpowerSummary, extractOutletManpowerMap, resolveOutletManpowerData } from '../lib/manpowerUtils';
import { RegionalSummaryReportRecapTable, OutletSummaryRecapItem, resolvePattyCashBudget } from './RegionalSummaryReportRecapTable';
import RegionalGSIRecapTable from './RegionalGSIRecapTable';
import RegionalGoogleReviewRecapTable from './RegionalGoogleReviewRecapTable';
import { RegionalDailyRevenueTable } from './RegionalDailyRevenueTable';
import { RegionalRevenueContributionTable } from './RegionalRevenueContributionTable';
import { RegionalWeekdayWeekendRevenueTable } from './RegionalWeekdayWeekendRevenueTable';
import { RegionalWeeklyRevenueRecapTable } from './RegionalWeeklyRevenueRecapTable';
import { RegionalWeeklyOvertimeRecapTable } from './RegionalWeeklyOvertimeRecapTable';
import { RegionalManpowerRecapTable } from './RegionalManpowerRecapTable';
import { RegionalQARecapTable } from './RegionalQARecapTable';
import ReceivingSheetModule from './ReceivingSheetModule';
import CogsModule from './CogsModule';
import PattyCashExpenseModule from './PattyCashExpenseModule';
import EnergyCostModule from './EnergyCostModule';
import { RegionalCommodityRecapTable } from './RegionalCommodityRecapTable';
import { ThirdPartyGasModule } from './ThirdPartyGasModule';
import { LogisticsModule } from './LogisticsModule';
import MainStoreKitchenModule from './MainStoreKitchenModule';
import CityLedgerModule from './CityLedgerModule';
import GuestSatisfactionModule from './GuestSatisfactionModule';
import ComplimentaryModule from './ComplimentaryModule';
import { RegionalPromoRecapTable } from './RegionalPromoRecapTable';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  AreaChart,
  Area
} from 'recharts';

export type SummaryReportViewType = 
  | 'OVERVIEW'
  | 'DAILY_REVENUE'
  | 'REVENUE_CONTRIBUTION'
  | 'WEEKDAY_WEEKEND_AVG'
  | 'WEEKLY_REVENUE'
  | 'WEEKLY_OVERTIME'
  | 'MANPOWER_REGIONAL'
  | 'QA_REPORT_REGIONAL'
  | 'RECEIVING_SHEET'
  | 'COGS'
  | 'PATTY_CASH_EXPENSE'
  | 'ENERGY_COST'
  | 'COMMODITY_KITCHEN_BAR'
  | 'THIRD_PARTY_GAS'
  | 'REKAPAN_LOGISTIK'
  | 'MAIN_STORE_KITCHEN'
  | 'CITY_LEDGER'
  | 'SATISFACTION'
  | 'COMPLIMENTARY'
  | 'GSI_REGIONAL'
  | 'BANKING_PROMO_REGIONAL'
  | 'GOOGLE_REVIEW_REGIONAL'
  | 'REKAPAN_REPORT'
  | 'SUMMARY_TABLE'
  | 'YEARLY_REPORT'
  | 'ALL_REPORTS';

interface Props {
  data: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  globalData: AppState;
  isPreviewMode?: boolean;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  selectedArea?: string;
  onSelectArea?: (area: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate?: (path: any, val: any) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

// Helper to sum ledger records for a given month prefix (YYYY-MM)
const sumLedger = (records: any, filterMonthPrefix: string) => {
  if (!records || typeof records !== 'object') return 0;
  let total = 0;
  Object.entries(records).forEach(([dateStr, list]: [string, any]) => {
    if (dateStr.startsWith(filterMonthPrefix)) {
      if (Array.isArray(list)) {
        list.forEach((item: any) => {
          if (item && item.price) {
            const qty = Number(item.qty) || 1;
            total += Number(item.price) * qty;
          }
        });
      } else if (typeof list === 'number') {
        total += list;
      }
    }
  });
  return total;
};

export const RegionalSummaryDashboard: React.FC<Props> = ({
  data,
  selectedMonth: rawSelectedMonth,
  selectedYear: rawSelectedYear,
  globalData,
  isPreviewMode,
  selectedOutlet,
  onSelectOutlet,
  selectedArea,
  onSelectArea,
  showToast,
  onUpdate,
}) => {
  const safeSelectedYear = (!rawSelectedYear || isNaN(Number(rawSelectedYear))) 
    ? new Date().getFullYear() 
    : Number(rawSelectedYear);

  const safeSelectedMonth = (rawSelectedMonth === undefined || rawSelectedMonth === null || isNaN(Number(rawSelectedMonth))) 
    ? new Date().getMonth() 
    : Math.max(0, Math.min(11, Number(rawSelectedMonth)));

  const selectedMonth = safeSelectedMonth;
  const selectedYear = safeSelectedYear;

  const [activeViewMode, setActiveViewMode] = useState<SummaryReportViewType>('OVERVIEW');
  const [chartMetric, setChartMetric] = useState<'REVENUE' | 'BELANJA' | 'FORECAST'>('REVENUE');
  const [reportYear, setReportYear] = useState<number>(safeSelectedYear);

  useEffect(() => {
    if (safeSelectedYear && !isNaN(safeSelectedYear)) {
      setReportYear(safeSelectedYear);
    }
  }, [safeSelectedYear]);

  const [activeOutletConfigs, setActiveOutletConfigs] = useState<OutletConfig[]>(() => getActiveOutletConfigs());
  useEffect(() => {
    const handleCfg = () => setActiveOutletConfigs(getActiveOutletConfigs());
    window.addEventListener('appOutletConfigsChanged', handleCfg);
    window.addEventListener('appOutletDeleted', handleCfg);
    return () => {
      window.removeEventListener('appOutletConfigsChanged', handleCfg);
      window.removeEventListener('appOutletDeleted', handleCfg);
    };
  }, []);

  const activeNames = useMemo(() => {
    return getActiveOutletNames(activeOutletConfigs).filter(name => {
      const d = data?.[name];
      return !d || !d.isDeleted;
    });
  }, [activeOutletConfigs, data]);

  const activeRegionalAreas = useMemo(() => {
    return getActiveRegionalAreas(activeNames);
  }, [activeNames]);

  // Determine target outlets based on area / outlet filter
  const targetOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return activeNames.filter(o => o === selectedOutlet);
    }
    if (selectedArea && selectedArea !== 'ALL') {
      const areaList = activeRegionalAreas[selectedArea] || [];
      return areaList.filter(o => activeNames.includes(o));
    }
    return activeNames;
  }, [selectedOutlet, selectedArea, activeNames, activeRegionalAreas]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    return (isNaN(d) || d < 28) ? 30 : d;
  }, [selectedYear, selectedMonth]);

  // Last Month info
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthKey = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, '0')}`;

  // 1. Calculate Comprehensive per-outlet summary for the selected month
  const outletDataList = useMemo(() => {
    return targetOutlets.map((outletName, idx) => {
      const outletMonths = (data && (data as any)[outletName]) || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      
      // A. Revenue & Budget
      const sales = mData.sales || { dailyRecording: {} };
      const budget = (sales.monthlyBudgets || {})[monthKey] || sales.budgetRevenue || 0;
      
      let mtdRevenue = 0;
      let recordedDays = 0;
      if (sales.dailyRecording) {
        Object.entries(sales.dailyRecording).forEach(([dateStr, d]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            const rev = Number(d?.revenue) || 
              ((Number(d?.dineInRevenue) || 0) + (Number(d?.takeAwayRevenue) || 0) + (Number(d?.goFoodRevenue) || 0) + (Number(d?.grabFoodRevenue) || 0));
            if (rev > 0) {
              mtdRevenue += rev;
              recordedDays++;
            }
          }
        });
      }
      if (mtdRevenue === 0 && sales.revenue) {
        mtdRevenue = Number(sales.revenue) || 0;
        recordedDays = Math.min(new Date().getDate(), daysInMonth);
      }

      const revAchievement = budget > 0 ? (mtdRevenue / budget) * 100 : 0;
      const revVariance = mtdRevenue - budget;

      // B. Belanja Supplier (Receiving Sheet)
      const supplierKeys = [
        'dailyIkigaiLedger', 'dailyPanfilaLedger', 'dailyEverestLedger',
        'dailySaungKubilLedger', 'dailyTgifLedger', 'dailySukandaLedger',
        'dailyKebunkuLedger'
      ];
      let totalSupplierBelanja = 0;
      supplierKeys.forEach(k => {
        totalSupplierBelanja += sumLedger((mData as any)[k], monthKey);
      });

      // Cash (Retail Food belanja menggunakan patty cash - Commodity)
      let cashRetailFoodBelanja = 0;
      cashRetailFoodBelanja += sumLedger((mData as any).dailyCommodityLedger, monthKey);
      cashRetailFoodBelanja += sumLedger((mData as any).dailyCashLedger, monthKey);
      if (cashRetailFoodBelanja === 0 && mData.expenses) {
        Object.entries(mData.expenses).forEach(([dateStr, exp]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            cashRetailFoodBelanja += (Number(exp?.commodity) || 0) + (Number(exp?.cash) || 0);
          }
        });
      }

      // Chemical, Stationary & Marketing Belanja (Deductions for Main Store)
      let chemicalTotal = 0;
      let stationaryTotal = 0;
      let marketingTotal = 0;

      if ((mData as any).dailyChemicalLedger) {
        Object.entries((mData as any).dailyChemicalLedger).forEach(([dateStr, list]: [string, any]) => {
          if (dateStr.startsWith(monthKey) && Array.isArray(list)) {
            list.forEach(item => {
              if (item && item.price) {
                const qty = Number(item.qty) || 1;
                const subtotal = Number(item.price) * qty;
                const cat = String(item.category || '').toUpperCase();
                if (cat === 'STATIONARY') {
                  stationaryTotal += subtotal;
                } else if (cat === 'MARKETING') {
                  marketingTotal += subtotal;
                } else {
                  chemicalTotal += subtotal;
                }
              }
            });
          }
        });
      }

      if (mData.expenses) {
        Object.entries(mData.expenses).forEach(([dateStr, exp]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            if (chemicalTotal === 0) chemicalTotal += Number(exp?.chemical) || 0;
            if (stationaryTotal === 0) stationaryTotal += Number(exp?.stationary) || 0;
            if (marketingTotal === 0) marketingTotal += Number(exp?.marketing) || 0;
          }
        });
      }

      if (stationaryTotal === 0 && (mData as any).dailyAtkLedger) {
        stationaryTotal += sumLedger((mData as any).dailyAtkLedger, monthKey);
      }
      if (stationaryTotal === 0 && mData.expenses) {
        Object.entries(mData.expenses).forEach(([dateStr, exp]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            stationaryTotal += Number(exp?.atk) || 0;
          }
        });
      }

      const totalChemStatMkt = chemicalTotal + stationaryTotal + marketingTotal;
      const chemStatMktRatio = mtdRevenue > 0 ? (totalChemStatMkt / mtdRevenue) * 100 : 0;

      // C. Belanja Main Store & Main Kitchen (Main Store sudah dikurangi chemical, stationary & marketing)
      const grossMainStoreBelanja = sumLedger((mData as any).dailyMainStoreLedger, monthKey);
      const mainStoreBelanja = Math.max(0, grossMainStoreBelanja - totalChemStatMkt);
      const mainKitchenBelanja = sumLedger((mData as any).dailyMainKitchenLedger, monthKey);
      const totalMSMK = mainStoreBelanja + mainKitchenBelanja;

      // Total Belanja MTD (Supplier + MS Net + MK + Cash Retail Food)
      const totalBelanjaMTD = totalSupplierBelanja + mainKitchenBelanja + mainStoreBelanja + cashRetailFoodBelanja;
      const belanjaRatio = mtdRevenue > 0 ? (totalBelanjaMTD / mtdRevenue) * 100 : 0;

      // D. Forecast Revenue compare dengan Sisa Hari
      const effectiveRecordedDays = recordedDays > 0 ? recordedDays : Math.min(new Date().getDate(), daysInMonth);
      const daysRemaining = Math.max(0, daysInMonth - effectiveRecordedDays);
      const avgDailyRevenue = effectiveRecordedDays > 0 ? mtdRevenue / effectiveRecordedDays : 0;
      const forecastRevenue = mtdRevenue + (avgDailyRevenue * daysRemaining);
      const forecastAchievement = budget > 0 ? (forecastRevenue / budget) * 100 : 0;
      const forecastVariance = forecastRevenue - budget;

      // E. Compare Last Month
      const lastMonthData = outletMonths[String(lastMonthIdx)] || outletMonths[lastMonthIdx] || {};
      const lastMonthSales = lastMonthData.lastMonthSales || lastMonthData.sales || { dailyRecording: {} };
      let lastMonthRevenue = 0;
      if (lastMonthSales.dailyRecording) {
        Object.entries(lastMonthSales.dailyRecording).forEach(([dateStr, d]: [string, any]) => {
          if (dateStr.startsWith(lastMonthKey)) {
            const rev = Number(d?.revenue) || 
              ((Number(d?.dineInRevenue) || 0) + (Number(d?.takeAwayRevenue) || 0) + (Number(d?.goFoodRevenue) || 0) + (Number(d?.grabFoodRevenue) || 0));
            lastMonthRevenue += rev;
          }
        });
      }
      if (lastMonthRevenue === 0 && lastMonthSales.revenue) {
        lastMonthRevenue = Number(lastMonthSales.revenue) || 0;
      }

      const momVariance = mtdRevenue - lastMonthRevenue;
      const momGrowthPercent = lastMonthRevenue > 0 ? (momVariance / lastMonthRevenue) * 100 : 0;

      // F. Other Ledgers
      // 1. Guest Satisfaction
      const guestSatisfactionTotal = sumLedger((mData as any).dailyCustomerSat || (mData as any).dailyGuestSatisfaction, monthKey);
      
      // 2. City Ledger
      const cityLedgerTotal = sumLedger((mData as any).dailyCityLedger, monthKey);

      // 3. Complimentary
      const complimentaryTotal = sumLedger((mData as any).dailyComplimentary, monthKey);

      // 4. OPEX (6 Kategori Khusus: Non Commodity, Commodity, ATK, Maintenance, Asset, Casual)
      let opexNonCommodity = sumLedger((mData as any).dailyNonCommodityLedger, monthKey);
      let opexCommodity = sumLedger((mData as any).dailyCommodityLedger, monthKey);
      let opexAtk = sumLedger((mData as any).dailyAtkLedger, monthKey);
      let opexMaintenance = sumLedger((mData as any).dailyMaintenanceLedger, monthKey);
      let opexAsset = sumLedger((mData as any).dailyAssetLedger, monthKey);
      let opexCasual = sumLedger((mData as any).dailyCasualLedger, monthKey);

      if (mData.expenses) {
        Object.entries(mData.expenses).forEach(([dateStr, exp]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            if (opexNonCommodity === 0) opexNonCommodity += Number(exp?.nonCommodity) || 0;
            if (opexCommodity === 0) opexCommodity += Number(exp?.commodity) || 0;
            if (opexAtk === 0) opexAtk += Number(exp?.atk) || 0;
            if (opexMaintenance === 0) opexMaintenance += Number(exp?.maintenance) || 0;
            if (opexAsset === 0) opexAsset += Number(exp?.asset) || 0;
            if (opexCasual === 0) opexCasual += Number(exp?.casual) || 0;
          }
        });
      }

      const opexTotal = opexNonCommodity + opexCommodity + opexAtk + opexMaintenance + opexAsset + opexCasual;
      const opexPercent = mtdRevenue > 0 ? (opexTotal / mtdRevenue) * 100 : 0;

      // Patty Cash Total (Legacy field)
      let pattyCashTotal = opexTotal + sumLedger((mData as any).dailyThirdPartyLedger, monthKey) + sumLedger((mData as any).dailyCashLedger, monthKey);
      if (pattyCashTotal === 0 && mData.expenses) {
        Object.entries(mData.expenses).forEach(([dateStr, exp]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            pattyCashTotal += (Number(exp?.thirdParty) || 0) + (Number(exp?.cash) || 0);
          }
        });
      }
      if (pattyCashTotal === 0) pattyCashTotal = opexTotal;

      // 5. Patty Cash Budget (Diambil dari input budget fitur Patty Cash, atau acuan 0,3% dari REVENUE BERJALAN, bukan dari MTD Budget)
      const budgetPattyCash = resolvePattyCashBudget(mData, monthKey, mtdRevenue, outletName);
      const pattyCashVariance = budgetPattyCash - pattyCashTotal;
      const pattyCashAchPercent = budgetPattyCash > 0 ? (pattyCashTotal / budgetPattyCash) * 100 : 0;
      const isPattyCashOver = budgetPattyCash > 0 ? pattyCashTotal > budgetPattyCash : (mtdRevenue > 0 ? pattyCashTotal > (mtdRevenue * 0.003) : false);

      return {
        no: idx + 1,
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        // Revenue vs Budget
        mtdRevenue,
        budget,
        revAchievement,
        revVariance,
        // Belanja & Ratio
        totalSupplierBelanja,
        mainStoreBelanja,
        grossMainStoreBelanja,
        mainKitchenBelanja,
        cashRetailFoodBelanja,
        totalMSMK,
        totalBelanjaMTD,
        belanjaRatio,
        // Opex 6 Kategori Khusus
        opexNonCommodity,
        opexCommodity,
        opexAtk,
        opexMaintenance,
        opexAsset,
        opexCasual,
        opexTotal,
        opexPercent,
        // Chemical, Stationary & Marketing
        chemicalTotal,
        stationaryTotal,
        marketingTotal,
        totalChemStatMkt,
        chemStatMktRatio,
        // Patty Cash Budget & Variance
        budgetPattyCash,
        pattyCashVariance,
        pattyCashAchPercent,
        isPattyCashOver,
        // Forecast & Sisa Hari
        recordedDays: effectiveRecordedDays,
        daysRemaining,
        avgDailyRevenue,
        forecastRevenue,
        forecastAchievement,
        forecastVariance,
        // Compare Last Month
        lastMonthRevenue,
        momVariance,
        momGrowthPercent,
        // Ledgers
        guestSatisfactionTotal,
        cityLedgerTotal,
        complimentaryTotal,
        pattyCashTotal
      };
    });
  }, [data, targetOutlets, selectedMonth, selectedYear, monthKey, lastMonthKey, lastMonthIdx, daysInMonth]);

  // Recaps formatted for RegionalSummaryReportRecapTable
  const recapSummaryItems = useMemo<OutletSummaryRecapItem[]>(() => {
    return outletDataList.map((d, idx) => {
      const outletMonths = (data && (data as any)[d.outlet]) || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};

      // Overtime (Cut-off 26 Bulan Lalu s/d 25 Bulan Ini, contoh: 26 Agustus - 25 September)
      const cutoffStart = `${lastMonthKey}-26`;
      const cutoffEnd = `${monthKey}-25`;
      const lastMData = outletMonths[String(lastMonthIdx)] || outletMonths[lastMonthIdx] || {};

      let otService = 0, otBar = 0, otKitchen = 0, otTotal = 0, otStaffCount = 0;
      if (mData.weeklyOvertime) {
        Object.entries(mData.weeklyOvertime).forEach(([k, entry]: [string, any]) => {
          if (Array.isArray(entry)) {
            entry.forEach((wItem: any) => {
              otService += Number(wItem.serviceHours) || 0;
              otBar += Number(wItem.barHours) || 0;
              otKitchen += Number(wItem.kitchenHours) || 0;
              otTotal += Number(wItem.totalOvertime) || Number(wItem.totalOvertimeHours) || 0;
              otStaffCount = Math.max(otStaffCount, Number(wItem.totalStaff) || 0);
            });
          } else if (k.startsWith(monthKey) || entry?.monthKey === monthKey || (entry?.startDate >= cutoffStart && entry?.endDate <= cutoffEnd)) {
            otService += Number(entry.serviceHours) || 0;
            otBar += Number(entry.barHours) || 0;
            otKitchen += Number(entry.kitchenHours) || 0;
            otTotal += Number(entry.totalOvertime) || Number(entry.totalOvertimeHours) || 0;
            otStaffCount = Math.max(otStaffCount, Number(entry.totalStaff) || 0);
          }
        });
      }
      if (otTotal === 0) {
        const staffDivMap = new Map<string, string>();
        [...(lastMData.staffList || []), ...(mData.staffList || [])].forEach((st: any) => {
          if (st?.id || st?.staffId) staffDivMap.set(st.id || st.staffId, String(st.division || '').toUpperCase());
        });
        const otStaffIds = new Set<string>();
        let dOt = 0;
        let dService = 0;
        let dBar = 0;
        let dKitchen = 0;

        const combinedDailyOT: Record<string, any[]> = {
          ...(lastMData.dailyOvertime || {}),
          ...(mData.dailyOvertime || {})
        };

        Object.entries(combinedDailyOT).forEach(([dateStr, entries]) => {
          if (dateStr >= cutoffStart && dateStr <= cutoffEnd && Array.isArray(entries)) {
            entries.forEach((e: any) => {
              const h = Number(e.hours) || Number(e.overtimeHours) || 0;
              if (h > 0) {
                dOt += h;
                const sId = e.staffId || e.staffName || e.name;
                if (sId) otStaffIds.add(sId);
                const div = (e.division || staffDivMap.get(e.staffId) || '').toUpperCase();
                if (div.includes('BAR')) dBar += h;
                else if (div.includes('KITCHEN') || div.includes('COOK') || div.includes('STEWARD')) dKitchen += h;
                else dService += h;
              }
            });
          }
        });
        if (dOt > 0) {
          otTotal = dOt;
          otService = dService;
          otBar = dBar;
          otKitchen = dKitchen;
          otStaffCount = otStaffIds.size;
        }
      }
      const otAverage = otStaffCount > 0 ? otTotal / otStaffCount : 0;

      // GSI
      let qosPos = 0, qosTot = 0, qofPos = 0, qofTot = 0, qobPos = 0, qobTot = 0, aosPos = 0, aosTot = 0, vfmPos = 0, vfmTot = 0;
      let gsiTotalResponses = 0;
      if (mData.dailyGSI) {
        Object.entries(mData.dailyGSI).forEach(([dateStr, rows]: [string, any]) => {
          if (dateStr.startsWith(monthKey) && Array.isArray(rows)) {
            rows.forEach((r: any) => {
              const exc = Number(r.excellent) || 0;
              const gd = Number(r.good) || 0;
              const avg = Number(r.average) || 0;
              const pr = Number(r.poor) || 0;
              const abs = Number(r.abstain) || 0;
              const pos = exc + gd;
              const tot = exc + gd + avg + pr;
              gsiTotalResponses += pos + avg + pr + abs;
              const sub = String(r.subject || r.label || '').toLowerCase();
              if (sub.includes('service') && !sub.includes('attentive')) {
                qosPos += pos; qosTot += tot;
              } else if (sub.includes('food')) {
                qofPos += pos; qofTot += tot;
              } else if (sub.includes('beverage') || sub.includes('drink')) {
                qobPos += pos; qobTot += tot;
              } else if (sub.includes('attentive') || sub.includes('staff') || sub.includes('ambiance') || sub.includes('cleanliness')) {
                aosPos += pos; aosTot += tot;
              } else if (sub.includes('value') || sub.includes('money') || sub.includes('price')) {
                vfmPos += pos; vfmTot += tot;
              }
            });
          }
        });
      }
      const gsiQos = qosTot > 0 ? (qosPos / qosTot) * 100 : 0;
      const gsiQof = qofTot > 0 ? (qofPos / qofTot) * 100 : 0;
      const gsiQob = qobTot > 0 ? (qobPos / qobTot) * 100 : 0;
      const gsiAos = aosTot > 0 ? (aosPos / aosTot) * 100 : 0;
      const gsiVfm = vfmTot > 0 ? (vfmPos / vfmTot) * 100 : 0;
      const validCats = [gsiQos, gsiQof, gsiQob, gsiAos, gsiVfm].filter(v => v > 0);
      const gsiScorePercent = validCats.length > 0 ? validCats.reduce((a, b) => a + b, 0) / validCats.length : 0;

      // Google Review
      let grRating = 0, grTotalReviews = 0;
      if (mData.googleReviews?.[monthKey]) {
        grRating = Number(mData.googleReviews[monthKey].rating) || 0;
        grTotalReviews = Number(mData.googleReviews[monthKey].totalReviews) || 0;
      } else if (mData.googleReview) {
        grRating = Number(mData.googleReview.currentRating) || 0;
        grTotalReviews = Number(mData.googleReview.totalReview) || 0;
      }

      // CPA
      let cpaFood = 0, cpaBeverage = 0, cpaService = 0;
      if (mData.dailyCPA) {
        Object.entries(mData.dailyCPA).forEach(([dateStr, entries]: [string, any]) => {
          if (dateStr.startsWith(monthKey) && Array.isArray(entries)) {
            entries.forEach((e: any) => {
              const cat = String(e.category || '').toUpperCase();
              if (cat.includes('FOOD')) cpaFood++;
              else if (cat.includes('BEV')) cpaBeverage++;
              else cpaService++;
            });
          }
        });
      }
      if (mData.guestComplaints && Array.isArray(mData.guestComplaints)) {
        mData.guestComplaints.forEach((c: any) => {
          if (String(c.date || '').startsWith(monthKey)) {
            const cat = String(c.category || c.type || '').toUpperCase();
            if (cat.includes('FOOD')) cpaFood++;
            else if (cat.includes('BEV')) cpaBeverage++;
            else cpaService++;
          }
        });
      }
      const cpaTotal = cpaFood + cpaBeverage + cpaService;

      // OPEX (Hanya 6 Kategori: Non Commodity, Commodity, ATK, Maintenance, Asset, Casual)
      const opexNonCommodity = d.opexNonCommodity;
      const opexCommodity = d.opexCommodity;
      const opexAtk = d.opexAtk;
      const opexMaintenance = d.opexMaintenance;
      const opexAsset = d.opexAsset;
      const opexCasual = d.opexCasual;
      const opexTotal = d.opexTotal;
      const opexPercent = d.opexPercent;

      // Manpower from Outlet Manpower Table
      const allMp = extractOutletManpowerMap(outletMonths, globalData?.manpowerData);
      const outletMpData = resolveOutletManpowerData(allMp, d.outlet, monthKey);
      const mpSummary = calculateManpowerSummary(outletMpData);
      const mpFulfillment = mpSummary.grandTotalBudget > 0 ? (mpSummary.grandTotalActual / mpSummary.grandTotalBudget) * 100 : 0;

      // QA 3-Month Rolling Average across 3 consecutive months ending in selectedMonth
      const qMonths = [(selectedMonth - 2 + 12) % 12, (selectedMonth - 1 + 12) % 12, selectedMonth];
      let kSum = 0, bSum = 0, sSum = 0, kCnt = 0, bCnt = 0, sCnt = 0;
      qMonths.forEach(qm => {
        const qmPrefix = `${selectedYear}-${String(qm + 1).padStart(2, '0')}`;
        const qmData = outletMonths[String(qm)] || outletMonths[qm] || {};
        const qmQA = { ...(qmData.dailyQA || {}), ...(globalData?.outlet === d.outlet ? (globalData.dailyQA || {}) : {}) };
        let mK = 0, mB = 0, mS = 0, mCount = 0;
        Object.entries(qmQA).forEach(([dt, val]: [string, any]) => {
          if (dt.startsWith(qmPrefix) && val) {
            const getSec = (sec: any) => {
              if (!sec) return 0;
              const vs = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
              return vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
            };
            const k = getSec(val.kitchen); const b = getSec(val.bar); const s = getSec(val.service);
            if (k > 0 || b > 0 || s > 0) {
              mK += k; mB += b; mS += s; mCount++;
            }
          }
        });
        if (mCount > 0) {
          kSum += (mK / mCount); bSum += (mB / mCount); sSum += (mS / mCount);
          kCnt++; bCnt++; sCnt++;
        }
      });
      const qaKitchenAvg = kCnt > 0 ? Number((kSum / kCnt).toFixed(2)) : 0;
      const qaBarAvg = bCnt > 0 ? Number((bSum / bCnt).toFixed(2)) : 0;
      const qaServiceAvg = sCnt > 0 ? Number((sSum / sCnt).toFixed(2)) : 0;
      const qaQuarterAvg = (qaKitchenAvg > 0 || qaBarAvg > 0 || qaServiceAvg > 0)
        ? Number(((qaKitchenAvg + qaBarAvg + qaServiceAvg) / 3).toFixed(2))
        : 0;
      const qaStatus = getQaScoreTier(qaQuarterAvg).label;

      // Overtime Pay & Budget
      const otRate = 20000;
      const otTotalPay = otTotal * otRate;
      const otBudgetPay = (mpSummary.totalInhouseActual * 40) * otRate;
      const otUtilization = otBudgetPay > 0 ? (otTotalPay / otBudgetPay) * 100 : 0;

      // Energy Cost
      const energyData = mData.energyCost || (globalData?.outlet === d.outlet ? globalData.energyCost : {}) || {};
      const energyElectricity = Number(energyData.electricity?.cost) || Number(energyData.electricityCost) || 0;
      const energyWater = Number(energyData.water?.cost) || Number(energyData.waterCost) || 0;
      const energyGas = Number(energyData.gas?.cost) || Number(energyData.gasCost) || 0;
      const energyTotal = energyElectricity + energyWater + energyGas;
      const energyRatio = d.mtdRevenue > 0 ? (energyTotal / d.mtdRevenue) * 100 : 0;

      // Ledgers
      const thirdPartyTotal = sumLedger(mData.dailyThirdPartyLedger, monthKey);
      const gasLedgerTotal = sumLedger(mData.dailyGasLedger, monthKey);
      const complimentaryTotal = sumLedger(mData.dailyComplimentaryLedger, monthKey);
      const cityLedgerTotal = sumLedger(mData.dailyCityLedger, monthKey);

      return {
        no: idx + 1,
        outlet: d.outlet,
        area: d.area,
        // Full fields
        targetRevenue: d.budget,
        actualRevenue: d.mtdRevenue,
        revenuePercent: d.revAchievement,
        revenueVariance: d.revVariance,
        fcMk: d.mainKitchenBelanja,
        fcMs: d.mainStoreBelanja,
        fcSupplier: d.totalSupplierBelanja,
        fcTotal: d.totalBelanjaMTD,
        fcPercent: d.belanjaRatio,
        // OPEX (6 Kategori Khusus)
        opexPattyCash: d.pattyCashTotal,
        opexNonCommodity,
        opexCommodity,
        opexAtk,
        opexMaintenance,
        opexAsset,
        opexCasual,
        opexTotal,
        opexPercent,
        // Chemical, Stationary & Marketing (Terpisah)
        opexChemical: d.chemicalTotal,
        opexStationery: d.stationaryTotal,
        opexMarketing: d.marketingTotal,
        chemicalTotal: d.chemicalTotal,
        stationaryTotal: d.stationaryTotal,
        marketingTotal: d.marketingTotal,
        totalChemStatMkt: d.totalChemStatMkt,
        chemStatMktRatio: d.chemStatMktRatio,
        otService,
        otBar,
        otKitchen,
        otTotal,
        otStaffCount,
        otAverage,
        otTotalPay,
        otBudgetPay,
        otUtilization,
        // Man Power
        mpBudget: mpSummary.totalInhouseBudget,
        mpActual: mpSummary.totalInhouseActual,
        mpVariance: mpSummary.totalInhouseVariance,
        mpVacant: mpSummary.totalVacantOpen,
        mpService: mpSummary.serviceActual,
        mpBar: mpSummary.barActual,
        mpKitchen: mpSummary.kitchenActual,
        mpFulfillment,
        // QA 3-Month
        qaQuarterAvg,
        qaBarAvg,
        qaKitchenAvg,
        qaServiceAvg,
        qaStatus: qaStatus as any,
        // Energy & Ledgers
        energyElectricity,
        energyWater,
        energyGas,
        energyTotal,
        energyRatio,
        thirdPartyTotal,
        gasLedgerTotal,
        complimentaryTotal,
        cityLedgerTotal,
        gsiQos,
        gsiQof,
        gsiQob,
        gsiAos,
        gsiVfm,
        gsiTotalResponses,
        gsiScorePercent,
        grRating,
        grTotalReviews,
        cpaFood,
        cpaBeverage,
        cpaService,
        cpaTotal,
        // Compatibility aliases
        mtdRevenue: d.mtdRevenue,
        budgetRevenue: d.budget,
        revAchievement: d.revAchievement,
        revVariance: d.revVariance,
        supplierBelanja: d.totalSupplierBelanja,
        mainKitchenBelanja: d.mainKitchenBelanja,
        mainStoreBelanja: d.mainStoreBelanja,
        cashRetailFoodBelanja: d.cashRetailFoodBelanja || 0,
        totalBelanjaOperasional: d.totalBelanjaMTD,
        costBelanjaPercent: d.belanjaRatio,
        actualPattyCash: d.pattyCashTotal,
        budgetPattyCash: d.budgetPattyCash,
        pattyCashVariance: d.pattyCashVariance,
        pattyCashAchPercent: d.pattyCashAchPercent,
        isPattyCashOver: d.isPattyCashOver
      };
    });
  }, [outletDataList, data, selectedMonth, monthKey]);

  // 2. Regional Aggregate Totals
  const regionalTotals = useMemo(() => {
    let totalRevenue = 0;
    let totalBudget = 0;
    let totalBelanja = 0;
    let totalMS = 0;
    let totalMK = 0;
    let totalMSMK = 0;
    let totalSupplier = 0;
    let totalCashRetail = 0;
    let totalForecast = 0;
    let totalLastMonthRev = 0;
    let totalGuestSat = 0;
    let totalCityLedger = 0;
    let totalComplimentary = 0;
    let totalPattyCash = 0;

    outletDataList.forEach(item => {
      totalRevenue += item.mtdRevenue;
      totalBudget += item.budget;
      totalBelanja += item.totalBelanjaMTD;
      totalMS += item.mainStoreBelanja;
      totalMK += item.mainKitchenBelanja;
      totalMSMK += item.totalMSMK;
      totalSupplier += item.totalSupplierBelanja;
      totalCashRetail += item.cashRetailFoodBelanja;
      totalForecast += item.forecastRevenue;
      totalLastMonthRev += item.lastMonthRevenue;
      totalGuestSat += item.guestSatisfactionTotal;
      totalCityLedger += item.cityLedgerTotal;
      totalComplimentary += item.complimentaryTotal;
      totalPattyCash += item.pattyCashTotal;
    });

    const totalRevAch = totalBudget > 0 ? (totalRevenue / totalBudget) * 100 : 0;
    const totalRevVariance = totalRevenue - totalBudget;
    const totalBelanjaRatio = totalRevenue > 0 ? (totalBelanja / totalRevenue) * 100 : 0;
    const totalForecastAch = totalBudget > 0 ? (totalForecast / totalBudget) * 100 : 0;
    const totalForecastVariance = totalForecast - totalBudget;
    const totalMomVariance = totalRevenue - totalLastMonthRev;
    const totalMomGrowth = totalLastMonthRev > 0 ? (totalMomVariance / totalLastMonthRev) * 100 : 0;

    return {
      totalRevenue,
      totalBudget,
      totalRevAch,
      totalRevVariance,
      totalBelanja,
      totalBelanjaRatio,
      totalMS,
      totalMK,
      totalMSMK,
      totalSupplier,
      totalCashRetail,
      totalForecast,
      totalForecastAch,
      totalForecastVariance,
      totalLastMonthRev,
      totalMomVariance,
      totalMomGrowth,
      totalGuestSat,
      totalCityLedger,
      totalComplimentary,
      totalPattyCash
    };
  }, [outletDataList]);

  // 3. Yearly 12-Month Matrix per Outlet & Total Regional
  const yearlyReportData = useMemo(() => {
    const matrix = targetOutlets.map((outletName, idx) => {
      const outletMonths = (data && (data as any)[outletName]) || {};
      const monthlyRevs: number[] = [];
      let annualTotal = 0;
      let activeMonthsCount = 0;

      for (let m = 0; m < 12; m++) {
        const mKey = `${reportYear}-${String(m + 1).padStart(2, '0')}`;
        const mData = outletMonths[String(m)] || outletMonths[m] || {};
        const sales = mData.sales || { dailyRecording: {} };
        
        let mRev = 0;
        if (sales.dailyRecording) {
          Object.entries(sales.dailyRecording).forEach(([dateStr, d]: [string, any]) => {
            if (dateStr.startsWith(mKey)) {
              const rev = Number(d?.revenue) || 
                ((Number(d?.dineInRevenue) || 0) + (Number(d?.takeAwayRevenue) || 0) + (Number(d?.goFoodRevenue) || 0) + (Number(d?.grabFoodRevenue) || 0));
              mRev += rev;
            }
          });
        }
        if (mRev === 0 && sales.revenue) {
          mRev = Number(sales.revenue) || 0;
        }

        monthlyRevs.push(mRev);
        annualTotal += mRev;
        if (mRev > 0) activeMonthsCount++;
      }

      const monthlyAvg = activeMonthsCount > 0 ? annualTotal / activeMonthsCount : 0;

      return {
        no: idx + 1,
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        monthlyRevs,
        annualTotal,
        monthlyAvg,
        activeMonthsCount
      };
    });

    // Regional monthly totals across all outlets
    const regionalMonthlyRevs: number[] = [];
    let grandAnnualTotal = 0;

    for (let m = 0; m < 12; m++) {
      let mTotal = 0;
      matrix.forEach(row => {
        mTotal += row.monthlyRevs[m];
      });
      regionalMonthlyRevs.push(mTotal);
      grandAnnualTotal += mTotal;
    }

    const regionalMonthlyAvg = grandAnnualTotal / 12;

    // Monthly chart dataset
    const monthlyChartData = SHORT_MONTHS.map((mName, mIdx) => ({
      month: mName,
      fullName: MONTH_NAMES[mIdx],
      revenue: regionalMonthlyRevs[mIdx] / 1000000, // in Millions
      revenueRaw: regionalMonthlyRevs[mIdx]
    }));

    return {
      matrix,
      regionalMonthlyRevs,
      grandAnnualTotal,
      regionalMonthlyAvg,
      monthlyChartData
    };
  }, [data, targetOutlets, reportYear]);

  // Chart data for current month outlet comparison
  const outletComparisonChart = useMemo(() => {
    return outletDataList.map(item => ({
      name: item.outlet.replace('JUSTUS ', '').replace('THE BARN ', ''),
      revenue: item.mtdRevenue / 1000000,
      budget: item.budget / 1000000,
      forecast: item.forecastRevenue / 1000000,
      belanja: item.totalBelanjaMTD / 1000000
    })).sort((a, b) => b.revenue - a.revenue);
  }, [outletDataList]);

  // Excel Export Handler
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Regional Analytics Suite';
      workbook.created = new Date();

      // SHEET 1: Summary Per Outlet (Month)
      const sheet1 = workbook.addWorksheet(`Summary ${MONTH_NAMES[selectedMonth]} ${selectedYear}`);
      sheet1.views = [{ showGridLines: true }];

      // Title
      sheet1.mergeCells('A1:Q1');
      const titleCell = sheet1.getCell('A1');
      titleCell.value = `REGIONAL OUTLET SUMMARY PERFORMANCE - ${MONTH_NAMES[selectedMonth].toUpperCase()} ${selectedYear}`;
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet1.getRow(1).height = 35;

      // Header Rows
      const headers = [
        'NO', 'OUTLET', 'AREA', 
        'MTD REVENUE', 'BUDGET REVENUE', '% ACH', 'SELISIH (RP)',
        'TOTAL BELANJA', 'RATIO BELANJA (%)',
        'SISA HARI', 'FORECAST REVENUE', 'PROYEKSI ACH (%)',
        'LAST MONTH REV', 'GROWTH MoM (RP)', 'GROWTH MoM (%)',
        'BELANJA MS+MK', 'PATTY CASH OPEX', 'GUEST SATISFACTION', 'CITY LEDGER', 'COMPLIMENTARY'
      ];

      const headerRow = sheet1.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      // Data Rows
      outletDataList.forEach(item => {
        const row = sheet1.addRow([
          item.no,
          item.outlet,
          item.area,
          item.mtdRevenue,
          item.budget,
          (item.revAchievement / 100),
          item.revVariance,
          item.totalBelanjaMTD,
          (item.belanjaRatio / 100),
          item.daysRemaining,
          item.forecastRevenue,
          (item.forecastAchievement / 100),
          item.lastMonthRevenue,
          item.momVariance,
          (item.momGrowthPercent / 100),
          item.totalMSMK,
          item.pattyCashTotal,
          item.guestSatisfactionTotal,
          item.cityLedgerTotal,
          item.complimentaryTotal
        ]);

        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '0.0%';
        row.getCell(7).numFmt = '#,##0';
        row.getCell(8).numFmt = '#,##0';
        row.getCell(9).numFmt = '0.0%';
        row.getCell(10).numFmt = '#,##0';
        row.getCell(11).numFmt = '#,##0';
        row.getCell(12).numFmt = '0.0%';
        row.getCell(13).numFmt = '#,##0';
        row.getCell(14).numFmt = '#,##0';
        row.getCell(15).numFmt = '0.0%';
        row.getCell(16).numFmt = '#,##0';
        row.getCell(17).numFmt = '#,##0';
        row.getCell(18).numFmt = '#,##0';
        row.getCell(19).numFmt = '#,##0';
        row.getCell(20).numFmt = '#,##0';
      });

      // Total Row Sheet 1
      const totalRow1 = sheet1.addRow([
        '', 'TOTAL REGIONAL', '',
        regionalTotals.totalRevenue,
        regionalTotals.totalBudget,
        (regionalTotals.totalRevAch / 100),
        regionalTotals.totalRevVariance,
        regionalTotals.totalBelanja,
        (regionalTotals.totalBelanjaRatio / 100),
        daysInMonth - Math.min(new Date().getDate(), daysInMonth),
        regionalTotals.totalForecast,
        (regionalTotals.totalForecastAch / 100),
        regionalTotals.totalLastMonthRev,
        regionalTotals.totalMomVariance,
        (regionalTotals.totalMomGrowth / 100),
        regionalTotals.totalMSMK,
        regionalTotals.totalPattyCash,
        regionalTotals.totalGuestSat,
        regionalTotals.totalCityLedger,
        regionalTotals.totalComplimentary
      ]);
      totalRow1.height = 24;
      totalRow1.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      });
      totalRow1.getCell(4).numFmt = '#,##0';
      totalRow1.getCell(5).numFmt = '#,##0';
      totalRow1.getCell(6).numFmt = '0.0%';
      totalRow1.getCell(7).numFmt = '#,##0';
      totalRow1.getCell(8).numFmt = '#,##0';
      totalRow1.getCell(9).numFmt = '0.0%';
      totalRow1.getCell(11).numFmt = '#,##0';
      totalRow1.getCell(12).numFmt = '0.0%';
      totalRow1.getCell(13).numFmt = '#,##0';
      totalRow1.getCell(14).numFmt = '#,##0';
      totalRow1.getCell(15).numFmt = '0.0%';
      totalRow1.getCell(16).numFmt = '#,##0';
      totalRow1.getCell(17).numFmt = '#,##0';
      totalRow1.getCell(18).numFmt = '#,##0';
      totalRow1.getCell(19).numFmt = '#,##0';
      totalRow1.getCell(20).numFmt = '#,##0';

      // SHEET 2: Yearly 12 Months Report
      const sheet2 = workbook.addWorksheet(`Yearly Report ${reportYear}`);
      sheet2.views = [{ showGridLines: true }];

      sheet2.mergeCells('A1:P1');
      const titleCell2 = sheet2.getCell('A1');
      titleCell2.value = `LAPORAN REVENUE BULANAN REGIONAL 1 TAHUN (${reportYear})`;
      titleCell2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet2.getRow(1).height = 35;

      const yHeaders = ['NO', 'OUTLET', 'AREA', ...SHORT_MONTHS, 'TOTAL 1 TAHUN', 'RATA-RATA BULANAN'];
      const yHeaderRow = sheet2.addRow(yHeaders);
      yHeaderRow.height = 26;
      yHeaderRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      yearlyReportData.matrix.forEach(row => {
        const r = sheet2.addRow([
          row.no,
          row.outlet,
          row.area,
          ...row.monthlyRevs,
          row.annualTotal,
          row.monthlyAvg
        ]);
        for (let c = 4; c <= 18; c++) {
          r.getCell(c).numFmt = '#,##0';
        }
      });

      const yTotalRow = sheet2.addRow([
        '', 'TOTAL REGIONAL', '',
        ...yearlyReportData.regionalMonthlyRevs,
        yearlyReportData.grandAnnualTotal,
        yearlyReportData.regionalMonthlyAvg
      ]);
      yTotalRow.height = 24;
      yTotalRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      });
      for (let c = 4; c <= 18; c++) {
        yTotalRow.getCell(c).numFmt = '#,##0';
      }

      // Auto-fit columns for both sheets
      [sheet1, sheet2].forEach(sheet => {
        sheet.columns.forEach(col => {
          col.width = 16;
        });
        sheet.getColumn(2).width = 28;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Regional_Summary_Report_${MONTH_NAMES[selectedMonth]}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mengunduh Excel Summary Regional & Yearly Report', 'success');
    } catch (err: any) {
      console.error(err);
      showToast?.('Gagal mengunduh Excel: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. TOP CONTROLS & KPI METRICS HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-950/60 p-5 rounded-3xl border border-white/10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-black uppercase tracking-wider">
              Executive Regional Dashboard
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-xs font-bold text-slate-300">
              Periode: <strong className="text-white">{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
            </span>
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1">
            Regional Summary & Outlet Performance
          </h2>
          <p className="text-xs text-slate-400">
            Konsolidasi data operasional, revenue vs budget, forecast sisa hari, rasio belanja, dan laporan 1 tahun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setActiveViewMode('ALL')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                activeViewMode === 'ALL' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Tampilan
            </button>
            <button
              onClick={() => setActiveViewMode('REKAPAN_REPORT')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeViewMode === 'REKAPAN_REPORT' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table-list text-[10px]"></i>
              Rekapan Summary Report
            </button>
            <button
              onClick={() => setActiveViewMode('SUMMARY_TABLE')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                activeViewMode === 'SUMMARY_TABLE' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tabel Outlet
            </button>
            <button
              onClick={() => setActiveViewMode('GSI_RECAP')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeViewMode === 'GSI_RECAP' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-poll text-[10px]"></i>
              Rekapan GSI
            </button>
            <button
              onClick={() => setActiveViewMode('GOOGLE_REVIEW_RECAP')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeViewMode === 'GOOGLE_REVIEW_RECAP' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-star text-[10px]"></i>
              Google Review
            </button>
            <button
              onClick={() => setActiveViewMode('YEARLY_REPORT')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                activeViewMode === 'YEARLY_REPORT' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              Laporan 1 Tahun
            </button>
          </div>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/40 transition-all font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-900/10 cursor-pointer"
          >
            <i className="fas fa-file-excel text-sm"></i> Unduh Excel
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI CARDS (8 CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Revenue vs Budget */}
        <div className="glass-card p-5 bg-slate-950/50 border-l-4 border-emerald-500 shadow-xl relative overflow-hidden rounded-3xl">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Revenue (MTD)</p>
            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
              regionalTotals.totalRevAch >= 100 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {regionalTotals.totalRevAch.toFixed(1)}% Ach
            </span>
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight mt-2">
            Rp {regionalTotals.totalRevenue.toLocaleString('id-ID')}
          </h3>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 pt-2 border-t border-white/5">
            <span>Budget: Rp {regionalTotals.totalBudget.toLocaleString('id-ID')}</span>
            <span className={regionalTotals.totalRevVariance >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {regionalTotals.totalRevVariance >= 0 ? '+' : ''}Rp {regionalTotals.totalRevVariance.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Card 2: Ratio Belanja MTD */}
        <div className="glass-card p-5 bg-slate-950/50 border-l-4 border-amber-500 shadow-xl relative overflow-hidden rounded-3xl">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Belanja & Rasio</p>
            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
              regionalTotals.totalBelanjaRatio <= 43 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {regionalTotals.totalBelanjaRatio.toFixed(1)}% Rasio
            </span>
          </div>
          <h3 className="text-2xl font-black text-amber-400 tracking-tight mt-2">
            Rp {regionalTotals.totalBelanja.toLocaleString('id-ID')}
          </h3>
          <div className="flex justify-between items-center text-[8.5px] text-slate-400 mt-2 pt-2 border-t border-white/5">
            <span>MS+MK+Cash+Sup</span>
            <span>Target: &le; 43.0%</span>
          </div>
        </div>

        {/* Card 3: Forecast Revenue & Sisa Hari */}
        <div className="glass-card p-5 bg-slate-950/50 border-l-4 border-indigo-500 shadow-xl relative overflow-hidden rounded-3xl">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forecast Akhir Bulan</p>
            <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Sisa {Math.max(0, daysInMonth - Math.min(new Date().getDate(), daysInMonth))} Hari
            </span>
          </div>
          <h3 className="text-2xl font-black text-indigo-300 tracking-tight mt-2">
            Rp {regionalTotals.totalForecast.toLocaleString('id-ID')}
          </h3>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 pt-2 border-t border-white/5">
            <span>Proyeksi Ach:</span>
            <span className={`font-bold ${regionalTotals.totalForecastAch >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {regionalTotals.totalForecastAch.toFixed(1)}% ({regionalTotals.totalForecastVariance >= 0 ? '+' : ''}Rp {regionalTotals.totalForecastVariance.toLocaleString('id-ID')})
            </span>
          </div>
        </div>

        {/* Card 4: Compare Last Month (MoM) */}
        <div className="glass-card p-5 bg-slate-950/50 border-l-4 border-cyan-500 shadow-xl relative overflow-hidden rounded-3xl">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compare Bulan Lalu (MoM)</p>
            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
              regionalTotals.totalMomGrowth >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {regionalTotals.totalMomGrowth >= 0 ? '+' : ''}{regionalTotals.totalMomGrowth.toFixed(1)}% Growth
            </span>
          </div>
          <h3 className={`text-2xl font-black tracking-tight mt-2 ${regionalTotals.totalMomVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {regionalTotals.totalMomVariance >= 0 ? '+' : ''}Rp {regionalTotals.totalMomVariance.toLocaleString('id-ID')}
          </h3>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 pt-2 border-t border-white/5">
            <span>Bulan Lalu:</span>
            <span>Rp {regionalTotals.totalLastMonthRev.toLocaleString('id-ID')}</span>
          </div>
        </div>
      </div>

      {/* 3. OPERATIONAL LEDGERS ROW (Guest Sat, City Ledger, Complimentary, Patty Cash) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <i className="fas fa-face-smile text-lg"></i>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Guest Satisfaction</p>
            <p className="text-sm font-black text-white mt-0.5">Rp {regionalTotals.totalGuestSat.toLocaleString('id-ID')}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <i className="fas fa-building text-lg"></i>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">City Ledger</p>
            <p className="text-sm font-black text-white mt-0.5">Rp {regionalTotals.totalCityLedger.toLocaleString('id-ID')}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
            <i className="fas fa-gift text-lg"></i>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Complimentary</p>
            <p className="text-sm font-black text-white mt-0.5">Rp {regionalTotals.totalComplimentary.toLocaleString('id-ID')}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <i className="fas fa-wallet text-lg"></i>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Patty Cash OPEX</p>
            <p className="text-sm font-black text-white mt-0.5">Rp {regionalTotals.totalPattyCash.toLocaleString('id-ID')}</p>
          </div>
        </div>
      </div>

      {/* DEDICATED TABEL REKAPAN SUMMARY REPORT (ALL OUTLETS) */}
      {(activeViewMode === 'ALL' || activeViewMode === 'REKAPAN_REPORT') && (
        <RegionalSummaryReportRecapTable
          items={recapSummaryItems}
          monthName={MONTH_NAMES[selectedMonth]}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onSelectOutlet={onSelectOutlet}
          showToast={showToast}
        />
      )}

      {/* 4. COMPREHENSIVE OUTLET SUMMARY TABLE */}
      {(activeViewMode === 'ALL' || activeViewMode === 'SUMMARY_TABLE') && (
        <div className="glass-card bg-slate-950/40 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50">
            <div>
              <h3 className="text-xl font-black text-white uppercase italic tracking-tight flex items-center gap-3">
                <i className="fas fa-table-list text-indigo-400"></i>
                Tabel Ringkasan Operasional Per Outlet
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Data real-time Revenue vs Budget, Rasio Belanja, Forecast Sisa Hari, Pertumbuhan MoM, dan Ledger per Outlet.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20">
                {outletDataList.length} Outlet Terdata
              </span>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-left border-collapse min-w-[1400px]">
              <thead>
                <tr className="bg-slate-900/80 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-white/10">
                  <th className="p-3.5 text-center w-12 border-r border-white/5">No</th>
                  <th className="p-3.5 border-r border-white/5">Outlet</th>
                  <th className="p-3.5 border-r border-white/5 text-center">Area</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-emerald-950/30 text-emerald-300">Revenue MTD</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-emerald-950/30 text-emerald-300">Budget</th>
                  <th className="p-3.5 text-center border-r border-white/5 bg-emerald-950/30 text-emerald-300">% Ach</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-emerald-950/30 text-emerald-300">Selisih</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-amber-950/30 text-amber-300">Belanja (MS+MK+Cash+Sup)</th>
                  <th className="p-3.5 text-center border-r border-white/5 bg-amber-950/30 text-amber-300">Rasio (%)</th>
                  <th className="p-3.5 text-center border-r border-white/5 bg-indigo-950/30 text-indigo-300">Sisa Hari</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-indigo-950/30 text-indigo-300">Forecast Akhir</th>
                  <th className="p-3.5 text-center border-r border-white/5 bg-indigo-950/30 text-indigo-300">Proyeksi Ach</th>
                  <th className="p-3.5 text-right border-r border-white/5 bg-cyan-950/30 text-cyan-300">Last Month</th>
                  <th className="p-3.5 text-center border-r border-white/5 bg-cyan-950/30 text-cyan-300">Growth MoM</th>
                  <th className="p-3.5 text-right border-r border-white/5">Belanja MS+MK</th>
                  <th className="p-3.5 text-right border-r border-white/5">Patty Cash</th>
                  <th className="p-3.5 text-right border-r border-white/5">Guest Sat</th>
                  <th className="p-3.5 text-right border-r border-white/5">City Ledger</th>
                  <th className="p-3.5 text-right">Complimentary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs font-semibold">
                {outletDataList.map((item, idx) => (
                  <tr key={`${item.outlet || 'outlet'}-${item.no || idx}`} className="hover:bg-white/[0.03] transition-colors">
                    <td className="p-3 text-center text-slate-500 font-mono border-r border-white/5">{item.no}</td>
                    <td className="p-3 border-r border-white/5 font-black text-white whitespace-nowrap">
                      {item.outlet}
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-white/5">
                        {item.area}
                      </span>
                    </td>
                    
                    {/* Revenue vs Budget */}
                    <td className="p-3 text-right font-mono font-bold text-white border-r border-white/5 bg-emerald-950/10">
                      Rp {item.mtdRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400 border-r border-white/5 bg-emerald-950/10">
                      Rp {item.budget.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center border-r border-white/5 bg-emerald-950/10">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${
                        item.revAchievement >= 100 ? 'bg-emerald-500/20 text-emerald-400' :
                        item.revAchievement >= 85 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {item.revAchievement.toFixed(1)}%
                      </span>
                    </td>
                    <td className={`p-3 text-right font-mono border-r border-white/5 bg-emerald-950/10 font-bold ${
                      item.revVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {item.revVariance >= 0 ? '+' : ''}Rp {item.revVariance.toLocaleString('id-ID')}
                    </td>

                    {/* Belanja & Ratio */}
                    <td className="p-3 text-right font-mono text-amber-300 border-r border-white/5 bg-amber-950/10">
                      Rp {item.totalBelanjaMTD.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center border-r border-white/5 bg-amber-950/10">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${
                        item.belanjaRatio <= 43 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {item.belanjaRatio.toFixed(1)}%
                      </span>
                    </td>

                    {/* Forecast & Sisa Hari */}
                    <td className="p-3 text-center text-slate-400 border-r border-white/5 bg-indigo-950/10 font-mono">
                      {item.daysRemaining} hari
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-300 border-r border-white/5 bg-indigo-950/10">
                      Rp {item.forecastRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center border-r border-white/5 bg-indigo-950/10">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${
                        item.forecastAchievement >= 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {item.forecastAchievement.toFixed(1)}%
                      </span>
                    </td>

                    {/* Compare Last Month */}
                    <td className="p-3 text-right font-mono text-slate-400 border-r border-white/5 bg-cyan-950/10">
                      Rp {item.lastMonthRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center border-r border-white/5 bg-cyan-950/10">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${
                        item.momGrowthPercent >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {item.momGrowthPercent >= 0 ? '+' : ''}{item.momGrowthPercent.toFixed(1)}%
                      </span>
                    </td>

                    {/* Ledgers */}
                    <td className="p-3 text-right font-mono text-slate-300 border-r border-white/5">
                      Rp {item.totalMSMK.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300 border-r border-white/5">
                      Rp {item.pattyCashTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300 border-r border-white/5">
                      Rp {item.guestSatisfactionTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300 border-r border-white/5">
                      Rp {item.cityLedgerTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      Rp {item.complimentaryTotal.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {/* TOTAL ROW */}
              <tfoot>
                <tr className="bg-slate-900 text-xs font-black border-t-2 border-indigo-500 text-white">
                  <td className="p-4 text-center border-r border-white/10" colSpan={3}>
                    TOTAL REGIONAL
                  </td>
                  <td className="p-4 text-right font-mono text-emerald-400 border-r border-white/10 bg-emerald-950/30">
                    Rp {regionalTotals.totalRevenue.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-300 border-r border-white/10 bg-emerald-950/30">
                    Rp {regionalTotals.totalBudget.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center border-r border-white/10 bg-emerald-950/30 text-emerald-300">
                    {regionalTotals.totalRevAch.toFixed(1)}%
                  </td>
                  <td className={`p-4 text-right font-mono border-r border-white/10 bg-emerald-950/30 ${
                    regionalTotals.totalRevVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {regionalTotals.totalRevVariance >= 0 ? '+' : ''}Rp {regionalTotals.totalRevVariance.toLocaleString('id-ID')}
                  </td>

                  <td className="p-4 text-right font-mono text-amber-400 border-r border-white/10 bg-amber-950/30">
                    Rp {regionalTotals.totalBelanja.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center border-r border-white/10 bg-amber-950/30 text-amber-300">
                    {regionalTotals.totalBelanjaRatio.toFixed(1)}%
                  </td>

                  <td className="p-4 text-center text-slate-400 border-r border-white/10 bg-indigo-950/30">
                    -
                  </td>
                  <td className="p-4 text-right font-mono text-indigo-300 border-r border-white/10 bg-indigo-950/30">
                    Rp {regionalTotals.totalForecast.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center border-r border-white/10 bg-indigo-950/30 text-indigo-300">
                    {regionalTotals.totalForecastAch.toFixed(1)}%
                  </td>

                  <td className="p-4 text-right font-mono text-slate-300 border-r border-white/10 bg-cyan-950/30">
                    Rp {regionalTotals.totalLastMonthRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center border-r border-white/10 bg-cyan-950/30 text-cyan-300">
                    {regionalTotals.totalMomGrowth >= 0 ? '+' : ''}{regionalTotals.totalMomGrowth.toFixed(1)}%
                  </td>

                  <td className="p-4 text-right font-mono text-slate-200 border-r border-white/10">
                    Rp {regionalTotals.totalMSMK.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-200 border-r border-white/10">
                    Rp {regionalTotals.totalPattyCash.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-200 border-r border-white/10">
                    Rp {regionalTotals.totalGuestSat.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-200 border-r border-white/10">
                    Rp {regionalTotals.totalCityLedger.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-200">
                    Rp {regionalTotals.totalComplimentary.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 5. VISUAL CHART: PER-OUTLET PERFORMANCE BREAKDOWN */}
      {(activeViewMode === 'ALL' || activeViewMode === 'SUMMARY_TABLE') && (
        <div className="glass-card p-6 bg-slate-950/40 border border-white/10 rounded-3xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h4 className="text-base font-black text-white uppercase italic tracking-tight">
                Visualisasi Perbandingan Outlet (Juta Rupiah)
              </h4>
              <p className="text-xs text-slate-400">Komparasi capaian Revenue, Target Budget, Belanja, dan Forecast</p>
            </div>
            <div className="flex bg-slate-900 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setChartMetric('REVENUE')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${
                  chartMetric === 'REVENUE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenue vs Budget
              </button>
              <button
                onClick={() => setChartMetric('BELANJA')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${
                  chartMetric === 'BELANJA' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenue vs Belanja
              </button>
              <button
                onClick={() => setChartMetric('FORECAST')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${
                  chartMetric === 'FORECAST' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenue vs Forecast
              </button>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outletComparisonChart} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={9} 
                  angle={-35} 
                  textAnchor="end" 
                  height={60} 
                  interval={0}
                />
                <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}M`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  formatter={(val: any) => [`Rp ${(Number(val) * 1000000).toLocaleString('id-ID')}`, '']}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                
                {chartMetric === 'REVENUE' && (
                  <>
                    <Bar dataKey="revenue" name="Actual Revenue (M)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="budget" name="Budget Target (M)" fill="#64748b" radius={[4, 4, 0, 0]} />
                  </>
                )}
                {chartMetric === 'BELANJA' && (
                  <>
                    <Bar dataKey="revenue" name="Actual Revenue (M)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="belanja" name="Total Belanja (M)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </>
                )}
                {chartMetric === 'FORECAST' && (
                  <>
                    <Bar dataKey="revenue" name="Actual Revenue (M)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="forecast" name="Forecast Akhir Bulan (M)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* DEDICATED REKAPAN GSI REGIONAL */}
      {(activeViewMode === 'ALL' || activeViewMode === 'GSI_RECAP') && (
        <RegionalGSIRecapTable
          allOutletsData={data}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={selectedArea}
          selectedOutlet={selectedOutlet}
          onSelectOutlet={onSelectOutlet}
          showToast={showToast}
        />
      )}

      {/* DEDICATED REKAPAN GOOGLE REVIEW REGIONAL */}
      {(activeViewMode === 'ALL' || activeViewMode === 'GOOGLE_REVIEW_RECAP') && (
        <RegionalGoogleReviewRecapTable
          allOutletsData={data}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={selectedArea}
          selectedOutlet={selectedOutlet}
          onSelectOutlet={onSelectOutlet}
          showToast={showToast}
        />
      )}

      {/* 6. MONTHLY REPORT DALAM 1 TAHUN (12 MONTHS MATRIX & TREND) */}
      {(activeViewMode === 'ALL' || activeViewMode === 'YEARLY_REPORT') && (
        <div className="space-y-6">
          <div className="glass-card bg-slate-950/40 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider">
                    Laporan Tahunan (12 Bulan)
                  </span>
                  <span className="text-slate-500 text-xs">•</span>
                  <span className="text-xs font-bold text-slate-300">Tahun: <strong>{reportYear}</strong></span>
                </div>
                <h3 className="text-xl font-black text-white uppercase italic tracking-tight mt-1 flex items-center gap-3">
                  <i className="fas fa-calendar-alt text-amber-400"></i>
                  Laporan Revenue Bulanan Regional Dalam 1 Tahun
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Matriks komparasi omset per outlet dari Januari hingga Desember serta akumulasi total 1 tahun (YTD).
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Year Selector */}
                <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Pilih Tahun:</span>
                  <select
                    value={reportYear}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val) && val > 2000) setReportYear(val);
                    }}
                    className="bg-transparent text-amber-300 font-black text-xs outline-none cursor-pointer"
                  >
                    {[selectedYear - 1, selectedYear, selectedYear + 1]
                      .filter(yr => typeof yr === 'number' && !isNaN(yr) && yr > 2000)
                      .map(yr => (
                        <option key={yr} value={yr} className="bg-slate-900 text-white">{yr}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 12-Month Table Matrix */}
            <div className="overflow-x-auto p-4">
              <table className="w-full text-left border-collapse min-w-[1500px]">
                <thead>
                  <tr className="bg-slate-900/90 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-white/10">
                    <th className="p-3 text-center w-12 border-r border-white/5">No</th>
                    <th className="p-3 border-r border-white/5 w-48">Outlet</th>
                    <th className="p-3 text-center border-r border-white/5 w-24">Area</th>
                    {SHORT_MONTHS.map((m, mIdx) => (
                      <th key={m} className={`p-3 text-right border-r border-white/5 ${
                        mIdx === selectedMonth && reportYear === selectedYear ? 'bg-indigo-950/50 text-indigo-300 font-black' : ''
                      }`}>
                        {m}
                      </th>
                    ))}
                    <th className="p-3 text-right border-r border-white/5 bg-amber-950/40 text-amber-300 font-black">
                      Total 1 Tahun
                    </th>
                    <th className="p-3 text-right bg-emerald-950/40 text-emerald-300 font-black">
                      Rata-Rata / Bln
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-semibold">
                  {yearlyReportData.matrix.map((row) => (
                    <tr key={`${row.outlet}-${row.no}`} className="hover:bg-white/[0.03] transition-colors">
                      <td className="p-3 text-center text-slate-500 font-mono border-r border-white/5">{row.no}</td>
                      <td className="p-3 border-r border-white/5 font-black text-white whitespace-nowrap">{row.outlet}</td>
                      <td className="p-3 text-center border-r border-white/5">
                        <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-slate-800 text-slate-300">
                          {row.area}
                        </span>
                      </td>
                      {row.monthlyRevs.map((rev, mIdx) => (
                        <td 
                          key={`m-${mIdx}-${row.outlet}`} 
                          className={`p-3 text-right font-mono border-r border-white/5 ${
                            rev > 0 ? 'text-white' : 'text-slate-600'
                          } ${mIdx === selectedMonth && reportYear === selectedYear ? 'bg-indigo-950/20 font-bold text-indigo-200' : ''}`}
                        >
                          {rev > 0 ? `Rp ${rev.toLocaleString('id-ID')}` : '-'}
                        </td>
                      ))}
                      <td className="p-3 text-right font-mono font-bold text-amber-300 border-r border-white/5 bg-amber-950/10">
                        Rp {row.annualTotal.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-300 bg-emerald-950/10">
                        Rp {Math.round(row.monthlyAvg).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-xs font-black border-t-2 border-amber-500 text-white">
                    <td className="p-4 text-center border-r border-white/10" colSpan={3}>
                      TOTAL REGIONAL PER BULAN ({reportYear})
                    </td>
                    {yearlyReportData.regionalMonthlyRevs.map((mTotal, mIdx) => (
                      <td 
                        key={`mTotal-${mIdx}`} 
                        className={`p-4 text-right font-mono border-r border-white/10 ${
                          mIdx === selectedMonth && reportYear === selectedYear ? 'bg-indigo-900/40 text-indigo-200 text-sm font-black' : 'text-white'
                        }`}
                      >
                        Rp {mTotal.toLocaleString('id-ID')}
                      </td>
                    ))}
                    <td className="p-4 text-right font-mono text-amber-300 border-r border-white/10 bg-amber-950/40 text-sm">
                      Rp {yearlyReportData.grandAnnualTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-300 bg-emerald-950/40 text-sm">
                      Rp {Math.round(yearlyReportData.regionalMonthlyAvg).toLocaleString('id-ID')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 12-Month Trend Line / Area Chart */}
          <div className="glass-card p-6 bg-slate-950/40 border border-white/10 rounded-3xl shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-base font-black text-white uppercase italic tracking-tight">
                  Tren Pergerakan Revenue Regional 12 Bulan ({reportYear})
                </h4>
                <p className="text-xs text-slate-400">Grafik akumulasi pendapatan bulanan seluruh outlet dalam 1 tahun</p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider">
                Total 1 Tahun: Rp {yearlyReportData.grandAnnualTotal.toLocaleString('id-ID')}
              </div>
            </div>

            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearlyReportData.monthlyChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="regionalRevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    formatter={(val: any) => [`Rp ${(Number(val) * 1000000).toLocaleString('id-ID')}`, 'Total Revenue']}
                    labelFormatter={(label) => `Bulan: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#6366f1" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#regionalRevGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalSummaryDashboard;
