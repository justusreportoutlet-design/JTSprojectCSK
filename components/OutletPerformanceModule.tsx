import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, LedgerItem, OvertimeEntry, Staff, Division } from '../types';
import { getOrderScheduleForOutlet, ORDER_SCHEDULES_BY_AREA } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  Legend,
  CartesianGrid,
  LineChart,
  Line
} from 'recharts';

interface Props {
  data: AppState;
  onUpdate: (field: keyof AppState, val: any) => void;
  filters: {
    month: string;
    year: string;
    startDate: string;
    endDate: string;
  };
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  selectedOutlet?: string;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const DIVISIONS_LIST: Division[] = ['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER'];

const OutletPerformanceModule: React.FC<Props> = ({ data, onUpdate, filters, showToast, selectedOutlet }) => {
  const selectedMonth = parseInt(filters.month);
  const selectedYear = parseInt(filters.year) || new Date().getFullYear();
  const monthPad = String(selectedMonth + 1).padStart(2, '0');
  const monthPrefix = `${selectedYear}-${monthPad}`;

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<'opex' | 'overtime' | 'belanja' | 'energy' | 'floor' | 'weekly-pettycash'>('opex');
  const [weeklyMode, setWeeklyMode] = useState<'CUTOFF' | 'CALENDAR'>('CUTOFF');

  // Interactive Contingency Budget Settings (stored locally in localStorage)
  const [belanjaLimit, setBelanjaLimit] = useState<number>(() => {
    const saved = localStorage.getItem('BELANJA_CONTINGENCY_LIMIT');
    return saved ? parseInt(saved, 10) : 35000000; // Default Rp 35 Jt
  });
  const [isEditingBelanjaLimit, setIsEditingBelanjaLimit] = useState(false);
  const [tempBelanjaLimit, setTempBelanjaLimit] = useState(String(belanjaLimit));

  const [overtimeHourLimitPerWeek, setOvertimeHourLimitPerWeek] = useState<number>(() => {
    const saved = localStorage.getItem('OVERTIME_WEEKLY_LIMIT_CREW');
    return saved ? parseFloat(saved) : 12; // Default 12 hours/week
  });
  const [isEditingOvertimeHourLimit, setIsEditingOvertimeHourLimit] = useState(false);
  const [tempOvertimeHourLimit, setTempOvertimeHourLimit] = useState(String(overtimeHourLimitPerWeek));

  const [energyRatioTarget, setEnergyRatioTarget] = useState<number>(() => {
    const saved = localStorage.getItem('ENERGY_RATIO_TARGET');
    return saved ? parseFloat(saved) : 4.0; // Default 4.0% of revenue
  });
  const [isEditingEnergyRatioTarget, setIsEditingEnergyRatioTarget] = useState(false);
  const [tempEnergyRatioTarget, setTempEnergyRatioTarget] = useState(String(energyRatioTarget));

  // --- NEW STATES FOR WEEKDAY/WEEKEND TARGET & BELANJA % COST ---
  const [weekdayTarget, setWeekdayTarget] = useState<number>(() => {
    const saved = localStorage.getItem('TARGET_REVENUE_WEEKDAY');
    return saved ? parseInt(saved, 10) : 28000000; // Default Rp 28.000.000
  });
  const [weekendTarget, setWeekendTarget] = useState<number>(() => {
    const saved = localStorage.getItem('TARGET_REVENUE_WEEKEND');
    return saved ? parseInt(saved, 10) : 45000000; // Default Rp 45.000.000
  });
  const [belanjaCostPercent, setBelanjaCostPercent] = useState<number>(() => {
    const saved = localStorage.getItem('BELANJA_COST_PERCENT');
    return saved ? parseInt(saved, 10) : 40; // Default 40%
  });
  const [overtimeBudgetPercent, setOvertimeBudgetPercent] = useState<number>(() => {
    const saved = localStorage.getItem('OVERTIME_BUDGET_PERCENT');
    return saved ? parseFloat(saved) : 1.5; // Default 1.5%
  });

  const [isEditingBelanjaTargets, setIsEditingBelanjaTargets] = useState(false);
  const [tempWeekdayTarget, setTempWeekdayTarget] = useState(String(weekdayTarget));
  const [tempWeekendTarget, setTempWeekendTarget] = useState(String(weekendTarget));
  const [tempBelanjaCostPercent, setTempBelanjaCostPercent] = useState(String(belanjaCostPercent));

  const [isEditingOvertimeBudgetPercent, setIsEditingOvertimeBudgetPercent] = useState(false);
  const [tempOvertimeBudgetPercent, setTempOvertimeBudgetPercent] = useState(String(overtimeBudgetPercent));

  const [floorRatioTarget, setFloorRatioTarget] = useState<number>(() => {
    const saved = localStorage.getItem('FLOOR_RATIO_TARGET');
    return saved ? parseFloat(saved) : 3.0; // Default 3.0% of revenue
  });
  const [isEditingFloorRatioTarget, setIsEditingFloorRatioTarget] = useState(false);
  const [tempFloorRatioTarget, setTempFloorRatioTarget] = useState(String(floorRatioTarget));

  const chemicalMatrixScrollRef = useRef<HTMLDivElement>(null);
  const scrollChemicalMatrix = (direction: 'LEFT' | 'RIGHT') => {
    if (chemicalMatrixScrollRef.current) {
      const amount = direction === 'LEFT' ? -300 : 300;
      chemicalMatrixScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // --- GENERAL MTD METRIC COMPUTATIONS ---
  
  // MTD Revenue (up to selected filters.startDate)
  const mtdRevenue = useMemo(() => {
    const dailyRecording = data.sales?.dailyRecording || {};
    let total = 0;
    Object.entries(dailyRecording).forEach(([dateStr, rec]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        total += (rec as any).revenue || 0;
      }
    });
    return total;
  }, [data.sales?.dailyRecording, monthPrefix, filters.startDate]);

  // Helper helper to sum items for keys starting with prefix, up to selected filters.startDate
  const getMTDLedgerTotal = (ledger: Record<string, LedgerItem[]> | undefined) => {
    if (!ledger) return 0;
    let total = 0;
    Object.entries(ledger).forEach(([dateStr, items]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        items.forEach(item => {
          total += (item.qty || 0) * (item.price || 0);
        });
      }
    });
    return total;
  };

  // 1. OPEX PETTY CASH SUMS
  const commodityTotal = useMemo(() => getMTDLedgerTotal(data.dailyCommodityLedger), [data.dailyCommodityLedger, monthPrefix, filters.startDate]);
  const nonCommodityTotal = useMemo(() => getMTDLedgerTotal(data.dailyNonCommodityLedger), [data.dailyNonCommodityLedger, monthPrefix, filters.startDate]);
  const assetTotal = useMemo(() => getMTDLedgerTotal(data.dailyAssetLedger), [data.dailyAssetLedger, monthPrefix, filters.startDate]);
  const atkTotal = useMemo(() => getMTDLedgerTotal(data.dailyAtkLedger), [data.dailyAtkLedger, monthPrefix, filters.startDate]);
  const casualTotal = useMemo(() => getMTDLedgerTotal(data.dailyCasualLedger), [data.dailyCasualLedger, monthPrefix, filters.startDate]);
  const thirdPartyTotal = useMemo(() => getMTDLedgerTotal(data.dailyThirdPartyLedger), [data.dailyThirdPartyLedger, monthPrefix, filters.startDate]);
  const maintenanceTotal = useMemo(() => getMTDLedgerTotal(data.dailyMaintenanceLedger), [data.dailyMaintenanceLedger, monthPrefix, filters.startDate]);

  const actualOpexTotal = commodityTotal + nonCommodityTotal + assetTotal + atkTotal + casualTotal + thirdPartyTotal + maintenanceTotal;

  // --- FLOOR ORDER EXPENSE SUMS ---
  const mainKitchenTotal = useMemo(() => getMTDLedgerTotal(data.dailyMainKitchenLedger), [data.dailyMainKitchenLedger, monthPrefix, filters.startDate]);
  const mainStoreTotal = useMemo(() => getMTDLedgerTotal(data.dailyMainStoreLedger), [data.dailyMainStoreLedger, monthPrefix, filters.startDate]);
  const chemicalTotal = useMemo(() => getMTDLedgerTotal(data.dailyChemicalLedger), [data.dailyChemicalLedger, monthPrefix, filters.startDate]);
  const guestSuppliesTotal = useMemo(() => getMTDLedgerTotal(data.dailyGuestSuppliesLedger), [data.dailyGuestSuppliesLedger, monthPrefix, filters.startDate]);
  const cashTotal = useMemo(() => getMTDLedgerTotal(data.dailyCashLedger), [data.dailyCashLedger, monthPrefix, filters.startDate]);

  const actualFloorTotal = mainKitchenTotal + mainStoreTotal + chemicalTotal + guestSuppliesTotal + cashTotal;
  const actualFloorRatio = mtdRevenue > 0 ? (actualFloorTotal / mtdRevenue) * 100 : 0;
  const floorRatioDiff = actualFloorRatio - floorRatioTarget;
  const isFloorExceeded = floorRatioTarget > 0 && actualFloorRatio > floorRatioTarget;
  const budgetPercentage = data.opexBudgetPercentage || 0;
  const opexBudgetAmount = (budgetPercentage / 100) * mtdRevenue;
  const actualOpexRatio = mtdRevenue > 0 ? (actualOpexTotal / mtdRevenue) * 100 : 0;
  const budgetRatioDiff = actualOpexRatio - budgetPercentage;

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(String(budgetPercentage));

  const handleSaveBudget = () => {
    const val = parseFloat(tempBudget);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast?.('Nilai persentase tidak valid! Harus antara 0% s.d. 100%', 'error');
      return;
    }
    onUpdate('opexBudgetPercentage', val);
    setIsEditingBudget(false);
    showToast?.(`MTD Budget OPEX berhasil diupdate menjadi ${val}% dari MTD Revenue!`, 'success');
  };

  const handleSaveBelanjaLimit = () => {
    const val = parseInt(tempBelanjaLimit, 10);
    if (isNaN(val) || val < 0) {
      showToast?.('Nilai limit tidak valid!', 'error');
      return;
    }
    setBelanjaLimit(val);
    localStorage.setItem('BELANJA_CONTINGENCY_LIMIT', String(val));
    setIsEditingBelanjaLimit(false);
    showToast?.(`Limit Kontingensi Belanja berhasil diubah menjadi Rp ${val.toLocaleString('id-ID')}`, 'success');
  };

  const handleSaveOvertimeHourLimit = () => {
    const val = parseFloat(tempOvertimeHourLimit);
    if (isNaN(val) || val < 0) {
      showToast?.('Nilai limit jam tidak valid!', 'error');
      return;
    }
    setOvertimeHourLimitPerWeek(val);
    localStorage.setItem('OVERTIME_WEEKLY_LIMIT_CREW', String(val));
    setIsEditingOvertimeHourLimit(false);
    showToast?.(`Limit Jam Lembur Mingguan Crew diubah menjadi ${val} Jam/Minggu`, 'success');
  };

  const handleSaveEnergyRatioTarget = () => {
    const val = parseFloat(tempEnergyRatioTarget);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast?.('Nilai target rasio tidak valid!', 'error');
      return;
    }
    setEnergyRatioTarget(val);
    localStorage.setItem('ENERGY_RATIO_TARGET', String(val));
    setIsEditingEnergyRatioTarget(false);
    showToast?.(`Target Rasio Energi Kontingensi berhasil diubah menjadi ${val}% dari MTD Revenue`, 'success');
  };

  const handleSaveBelanjaTargets = () => {
    const wkday = parseInt(tempWeekdayTarget, 10);
    const wkend = parseInt(tempWeekendTarget, 10);
    const costPct = parseInt(tempBelanjaCostPercent, 10);

    if (isNaN(wkday) || wkday < 0 || isNaN(wkend) || wkend < 0 || isNaN(costPct) || costPct < 0 || costPct > 100) {
      showToast?.('Nilai target atau persentase tidak valid!', 'error');
      return;
    }

    setWeekdayTarget(wkday);
    setWeekendTarget(wkend);
    setBelanjaCostPercent(costPct);

    localStorage.setItem('TARGET_REVENUE_WEEKDAY', String(wkday));
    localStorage.setItem('TARGET_REVENUE_WEEKEND', String(wkend));
    localStorage.setItem('BELANJA_COST_PERCENT', String(costPct));

    setIsEditingBelanjaTargets(false);
    showToast?.('Konfigurasi Target Revenue & Cost Belanja berhasil disimpan!', 'success');
  };

  const handleSaveOvertimeBudgetPercent = () => {
    const val = parseFloat(tempOvertimeBudgetPercent);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast?.('Nilai target tidak valid!', 'error');
      return;
    }
    setOvertimeBudgetPercent(val);
    localStorage.setItem('OVERTIME_BUDGET_PERCENT', String(val));
    setIsEditingOvertimeBudgetPercent(false);
    showToast?.(`Target Rasio Overtime Kontingensi berhasil diubah menjadi ${val}% dari MTD Revenue`, 'success');
  };

  const handleSaveFloorRatioTarget = () => {
    const val = parseFloat(tempFloorRatioTarget);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast?.('Nilai target tidak valid!', 'error');
      return;
    }
    setFloorRatioTarget(val);
    localStorage.setItem('FLOOR_RATIO_TARGET', String(val));
    setIsEditingFloorRatioTarget(false);
    showToast?.(`Target Rasio Floor Order berhasil diubah menjadi ${val}% dari MTD Revenue`, 'success');
  };

  // --- EXPENSE CATEGORY BUDGETS (Commodity, Non Commodity, Chemical, Maintenance, ATK, Asset) ---
  const categoryBudgets = useMemo(() => {
    const monthlyState = data.monthlyExpenseCategoryBudgets?.[monthPrefix];
    if (monthlyState) return monthlyState;

    if (data.expenseCategoryBudgets) return data.expenseCategoryBudgets;

    const savedLocal = localStorage.getItem(`EXPENSE_CATEGORY_BUDGETS_${monthPrefix}`);
    if (savedLocal) {
      try { return JSON.parse(savedLocal); } catch (e) { /* ignore */ }
    }

    const savedGlobal = localStorage.getItem('EXPENSE_CATEGORY_BUDGETS');
    if (savedGlobal) {
      try { return JSON.parse(savedGlobal); } catch (e) { /* ignore */ }
    }

    return {
      commodity: 0,
      nonCommodity: 0,
      chemical: 0,
      maintenance: 0,
      atk: 0,
      asset: 0,
    };
  }, [data.monthlyExpenseCategoryBudgets, data.expenseCategoryBudgets, monthPrefix]);

  const [isEditingCategoryBudgets, setIsEditingCategoryBudgets] = useState(false);
  const [tempCategoryBudgets, setTempCategoryBudgets] = useState({
    commodity: String(categoryBudgets.commodity || 0),
    nonCommodity: String(categoryBudgets.nonCommodity || 0),
    chemical: String(categoryBudgets.chemical || 0),
    maintenance: String(categoryBudgets.maintenance || 0),
    atk: String(categoryBudgets.atk || 0),
    asset: String(categoryBudgets.asset || 0),
  });

  useEffect(() => {
    if (!isEditingCategoryBudgets) {
      setTempCategoryBudgets({
        commodity: String(categoryBudgets.commodity || 0),
        nonCommodity: String(categoryBudgets.nonCommodity || 0),
        chemical: String(categoryBudgets.chemical || 0),
        maintenance: String(categoryBudgets.maintenance || 0),
        atk: String(categoryBudgets.atk || 0),
        asset: String(categoryBudgets.asset || 0),
      });
    }
  }, [categoryBudgets, isEditingCategoryBudgets]);

  const handleSaveCategoryBudgets = () => {
    const updated = {
      commodity: Math.max(0, parseFloat(tempCategoryBudgets.commodity) || 0),
      nonCommodity: Math.max(0, parseFloat(tempCategoryBudgets.nonCommodity) || 0),
      chemical: Math.max(0, parseFloat(tempCategoryBudgets.chemical) || 0),
      maintenance: Math.max(0, parseFloat(tempCategoryBudgets.maintenance) || 0),
      atk: Math.max(0, parseFloat(tempCategoryBudgets.atk) || 0),
      asset: Math.max(0, parseFloat(tempCategoryBudgets.asset) || 0),
    };

    const newMonthlyMap = {
      ...(data.monthlyExpenseCategoryBudgets || {}),
      [monthPrefix]: updated,
    };

    onUpdate('monthlyExpenseCategoryBudgets', newMonthlyMap);
    onUpdate('expenseCategoryBudgets', updated);

    localStorage.setItem(`EXPENSE_CATEGORY_BUDGETS_${monthPrefix}`, JSON.stringify(updated));
    localStorage.setItem('EXPENSE_CATEGORY_BUDGETS', JSON.stringify(updated));

    setIsEditingCategoryBudgets(false);
    showToast?.(`Budget Kategori Expense untuk periode ${MONTH_NAMES[selectedMonth]} ${selectedYear} berhasil disimpan!`, 'success');
  };

  const categoryBudgetList = useMemo(() => {
    return [
      {
        key: 'commodity',
        name: 'COMMODITY',
        budget: categoryBudgets.commodity || 0,
        spent: commodityTotal,
        icon: 'fa-box',
        color: 'text-emerald-400',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        barColor: 'bg-emerald-500',
      },
      {
        key: 'nonCommodity',
        name: 'NON COMMODITY',
        budget: categoryBudgets.nonCommodity || 0,
        spent: nonCommodityTotal,
        icon: 'fa-boxes-packing',
        color: 'text-blue-400',
        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        barColor: 'bg-blue-500',
      },
      {
        key: 'chemical',
        name: 'CHEMICAL',
        budget: categoryBudgets.chemical || 0,
        spent: chemicalTotal,
        icon: 'fa-flask',
        color: 'text-teal-400',
        badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        barColor: 'bg-teal-500',
      },
      {
        key: 'maintenance',
        name: 'MAINTENANCE',
        budget: categoryBudgets.maintenance || 0,
        spent: maintenanceTotal,
        icon: 'fa-tools',
        color: 'text-red-400',
        badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
        barColor: 'bg-red-500',
      },
      {
        key: 'atk',
        name: 'ATK',
        budget: categoryBudgets.atk || 0,
        spent: atkTotal,
        icon: 'fa-pencil-ruler',
        color: 'text-pink-400',
        badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        barColor: 'bg-pink-500',
      },
      {
        key: 'asset',
        name: 'ASSET',
        budget: categoryBudgets.asset || 0,
        spent: assetTotal,
        icon: 'fa-couch',
        color: 'text-amber-400',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        barColor: 'bg-amber-500',
      },
    ];
  }, [categoryBudgets, commodityTotal, nonCommodityTotal, chemicalTotal, maintenanceTotal, atkTotal, assetTotal]);

  // Categories definition
  const categoriesList = [
    { name: 'COMMODITY', value: commodityTotal, color: 'text-emerald-400', barColor: 'bg-emerald-500', icon: 'fa-box' },
    { name: 'NON COMMODITY', value: nonCommodityTotal, color: 'text-blue-400', barColor: 'bg-blue-500', icon: 'fa-boxes-packing' },
    { name: 'CHEMICAL', value: chemicalTotal, color: 'text-teal-400', barColor: 'bg-teal-500', icon: 'fa-flask' },
    { name: 'ASSET', value: assetTotal, color: 'text-amber-400', barColor: 'bg-amber-500', icon: 'fa-couch' },
    { name: 'ATK', value: atkTotal, color: 'text-pink-400', barColor: 'bg-pink-500', icon: 'fa-pencil-ruler' },
    { name: 'CASUAL', value: casualTotal, color: 'text-purple-400', barColor: 'bg-purple-500', icon: 'fa-user-clock' },
    { name: 'THIRD PARTY', value: thirdPartyTotal, color: 'text-cyan-400', barColor: 'bg-cyan-500', icon: 'fa-handshake' },
    { name: 'MAINTENANCE', value: maintenanceTotal, color: 'text-red-400', barColor: 'bg-red-500', icon: 'fa-tools' },
  ];

  const floorCategoriesList = useMemo(() => {
    return [
      { name: "Main Kitchen Floor Order", value: mainKitchenTotal, icon: "fa-utensils", color: "text-amber-400", barColor: "bg-amber-500" },
      { name: "Main Store Floor Order", value: mainStoreTotal, icon: "fa-store", color: "text-blue-400", barColor: "bg-blue-500" },
      { name: "Chemical Floor Order", value: chemicalTotal, icon: "fa-flask", color: "text-emerald-400", barColor: "bg-emerald-500" },
      { name: "Guest Supplies Floor Order", value: guestSuppliesTotal, icon: "fa-pump-soap", color: "text-purple-400", barColor: "bg-purple-500" },
      { name: "Cash Floor Order", value: cashTotal, icon: "fa-receipt", color: "text-indigo-400", barColor: "bg-indigo-500" },
    ];
  }, [mainKitchenTotal, mainStoreTotal, chemicalTotal, guestSuppliesTotal, cashTotal]);

  const chartCategoriesData = useMemo(() => {
    return [
      { name: 'Commodity', value: commodityTotal, fill: '#10b981' },
      { name: 'Non Com.', value: nonCommodityTotal, fill: '#3b82f6' },
      { name: 'Asset', value: assetTotal, fill: '#f59e0b' },
      { name: 'ATK', value: atkTotal, fill: '#ec4899' },
      { name: 'Casual', value: casualTotal, fill: '#8b5cf6' },
      { name: 'Third Party', value: thirdPartyTotal, fill: '#06b6d4' },
      { name: 'Maint.', value: maintenanceTotal, fill: '#ef4444' },
    ].filter(c => c.value > 0);
  }, [commodityTotal, nonCommodityTotal, assetTotal, atkTotal, casualTotal, thirdPartyTotal, maintenanceTotal]);

  const trendData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const trend = [];
    let cumulativeActual = 0;
    let cumulativeRevenue = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      let dailySpend = 0;

      const ledgers = [
        data.dailyCommodityLedger,
        data.dailyNonCommodityLedger,
        data.dailyAssetLedger,
        data.dailyAtkLedger,
        data.dailyCasualLedger,
        data.dailyThirdPartyLedger,
        data.dailyMaintenanceLedger,
      ];
      ledgers.forEach(l => {
        if (l && l[dayStr]) {
          l[dayStr].forEach(item => {
            dailySpend += (item.qty || 0) * (item.price || 0);
          });
        }
      });

      const dailyRev = data.sales?.dailyRecording?.[dayStr]?.revenue || 0;
      cumulativeActual += dailySpend;
      cumulativeRevenue += dailyRev;

      const currentCumulativeBudget = (budgetPercentage / 100) * cumulativeRevenue;

      trend.push({
        day: `${d}`,
        'Actual Spend': cumulativeActual,
        'Budget limit': currentCumulativeBudget,
      });
    }
    return trend;
  }, [data, monthPrefix, selectedMonth, selectedYear, budgetPercentage]);

  const isBudgetSet = budgetPercentage > 0;
  const isOverBudget = isBudgetSet && actualOpexRatio > budgetPercentage;
  const opexWarningThreshold = isBudgetSet && actualOpexRatio >= budgetPercentage * 0.9 && actualOpexRatio <= budgetPercentage;

  let statusText = "Budget Belum Set";
  let statusColor = "bg-slate-500/10 text-slate-400 border-slate-500/30";
  let statusBg = "from-slate-900/60 to-slate-950/60";

  if (isBudgetSet) {
    if (isOverBudget) {
      statusText = "EXCEEDED LIMIT";
      statusColor = "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse";
      statusBg = "from-red-950/20 to-slate-950/60";
    } else if (opexWarningThreshold) {
      statusText = "WARNING SHIELD";
      statusColor = "bg-amber-500/10 text-amber-400 border-amber-500/30";
      statusBg = "from-amber-950/20 to-slate-950/60";
    } else {
      statusText = "OPTIMAL / SAFE";
      statusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      statusBg = "from-emerald-950/20 to-slate-950/60";
    }
  }


  // ==========================================
  // --- 1. OVERTIME CONTINGENCY CALCULATIONS ---
  // ==========================================
  
  // Count active staff per division (from global staffList)
  const activeStaffByDivision = useMemo(() => {
    const counts: Record<string, number> = {};
    DIVISIONS_LIST.forEach(div => {
      counts[div] = 0;
    });
    
    (data.staffList || []).forEach(staff => {
      if (staff.division && (staff.status === 'ACTIVE' || !staff.status)) {
        const div = staff.division.toUpperCase();
        if (DIVISIONS_LIST.includes(div as Division)) {
          counts[div] = (counts[div] || 0) + 1;
        }
      }
    });
    return counts;
  }, [data.staffList]);

  // Aggregate overtime hours, pay and weekly distribution by division
  const overtimeSummaryByDivision = useMemo(() => {
    const summary: Record<string, { totalHours: number; totalPay: number; weeklyHours: number[] }> = {};
    
    DIVISIONS_LIST.forEach(div => {
      summary[div] = { totalHours: 0, totalPay: 0, weeklyHours: [0, 0, 0, 0, 0] }; // Week 1 to 5
    });

    Object.entries(data.dailyOvertime || {}).forEach(([dateStr, entries]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        // Calculate week of the month (1-7 = W1, 8-14 = W2, 15-21 = W3, 22-28 = W4, 29+ = W5)
        const dayNum = parseInt(dateStr.split('-')[2]);
        let weekIdx = 4; // default W5
        if (dayNum <= 7) weekIdx = 0;
        else if (dayNum <= 14) weekIdx = 1;
        else if (dayNum <= 21) weekIdx = 2;
        else if (dayNum <= 28) weekIdx = 3;

        ((entries as OvertimeEntry[]) || []).forEach(entry => {
          // Find staff to determine division
          const staff = (data.staffList || []).find(s => s.staffId === entry.staffId);
          if (staff && staff.division) {
            const div = staff.division.toUpperCase();
            if (DIVISIONS_LIST.includes(div as Division)) {
              summary[div].totalHours += entry.overtimeHours || 0;
              summary[div].totalPay += entry.overtimePay || 0;
              summary[div].weeklyHours[weekIdx] += entry.overtimeHours || 0;
            }
          }
        });
      }
    });

    return summary;
  }, [data.dailyOvertime, data.staffList, monthPrefix, filters.startDate]);

  // Total overtime costs and hours MTD
  const overtimeMtdGrandTotals = useMemo(() => {
    let totalHours = 0;
    let totalPay = 0;
    DIVISIONS_LIST.forEach(div => {
      totalHours += overtimeSummaryByDivision[div]?.totalHours || 0;
      totalPay += overtimeSummaryByDivision[div]?.totalPay || 0;
    });
    return { totalHours, totalPay };
  }, [overtimeSummaryByDivision]);

  // Staff-level weekly overtime tracking to flag high risk crew (exceeding weekly limit)
  const highRiskOvertimeCrew = useMemo(() => {
    const crewOvertimeMap: Record<string, { name: string; division: string; weeklyHours: number[] }> = {};

    Object.entries(data.dailyOvertime || {}).forEach(([dateStr, entries]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        const dayNum = parseInt(dateStr.split('-')[2]);
        let weekIdx = 4;
        if (dayNum <= 7) weekIdx = 0;
        else if (dayNum <= 14) weekIdx = 1;
        else if (dayNum <= 21) weekIdx = 2;
        else if (dayNum <= 28) weekIdx = 3;

        ((entries as OvertimeEntry[]) || []).forEach(entry => {
          const staff = (data.staffList || []).find(s => s.staffId === entry.staffId);
          if (staff) {
            const key = staff.staffId;
            if (!crewOvertimeMap[key]) {
              crewOvertimeMap[key] = {
                name: staff.name,
                division: staff.division || 'SERVICE',
                weeklyHours: [0, 0, 0, 0, 0]
              };
            }
            crewOvertimeMap[key].weeklyHours[weekIdx] += entry.overtimeHours || 0;
          }
        });
      }
    });

    // Filter to find crew who exceeded the limit in any week
    return Object.entries(crewOvertimeMap)
      .map(([staffId, c]) => {
        const maxWeekHours = Math.max(...c.weeklyHours);
        const totalMtdHours = c.weeklyHours.reduce((sum, h) => sum + h, 0);
        return {
          staffId,
          name: c.name,
          division: c.division,
          weeklyHours: c.weeklyHours,
          maxWeekHours,
          totalMtdHours,
          exceeded: maxWeekHours > overtimeHourLimitPerWeek
        };
      })
      .filter(item => item.exceeded)
      .sort((a, b) => b.maxWeekHours - a.maxWeekHours);
  }, [data.dailyOvertime, data.staffList, monthPrefix, filters.startDate, overtimeHourLimitPerWeek]);

  // Chart data for weekly overtime breakdown by division
  const overtimeWeeklyChartData = useMemo(() => {
    const weeks = ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Minggu 5"];
    return weeks.map((w, idx) => {
      const row: any = { week: w };
      DIVISIONS_LIST.forEach(div => {
        row[div] = Math.round((overtimeSummaryByDivision[div]?.weeklyHours[idx] || 0) * 10) / 10;
      });
      return row;
    });
  }, [overtimeSummaryByDivision]);


  // ==========================================
  // --- 2. CONTINGENCY BELANJA (PROCUREMENT) ---
  // ==========================================
  
  // Supplier spend totals
  const ikigaiTotal = useMemo(() => getMTDLedgerTotal(data.dailyIkigaiLedger), [data.dailyIkigaiLedger, monthPrefix, filters.startDate]);
  const panfilaTotal = useMemo(() => getMTDLedgerTotal(data.dailyPanfilaLedger), [data.dailyPanfilaLedger, monthPrefix, filters.startDate]);
  const everestTotal = useMemo(() => getMTDLedgerTotal(data.dailyEverestLedger), [data.dailyEverestLedger, monthPrefix, filters.startDate]);
  const saungKubilTotal = useMemo(() => getMTDLedgerTotal(data.dailySaungKubilLedger), [data.dailySaungKubilLedger, monthPrefix, filters.startDate]);
  const tgifTotal = useMemo(() => getMTDLedgerTotal(data.dailyTgifLedger), [data.dailyTgifLedger, monthPrefix, filters.startDate]);
  const sukandaTotal = useMemo(() => getMTDLedgerTotal(data.dailySukandaLedger), [data.dailySukandaLedger, monthPrefix, filters.startDate]);
  const kebunkuTotal = useMemo(() => getMTDLedgerTotal((data as any).dailyKebunkuLedger), [data.dailyKebunkuLedger, monthPrefix, filters.startDate]);

  const totalSupplierSpend = ikigaiTotal + panfilaTotal + everestTotal + saungKubilTotal + tgifTotal + sukandaTotal + kebunkuTotal;
  const grandTotalBelanja = actualOpexTotal + totalSupplierSpend;
  const isBelanjaExceeded = grandTotalBelanja > belanjaLimit;

  // Supplier list for breakdown representation
  const supplierSpendList = [
    { name: 'TGIF', value: tgifTotal, color: 'text-amber-400', fill: '#f59e0b' },
    { name: 'SUKANDA', value: sukandaTotal, color: 'text-indigo-400', fill: '#6366f1' },
    { name: 'EVEREST', value: everestTotal, color: 'text-rose-400', fill: '#f43f5e' },
    { name: 'IKIGAI', value: ikigaiTotal, color: 'text-emerald-400', fill: '#10b981' },
    { name: 'PANFILA', value: panfilaTotal, color: 'text-purple-400', fill: '#a855f7' },
    { name: 'SAUNG KUBIL', value: saungKubilTotal, color: 'text-cyan-400', fill: '#06b6d4' },
    { name: 'KEBUNKU', value: kebunkuTotal, color: 'text-lime-400', fill: '#84cc16' },
  ];

  const suppliersChartData = useMemo(() => {
    return supplierSpendList.filter(s => s.value > 0);
  }, [tgifTotal, sukandaTotal, everestTotal, ikigaiTotal, panfilaTotal, saungKubilTotal, kebunkuTotal]);

  // Find "High Spends" for financial control (item unit price * qty >= Rp 1.000.000)
  const highValueBelanjaItems = useMemo(() => {
    const itemsList: { date: string; category: string; name: string; qty: number; price: number; total: number; pic: string; reason: string }[] = [];

    const ledgersConfig = [
      { key: 'dailyCommodityLedger', name: 'COMMODITY' },
      { key: 'dailyNonCommodityLedger', name: 'NON-COMMODITY' },
      { key: 'dailyAssetLedger', name: 'ASSET' },
      { key: 'dailyAtkLedger', name: 'ATK' },
      { key: 'dailyCasualLedger', name: 'CASUAL STAFF' },
      { key: 'dailyThirdPartyLedger', name: 'THIRD PARTY' },
      { key: 'dailyMaintenanceLedger', name: 'MAINTENANCE' },
      { key: 'dailyIkigaiLedger', name: 'SUPPLIER IKIGAI' },
      { key: 'dailyPanfilaLedger', name: 'SUPPLIER PANFILA' },
      { key: 'dailyEverestLedger', name: 'SUPPLIER EVEREST' },
      { key: 'dailySaungKubilLedger', name: 'SUPPLIER SAUNG KUBIL' },
      { key: 'dailyTgifLedger', name: 'SUPPLIER TGIF' },
      { key: 'dailySukandaLedger', name: 'SUPPLIER SUKANDA' },
      { key: 'dailyKebunkuLedger', name: 'SUPPLIER KEBUNKU' },
    ];

    ledgersConfig.forEach(ledger => {
      const dailyMap = data[ledger.key as keyof AppState] as Record<string, LedgerItem[]>;
      if (dailyMap) {
        Object.entries(dailyMap).forEach(([dateStr, items]) => {
          if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
            (items || []).forEach(item => {
              const total = (item.qty || 0) * (item.price || 0);
              if (total >= 1000000) { // Rp 1.000.000 Threshold
                itemsList.push({
                  date: dateStr,
                  category: ledger.name,
                  name: item.name,
                  qty: item.qty,
                  price: item.price,
                  total,
                  pic: item.pic || '-',
                  reason: item.reason || '-'
                });
              }
            });
          }
        });
      }
    });

    return itemsList.sort((a, b) => b.total - a.total);
  }, [data, monthPrefix, filters.startDate]);


  // ==========================================
  // --- 3. CONTINGENCY ENERGY COST ----------
  // ==========================================
  
  const mtdEnergySum = useMemo(() => {
    let electricity = 0;
    let water = 0;
    let gas = 0;

    let elecKwh = 0;
    let waterM3 = 0;
    let gasM3 = 0;

    Object.entries(data.expenses || {}).forEach(([dateStr, rawExp]) => {
      const exp = rawExp as any;
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        electricity += exp.electricity || 0;
        water += exp.water || 0;
        gas += exp.gas || 0;

        // kwh consumed estimatons
        const elecLwbp = Math.max(0, (exp.elecLwbpClose || 0) - (exp.elecLwbpOpen || 0));
        const elecWbp = Math.max(0, (exp.elecwbpClose || 0) - (exp.elecwbpOpen || 0));
        elecKwh += elecLwbp + elecWbp;

        // water m3 consumed estimatons
        waterM3 += Math.max(0, (exp.waterClose || 0) - (exp.waterOpen || 0));

        // gas m3 consumed estimatons
        gasM3 += Math.max(0, (exp.gasClose || 0) - (exp.gasOpen || 0));
      }
    });

    const totalCost = electricity + water + gas;
    const ratioOfRevenue = mtdRevenue > 0 ? (totalCost / mtdRevenue) * 100 : 0;

    return {
      electricity,
      water,
      gas,
      elecKwh,
      waterM3,
      gasM3,
      totalCost,
      ratioOfRevenue
    };
  }, [data.expenses, monthPrefix, filters.startDate, mtdRevenue]);

  // Energy daily trend data
  const energyDailyTrend = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const trend = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const exp = (data.expenses?.[dayStr] || {}) as any;
      
      trend.push({
        day: `${d}`,
        'Listrik (Rp)': exp.electricity || 0,
        'Air (Rp)': exp.water || 0,
        'Gas (Rp)': exp.gas || 0,
        'Total Energi (Rp)': (exp.electricity || 0) + (exp.water || 0) + (exp.gas || 0)
      });
    }
    return trend;
  }, [data.expenses, monthPrefix, selectedMonth, selectedYear]);

  // Floor order daily trend data
  const floorDailyTrend = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const trend = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      
      const getDayTotal = (ledger: Record<string, LedgerItem[]> | undefined) => {
        if (!ledger || !ledger[dayStr]) return 0;
        return ledger[dayStr].reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);
      };

      const kitchenVal = getDayTotal(data.dailyMainKitchenLedger);
      const storeVal = getDayTotal(data.dailyMainStoreLedger);
      const chemicalVal = getDayTotal(data.dailyChemicalLedger);
      const guestVal = getDayTotal(data.dailyGuestSuppliesLedger);
      const cashVal = getDayTotal(data.dailyCashLedger);

      trend.push({
        day: `${d}`,
        'Main Kitchen (Rp)': kitchenVal,
        'Main Store (Rp)': storeVal,
        'Chemical (Rp)': chemicalVal,
        'Guest Supplies (Rp)': guestVal,
        'Cash / Other (Rp)': cashVal,
        'Total Floor Order (Rp)': kitchenVal + storeVal + chemicalVal + guestVal + cashVal
      });
    }
    return trend;
  }, [data, monthPrefix, selectedMonth, selectedYear]);

  // Monthly Floor Ledger Entries Log
  const monthlyFloorLedgerEntries = useMemo(() => {
    const entries: { date: string; category: string; item: string; qty: number; price: number; total: number }[] = [];
    const ledgers = [
      { key: 'Main Kitchen', ledger: data.dailyMainKitchenLedger },
      { key: 'Main Store', ledger: data.dailyMainStoreLedger },
      { key: 'Chemical', ledger: data.dailyChemicalLedger },
      { key: 'Guest Supplies', ledger: data.dailyGuestSuppliesLedger },
      { key: 'Cash / Other', ledger: data.dailyCashLedger },
    ];

    ledgers.forEach(({ key, ledger }) => {
      if (!ledger) return;
      Object.entries(ledger).forEach(([dateStr, items]) => {
        if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
          (items as LedgerItem[]).forEach(item => {
            entries.push({
              date: dateStr,
              category: key,
              item: item.name,
              qty: item.qty || 0,
              price: item.price || 0,
              total: (item.qty || 0) * (item.price || 0)
            });
          });
        }
      });
    });

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [data, monthPrefix, filters.startDate]);

  // --- NEW CHEMICAL MATRIX DATA ---
  const chemicalMatrixData = useMemo(() => {
    const itemsMap: Record<string, { name: string; dailyQty: Record<number, number>; totalQty: number; totalCost: number }> = {};
    
    if (!data.dailyChemicalLedger) return [];

    Object.entries(data.dailyChemicalLedger).forEach(([dateStr, items]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= filters.startDate) {
        const day = parseInt(dateStr.split('-')[2], 10);
        if (isNaN(day)) return;

        ((items || []) as LedgerItem[]).forEach(item => {
          const nameKey = (item.name || '').trim();
          if (!nameKey) return;

          if (!itemsMap[nameKey]) {
            itemsMap[nameKey] = {
              name: nameKey,
              dailyQty: {},
              totalQty: 0,
              totalCost: 0
            };
          }

          const qty = item.qty !== undefined && item.qty !== null ? Number(item.qty) : 1;
          const cost = qty * (item.price || 0);

          itemsMap[nameKey].dailyQty[day] = (itemsMap[nameKey].dailyQty[day] || 0) + qty;
          itemsMap[nameKey].totalQty += qty;
          itemsMap[nameKey].totalCost += cost;
        });
      }
    });

    return Object.values(itemsMap).sort((a, b) => b.totalCost - a.totalCost);
  }, [data.dailyChemicalLedger, monthPrefix, filters.startDate]);

  // --- WEEKLY PETTY CASH EXPENSE & BUDGET EFFICIENCY CALCULATIONS ---
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;

  const weeklyPettyCashReport = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0');

    const buildWeekRanges = (mIdx: number, yr: number, mode: 'CUTOFF' | 'CALENDAR') => {
      const weeks: { weekNum: number; weekName: string; dateLabel: string; days: string[] }[] = [];

      if (mode === 'CUTOFF') {
        // Cutoff month: 26th of prev month to 25th of current month
        const prevMIdx = mIdx === 0 ? 11 : mIdx - 1;
        const prevYr = mIdx === 0 ? yr - 1 : yr;
        const prevLastDay = new Date(prevYr, prevMIdx + 1, 0).getDate();

        // W1: 26 to prevLastDay of prev month
        const w1Days: string[] = [];
        for (let d = 26; d <= prevLastDay; d++) {
          w1Days.push(`${prevYr}-${pad2(prevMIdx + 1)}-${pad2(d)}`);
        }
        weeks.push({
          weekNum: 1,
          weekName: "Minggu 1",
          dateLabel: `26 ${MONTH_NAMES[prevMIdx].slice(0, 3)} - ${prevLastDay} ${MONTH_NAMES[prevMIdx].slice(0, 3)}`,
          days: w1Days,
        });

        // W2: 01 to 07 of current month
        const w2Days: string[] = [];
        for (let d = 1; d <= 7; d++) {
          w2Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        }
        weeks.push({
          weekNum: 2,
          weekName: "Minggu 2",
          dateLabel: `01 ${MONTH_NAMES[mIdx].slice(0, 3)} - 07 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w2Days,
        });

        // W3: 08 to 14 of current month
        const w3Days: string[] = [];
        for (let d = 8; d <= 14; d++) {
          w3Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        }
        weeks.push({
          weekNum: 3,
          weekName: "Minggu 3",
          dateLabel: `08 ${MONTH_NAMES[mIdx].slice(0, 3)} - 14 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w3Days,
        });

        // W4: 15 to 21 of current month
        const w4Days: string[] = [];
        for (let d = 15; d <= 21; d++) {
          w4Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        }
        weeks.push({
          weekNum: 4,
          weekName: "Minggu 4",
          dateLabel: `15 ${MONTH_NAMES[mIdx].slice(0, 3)} - 21 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w4Days,
        });

        // W5: 22 to 25 of current month
        const w5Days: string[] = [];
        for (let d = 22; d <= 25; d++) {
          w5Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        }
        weeks.push({
          weekNum: 5,
          weekName: "Minggu 5",
          dateLabel: `22 ${MONTH_NAMES[mIdx].slice(0, 3)} - 25 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w5Days,
        });
      } else {
        // Calendar mode: 1st to end of month
        const lastDay = new Date(yr, mIdx + 1, 0).getDate();

        // W1: 1 - 7
        const w1Days: string[] = [];
        for (let d = 1; d <= 7; d++) w1Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        weeks.push({
          weekNum: 1,
          weekName: "Minggu 1",
          dateLabel: `01 ${MONTH_NAMES[mIdx].slice(0, 3)} - 07 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w1Days,
        });

        // W2: 8 - 14
        const w2Days: string[] = [];
        for (let d = 8; d <= 14; d++) w2Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        weeks.push({
          weekNum: 2,
          weekName: "Minggu 2",
          dateLabel: `08 ${MONTH_NAMES[mIdx].slice(0, 3)} - 14 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w2Days,
        });

        // W3: 15 - 21
        const w3Days: string[] = [];
        for (let d = 15; d <= 21; d++) w3Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        weeks.push({
          weekNum: 3,
          weekName: "Minggu 3",
          dateLabel: `15 ${MONTH_NAMES[mIdx].slice(0, 3)} - 21 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w3Days,
        });

        // W4: 22 - 28
        const w4Days: string[] = [];
        for (let d = 22; d <= 28; d++) w4Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        weeks.push({
          weekNum: 4,
          weekName: "Minggu 4",
          dateLabel: `22 ${MONTH_NAMES[mIdx].slice(0, 3)} - 28 ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w4Days,
        });

        // W5: 29 - lastDay
        const w5Days: string[] = [];
        for (let d = 29; d <= lastDay; d++) w5Days.push(`${yr}-${pad2(mIdx + 1)}-${pad2(d)}`);
        weeks.push({
          weekNum: 5,
          weekName: "Minggu 5",
          dateLabel: `29 ${MONTH_NAMES[mIdx].slice(0, 3)} - ${lastDay} ${MONTH_NAMES[mIdx].slice(0, 3)}`,
          days: w5Days,
        });
      }

      return weeks;
    };

    const currentWeeks = buildWeekRanges(selectedMonth, selectedYear, weeklyMode);
    const lastWeeks = buildWeekRanges(lastMonthIdx, lastMonthYear, weeklyMode);

    const computeTotalsForDays = (days: string[]) => {
      let opex = 0;
      let floor = 0;
      let overtime = 0;
      let revenue = 0;

      const opexLedgers = [
        data.dailyCommodityLedger,
        data.dailyNonCommodityLedger,
        data.dailyAssetLedger,
        data.dailyAtkLedger,
        data.dailyCasualLedger,
        data.dailyThirdPartyLedger,
        data.dailyMaintenanceLedger,
      ];

      const floorLedgers = [
        data.dailyMainKitchenLedger,
        data.dailyMainStoreLedger,
        data.dailyChemicalLedger,
        data.dailyGuestSuppliesLedger,
        data.dailyCashLedger,
      ];

      days.forEach((dayStr) => {
        // OPEX
        opexLedgers.forEach((l) => {
          if (l && l[dayStr]) {
            l[dayStr].forEach((item) => {
              opex += (item.qty || 0) * (item.price || 0);
            });
          }
        });

        // Floor Order
        floorLedgers.forEach((l) => {
          if (l && l[dayStr]) {
            l[dayStr].forEach((item) => {
              floor += (item.qty || 0) * (item.price || 0);
            });
          }
        });

        // Overtime
        if (data.dailyOvertime && data.dailyOvertime[dayStr]) {
          data.dailyOvertime[dayStr].forEach((entry) => {
            overtime += entry.overtimePay || 0;
          });
        }

        // Revenue
        revenue += data.sales?.dailyRecording?.[dayStr]?.revenue || 0;
      });

      const totalPettyCash = opex + floor + overtime;
      const ratio = revenue > 0 ? (totalPettyCash / revenue) * 100 : 0;

      return { opex, floor, overtime, totalPettyCash, revenue, ratio };
    };

    const totalTargetPercent = (data.opexBudgetPercentage || 0) + floorRatioTarget + overtimeBudgetPercent;

    const weeklyRows = currentWeeks.map((curW, idx) => {
      const lastW = lastWeeks[idx] || { weekNum: idx + 1, weekName: `Minggu ${idx + 1}`, dateLabel: "-", days: [] };

      const cur = computeTotalsForDays(curW.days);
      const last = computeTotalsForDays(lastW.days);

      const opexBudget = (cur.revenue * (data.opexBudgetPercentage || 0)) / 100;
      const floorBudget = (cur.revenue * floorRatioTarget) / 100;
      const otBudget = (cur.revenue * overtimeBudgetPercent) / 100;
      const totalBudget = (cur.revenue * totalTargetPercent) / 100;

      // Efficiency is calculated from previous month expense minus current month expense (Positive = Hemat/Efisien, Negative = Meningkat/Over)
      const efficiencyOpex = last.opex - cur.opex;
      const efficiencyFloor = last.floor - cur.floor;
      const efficiencyOt = last.overtime - cur.overtime;
      const efficiencyTotal = last.totalPettyCash - cur.totalPettyCash;

      const variancePettyCash = cur.totalPettyCash - last.totalPettyCash;
      const variancePct = last.totalPettyCash > 0 ? (variancePettyCash / last.totalPettyCash) * 100 : 0;

      const varianceRev = cur.revenue - last.revenue;
      const varianceRevPct = last.revenue > 0 ? (varianceRev / last.revenue) * 100 : 0;

      return {
        weekNum: curW.weekNum,
        weekName: curW.weekName,
        curDateLabel: curW.dateLabel,
        lastDateLabel: lastW.dateLabel,
        cur,
        last,
        opexBudget,
        floorBudget,
        otBudget,
        totalBudget,
        efficiencyOpex,
        efficiencyFloor,
        efficiencyOt,
        efficiencyTotal,
        variancePettyCash,
        variancePct,
        varianceRev,
        varianceRevPct,
      };
    });

    // Calculate MTD Totals
    const mtdCur = {
      opex: weeklyRows.reduce((sum, r) => sum + r.cur.opex, 0),
      floor: weeklyRows.reduce((sum, r) => sum + r.cur.floor, 0),
      overtime: weeklyRows.reduce((sum, r) => sum + r.cur.overtime, 0),
      totalPettyCash: weeklyRows.reduce((sum, r) => sum + r.cur.totalPettyCash, 0),
      revenue: weeklyRows.reduce((sum, r) => sum + r.cur.revenue, 0),
      ratio: 0,
    };
    mtdCur.ratio = mtdCur.revenue > 0 ? (mtdCur.totalPettyCash / mtdCur.revenue) * 100 : 0;

    const mtdLast = {
      opex: weeklyRows.reduce((sum, r) => sum + r.last.opex, 0),
      floor: weeklyRows.reduce((sum, r) => sum + r.last.floor, 0),
      overtime: weeklyRows.reduce((sum, r) => sum + r.last.overtime, 0),
      totalPettyCash: weeklyRows.reduce((sum, r) => sum + r.last.totalPettyCash, 0),
      revenue: weeklyRows.reduce((sum, r) => sum + r.last.revenue, 0),
      ratio: 0,
    };
    mtdLast.ratio = mtdLast.revenue > 0 ? (mtdLast.totalPettyCash / mtdLast.revenue) * 100 : 0;

    const mtdTotalBudget = (mtdCur.revenue * totalTargetPercent) / 100;
    const mtdEfficiencyTotal = mtdLast.totalPettyCash - mtdCur.totalPettyCash;
    const mtdEfficiencyOpex = mtdLast.opex - mtdCur.opex;
    const mtdEfficiencyFloor = mtdLast.floor - mtdCur.floor;
    const mtdEfficiencyOt = mtdLast.overtime - mtdCur.overtime;
    const mtdVariancePettyCash = mtdCur.totalPettyCash - mtdLast.totalPettyCash;
    const mtdVariancePct = mtdLast.totalPettyCash > 0 ? (mtdVariancePettyCash / mtdLast.totalPettyCash) * 100 : 0;

    return {
      weeklyRows,
      mtdCur,
      mtdLast,
      totalTargetPercent,
      mtdTotalBudget,
      mtdEfficiencyTotal,
      mtdEfficiencyOpex,
      mtdEfficiencyFloor,
      mtdEfficiencyOt,
      mtdVariancePettyCash,
      mtdVariancePct,
    };
  }, [
    data,
    selectedMonth,
    selectedYear,
    weeklyMode,
    lastMonthIdx,
    lastMonthYear,
    floorRatioTarget,
    overtimeBudgetPercent,
  ]);

  // --- NEW CONTINGENCY CALCULATIONS & HELPERS ---
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const getDailySpendByDivision = (dayStr: string) => {
    let kitchen = 0;
    let bar = 0;
    let service = 0;

    // Kitchen Ledgers
    const kitchenLedgers = [
      data.dailyCommodityLedger,
      data.dailyIkigaiLedger,
      data.dailyPanfilaLedger,
      data.dailySaungKubilLedger,
      data.dailySukandaLedger,
      (data as any).dailyKebunkuLedger
    ];
    kitchenLedgers.forEach(l => {
      if (l && l[dayStr]) {
        l[dayStr].forEach(item => {
          kitchen += (item.qty || 0) * (item.price || 0);
        });
      }
    });

    // Bar Ledgers
    const barLedgers = [
      data.dailyEverestLedger,
      data.dailyTgifLedger
    ];
    barLedgers.forEach(l => {
      if (l && l[dayStr]) {
        l[dayStr].forEach(item => {
          bar += (item.qty || 0) * (item.price || 0);
        });
      }
    });

    // Service Ledgers
    const serviceLedgers = [
      data.dailyNonCommodityLedger,
      data.dailyAssetLedger,
      data.dailyAtkLedger,
      data.dailyCasualLedger,
      data.dailyThirdPartyLedger,
      data.dailyMaintenanceLedger
    ];
    serviceLedgers.forEach(l => {
      if (l && l[dayStr]) {
        l[dayStr].forEach(item => {
          service += (item.qty || 0) * (item.price || 0);
        });
      }
    });

    return { kitchen, bar, service, total: kitchen + bar + service };
  };

  const targetRevenueStats = useMemo(() => {
    const monthlyTargetFromOutlet = data.sales?.monthlyBudgets?.[monthPrefix] || data.sales?.budgetRevenue || 0;
    let mtdTarget = 0;
    let calculatedTarget = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const [year, monthVal, dayVal] = dayStr.split('-').map(Number);
      const date = new Date(year, monthVal - 1, dayVal);
      const dayOfWeek = date.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const dayTarget = isWeekend ? weekendTarget : weekdayTarget;
      
      calculatedTarget += dayTarget;
      if (dayStr <= filters.startDate) {
        mtdTarget += dayTarget;
      }
    }
    
    const fullMonthTarget = monthlyTargetFromOutlet > 0 ? monthlyTargetFromOutlet : calculatedTarget;
    
    return { mtdTarget, fullMonthTarget };
  }, [monthPrefix, daysInMonth, filters.startDate, weekdayTarget, weekendTarget, data.sales]);

  const mtdActualSpendsByDivision = useMemo(() => {
    let kitchen = 0;
    let bar = 0;
    let service = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const daily = getDailySpendByDivision(dayStr);
      kitchen += daily.kitchen;
      bar += daily.bar;
      service += daily.service;
    }
    return { kitchen, bar, service, total: kitchen + bar + service };
  }, [monthPrefix, daysInMonth, data]);

  const outletOrderSchedule = useMemo(() => {
    return getOrderScheduleForOutlet(selectedOutlet || data.outlet || '');
  }, [selectedOutlet, data.outlet]);

  const deliveryCycles = useMemo(() => {
    const cyclesMap: Record<string, {
      dateStr: string;
      dayOfWeekName: string;
      coveredDays: string[];
      totalTargetRevenue: number;
      basisRevenue: number;
      belanjaBudget: number;
      kitchenBudget: number;
      barBudget: number;
      serviceBudget: number;
    }> = {};

    const orderDayIndices = outletOrderSchedule.dayIndices;
    // Check if Tuesday(2), Thursday(4), Saturday(6) schedule (Jakarta, Bekasi, Cibubur)
    const isTueThuSat = orderDayIndices.includes(2) && orderDayIndices.includes(4) && orderDayIndices.includes(6);

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const [year, monthVal, dayVal] = dayStr.split('-').map(Number);
      const date = new Date(year, monthVal - 1, dayVal);
      const dayOfWeek = date.getDay();

      // Determine target revenue for this day
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const dayTarget = isWeekend ? weekendTarget : weekdayTarget;

      let deliveryDate: Date;
      let dayOfWeekName: string;

      if (isTueThuSat) {
        // Jakarta / Bekasi / Cibubur: Selasa, Kamis, Sabtu
        if (dayOfWeek === 2 || dayOfWeek === 3) {
          // Tue, Wed -> Delivery Tuesday
          const offset = dayOfWeek - 2;
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Selasa';
        } else if (dayOfWeek === 4 || dayOfWeek === 5) {
          // Thu, Fri -> Delivery Thursday
          const offset = dayOfWeek - 4;
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Kamis';
        } else {
          // Sat(6), Sun(0), Mon(1) -> Delivery Saturday
          const offset = dayOfWeek === 6 ? 0 : (dayOfWeek === 0 ? 1 : 2);
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Sabtu';
        }
      } else {
        // Tanggerang: Senin, Rabu, Jumat
        if (dayOfWeek === 1 || dayOfWeek === 2) {
          // Mon, Tue -> Delivery Monday
          const offset = dayOfWeek - 1;
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Senin';
        } else if (dayOfWeek === 3 || dayOfWeek === 4) {
          // Wed, Thu -> Delivery Wednesday
          const offset = dayOfWeek - 3;
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Rabu';
        } else {
          // Fri(5), Sat(6), Sun(0) -> Delivery Friday
          const offset = dayOfWeek === 5 ? 0 : (dayOfWeek === 6 ? 1 : 2);
          deliveryDate = new Date(year, monthVal - 1, d - offset);
          dayOfWeekName = 'Jumat';
        }
      }

      const dy = deliveryDate.getFullYear();
      const dm = String(deliveryDate.getMonth() + 1).padStart(2, '0');
      const dd = String(deliveryDate.getDate()).padStart(2, '0');
      const deliveryDateStr = `${dy}-${dm}-${dd}`;

      if (!cyclesMap[deliveryDateStr]) {
        cyclesMap[deliveryDateStr] = {
          dateStr: deliveryDateStr,
          dayOfWeekName,
          coveredDays: [],
          totalTargetRevenue: 0,
          basisRevenue: 0,
          belanjaBudget: 0,
          kitchenBudget: 0,
          barBudget: 0,
          serviceBudget: 0
        };
      }

      cyclesMap[deliveryDateStr].coveredDays.push(dayStr);
      cyclesMap[deliveryDateStr].totalTargetRevenue += dayTarget;
    }

    // Convert to array, map actual revenue, check started/completed status, and sort
    let cyclesList = Object.values(cyclesMap).map(cycle => {
      // Calculate actual revenue from dailyRecording
      const actualRevenue = cycle.coveredDays.reduce((sum, dayStr) => {
        return sum + (data.sales?.dailyRecording?.[dayStr]?.revenue || 0);
      }, 0);

      // A cycle is past/active if any of its covered days are past or equal to the selected date
      const isPastOrActive = cycle.coveredDays.some(dayStr => dayStr <= filters.startDate);

      const shortfall = isPastOrActive ? Math.max(0, cycle.totalTargetRevenue - actualRevenue) : 0;
      // Reduction is based on shortfall (shortfall * 0.8 * percentage / 100)
      const budgetReduction = shortfall * 0.8 * (belanjaCostPercent / 100);

      return {
        ...cycle,
        actualRevenue,
        shortfall,
        budgetReduction,
        isPastOrActive
      };
    });

    // Sort cycles by date chronologically
    cyclesList = cyclesList.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    // Secondary pass: Calculate adjusted budgets by carrying forward previous cycle's budget reduction
    let previousReduction = 0;
    const finalCycles = cyclesList.map((cycle) => {
      const basisRevenue = cycle.totalTargetRevenue * 0.8;
      const standardBelanjaBudget = basisRevenue * (belanjaCostPercent / 100);

      const appliedReduction = previousReduction;
      const belanjaBudget = Math.max(0, standardBelanjaBudget - appliedReduction);

      const kitchenBudget = belanjaBudget * 0.70;
      const barBudget = belanjaBudget * 0.20;
      const serviceBudget = belanjaBudget * 0.10;

      // Calculate actual spends for covered days
      let actualKitchen = 0;
      let actualBar = 0;
      let actualService = 0;

      cycle.coveredDays.forEach(dayStr => {
        const dailySpend = getDailySpendByDivision(dayStr);
        actualKitchen += dailySpend.kitchen;
        actualBar += dailySpend.bar;
        actualService += dailySpend.service;
      });

      const actualTotal = actualKitchen + actualBar + actualService;

      // Update previousReduction for the next cycle
      previousReduction = cycle.budgetReduction;

      return {
        ...cycle,
        basisRevenue,
        standardBelanjaBudget,
        appliedReduction,
        belanjaBudget,
        kitchenBudget,
        barBudget,
        serviceBudget,
        actualKitchen,
        actualBar,
        actualService,
        actualTotal
      };
    });

    return finalCycles;
  }, [monthPrefix, daysInMonth, weekdayTarget, weekendTarget, belanjaCostPercent, data, filters.startDate, outletOrderSchedule]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="glass-card bg-gradient-to-r from-slate-950 to-indigo-950/40 border-white/10 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="p-3 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
                <i className="fas fa-chart-line text-lg"></i>
              </span>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">OUTLET PERFORMANCE</h2>
                <div className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <span>ANALISA RATIO & KONTINGENSI BIAYA</span>
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  <span className="text-indigo-400">{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-400 bg-slate-900/60 p-1 border border-white/5 rounded-2xl">
            <button
              onClick={() => setActiveTab('opex')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'opex' 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-wallet"></i> Petty Cash
            </button>
            <button
              onClick={() => setActiveTab('overtime')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'overtime' 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-user-clock"></i> Overtime Guard
            </button>
            <button
              onClick={() => setActiveTab('belanja')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'belanja' 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-shopping-basket"></i> Belanja Spends
            </button>
            <button
              onClick={() => setActiveTab('energy')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'energy' 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-bolt"></i> Energy Cost
            </button>
            <button
              onClick={() => setActiveTab('floor')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'floor' 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <i className="fas fa-boxes-packing"></i> Floor Order
            </button>
            <button
              onClick={() => setActiveTab('weekly-pettycash')}
              className={`px-4 py-2 rounded-xl transition-all uppercase text-[10px] tracking-widest font-black cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'weekly-pettycash' 
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'hover:text-white hover:bg-white/5 text-emerald-400'
              }`}
            >
              <i className="fas fa-file-invoice-dollar"></i> Weekly Petty Cash
            </button>
          </div>
        </div>
      </div>

      {/* MASTER CONTINGENCY VS REVENUE OVERVIEW */}
      <div className="glass-card bg-slate-950/40 border border-white/5 p-6 rounded-3xl space-y-4">
        <div>
          <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <i className="fas fa-shield-halved text-indigo-400"></i> Master Guardrail: Contingency vs Revenue Ratio
          </h3>
          <p className="text-[9.5px] font-bold text-slate-500 uppercase">Perbandingan Akumulasi Biaya Kontingensi Terhadap Pendapatan MTD</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Petty Cash */}
          {(() => {
            const ratio = actualOpexRatio;
            const target = budgetPercentage;
            const diff = ratio - target;
            const isExceeded = target > 0 && ratio > target;
            return (
              <div className={`bg-slate-900/60 border ${isExceeded ? 'border-red-500/20' : 'border-white/5'} rounded-2xl p-4 space-y-2`}>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                  <span>Petty Cash (OPEX)</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] ${isExceeded ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {isExceeded ? 'EXCEEDED' : 'SAFE'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-black text-white">Rp {actualOpexTotal.toLocaleString('id-ID')}</p>
                  <p className={`text-xs font-black ${isExceeded ? 'text-red-400' : 'text-emerald-400'}`}>{ratio.toFixed(1)}%</p>
                </div>
                <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase border-t border-white/5 pt-1.5">
                  <span>Target: {target}% dari Omset</span>
                  {target > 0 && (
                    <span className={isExceeded ? 'text-red-400' : 'text-emerald-400'}>
                      {isExceeded ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Card 2: Overtime */}
          {(() => {
            const otCost = overtimeMtdGrandTotals.totalPay;
            const ratio = mtdRevenue > 0 ? (otCost / mtdRevenue) * 100 : 0;
            const target = overtimeBudgetPercent;
            const diff = ratio - target;
            const isExceeded = otCost > 0 && ratio > target;
            return (
              <div className={`bg-slate-900/60 border ${isExceeded ? 'border-red-500/20' : 'border-white/5'} rounded-2xl p-4 space-y-2`}>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                  <span>Overtime Guard</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setTempOvertimeBudgetPercent(String(overtimeBudgetPercent));
                        setIsEditingOvertimeBudgetPercent(true);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      title="Atur Target Overtime"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] ${isExceeded ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {isExceeded ? 'EXCEEDED' : 'SAFE'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-black text-white">Rp {otCost.toLocaleString('id-ID')}</p>
                  <p className={`text-xs font-black ${isExceeded ? 'text-red-400' : 'text-emerald-400'}`}>{ratio.toFixed(2)}%</p>
                </div>
                <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase border-t border-white/5 pt-1.5">
                  <span>Target: {target}% dari Omset</span>
                  <span className={isExceeded ? 'text-red-400' : 'text-emerald-400'}>
                    {isExceeded ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Card 3: Belanja Spend */}
          {(() => {
            const actual = mtdActualSpendsByDivision.total;
            const basis = targetRevenueStats.fullMonthTarget * 0.8;
            const targetBudget = basis * (belanjaCostPercent / 100);
            const ratio = basis > 0 ? (actual / basis) * 100 : 0;
            const target = belanjaCostPercent;
            const diff = ratio - target;
            const isExceeded = actual > targetBudget;
            return (
              <div className={`bg-slate-900/60 border ${isExceeded ? 'border-red-500/20' : 'border-white/5'} rounded-2xl p-4 space-y-2`}>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                  <span>Belanja Spend (Bulanan)</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] ${isExceeded ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {isExceeded ? 'EXCEEDED' : 'SAFE'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-black text-white font-mono">Rp {actual.toLocaleString('id-ID')}</p>
                  <p className={`text-xs font-black ${isExceeded ? 'text-red-400' : 'text-emerald-400'}`}>{ratio.toFixed(1)}%</p>
                </div>
                <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase border-t border-white/5 pt-1.5">
                  <span>Target: {target}% dari Basis Target</span>
                  <span className={isExceeded ? 'text-red-400' : 'text-emerald-400'}>
                    {isExceeded ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Card 4: Energy Cost */}
          {(() => {
            const actual = mtdEnergySum.totalCost;
            const ratio = mtdEnergySum.ratioOfRevenue;
            const target = energyRatioTarget;
            const diff = ratio - target;
            const isExceeded = actual > 0 && ratio > target;
            return (
              <div className={`bg-slate-900/60 border ${isExceeded ? 'border-red-500/20' : 'border-white/5'} rounded-2xl p-4 space-y-2`}>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                  <span>Energy Cost</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] ${isExceeded ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {isExceeded ? 'EXCEEDED' : 'SAFE'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-black text-white font-mono">Rp {actual.toLocaleString('id-ID')}</p>
                  <p className={`text-xs font-black ${isExceeded ? 'text-red-400' : 'text-emerald-400'}`}>{ratio.toFixed(1)}%</p>
                </div>
                <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase border-t border-white/5 pt-1.5">
                  <span>Target: {target}% dari Omset</span>
                  <span className={isExceeded ? 'text-red-400' : 'text-emerald-400'}>
                    {isExceeded ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Card 5: Floor Order */}
          {(() => {
            const actual = actualFloorTotal;
            const ratio = actualFloorRatio;
            const target = floorRatioTarget;
            const diff = ratio - target;
            const isExceeded = target > 0 && ratio > target;
            return (
              <div className={`bg-slate-900/60 border ${isExceeded ? 'border-red-500/20' : 'border-white/5'} rounded-2xl p-4 space-y-2`}>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                  <span>Floor Order</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTempFloorRatioTarget(String(floorRatioTarget));
                        setIsEditingFloorRatioTarget(true);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      title="Atur Target Floor Order"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] ${isExceeded ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {isExceeded ? 'EXCEEDED' : 'SAFE'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-black text-white font-mono">Rp {actual.toLocaleString('id-ID')}</p>
                  <p className={`text-xs font-black ${isExceeded ? 'text-red-400' : 'text-emerald-400'}`}>{ratio.toFixed(2)}%</p>
                </div>
                <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase border-t border-white/5 pt-1.5">
                  <span>Target: {target}% dari Omset</span>
                  <span className={isExceeded ? 'text-red-400' : 'text-emerald-400'}>
                    {isExceeded ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {/* ==================== TAB 1: OPEX PETTY CASH ==================== */}
        {activeTab === 'opex' && (
          <motion.div
            key="opex-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Quick stats & action buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-sliders text-indigo-500"></i> Detail Petty Cash OPEX & Budget Kategori Expense
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsEditingCategoryBudgets(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer border border-emerald-400/30"
                >
                  <i className="fas fa-coins text-emerald-300"></i> Input Budget Kategori Expense
                </button>
                <button
                  onClick={() => {
                    setTempBudget(String(budgetPercentage));
                    setIsEditingBudget(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <i className="fas fa-percent"></i> Input Target Opex Budget (%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-money-bill-wave"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">ACTUAL REVENUE MTD</p>
                <p className="text-xl md:text-2xl font-black text-white">Rp {mtdRevenue.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-indigo-400 mt-2 uppercase tracking-tight">Total omset berjalan bulan ini</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-bullseye"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">MTD OPEX BUDGET LIMIT</p>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-xl md:text-2xl font-black text-indigo-400">{budgetPercentage}%</p>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">dari Omset</span>
                </div>
                <p className="text-[11px] font-bold text-slate-300 mt-1">Rp {opexBudgetAmount.toLocaleString('id-ID')}</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-hand-holding-dollar"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">ACTUAL OPEX SPENT</p>
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-xl md:text-2xl font-black ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
                    {actualOpexRatio.toFixed(2)}%
                  </p>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">dari Omset</span>
                </div>
                <p className="text-[11px] font-bold text-slate-300 mt-1">Rp {actualOpexTotal.toLocaleString('id-ID')}</p>
              </div>

              <div className={`glass-card bg-gradient-to-br ${statusBg} border border-white/5 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between`}>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">STATUS OPEX</p>
                  <span className={`inline-block px-2 py-0.5 rounded-md font-black text-[9px] uppercase border mt-1 ${statusColor}`}>
                    {statusText}
                  </span>
                </div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-tight">
                  {isBudgetSet ? (
                    <div>
                      {budgetRatioDiff > 0 ? (
                        <span className="text-red-400"><i className="fas fa-arrow-up mr-1"></i> EXCEEDED BY {budgetRatioDiff.toFixed(2)}%</span>
                      ) : (
                        <span className="text-emerald-400"><i className="fas fa-arrow-down mr-1"></i> SAFE BY {Math.abs(budgetRatioDiff).toFixed(2)}%</span>
                      )}
                      <div className="text-slate-500 font-bold mt-0.5 text-[9px]">Selisih: Rp {Math.abs(actualOpexTotal - opexBudgetAmount).toLocaleString('id-ID')}</div>
                    </div>
                  ) : (
                    <span className="text-slate-500">Target Belum Ditentukan</span>
                  )}
                </div>
              </div>
            </div>

            {/* Rekapan Budget vs Realisasi Per Kategori Expense */}
            <div className="glass-card bg-slate-900/60 border border-white/10 p-6 md:p-8 rounded-3xl space-y-6 shadow-2xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight italic flex items-center gap-2">
                    <i className="fas fa-coins text-emerald-400"></i>
                    REKAPAN BUDGET VS REALISASI PER KATEGORI EXPENSE
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">
                    Evaluasi target budget dan realisasi pengeluaran untuk Commodity, Non Commodity, Chemical, Maintenance, ATK, dan Asset ({MONTH_NAMES[selectedMonth]} {selectedYear}).
                  </p>
                </div>
                <button
                  onClick={() => setIsEditingCategoryBudgets(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl shadow-lg text-xs uppercase tracking-widest font-black flex items-center gap-2 active:scale-95 transition-all cursor-pointer border border-emerald-400/30"
                >
                  <i className="fas fa-edit text-sm"></i> Input Budget Kategori Expense
                </button>
              </div>

              {/* Category Grid Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryBudgetList.map((item) => {
                  const budget = item.budget;
                  const spent = item.spent;
                  const remaining = budget - spent;
                  const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;

                  let statusBadge = 'bg-slate-500/20 text-slate-400 border-slate-500/30';
                  let statusLabel = 'Belum Set Budget';

                  if (budget > 0) {
                    if (spent > budget) {
                      statusBadge = 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
                      statusLabel = 'OVER BUDGET';
                    } else if (pctUsed >= 80) {
                      statusBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                      statusLabel = 'MENDEKATI LIMIT';
                    } else {
                      statusBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                      statusLabel = 'AMAN / SESUAI';
                    }
                  }

                  return (
                    <div key={item.key} className="bg-slate-950/70 p-5 rounded-2xl border border-white/10 space-y-3 relative overflow-hidden group hover:border-white/20 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-xs ${item.color}`}>
                            <i className={`fas ${item.icon}`}></i>
                          </span>
                          <span className="text-xs font-black text-white uppercase tracking-wide">{item.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div>
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">TARGET BUDGET</span>
                          <span className="text-sm font-black text-white">Rp {budget.toLocaleString('id-ID')}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">REALISASI / SPENT</span>
                          <span className={`text-sm font-black ${spent > budget && budget > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                            Rp {spent.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px]">
                        <div>
                          <span className="text-slate-500 font-bold mr-1">Sisa Budget:</span>
                          <span className={`font-black ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            Rp {remaining.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="font-black text-slate-400">
                          {budget > 0 ? `${pctUsed.toFixed(1)}% Terpakai` : '-'}
                        </div>
                      </div>

                      {budget > 0 && (
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${spent > budget ? 'bg-red-500' : item.barColor}`}
                            style={{ width: `${Math.min(pctUsed, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Table View */}
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-950/80 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="p-3.5">Kategori Expense</th>
                      <th className="p-3.5 text-right">Target Budget (Rp)</th>
                      <th className="p-3.5 text-right">Realisasi Spent (Rp)</th>
                      <th className="p-3.5 text-right">Sisa Budget / Variance</th>
                      <th className="p-3.5 text-center">% Pemakaian</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-bold">
                    {categoryBudgetList.map((item) => {
                      const budget = item.budget;
                      const spent = item.spent;
                      const remaining = budget - spent;
                      const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;

                      let statusClass = 'text-slate-400';
                      let statusLabel = 'Belum Set';

                      if (budget > 0) {
                        if (spent > budget) {
                          statusClass = 'text-red-400 font-black';
                          statusLabel = 'OVER BUDGET';
                        } else if (pctUsed >= 80) {
                          statusClass = 'text-amber-300 font-black';
                          statusLabel = 'MENDEKATI LIMIT';
                        } else {
                          statusClass = 'text-emerald-400 font-black';
                          statusLabel = 'AMAN';
                        }
                      }

                      return (
                        <tr key={item.key} className="hover:bg-white/5 transition-colors">
                          <td className="p-3.5 font-black text-white flex items-center gap-2">
                            <i className={`fas ${item.icon} ${item.color}`}></i>
                            {item.name}
                          </td>
                          <td className="p-3.5 text-right font-black text-indigo-300">Rp {budget.toLocaleString('id-ID')}</td>
                          <td className="p-3.5 text-right font-black text-blue-400">Rp {spent.toLocaleString('id-ID')}</td>
                          <td className={`p-3.5 text-right font-black ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            Rp {remaining.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3.5 text-center font-bold text-slate-300">
                            {budget > 0 ? `${pctUsed.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`p-3.5 text-center text-[10px] uppercase ${statusClass}`}>
                            {statusLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totalBudget = categoryBudgetList.reduce((a, b) => a + b.budget, 0);
                      const totalSpent = categoryBudgetList.reduce((a, b) => a + b.spent, 0);
                      const totalRemaining = totalBudget - totalSpent;
                      const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

                      return (
                        <tr className="border-t-2 border-white/10 bg-slate-950/90 text-xs font-black">
                          <td className="p-3.5 text-white uppercase tracking-wider">TOTAL KATEGORI EXPENSE</td>
                          <td className="p-3.5 text-right text-indigo-300">Rp {totalBudget.toLocaleString('id-ID')}</td>
                          <td className="p-3.5 text-right text-blue-400">Rp {totalSpent.toLocaleString('id-ID')}</td>
                          <td className={`p-3.5 text-right ${totalRemaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            Rp {totalRemaining.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3.5 text-center text-purple-300">{totalBudget > 0 ? `${totalPct.toFixed(1)}%` : '-'}</td>
                          <td className="p-3.5 text-center text-[10px] uppercase text-slate-300">
                            {totalBudget > 0 ? (totalSpent > totalBudget ? 'OVER BUDGET' : 'DALAM LIMIT') : '-'}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-layer-group text-slate-500"></i> Detail Petty Cash OPEX
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Usage breakdown & ratio</p>
                  </div>
                  <div className="divide-y divide-white/5 space-y-4 pt-2">
                    {categoriesList.map((cat, idx) => {
                      const catRatioOfRevenue = mtdRevenue > 0 ? (cat.value / mtdRevenue) * 100 : 0;
                      const catRatioOfActualSpent = actualOpexTotal > 0 ? (cat.value / actualOpexTotal) * 100 : 0;
                      return (
                        <div key={cat.name} className={`${idx > 0 ? 'pt-4' : ''} space-y-2 group`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-[11px] ${cat.color} group-hover:scale-105 transition-transform`}>
                                <i className={`fas ${cat.icon}`}></i>
                              </span>
                              <div>
                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{cat.name}</p>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{catRatioOfActualSpent.toFixed(1)}% dari Total Petty Cash</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-white">Rp {cat.value.toLocaleString('id-ID')}</p>
                              <p className="text-[9px] font-black text-slate-400">{catRatioOfRevenue.toFixed(2)}% of Revenue</p>
                            </div>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(catRatioOfRevenue * 8, 100)}%` }}
                              className={`h-full rounded-full ${cat.barColor}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-chart-area text-slate-500"></i> Cumulative Spent Trend
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">MTD Daily Cumulative Trend vs Limit</p>
                  </div>
                  <div className="h-64 md:h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="10%" stopColor="#ef4444" stopOpacity={0.05}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                        <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={8} tickFormatter={(val) => `Rp ${(val / 1000000).toFixed(1)}Jt`} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '12px' }}
                          labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '11px', color: '#f8fafc' }}
                          formatter={(val: number) => [`Rp ${val.toLocaleString('id-ID')}`]}
                        />
                        <Area type="monotone" dataKey="Actual Spend" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#actualGrad)" />
                        <Area type="monotone" dataKey="Budget limit" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" fillOpacity={1} fill="url(#budgetGrad)" />
                        <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-chart-pie text-slate-500"></i> Opex Distribution
                      </h4>
                      <p className="text-[8px] font-bold text-slate-500 uppercase">Usage share by class</p>
                    </div>
                    <div className="h-44 flex items-center justify-center relative">
                      {chartCategoriesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartCategoriesData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={70}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {chartCategoriesData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '8px' }}
                              itemStyle={{ fontSize: '10px', color: '#f8fafc' }}
                              formatter={(val: number) => [`Rp ${val.toLocaleString('id-ID')}`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Belum ada pengeluaran</div>
                      )}
                      {chartCategoriesData.length > 0 && (
                        <div className="absolute flex flex-col items-center">
                          <span className="text-[9px] font-black text-slate-500 uppercase font-mono">Total Spent</span>
                          <span className="text-[11px] font-black text-white font-mono">Rp {(actualOpexTotal / 1000).toFixed(0)}rb</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-6 glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-balance-scale text-slate-500"></i> Opex vs. Revenue Ratio
                      </h4>
                      <p className="text-[8px] font-bold text-slate-500 uppercase">Ratio Target (%) Comparison</p>
                    </div>
                    <div className="h-44 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[{ name: 'Opex Ratio', Budget: budgetPercentage, Actual: actualOpexRatio }]}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                          <YAxis stroke="#475569" fontSize={9} tickFormatter={(val) => `${val}%`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '11px' }}
                            formatter={(val: number) => [`${val.toFixed(2)}%`]}
                          />
                          <Bar dataKey="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Actual" fill={isOverBudget ? '#ef4444' : '#10b981'} radius={[4, 4, 0, 0]} />
                          <Legend wrapperStyle={{ fontSize: '8px', textTransform: 'uppercase' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ==================== TAB 2: CONTINGENCY OVERTIME ==================== */}
        {activeTab === 'overtime' && (
          <motion.div
            key="overtime-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Control & Header */}
            <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Dashboard Contingency Overtime Guard</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Weekly Analysis, Division average, & Crew Overload Alert</span>
              </div>
              <button
                onClick={() => {
                  setTempOvertimeHourLimit(String(overtimeHourLimitPerWeek));
                  setIsEditingOvertimeHourLimit(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <i className="fas fa-cog"></i> Atur Limit Jam Crew
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-clock"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">TOTAL LEMBUR MTD</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">{overtimeMtdGrandTotals.totalHours.toFixed(1)} Jam</p>
                <p className="text-[9px] font-black text-indigo-400 mt-2 uppercase tracking-tight">Akumulasi seluruh divisi berjalan</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-coins"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">BIAYA LEMBUR MTD</p>
                <p className="text-xl md:text-2xl font-black text-amber-400 font-mono">Rp {overtimeMtdGrandTotals.totalPay.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Biaya Rupiah di Petty Cash</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-user-shield"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">CREW OVERLOAD GUARD</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">{highRiskOvertimeCrew.length} Crew</p>
                <p className={`text-[9px] font-black mt-2 uppercase tracking-tight ${highRiskOvertimeCrew.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {highRiskOvertimeCrew.length > 0 ? '⚠️ ADA DI ATAS BATAS KONTINGENSI' : '✅ SELURUH CREW AMAN'}
                </p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-shield-halved"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">BATAS KONTINGENSI CREW</p>
                <p className="text-xl md:text-2xl font-black text-indigo-400 font-mono">{overtimeHourLimitPerWeek} Jam</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Per minggu per crew</p>
              </div>
            </div>

            {/* Matrix Breakdown & Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Matrix Table */}
              <div className="lg:col-span-7 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-table-list text-indigo-400"></i> Matriks Lembur Divisi & Rata-rata Staff
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Perbandingan Total Jam, Average Hours MTD dari Jumlah Staff</p>
                  </div>

                  <div className="table-container border border-white/5 overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 text-[9px] text-slate-400 font-black tracking-wider uppercase border-b border-white/10">
                          <th className="p-4">DIVISI</th>
                          <th className="p-4 text-center">TOTAL STAFF ACTIVE</th>
                          <th className="p-4 text-center">TOTAL JAM</th>
                          <th className="p-4 text-center">RATA-RATA JAM / CREW</th>
                          <th className="p-4 text-right">ESTIMASI BIAYA (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {DIVISIONS_LIST.map(div => {
                          const staffCount = activeStaffByDivision[div] || 0;
                          const summary = overtimeSummaryByDivision[div] || { totalHours: 0, totalPay: 0 };
                          const avgHours = staffCount > 0 ? (summary.totalHours / staffCount) : 0;
                          
                          return (
                            <tr key={div} className="hover:bg-white/5 transition-colors">
                              <td className="p-4 font-black text-white flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${
                                  div === 'SERVICE' ? 'bg-indigo-500' :
                                  div === 'KITCHEN' ? 'bg-rose-500' :
                                  div === 'BAR' ? 'bg-amber-500' : 'bg-teal-500'
                                }`}></span>
                                {div}
                              </td>
                              <td className="p-4 text-center font-bold text-slate-300">{staffCount} Crew</td>
                              <td className="p-4 text-center font-bold text-white font-mono">{summary.totalHours.toFixed(1)} Jam</td>
                              <td className={`p-4 text-center font-black font-mono ${
                                avgHours > overtimeHourLimitPerWeek * 3 ? 'text-rose-400' :
                                avgHours > overtimeHourLimitPerWeek * 1.5 ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {avgHours.toFixed(1)} Jam/Staff
                              </td>
                              <td className="p-4 text-right font-black text-slate-200 font-mono">Rp {summary.totalPay.toLocaleString('id-ID')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-indigo-950/20 border border-indigo-500/10 p-4 rounded-2xl flex items-start gap-3">
                    <span className="text-indigo-400 text-sm mt-0.5"><i className="fas fa-info-circle"></i></span>
                    <div className="text-[9.5px] font-semibold text-slate-400 leading-normal">
                      <span className="text-indigo-300 font-black">INFORMASI FORMULA:</span> Rata-rata jam per crew dihitung dari <span className="text-white font-bold">Total Jam Lembur Divisi / Total Active Staff Divisi</span>. Pengawasan berfokus pada pemerataan beban kerja divisi demi mencegah kelelahan (burnout) dan menekan over-budget lembur tak terkendali.
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekly Chart */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-chart-bar text-slate-500"></i> Distribusi Lembur Mingguan
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Perkembangan jam lembur per minggu per divisi</p>
                  </div>

                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overtimeWeeklyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                        <XAxis dataKey="week" stroke="#475569" fontSize={9} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={8} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '11px', color: '#f8fafc' }}
                        />
                        <Bar dataKey="SERVICE" name="Service" stackId="a" fill="#6366f1" />
                        <Bar dataKey="KITCHEN" name="Kitchen" stackId="a" fill="#f43f5e" />
                        <Bar dataKey="BAR" name="Bar" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="STORE KEEPER" name="Storekeeper" stackId="a" fill="#14b8a6" />
                        <Legend wrapperStyle={{ fontSize: '8px', textTransform: 'uppercase' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>

            {/* Crew Overtime Warning Alert Logs */}
            <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-triangle-exclamation text-rose-500"></i> Guardrails Kontingensi: Crew Lembur Overload
                </h3>
                <p className="text-[9px] font-bold text-slate-500 uppercase">Daftar staff dengan jam lembur melebihi limit {overtimeHourLimitPerWeek} jam dalam satu minggu</p>
              </div>

              {highRiskOvertimeCrew.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {highRiskOvertimeCrew.map(c => {
                    return (
                      <div key={c.staffId} className="bg-slate-950/40 border border-red-500/10 hover:border-red-500/30 transition-all rounded-2xl p-4 space-y-3 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-1 bg-red-600/10 border-l border-b border-red-500/20 text-red-400 text-[8px] font-black uppercase rounded-bl-xl tracking-widest">
                          Limit Exceeded
                        </div>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-black text-white text-sm group-hover:text-red-400 transition-colors">{c.name}</h4>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">{c.division}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5 text-center bg-slate-950 p-2.5 rounded-xl border border-white/5">
                          {c.weeklyHours.map((h, i) => (
                            <div key={i} className="space-y-0.5">
                              <p className="text-[7.5px] font-black text-slate-500">W{i+1}</p>
                              <p className={`text-[10px] font-black font-mono ${h > overtimeHourLimitPerWeek ? 'text-rose-400' : 'text-slate-400'}`}>
                                {h.toFixed(0)}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-1 text-[9px] font-black uppercase">
                          <span className="text-slate-500">Peak Week:</span>
                          <span className="text-rose-400 font-mono font-black">{c.maxWeekHours.toFixed(1)} Jam</span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-black uppercase">
                          <span className="text-slate-500">Total MTD:</span>
                          <span className="text-white font-mono font-black">{c.totalMtdHours.toFixed(1)} Jam</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-8 text-center space-y-2">
                  <span className="inline-block p-4 bg-emerald-600/10 border border-emerald-500/20 rounded-full text-emerald-400 text-lg mb-2">
                    <i className="fas fa-circle-check"></i>
                  </span>
                  <p className="text-xs font-black text-white uppercase tracking-wider">SELURUH CREW AMAN</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Tidak ditemukan crew yang melewati limit mingguan kontingensi {overtimeHourLimitPerWeek} Jam</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ==================== TAB 3: CONTINGENCY BELANJA ==================== */}
        {activeTab === 'belanja' && (
          <motion.div
            key="belanja-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Control & Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/20 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Dashboard Contingency Belanja & Supplier</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Petty Cash OPEX, Supplier Purchases, and Variance Guard</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setTempWeekdayTarget(String(weekdayTarget));
                    setTempWeekendTarget(String(weekendTarget));
                    setTempBelanjaCostPercent(String(belanjaCostPercent));
                    setIsEditingBelanjaTargets(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <i className="fas fa-percent"></i> Atur Target & Cost Belanja (40%)
                </button>
                <button
                  onClick={() => {
                    setTempBelanjaLimit(String(belanjaLimit));
                    setIsEditingBelanjaLimit(true);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl border border-white/5 text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <i className="fas fa-sliders"></i> Limit Kontingensi
                </button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-cart-shopping"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">TOTAL BELANJA MTD</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">Rp {grandTotalBelanja.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-indigo-400 mt-2 uppercase tracking-tight">Petty Cash + Supplier MTD</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-wallet"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">PETTY CASH SPENT (OPEX)</p>
                <p className="text-xl md:text-2xl font-black text-slate-300 font-mono">Rp {actualOpexTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">
                  {grandTotalBelanja > 0 ? ((actualOpexTotal / grandTotalBelanja) * 100).toFixed(1) : 0}% share dari Belanja
                </p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-truck-ramp-box"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">SUPPLIER BILL SPENT</p>
                <p className="text-xl md:text-2xl font-black text-slate-300 font-mono">Rp {totalSupplierSpend.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">
                  {grandTotalBelanja > 0 ? ((totalSupplierSpend / grandTotalBelanja) * 100).toFixed(1) : 0}% share dari Belanja
                </p>
              </div>

              <div className={`glass-card bg-gradient-to-br ${isBelanjaExceeded ? 'from-red-950/20 text-red-400' : 'from-emerald-950/20 text-emerald-400'} border border-white/5 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between`}>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">CONTINGENCY LIMIT STATUS</p>
                  <span className={`inline-block px-2 py-0.5 rounded-md font-black text-[9px] uppercase border mt-1 ${
                    isBelanjaExceeded ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {isBelanjaExceeded ? 'EXCEEDED' : 'OPTIMAL'}
                  </span>
                </div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-tight">
                  {isBelanjaExceeded ? (
                    <span className="text-red-400">EXCEEDED BY Rp {(grandTotalBelanja - belanjaLimit).toLocaleString('id-ID')}</span>
                  ) : (
                    <span className="text-emerald-400">SAFE BY Rp {(belanjaLimit - grandTotalBelanja).toLocaleString('id-ID')}</span>
                  )}
                  <div className="text-slate-500 font-bold mt-0.5 text-[9px]">Limit: Rp {belanjaLimit.toLocaleString('id-ID')}</div>
                </div>
              </div>
            </div>

            {/* NEW SECTION: TARGET REVENUE & JATAH BELANJA PER DIVISI */}
            <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <i className="fas fa-divide text-indigo-400"></i> Alokasi Jatah Belanja Divisi Bulanan (Tanggal 1 - Akhir Bulan)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Pembagian Anggaran Belanja Berdasarkan Target Revenue: Kitchen (70%), Bar (20%), Service (10%)</p>
                </div>
                <div className="bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5 text-[9px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-percent"></i> COST BELANJA: {belanjaCostPercent}% DARI TARGET REVENUE (-20%)
                </div>
              </div>

              {/* Formula explanation banner */}
              <div className="bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-2xl flex items-start gap-3">
                <span className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 mt-0.5">
                  <i className="fas fa-calculator text-xs"></i>
                </span>
                <div className="text-[10px] space-y-1">
                  <p className="font-black text-white uppercase tracking-wider">Metode Perhitungan Target Belanja (Contingency vs Revenue):</p>
                  <p className="text-slate-400 uppercase font-semibold">
                    1. Target Revenue Bulanan dihitung dari jumlah Weekday (Senin-Jumat @ Rp {weekdayTarget.toLocaleString('id-ID')}) & Weekend (Sabtu-Minggu @ Rp {weekendTarget.toLocaleString('id-ID')}) dalam bulan berjalan.
                  </p>
                  <p className="text-slate-400 uppercase font-semibold">
                    2. Basis Belanja = Target Revenue Bulanan dikurangi 20% (atau 80% dari Target Revenue Bulanan).
                  </p>
                  <p className="text-slate-400 uppercase font-semibold">
                    3. Jatah Belanja Total = {belanjaCostPercent}% dari Basis Belanja.
                  </p>
                </div>
              </div>

              {/* Core figures requested by the user */}
              {(() => {
                const fullMonthTarget = targetRevenueStats.fullMonthTarget;
                const basisBelanja = fullMonthTarget * 0.8;
                const budgetBelanjaCustom = basisBelanja * (belanjaCostPercent / 100);
                const budgetBelanjaReduced40 = basisBelanja * 0.60;
                const budgetBelanjaAllocation40 = basisBelanja * 0.40;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/50 p-5 rounded-2xl border border-white/5">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">TARGET REVENUE BULANAN</span>
                      <p className="text-base md:text-lg font-black text-white font-mono">Rp {fullMonthTarget.toLocaleString('id-ID')}</p>
                      <span className="text-[8px] text-slate-500 font-bold uppercase block">100% Target Revenue Outlet</span>
                    </div>
                    <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-white/5 pt-3 sm:pt-0 sm:pl-4">
                      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">TARGET REVENUE -20%</span>
                      <p className="text-base md:text-lg font-black text-amber-400 font-mono">Rp {basisBelanja.toLocaleString('id-ID')}</p>
                      <span className="text-[8px] text-slate-500 font-bold uppercase block">80% dari Target Revenue (Basis)</span>
                    </div>
                    <div className="space-y-1 border-t lg:border-t-0 lg:border-l border-white/5 pt-3 lg:pt-0 lg:pl-4">
                      <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest block">BUDGET DIKURANGI 40% (SISA 60%)</span>
                      <p className="text-base md:text-lg font-black text-rose-400 font-mono">Rp {budgetBelanjaReduced40.toLocaleString('id-ID')}</p>
                      <span className="text-[8px] text-slate-500 font-bold uppercase block">Basis Belanja dikurangi 40%</span>
                    </div>
                    <div className="space-y-1 border-t lg:border-t-0 lg:border-l border-white/5 pt-3 lg:pt-0 lg:pl-4">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">BUDGET JATAH BELANJA ({belanjaCostPercent}%)</span>
                      <p className="text-base md:text-lg font-black text-emerald-400 font-mono">Rp {budgetBelanjaCustom.toLocaleString('id-ID')}</p>
                      <span className="text-[8px] text-slate-500 font-bold uppercase block">Jatah {belanjaCostPercent}% dari Basis Belanja</span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Kitchen Allocation */}
                {(() => {
                  const fullMonthBasis = targetRevenueStats.fullMonthTarget * 0.8;
                  const totalBudget = fullMonthBasis * (belanjaCostPercent / 100);
                  const allocation = totalBudget * 0.70;
                  const actual = mtdActualSpendsByDivision.kitchen;
                  const percentUsed = allocation > 0 ? (actual / allocation) * 100 : 0;
                  const isOver = actual > allocation;
                  return (
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-3 relative overflow-hidden font-semibold">
                      <div className="absolute top-3 right-3 text-rose-500/10 text-3xl"><i className="fas fa-fire-burner"></i></div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                        <span>Jatah Kitchen (70%)</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${isOver ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {isOver ? 'OVER BUDGET' : 'UNDER BUDGET'}
                        </span>
                      </div>
                      <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase">Limit Anggaran Bulanan</div>
                        <div className="text-base font-black text-white">Rp {allocation.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="border-t border-white/5 pt-2 flex justify-between items-baseline">
                        <div>
                          <div className="text-[9px] font-black text-slate-500 uppercase">Actual Terpakai Bulanan</div>
                          <div className="text-sm font-black text-rose-400">Rp {actual.toLocaleString('id-ID')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-black text-slate-500 uppercase">Rasio Pemakaian</div>
                          <div className={`text-xs font-black ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>{percentUsed.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, percentUsed)}%` }}></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Bar Allocation */}
                {(() => {
                  const fullMonthBasis = targetRevenueStats.fullMonthTarget * 0.8;
                  const totalBudget = fullMonthBasis * (belanjaCostPercent / 100);
                  const allocation = totalBudget * 0.20;
                  const actual = mtdActualSpendsByDivision.bar;
                  const percentUsed = allocation > 0 ? (actual / allocation) * 100 : 0;
                  const isOver = actual > allocation;
                  return (
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-3 relative overflow-hidden font-semibold">
                      <div className="absolute top-3 right-3 text-amber-500/10 text-3xl"><i className="fas fa-whiskey-glass"></i></div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                        <span>Jatah Bar (20%)</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${isOver ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {isOver ? 'OVER BUDGET' : 'UNDER BUDGET'}
                        </span>
                      </div>
                      <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase">Limit Anggaran Bulanan</div>
                        <div className="text-base font-black text-white">Rp {allocation.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="border-t border-white/5 pt-2 flex justify-between items-baseline">
                        <div>
                          <div className="text-[9px] font-black text-slate-500 uppercase">Actual Terpakai Bulanan</div>
                          <div className="text-sm font-black text-amber-400">Rp {actual.toLocaleString('id-ID')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-black text-slate-500 uppercase">Rasio Pemakaian</div>
                          <div className={`text-xs font-black ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>{percentUsed.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, percentUsed)}%` }}></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Service Allocation */}
                {(() => {
                  const fullMonthBasis = targetRevenueStats.fullMonthTarget * 0.8;
                  const totalBudget = fullMonthBasis * (belanjaCostPercent / 100);
                  const allocation = totalBudget * 0.10;
                  const actual = mtdActualSpendsByDivision.service;
                  const percentUsed = allocation > 0 ? (actual / allocation) * 100 : 0;
                  const isOver = actual > allocation;
                  return (
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-3 relative overflow-hidden font-semibold">
                      <div className="absolute top-3 right-3 text-indigo-500/10 text-3xl"><i className="fas fa-hand-holding-heart"></i></div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                        <span>Jatah Service (10%)</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${isOver ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {isOver ? 'OVER BUDGET' : 'UNDER BUDGET'}
                        </span>
                      </div>
                      <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase">Limit Anggaran Bulanan</div>
                        <div className="text-base font-black text-white">Rp {allocation.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="border-t border-white/5 pt-2 flex justify-between items-baseline">
                        <div>
                          <div className="text-[9px] font-black text-slate-500 uppercase">Actual Terpakai Bulanan</div>
                          <div className="text-sm font-black text-indigo-400">Rp {actual.toLocaleString('id-ID')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-black text-slate-500 uppercase">Rasio Pemakaian</div>
                          <div className={`text-xs font-black ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>{percentUsed.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, percentUsed)}%` }}></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* NEW SECTION: JADWAL DATANG BARANG & BACK UP DELIVERY CYCLES */}
            <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-calendar-check text-indigo-400"></i> Jadwal Kedatangan Barang & Backup Target Revenue ({outletOrderSchedule.label} - {outletOrderSchedule.areaName})
                </h3>
                <p className="text-[9px] font-bold text-slate-500 uppercase">
                  {outletOrderSchedule.dayIndices.includes(2) && outletOrderSchedule.dayIndices.includes(4) && outletOrderSchedule.dayIndices.includes(6)
                    ? 'Pengiriman pada Selasa (backup Sel-Rab), Kamis (backup Kam-Jum), & Sabtu (backup Sab-Min-Sen). Jatah Belanja disesuaikan harian revenue.'
                    : 'Pengiriman pada Senin (backup Sen-Sel), Rabu (backup Rab-Kam), & Jumat (backup Jum-Sab-Min). Jatah Belanja disesuaikan harian revenue.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {deliveryCycles.map((cycle, index) => {
                  const isOver = cycle.actualTotal > cycle.belanjaBudget;
                  // Format covered days list for display
                  const coveredDaysShort = cycle.coveredDays.map(dayStr => {
                    const parts = dayStr.split('-');
                    return `${parts[2]}/${parts[1]}`;
                  }).join(', ');

                  return (
                    <div key={index} className={`bg-slate-900/40 border ${isOver ? 'border-red-500/25' : 'border-indigo-500/10'} rounded-2xl p-5 space-y-4 font-semibold`}>
                      {/* Header info */}
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-500/20 text-indigo-300 tracking-wider font-sans">
                            KEDATANGAN {cycle.dayOfWeekName}
                          </span>
                          <p className="text-xs font-black text-white mt-1">Delivery: {cycle.dateStr.split('-').reverse().join('-')}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black ${isOver ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                            {isOver ? 'OVER BUDGET' : 'SAFE'}
                          </span>
                          {cycle.shortfall > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[7px] font-black bg-amber-500/10 text-amber-500 border border-amber-500/10">
                              REV SHORTFALL
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Covered dates */}
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 space-y-1">
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Mem-backup Hari:</div>
                        <div className="text-[10px] font-bold text-slate-300 font-mono">{coveredDaysShort}</div>
                      </div>

                      {/* Calculations breakdown */}
                      <div className="space-y-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Total Target Rev:</span>
                          <span className="text-white font-mono">Rp {cycle.totalTargetRevenue.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Total Actual Rev:</span>
                          <span className={`font-mono font-bold ${cycle.shortfall > 0 ? 'text-amber-500' : 'text-emerald-400'}`}>
                            Rp {cycle.actualRevenue.toLocaleString('id-ID')}
                          </span>
                        </div>
                        {cycle.shortfall > 0 && (
                          <div className="flex justify-between text-amber-500 font-bold">
                            <span>Shortfall Revenue:</span>
                            <span className="font-mono">Rp {cycle.shortfall.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        <div className="border-t border-white/5 my-1.5"></div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Standard Jatah Belanja:</span>
                          <span className="text-slate-300 font-mono">Rp {cycle.standardBelanjaBudget.toLocaleString('id-ID')}</span>
                        </div>
                        {cycle.appliedReduction > 0 && (
                          <div className="flex justify-between text-rose-400 font-bold">
                            <span>Penalti Shortfall Lalu:</span>
                            <span className="font-mono">-Rp {cycle.appliedReduction.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-white/5 pb-2">
                          <span className="text-emerald-400 font-black">Nominal Jatah Belanja ({belanjaCostPercent}%):</span>
                          <span className="text-emerald-400 font-black font-mono">Rp {cycle.belanjaBudget.toLocaleString('id-ID')}</span>
                        </div>

                        {/* Divisional breakdowns */}
                        <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Jatah Kitchen (70%):</span>
                            <span>Rp {cycle.kitchenBudget.toLocaleString('id-ID')} <span className="text-slate-500 font-sans">(spent: Rp {cycle.actualKitchen.toLocaleString('id-ID')})</span></span>
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Jatah Bar (20%):</span>
                            <span>Rp {cycle.barBudget.toLocaleString('id-ID')} <span className="text-slate-500 font-sans">(spent: Rp {cycle.actualBar.toLocaleString('id-ID')})</span></span>
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Jatah Service (10%):</span>
                            <span>Rp {cycle.serviceBudget.toLocaleString('id-ID')} <span className="text-slate-500 font-sans">(spent: Rp {cycle.actualService.toLocaleString('id-ID')})</span></span>
                          </div>
                        </div>

                        <div className="flex justify-between items-baseline pt-2 border-t border-white/5 text-[11px]">
                          <span className="font-black text-white">TOTAL ACTUAL SPENT:</span>
                          <span className={`font-black font-mono ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>
                            Rp {cycle.actualTotal.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] font-bold text-slate-500">
                          <span>VARIANCE:</span>
                          <span className={isOver ? 'text-red-400' : 'text-emerald-400'}>
                            {isOver ? '+' : ''}{(cycle.actualTotal - cycle.belanjaBudget).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visual Breakdown and Suppliers Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Supplier distribution list */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-truck text-slate-500"></i> Detail Pembelian Supplier
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Procurement breakdown per mitra supplier</p>
                  </div>

                  <div className="divide-y divide-white/5 space-y-4 pt-2">
                    {supplierSpendList.map((sup, idx) => {
                      const shareOfSuppliers = totalSupplierSpend > 0 ? (sup.value / totalSupplierSpend) * 100 : 0;
                      return (
                        <div key={sup.name} className={`${idx > 0 ? 'pt-4' : ''} space-y-2 group`}>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black text-white uppercase tracking-tight">{sup.name}</p>
                            <div className="text-right">
                              <p className="text-xs font-black text-white font-mono">Rp {sup.value.toLocaleString('id-ID')}</p>
                              <p className="text-[9px] font-black text-slate-400">{shareOfSuppliers.toFixed(1)}% share of Suppliers</p>
                            </div>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${shareOfSuppliers}%` }}
                              className="h-full rounded-full bg-indigo-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Suppliers pie representation */}
              <div className="lg:col-span-7 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-chart-pie text-slate-500"></i> Supplier Spend Share
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Porsi pengadaan barang dari mitra supplier</p>
                  </div>

                  <div className="h-64 flex items-center justify-center relative">
                    {suppliersChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={suppliersChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={85}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {suppliersChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '10px', color: '#f8fafc' }}
                            formatter={(val: number) => [`Rp ${val.toLocaleString('id-ID')}`]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Belum ada pengeluaran supplier</div>
                    )}
                    {suppliersChartData.length > 0 && (
                      <div className="absolute flex flex-col items-center">
                        <span className="text-[9px] font-black text-slate-500 uppercase font-mono">Supplier Total</span>
                        <span className="text-[12px] font-black text-indigo-400 font-mono">Rp {(totalSupplierSpend / 1000).toFixed(0)}rb</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* High Contingency Spending Audit Logs */}
            <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-scale-unbalanced text-amber-500"></i> Audit Guard: Pengeluaran Skala Besar MTD
                </h3>
                <p className="text-[9px] font-bold text-slate-500 uppercase">Log pengeluaran tunggal (Petty cash maupun supplier) dengan nilai di atas Rp 1.000.000 untuk pengawasan kontingensi</p>
              </div>

              {highValueBelanjaItems.length > 0 ? (
                <div className="table-container border border-white/5 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80 text-[9px] text-slate-400 font-black tracking-wider uppercase border-b border-white/10">
                        <th className="p-4">TANGGAL</th>
                        <th className="p-4">SUMBER / KATEGORI</th>
                        <th className="p-4">NAMA BARANG</th>
                        <th className="p-4 text-center">QTY</th>
                        <th className="p-4 text-right">HARGA SATUAN</th>
                        <th className="p-4 text-right">TOTAL (Rp)</th>
                        <th className="p-4">KETERANGAN / REASON</th>
                        <th className="p-4 text-center">PIC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {highValueBelanjaItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors text-[11px]">
                          <td className="p-4 font-bold text-slate-300 font-mono">{item.date}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                              {item.category}
                            </span>
                          </td>
                          <td className="p-4 font-black text-white uppercase">{item.name}</td>
                          <td className="p-4 text-center font-bold text-slate-200">{item.qty}</td>
                          <td className="p-4 text-right font-semibold text-slate-400 font-mono">Rp {item.price.toLocaleString('id-ID')}</td>
                          <td className="p-4 text-right font-black text-amber-400 font-mono">Rp {item.total.toLocaleString('id-ID')}</td>
                          <td className="p-4 text-slate-400 max-w-xs truncate">{item.reason}</td>
                          <td className="p-4 text-center font-bold text-slate-300 uppercase">{item.pic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-8 text-center space-y-2">
                  <span className="inline-block p-4 bg-emerald-600/10 border border-emerald-500/20 rounded-full text-emerald-400 text-lg mb-2">
                    <i className="fas fa-circle-check"></i>
                  </span>
                  <p className="text-xs font-black text-white uppercase tracking-wider">TIDAK ADA PENGELUARAN JUMBO</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Seluruh transaksi pembelian berada di bawah Rp 1.000.000 untuk transaksi tunggal</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ==================== TAB 4: CONTINGENCY ENERGY COST ==================== */}
        {activeTab === 'energy' && (
          <motion.div
            key="energy-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Control & Header */}
            <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Dashboard Contingency Energy Cost</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Electricity (PLN), Water (PAM), and Gas Utility Guardrail</span>
              </div>
              <button
                onClick={() => {
                  setTempEnergyRatioTarget(String(energyRatioTarget));
                  setIsEditingEnergyRatioTarget(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <i className="fas fa-plug-circle-exclamation"></i> Atur Target Ratio Energi
              </button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-charging-station"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">TOTAL BIAYA UTILITY MTD</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">Rp {mtdEnergySum.totalCost.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-indigo-400 mt-2 uppercase tracking-tight">Listrik + Air + Gas MTD</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-bolt"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">BIAYA LISTRIK MTD</p>
                <p className="text-xl md:text-2xl font-black text-amber-400 font-mono">Rp {mtdEnergySum.electricity.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight font-mono">{mtdEnergySum.elecKwh.toFixed(0)} kWh consumed</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-faucet-drip"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">BIAYA AIR MTD</p>
                <p className="text-xl md:text-2xl font-black text-blue-400 font-mono">Rp {mtdEnergySum.water.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight font-mono">{mtdEnergySum.waterM3.toFixed(2)} m³ consumed</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-fire-burner"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">BIAYA GAS MTD</p>
                <p className="text-xl md:text-2xl font-black text-emerald-400 font-mono">Rp {mtdEnergySum.gas.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight font-mono">{mtdEnergySum.gasM3.toFixed(2)} m³ consumed</p>
              </div>
            </div>

            {/* Gauge and Diagnostic details */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Ratio Gauge Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-gauge-high text-indigo-400"></i> Rasio Penggunaan Energi
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Target rasio biaya utilitas terhadap omset berjalan</p>
                  </div>

                  <div className="my-8 text-center space-y-3">
                    <div className="inline-flex flex-col justify-center items-center p-8 bg-slate-950 rounded-full border-4 border-indigo-500/20 h-40 w-40 relative">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Rasio MTD</span>
                      <span className={`text-2xl font-black font-mono my-1 ${
                        mtdEnergySum.ratioOfRevenue > energyRatioTarget ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {mtdEnergySum.ratioOfRevenue.toFixed(2)}%
                      </span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase">dari Omset</span>
                    </div>

                    <div className="flex justify-center gap-6 text-[10px] font-black uppercase">
                      <div>
                        <span className="text-slate-500 block">TARGET KONTINGENSI</span>
                        <span className="text-white text-xs">{energyRatioTarget.toFixed(1)}%</span>
                      </div>
                      <div className="border-r border-white/10"></div>
                      <div>
                        <span className="text-slate-500 block">STATUS</span>
                        <span className={`text-xs ${
                          mtdEnergySum.ratioOfRevenue > energyRatioTarget 
                            ? 'text-red-400 animate-pulse' 
                            : 'text-emerald-400'
                        }`}>
                          {mtdEnergySum.ratioOfRevenue > energyRatioTarget ? '⚠️ EXCEEDED' : '✅ SAFE'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-2xl border border-white/5 space-y-2 text-[10px] font-semibold text-slate-400">
                    <p className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Total Biaya Utilitas:</span>
                      <span className="text-white font-black">Rp {mtdEnergySum.totalCost.toLocaleString('id-ID')}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Omset Berjalan MTD:</span>
                      <span className="text-white font-black">Rp {mtdRevenue.toLocaleString('id-ID')}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Stacked Daily chart for energy */}
              <div className="lg:col-span-7 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-chart-line text-slate-500"></i> Tren Penggunaan Energi Harian (Rupiah)
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Grafik daily costs utilitas listrik, air, dan gas sepanjang bulan</p>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={energyDailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="elecGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="gasGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                        <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={8} tickFormatter={(val) => `Rp ${val / 1000}rb`} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '11px', color: '#f8fafc' }}
                        />
                        <Area type="monotone" dataKey="Listrik (Rp)" stroke="#fbbf24" stackId="1" fill="url(#elecGrad)" />
                        <Area type="monotone" dataKey="Air (Rp)" stroke="#3b82f6" stackId="1" fill="url(#waterGrad)" />
                        <Area type="monotone" dataKey="Gas (Rp)" stroke="#10b981" stackId="1" fill="url(#gasGrad)" />
                        <Legend wrapperStyle={{ fontSize: '8px', textTransform: 'uppercase' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* ==================== TAB 5: CONTINGENCY FLOOR ORDER ==================== */}
        {activeTab === 'floor' && (
          <motion.div
            key="floor-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Control & Header */}
            <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Dashboard Contingency Floor Order</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Main Kitchen, Main Store, Chemical, Guest Supplies, and Cash Floor Order Guardrail</span>
              </div>
              <button
                onClick={() => {
                  setTempFloorRatioTarget(String(floorRatioTarget));
                  setIsEditingFloorRatioTarget(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-md text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <i className="fas fa-percent"></i> Atur Target Floor Order
              </button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-boxes-packing"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">TOTAL FLOOR ORDER MTD</p>
                <p className="text-sm md:text-base font-black text-white font-mono">Rp {actualFloorTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-indigo-400 mt-2 uppercase tracking-tight">KITCHEN+STORE+CHEM+GUEST+CASH</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-utensils"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">MAIN KITCHEN MTD</p>
                <p className="text-sm md:text-base font-black text-amber-400 font-mono">Rp {mainKitchenTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Kitchen stock and orders</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-store"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">MAIN STORE MTD</p>
                <p className="text-sm md:text-base font-black text-blue-400 font-mono">Rp {mainStoreTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Store order inventory</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-flask"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">CHEMICAL MTD</p>
                <p className="text-sm md:text-base font-black text-emerald-400 font-mono">Rp {chemicalTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Chemicals and cleaning</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-pump-soap"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">GUEST SUPPLIES MTD</p>
                <p className="text-sm md:text-base font-black text-purple-400 font-mono">Rp {guestSuppliesTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Guest amenities</p>
              </div>

              <div className="glass-card bg-slate-900/40 border border-white/5 p-4 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-4 right-4 text-white/5 text-4xl"><i className="fas fa-receipt"></i></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 font-sans">CASH FLOOR ORDER MTD</p>
                <p className="text-sm md:text-base font-black text-indigo-400 font-mono">Rp {cashTotal.toLocaleString('id-ID')}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-tight">Cash purchases and others</p>
              </div>
            </div>

            {/* Gauge and Diagnostic details */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Ratio Gauge Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-gauge-high text-indigo-400"></i> Rasio Floor Order vs Omset
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Target rasio biaya Floor Order terhadap omset berjalan</p>
                  </div>

                  <div className="my-8 text-center space-y-3">
                    <div className="inline-flex flex-col justify-center items-center p-8 bg-slate-950 rounded-full border-4 border-indigo-500/20 h-40 w-40 relative">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Rasio MTD</span>
                      <span className={`text-2xl font-black font-mono my-1 ${
                        isFloorExceeded ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {actualFloorRatio.toFixed(2)}%
                      </span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase">dari Omset</span>
                    </div>

                    <div className="flex justify-center gap-6 text-[10px] font-black uppercase">
                      <div>
                        <span className="text-slate-500 block">TARGET RATIO</span>
                        <span className="text-white text-xs">{floorRatioTarget.toFixed(1)}%</span>
                      </div>
                      <div className="border-r border-white/10"></div>
                      <div>
                        <span className="text-slate-500 block">STATUS</span>
                        <span className={`text-xs ${
                          isFloorExceeded 
                            ? 'text-red-400 animate-pulse' 
                            : 'text-emerald-400'
                        }`}>
                          {isFloorExceeded ? '⚠️ EXCEEDED' : '✅ SAFE'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-2xl border border-white/5 space-y-2 text-[10px] font-semibold text-slate-400">
                    <p className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Total Floor Order:</span>
                      <span className="text-white font-black">Rp {actualFloorTotal.toLocaleString('id-ID')}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Omset Berjalan MTD:</span>
                      <span className="text-white font-black">Rp {mtdRevenue.toLocaleString('id-ID')}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Stacked Daily chart for floor order */}
              <div className="lg:col-span-7 space-y-4">
                <div className="glass-card bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-chart-line text-slate-500"></i> Tren Pengeluaran Floor Order Harian (Rupiah)
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Grafik daily costs seluruh kategori Floor Order sepanjang bulan</p>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={floorDailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="kitchenGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="storeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="chemicalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="guestGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                        <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={8} tickFormatter={(val) => `Rp ${val / 1000}rb`} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#ffffff10', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '11px', color: '#f8fafc' }}
                        />
                        <Area type="monotone" dataKey="Main Kitchen (Rp)" stroke="#f59e0b" stackId="1" fill="url(#kitchenGrad)" />
                        <Area type="monotone" dataKey="Main Store (Rp)" stroke="#3b82f6" stackId="1" fill="url(#storeGrad)" />
                        <Area type="monotone" dataKey="Chemical (Rp)" stroke="#10b981" stackId="1" fill="url(#chemicalGrad)" />
                        <Area type="monotone" dataKey="Guest Supplies (Rp)" stroke="#8b5cf6" stackId="1" fill="url(#guestGrad)" />
                        <Area type="monotone" dataKey="Cash / Other (Rp)" stroke="#6366f1" stackId="1" fill="url(#cashGrad)" />
                        <Legend wrapperStyle={{ fontSize: '8px', textTransform: 'uppercase' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>

            {/* List breakdown of floor categories */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              <div className="lg:col-span-5">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-layer-group text-slate-500"></i> Detail Kategori Floor Order
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Usage breakdown & ratio</p>
                  </div>
                  <div className="divide-y divide-white/5 space-y-4 pt-2">
                    {floorCategoriesList.map((cat, idx) => {
                      const catRatioOfRevenue = mtdRevenue > 0 ? (cat.value / mtdRevenue) * 100 : 0;
                      const catRatioOfActualSpent = actualFloorTotal > 0 ? (cat.value / actualFloorTotal) * 100 : 0;
                      return (
                        <div key={cat.name} className={`${idx > 0 ? 'pt-4' : ''} space-y-2 group`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-[11px] ${cat.color} group-hover:scale-105 transition-transform`}>
                                <i className={`fas ${cat.icon}`}></i>
                              </span>
                              <div>
                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{cat.name}</p>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{catRatioOfActualSpent.toFixed(1)}% dari Total Floor Order</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-white font-mono">Rp {cat.value.toLocaleString('id-ID')}</p>
                              <p className="text-[9px] font-black text-slate-400">{catRatioOfRevenue.toFixed(2)}% of Revenue</p>
                            </div>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(catRatioOfRevenue * 8, 100)}%` }}
                              className={`h-full rounded-full ${cat.barColor}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Transaction list table */}
              <div className="lg:col-span-7">
                <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-list text-slate-500"></i> Log Transaksi Floor Order MTD
                      </h3>
                      <p className="text-[9px] font-bold text-slate-500 uppercase">Daftar transaksi pengadaan Floor Order di bulan berjalan</p>
                    </div>
                    <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                      {monthlyFloorLedgerEntries.length} TRANSAKSI
                    </span>
                  </div>

                  <div className="max-h-96 overflow-y-auto pr-1 border border-white/5 rounded-2xl bg-slate-950/40">
                    {monthlyFloorLedgerEntries.length > 0 ? (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-[8px] font-black uppercase text-slate-500 tracking-wider">
                            <th className="p-3">Tanggal</th>
                            <th className="p-3">Kategori</th>
                            <th className="p-3">Nama Barang</th>
                            <th className="p-3 text-right">Qty</th>
                            <th className="p-3 text-right">Harga</th>
                            <th className="p-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-[10px] text-slate-300 font-semibold">
                          {monthlyFloorLedgerEntries.map((entry, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 text-slate-500 font-mono font-bold whitespace-nowrap">{entry.date.split('-').slice(1).join('/')}</td>
                              <td className="p-3 whitespace-nowrap">
                                <span className="px-1.5 py-0.5 bg-white/5 border border-white/5 rounded text-[8px] font-black uppercase">
                                  {entry.category}
                                </span>
                              </td>
                              <td className="p-3 text-white font-black max-w-[120px] truncate" title={entry.item}>{entry.item}</td>
                              <td className="p-3 text-right font-mono text-slate-400">{entry.qty}</td>
                              <td className="p-3 text-right font-mono text-slate-400">Rp {entry.price.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-right font-mono text-white font-black">Rp {entry.total.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="py-12 text-center text-slate-500 space-y-2">
                        <i className="fas fa-boxes-packing text-3xl opacity-20"></i>
                        <p className="text-xs font-black uppercase tracking-wider">TIDAK ADA TRANSAKSI FLOOR ORDER</p>
                        <p className="text-[9px] font-bold uppercase">Belum ada data ledger yang diinput untuk bulan ini</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Matriks Rekapan Harian Chemical */}
            <div className="glass-card bg-slate-900/20 border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <i className="fas fa-table text-indigo-400"></i> Matriks Rekapan Harian Item Chemical
                  </h3>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Rekapan kuantiti harian item chemical yang diinput sepanjang periode bulan ini</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => scrollChemicalMatrix('LEFT')}
                    className="w-8 h-8 rounded-lg bg-slate-950 text-white hover:bg-indigo-600 transition-all flex items-center justify-center border border-white/5 active:scale-95 cursor-pointer"
                    title="Scroll Kiri"
                  >
                    <i className="fas fa-arrow-left text-[10px]"></i>
                  </button>
                  <button
                    onClick={() => scrollChemicalMatrix('RIGHT')}
                    className="w-8 h-8 rounded-lg bg-slate-950 text-white hover:bg-indigo-600 transition-all flex items-center justify-center border border-white/5 active:scale-95 cursor-pointer"
                    title="Scroll Kanan"
                  >
                    <i className="fas fa-arrow-right text-[10px]"></i>
                  </button>
                </div>
              </div>

              <div className="p-1">
                <div
                  ref={chemicalMatrixScrollRef}
                  className="overflow-x-auto custom-scrollbar border border-white/5 rounded-2xl bg-slate-950/40"
                >
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-slate-900/80">
                        <th className="p-3 border-b border-r border-white/10 sticky left-0 bg-slate-900 z-20 min-w-[160px] max-w-[200px]">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                            Nama Item Chemical
                          </span>
                        </th>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                          const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                          const isFuture = dateStr > filters.startDate;
                          return (
                            <th
                              key={day}
                              className={`p-2 border-b border-r border-white/10 text-center min-w-[45px] ${
                                isFuture ? 'opacity-40' : ''
                              }`}
                            >
                              <div className="text-[9px] font-black text-slate-400 font-mono">
                                {day}
                              </div>
                              <div className="text-[6px] text-slate-600 font-bold uppercase">
                                {new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(new Date(selectedYear, selectedMonth, day))}
                              </div>
                            </th>
                          );
                        })}
                        <th className="p-3 border-b border-r border-white/10 text-center min-w-[65px] bg-slate-900 sticky right-[90px] z-20">
                          <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                            Total Qty
                          </span>
                        </th>
                        <th className="p-3 border-b border-white/10 text-right min-w-[100px] bg-slate-900 sticky right-0 z-20">
                          <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                            Total Biaya
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-[10px] text-slate-300">
                      {chemicalMatrixData.length > 0 ? (
                        chemicalMatrixData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3 border-r border-white/10 font-black text-white sticky left-0 bg-slate-950 z-10 truncate max-w-[160px]" title={row.name}>
                              {row.name}
                            </td>
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                              const val = row.dailyQty[day] || 0;
                              return (
                                <td
                                  key={day}
                                  className={`p-2 border-r border-white/10 text-center font-mono ${
                                    val > 0 ? 'text-indigo-400 font-black bg-indigo-500/5' : 'text-slate-700'
                                  }`}
                                >
                                  {val > 0 ? val : '-'}
                                </td>
                              );
                            })}
                            <td className="p-3 border-r border-white/10 text-center font-black font-mono text-white bg-slate-950 sticky right-[90px] z-10">
                              {row.totalQty}
                            </td>
                            <td className="p-3 text-right font-black font-mono text-emerald-400 bg-slate-950 sticky right-0 z-10">
                              Rp {row.totalCost.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={daysInMonth + 3} className="py-12 text-center text-slate-500 space-y-2">
                            <i className="fas fa-flask text-3xl opacity-20 block mx-auto"></i>
                            <span className="text-xs font-black uppercase tracking-wider block">Tidak Ada Data Matriks Chemical</span>
                            <span className="text-[9px] font-bold uppercase block">Belum ada item chemical yang diinput pada periode bulan ini</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-indigo-950/20 border border-indigo-500/10 p-4 rounded-2xl flex items-start gap-3">
                <span className="text-indigo-400 text-sm mt-0.5"><i className="fas fa-info-circle"></i></span>
                <div className="text-[9.5px] font-semibold text-slate-400 leading-normal">
                  <span className="text-indigo-300 font-black">INFORMASI MATRIKS:</span> Matriks di atas menyajikan persebaran jumlah item chemical yang dikeluarkan/dibeli setiap harinya. Membantu tim operasional memonitor efisiensi penggunaan chemical serta menganalisis pola pembelian harian.
                </div>
              </div>
            </div>

          </motion.div>
        )}

        {activeTab === 'weekly-pettycash' && (
          <motion.div
            key="weekly-pettycash-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Header & Mode Switcher */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900/30 p-5 rounded-3xl border border-white/5 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm">
                    <i className="fas fa-file-invoice-dollar"></i>
                  </span>
                  <div>
                    <h2 className="text-base font-black text-white uppercase tracking-tight">
                      Laporan Weekly Petty Cash Expense & Efisiensi Anggaran
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      Perbandingan OPEX, Floor Order, & Overtime vs Last Month (Tanggal & Week Sama)
                    </p>
                  </div>
                </div>
              </div>

              {/* Weekly Mode Toggle */}
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-white/10 self-stretch md:self-auto justify-center">
                <span className="text-[9px] font-black text-slate-500 uppercase px-2">Skema Minggu:</span>
                <button
                  type="button"
                  onClick={() => setWeeklyMode('CUTOFF')}
                  className={`px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 ${
                    weeklyMode === 'CUTOFF'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Hitungan Per-Weekly berdasarkan Cut-Off Payroll (26 m-1 s.d. 25 m)"
                >
                  <i className="fas fa-calendar-check"></i> Cutoff Payroll (26 - 25)
                </button>
                <button
                  type="button"
                  onClick={() => setWeeklyMode('CALENDAR')}
                  className={`px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 ${
                    weeklyMode === 'CALENDAR'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Hitungan Per-Weekly berdasarkan Kalender (01 s.d. Akhir Bulan)"
                >
                  <i className="fas fa-calendar-alt"></i> Kalender (01 - 31)
                </button>
              </div>
            </div>

            {/* KPI Summary Scorecard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Petty Cash Expense MTD */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
                <div className="absolute top-4 right-4 text-emerald-500/10 text-4xl">
                  <i className="fas fa-wallet"></i>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  TOTAL PETTY CASH EXPENSE MTD
                </p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">
                  Rp {weeklyPettyCashReport.mtdCur.totalPettyCash.toLocaleString('id-ID')}
                </p>
                <div className="text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1 flex-wrap">
                  <span className="text-blue-400">OPEX: Rp {(weeklyPettyCashReport.mtdCur.opex / 1000).toFixed(0)}rb</span>
                  <span>•</span>
                  <span className="text-amber-400">Floor: Rp {(weeklyPettyCashReport.mtdCur.floor / 1000).toFixed(0)}rb</span>
                  <span>•</span>
                  <span className="text-purple-400">OT: Rp {(weeklyPettyCashReport.mtdCur.overtime / 1000).toFixed(0)}rb</span>
                </div>
              </div>

              {/* Actual Revenue MTD */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
                <div className="absolute top-4 right-4 text-indigo-500/10 text-4xl">
                  <i className="fas fa-chart-line"></i>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  ACTUAL REVENUE MTD
                </p>
                <p className="text-xl md:text-2xl font-black text-indigo-300 font-mono">
                  Rp {weeklyPettyCashReport.mtdCur.revenue.toLocaleString('id-ID')}
                </p>
                <div className="text-[9px] font-bold text-slate-400 mt-2">
                  Total Omset Penjualan Berjalan
                </div>
              </div>

              {/* Rasio % vs Revenue */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
                <div className="absolute top-4 right-4 text-amber-500/10 text-4xl">
                  <i className="fas fa-percent"></i>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  RASIO EXPENSE VS REVENUE
                </p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-xl md:text-2xl font-black font-mono ${
                    weeklyPettyCashReport.mtdCur.ratio <= weeklyPettyCashReport.totalTargetPercent
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}>
                    {weeklyPettyCashReport.mtdCur.ratio.toFixed(2)}%
                  </p>
                  <span className="text-[10px] font-bold text-slate-500">
                    Target: {weeklyPettyCashReport.totalTargetPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-[9px] font-bold mt-2">
                  {weeklyPettyCashReport.mtdCur.ratio <= weeklyPettyCashReport.totalTargetPercent ? (
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase font-black">
                      <i className="fas fa-shield-check"></i> Efisien & Aman
                    </span>
                  ) : (
                    <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase font-black">
                      <i className="fas fa-exclamation-triangle"></i> Melampaui Target
                    </span>
                  )}
                </div>
              </div>

              {/* Efisiensi Biaya MTD vs Bulan Lalu */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
                <div className="absolute top-4 right-4 text-purple-500/10 text-4xl">
                  <i className="fas fa-piggy-bank"></i>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  EFISIENSI BIAYA MTD (VS BULAN LALU)
                </p>
                <p className={`text-xl md:text-2xl font-black font-mono ${
                  weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  Rp {Math.abs(weeklyPettyCashReport.mtdEfficiencyTotal).toLocaleString('id-ID')}
                </p>
                <div className="text-[9px] font-bold text-slate-400 mt-2">
                  {weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? (
                    <span className="text-emerald-400 uppercase font-black">
                      <i className="fas fa-arrow-down"></i> Hemat vs Bulan Lalu (Rp {weeklyPettyCashReport.mtdLast.totalPettyCash.toLocaleString('id-ID')})
                    </span>
                  ) : (
                    <span className="text-rose-400 uppercase font-black">
                      <i className="fas fa-arrow-up"></i> Meningkat vs Bulan Lalu (Rp {weeklyPettyCashReport.mtdLast.totalPettyCash.toLocaleString('id-ID')})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Target Budget Control Bar */}
            <div className="bg-slate-900/40 border border-white/5 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center gap-2">
                <i className="fas fa-sliders text-indigo-400"></i>
                <span className="font-black text-white uppercase tracking-wider">Komposisi Batas Anggaran:</span>
                <span className="text-slate-400">
                  OPEX: <strong className="text-blue-400">{budgetPercentage}%</strong> | Floor Order: <strong className="text-amber-400">{floorRatioTarget}%</strong> | Overtime: <strong className="text-purple-400">{overtimeBudgetPercent}%</strong> = Total <strong className="text-emerald-400">{weeklyPettyCashReport.totalTargetPercent}%</strong> dari Revenue
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTempBudget(String(budgetPercentage));
                    setIsEditingBudget(true);
                  }}
                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg font-black uppercase text-[9px] transition-all cursor-pointer"
                >
                  Edit OPEX Target
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTempFloorRatioTarget(String(floorRatioTarget));
                    setIsEditingFloorRatioTarget(true);
                  }}
                  className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg font-black uppercase text-[9px] transition-all cursor-pointer"
                >
                  Edit Floor Target
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTempOvertimeBudgetPercent(String(overtimeBudgetPercent));
                    setIsEditingOvertimeBudgetPercent(true);
                  }}
                  className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg font-black uppercase text-[9px] transition-all cursor-pointer"
                >
                  Edit Overtime Target
                </button>
              </div>
            </div>

            {/* DETAILED COMPARISON TABLE */}
            <div className="glass-card bg-slate-900/40 border border-white/5 rounded-3xl p-6 overflow-hidden">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-table text-emerald-400"></i> Tabel Perbandingan Weekly Petty Cash (This Month vs Last Month)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Membandingkan Pengeluaran Tiap Minggu pada Tanggal & Week yang Sama
                  </p>
                </div>
                <div className="text-[9px] font-black uppercase text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-white/5">
                  Bulan Ini: <span className="text-emerald-400 font-mono">{MONTH_NAMES[selectedMonth]} {selectedYear}</span> vs Bulan Lalu: <span className="text-indigo-400 font-mono">{MONTH_NAMES[lastMonthIdx]} {lastMonthYear}</span>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar border border-white/5 rounded-2xl bg-slate-950/60">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-slate-900/90 text-[9px] uppercase tracking-wider font-black text-slate-400 border-b border-white/10">
                      <th className="p-3.5 border-r border-white/10 sticky left-0 bg-slate-900 z-20 min-w-[170px]">Periode Minggu</th>
                      <th className="p-3.5 text-center bg-emerald-950/20 text-emerald-300 border-r border-white/10" colSpan={6}>
                        BULAN INI ({MONTH_NAMES[selectedMonth]} {selectedYear})
                      </th>
                      <th className="p-3.5 text-center bg-indigo-950/20 text-indigo-300 border-r border-white/10" colSpan={3}>
                        BULAN LALU ({MONTH_NAMES[lastMonthIdx]} {lastMonthYear})
                      </th>
                      <th className="p-3.5 text-center bg-amber-950/20 text-amber-300 border-r border-white/10" colSpan={2}>
                        KOMPARASI VS LAST MONTH
                      </th>
                      <th className="p-3.5 text-center bg-purple-950/20 text-purple-300" colSpan={3}>
                        EFISIENSI VS BIAYA BULAN LALU
                      </th>
                    </tr>
                    <tr className="bg-slate-900/60 text-[8px] uppercase tracking-widest font-black text-slate-400 border-b border-white/10">
                      {/* Periode */}
                      <th className="p-2 border-r border-white/10 sticky left-0 bg-slate-900 z-20">Week & Tanggal</th>
                      
                      {/* Bulan Ini */}
                      <th className="p-2 text-right bg-emerald-950/10 text-emerald-400">Revenue</th>
                      <th className="p-2 text-right bg-emerald-950/10 text-blue-400">OPEX</th>
                      <th className="p-2 text-right bg-emerald-950/10 text-amber-400">Floor Order</th>
                      <th className="p-2 text-right bg-emerald-950/10 text-purple-400">Overtime</th>
                      <th className="p-2 text-right bg-emerald-950/10 font-bold text-white border-r border-white/10">Total Petty Cash</th>
                      <th className="p-2 text-center bg-emerald-950/10 text-emerald-300 border-r border-white/10">% vs Rev</th>

                      {/* Bulan Lalu */}
                      <th className="p-2 text-right bg-indigo-950/10 text-indigo-400">Revenue</th>
                      <th className="p-2 text-right bg-indigo-950/10 font-bold text-white border-r border-white/10">Total Petty Cash</th>
                      <th className="p-2 text-center bg-indigo-950/10 text-indigo-300 border-r border-white/10">% vs Rev</th>

                      {/* Komparasi */}
                      <th className="p-2 text-right bg-amber-950/10 text-amber-300">Selisih Rp</th>
                      <th className="p-2 text-center bg-amber-950/10 text-amber-300 border-r border-white/10">Growth %</th>

                      {/* Efisiensi */}
                      <th className="p-2 text-right bg-purple-950/10 text-purple-300">Biaya Bulan Lalu</th>
                      <th className="p-2 text-right bg-purple-950/10 text-purple-300">Efisiensi / Hemat Rp</th>
                      <th className="p-2 text-center bg-purple-950/10 text-purple-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[10px]">
                    {weeklyPettyCashReport.weeklyRows.map((r) => {
                      const isEfficient = r.efficiencyTotal >= 0;
                      const isExpenseIncreased = r.variancePettyCash > 0;

                      return (
                        <tr key={r.weekNum} className="hover:bg-white/5 transition-all">
                          {/* Week & Tanggal */}
                          <td className="p-3 sticky left-0 bg-slate-900/95 z-20 border-r border-white/10 font-sans">
                            <div className="font-black text-white text-[11px]">{r.weekName}</div>
                            <div className="text-[8.5px] font-bold text-slate-400 tracking-tight mt-0.5">
                              {r.curDateLabel}
                            </div>
                            <div className="text-[7.5px] text-indigo-400/80 font-normal">
                              (Lalu: {r.lastDateLabel})
                            </div>
                          </td>

                          {/* Bulan Ini */}
                          <td className="p-3 text-right text-emerald-400 bg-emerald-950/5">
                            Rp {r.cur.revenue.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right text-blue-300 bg-emerald-950/5">
                            Rp {r.cur.opex.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right text-amber-300 bg-emerald-950/5">
                            Rp {r.cur.floor.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right text-purple-300 bg-emerald-950/5">
                            Rp {r.cur.overtime.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-black text-white bg-emerald-950/10 border-r border-white/10">
                            Rp {r.cur.totalPettyCash.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center text-emerald-300 font-bold bg-emerald-950/10 border-r border-white/10">
                            {r.cur.ratio.toFixed(2)}%
                          </td>

                          {/* Bulan Lalu */}
                          <td className="p-3 text-right text-indigo-300 bg-indigo-950/5">
                            Rp {r.last.revenue.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-200 bg-indigo-950/10 border-r border-white/10">
                            Rp {r.last.totalPettyCash.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center text-indigo-300 font-bold bg-indigo-950/10 border-r border-white/10">
                            {r.last.ratio.toFixed(2)}%
                          </td>

                          {/* Komparasi */}
                          <td className={`p-3 text-right font-bold bg-amber-950/5 ${
                            isExpenseIncreased ? 'text-rose-400' : 'text-emerald-400'
                          }`}>
                            {isExpenseIncreased ? '+' : ''}Rp {r.variancePettyCash.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center bg-amber-950/5 border-r border-white/10">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              isExpenseIncreased ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {isExpenseIncreased ? '▲' : '▼'} {Math.abs(r.variancePct).toFixed(1)}%
                            </span>
                          </td>

                          {/* Efisiensi */}
                          <td className="p-3 text-right text-purple-300 bg-purple-950/5">
                            Rp {r.last.totalPettyCash.toLocaleString('id-ID')}
                          </td>
                          <td className={`p-3 text-right font-bold bg-purple-950/5 ${
                            isEfficient ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isEfficient ? '+' : ''}Rp {r.efficiencyTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center bg-purple-950/5">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              isEfficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {isEfficient ? 'EFISIEN' : 'PEMBOROSAN'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* TOTAL MTD ROW */}
                    <tr className="bg-slate-900 text-[10px] font-black border-t-2 border-white/20">
                      <td className="p-3.5 sticky left-0 bg-slate-900 z-20 border-r border-white/10 font-sans text-white uppercase tracking-wider">
                        TOTAL MTD (SUM)
                      </td>

                      {/* Bulan Ini */}
                      <td className="p-3.5 text-right text-emerald-400 bg-emerald-950/30">
                        Rp {weeklyPettyCashReport.mtdCur.revenue.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-right text-blue-300 bg-emerald-950/30">
                        Rp {weeklyPettyCashReport.mtdCur.opex.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-right text-amber-300 bg-emerald-950/30">
                        Rp {weeklyPettyCashReport.mtdCur.floor.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-right text-purple-300 bg-emerald-950/30">
                        Rp {weeklyPettyCashReport.mtdCur.overtime.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-right text-white bg-emerald-950/40 border-r border-white/10 text-xs">
                        Rp {weeklyPettyCashReport.mtdCur.totalPettyCash.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-center text-emerald-300 bg-emerald-950/40 border-r border-white/10">
                        {weeklyPettyCashReport.mtdCur.ratio.toFixed(2)}%
                      </td>

                      {/* Bulan Lalu */}
                      <td className="p-3.5 text-right text-indigo-300 bg-indigo-950/30">
                        Rp {weeklyPettyCashReport.mtdLast.revenue.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-right text-slate-200 bg-indigo-950/40 border-r border-white/10 text-xs">
                        Rp {weeklyPettyCashReport.mtdLast.totalPettyCash.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-center text-indigo-300 bg-indigo-950/40 border-r border-white/10">
                        {weeklyPettyCashReport.mtdLast.ratio.toFixed(2)}%
                      </td>

                      {/* Komparasi */}
                      <td className={`p-3.5 text-right bg-amber-950/30 ${
                        weeklyPettyCashReport.mtdVariancePettyCash > 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {weeklyPettyCashReport.mtdVariancePettyCash > 0 ? '+' : ''}Rp {weeklyPettyCashReport.mtdVariancePettyCash.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-center bg-amber-950/30 border-r border-white/10">
                        <span className={`px-2 py-1 rounded text-[8.5px] font-black uppercase ${
                          weeklyPettyCashReport.mtdVariancePettyCash > 0 ? 'bg-rose-500/30 text-rose-200' : 'bg-emerald-500/30 text-emerald-200'
                        }`}>
                          {weeklyPettyCashReport.mtdVariancePettyCash > 0 ? '▲' : '▼'} {Math.abs(weeklyPettyCashReport.mtdVariancePct).toFixed(1)}%
                        </span>
                      </td>

                      {/* Efisiensi */}
                      <td className="p-3.5 text-right text-purple-300 bg-purple-950/30">
                        Rp {weeklyPettyCashReport.mtdLast.totalPettyCash.toLocaleString('id-ID')}
                      </td>
                      <td className={`p-3.5 text-right bg-purple-950/30 text-xs ${
                        weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? '+' : ''}Rp {weeklyPettyCashReport.mtdEfficiencyTotal.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5 text-center bg-purple-950/30">
                        <span className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase ${
                          weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40' : 'bg-rose-500/30 text-rose-200 border border-rose-500/40'
                        }`}>
                          {weeklyPettyCashReport.mtdEfficiencyTotal >= 0 ? 'EFISIEN' : 'PEMBOROSAN'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* VISUAL CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Expense Comparison vs Last Month */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <div className="mb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-chart-bar text-emerald-400"></i> Grafik Komparasi Weekly Petty Cash (Bulan Ini vs Bulan Lalu)
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Total Pengeluaran Petty Cash per Minggu
                  </p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyPettyCashReport.weeklyRows.map((r) => ({
                        name: r.weekName,
                        'Bulan Ini (Rp)': r.cur.totalPettyCash,
                        'Bulan Lalu (Rp)': r.last.totalPettyCash,
                      }))}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={9}
                        tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                        formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                      <Bar dataKey="Bulan Ini (Rp)" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Bulan Lalu (Rp)" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Efisiensi & Tren Expense vs Bulan Lalu */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <div className="mb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-chart-area text-purple-400"></i> Grafik Tren Pengeluaran (Bulan Lalu vs Bulan Ini)
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Perbandingan Efisiensi Pengeluaran per Minggu terhadap Bulan Lalu
                  </p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={weeklyPettyCashReport.weeklyRows.map((r) => ({
                        name: r.weekName,
                        'Biaya Bulan Lalu (Rp)': r.last.totalPettyCash,
                        'Biaya Bulan Ini (Rp)': r.cur.totalPettyCash,
                      }))}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={9}
                        tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                        formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                      <Area type="monotone" dataKey="Biaya Bulan Lalu (Rp)" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="Biaya Bulan Ini (Rp)" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* THREE CATEGORY BREAKDOWN CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* OPEX Card */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase text-blue-400 tracking-widest block">
                      1. OPEX PETTY CASH
                    </span>
                    <h4 className="text-base font-black text-white font-mono mt-0.5">
                      Rp {weeklyPettyCashReport.mtdCur.opex.toLocaleString('id-ID')}
                    </h4>
                  </div>
                  <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">
                    <i className="fas fa-wallet"></i>
                  </span>
                </div>
                <div className="text-[10px] space-y-1.5 pt-2 border-t border-white/5 font-bold">
                  <div className="flex justify-between text-slate-400">
                    <span>Pengeluaran Bulan Lalu:</span>
                    <span className="text-slate-200">Rp {weeklyPettyCashReport.mtdLast.opex.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Efisiensi vs Bulan Lalu:</span>
                    <span className={`font-mono ${
                      weeklyPettyCashReport.mtdEfficiencyOpex >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {weeklyPettyCashReport.mtdEfficiencyOpex >= 0 ? 'Hemat ' : 'Meningkat '}
                      Rp {Math.abs(weeklyPettyCashReport.mtdEfficiencyOpex).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Floor Order Card */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase text-amber-400 tracking-widest block">
                      2. FLOOR ORDER
                    </span>
                    <h4 className="text-base font-black text-white font-mono mt-0.5">
                      Rp {weeklyPettyCashReport.mtdCur.floor.toLocaleString('id-ID')}
                    </h4>
                  </div>
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                    <i className="fas fa-boxes-packing"></i>
                  </span>
                </div>
                <div className="text-[10px] space-y-1.5 pt-2 border-t border-white/5 font-bold">
                  <div className="flex justify-between text-slate-400">
                    <span>Pengeluaran Bulan Lalu:</span>
                    <span className="text-slate-200">Rp {weeklyPettyCashReport.mtdLast.floor.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Efisiensi vs Bulan Lalu:</span>
                    <span className={`font-mono ${
                      weeklyPettyCashReport.mtdEfficiencyFloor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {weeklyPettyCashReport.mtdEfficiencyFloor >= 0 ? 'Hemat ' : 'Meningkat '}
                      Rp {Math.abs(weeklyPettyCashReport.mtdEfficiencyFloor).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Overtime Card */}
              <div className="glass-card bg-slate-900/40 border border-white/5 p-5 rounded-3xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase text-purple-400 tracking-widest block">
                      3. OVERTIME EXPENSE
                    </span>
                    <h4 className="text-base font-black text-white font-mono mt-0.5">
                      Rp {weeklyPettyCashReport.mtdCur.overtime.toLocaleString('id-ID')}
                    </h4>
                  </div>
                  <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs">
                    <i className="fas fa-user-clock"></i>
                  </span>
                </div>
                <div className="text-[10px] space-y-1.5 pt-2 border-t border-white/5 font-bold">
                  <div className="flex justify-between text-slate-400">
                    <span>Pengeluaran Bulan Lalu:</span>
                    <span className="text-slate-200">Rp {weeklyPettyCashReport.mtdLast.overtime.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Efisiensi vs Bulan Lalu:</span>
                    <span className={`font-mono ${
                      weeklyPettyCashReport.mtdEfficiencyOt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {weeklyPettyCashReport.mtdEfficiencyOt >= 0 ? 'Hemat ' : 'Meningkat '}
                      Rp {Math.abs(weeklyPettyCashReport.mtdEfficiencyOt).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </motion.div>
        )}

      </AnimatePresence>

      {/* ==================================== MODAL DIALOGS ==================================== */}
      
      {/* 0. INPUT BUDGET PER KATEGORI EXPENSE MODAL */}
      <AnimatePresence>
        {isEditingCategoryBudgets && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-2xl relative shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button
                onClick={() => setIsEditingCategoryBudgets(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-coins text-emerald-400"></i> Input Budget Kategori Expense
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">
                    Atur target budget bulanan (Rp) untuk Commodity, Non Commodity, Chemical, Maintenance, ATK, dan Asset ({MONTH_NAMES[selectedMonth]} {selectedYear}).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'commodity', label: 'COMMODITY', icon: 'fa-box', color: 'text-emerald-400' },
                    { key: 'nonCommodity', label: 'NON COMMODITY', icon: 'fa-boxes-packing', color: 'text-blue-400' },
                    { key: 'chemical', label: 'CHEMICAL', icon: 'fa-flask', color: 'text-teal-400' },
                    { key: 'maintenance', label: 'MAINTENANCE', icon: 'fa-tools', color: 'text-red-400' },
                    { key: 'atk', label: 'ATK', icon: 'fa-pencil-ruler', color: 'text-pink-400' },
                    { key: 'asset', label: 'ASSET', icon: 'fa-couch', color: 'text-amber-400' },
                  ].map((cat) => {
                    const currentVal = tempCategoryBudgets[cat.key as keyof typeof tempCategoryBudgets] || '';
                    const numVal = parseFloat(currentVal) || 0;

                    return (
                      <div key={cat.key} className="bg-slate-950 p-4 rounded-2xl border border-white/5 space-y-2">
                        <label className="block text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
                          <i className={`fas ${cat.icon} ${cat.color}`}></i>
                          {cat.label}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 pr-12 focus:ring-2 focus:ring-emerald-500 outline-none font-black text-sm text-white"
                            value={currentVal}
                            onChange={(e) => setTempCategoryBudgets((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                            placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">IDR</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 text-right">
                          Preview: Rp {numVal.toLocaleString('id-ID')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total Budget Preview */}
                {(() => {
                  const totalCategoryVal = Object.values(tempCategoryBudgets).reduce((acc: number, curr: string) => acc + (parseFloat(curr) || 0), 0);
                  return (
                    <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">TOTAL BUDGET KATEGORI:</span>
                      <span className="text-base font-black text-emerald-400">
                        Rp {(totalCategoryVal as any).toLocaleString('id-ID')}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingCategoryBudgets(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveCategoryBudgets}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg"
                  >
                    Simpan Budget
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1. INPUT BUDGET PERCENTAGE POPUP MODAL */}
      <AnimatePresence>
        {isEditingBudget && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingBudget(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-percent text-indigo-500"></i> Set MTD Budget Opex
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bulan: {MONTH_NAMES[selectedMonth]} {selectedYear}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Budget Opex (%) dari MTD Revenue</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempBudget}
                        onChange={(e) => setTempBudget(e.target.value)}
                        placeholder="Contoh: 15"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-sm">%</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl space-y-1.5 border border-white/5">
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                      <span>Total Revenue Berjalan (Actual):</span>
                      <span className="text-white">Rp {mtdRevenue.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase border-t border-white/5 pt-1.5">
                      <span>MTD Opex Budget Limit:</span>
                      <span className="text-indigo-400 font-bold">
                        Rp {((parseFloat(tempBudget) || 0) / 100 * mtdRevenue).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingBudget(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveBudget}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Budget
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. EDIT BELANJA CONTINGENCY LIMIT POPUP MODAL */}
      <AnimatePresence>
        {isEditingBelanjaLimit && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingBelanjaLimit(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-shopping-basket text-indigo-500"></i> Set Limit Kontingensi Belanja
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pengadaan & Petty Cash MTD</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Batas Belanja Maksimal (Rupiah)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempBelanjaLimit}
                        onChange={(e) => setTempBelanjaLimit(e.target.value)}
                        placeholder="Contoh: 35000000"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">IDR</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingBelanjaLimit(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveBelanjaLimit}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Batas Limit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. EDIT OVERTIME WEEKLY HOURS LIMIT POPUP MODAL */}
      <AnimatePresence>
        {isEditingOvertimeHourLimit && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingOvertimeHourLimit(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-user-clock text-indigo-500"></i> Set Limit Jam Lembur Mingguan
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Maksimal jam kerja lembur crew per minggu</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Batas Jam Lembur (Jam/Minggu)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempOvertimeHourLimit}
                        onChange={(e) => setTempOvertimeHourLimit(e.target.value)}
                        placeholder="Contoh: 12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">Jam</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingOvertimeHourLimit(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveOvertimeHourLimit}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Jam Limit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. EDIT ENERGY COST REVENUE RATIO POPUP MODAL */}
      <AnimatePresence>
        {isEditingEnergyRatioTarget && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingEnergyRatioTarget(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-bolt text-indigo-500"></i> Set Target Rasio Utilitas Energi
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Persentase Target Kontingensi vs Omset Berjalan</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Batas Rasio Energi (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempEnergyRatioTarget}
                        onChange={(e) => setTempEnergyRatioTarget(e.target.value)}
                        placeholder="Contoh: 4.0"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingEnergyRatioTarget(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveEnergyRatioTarget}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Rasio Target
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4.5. EDIT FLOOR ORDER RATIO POPUP MODAL */}
      <AnimatePresence>
        {isEditingFloorRatioTarget && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingFloorRatioTarget(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-boxes-packing text-indigo-500"></i> Set Target Rasio Floor Order
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Persentase Target Kontingensi vs Omset Berjalan</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Batas Rasio Floor Order (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempFloorRatioTarget}
                        onChange={(e) => setTempFloorRatioTarget(e.target.value)}
                        placeholder="Contoh: 3.0"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingFloorRatioTarget(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveFloorRatioTarget}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Rasio Target
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. EDIT WEEKDAY & WEEKEND REVENUE TARGETS & COST BELANJA PERCENT POPUP */}
      <AnimatePresence>
        {isEditingBelanjaTargets && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingBelanjaTargets(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-chart-line text-indigo-500"></i> Atur Target & Cost Belanja
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Konfigurasi Target Revenue & Jatah Cost Belanja</p>
                </div>

                <div className="space-y-4">
                  {/* Weekday Target */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Target Revenue Weekday (Senin - Jumat)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempWeekdayTarget}
                        onChange={(e) => setTempWeekdayTarget(e.target.value)}
                        placeholder="Contoh: 28000000"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">IDR</span>
                    </div>
                  </div>

                  {/* Weekend Target */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Target Revenue Weekend (Sabtu - Minggu)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempWeekendTarget}
                        onChange={(e) => setTempWeekendTarget(e.target.value)}
                        placeholder="Contoh: 35000000"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">IDR</span>
                    </div>
                  </div>

                  {/* Belanja Cost Percent */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Cost Belanja (% dari Rev -20%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempBelanjaCostPercent}
                        onChange={(e) => setTempBelanjaCostPercent(e.target.value)}
                        placeholder="Contoh: 40"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingBelanjaTargets(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveBelanjaTargets}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Target
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. EDIT OVERTIME BUDGET PERCENT POPUP */}
      <AnimatePresence>
        {isEditingOvertimeBudgetPercent && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setIsEditingOvertimeBudgetPercent(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-percent text-indigo-500"></i> Set Target Budget Overtime
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Persentase Target Overtime vs Omset Berjalan</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Batas Anggaran Lembur (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.05"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-white"
                        value={tempOvertimeBudgetPercent}
                        onChange={(e) => setTempOvertimeBudgetPercent(e.target.value)}
                        placeholder="Contoh: 1.50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingOvertimeBudgetPercent(false)}
                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveOvertimeBudgetPercent}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Simpan Target
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default OutletPerformanceModule;
