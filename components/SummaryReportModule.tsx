import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet } from '../types';
import { OUTLETS, INITIAL_STATE, getAreaForOutlet } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import ShareActions from './ShareActions';
import { RegionalSummaryReportRecapTable, OutletSummaryRecapItem, resolvePattyCashBudget } from './RegionalSummaryReportRecapTable';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, AppState> | Record<string, Record<string, AppState>> | any;
  selectedOutlet?: string;
  isRegionalView?: boolean;
  filters?: {
    month?: string;
    year?: string;
    startDate?: string;
    endDate?: string;
  };
  onUpdate?: (field: keyof AppState, val: any) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const SummaryReportModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
  isRegionalView = false,
  filters,
  showToast
}) => {
  const currentDate = new Date();
  const currentMonthIdx = filters?.month ? parseInt(filters.month) : currentDate.getMonth();
  const currentYear = filters?.year ? parseInt(filters.year) : currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // In outlet mode (isRegionalView=false), strictly lock to propSelectedOutlet (outlet logged in)
  const defaultOutlet = isRegionalView 
    ? (propSelectedOutlet || 'ALL')
    : (propSelectedOutlet || 'SH THE BARN');

  const [activeOutlet, setActiveOutlet] = useState<string>(defaultOutlet);

  React.useEffect(() => {
    if (!isRegionalView && propSelectedOutlet) {
      setActiveOutlet(propSelectedOutlet);
    } else if (isRegionalView) {
      setActiveOutlet(propSelectedOutlet || 'ALL');
    }
  }, [propSelectedOutlet, isRegionalView]);

  const [activeSection, setActiveSection] = useState<'ALL' | 'REKAPAN_SUMMARY' | 'RATIOS' | 'COGS' | 'EXPENSES' | 'ENERGY' | 'FLOOR' | 'SUPPLIER' | 'LEDGERS' | 'MATRIX'>('ALL');

  // Matrix Filter & Control States
  const [matrixCategoryGroup, setMatrixCategoryGroup] = useState<'ALL' | 'SUPPLIER' | 'FLOOR_ORDER' | 'PATTY_CASH' | 'LEDGER'>('ALL');
  const [matrixSelectedCategory, setMatrixSelectedCategory] = useState<string>('ALL');
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'COST_DESC' | 'COST_ASC' | 'QTY_DESC' | 'NAME_ASC'>('COST_DESC');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<any | null>(null);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  // Helper to extract app state for a specific outlet & month
  const getOutletMonthState = (outletName: string, mIdx: number = selectedMonth, yVal: number = selectedYear): AppState => {
    const mKey = `${yVal}-${String(mIdx + 1).padStart(2, '0')}`;
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet) {
      if (mIdx === currentMonthIdx && yVal === currentYear) {
        return data;
      }
    }

    if (allMonthlyData) {
      // Structure 1: allMonthlyData[outlet][monthStr]
      if ((allMonthlyData as any)[outletName]) {
        const outletMap = (allMonthlyData as any)[outletName];
        if (outletMap[String(mIdx)]) return outletMap[String(mIdx)];
        if (outletMap[mKey]) return outletMap[mKey];
      }

      // Structure 2: if single-outlet view and outletName matches propSelectedOutlet
      if (!isRegionalView && propSelectedOutlet && outletName === propSelectedOutlet) {
        if ((allMonthlyData as any)[mKey]) {
          return (allMonthlyData as any)[mKey];
        }
        if ((allMonthlyData as any)[String(mIdx)]) {
          return (allMonthlyData as any)[String(mIdx)];
        }
      }
    }

    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet && mIdx === currentMonthIdx && yVal === currentYear) {
      return data;
    }

    return {
      ...INITIAL_STATE,
      staffList: [],
      leaveRecords: [],
      dailyOvertime: {},
      dailyAttendance: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} },
      expenses: {}
    };
  };

  // Helper to sum ledger items
  const sumLedger = (records: Record<string, LedgerItem[]> | undefined, filterMonthPrefix: string) => {
    if (!records) return { total: 0, count: 0, items: [] as (LedgerItem & { date: string })[] };
    let total = 0;
    let count = 0;
    const items: (LedgerItem & { date: string })[] = [];

    Object.entries(records).forEach(([dateStr, list]) => {
      if (dateStr.startsWith(filterMonthPrefix) && Array.isArray(list)) {
        list.forEach(item => {
          if (item && item.price) {
            const qty = Number(item.qty) || 1;
            const subtotal = Number(item.price) * qty;
            total += subtotal;
            count += qty;
            items.push({ ...item, date: dateStr });
          }
        });
      }
    });

    return { total, count, items };
  };

  // Calculate detailed summary per outlet (Strictly single outlet for login session, or all outlets for Regional)
  const outletSummaries = useMemo(() => {
    const targetOutlets = isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];

    return targetOutlets.map(outletName => {
      const state = getOutletMonthState(outletName);

      // 1. REVENUE CALCULATION (MTD)
      let mtdRevenue = 0;
      let totalCovers = 0;
      if (state.sales?.dailyRecording) {
        Object.entries(state.sales.dailyRecording).forEach(([dateStr, dSales]) => {
          if (dateStr.startsWith(monthKey)) {
            const rev = Number(dSales.revenue) || 
              ((Number(dSales.dineInRevenue) || 0) + (Number(dSales.takeAwayRevenue) || 0) + (Number(dSales.goFoodRevenue) || 0) + (Number(dSales.grabFoodRevenue) || 0));
            mtdRevenue += rev;
            totalCovers += Number(dSales.covers) || 0;
          }
        });
      }
      if (mtdRevenue === 0 && state.sales?.revenue) {
        mtdRevenue = Number(state.sales.revenue) || 0;
      }
      if (totalCovers === 0 && state.sales?.covers) {
        totalCovers = Number(state.sales.covers) || 0;
      }

      // 2. SUPPLIERS & RECEIVING SHEET (BELANJA SUPPLIER)
      const supplierKeys = [
        { key: 'dailyIkigaiLedger', name: 'IKIGAI' },
        { key: 'dailyPanfilaLedger', name: 'PANFILA' },
        { key: 'dailyEverestLedger', name: 'EVEREST' },
        { key: 'dailySaungKubilLedger', name: 'SAUNG KUBIL' },
        { key: 'dailyTgifLedger', name: 'TGIF' },
        { key: 'dailySukandaLedger', name: 'SUKANDA' },
        { key: 'dailyKebunkuLedger', name: 'KEBUNKU' },
      ];

      const supplierBreakdown: Record<string, { total: number; count: number; items: any[] }> = {};
      let totalSupplierPurchases = 0;

      supplierKeys.forEach(s => {
        const records = (state as any)[s.key] as Record<string, LedgerItem[]>;
        const res = sumLedger(records, monthKey);
        supplierBreakdown[s.name] = res;
        totalSupplierPurchases += res.total;
      });

      // Include commodity from expenses if any
      let expensesCommodity = 0;
      if (state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            expensesCommodity += Number(exp.commodity) || 0;
          }
        });
      }

      // Total Belanja MTD
      const totalBelanjaMTD = totalSupplierPurchases > 0 ? totalSupplierPurchases : expensesCommodity;

      // 3. COGS CALCULATION
      const savedCogs = state.monthlyCogsData?.[monthKey] || {};
      const openingInventory = savedCogs.beginningInventory !== undefined ? savedCogs.beginningInventory : (parseFloat(localStorage.getItem(`COGS_OPENING_INV_${monthKey}`) || '0') || 0);
      const closingInventory = savedCogs.endingInventory !== undefined ? savedCogs.endingInventory : (parseFloat(localStorage.getItem(`COGS_CLOSING_INV_${monthKey}`) || '0') || 0);
      const targetCogsBudgetPercent = savedCogs.targetBudgetPercent || 43.0;

      // Effective COGS = Opening (+) + Belanja (+) - Closing (-)
      const effectiveCOGS = openingInventory + totalBelanjaMTD - closingInventory;
      const cogsPercent = mtdRevenue > 0 ? (effectiveCOGS / mtdRevenue) * 100 : 0;
      const belanjaRatioPercent = mtdRevenue > 0 ? (totalBelanjaMTD / mtdRevenue) * 100 : 0;
      const closingInvPercent = mtdRevenue > 0 ? (closingInventory / mtdRevenue) * 100 : 0;

      // 4. PATTY CASH EXPENSE (OPEX)
      const pattyCashLedgerKeys = [
        { key: 'dailyNonCommodityLedger', name: 'Non-Commodity' },
        { key: 'dailyCommodityLedger', name: 'Commodity' },
        { key: 'dailyMaintenanceLedger', name: 'Maintenance' },
        { key: 'dailyAssetLedger', name: 'Asset' },
        { key: 'dailyCasualLedger', name: 'Casual' },
        { key: 'dailyAtkLedger', name: 'ATK' },
        { key: 'dailyThirdPartyLedger', name: 'Third Party' },
        { key: 'dailyCashLedger', name: 'Petty Cash Lainnya' }
      ];

      const pattyCashBreakdown: Record<string, { total: number; count: number; items: any[] }> = {};
      let totalPattyCashExpense = 0;

      pattyCashLedgerKeys.forEach(p => {
        const records = (state as any)[p.key] as Record<string, LedgerItem[]>;
        const res = sumLedger(records, monthKey);
        pattyCashBreakdown[p.name] = { total: res.total, count: res.count, items: res.items };
        totalPattyCashExpense += res.total;
      });

      // Fallback to state.expenses if ledgers empty
      if (totalPattyCashExpense === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            const expTotal = (Number(exp.nonCommodity) || 0) + (Number(exp.maintenance) || 0) + (Number(exp.asset) || 0) + 
                             (Number(exp.casual) || 0) + (Number(exp.atk) || 0) + (Number(exp.thirdParty) || 0) + (Number(exp.cash) || 0);
            totalPattyCashExpense += expTotal;
          }
        });
      }

      const pattyCashRatioPercent = mtdRevenue > 0 ? (totalPattyCashExpense / mtdRevenue) * 100 : 0;

      // 5. ENERGY COST (ELECTRICITY, WATER, GAS)
      let electricityCost = 0;
      let waterCost = 0;
      let gasCost = 0;

      if (state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            electricityCost += Number(exp.electricity) || 0;
            waterCost += Number(exp.water) || 0;
            gasCost += Number(exp.gas) || 0;
          }
        });
      }

      const totalEnergyCost = electricityCost + waterCost + gasCost;
      const energyRatioPercent = mtdRevenue > 0 ? (totalEnergyCost / mtdRevenue) * 100 : 0;

      // 6. FLOOR ORDER (MAIN KITCHEN, MAIN STORE, CHEMICAL, GUEST SUPPLIES)
      const floorOrderKeys = [
        { key: 'dailyMainKitchenLedger', name: 'Main Kitchen' },
        { key: 'dailyMainStoreLedger', name: 'Main Store' },
        { key: 'dailyChemicalLedger', name: 'Chemical' },
        { key: 'dailyGuestSuppliesLedger', name: 'Guest Supplies' }
      ];

      const floorOrderBreakdown: Record<string, { total: number; count: number; items: any[] }> = {};
      let totalFloorOrder = 0;

      floorOrderKeys.forEach(f => {
        const records = (state as any)[f.key] as Record<string, LedgerItem[]>;
        const res = sumLedger(records, monthKey);
        floorOrderBreakdown[f.name] = res;
        totalFloorOrder += res.total;
      });

      // 7. GUEST SATISFACTION, CITY LEDGER, COMPLIMENTARY
      const guestSatRes = sumLedger(state.dailyCustomerSat, monthKey);
      const cityLedgerRes = sumLedger(state.dailyCityLedger, monthKey);
      const complimentaryRes = sumLedger(state.dailyComplimentary, monthKey);

      return {
        outlet: outletName,
        revenue: mtdRevenue,
        covers: totalCovers,
        // COGS
        openingInventory,
        totalBelanjaMTD,
        closingInventory,
        effectiveCOGS,
        cogsPercent,
        closingInvPercent,
        targetCogsBudgetPercent,
        // Ratios
        belanjaRatioPercent,
        pattyCashRatioPercent,
        energyRatioPercent,
        // Expenses & Breakdown
        totalPattyCashExpense,
        pattyCashBreakdown,
        // Energy
        electricityCost,
        waterCost,
        gasCost,
        totalEnergyCost,
        // Floor Order
        totalFloorOrder,
        floorOrderBreakdown,
        // Supplier
        totalSupplierPurchases,
        supplierBreakdown,
        // Ledgers
        guestSatisfaction: guestSatRes,
        cityLedger: cityLedgerRes,
        complimentary: complimentaryRes
      };
    });
  }, [data, allMonthlyData, activeOutlet, monthKey, selectedMonth, selectedYear]);

  // Grand totals across selected outlets
  const grandTotal = useMemo(() => {
    const init = {
      revenue: 0,
      covers: 0,
      openingInventory: 0,
      totalBelanjaMTD: 0,
      closingInventory: 0,
      effectiveCOGS: 0,
      totalPattyCashExpense: 0,
      electricityCost: 0,
      waterCost: 0,
      gasCost: 0,
      totalEnergyCost: 0,
      totalFloorOrder: 0,
      totalSupplierPurchases: 0,
      guestSatisfactionTotal: 0,
      cityLedgerTotal: 0,
      complimentaryTotal: 0
    };

    outletSummaries.forEach(s => {
      init.revenue += s.revenue;
      init.covers += s.covers;
      init.openingInventory += s.openingInventory;
      init.totalBelanjaMTD += s.totalBelanjaMTD;
      init.closingInventory += s.closingInventory;
      init.effectiveCOGS += s.effectiveCOGS;
      init.totalPattyCashExpense += s.totalPattyCashExpense;
      init.electricityCost += s.electricityCost;
      init.waterCost += s.waterCost;
      init.gasCost += s.gasCost;
      init.totalEnergyCost += s.totalEnergyCost;
      init.totalFloorOrder += s.totalFloorOrder;
      init.totalSupplierPurchases += s.totalSupplierPurchases;
      init.guestSatisfactionTotal += s.guestSatisfaction.total;
      init.cityLedgerTotal += s.cityLedger.total;
      init.complimentaryTotal += s.complimentary.total;
    });

    const cogsPercent = init.revenue > 0 ? (init.effectiveCOGS / init.revenue) * 100 : 0;
    const belanjaRatioPercent = init.revenue > 0 ? (init.totalBelanjaMTD / init.revenue) * 100 : 0;
    const pattyCashRatioPercent = init.revenue > 0 ? (init.totalPattyCashExpense / init.revenue) * 100 : 0;
    const energyRatioPercent = init.revenue > 0 ? (init.totalEnergyCost / init.revenue) * 100 : 0;

    return {
      ...init,
      cogsPercent,
      belanjaRatioPercent,
      pattyCashRatioPercent,
      energyRatioPercent
    };
  }, [outletSummaries]);

  // Aggregated summary recap items for ALL OUTLETS
  const allOutletsRecapItems = useMemo<OutletSummaryRecapItem[]>(() => {
    return OUTLETS.map((outletName, idx) => {
      const state = getOutletMonthState(outletName);
      
      // 1. Revenue & Budget
      let mtdRevenue = 0;
      if (state.sales?.dailyRecording) {
        Object.entries(state.sales.dailyRecording).forEach(([dateStr, d]: [string, any]) => {
          if (dateStr.startsWith(monthKey)) {
            const rev = Number(d?.revenue) || 
              ((Number(d?.dineInRevenue) || 0) + (Number(d?.takeAwayRevenue) || 0) + (Number(d?.goFoodRevenue) || 0) + (Number(d?.grabFoodRevenue) || 0));
            if (rev > 0) mtdRevenue += rev;
          }
        });
      }
      if (mtdRevenue === 0 && state.sales?.revenue) {
        mtdRevenue = Number(state.sales.revenue) || 0;
      }
      const budgetRevenue = (state.sales?.monthlyBudgets || {})[monthKey] || state.sales?.budgetRevenue || 0;
      const revAchievement = budgetRevenue > 0 ? (mtdRevenue / budgetRevenue) * 100 : 0;
      const revVariance = mtdRevenue - budgetRevenue;

      // 2. Belanja (Supplier, MK, MS) vs Revenue = Cost Belanja
      const supplierKeys = [
        'dailyIkigaiLedger', 'dailyPanfilaLedger', 'dailyEverestLedger',
        'dailySaungKubilLedger', 'dailyTgifLedger', 'dailySukandaLedger',
        'dailyKebunkuLedger'
      ];
      let supplierBelanja = 0;
      supplierKeys.forEach(k => {
        supplierBelanja += sumLedger((state as any)[k], monthKey).total;
      });

      // Cash (Retail Food belanja menggunakan patty cash - Commodity)
      let cashRetailFoodBelanja = sumLedger((state as any).dailyCommodityLedger, monthKey).total;
      if (cashRetailFoodBelanja === 0 && (state as any).dailyCashLedger) {
        cashRetailFoodBelanja = sumLedger((state as any).dailyCashLedger, monthKey).total;
      }
      if (cashRetailFoodBelanja === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            cashRetailFoodBelanja += (Number(exp.commodity) || 0) + (Number(exp.cash) || 0);
          }
        });
      }

      // 3. Chemical, Stationary, Marketing (Deductions for Main Store)
      let chemicalTotal = 0;
      let stationaryTotal = 0;
      let marketingTotal = 0;

      if (state.dailyChemicalLedger) {
        Object.entries(state.dailyChemicalLedger).forEach(([dateStr, list]) => {
          if (dateStr.startsWith(monthKey) && Array.isArray(list)) {
            list.forEach(item => {
              if (item && item.price) {
                const qty = Number(item.qty) || 1;
                const subtotal = Number(item.price) * qty;
                const cat = String((item as any).category || '').toUpperCase();
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

      if (state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            if (chemicalTotal === 0) chemicalTotal += Number(exp.chemical) || 0;
            if (stationaryTotal === 0) stationaryTotal += Number((exp as any).stationary) || 0;
            if (marketingTotal === 0) marketingTotal += Number((exp as any).marketing) || 0;
          }
        });
      }

      if (stationaryTotal === 0 && state.dailyAtkLedger) {
        stationaryTotal += sumLedger(state.dailyAtkLedger, monthKey).total;
      }
      if (stationaryTotal === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            stationaryTotal += Number(exp.atk) || 0;
          }
        });
      }

      let maintenanceTotal = 0;
      if (state.dailyMaintenanceLedger) {
        maintenanceTotal += sumLedger(state.dailyMaintenanceLedger, monthKey).total;
      }
      if (maintenanceTotal === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            maintenanceTotal += Number(exp.maintenance) || 0;
          }
        });
      }

      const totalChemStatMkt = chemicalTotal + stationaryTotal + marketingTotal;
      const chemStatMktRatio = mtdRevenue > 0 ? (totalChemStatMkt / mtdRevenue) * 100 : 0;

      // 2. Belanja Main Kitchen & Main Store (Main Store sudah dikurangi chemical, stationary & marketing)
      const mainKitchenBelanja = sumLedger(state.dailyMainKitchenLedger, monthKey).total;
      const grossMainStoreBelanja = sumLedger(state.dailyMainStoreLedger, monthKey).total;
      const mainStoreBelanja = Math.max(0, grossMainStoreBelanja - totalChemStatMkt);
      const totalBelanjaOperasional = supplierBelanja + mainKitchenBelanja + mainStoreBelanja + cashRetailFoodBelanja;
      const costBelanjaPercent = mtdRevenue > 0 ? (totalBelanjaOperasional / mtdRevenue) * 100 : 0;

      // 4. Patty Cash vs Budget
      const pattyCashKeys = [
        'dailyNonCommodityLedger', 'dailyCommodityLedger', 'dailyMaintenanceLedger',
        'dailyAssetLedger', 'dailyCasualLedger', 'dailyAtkLedger',
        'dailyThirdPartyLedger', 'dailyCashLedger'
      ];
      let actualPattyCash = 0;
      pattyCashKeys.forEach(k => {
        actualPattyCash += sumLedger((state as any)[k], monthKey).total;
      });
      if (actualPattyCash === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            actualPattyCash += (Number(exp.nonCommodity) || 0) + (Number(exp.maintenance) || 0) + 
                               (Number(exp.asset) || 0) + (Number(exp.casual) || 0) + 
                               (Number(exp.atk) || 0) + (Number(exp.thirdParty) || 0) + (Number(exp.cash) || 0);
          }
        });
      }

      // Budget Patty Cash
      const budgetPattyCash = resolvePattyCashBudget(state, monthKey, mtdRevenue, outletName);
      const pattyCashVariance = budgetPattyCash - actualPattyCash;
      const pattyCashAchPercent = budgetPattyCash > 0 ? (actualPattyCash / budgetPattyCash) * 100 : 0;
      const isPattyCashOver = budgetPattyCash > 0 ? actualPattyCash > budgetPattyCash : (mtdRevenue > 0 ? actualPattyCash > (mtdRevenue * 0.003) : false);

      // Opex 6 Kategori (Non Commodity, Commodity, ATK, Maintenance, Asset, Casual)
      // Chemical, Stationary, dan Marketing dipisahkan dan TIDAK masuk dalam Opex ini.
      let opexNonCommodity = 0;
      if (state.dailyNonCommodityLedger) {
        opexNonCommodity += sumLedger(state.dailyNonCommodityLedger, monthKey).total;
      }
      if (opexNonCommodity === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            opexNonCommodity += Number(exp.nonCommodity) || 0;
          }
        });
      }

      let opexCommodity = 0;
      if (state.dailyCommodityLedger) {
        opexCommodity += sumLedger(state.dailyCommodityLedger, monthKey).total;
      }
      if (opexCommodity === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            opexCommodity += Number(exp.commodity) || 0;
          }
        });
      }

      let opexAtk = 0;
      if (state.dailyAtkLedger) {
        opexAtk += sumLedger(state.dailyAtkLedger, monthKey).total;
      }
      if (opexAtk === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            opexAtk += Number(exp.atk) || 0;
          }
        });
      }

      const opexMaintenance = maintenanceTotal;

      let opexAsset = 0;
      if (state.dailyAssetLedger) {
        opexAsset += sumLedger(state.dailyAssetLedger, monthKey).total;
      }
      if (opexAsset === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            opexAsset += Number(exp.asset) || 0;
          }
        });
      }

      let opexCasual = 0;
      if (state.dailyCasualLedger) {
        opexCasual += sumLedger(state.dailyCasualLedger, monthKey).total;
      }
      if (opexCasual === 0 && state.expenses) {
        Object.entries(state.expenses).forEach(([dateStr, exp]) => {
          if (dateStr.startsWith(monthKey)) {
            opexCasual += Number(exp.casual) || 0;
          }
        });
      }

      // OPEX TOTAL = 6 Kategori Khusus
      const opexTotal = opexNonCommodity + opexCommodity + opexAtk + opexMaintenance + opexAsset + opexCasual;
      const opexPercent = mtdRevenue > 0 ? (opexTotal / mtdRevenue) * 100 : 0;

      // 5. Overtime Breakdown (Cut-off 26 Bulan Lalu - 25 Bulan Ini, contoh: 26 Agustus - 25 September)
      const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const lastMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
      const prevState = getOutletMonthState(outletName, prevMonthIdx, prevYear);
      const cutoffStart = `${lastMonthKey}-26`;
      const cutoffEnd = `${monthKey}-25`;

      let otService = 0;
      let otBar = 0;
      let otKitchen = 0;
      let otTotal = 0;
      let otStaffCount = 0;

      // Cek weeklyOvertime tersimpan
      const allWeeklyOT = { ...(prevState.weeklyOvertime || {}), ...(state.weeklyOvertime || {}) };
      if (allWeeklyOT) {
        Object.entries(allWeeklyOT).forEach(([k, entry]: [string, any]) => {
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

      // Jika weeklyOvertime kosong / 0, auto-derive dari dailyOvertime cut-off 26 - 25
      if (otTotal === 0) {
        const staffDivMap = new Map<string, string>();
        [...(prevState.staffList || []), ...(state.staffList || [])].forEach((st: any) => {
          if (st?.id || st?.staffId) staffDivMap.set(st.id || st.staffId, String(st.division || '').toUpperCase());
        });

        const otStaffIds = new Set<string>();
        let dailyOtHours = 0;
        let dService = 0;
        let dBar = 0;
        let dKitchen = 0;

        const combinedDailyOT: Record<string, any[]> = {
          ...(prevState.dailyOvertime || {}),
          ...(state.dailyOvertime || {})
        };

        Object.entries(combinedDailyOT).forEach(([dateStr, entries]: [string, any]) => {
          if (dateStr >= cutoffStart && dateStr <= cutoffEnd && Array.isArray(entries)) {
            entries.forEach((e: any) => {
              const h = Number(e.hours) || Number(e.overtimeHours) || 0;
              if (h > 0) {
                dailyOtHours += h;
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
        if (dailyOtHours > 0) {
          otTotal = dailyOtHours;
          otService = dService;
          otBar = dBar;
          otKitchen = dKitchen;
          otStaffCount = otStaffIds.size;
        }
      }
      const otAverage = otStaffCount > 0 ? otTotal / otStaffCount : 0;

      // 6. GSI Breakdown
      let qosPos = 0, qosTot = 0;
      let qofPos = 0, qofTot = 0;
      let qobPos = 0, qobTot = 0;
      let aosPos = 0, aosTot = 0;
      let vfmPos = 0, vfmTot = 0;
      let gsiTotalResponses = 0;

      if (state.dailyGSI) {
        Object.entries(state.dailyGSI).forEach(([dateStr, rows]: [string, any]) => {
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

      // 7. Google Review
      let grRating = 0;
      let grTotalReviews = 0;
      if ((state as any).googleReviews?.[monthKey]) {
        grRating = Number((state as any).googleReviews[monthKey].rating) || 0;
        grTotalReviews = Number((state as any).googleReviews[monthKey].totalReviews) || 0;
      } else if (state.googleReview) {
        grRating = Number(state.googleReview.currentRating) || 0;
        grTotalReviews = Number(state.googleReview.totalReview) || 0;
      }

      // 8. CPA
      let cpaFood = 0;
      let cpaBeverage = 0;
      let cpaService = 0;
      if (state.dailyCPA) {
        Object.entries(state.dailyCPA).forEach(([dateStr, entries]: [string, any]) => {
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
      if (state.guestComplaints && Array.isArray(state.guestComplaints)) {
        state.guestComplaints.forEach((c: any) => {
          if (String(c.date || '').startsWith(monthKey)) {
            const cat = String(c.category || c.type || '').toUpperCase();
            if (cat.includes('FOOD')) cpaFood++;
            else if (cat.includes('BEV')) cpaBeverage++;
            else cpaService++;
          }
        });
      }
      const cpaTotal = cpaFood + cpaBeverage + cpaService;

      // Consolidated metrics
      const fcMk = mainKitchenBelanja;
      const fcMs = mainStoreBelanja;
      const fcSupplier = supplierBelanja;
      const fcTotal = totalBelanjaOperasional;
      const fcPercent = costBelanjaPercent;

      const opexPattyCash = actualPattyCash;
      const opexChemical = chemicalTotal;
      const opexStationery = stationaryTotal;
      const opexMarketing = marketingTotal;

      return {
        no: idx + 1,
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        // Primary new fields
        targetRevenue: budgetRevenue,
        actualRevenue: mtdRevenue,
        revenuePercent: revAchievement,
        revenueVariance: revVariance,
        fcMk,
        fcMs,
        fcSupplier,
        fcTotal,
        fcPercent,
        // Opex 6 Kategori Khusus
        opexNonCommodity,
        opexCommodity,
        opexAtk,
        opexMaintenance,
        opexAsset,
        opexCasual,
        opexTotal,
        opexPercent,
        // Chemical, Stationary & Marketing (Terpisah)
        chemicalTotal,
        stationaryTotal,
        marketingTotal,
        totalChemStatMkt,
        chemStatMktRatio,
        // Legacy patty cash and opex fields for backwards compatibility
        opexPattyCash,
        opexChemical,
        opexStationery,
        opexMarketing,
        otService,
        otBar,
        otKitchen,
        otTotal,
        otStaffCount,
        otAverage,
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
        mtdRevenue,
        budgetRevenue,
        revAchievement,
        revVariance,
        supplierBelanja,
        mainKitchenBelanja,
        mainStoreBelanja,
        cashRetailFoodBelanja: cashRetailFoodBelanja || 0,
        totalBelanjaOperasional,
        costBelanjaPercent,
        actualPattyCash,
        budgetPattyCash,
        pattyCashVariance,
        pattyCashAchPercent,
        isPattyCashOver
      };
    });
  }, [allMonthlyData, data, monthKey, selectedMonth, selectedYear]);

  // Aggregated items across all categories and outlets for Matrix Belanja
  const rawMatrixItems = useMemo(() => {
    const itemsList: Array<{
      id: string;
      name: string;
      categoryName: string;
      categoryGroup: 'SUPPLIER' | 'FLOOR_ORDER' | 'PATTY_CASH' | 'LEDGER';
      groupLabel: string;
      qty: number;
      price: number;
      subtotal: number;
      date: string;
      outlet: string;
      pic?: string;
      reason?: string;
    }> = [];

    outletSummaries.forEach(s => {
      // 1. Supplier Purchases
      Object.entries(s.supplierBreakdown).forEach(([catName, data]: [string, any]) => {
        (data?.items || []).forEach((it: any) => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          itemsList.push({
            id: it.id || `${it.date}-${it.name}-${Math.random()}`,
            name: it.name || 'Item Belanja Supplier',
            categoryName: catName,
            categoryGroup: 'SUPPLIER',
            groupLabel: 'Supplier Rekanan',
            qty,
            price,
            subtotal: price * qty,
            date: it.date,
            outlet: s.outlet,
            pic: it.pic,
            reason: it.reason
          });
        });
      });

      // 2. Floor Order (Internal Requisition)
      Object.entries(s.floorOrderBreakdown).forEach(([catName, data]: [string, any]) => {
        (data?.items || []).forEach((it: any) => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          itemsList.push({
            id: it.id || `${it.date}-${it.name}-${Math.random()}`,
            name: it.name || 'Item Floor Order',
            categoryName: catName,
            categoryGroup: 'FLOOR_ORDER',
            groupLabel: 'Floor Order (Internal)',
            qty,
            price,
            subtotal: price * qty,
            date: it.date,
            outlet: s.outlet,
            pic: it.pic,
            reason: it.reason
          });
        });
      });

      // 3. Patty Cash OPEX
      Object.entries(s.pattyCashBreakdown).forEach(([catName, data]: [string, any]) => {
        (data.items || []).forEach((it: any) => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          itemsList.push({
            id: it.id || `${it.date}-${it.name}-${Math.random()}`,
            name: it.name || 'Biaya Patty Cash',
            categoryName: catName,
            categoryGroup: 'PATTY_CASH',
            groupLabel: 'Patty Cash OPEX',
            qty,
            price,
            subtotal: price * qty,
            date: it.date,
            outlet: s.outlet,
            pic: it.pic,
            reason: it.reason
          });
        });
      });

      // 4. Ledgers
      (s.guestSatisfaction.items || []).forEach(it => {
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        itemsList.push({
          id: it.id || `${it.date}-${it.name}-${Math.random()}`,
          name: it.name || 'Guest Satisfaction',
          categoryName: 'Guest Satisfaction',
          categoryGroup: 'LEDGER',
          groupLabel: 'Customer / Ledgers',
          qty,
          price,
          subtotal: price * qty,
          date: it.date,
          outlet: s.outlet,
          pic: it.pic,
          reason: it.reason
        });
      });

      (s.cityLedger.items || []).forEach(it => {
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        itemsList.push({
          id: it.id || `${it.date}-${it.name}-${Math.random()}`,
          name: it.name || 'City Ledger',
          categoryName: 'City Ledger',
          categoryGroup: 'LEDGER',
          groupLabel: 'Customer / Ledgers',
          qty,
          price,
          subtotal: price * qty,
          date: it.date,
          outlet: s.outlet,
          pic: it.pic,
          reason: it.reason
        });
      });

      (s.complimentary.items || []).forEach(it => {
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        itemsList.push({
          id: it.id || `${it.date}-${it.name}-${Math.random()}`,
          name: it.name || 'Complimentary',
          categoryName: 'Complimentary',
          categoryGroup: 'LEDGER',
          groupLabel: 'Customer / Ledgers',
          qty,
          price,
          subtotal: price * qty,
          date: it.date,
          outlet: s.outlet,
          pic: it.pic,
          reason: it.reason
        });
      });
    });

    return itemsList;
  }, [outletSummaries]);

  // List of unique categories available with counts and totals
  const categoryDirectory = useMemo(() => {
    const map: Record<string, {
      name: string;
      group: 'SUPPLIER' | 'FLOOR_ORDER' | 'PATTY_CASH' | 'LEDGER';
      groupLabel: string;
      itemCount: number;
      totalSpend: number;
      uniqueItemCount: number;
    }> = {};

    // Standard preset categories
    const standardCategories: { name: string; group: 'SUPPLIER' | 'FLOOR_ORDER' | 'PATTY_CASH' | 'LEDGER'; groupLabel: string }[] = [
      // Suppliers
      { name: 'TGIF', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'SUKANDA', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'EVEREST', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'IKIGAI', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'PANFILA', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'SAUNG KUBIL', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      { name: 'KEBUNKU', group: 'SUPPLIER', groupLabel: 'Supplier Rekanan' },
      // Floor Order
      { name: 'Main Kitchen', group: 'FLOOR_ORDER', groupLabel: 'Floor Order (Internal)' },
      { name: 'Main Store', group: 'FLOOR_ORDER', groupLabel: 'Floor Order (Internal)' },
      { name: 'Chemical', group: 'FLOOR_ORDER', groupLabel: 'Floor Order (Internal)' },
      { name: 'Guest Supplies', group: 'FLOOR_ORDER', groupLabel: 'Floor Order (Internal)' },
      // Patty Cash
      { name: 'Non-Commodity', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Commodity', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Maintenance', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Asset', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Casual', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'ATK', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Third Party', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      { name: 'Petty Cash Lainnya', group: 'PATTY_CASH', groupLabel: 'Patty Cash OPEX' },
      // Ledgers
      { name: 'Guest Satisfaction', group: 'LEDGER', groupLabel: 'Customer / Ledgers' },
      { name: 'City Ledger', group: 'LEDGER', groupLabel: 'Customer / Ledgers' },
      { name: 'Complimentary', group: 'LEDGER', groupLabel: 'Customer / Ledgers' },
    ];

    standardCategories.forEach(c => {
      map[c.name] = {
        name: c.name,
        group: c.group,
        groupLabel: c.groupLabel,
        itemCount: 0,
        totalSpend: 0,
        uniqueItemCount: 0
      };
    });

    const uniqueItemSetPerCat: Record<string, Set<string>> = {};

    rawMatrixItems.forEach(it => {
      if (!map[it.categoryName]) {
        map[it.categoryName] = {
          name: it.categoryName,
          group: it.categoryGroup,
          groupLabel: it.groupLabel,
          itemCount: 0,
          totalSpend: 0,
          uniqueItemCount: 0
        };
      }
      map[it.categoryName].itemCount += 1;
      map[it.categoryName].totalSpend += it.subtotal;

      if (!uniqueItemSetPerCat[it.categoryName]) {
        uniqueItemSetPerCat[it.categoryName] = new Set();
      }
      uniqueItemSetPerCat[it.categoryName].add(it.name.trim().toLowerCase());
    });

    Object.keys(uniqueItemSetPerCat).forEach(cat => {
      if (map[cat]) {
        map[cat].uniqueItemCount = uniqueItemSetPerCat[cat].size;
      }
    });

    return Object.values(map);
  }, [rawMatrixItems]);

  // Aggregated matrix grouped by Item Name + Category
  const aggregatedMatrixItems = useMemo(() => {
    const itemMap: Record<string, {
      key: string;
      name: string;
      categoryName: string;
      categoryGroup: 'SUPPLIER' | 'FLOOR_ORDER' | 'PATTY_CASH' | 'LEDGER';
      groupLabel: string;
      totalQty: number;
      totalSpend: number;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      txCount: number;
      outletQty: Record<string, number>;
      outletSpend: Record<string, number>;
      transactions: Array<{
        date: string;
        outlet: string;
        qty: number;
        price: number;
        subtotal: number;
        pic?: string;
        reason?: string;
      }>;
    }> = {};

    rawMatrixItems.forEach(it => {
      const normalizedName = it.name.trim();
      const mapKey = `${it.categoryGroup}___${it.categoryName}___${normalizedName.toLowerCase()}`;

      if (!itemMap[mapKey]) {
        itemMap[mapKey] = {
          key: mapKey,
          name: normalizedName,
          categoryName: it.categoryName,
          categoryGroup: it.categoryGroup,
          groupLabel: it.groupLabel,
          totalQty: 0,
          totalSpend: 0,
          avgPrice: 0,
          minPrice: it.price,
          maxPrice: it.price,
          txCount: 0,
          outletQty: {},
          outletSpend: {},
          transactions: []
        };
      }

      const entry = itemMap[mapKey];
      entry.totalQty += it.qty;
      entry.totalSpend += it.subtotal;
      entry.txCount += 1;
      entry.minPrice = Math.min(entry.minPrice, it.price);
      entry.maxPrice = Math.max(entry.maxPrice, it.price);
      entry.outletQty[it.outlet] = (entry.outletQty[it.outlet] || 0) + it.qty;
      entry.outletSpend[it.outlet] = (entry.outletSpend[it.outlet] || 0) + it.subtotal;
      entry.transactions.push({
        date: it.date,
        outlet: it.outlet,
        qty: it.qty,
        price: it.price,
        subtotal: it.subtotal,
        pic: it.pic,
        reason: it.reason
      });
    });

    // Calculate averages & sort transactions
    return Object.values(itemMap).map(entry => {
      entry.avgPrice = entry.totalQty > 0 ? entry.totalSpend / entry.totalQty : 0;
      entry.transactions.sort((a, b) => b.date.localeCompare(a.date));
      return entry;
    });
  }, [rawMatrixItems]);

  // Filtered & sorted matrix items based on user selection
  const filteredMatrixItems = useMemo(() => {
    let list = aggregatedMatrixItems;

    // Filter by group
    if (matrixCategoryGroup !== 'ALL') {
      list = list.filter(it => it.categoryGroup === matrixCategoryGroup);
    }

    // Filter by specific category
    if (matrixSelectedCategory !== 'ALL') {
      list = list.filter(it => it.categoryName === matrixSelectedCategory);
    }

    // Filter by search query
    if (matrixSearchQuery.trim()) {
      const q = matrixSearchQuery.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) ||
        it.categoryName.toLowerCase().includes(q) ||
        it.groupLabel.toLowerCase().includes(q) ||
        it.transactions.some(tx => 
          (tx.pic && tx.pic.toLowerCase().includes(q)) || 
          (tx.reason && tx.reason.toLowerCase().includes(q)) ||
          tx.outlet.toLowerCase().includes(q)
        )
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (matrixSortBy === 'COST_DESC') return b.totalSpend - a.totalSpend;
      if (matrixSortBy === 'COST_ASC') return a.totalSpend - b.totalSpend;
      if (matrixSortBy === 'QTY_DESC') return b.totalQty - a.totalQty;
      if (matrixSortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      return 0;
    });

    return list;
  }, [aggregatedMatrixItems, matrixCategoryGroup, matrixSelectedCategory, matrixSearchQuery, matrixSortBy]);

  // Active Category Scope Totals
  const activeCategorySummary = useMemo(() => {
    const totalSpend = filteredMatrixItems.reduce((acc, it) => acc + it.totalSpend, 0);
    const totalQty = filteredMatrixItems.reduce((acc, it) => acc + it.totalQty, 0);
    const uniqueItems = filteredMatrixItems.length;
    const topItem = filteredMatrixItems.length > 0 ? filteredMatrixItems[0] : null;

    return {
      totalSpend,
      totalQty,
      uniqueItems,
      topItem
    };
  }, [filteredMatrixItems]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`SUMMARY_REPORT_${monthName}_${selectedYear}`);

      // Title & Headers
      sheet.addRow(['EXECUTIVE SUMMARY REPORT - COGS, OPEX, ENERGY & RATIOS']);
      sheet.addRow([`Periode: ${monthName} ${selectedYear} | Outlet: ${activeOutlet}`]);
      sheet.addRow([]);

      // 1. Grand Summary Table
      sheet.addRow(['1. REGIONAL / OUTLET FINANCIAL SUMMARY & RATIOS']);
      sheet.addRow([
        'OUTLET',
        'REVENUE (MTD)',
        'OPENING INV',
        'BELANJA MTD',
        'CLOSING INV',
        'TOTAL COGS',
        'COGS %',
        'BELANJA VS REV %',
        'PATTY CASH EXPENSE',
        'PATTY CASH VS REV %',
        'ENERGY COST',
        'ENERGY %',
        'FLOOR ORDER',
        'GUEST SATISFACTION',
        'CITY LEDGER',
        'COMPLIMENTARY'
      ]);

      outletSummaries.forEach(s => {
        sheet.addRow([
          s.outlet,
          s.revenue,
          s.openingInventory,
          s.totalBelanjaMTD,
          s.closingInventory,
          s.effectiveCOGS,
          `${s.cogsPercent.toFixed(2)}%`,
          `${s.belanjaRatioPercent.toFixed(2)}%`,
          s.totalPattyCashExpense,
          `${s.pattyCashRatioPercent.toFixed(2)}%`,
          s.totalEnergyCost,
          `${s.energyRatioPercent.toFixed(2)}%`,
          s.totalFloorOrder,
          s.guestSatisfaction.total,
          s.cityLedger.total,
          s.complimentary.total
        ]);
      });

      // Total Row
      sheet.addRow([
        'GRAND TOTAL',
        grandTotal.revenue,
        grandTotal.openingInventory,
        grandTotal.totalBelanjaMTD,
        grandTotal.closingInventory,
        grandTotal.effectiveCOGS,
        `${grandTotal.cogsPercent.toFixed(2)}%`,
        `${grandTotal.belanjaRatioPercent.toFixed(2)}%`,
        grandTotal.totalPattyCashExpense,
        `${grandTotal.pattyCashRatioPercent.toFixed(2)}%`,
        grandTotal.totalEnergyCost,
        `${grandTotal.energyRatioPercent.toFixed(2)}%`,
        grandTotal.totalFloorOrder,
        grandTotal.guestSatisfactionTotal,
        grandTotal.cityLedgerTotal,
        grandTotal.complimentaryTotal
      ]);

      // 2. Matrix Belanja per Kategori & Item Sheet
      const matrixSheet = workbook.addWorksheet(`MATRIX_BELANJA_ITEM`);
      matrixSheet.addRow([`MATRIX ITEM BELANJA & PENGELUARAN PER KATEGORI`]);
      matrixSheet.addRow([`Periode: ${monthName} ${selectedYear} | Outlet: ${activeOutlet}`]);
      matrixSheet.addRow([]);
      matrixSheet.addRow([
        'NO',
        'KELOMPOK (GROUP)',
        'KATEGORI / VENDOR',
        'NAMA ITEM BELANJA',
        'TOTAL QTY',
        'RATA-RATA HARGA (RP)',
        'MIN HARGA (RP)',
        'MAX HARGA (RP)',
        'TOTAL BELANJA (RP)',
        '% SHARE KATEGORI',
        'FREKUENSI TRANSAKSI',
        'OUTLET DISTRIBUSI'
      ]);

      aggregatedMatrixItems.forEach((it, idx) => {
        const catTotal = categoryDirectory.find(c => c.name === it.categoryName)?.totalSpend || it.totalSpend;
        const catShare = catTotal > 0 ? (it.totalSpend / catTotal) * 100 : 100;
        const outletDist = Object.entries(it.outletSpend).map(([o, spend]) => `${o}: Rp ${Number(spend || 0).toLocaleString('id-ID')}`).join(', ');

        matrixSheet.addRow([
          idx + 1,
          it.groupLabel,
          it.categoryName,
          it.name,
          it.totalQty,
          Math.round(it.avgPrice),
          it.minPrice,
          it.maxPrice,
          it.totalSpend,
          `${catShare.toFixed(2)}%`,
          it.txCount,
          outletDist
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SUMMARY_REPORT_${activeOutlet}_${monthName}_${selectedYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      if (showToast) {
        showToast('Summary Report & Matrix Belanja berhasil diexport ke Excel!', 'success');
      }
    } catch (err) {
      console.error(err);
      if (showToast) {
        showToast('Gagal mengexport Excel.', 'error');
      }
    }
  };

  // Copy WhatsApp Consolidated Summary
  const handleCopyWhatsApp = () => {
    let msg = `*📊 EXECUTIVE SUMMARY REPORT*\n`;
    msg += `*PERIODE*: ${monthName} ${selectedYear}\n`;
    msg += `*OUTLET*: ${activeOutlet}\n`;
    msg += `----------------------------------------\n\n`;

    msg += `*💰 REVENUE & KEY FINANCIAL RATIOS*\n`;
    msg += `• *MTD Revenue*: Rp ${grandTotal.revenue.toLocaleString('id-ID')}\n`;
    msg += `• *Total Belanja MTD*: Rp ${grandTotal.totalBelanjaMTD.toLocaleString('id-ID')}\n`;
    msg += `• *Ratio Belanja vs Revenue*: *${grandTotal.belanjaRatioPercent.toFixed(2)}%* ${grandTotal.belanjaRatioPercent <= 43 ? '✅ (Optimal)' : '⚠️ (Over Budget)'}\n`;
    msg += `• *Total Patty Cash OPEX*: Rp ${grandTotal.totalPattyCashExpense.toLocaleString('id-ID')}\n`;
    msg += `• *Ratio Patty Cash vs Revenue*: *${grandTotal.pattyCashRatioPercent.toFixed(2)}%* ${grandTotal.pattyCashRatioPercent <= 3.5 ? '✅ (Efisien)' : '⚠️'}\n\n`;

    msg += `*📦 COGS & INVENTORY CONTROL*\n`;
    msg += `• Opening Inventory (+): Rp ${grandTotal.openingInventory.toLocaleString('id-ID')}\n`;
    msg += `• Belanja Supplier (+): Rp ${grandTotal.totalBelanjaMTD.toLocaleString('id-ID')}\n`;
    msg += `• Closing Inventory (-): Rp ${grandTotal.closingInventory.toLocaleString('id-ID')}\n`;
    msg += `• *Effective COGS (HPP)*: *Rp ${grandTotal.effectiveCOGS.toLocaleString('id-ID')}* (${grandTotal.cogsPercent.toFixed(2)}%)\n\n`;

    msg += `*⚡ OPERATIONAL & EXPENSE AUDIT*\n`;
    msg += `• Energy Cost (Listrik/Air/Gas): Rp ${grandTotal.totalEnergyCost.toLocaleString('id-ID')} (${grandTotal.energyRatioPercent.toFixed(2)}%)\n`;
    msg += `• Floor Order (Internal Requisition): Rp ${grandTotal.totalFloorOrder.toLocaleString('id-ID')}\n`;
    msg += `• Supplier Purchases: Rp ${grandTotal.totalSupplierPurchases.toLocaleString('id-ID')}\n\n`;

    msg += `*📑 LEDGERS & ADJUSTMENTS*\n`;
    msg += `• Guest Satisfaction: Rp ${grandTotal.guestSatisfactionTotal.toLocaleString('id-ID')}\n`;
    msg += `• City Ledger (A/R): Rp ${grandTotal.cityLedgerTotal.toLocaleString('id-ID')}\n`;
    msg += `• Complimentary / Treats: Rp ${grandTotal.complimentaryTotal.toLocaleString('id-ID')}\n\n`;

    msg += `*Best Regards,*\n*Management & Regional Reporting*`;

    navigator.clipboard.writeText(msg).then(() => {
      if (showToast) {
        showToast('Executive Summary Report disalin ke WhatsApp!', 'success');
      }
    });
  };

  const reportId = `summary-report-${monthKey}`;

  return (
    <div className="space-y-6">
      {/* HEADER CONTROLS */}
      <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <i className="fas fa-file-contract text-2xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              Summary Report Executive
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                COGS • OPEX • RATIOS
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Konsolidasi Lengkap COGS, Patty Cash, Energy, Floor Order, Supplier, Ledgers & Rasi Finansial
            </p>
          </div>
        </div>

        {/* Filter Month, Year & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Outlet Badge (Single Outlet Mode for Logged-in User) */}
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 shadow-sm">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs">
                <i className="fas fa-store"></i>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet Aktif</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          {/* Month Selector */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Excel
          </button>

          <button
            onClick={handleCopyWhatsApp}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fab fa-whatsapp"></i> WA Summary
          </button>

          <ShareActions 
            targetId={reportId} 
            title={`Summary Report - ${activeOutlet} (${monthName} ${selectedYear})`}
            showToast={showToast}
          />
        </div>
      </div>

      {/* OUTLET SELECTOR PILLS (HANYA DITAMPILKAN DI HALAMAN REGIONAL) */}
      {isRegionalView && (
        <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2.5 rounded-2xl border border-white/5 no-print">
          <button
            onClick={() => setActiveOutlet('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 ${
              activeOutlet === 'ALL' || !activeOutlet
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 border border-indigo-400/40'
                : 'hover:bg-white/5 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <i className="fas fa-layer-group text-xs"></i>
            <span>ALL OUTLETS (SEMUA OUTLET)</span>
          </button>
          {OUTLETS.map(outlet => (
            <button
              key={outlet}
              onClick={() => setActiveOutlet(outlet)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                activeOutlet === outlet
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {outlet}
            </button>
          ))}
        </div>
      )}

      {/* SECTION SELECTOR PILLS */}
      <div className="flex flex-wrap gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-white/5 no-print text-xs">
        {[
          { id: 'ALL', label: 'Semua Rincian', icon: 'fa-layer-group' },
          { id: 'REKAPAN_SUMMARY', label: '📊 Rekapan Summary Report', icon: 'fa-table-list' },
          { id: 'RATIOS', label: '1. Financial Ratios', icon: 'fa-chart-pie' },
          { id: 'COGS', label: '2. COGS & Belanja', icon: 'fa-calculator' },
          { id: 'EXPENSES', label: '3. Patty Cash OPEX', icon: 'fa-wallet' },
          { id: 'ENERGY', label: '4. Energy Cost', icon: 'fa-bolt' },
          { id: 'FLOOR', label: '5. Floor Order', icon: 'fa-boxes' },
          { id: 'SUPPLIER', label: '6. Supplier Belanja', icon: 'fa-truck' },
          { id: 'LEDGERS', label: '7. Guest Sat & City Ledger', icon: 'fa-gift' },
          { id: 'MATRIX', label: '8. Matrix Item Belanja', icon: 'fa-table-cells' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSection === tab.id
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <i className={`fas ${tab.icon} text-[10px]`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      <div id={reportId} className="space-y-8">
        {/* DEDICATED TABEL REKAPAN SUMMARY REPORT (ALL OUTLETS) */}
        {(activeSection === 'ALL' || activeSection === 'REKAPAN_SUMMARY') && (isRegionalView || activeOutlet === 'ALL') && (
          <RegionalSummaryReportRecapTable
            items={allOutletsRecapItems}
            monthName={monthName}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelectOutlet={(o) => setActiveOutlet(o)}
            showToast={showToast}
          />
        )}
        {/* TOP KPI HIGHLIGHT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Revenue MTD */}
          <div className="glass-card p-5 rounded-2xl border border-emerald-500/20 bg-slate-900/90 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                MTD ACTUAL REVENUE
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                <i className="fas fa-cash-register"></i>
              </div>
            </div>
            <div className="text-2xl font-black text-white py-1">
              Rp {grandTotal.revenue.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Total Covers: <span className="text-white font-bold">{grandTotal.covers.toLocaleString('id-ID')}</span> pax
            </div>
          </div>

          {/* Card 2: Ratio Belanja vs Revenue */}
          <div className={`glass-card p-5 rounded-2xl border ${grandTotal.belanjaRatioPercent <= 43 ? 'border-indigo-500/30' : 'border-amber-500/40'} bg-slate-900/90 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                RATIO REVENUE VS BELANJA
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${grandTotal.belanjaRatioPercent <= 43 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {grandTotal.belanjaRatioPercent <= 43 ? 'AMAN' : 'OVER'}
              </span>
            </div>
            <div className="text-2xl font-black text-indigo-300 py-1">
              {grandTotal.belanjaRatioPercent.toFixed(2)}%
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>Total: Rp {grandTotal.totalBelanjaMTD.toLocaleString('id-ID')}</span>
              <span>Target: 43.00%</span>
            </div>
          </div>

          {/* Card 3: Ratio Revenue vs Patty Cash */}
          <div className={`glass-card p-5 rounded-2xl border ${grandTotal.pattyCashRatioPercent <= 3.5 ? 'border-emerald-500/30' : 'border-rose-500/40'} bg-slate-900/90 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
                RATIO REVENUE VS PATTY CASH
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${grandTotal.pattyCashRatioPercent <= 3.5 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {grandTotal.pattyCashRatioPercent <= 3.5 ? 'EFISIEN' : 'TINGGI'}
              </span>
            </div>
            <div className="text-2xl font-black text-purple-300 py-1">
              {grandTotal.pattyCashRatioPercent.toFixed(2)}%
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>Total: Rp {grandTotal.totalPattyCashExpense.toLocaleString('id-ID')}</span>
              <span>Max: 3.50%</span>
            </div>
          </div>

          {/* Card 4: Effective COGS */}
          <div className="glass-card p-5 rounded-2xl border border-indigo-500/30 bg-slate-900/90 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                TOTAL EFFECTIVE COGS (HPP)
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                {grandTotal.cogsPercent.toFixed(2)}%
              </span>
            </div>
            <div className="text-2xl font-black text-white py-1">
              Rp {grandTotal.effectiveCOGS.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Opening + Belanja - Closing
            </div>
          </div>
        </div>

        {/* 1. FINANCIAL RATIOS & CONSOLIDATED TABLE */}
        {(activeSection === 'ALL' || activeSection === 'RATIOS') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <i className="fas fa-chart-pie"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    1. Financial Ratios & Rekapan per Outlet
                  </h2>
                  <p className="text-xs text-slate-400">
                    Perbandingan Persentase Revenue vs Belanja & Revenue vs Patty Cash OPEX
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-950 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                    <th className="p-3 border-r border-white/5">OUTLET</th>
                    <th className="p-3 border-r border-white/5 text-right">REVENUE MTD</th>
                    <th className="p-3 border-r border-white/5 text-right">TOTAL BELANJA</th>
                    <th className="p-3 border-r border-white/5 text-center bg-indigo-950/40 text-indigo-300">RATIO BELANJA %</th>
                    <th className="p-3 border-r border-white/5 text-right">PATTY CASH OPEX</th>
                    <th className="p-3 border-r border-white/5 text-center bg-purple-950/40 text-purple-300">RATIO PATTY CASH %</th>
                    <th className="p-3 border-r border-white/5 text-right">ENERGY COST</th>
                    <th className="p-3 text-right text-emerald-400">COGS (HPP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-bold text-slate-300">
                  {outletSummaries.map((s, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 border-r border-white/5 text-white font-black">
                        {s.outlet}
                      </td>
                      <td className="p-3 border-r border-white/5 text-right font-black text-white">
                        Rp {s.revenue.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 border-r border-white/5 text-right text-indigo-300">
                        Rp {s.totalBelanjaMTD.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 border-r border-white/5 text-center bg-indigo-950/20">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-xs ${s.belanjaRatioPercent <= 43 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {s.belanjaRatioPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 border-r border-white/5 text-right text-purple-300">
                        Rp {s.totalPattyCashExpense.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 border-r border-white/5 text-center bg-purple-950/20">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-xs ${s.pattyCashRatioPercent <= 3.5 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          {s.pattyCashRatioPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 border-r border-white/5 text-right text-amber-300">
                        Rp {s.totalEnergyCost.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-right font-black text-emerald-400">
                        Rp {s.effectiveCOGS.toLocaleString('id-ID')} ({s.cogsPercent.toFixed(2)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-white/10 bg-slate-950 text-xs font-black text-white">
                  <tr>
                    <td className="p-3 border-r border-white/5 uppercase">GRAND TOTAL</td>
                    <td className="p-3 border-r border-white/5 text-right text-white">
                      Rp {grandTotal.revenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 border-r border-white/5 text-right text-indigo-300">
                      Rp {grandTotal.totalBelanjaMTD.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 border-r border-white/5 text-center bg-indigo-950/60 text-indigo-300 font-black">
                      {grandTotal.belanjaRatioPercent.toFixed(2)}%
                    </td>
                    <td className="p-3 border-r border-white/5 text-right text-purple-300">
                      Rp {grandTotal.totalPattyCashExpense.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 border-r border-white/5 text-center bg-purple-950/60 text-purple-300 font-black">
                      {grandTotal.pattyCashRatioPercent.toFixed(2)}%
                    </td>
                    <td className="p-3 border-r border-white/5 text-right text-amber-300">
                      Rp {grandTotal.totalEnergyCost.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-400">
                      Rp {grandTotal.effectiveCOGS.toLocaleString('id-ID')} ({grandTotal.cogsPercent.toFixed(2)}%)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* 2. COGS & BELANJA INVENTORY DETAILS */}
        {(activeSection === 'ALL' || activeSection === 'COGS') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <i className="fas fa-calculator"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    2. Perhitungan COGS & Persediaan Inventory
                  </h2>
                  <p className="text-xs text-slate-400">
                    Formula: Opening Inventory (+) + MTD Belanja Supplier (+) - Closing Inventory (-)
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-1">
                  1. OPENING INVENTORY (+)
                </span>
                <div className="text-xl font-black text-white">
                  Rp {grandTotal.openingInventory.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Stok Awal Bulan</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-indigo-500/30">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block mb-1">
                  2. MTD BELANJA SUPPLIER (+)
                </span>
                <div className="text-xl font-black text-indigo-300">
                  Rp {grandTotal.totalBelanjaMTD.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Total Cost Receiving Sheet</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-rose-500/30">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block mb-1">
                  3. CLOSING INVENTORY (-)
                </span>
                <div className="text-xl font-black text-rose-300">
                  Rp {grandTotal.closingInventory.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Stok Akhir Cut-off</p>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-950 border border-indigo-500/40">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-1">
                  TOTAL COGS (HPP) =
                </span>
                <div className="text-xl font-black text-emerald-300">
                  Rp {grandTotal.effectiveCOGS.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Rasio COGS: <span className="font-bold text-white">{grandTotal.cogsPercent.toFixed(2)}%</span> (Target ≤ 43%)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3. PATTY CASH OPEX & CATEGORY BREAKDOWN */}
        {(activeSection === 'ALL' || activeSection === 'EXPENSES') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <i className="fas fa-wallet"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    3. Patty Cash OPEX & Kategori Biaya
                  </h2>
                  <p className="text-xs text-slate-400">
                    Rekapan Pengeluaran Biaya Operasional (Non-Commodity, Maintenance, Asset, Casual, ATK, Third Party)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-bold block">Total Patty Cash:</span>
                <span className="text-lg font-black text-purple-400">Rp {grandTotal.totalPattyCashExpense.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['Non-Commodity', 'Commodity', 'Maintenance', 'Asset', 'Casual', 'ATK', 'Third Party', 'Petty Cash Lainnya'].map((catName) => {
                const totalInCat = outletSummaries.reduce((acc, curr) => acc + (curr.pattyCashBreakdown[catName]?.total || 0), 0);
                const itemsInCat = outletSummaries.reduce((acc, curr) => acc + (curr.pattyCashBreakdown[catName]?.count || 0), 0);
                return (
                  <button
                    key={catName}
                    onClick={() => {
                      setMatrixCategoryGroup('PATTY_CASH');
                      setMatrixSelectedCategory(catName);
                      setActiveSection('MATRIX');
                    }}
                    className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1 text-left hover:border-purple-500/50 hover:bg-purple-950/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block group-hover:text-purple-300">
                        {catName}
                      </span>
                      <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-purple-400"></i>
                    </div>
                    <div className="text-sm font-black text-white group-hover:text-purple-200">
                      Rp {totalInCat.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-between">
                      <span>{itemsInCat} Transaksi</span>
                      <span className="text-purple-400/80 font-bold group-hover:underline">Matrix ➔</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. ENERGY COST DETAILS */}
        {(activeSection === 'ALL' || activeSection === 'ENERGY') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <i className="fas fa-bolt"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    4. Biaya Energi (Electricity, Water, Gas)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Penggunaan Listrik (LWBP/WBP), Air PAM & Gas LPG
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-bold block">Total Energy Cost:</span>
                <span className="text-lg font-black text-amber-400">Rp {grandTotal.totalEnergyCost.toLocaleString('id-ID')} ({grandTotal.energyRatioPercent.toFixed(2)}%)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-amber-500/20 space-y-1">
                <div className="flex items-center justify-between text-amber-400 text-xs font-bold uppercase">
                  <span>Listrik (Electricity)</span>
                  <i className="fas fa-plug"></i>
                </div>
                <div className="text-lg font-black text-white">
                  Rp {grandTotal.electricityCost.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500">Meter LWBP & WBP</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-sky-500/20 space-y-1">
                <div className="flex items-center justify-between text-sky-400 text-xs font-bold uppercase">
                  <span>Air PAM (Water)</span>
                  <i className="fas fa-tint"></i>
                </div>
                <div className="text-lg font-black text-white">
                  Rp {grandTotal.waterCost.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500">Pemakaian Air Bulanan</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-rose-500/20 space-y-1">
                <div className="flex items-center justify-between text-rose-400 text-xs font-bold uppercase">
                  <span>Gas (LPG)</span>
                  <i className="fas fa-fire"></i>
                </div>
                <div className="text-lg font-black text-white">
                  Rp {grandTotal.gasCost.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500">Pemakaian Tabung Gas</p>
              </div>
            </div>
          </div>
        )}

        {/* 5. FLOOR ORDER DETAILS */}
        {(activeSection === 'ALL' || activeSection === 'FLOOR') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <i className="fas fa-boxes"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    5. Floor Order (Internal Requisition)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Main Kitchen, Main Store, Chemical & Guest Supplies
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-bold block">Total Floor Order:</span>
                <span className="text-lg font-black text-teal-400">Rp {grandTotal.totalFloorOrder.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['Main Kitchen', 'Main Store', 'Chemical', 'Guest Supplies'].map((floorName) => {
                const totalInFloor = outletSummaries.reduce((acc, curr) => acc + (curr.floorOrderBreakdown[floorName]?.total || 0), 0);
                const countInFloor = outletSummaries.reduce((acc, curr) => acc + (curr.floorOrderBreakdown[floorName]?.count || 0), 0);
                return (
                  <button
                    key={floorName}
                    onClick={() => {
                      setMatrixCategoryGroup('FLOOR_ORDER');
                      setMatrixSelectedCategory(floorName);
                      setActiveSection('MATRIX');
                    }}
                    className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1 text-left hover:border-teal-500/50 hover:bg-teal-950/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block group-hover:text-teal-300">
                        {floorName}
                      </span>
                      <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-teal-400"></i>
                    </div>
                    <div className="text-sm font-black text-white group-hover:text-teal-200">
                      Rp {totalInFloor.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-between">
                      <span>{countInFloor} Items</span>
                      <span className="text-teal-400/80 font-bold group-hover:underline">Matrix ➔</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. SUPPLIER PURCHASES (RECEIVING SHEET) */}
        {(activeSection === 'ALL' || activeSection === 'SUPPLIER') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <i className="fas fa-truck"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    6. Belanja Supplier (Receiving Sheet Cost)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Total Belanja Supplier Rekanan (TGIF, Sukanda, Everest, Ikigai, Panfila, Saung Kubil)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-bold block">Total Belanja:</span>
                <span className="text-lg font-black text-orange-400">Rp {grandTotal.totalSupplierPurchases.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {['TGIF', 'SUKANDA', 'EVEREST', 'IKIGAI', 'PANFILA', 'SAUNG KUBIL', 'KEBUNKU'].map((supName) => {
                const totalInSup = outletSummaries.reduce((acc, curr) => acc + (curr.supplierBreakdown[supName]?.total || 0), 0);
                const countInSup = outletSummaries.reduce((acc, curr) => acc + (curr.supplierBreakdown[supName]?.count || 0), 0);
                return (
                  <button
                    key={supName}
                    onClick={() => {
                      setMatrixCategoryGroup('SUPPLIER');
                      setMatrixSelectedCategory(supName);
                      setActiveSection('MATRIX');
                    }}
                    className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1 text-left hover:border-orange-500/50 hover:bg-orange-950/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block group-hover:text-orange-300">
                        {supName}
                      </span>
                      <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-orange-400"></i>
                    </div>
                    <div className="text-xs font-black text-white truncate group-hover:text-orange-200">
                      Rp {totalInSup.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-between">
                      <span>{countInSup} Items</span>
                      <span className="text-orange-400/80 font-bold group-hover:underline">Matrix ➔</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. GUEST SATISFACTION, CITY LEDGER & COMPLIMENTARY */}
        {(activeSection === 'ALL' || activeSection === 'LEDGERS') && (
          <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                  <i className="fas fa-gift"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    7. Guest Satisfaction, City Ledger & Complimentary
                  </h2>
                  <p className="text-xs text-slate-400">
                    Rekapan Valuasi Customer Satisfaction, Tagihan Piutang City Ledger & Promo Complimentary
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Guest Satisfaction */}
              <button
                onClick={() => {
                  setMatrixCategoryGroup('LEDGER');
                  setMatrixSelectedCategory('Guest Satisfaction');
                  setActiveSection('MATRIX');
                }}
                className="p-4 rounded-2xl bg-slate-950/60 border border-emerald-500/20 space-y-2 text-left hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-emerald-400 text-xs font-black uppercase">
                  <span>Guest Satisfaction</span>
                  <i className="fas fa-face-smile"></i>
                </div>
                <div className="text-xl font-black text-emerald-300">
                  Rp {grandTotal.guestSatisfactionTotal.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Treats & Kepuasan Tamu</span>
                  <span className="text-emerald-400 font-bold group-hover:underline">Lihat Matrix ➔</span>
                </div>
              </button>

              {/* City Ledger */}
              <button
                onClick={() => {
                  setMatrixCategoryGroup('LEDGER');
                  setMatrixSelectedCategory('City Ledger');
                  setActiveSection('MATRIX');
                }}
                className="p-4 rounded-2xl bg-slate-950/60 border border-blue-500/20 space-y-2 text-left hover:border-blue-500/50 hover:bg-blue-950/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-blue-400 text-xs font-black uppercase">
                  <span>City Ledger (A/R)</span>
                  <i className="fas fa-building"></i>
                </div>
                <div className="text-xl font-black text-blue-300">
                  Rp {grandTotal.cityLedgerTotal.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Tagihan & Piutang Perusahaan</span>
                  <span className="text-blue-400 font-bold group-hover:underline">Lihat Matrix ➔</span>
                </div>
              </button>

              {/* Complimentary */}
              <button
                onClick={() => {
                  setMatrixCategoryGroup('LEDGER');
                  setMatrixSelectedCategory('Complimentary');
                  setActiveSection('MATRIX');
                }}
                className="p-4 rounded-2xl bg-slate-950/60 border border-pink-500/20 space-y-2 text-left hover:border-pink-500/50 hover:bg-pink-950/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-pink-400 text-xs font-black uppercase">
                  <span>Complimentary</span>
                  <i className="fas fa-gift"></i>
                </div>
                <div className="text-xl font-black text-pink-300">
                  Rp {grandTotal.complimentaryTotal.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Menu Complimentary Promo</span>
                  <span className="text-pink-400 font-bold group-hover:underline">Lihat Matrix ➔</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 8. MATRIX BELANJA PER KATEGORI & ITEM DETAIL */}
        {(activeSection === 'ALL' || activeSection === 'MATRIX') && (
          <div className="glass-card p-6 border border-cyan-500/30 bg-slate-900/95 rounded-3xl space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/30 to-blue-500/30 text-cyan-300 flex items-center justify-center border border-cyan-400/30 shadow-lg shadow-cyan-500/10">
                  <i className="fas fa-table-cells text-base"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                      8. Matrix Belanja per Kategori & Rincian Item
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Live Analysis
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Matrix rincian setiap item yang dibelanjakan pada kategori tertentu (Supplier, Floor Order, Patty Cash & Ledgers)
                  </p>
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-white/10 self-start lg:self-auto">
                <button
                  onClick={() => setMatrixViewMode('ITEM_LIST')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    matrixViewMode === 'ITEM_LIST'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fas fa-list"></i>
                  Daftar & Analisis Item
                </button>
                <button
                  onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    matrixViewMode === 'OUTLET_PIVOT'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fas fa-border-all"></i>
                  Matriks Outlet Pivot
                </button>
              </div>
            </div>

            {/* Matrix Filters: 1. Group Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <i className="fas fa-filter mr-1.5 text-cyan-400"></i>
                  Pilih Kelompok Kategori:
                </span>
                <span className="text-[10px] text-slate-500">
                  Klik kategori di bawah untuk memfilter item belanja
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'ALL', label: 'Semua Kelompok', icon: 'fa-layer-group' },
                  { id: 'SUPPLIER', label: 'Supplier Rekanan', icon: 'fa-truck' },
                  { id: 'FLOOR_ORDER', label: 'Floor Order (Internal)', icon: 'fa-boxes' },
                  { id: 'PATTY_CASH', label: 'Patty Cash OPEX', icon: 'fa-wallet' },
                  { id: 'LEDGER', label: 'Customer / Ledgers', icon: 'fa-gift' }
                ].map(grp => (
                  <button
                    key={grp.id}
                    onClick={() => {
                      setMatrixCategoryGroup(grp.id as any);
                      setMatrixSelectedCategory('ALL');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                      matrixCategoryGroup === grp.id
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md'
                        : 'bg-slate-950/70 text-slate-400 border-white/5 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <i className={`fas ${grp.icon} text-[10px]`}></i>
                    {grp.label}
                  </button>
                ))}
              </div>

              {/* Specific Category Pills */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => setMatrixSelectedCategory('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    matrixSelectedCategory === 'ALL'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow'
                      : 'bg-slate-950/40 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  Semua Kategori ({categoryDirectory.filter(c => matrixCategoryGroup === 'ALL' || c.group === matrixCategoryGroup).length})
                </button>

                {categoryDirectory
                  .filter(c => matrixCategoryGroup === 'ALL' || c.group === matrixCategoryGroup)
                  .map(cat => (
                    <button
                      key={cat.name}
                      onClick={() => setMatrixSelectedCategory(cat.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                        matrixSelectedCategory === cat.name
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow'
                          : 'bg-slate-950/40 text-slate-400 border-white/5 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-slate-300">
                        Rp {(cat.totalSpend / 1000000).toFixed(1)}M
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Search & Sort Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-2xl border border-white/5">
              <div className="relative w-full sm:w-80">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type="text"
                  value={matrixSearchQuery}
                  onChange={(e) => setMatrixSearchQuery(e.target.value)}
                  placeholder="Cari nama item, PIC, atau catatan..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
                />
                {matrixSearchQuery && (
                  <button
                    onClick={() => setMatrixSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">Urutkan:</span>
                <select
                  value={matrixSortBy}
                  onChange={(e) => setMatrixSortBy(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="COST_DESC">Nominal Belanja Tertinggi</option>
                  <option value="COST_ASC">Nominal Belanja Terendah</option>
                  <option value="QTY_DESC">Kuantitas (Qty) Terbanyak</option>
                  <option value="NAME_ASC">Nama Item (A - Z)</option>
                </select>
              </div>
            </div>

            {/* Active Filter KPI Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-cyan-500/20 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 block">
                  Total Belanja Terfilter
                </span>
                <div className="text-lg font-black text-white">
                  Rp {activeCategorySummary.totalSpend.toLocaleString('id-ID')}
                </div>
                <p className="text-[10px] text-slate-500">
                  {matrixSelectedCategory === 'ALL' ? 'Semua Kategori Aktif' : matrixSelectedCategory}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Total Kuantitas (Qty)
                </span>
                <div className="text-lg font-black text-cyan-300">
                  {activeCategorySummary.totalQty.toLocaleString('id-ID')} Unit / Pcs
                </div>
                <p className="text-[10px] text-slate-500">Akumulasi volume barang</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Jumlah Varian Item
                </span>
                <div className="text-lg font-black text-indigo-300">
                  {activeCategorySummary.uniqueItems} Varian Item
                </div>
                <p className="text-[10px] text-slate-500">Item berbeda yang dicatat</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                  Item Belanja Terbesar
                </span>
                <div className="text-sm font-black text-white truncate" title={activeCategorySummary.topItem?.name || '-'}>
                  {activeCategorySummary.topItem?.name || '-'}
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  {activeCategorySummary.topItem ? `Rp ${activeCategorySummary.topItem.totalSpend.toLocaleString('id-ID')}` : '-'}
                </p>
              </div>
            </div>

            {/* Top 5 Spending Progress Visualizer */}
            {filteredMatrixItems.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <i className="fas fa-chart-bar text-cyan-400"></i>
                    Top 5 Item Penyerap Anggaran Terbesar:
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Kontribusi terhadap total belanja terfilter
                  </span>
                </div>
                <div className="space-y-2">
                  {filteredMatrixItems.slice(0, 5).map((item, idx) => {
                    const pct = activeCategorySummary.totalSpend > 0 ? (item.totalSpend / activeCategorySummary.totalSpend) * 100 : 0;
                    return (
                      <div key={item.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-white font-medium truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-500">({item.categoryName})</span>
                          </div>
                          <div className="text-right whitespace-nowrap font-mono">
                            <span className="text-cyan-300 font-bold mr-2">Rp {item.totalSpend.toLocaleString('id-ID')}</span>
                            <span className="text-[10px] text-slate-400">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE 1: ITEM LIST & DETAILS TABLE */}
            {matrixViewMode === 'ITEM_LIST' && (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/90 shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                      <th className="py-3.5 px-4 w-12 text-center">#</th>
                      <th className="py-3.5 px-4">Nama Item Belanja</th>
                      <th className="py-3.5 px-4">Kategori & Vendor</th>
                      <th className="py-3.5 px-4 text-center">Total Qty</th>
                      <th className="py-3.5 px-4 text-right">Rata-rata Harga Satuan</th>
                      <th className="py-3.5 px-4 text-right">Total Belanja (MTD)</th>
                      <th className="py-3.5 px-4 text-center">% Share</th>
                      <th className="py-3.5 px-4 text-center">Aksi / Transaksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredMatrixItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                          Tidak ada data item belanja untuk kategori atau filter yang dipilih pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      filteredMatrixItems.map((item, index) => {
                        const catTotal = categoryDirectory.find(c => c.name === item.categoryName)?.totalSpend || item.totalSpend;
                        const catShare = catTotal > 0 ? (item.totalSpend / catTotal) * 100 : 100;
                        return (
                          <tr key={item.key} className="hover:bg-cyan-500/5 transition-colors group">
                            <td className="py-3 px-4 text-center font-mono text-slate-500 font-bold text-[11px]">
                              {index + 1}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-white group-hover:text-cyan-300 transition-colors">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span>{item.groupLabel}</span>
                                {item.transactions.length > 1 && (
                                  <span className="text-cyan-400 font-mono">• {item.transactions.length}x Transaksi</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-white/10">
                                {item.categoryName}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-slate-200">
                              {item.totalQty.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              Rp {item.avgPrice.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              {item.minPrice !== item.maxPrice && (
                                <span className="block text-[9px] text-slate-500">
                                  Min: {item.minPrice.toLocaleString('id-ID')} - Max: {item.maxPrice.toLocaleString('id-ID')}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-cyan-300 text-sm">
                              Rp {item.totalSpend.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/20">
                                {catShare.toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setSelectedItemForDetail(item)}
                                className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                              >
                                <i className="fas fa-clock-rotate-left text-[10px]"></i>
                                Detail ({item.transactions.length})
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW MODE 2: OUTLET PIVOT MATRIX TABLE */}
            {matrixViewMode === 'OUTLET_PIVOT' && (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/90 shadow-xl">
                {(() => {
                  const pivotOutlets = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet as Outlet];
                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                          <th className="py-3.5 px-4 w-12 text-center sticky left-0 bg-slate-900 z-10">#</th>
                          <th className="py-3.5 px-4 sticky left-12 bg-slate-900 z-10">Nama Item</th>
                          <th className="py-3.5 px-4">Kategori</th>
                          {pivotOutlets.map(outlet => (
                            <th key={outlet} className="py-3.5 px-4 text-right whitespace-nowrap min-w-[120px]">
                              {outlet}
                            </th>
                          ))}
                          <th className="py-3.5 px-4 text-center bg-cyan-950/40 text-cyan-300">Total Qty</th>
                          <th className="py-3.5 px-4 text-right bg-cyan-950/60 text-cyan-300 font-black">Total Belanja (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {filteredMatrixItems.length === 0 ? (
                          <tr>
                            <td colSpan={3 + pivotOutlets.length + 2} className="py-12 text-center text-slate-500 font-sans">
                              <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                              Tidak ada data item belanja untuk pivot outlet.
                            </td>
                          </tr>
                        ) : (
                          filteredMatrixItems.map((item, index) => (
                            <tr key={item.key} className="hover:bg-cyan-500/5 transition-colors">
                              <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">
                                {index + 1}
                              </td>
                              <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                                <span className="cursor-pointer hover:text-cyan-300" onClick={() => setSelectedItemForDetail(item)}>
                                  {item.name}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-sans">
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-white/10 whitespace-nowrap">
                                  {item.categoryName}
                                </span>
                              </td>
                              {pivotOutlets.map(outlet => {
                                const spend = item.outletSpend[outlet] || 0;
                                const qty = item.outletQty[outlet] || 0;
                                return (
                                  <td key={outlet} className="py-3 px-4 text-right whitespace-nowrap">
                                    {spend > 0 ? (
                                      <div>
                                        <span className="text-white font-bold">Rp {spend.toLocaleString('id-ID')}</span>
                                        <span className="block text-[9px] text-slate-500">({qty} pcs)</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-4 text-center font-bold text-slate-300 bg-cyan-950/20">
                                {item.totalQty.toLocaleString('id-ID')}
                              </td>
                              <td className="py-3 px-4 text-right font-black text-cyan-300 bg-cyan-950/30">
                                Rp {item.totalSpend.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ITEM TRANSACTION DETAIL MODAL */}
      <AnimatePresence>
        {selectedItemForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {selectedItemForDetail.categoryName}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">({selectedItemForDetail.groupLabel})</span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1">
                    {selectedItemForDetail.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="w-9 h-9 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Modal Summary KPI */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-white/5">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Belanja (MTD)</span>
                  <span className="text-base font-black text-cyan-300 font-mono">
                    Rp {selectedItemForDetail.totalSpend.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Kuantitas</span>
                  <span className="text-base font-black text-white font-mono">
                    {selectedItemForDetail.totalQty.toLocaleString('id-ID')} Unit
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Rata-rata Harga</span>
                  <span className="text-base font-black text-indigo-300 font-mono">
                    Rp {selectedItemForDetail.avgPrice.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Transaction Logs Table */}
              <div className="flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-slate-950/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3.5">Tanggal</th>
                      <th className="py-2.5 px-3.5">Outlet</th>
                      <th className="py-2.5 px-3.5 text-center">Qty</th>
                      <th className="py-2.5 px-3.5 text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3.5 text-right">Subtotal</th>
                      <th className="py-2.5 px-3.5">PIC</th>
                      <th className="py-2.5 px-3.5">Catatan / Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {selectedItemForDetail.transactions.map((tx: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3.5 text-slate-300 whitespace-nowrap">{tx.date}</td>
                        <td className="py-2.5 px-3.5 font-sans font-bold text-white whitespace-nowrap">{tx.outlet}</td>
                        <td className="py-2.5 px-3.5 text-center font-bold text-slate-200">{tx.qty}</td>
                        <td className="py-2.5 px-3.5 text-right text-slate-300">Rp {tx.price.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-3.5 text-right font-bold text-cyan-300">Rp {tx.subtotal.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-3.5 font-sans text-slate-300">{tx.pic || '-'}</td>
                        <td className="py-2.5 px-3.5 font-sans text-slate-400 text-[11px] max-w-xs truncate" title={tx.reason}>
                          {tx.reason || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end pt-2 border-t border-white/10">
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
                >
                  Tutup Rincian
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SummaryReportModule;
