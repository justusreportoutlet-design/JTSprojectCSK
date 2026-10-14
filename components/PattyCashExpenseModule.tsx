import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet } from '../types';
import { OUTLETS, INITIAL_STATE } from '../constants';
import ShareActions from './ShareActions';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';
import ModuleDateMatrixSidebar from './ModuleDateMatrixSidebar';
import ModuleExecutiveKpis from './ModuleExecutiveKpis';
import DateRangeFilterBar from './DateRangeFilterBar';
import { generateWhatsAppExpenseText } from '../lib/whatsappTemplateHelper';
import { extractStateMtdRevenue, buildDailyMatrix } from '../lib/moduleAnalytics';
import BelanjaFullTanggalRecapTable, { RecapColumnDef, DayDetailItem } from './BelanjaFullTanggalRecapTable';
import RegionalPattyCashRecapTable from './RegionalPattyCashRecapTable';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, AppState> | Record<string, Record<string, AppState>> | any;
  selectedOutlet?: string;
  selectedArea?: string;
  isRegionalView?: boolean;
  onUpdate?: (updater: (prev: AppState) => AppState) => void;
  filters?: {
    month?: string;
    year?: string;
    startDate?: string;
    endDate?: string;
  };
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

interface PattyCashCategoryDef {
  key: string;
  label: string;
  ledgerKey: keyof AppState;
  expenseKey: string;
  icon: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

const PATTY_CASH_CATEGORIES: PattyCashCategoryDef[] = [
  { key: 'nonCommodity', label: 'Non-Commodity', ledgerKey: 'dailyNonCommodityLedger', expenseKey: 'nonCommodity', icon: 'fa-box-open', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400', badgeBg: 'bg-blue-950/60 border-blue-500/30', badgeText: 'text-blue-300' },
  { key: 'commodity', label: 'Commodity', ledgerKey: 'dailyCommodityLedger', expenseKey: 'commodity', icon: 'fa-shopping-basket', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400', badgeBg: 'bg-emerald-950/60 border-emerald-500/30', badgeText: 'text-emerald-300' },
  { key: 'maintenance', label: 'Maintenance', ledgerKey: 'dailyMaintenanceLedger', expenseKey: 'maintenance', icon: 'fa-tools', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400', badgeBg: 'bg-amber-950/60 border-amber-500/30', badgeText: 'text-amber-300' },
  { key: 'asset', label: 'Asset & Equipment', ledgerKey: 'dailyAssetLedger', expenseKey: 'asset', icon: 'fa-couch', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400', badgeBg: 'bg-purple-950/60 border-purple-500/30', badgeText: 'text-purple-300' },
  { key: 'casual', label: 'Casual / Daily Worker', ledgerKey: 'dailyCasualLedger', expenseKey: 'casual', icon: 'fa-users', color: 'border-rose-500/30 bg-rose-500/10 text-rose-400', badgeBg: 'bg-rose-950/60 border-rose-500/30', badgeText: 'text-rose-300' },
  { key: 'atk', label: 'ATK & Printing', ledgerKey: 'dailyAtkLedger', expenseKey: 'atk', icon: 'fa-print', color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400', badgeBg: 'bg-cyan-950/60 border-cyan-500/30', badgeText: 'text-cyan-300' },
  { key: 'cash', label: 'Petty Cash Lainnya', ledgerKey: 'dailyCashLedger', expenseKey: 'cash', icon: 'fa-money-bill-wave', color: 'border-teal-500/30 bg-teal-500/10 text-teal-400', badgeBg: 'bg-teal-950/60 border-teal-500/30', badgeText: 'text-teal-300' },
];

export interface MatrixPattyCashItem {
  key: string;
  name: string;
  categoryKey: string;
  categoryLabel: string;
  totalQty: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalSpend: number;
  txCount: number;
  outletSpend: Record<string, number>;
  outletQty: Record<string, number>;
  transactions: {
    date: string;
    outlet: string;
    qty: number;
    price: number;
    subtotal: number;
    pic: string;
    reason: string;
    division?: 'BAR' | 'KITCHEN';
  }[];
}

const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const PattyCashExpenseModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
  selectedArea = 'ALL',
  isRegionalView = false,
  onUpdate,
  filters,
  showToast
}) => {
  const currentDate = new Date();
  const currentMonthIdx = filters?.month ? Number(filters.month) : currentDate.getMonth();
  const currentYear = filters?.year ? Number(filters.year) : currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const defaultOutlet = isRegionalView 
    ? (propSelectedOutlet || 'ALL')
    : (propSelectedOutlet || 'SH THE BARN');

  const [activeOutlet, setActiveOutlet] = useState<string>(defaultOutlet);
  const [moduleTab, setModuleTab] = useState<'REGIONAL_RECAP' | 'INPUT' | 'MATRIX' | 'FULL_DATE'>(
    isRegionalView ? 'REGIONAL_RECAP' : 'INPUT'
  );
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'spend_desc' | 'spend_asc' | 'qty_desc' | 'name_asc'>('spend_desc');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MatrixPattyCashItem | null>(null);

  // Modals for Budget & Purchase Request WA
  const [isEditingBudgetModal, setIsEditingBudgetModal] = useState<boolean>(false);
  const [isPurchaseRequestModalOpen, setIsPurchaseRequestModalOpen] = useState<boolean>(false);

  // Input states
  const [inputDate, setInputDate] = useState<string>(() => {
    if (filters?.startDate) return filters.startDate;
    const now = new Date();
    if (now.getMonth() === selectedMonth && now.getFullYear() === selectedYear) {
      return toLocalDateStr(now);
    }
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  });
  const [inputCategory, setInputCategory] = useState<string>('nonCommodity');
  const [inputCommodityDivision, setInputCommodityDivision] = useState<'BAR' | 'KITCHEN'>('BAR');
  const [inputName, setInputName] = useState<string>('');
  const [inputQty, setInputQty] = useState<string>('1');
  const [inputPrice, setInputPrice] = useState<string>('');
  const [inputPic, setInputPic] = useState<string>('');
  const [inputReason, setInputReason] = useState<string>('');

  // Purchase Request Template Form States
  const formatPrDate = (dStr: string) => {
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const mIdx = parseInt(parts[1], 10) - 1;
        const year = parts[0];
        const monthEnglish = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ][mIdx] || 'August';
        return `${day} ${monthEnglish} ${year}`;
      }
    } catch (e) {
      // fallback
    }
    return dStr;
  };

  const [prOutlet, setPrOutlet] = useState<string>(defaultOutlet);
  const [prDate, setPrDate] = useState<string>(() => formatPrDate(inputDate));
  const [prAmount, setPrAmount] = useState<string>('± Rp.,-');
  const [prItems, setPrItems] = useState<string>('- ');
  const [prReason, setPrReason] = useState<string>('Kebutuhan Operasional');
  const [prLeader, setPrLeader] = useState<string>('');

  React.useEffect(() => {
    setPrOutlet(activeOutlet);
  }, [activeOutlet]);

  React.useEffect(() => {
    setPrDate(formatPrDate(inputDate));
  }, [inputDate]);

  React.useEffect(() => {
    if (!isRegionalView && propSelectedOutlet) {
      setActiveOutlet(propSelectedOutlet);
    } else if (isRegionalView) {
      setActiveOutlet(propSelectedOutlet || 'ALL');
    }
  }, [propSelectedOutlet, isRegionalView]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];
  const reportId = `patty-cash-expense-${activeOutlet}-${monthPrefix}`;

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const [filterStartDay, setFilterStartDay] = useState<number>(() => {
    if (filters?.startDate) {
      const p = parseInt(filters.startDate.split('-')[2], 10);
      if (!isNaN(p)) return p;
    }
    return 1;
  });

  const [filterEndDay, setFilterEndDay] = useState<number>(() => {
    if (filters?.endDate) {
      const p = parseInt(filters.endDate.split('-')[2], 10);
      if (!isNaN(p)) return p;
    }
    return new Date(currentYear, currentMonthIdx + 1, 0).getDate();
  });

  React.useEffect(() => {
    if (filterEndDay > daysInMonth) setFilterEndDay(daysInMonth);
    if (filterStartDay > daysInMonth) setFilterStartDay(1);
  }, [daysInMonth, filterEndDay, filterStartDay]);

  // Current day items across all categories
  const currentDayAllItems = useMemo(() => {
    const list: { catKey: string; catLabel: string; item: LedgerItem }[] = [];
    PATTY_CASH_CATEGORIES.forEach(cat => {
      const ledger = (data[cat.ledgerKey] as Record<string, LedgerItem[]>) || {};
      const dayList = ledger[inputDate] || [];
      dayList.forEach(it => {
        list.push({ catKey: cat.key, catLabel: cat.label, item: it });
      });
    });
    return list;
  }, [data, inputDate]);

  const currentDayTotal = useMemo(() => {
    return currentDayAllItems.reduce((acc, row) => acc + ((Number(row.item.qty) || 0) * (Number(row.item.price) || 0)), 0);
  }, [currentDayAllItems]);

  // Monthly overview stats for Sidebar
  const monthlyOverviewStats = useMemo(() => {
    const stats: Record<number, { totalSpend: number; txCount: number }> = {};
    for (let m = 0; m < 12; m++) {
      stats[m] = { totalSpend: 0, txCount: 0 };
    }
    
    const targetStates: AppState[] = [];
    if (activeOutlet === 'ALL' || isRegionalView) {
      if (allMonthlyData) {
        Object.keys(allMonthlyData).forEach(outKey => {
          const outData = allMonthlyData[outKey];
          if (outData) {
            Object.values(outData).forEach(st => {
              if (st) targetStates.push(st as AppState);
            });
          }
        });
      }
      targetStates.push(data);
    } else {
      targetStates.push(data);
      if (allMonthlyData) {
        if (allMonthlyData[activeOutlet]) {
          Object.values(allMonthlyData[activeOutlet]).forEach(st => {
            if (st) targetStates.push(st as AppState);
          });
        } else if (allMonthlyData[String(selectedMonth)]) {
          Object.values(allMonthlyData).forEach(st => {
            if (st) targetStates.push(st as AppState);
          });
        }
      }
    }

    const processedTx = new Set<string>();
    targetStates.forEach(st => {
      PATTY_CASH_CATEGORIES.forEach(cat => {
        const ledger = (st[cat.ledgerKey] as Record<string, LedgerItem[]>) || {};
        Object.entries(ledger).forEach(([dStr, items]) => {
          if (!dStr.startsWith(String(selectedYear))) return;
          const mIdx = parseInt(dStr.split('-')[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12 && Array.isArray(items)) {
            items.forEach((it: any, idx: number) => {
              const uKey = `${cat.key}_${dStr}_${it.id || (it.name + '_' + idx + '_' + it.price)}`;
              if (processedTx.has(uKey)) return;
              processedTx.add(uKey);
              const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
              stats[mIdx].totalSpend += sub;
              stats[mIdx].txCount += 1;
            });
          }
        });
      });
    });

    return stats;
  }, [data, allMonthlyData, activeOutlet, isRegionalView, selectedYear]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      showToast?.('Nama Pengeluaran / Item Belanja wajib diisi!', 'error');
      return;
    }
    const qtyNum = parseFloat(inputQty.toString().replace(/,/g, '.')) || 1;
    const priceNum = parseFloat(inputPrice.toString().replace(/,/g, '.')) || 0;
    if (priceNum <= 0) {
      showToast?.('Harga / Nominal belanja harus lebih dari 0!', 'error');
      return;
    }

    if (!onUpdate) {
      showToast?.('Mode tampilan hanya baca (read-only).', 'error');
      return;
    }

    const targetCatDef = PATTY_CASH_CATEGORIES.find(c => c.key === inputCategory) || PATTY_CASH_CATEGORIES[0];

    const isCommodity = targetCatDef.key === 'commodity';
    const defaultReason = isCommodity ? `Commodity (${inputCommodityDivision})` : targetCatDef.label;

    const newItem: LedgerItem = {
      id: `pc-${targetCatDef.key}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: inputName.trim(),
      qty: qtyNum,
      price: priceNum,
      pic: inputPic.trim() || 'Staff Outlet / Petty Cash',
      reason: inputReason.trim() || defaultReason,
      division: isCommodity ? inputCommodityDivision : undefined
    };

    onUpdate((prev: AppState) => {
      const currentLedger = (prev[targetCatDef.ledgerKey] as Record<string, LedgerItem[]>) || {};
      const curList = currentLedger[inputDate] || [];
      const updatedList = [...curList, newItem];
      const updatedDayCategoryTotal = updatedList.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

      const currentDayExpenses = (prev.expenses && prev.expenses[inputDate]) || {
        date: inputDate,
        commodity: 0,
        nonCommodity: 0,
        asset: 0,
        atk: 0,
        casual: 0,
        maintenance: 0,
        thirdParty: 0,
        cash: 0,
        cityLedger: 0,
        complimentary: 0,
        guestSatisfaction: 0,
        chemical: 0,
        mainStore: 0,
        mainKitchen: 0,
        supplierExpense: 0,
        electricity: 0,
        water: 0,
        gas: 0
      };

      const updatedExpenses = {
        ...(prev.expenses || {}),
        [inputDate]: {
          ...currentDayExpenses,
          [targetCatDef.expenseKey]: updatedDayCategoryTotal
        }
      };

      return {
        ...prev,
        [targetCatDef.ledgerKey]: {
          ...currentLedger,
          [inputDate]: updatedList
        },
        expenses: updatedExpenses
      };
    });

    setInputName('');
    setInputQty('1');
    setInputPrice('');
    setInputPic('');
    setInputReason('');
    showToast?.(`Item "${newItem.name}" (${targetCatDef.label}) berhasil ditambahkan!`, 'success');
  };

  const handleDeleteItem = (catKey: string, itemId: string, itemName: string) => {
    if (!onUpdate) return;
    const targetCatDef = PATTY_CASH_CATEGORIES.find(c => c.key === catKey);
    if (!targetCatDef) return;

    onUpdate((prev: AppState) => {
      const currentLedger = (prev[targetCatDef.ledgerKey] as Record<string, LedgerItem[]>) || {};
      const curList = currentLedger[inputDate] || [];
      const updatedList = curList.filter(it => it.id !== itemId);
      const updatedDayCategoryTotal = updatedList.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

      const currentDayExpenses = (prev.expenses && prev.expenses[inputDate]) || {
        date: inputDate,
        commodity: 0,
        nonCommodity: 0,
        asset: 0,
        atk: 0,
        casual: 0,
        maintenance: 0,
        thirdParty: 0,
        cash: 0,
        cityLedger: 0,
        complimentary: 0,
        guestSatisfaction: 0,
        chemical: 0,
        mainStore: 0,
        mainKitchen: 0,
        supplierExpense: 0,
        electricity: 0,
        water: 0,
        gas: 0
      };

      return {
        ...prev,
        [targetCatDef.ledgerKey]: {
          ...currentLedger,
          [inputDate]: updatedList
        },
        expenses: {
          ...(prev.expenses || {}),
          [inputDate]: {
            ...currentDayExpenses,
            [targetCatDef.expenseKey]: updatedDayCategoryTotal
          }
        }
      };
    }, undefined, true);

    showToast?.(`Item "${itemName}" dihapus.`, 'info');
  };

  // Resolve state helper
  const getOutletMonthState = (outletName: string, mIdx = selectedMonth, yNum = selectedYear): AppState => {
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet) {
      if (mIdx === currentMonthIdx && yNum === currentYear && data) {
        return data;
      }
    }
    if (allMonthlyData) {
      let outData = allMonthlyData[outletName];
      if (!outData) {
        const found = Object.keys(allMonthlyData).find(
          k => k.toLowerCase() === outletName.toLowerCase() ||
               k.replace(/^SH\s+/i, '').toLowerCase() === outletName.replace(/^SH\s+/i, '').toLowerCase()
        );
        if (found) outData = allMonthlyData[found];
      }

      if (outData) {
        const mKey = String(mIdx);
        const mData = outData[mKey] || outData[mIdx] || outData.monthlyData?.[mKey] || outData.monthlyData?.[mIdx];
        if (mData) {
          return {
            ...INITIAL_STATE,
            ...outData,
            ...mData,
            outlet: outletName,
            dailyNonCommodityLedger: mData.dailyNonCommodityLedger || outData.dailyNonCommodityLedger || {},
            dailyCommodityLedger: mData.dailyCommodityLedger || outData.dailyCommodityLedger || {},
            dailyMaintenanceLedger: mData.dailyMaintenanceLedger || outData.dailyMaintenanceLedger || {},
            dailyAssetLedger: mData.dailyAssetLedger || outData.dailyAssetLedger || {},
            dailyCasualLedger: mData.dailyCasualLedger || outData.dailyCasualLedger || {},
            dailyAtkLedger: mData.dailyAtkLedger || outData.dailyAtkLedger || {},
            dailyCashLedger: mData.dailyCashLedger || outData.dailyCashLedger || {},
            expenses: mData.expenses || outData.expenses || {},
            sales: mData.sales || outData.sales || INITIAL_STATE.sales,
          };
        }
        if (outData.expenses || outData.dailyCommodityLedger || outData.dailyNonCommodityLedger) {
          return {
            ...INITIAL_STATE,
            ...outData,
            outlet: outletName
          };
        }
      }
      if (!isRegionalView && propSelectedOutlet && outletName === propSelectedOutlet && allMonthlyData[String(mIdx)]) {
        return allMonthlyData[String(mIdx)];
      }
    }
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet && mIdx === currentMonthIdx && data) {
      return data;
    }
    return {
      ...INITIAL_STATE,
      outlet: outletName,
      expenses: {},
      dailyNonCommodityLedger: {},
      dailyCommodityLedger: {},
      dailyMaintenanceLedger: {},
      dailyAssetLedger: {},
      dailyCasualLedger: {},
      dailyAtkLedger: {},
      dailyCashLedger: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} }
    };
  };

  // Aggregation of Patty Cash Data
  const targetOutlets = useMemo(() => {
    return isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  const {
    categorySummaries,
    totalPattyCashSpend,
    totalQtyAll,
    allMatrixItems,
    dailySpendChartData,
    dailySpendMap,
    dailyTxMap,
    dailyItemsMap
  } = useMemo(() => {
    const catMap: Record<string, { total: number; count: number; itemsCount: number; totalQty: number }> = {};
    PATTY_CASH_CATEGORIES.forEach(c => {
      catMap[c.key] = { total: 0, count: 0, itemsCount: 0, totalQty: 0 };
    });

    const itemsMap = new Map<string, MatrixPattyCashItem>();
    const dailySpendMap: Record<string, number> = {};
    const dailyTxMap: Record<string, number> = {};
    const dailyItemsMap: Record<string, any[]> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${monthPrefix}-${dayStr}`;
      dailySpendMap[dateStr] = 0;
      dailyTxMap[dateStr] = 0;
      dailyItemsMap[dateStr] = [];
    }

    targetOutlets.forEach(outletName => {
      const st = getOutletMonthState(outletName, selectedMonth, selectedYear);
      if (!st) return;

      PATTY_CASH_CATEGORIES.forEach(cat => {
        const ledgerRecord = (st as any)[cat.ledgerKey] as Record<string, LedgerItem[]> || {};
        let catSpendForOutlet = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dateStr = `${monthPrefix}-${dayStr}`;
          const itemsList = ledgerRecord[dateStr] || [];
          const isInFilterRange = d >= filterStartDay && d <= filterEndDay;

          if (Array.isArray(itemsList) && itemsList.length > 0) {
            itemsList.forEach((it: any, idx: number) => {
              const cleanName = (it.name || 'Item Tanpa Nama').trim();
              if (!cleanName) return;

              const qty = Number(it.qty) || 1;
              const price = Number(it.price) || 0;
              const subtotal = qty * price;

              dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + subtotal;
              dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;

              dailyItemsMap[dateStr].push({
                name: cleanName,
                qty,
                unit: it.unit || 'pcs',
                price,
                amount: subtotal,
                category: cat.label
              });

              if (isInFilterRange) {
                catSpendForOutlet += subtotal;

                const mapKey = `${cat.key}:::${cleanName.toLowerCase()}`;
                if (!itemsMap.has(mapKey)) {
                  itemsMap.set(mapKey, {
                    key: mapKey,
                    name: cleanName,
                    categoryKey: cat.key,
                    categoryLabel: cat.label,
                    totalQty: qty,
                    avgPrice: price,
                    minPrice: price,
                    maxPrice: price,
                    totalSpend: subtotal,
                    txCount: 1,
                    outletSpend: { [outletName]: subtotal },
                    outletQty: { [outletName]: qty },
                    transactions: [{
                      date: dateStr,
                      outlet: outletName,
                      qty,
                      price,
                      subtotal,
                      pic: it.pic || it.reason || '-',
                      reason: it.reason || '-',
                      division: it.division
                    }]
                  });
                } else {
                  const ex = itemsMap.get(mapKey)!;
                  ex.totalQty += qty;
                  ex.totalSpend += subtotal;
                  ex.txCount += 1;
                  ex.minPrice = Math.min(ex.minPrice, price);
                  ex.maxPrice = Math.max(ex.maxPrice, price);
                  ex.avgPrice = ex.totalQty > 0 ? ex.totalSpend / ex.totalQty : price;
                  ex.outletSpend[outletName] = (ex.outletSpend[outletName] || 0) + subtotal;
                  ex.outletQty[outletName] = (ex.outletQty[outletName] || 0) + qty;
                  ex.transactions.push({
                    date: dateStr,
                    outlet: outletName,
                    qty,
                    price,
                    subtotal,
                    pic: it.pic || it.reason || '-',
                    reason: it.reason || '-',
                    division: it.division
                  });
                }
              }
            });
          } else if (st.expenses && st.expenses[dateStr]) {
            // Fallback numeric value if ledger items empty
            const exp = st.expenses[dateStr] as any;
            const fallbackVal = Number(exp[cat.expenseKey]) || 0;
            if (fallbackVal > 0) {
              dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + fallbackVal;
              dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
              if (isInFilterRange) {
                catSpendForOutlet += fallbackVal;
              }
            }
          }
        }

        catMap[cat.key].total += catSpendForOutlet;
      });
    });

    const itemsList = Array.from(itemsMap.values());
    const totalPattyCashSpend = Object.values(catMap).reduce((acc, c) => acc + c.total, 0);
    const totalQtyAll = itemsList.reduce((acc, it) => acc + it.totalQty, 0);

    PATTY_CASH_CATEGORIES.forEach(cat => {
      const itemsInCat = itemsList.filter(it => it.categoryKey === cat.key);
      catMap[cat.key].itemsCount = itemsInCat.length;
      catMap[cat.key].count = itemsInCat.reduce((acc, it) => acc + it.txCount, 0);
      catMap[cat.key].totalQty = itemsInCat.reduce((acc, it) => acc + it.totalQty, 0);
    });

    const chartData = Object.entries(dailySpendMap).map(([dateStr, spend]) => ({
      day: dateStr.split('-')[2],
      date: dateStr,
      spend
    }));

    return {
      categorySummaries: catMap,
      totalPattyCashSpend,
      totalQtyAll,
      allMatrixItems: itemsList,
      dailySpendChartData: chartData,
      dailySpendMap,
      dailyTxMap,
      dailyItemsMap
    };
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth, filterStartDay, filterEndDay]);

  // Last Month calculations
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthName = MONTH_NAMES[lastMonthIdx];
  const lastMonthPrefix = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, '0')}`;
  const daysInLastMonth = new Date(lastMonthYear, lastMonthIdx + 1, 0).getDate();

  // Current Month MTD Revenue (Filtered by same date range)
  const currentMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, selectedMonth, selectedYear);
      return sum + extractStateMtdRevenue(st, monthPrefix, filterStartDay, filterEndDay);
    }, 0);
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, filterStartDay, filterEndDay, data, allMonthlyData]);

  // Last Month MTD Revenue (Filtered by same date range)
  const lastMonthMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      return sum + extractStateMtdRevenue(st, lastMonthPrefix, filterStartDay, Math.min(filterEndDay, daysInLastMonth));
    }, 0);
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, filterStartDay, filterEndDay, daysInLastMonth, allMonthlyData]);

  // Last Month Patty Cash Spend & Item Quantities (Filtered by same date range)
  const { lastMonthSpend, lastMonthCatTotals, lastMonthCatQuantities, lastMonthItemsMap } = useMemo(() => {
    let spend = 0;
    const catTotals: Record<string, number> = {};
    const catQuantities: Record<string, number> = {};
    const lmItems = new Map<string, { name: string; categoryKey: string; qty: number; spend: number }>();
    const maxDayForLm = Math.min(filterEndDay, daysInLastMonth);

    PATTY_CASH_CATEGORIES.forEach(c => {
      catTotals[c.key] = 0;
      catQuantities[c.key] = 0;
    });

    targetOutlets.forEach(o => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      if (!st) return;
      PATTY_CASH_CATEGORIES.forEach(cat => {
        const ledgerRecord = (st as any)[cat.ledgerKey] as Record<string, LedgerItem[]> || {};
        for (let d = filterStartDay; d <= maxDayForLm; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dStr = `${lastMonthPrefix}-${dayStr}`;
          const items = ledgerRecord[dStr] || [];
          if (Array.isArray(items) && items.length > 0) {
            items.forEach(it => {
              const qty = Number(it.qty) || 1;
              const price = Number(it.price) || 0;
              const subtotal = qty * price;
              spend += subtotal;
              catTotals[cat.key] = (catTotals[cat.key] || 0) + subtotal;
              catQuantities[cat.key] = (catQuantities[cat.key] || 0) + qty;

              const cleanName = (it.name || '').trim();
              if (cleanName) {
                const k = `${cat.key}:::${cleanName.toLowerCase()}`;
                const ex = lmItems.get(k);
                if (ex) {
                  ex.qty += qty;
                  ex.spend += subtotal;
                } else {
                  lmItems.set(k, { name: cleanName, categoryKey: cat.key, qty, spend: subtotal });
                }
              }
            });
          } else if (st.expenses && st.expenses[dStr]) {
            const exp = st.expenses[dStr] as any;
            const fallbackVal = Number(exp[cat.expenseKey]) || 0;
            if (fallbackVal > 0) {
              spend += fallbackVal;
              catTotals[cat.key] = (catTotals[cat.key] || 0) + fallbackVal;
            }
          }
        }
      });
    });

    return {
      lastMonthSpend: spend,
      lastMonthCatTotals: catTotals,
      lastMonthCatQuantities: catQuantities,
      lastMonthItemsMap: lmItems
    };
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, daysInLastMonth, filterStartDay, filterEndDay, allMonthlyData]);

  // Daily matrix for sidebar with item list attached
  const dailyMatrix = useMemo(() => {
    return buildDailyMatrix(selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap);
  }, [selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap]);

  // Category Variances for Sidebar with Current & Last Month Qty
  const categoryVariances = useMemo(() => {
    return PATTY_CASH_CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      currentSpend: categorySummaries[cat.key]?.total || 0,
      lastMonthSpend: lastMonthCatTotals[cat.key] || 0,
      currentQty: categorySummaries[cat.key]?.totalQty || 0,
      lastMonthQty: lastMonthCatQuantities[cat.key] || 0,
      qtyUnit: 'pcs'
    }));
  }, [categorySummaries, lastMonthCatTotals, lastMonthCatQuantities]);

  // Item-level Variances for Top Items
  const itemVariances = useMemo(() => {
    const list: any[] = [];
    allMatrixItems.forEach(it => {
      const lm = lastMonthItemsMap.get(it.key);
      list.push({
        key: it.key,
        label: it.name,
        currentSpend: it.totalSpend,
        lastMonthSpend: lm ? lm.spend : 0,
        currentQty: it.totalQty,
        lastMonthQty: lm ? lm.qty : 0,
        qtyUnit: 'pcs'
      });
    });
    return list.sort((a, b) => b.currentSpend - a.currentSpend).slice(0, 20);
  }, [allMatrixItems, lastMonthItemsMap]);

  // Dynamic Popular Items for selected input category only (from recorded items)
  const popularItemsForInputCat = useMemo(() => {
    const recordedInCat = allMatrixItems
      .filter(it => it.categoryKey === inputCategory)
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);

    return Array.from(new Set(recordedInCat)).slice(0, 12);
  }, [allMatrixItems, inputCategory]);

  // Filtered and Sorted Matrix Items
  const filteredMatrixItems = useMemo(() => {
    let list = [...allMatrixItems];

    if (activeCategoryFilter !== 'ALL') {
      list = list.filter(it => it.categoryKey === activeCategoryFilter);
    }

    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) || 
        it.categoryLabel.toLowerCase().includes(q) ||
        it.transactions.some(tx => tx.pic.toLowerCase().includes(q) || tx.reason.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (matrixSortBy === 'spend_desc') return b.totalSpend - a.totalSpend;
      if (matrixSortBy === 'spend_asc') return a.totalSpend - b.totalSpend;
      if (matrixSortBy === 'qty_desc') return b.totalQty - a.totalQty;
      if (matrixSortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });

    return list;
  }, [allMatrixItems, activeCategoryFilter, matrixSearch, matrixSortBy]);

  // Top 5 Items
  const top5Items = useMemo(() => {
    return [...allMatrixItems].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);
  }, [allMatrixItems]);

  // ---------------------------------------------------------------------------
  // BUDGET PER CATEGORY (NOMINAL NUMBERS) & MTD ACTUAL REVENUE CALCULATIONS
  // ---------------------------------------------------------------------------
  // Full Month MTD Actual Revenue (Penjualan Aktual MTD, bukan Target Sales Budget)
  const fullMonthMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, selectedMonth, selectedYear);
      return sum + extractStateMtdRevenue(st, monthPrefix, 1, daysInMonth);
    }, 0);
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth, data, allMonthlyData]);

  // Reference MTD Actual Revenue for Patty Cash Benchmark
  const mtdActualRevenue = fullMonthMtdRevenue;

  // Default Category Budget Nominals (Benchmark ~0.3% of MTD Actual Revenue or standard baseline)
  const DEFAULT_CAT_BUDGET_NOMINALS: Record<string, number> = useMemo(() => {
    if (mtdActualRevenue > 0) {
      return {
        nonCommodity: Math.round(0.0008 * mtdActualRevenue),
        commodity: Math.round(0.0005 * mtdActualRevenue),
        maintenance: Math.round(0.0005 * mtdActualRevenue),
        asset: Math.round(0.0003 * mtdActualRevenue),
        casual: Math.round(0.0003 * mtdActualRevenue),
        atk: Math.round(0.0003 * mtdActualRevenue),
        cash: Math.round(0.0003 * mtdActualRevenue),
      };
    }
    return {
      nonCommodity: 800000,
      commodity: 500000,
      maintenance: 500000,
      asset: 300000,
      casual: 300000,
      atk: 250000,
      cash: 250000,
    };
  }, [mtdActualRevenue]);

  // Saved category nominal budgets
  const categoryNominalBudgets = useMemo(() => {
    const savedMonthly = data.monthlyPattyCashCategoryBudgets?.[monthPrefix];
    if (savedMonthly && Object.keys(savedMonthly).length > 0) return savedMonthly;

    if (data.pattyCashCategoryBudgets && Object.keys(data.pattyCashCategoryBudgets).length > 0) {
      return data.pattyCashCategoryBudgets;
    }

    const localSaved = localStorage.getItem(`PATTY_CASH_CAT_BUDGET_NOMINAL_${monthPrefix}`);
    if (localSaved) {
      try { return JSON.parse(localSaved); } catch (e) { /* ignore */ }
    }

    const globalSaved = localStorage.getItem('PATTY_CASH_CAT_BUDGET_NOMINAL');
    if (globalSaved) {
      try { return JSON.parse(globalSaved); } catch (e) { /* ignore */ }
    }

    // If legacy percentage exists and MTD actual revenue > 0, convert to nominals
    const legacySavedPct = data.monthlyPattyCashCategoryBudgetPct?.[monthPrefix] || data.pattyCashCategoryBudgetPct;
    if (legacySavedPct && mtdActualRevenue > 0) {
      const converted: Record<string, number> = {};
      PATTY_CASH_CATEGORIES.forEach(cat => {
        const pct = Number(legacySavedPct[cat.key]) || 0;
        converted[cat.key] = Math.round((pct / 100) * mtdActualRevenue);
      });
      return converted;
    }

    return DEFAULT_CAT_BUDGET_NOMINALS;
  }, [data.monthlyPattyCashCategoryBudgets, data.pattyCashCategoryBudgets, data.monthlyPattyCashCategoryBudgetPct, data.pattyCashCategoryBudgetPct, monthPrefix, mtdActualRevenue, DEFAULT_CAT_BUDGET_NOMINALS]);

  // Total Patty Cash Budget Nominal (Sum of all category nominal budgets)
  const pattyCashBudget = useMemo(() => {
    const sumNominal: number = (Object.values(categoryNominalBudgets) as any[]).reduce((acc: number, v: any): number => acc + (Number(v) || 0), 0);
    if (sumNominal > 0) return sumNominal;

    const savedMonthlyNominal = data.monthlyPattyCashBudgetNominal?.[monthPrefix];
    if (typeof savedMonthlyNominal === 'number' && savedMonthlyNominal > 0) return savedMonthlyNominal;

    if (typeof data.pattyCashBudgetNominal === 'number' && data.pattyCashBudgetNominal > 0) {
      return data.pattyCashBudgetNominal;
    }

    if (mtdActualRevenue > 0) {
      return Math.round(0.003 * mtdActualRevenue); // 0.3% MTD Revenue
    }

    return 3000000;
  }, [categoryNominalBudgets, data.monthlyPattyCashBudgetNominal, data.pattyCashBudgetNominal, monthPrefix, mtdActualRevenue]);

  // Total Budget as % of MTD Actual Revenue
  const budgetPercentageOfRevenue = useMemo(() => {
    if (mtdActualRevenue > 0) {
      return (pattyCashBudget / mtdActualRevenue) * 100;
    }
    return 0;
  }, [pattyCashBudget, mtdActualRevenue]);

  // Total Patty Cash Usage Nominal (Rp)
  const pattyCashUsage = totalPattyCashSpend;

  // Remaining Budget Nominal (Rp)
  const remainingBudget = pattyCashBudget - pattyCashUsage;

  // Usage & Remaining Percentages
  const budgetUsagePercent = pattyCashBudget > 0 ? (pattyCashUsage / pattyCashBudget) * 100 : 0;
  const budgetRemainingPercent = 100 - budgetUsagePercent;

  // Monthly states for full tanggal recap table
  const recapMonthlyStates = useMemo(() => {
    return targetOutlets.map(o => getOutletMonthState(o, selectedMonth, selectedYear)).filter(Boolean);
  }, [targetOutlets, selectedMonth, selectedYear, data, allMonthlyData]);

  // Columns for full date recap table (Patty Cash categories, without third party)
  const recapColumns: RecapColumnDef[] = useMemo(() => [
    {
      id: 'nonCommodity',
      label: 'Non-Commodity',
      shortLabel: 'NON-COMM',
      getValue: (st, dStr) => {
        const list = (st.dailyNonCommodityLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.nonCommodity) || 0);
      }
    },
    {
      id: 'commodity',
      label: 'Commodity',
      shortLabel: 'COMMODITY',
      getValue: (st, dStr) => {
        const list = (st.dailyCommodityLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.commodity) || 0);
      }
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      shortLabel: 'MAINT.',
      getValue: (st, dStr) => {
        const list = (st.dailyMaintenanceLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.maintenance) || 0);
      }
    },
    {
      id: 'asset',
      label: 'Asset & Equip',
      shortLabel: 'ASSET',
      getValue: (st, dStr) => {
        const list = (st.dailyAssetLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.asset) || 0);
      }
    },
    {
      id: 'casual',
      label: 'Casual Staff',
      shortLabel: 'CASUAL',
      getValue: (st, dStr) => {
        const list = (st.dailyCasualLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.casual) || 0);
      }
    },
    {
      id: 'atk',
      label: 'ATK & Print',
      shortLabel: 'ATK',
      getValue: (st, dStr) => {
        const list = (st.dailyAtkLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.atk) || 0);
      }
    },
    {
      id: 'cash',
      label: 'Cash Lainnya',
      shortLabel: 'CASH',
      getValue: (st, dStr) => {
        const list = (st.dailyCashLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.cash) || 0);
      }
    }
  ], []);

  // Detail items callback for day popup in full tanggal table
  const getDetailItemsForDay = (dateStr: string, states: AppState[]): DayDetailItem[] => {
    const list: DayDetailItem[] = [];
    states.forEach(st => {
      const outName = st.outlet || activeOutlet;
      const catLedgers: Array<{ key: string; label: string; ledger: Record<string, LedgerItem[]> | undefined }> = [
        { key: 'nonCommodity', label: 'Non-Commodity', ledger: st.dailyNonCommodityLedger },
        { key: 'commodity', label: 'Commodity', ledger: st.dailyCommodityLedger },
        { key: 'maintenance', label: 'Maintenance', ledger: st.dailyMaintenanceLedger },
        { key: 'asset', label: 'Asset', ledger: st.dailyAssetLedger },
        { key: 'casual', label: 'Casual', ledger: st.dailyCasualLedger },
        { key: 'atk', label: 'ATK', ledger: st.dailyAtkLedger },
        { key: 'cash', label: 'Cash', ledger: st.dailyCashLedger }
      ];

      catLedgers.forEach(cl => {
        const items = (cl.ledger?.[dateStr] || []) as LedgerItem[];
        items.forEach(it => {
          list.push({
            id: it.id,
            outlet: outName,
            category: cl.label,
            name: it.division ? `${it.name} [${it.division}]` : it.name,
            qty: it.qty,
            price: it.price,
            subtotal: (it.qty || 1) * (it.price || 0),
            reason: it.reason,
            pic: it.pic
          });
        });
      });
    });
    return list;
  };

  // Initial Total Budget Patty Cash (Budget Awal)
  const [baseTotalBudget, setBaseTotalBudget] = useState<number>(() => {
    return pattyCashBudget > 0 ? pattyCashBudget : 3000000;
  });

  // Bobot proporsional untuk 6 kategori yang dibekukan (Total = 1.00 atau 100%)
  const FROZEN_CATEGORY_WEIGHTS: Record<string, number> = useMemo(() => ({
    nonCommodity: 0.32,
    commodity: 0.20,
    asset: 0.12,
    casual: 0.12,
    atk: 0.12,
    cash: 0.12,
  }), []);

  // Helper alokasi: Maintenance diinput manual, sisa budget dibagikan ke kategori lain yang dibekukan
  const allocateBudgetsFromMaintenance = (totalBudgetAwal: number, maintenanceNominal: number): Record<string, string> => {
    const totalAwal = Math.max(0, totalBudgetAwal);
    const maint = Math.max(0, maintenanceNominal);
    const remaining = Math.max(0, totalAwal - maint);

    const updated: Record<string, string> = {
      maintenance: String(maint)
    };

    const frozenKeys = ['nonCommodity', 'commodity', 'asset', 'casual', 'atk', 'cash'];
    let runningAlloc = 0;
    frozenKeys.forEach((k, idx) => {
      if (idx === frozenKeys.length - 1) {
        // Elemen terakhir mengambil sisa presisi agar akumulasi pas = remaining
        updated[k] = String(Math.max(0, remaining - runningAlloc));
      } else {
        const share = Math.round(remaining * (FROZEN_CATEGORY_WEIGHTS[k] || 0.12));
        updated[k] = String(share);
        runningAlloc += share;
      }
    });

    return updated;
  };

  // Temp state for editing budget nominals in Modal
  const [tempCategoryNominals, setTempCategoryNominals] = useState<Record<string, string>>(() => {
    const totalAwal = pattyCashBudget > 0 ? pattyCashBudget : 3000000;
    const maintNominal = categoryNominalBudgets['maintenance'] ?? DEFAULT_CAT_BUDGET_NOMINALS['maintenance'] ?? Math.round(totalAwal * 0.167);
    return allocateBudgetsFromMaintenance(totalAwal, maintNominal);
  });

  // Sync temp category nominals when modal opens or categoryNominalBudgets changes
  React.useEffect(() => {
    const totalAwal = pattyCashBudget > 0 ? pattyCashBudget : 3000000;
    setBaseTotalBudget(totalAwal);
    const maintNominal = categoryNominalBudgets['maintenance'] ?? DEFAULT_CAT_BUDGET_NOMINALS['maintenance'] ?? Math.round(totalAwal * 0.167);
    const allocated = allocateBudgetsFromMaintenance(totalAwal, maintNominal);
    setTempCategoryNominals(allocated);
  }, [categoryNominalBudgets, DEFAULT_CAT_BUDGET_NOMINALS, isEditingBudgetModal, pattyCashBudget]);

  const handleSaveCategoryBudgets = () => {
    const updatedNominals: Record<string, number> = {};
    const updatedPcts: Record<string, number> = {};
    let totalNominal = 0;

    PATTY_CASH_CATEGORIES.forEach(cat => {
      const raw = String(tempCategoryNominals[cat.key] || '').replace(/[^0-9]/g, '');
      const nominalVal = Math.max(0, parseInt(raw, 10) || 0);
      updatedNominals[cat.key] = nominalVal;
      totalNominal += nominalVal;
      if (mtdActualRevenue > 0) {
        updatedPcts[cat.key] = Number(((nominalVal / mtdActualRevenue) * 100).toFixed(4));
      }
    });

    const totalPct = mtdActualRevenue > 0 ? (totalNominal / mtdActualRevenue) * 100 : 0;

    if (onUpdate) {
      const newMonthlyNominalMap = {
        ...(data.monthlyPattyCashCategoryBudgets || {}),
        [monthPrefix]: updatedNominals,
      };
      const newMonthlyTotalNominalMap = {
        ...(data.monthlyPattyCashBudgetNominal || {}),
        [monthPrefix]: totalNominal,
      };
      const newMonthlyPctMap = {
        ...(data.monthlyPattyCashCategoryBudgetPct || {}),
        [monthPrefix]: updatedPcts,
      };
      const newMonthlyTotalPctMap = {
        ...(data.monthlyPattyCashBudgetPercent || {}),
        [monthPrefix]: totalPct,
      };

      onUpdate('monthlyPattyCashCategoryBudgets', newMonthlyNominalMap);
      onUpdate('monthlyPattyCashBudgetNominal', newMonthlyTotalNominalMap);
      onUpdate('pattyCashCategoryBudgets', updatedNominals);
      onUpdate('pattyCashBudgetNominal', totalNominal);

      onUpdate('monthlyPattyCashCategoryBudgetPct', newMonthlyPctMap);
      onUpdate('monthlyPattyCashBudgetPercent', newMonthlyTotalPctMap);
      onUpdate('pattyCashCategoryBudgetPct', updatedPcts);
      onUpdate('pattyCashBudgetPercentage', totalPct);
    }

    localStorage.setItem(`PATTY_CASH_CAT_BUDGET_NOMINAL_${monthPrefix}`, JSON.stringify(updatedNominals));
    localStorage.setItem('PATTY_CASH_CAT_BUDGET_NOMINAL', JSON.stringify(updatedNominals));

    setIsEditingBudgetModal(false);
    showToast?.(`Budget Kategori Patty Cash (Total: Rp ${totalNominal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}) berhasil disimpan!`, 'success');
  };

  // Helper to import today's recorded items into Purchase Request
  const handleImportTodayItemsToPr = () => {
    if (currentDayAllItems.length === 0) {
      showToast?.('Belum ada transaksi belanja yang diinput hari ini.', 'info');
      return;
    }
    const lines = currentDayAllItems.map(row => `- ${row.item.name} (${row.item.qty} pcs) @ Rp ${(Number(row.item.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
    setPrItems(lines.join('\n'));
    setPrAmount(`± Rp ${currentDayTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })},-`);
    showToast?.(`${currentDayAllItems.length} item belanja hari ini dimasukkan ke Purchase Request!`, 'success');
  };

  // Generate exact WhatsApp Purchase Request Template
  const generatePurchaseRequestText = () => {
    let cleanAmount = prAmount.trim();
    if (!cleanAmount) {
      cleanAmount = '± Rp.,-';
    }

    let cleanReason = prReason.trim();
    if (!cleanReason) {
      cleanReason = '* Kebutuhan Operasional';
    } else if (!cleanReason.startsWith('*')) {
      cleanReason = `* ${cleanReason}`;
    }

    let cleanItems = prItems.trim();
    if (!cleanItems) {
      cleanItems = '- ';
    }

    const budgetStr = `Rp ${pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })},-`;
    const usageStr = `Rp ${pattyCashUsage.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })},-`;
    const remainingStr = `Rp ${remainingBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })},-`;

    return `PURCHASE REQUEST

Outlet : ${prOutlet || activeOutlet}
Date/ Month : ${prDate || formatPrDate(inputDate)}
Amount : ${cleanAmount}

Item:
${cleanItems}

Reason : 
${cleanReason} 


Leader In Charge : ${prLeader || ''}


*Patty Cash Budget* : ${budgetStr}
*Patty Cash Usage* : ${usageStr}
*Remaining Budget* : ${remainingStr}`;
  };

  const handleCopyPurchaseRequestWA = () => {
    const text = generatePurchaseRequestText();
    navigator.clipboard.writeText(text);
    showToast?.('Template WhatsApp Purchase Request berhasil disalin!', 'success');
  };

  const handleSendPurchaseRequestWA = () => {
    const text = generatePurchaseRequestText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Excel Export Handler
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus App';
      workbook.created = new Date();

      // Sheet 1: Rekap Kategori Patty Cash
      const catSheet = workbook.addWorksheet('REKAP_PATTY_CASH');
      catSheet.addRow([`LAPORAN BELANJA PATTY CASH (OPEX) - ${activeOutlet}`]);
      catSheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      catSheet.addRow([`Total Pengeluaran: Rp ${totalPattyCashSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      catSheet.addRow([]);

      catSheet.addRow(['No', 'Kategori Patty Cash', 'Jumlah Item Unik', 'Frekuensi Transaksi', 'Total Pengeluaran (Rp)', '% Kontribusi']);
      PATTY_CASH_CATEGORIES.forEach((cat, idx) => {
        const cData = categorySummaries[cat.key] || { total: 0, itemsCount: 0, count: 0 };
        const share = totalPattyCashSpend > 0 ? (cData.total / totalPattyCashSpend) * 100 : 0;
        catSheet.addRow([
          idx + 1,
          cat.label,
          cData.itemsCount,
          cData.count,
          cData.total,
          `${share.toFixed(2)}%`
        ]);
      });
      catSheet.addRow([]);
      catSheet.addRow(['TOTAL', '', allMatrixItems.length, '', totalPattyCashSpend, '100.00%']);

      // Sheet 2: Matrix Detail Item
      const matrixSheet = workbook.addWorksheet('MATRIX_DETAIL_ITEM');
      matrixSheet.addRow([`MATRIX DETAIL ITEM BELANJA PATTY CASH - ${activeOutlet}`]);
      matrixSheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      matrixSheet.addRow([]);

      const pivotCols = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet];
      matrixSheet.addRow(['No', 'Nama Item', 'Kategori', 'Total Qty', 'Harga Rata-rata (Rp)', 'Min Harga (Rp)', 'Max Harga (Rp)', 'Total Belanja (Rp)', '% Share', ...pivotCols.map(o => `Spend ${o}`)]);

      filteredMatrixItems.forEach((it, idx) => {
        const share = totalPattyCashSpend > 0 ? (it.totalSpend / totalPattyCashSpend) * 100 : 0;
        matrixSheet.addRow([
          idx + 1,
          it.name,
          it.categoryLabel,
          it.totalQty,
          Number(it.avgPrice.toFixed(2)),
          it.minPrice,
          it.maxPrice,
          it.totalSpend,
          `${share.toFixed(2)}%`,
          ...pivotCols.map(o => it.outletSpend[o] || 0)
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Patty_Cash_Expense_${activeOutlet}_${monthPrefix}.xlsx`);
      showToast?.('Berhasil mengunduh Laporan Excel Patty Cash!', 'success');
    } catch (err) {
      showToast?.('Gagal mengunduh Excel.', 'error');
    }
  };

  // WhatsApp Summary Copy Handler matching strict user template
  const handleCopyWhatsApp = (selectedCategoryKey?: string) => {
    const catsToInclude = selectedCategoryKey && selectedCategoryKey !== 'ALL'
      ? PATTY_CASH_CATEGORIES.filter(c => c.key === selectedCategoryKey)
      : PATTY_CASH_CATEGORIES;

    const categoriesData = catsToInclude.map(cat => {
      const itemsInCat = allMatrixItems.filter(i => i.categoryKey === cat.key);
      return {
        categoryName: cat.label,
        totalSpend: categorySummaries[cat.key]?.total || 0,
        items: itemsInCat.map(it => ({
          name: it.name,
          qty: it.totalQty,
          unit: 'pcs',
          totalSpend: it.totalSpend,
          avgPrice: it.avgPrice
        }))
      };
    });

    const spendToCompare = selectedCategoryKey && selectedCategoryKey !== 'ALL'
      ? (categorySummaries[selectedCategoryKey]?.total || 0)
      : totalPattyCashSpend;

    const lmSpendToCompare = selectedCategoryKey && selectedCategoryKey !== 'ALL'
      ? (lastMonthCatTotals[selectedCategoryKey] || 0)
      : lastMonthSpend;

    const text = generateWhatsAppExpenseText({
      title: 'REKAP PATTY CASH EXPENSE',
      templateType: 'CATEGORY_AMOUNT_ONLY',
      outletName: activeOutlet,
      startDay: filterStartDay,
      endDay: filterEndDay,
      monthName,
      year: selectedYear,
      categories: categoriesData,
      totalSpendAll: spendToCompare,
      lastMonthSpend: lmSpendToCompare,
      currentMtdRevenue,
      lastMonthMtdRevenue
    });

    navigator.clipboard.writeText(text);
    showToast?.(`Rekap WA Patty Cash Tgl ${filterStartDay} - ${filterEndDay} ${monthName} disalin!`, 'success');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-200">
      {/* HEADER BAR */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-900/40">
              <i className="fas fa-wallet text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                Patty Cash Expense
              </h2>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mt-0.5">
                Monitoring Khusus Pengeluaran & Matrix Item Patty Cash OPEX
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 shadow-sm">
              <i className="fas fa-store text-amber-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={() => setIsEditingBudgetModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-indigo-400/30"
            title="Input Budget Nominal per Kategori Patty Cash"
          >
            <i className="fas fa-sliders-h"></i> Input Budget (Rp {pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
          </button>

          <button
            onClick={() => setIsPurchaseRequestModalOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-emerald-400/30 shadow-emerald-950/40"
            title="Buat Purchase Request Template WhatsApp"
          >
            <i className="fab fa-whatsapp text-sm"></i> Purchase Request WA
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Excel
          </button>
          <button
            onClick={() => handleCopyWhatsApp()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-emerald-400 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-white/10"
          >
            <i className="fab fa-whatsapp"></i> WA Rekap
          </button>
          <ShareActions 
            targetId={reportId} 
            title={`Patty Cash Expense - ${activeOutlet} (${monthName} ${selectedYear})`}
            showToast={showToast}
          />
        </div>
      </div>

      {/* EXECUTIVE PATTY CASH BUDGET & REALIZATION BANNER */}
      <div className="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/20 rounded-3xl shadow-2xl relative overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-black">
              <i className="fas fa-chart-pie"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                Executive Patty Cash Budget & Usage Monitoring
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {monthName} {selectedYear}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Acuan: <span className="text-slate-200 font-bold font-mono">Rp {mtdActualRevenue.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span> (MTD Revenue Aktual) • Budget Plafond: <span className="text-amber-400 font-bold font-mono">Rp {pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span> {mtdActualRevenue > 0 && <span className="text-indigo-400 font-mono">({budgetPercentageOfRevenue.toFixed(2)}% dari MTD Revenue)</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsEditingBudgetModal(true)}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center justify-center gap-1.5 border border-white/10 cursor-pointer"
            >
              <i className="fas fa-coins text-amber-400"></i> Set Budget (Nominal)
            </button>
            <button
              onClick={() => setIsPurchaseRequestModalOpen(true)}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <i className="fab fa-whatsapp"></i> Form PR
            </button>
          </div>
        </div>

        {/* 3 Core KPI Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: PATTY CASH BUDGET */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-indigo-500/30 relative overflow-hidden group hover:border-indigo-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block">
                  PATTY CASH BUDGET
                </span>
                <span className="text-2xl font-black font-mono text-white mt-1 block">
                  Rp {pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-base">
                <i className="fas fa-coins"></i>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5 pt-2">
              <span>Alokasi Plafond:</span>
              <span className="font-black text-indigo-400 font-mono">
                {mtdActualRevenue > 0 ? `${budgetPercentageOfRevenue.toFixed(2)}% dari MTD Revenue` : `Rp ${pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {/* Card 2: PATTY CASH USAGE */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-amber-500/30 relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider block">
                  PATTY CASH USAGE
                </span>
                <span className="text-2xl font-black font-mono text-amber-400 mt-1 block">
                  Rp {pattyCashUsage.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-base">
                <i className="fas fa-shopping-cart"></i>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5 pt-2">
              <span>Total Belanja Semua Kategori:</span>
              <span className={`font-black font-mono ${pattyCashBudget > 0 && budgetUsagePercent > 100 ? 'text-rose-400' : 'text-amber-400'}`}>
                {budgetUsagePercent.toFixed(1)}% Terpakai
              </span>
            </div>
          </div>

          {/* Card 3: REMAINING BUDGET */}
          <div className={`p-4 rounded-2xl bg-slate-950/70 border relative overflow-hidden group transition-all ${
            remainingBudget < 0
              ? 'border-rose-500/40 hover:border-rose-500/60'
              : remainingBudget < pattyCashBudget * 0.2
              ? 'border-amber-500/40 hover:border-amber-500/60'
              : 'border-emerald-500/40 hover:border-emerald-500/60'
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider block ${
                  remainingBudget < 0 ? 'text-rose-300' : remainingBudget < pattyCashBudget * 0.2 ? 'text-amber-300' : 'text-emerald-300'
                }`}>
                  REMAINING BUDGET
                </span>
                <span className={`text-2xl font-black font-mono mt-1 block ${
                  remainingBudget < 0 ? 'text-rose-400' : remainingBudget < pattyCashBudget * 0.2 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {remainingBudget < 0 ? `- Rp ${Math.abs(remainingBudget).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : `Rp ${remainingBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                </span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base ${
                remainingBudget < 0 ? 'bg-rose-500/20 text-rose-400' : remainingBudget < pattyCashBudget * 0.2 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                <i className="fas fa-wallet"></i>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5 pt-2">
              <span>Status Saldo:</span>
              <span className={`font-black font-mono ${
                remainingBudget < 0 ? 'text-rose-400' : remainingBudget < pattyCashBudget * 0.2 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {remainingBudget < 0 ? 'OVER BUDGET' : `${budgetRemainingPercent.toFixed(1)}% Tersedia`}
              </span>
            </div>
          </div>
        </div>

        {/* Budget Progress Indicator */}
        <div className="space-y-1.5 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
            <span className="text-slate-400">Realisasi Penggunaan Budget Petty Cash</span>
            <span className={budgetUsagePercent > 100 ? 'text-rose-400' : budgetUsagePercent > 80 ? 'text-amber-400' : 'text-emerald-400'}>
              {budgetUsagePercent.toFixed(1)}% / 100% Plafond
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden flex shadow-inner">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                budgetUsagePercent > 100
                  ? 'bg-gradient-to-r from-rose-600 to-red-500'
                  : budgetUsagePercent > 80
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, budgetUsagePercent))}%` }}
            ></div>
          </div>
        </div>

        {/* Category Budget Breakdown Chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          {PATTY_CASH_CATEGORIES.map(cat => {
            const catBudgetNominal = categoryNominalBudgets[cat.key] || 0;
            const catSpend = categorySummaries[cat.key]?.total || 0;
            const isCatOver = catBudgetNominal > 0 && catSpend > catBudgetNominal;
            const catPct = mtdActualRevenue > 0 ? (catBudgetNominal / mtdActualRevenue) * 100 : 0;
            return (
              <div
                key={cat.key}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                  isCatOver
                    ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                    : 'bg-slate-950/60 border-white/5 text-slate-300'
                }`}
              >
                <span className="font-bold">{cat.label}:</span>
                <span className="font-mono text-white font-black">
                  Rp {catSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400">
                  / Rp {catBudgetNominal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {catPct > 0 ? `(${catPct.toFixed(2)}%)` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* REGIONAL OUTLET FILTER PILLS (Only for Regional view) */}
      {isRegionalView && (
        <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2.5 rounded-2xl border border-white/5 no-print">
          <button
            onClick={() => setActiveOutlet('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
              activeOutlet === 'ALL' || !activeOutlet
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                : 'hover:bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Semua Outlet (Regional)
          </button>
          {OUTLETS.map(outlet => (
            <button
              key={outlet}
              onClick={() => setActiveOutlet(outlet)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                activeOutlet === outlet
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {outlet}
            </button>
          ))}
        </div>
      )}

      {/* UNIVERSAL DATE RANGE FILTER BAR (e.g. 1 - 25) */}
      <DateRangeFilterBar
        startDay={filterStartDay}
        endDay={filterEndDay}
        maxDays={daysInMonth}
        monthName={monthName}
        year={selectedYear}
        onRangeChange={(s, e) => {
          setFilterStartDay(s);
          setFilterEndDay(e);
        }}
        title="Filter Tanggal Rekap Belanja Petty Cash"
        accentColor="amber"
        onCopyWhatsApp={() => handleCopyWhatsApp()}
        whatsAppButtonLabel="Salin WA (Tgl 1 - 25)"
      />

      {/* MAIN LAYOUT WITH MONTHLY SIDEBAR ON RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {/* NAVIGATION TABS */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900/80 p-2 rounded-2xl border border-white/10 w-fit no-print">
            {isRegionalView && (
              <button
                onClick={() => setModuleTab('REGIONAL_RECAP')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  moduleTab === 'REGIONAL_RECAP'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-sitemap"></i> Rekapitulasi Outlet
              </button>
            )}
            <button
              onClick={() => setModuleTab('MATRIX')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'MATRIX'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table"></i> Matrix Rekap & Analisis
            </button>
            <button
              onClick={() => setModuleTab('FULL_DATE')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'FULL_DATE'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-alt"></i> Rekap Tanggal 1-31
            </button>
            {!isRegionalView && (
              <button
                onClick={() => setModuleTab('INPUT')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  moduleTab === 'INPUT'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-edit"></i> Input Belanja Petty Cash
              </button>
            )}
          </div>

          {moduleTab === 'REGIONAL_RECAP' && (
            <RegionalPattyCashRecapTable
              allOutletsData={allMonthlyData}
              data={data}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedArea={selectedArea}
              selectedOutlet={activeOutlet}
              onSelectOutlet={setActiveOutlet}
              showToast={showToast}
              filterStartDay={filterStartDay}
              filterEndDay={filterEndDay}
            />
          )}

          {moduleTab === 'FULL_DATE' && (
            <div className="space-y-6 animate-fade-in">
              <BelanjaFullTanggalRecapTable
                title="Tabel Rekap Harian Patty Cash Expense"
                subtitle={`Rekapan penyerapan harian Patty Cash per kategori tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
                icon="fa-wallet"
                themeColor="amber"
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                selectedOutlet={activeOutlet}
                isRegionalView={isRegionalView}
                monthlyStates={recapMonthlyStates}
                columns={recapColumns}
                getDetailItemsForDay={getDetailItemsForDay}
              />
            </div>
          )}

          {moduleTab === 'INPUT' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE METRIC SUMMARY: RATIO & VARIANCE */}
              <ModuleExecutiveKpis
                themeColor="amber"
                totalSpend={totalPattyCashSpend}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="pcs"
                benchmarkRatioThresholds={{ warning: 1.5, danger: 3.0 }}
              />

              {/* DATE PICKER BAR */}
              <div className="glass-card p-4 bg-slate-900/90 border border-white/10 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(inputDate);
                        d.setDate(d.getDate() - 1);
                        setInputDate(toLocalDateStr(d));
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-chevron-left text-xs"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(inputDate);
                        d.setDate(d.getDate() + 1);
                        setInputDate(toLocalDateStr(d));
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-chevron-right text-xs"></i>
                    </button>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Belanja:</span>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Hari Ini ({inputDate}):</span>
                    <span className="text-lg font-black font-mono text-amber-400">
                      Rp {currentDayTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast?.(`Data Belanja Petty Cash tanggal ${inputDate} tersimpan otomatis!`, 'success')}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <i className="fas fa-save"></i> Submit Data Belanja
                  </button>
                </div>
              </div>

              {/* INPUT FORM CARD */}
              <div className="glass-card p-6 bg-slate-900/90 border border-amber-500/30 rounded-3xl shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-plus-circle text-amber-400"></i>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Form Input Pengeluaran Petty Cash
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1 w-fit">
                    <i className="fas fa-shield-alt text-[9px]"></i>
                    Opex Kas Kecil (Tidak Terhubung & Tidak Memotong Receiving Sheet)
                  </span>
                </div>

                {/* Category Selector Tabs for Input */}
                <div className="mb-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                    Pilih Kategori Belanja Petty Cash:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    {PATTY_CASH_CATEGORIES.map(cat => {
                      const isSelected = inputCategory === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => {
                            setInputCategory(cat.key);
                            setInputName('');
                          }}
                          className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-400 shadow-md scale-102'
                              : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          <i className={`fas ${cat.icon} text-sm block mb-1`}></i>
                          <span className="text-[10px] font-black uppercase block truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {inputCategory === 'atk' && (
                    <p className="mt-2 text-[10px] text-cyan-400/90 font-medium italic flex items-center gap-1">
                      <i className="fas fa-info-circle text-[9px]"></i>
                      Belanja ATK & Kasir di Petty Cash adalah untuk operasional kas kecil. Item ini tidak memotong kolom belanja Receiving Sheet dan tidak terhubung dengan fitur Chemical, Stationary & Marketing.
                    </p>
                  )}

                  {/* BUTTON PILIHAN DIVISI: BAR & KITCHEN KHUSUS COMMODITY */}
                  {inputCategory === 'commodity' && (
                    <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/40 shadow-xl shadow-emerald-950/20 animate-fade-in">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                            <i className="fas fa-layer-group text-sm"></i>
                          </div>
                          <div>
                            <label className="text-xs font-black text-white uppercase tracking-wider block">
                              Pilihan Divisi Commodity: <span className="text-emerald-400">*</span>
                            </label>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Tentukan apakah belanja Commodity ini diperuntukkan bagi <strong>Bar</strong> atau <strong>Kitchen</strong>.
                            </span>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 w-fit ${
                          inputCommodityDivision === 'BAR'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-950/50'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-950/50'
                        }`}>
                          <i className={`fas ${inputCommodityDivision === 'BAR' ? 'fa-glass-martini-alt text-cyan-300' : 'fa-utensils text-amber-300'}`}></i>
                          Divisi Aktif: {inputCommodityDivision}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setInputCommodityDivision('BAR')}
                          className={`p-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-3 border cursor-pointer active:scale-95 ${
                            inputCommodityDivision === 'BAR'
                              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-300 shadow-lg shadow-cyan-900/50 ring-2 ring-cyan-400/50 scale-102'
                              : 'bg-slate-900/90 text-slate-400 border-white/10 hover:border-cyan-500/30 hover:text-cyan-300 hover:bg-slate-900'
                          }`}
                        >
                          <i className={`fas fa-glass-martini-alt text-base ${inputCommodityDivision === 'BAR' ? 'text-white' : 'text-cyan-400'}`}></i>
                          <div className="text-left">
                            <span className="block font-black leading-tight">DIVISI BAR</span>
                            <span className="text-[9px] font-normal opacity-80 block normal-case">Sirup, Buah Bar, Es Batu, Bahan Minuman</span>
                          </div>
                          {inputCommodityDivision === 'BAR' && (
                            <i className="fas fa-check-circle ml-auto text-sm text-cyan-200"></i>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setInputCommodityDivision('KITCHEN')}
                          className={`p-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-3 border cursor-pointer active:scale-95 ${
                            inputCommodityDivision === 'KITCHEN'
                              ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-300 shadow-lg shadow-amber-900/50 ring-2 ring-amber-400/50 scale-102'
                              : 'bg-slate-900/90 text-slate-400 border-white/10 hover:border-amber-500/30 hover:text-amber-300 hover:bg-slate-900'
                          }`}
                        >
                          <i className={`fas fa-utensils text-base ${inputCommodityDivision === 'KITCHEN' ? 'text-white' : 'text-amber-400'}`}></i>
                          <div className="text-left">
                            <span className="block font-black leading-tight">DIVISI KITCHEN</span>
                            <span className="text-[9px] font-normal opacity-80 block normal-case">Sayur Segar, Bumbu Dapur, Bahan Olahan Masak</span>
                          </div>
                          {inputCommodityDivision === 'KITCHEN' && (
                            <i className="fas fa-check-circle ml-auto text-sm text-amber-200"></i>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Chips for selected category (Only if recorded items exist) */}
                {popularItemsForInputCat.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      Item Populer Kategori ({PATTY_CASH_CATEGORIES.find(c => c.key === inputCategory)?.label}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {popularItemsForInputCat.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setInputName(item)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/5 hover:border-amber-500/30 transition-all cursor-pointer"
                        >
                          + {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Nama Barang / Rincian Pengeluaran *
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Sayur Segar, Kertas Kasir..."
                      value={inputName}
                      onChange={e => setInputName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-600 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Qty / Volume
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      placeholder="1"
                      value={inputQty}
                      onChange={e => setInputQty(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Harga Satuan (Rp) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={inputPrice}
                      onChange={e => setInputPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      PIC / Penerima Dana
                    </label>
                    <input
                      type="text"
                      placeholder="Nama Kasir / Staff"
                      value={inputPic}
                      onChange={e => setInputPic(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Keperluan / Keterangan
                    </label>
                    <input
                      type="text"
                      placeholder="Kebutuhan Operasional..."
                      value={inputReason}
                      onChange={e => setInputReason(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-12 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                    >
                      <i className="fas fa-plus"></i> Tambah Pengeluaran
                    </button>
                  </div>
                </form>

                <FeatureSubmitSyncButton
                  featureName="Patty Cash Expense"
                  subtext={`Klik setelah selesai input pengeluaran tanggal ${inputDate} agar data langsung diterima oleh perangkat lain.`}
                  className="mt-4"
                />
              </div>

              {/* LIST OF TODAY'S TRANSACTIONS */}
              <div className="glass-card p-5 bg-slate-900/90 border border-amber-500/20 rounded-3xl shadow-xl space-y-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-receipt text-amber-400"></i>
                    <h4 className="text-xs font-black uppercase tracking-wider text-white">Daftar Pengeluaran Hari Ini ({inputDate})</h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    Total: Rp {currentDayTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {currentDayAllItems.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                    <p className="text-[11px] text-slate-500">Tidak ada pengeluaran Petty Cash untuk hari ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[9px]">
                          <th className="py-2 px-3">Kategori</th>
                          <th className="py-2 px-3">Item / Rincian</th>
                          <th className="py-2 px-3 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Harga</th>
                          <th className="py-2 px-3 text-right font-black">Subtotal</th>
                          <th className="py-2 px-3">PIC</th>
                          <th className="py-2 px-3">Keperluan</th>
                          <th className="py-2 px-3 text-center w-12">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                        {currentDayAllItems.map((row, idx) => {
                          const sub = (Number(row.item.qty) || 0) * (Number(row.item.price) || 0);
                          return (
                            <tr key={row.item.id || idx} className="hover:bg-white/5">
                              <td className="py-2 px-3 font-sans">
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-slate-800 text-slate-300 border border-white/10">
                                  {row.catLabel}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[180px]">
                                <div className="flex items-center gap-1.5">
                                  <span>{row.item.name}</span>
                                  {row.item.division && (
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border shrink-0 ${
                                      row.item.division === 'BAR'
                                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    }`}>
                                      {row.item.division}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center text-slate-300">{row.item.qty}</td>
                              <td className="py-2 px-3 text-right text-slate-400">Rp {(Number(row.item.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="py-2 px-3 text-right font-black text-amber-400">Rp {sub.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="py-2 px-3 font-sans text-slate-300 text-[10px]">{row.item.pic}</td>
                              <td className="py-2 px-3 font-sans text-slate-400 text-[10px]">{row.item.reason}</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(row.catKey, row.item.id, row.item.name)}
                                  className="w-6 h-6 rounded-md bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all flex items-center justify-center mx-auto"
                                >
                                  <i className="fas fa-trash text-[10px]"></i>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {moduleTab === 'MATRIX' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE KPI SUMMARY CARDS (RATIO VS MTD REV & VARIANCE) */}
              <ModuleExecutiveKpis
                themeColor="amber"
                totalSpend={totalPattyCashSpend}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="pcs"
                benchmarkRatioThresholds={{ warning: 1.5, danger: 3.0 }}
              />

      {/* CATEGORY BREAKDOWN CARDS & PILLS */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <i className="fas fa-sitemap text-amber-400"></i> Kategori Pengeluaran Patty Cash (Klik untuk Filter)
          </h3>
          {activeCategoryFilter !== 'ALL' && (
            <button
              onClick={() => setActiveCategoryFilter('ALL')}
              className="text-xs text-amber-400 hover:underline font-bold"
            >
              Reset Filter (Tampilkan Semua)
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {PATTY_CASH_CATEGORIES.map(cat => {
            const cData = categorySummaries[cat.key] || { total: 0, itemsCount: 0, count: 0 };
            const isSelected = activeCategoryFilter === cat.key;
            const share = totalPattyCashSpend > 0 ? (cData.total / totalPattyCashSpend) * 100 : 0;

            return (
              <div
                key={cat.key}
                onClick={() => setActiveCategoryFilter(isSelected ? 'ALL' : cat.key)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between ${
                  isSelected 
                    ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-500/40 shadow-lg' 
                    : `${cat.color} hover:bg-white/5`
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <i className={`fas ${cat.icon} text-xs`}></i>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/40 text-slate-300">
                      {share.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-tight text-white leading-tight">
                    {cat.label}
                  </p>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-black font-mono text-white">
                    Rp {cData.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {cData.itemsCount} varian ({cData.count} entri)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FULL DATE RECAP TABLE (TANGGAL 1 - 31) */}
      <BelanjaFullTanggalRecapTable
        title="Tabel Rekap Harian Patty Cash Expense"
        subtitle={`Rekapan penyerapan harian Patty Cash per kategori tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
        icon="fa-wallet"
        themeColor="amber"
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        selectedOutlet={activeOutlet}
        isRegionalView={isRegionalView}
        monthlyStates={recapMonthlyStates}
        columns={recapColumns}
        getDetailItemsForDay={getDetailItemsForDay}
      />

      {/* TOP 5 ITEMS & DAILY SPEND CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Trend Chart */}
        <div className="lg:col-span-7 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-chart-bar text-amber-400"></i> Tren Belanja Patty Cash Harian
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {monthName} {selectedYear}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySpendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickFormatter={(val) => `${(val / 1000).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}k`} 
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(val: any) => [`Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, 'Belanja Patty Cash']}
                  labelFormatter={(label) => `Tanggal ${label} ${monthName} ${selectedYear}`}
                />
                <Bar dataKey="spend" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Items */}
        <div className="lg:col-span-5 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <i className="fas fa-crown text-yellow-400"></i> Top 5 Item Penyerapan Terbesar
            </h3>

            <div className="space-y-3">
              {top5Items.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">Belum ada data item belanja</p>
              ) : (
                top5Items.map((item, idx) => {
                  const share = totalPattyCashSpend > 0 ? (item.totalSpend / totalPattyCashSpend) * 100 : 0;
                  return (
                    <div key={item.key} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-[10px] flex-none">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate max-w-[150px]">{item.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5 flex-none">
                            {item.categoryLabel}
                          </span>
                        </div>
                        <span className="font-mono font-black text-amber-400 text-xs">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${Math.min(100, share * 3)}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 text-[10px] text-slate-400 flex justify-between">
            <span>Total 5 Teratas:</span>
            <span className="font-bold text-white font-mono">
              Rp {top5Items.reduce((a, b) => a + b.totalSpend, 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* MATRIX DETAIL DARI SETIAP ITEM & KATEGORI */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2.5">
              <i className="fas fa-table text-amber-400"></i> Matrix Detail Item Belanja Patty Cash
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar seluruh item, kuantitas volume, rata-rata harga satuan, total nominal, dan histori transaksi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                placeholder="Cari nama item, PIC, catatan..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Sort Selector */}
            <select
              value={matrixSortBy}
              onChange={(e) => setMatrixSortBy(e.target.value as any)}
              className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="spend_desc">Nominal Tertinggi</option>
              <option value="spend_asc">Nominal Terendah</option>
              <option value="qty_desc">Qty Terbanyak</option>
              <option value="name_asc">Nama (A-Z)</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setMatrixViewMode('ITEM_LIST')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'ITEM_LIST' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-list mr-1"></i> List
              </button>
              <button
                onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'OUTLET_PIVOT' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-th mr-1"></i> Pivot Outlet
              </button>
            </div>
          </div>
        </div>

        {/* MATRIX CONTENT TABLE */}
        {matrixViewMode === 'ITEM_LIST' ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Nama Item</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4 text-center">Total Qty</th>
                  <th className="py-3 px-4 text-right">Rata-rata Harga</th>
                  <th className="py-3 px-4 text-right">Min - Max Harga</th>
                  <th className="py-3 px-4 text-right font-black text-amber-400">Total Belanja (Rp)</th>
                  <th className="py-3 px-4 text-center">% Share</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredMatrixItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                      <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                      Tidak ada data item belanja Patty Cash yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixItems.map((item, index) => {
                    const share = totalPattyCashSpend > 0 ? (item.totalSpend / totalPattyCashSpend) * 100 : 0;
                    return (
                      <tr key={item.key} className="hover:bg-amber-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold">{index + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="hover:text-amber-400 transition-colors text-left font-bold"
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-white/10">
                            {item.categoryLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-200">
                          {item.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          Rp {item.avgPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 text-[11px]">
                          {item.minPrice === item.maxPrice ? (
                            `Rp ${item.minPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
                          ) : (
                            `Rp ${item.minPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })} - ${item.maxPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-amber-400 bg-amber-500/5">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                          {share.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white transition-all text-[10px] font-black uppercase"
                          >
                            <i className="fas fa-eye mr-1"></i> Rincian ({item.txCount})
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* OUTLET PIVOT VIEW */
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80">
            {(() => {
              const pivotOutlets = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet as Outlet];
              return (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                      <th className="py-3 px-4 w-12 text-center sticky left-0 bg-slate-900 z-10">#</th>
                      <th className="py-3 px-4 sticky left-12 bg-slate-900 z-10">Nama Item</th>
                      <th className="py-3 px-4">Kategori</th>
                      {pivotOutlets.map(o => (
                        <th key={o} className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">{o}</th>
                      ))}
                      <th className="py-3 px-4 text-center bg-amber-950/40 text-amber-300">Total Qty</th>
                      <th className="py-3 px-4 text-right bg-amber-950/60 text-amber-300 font-black">Total Belanja (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredMatrixItems.map((item, idx) => (
                      <tr key={item.key} className="hover:bg-amber-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">{idx + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                          <button onClick={() => setSelectedItemForDetail(item)} className="hover:text-amber-400">
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/10 whitespace-nowrap">
                            {item.categoryLabel}
                          </span>
                        </td>
                        {pivotOutlets.map(o => {
                          const spend = item.outletSpend[o] || 0;
                          const qty = item.outletQty[o] || 0;
                          return (
                            <td key={o} className="py-3 px-4 text-right whitespace-nowrap">
                              {spend > 0 ? (
                                <div>
                                  <span className="text-white font-bold">Rp {spend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                  <span className="block text-[9px] text-slate-500">({qty} pcs)</span>
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-center font-bold text-slate-300 bg-amber-950/20">
                          {item.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-amber-400 bg-amber-950/30">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  )}
        </div>

        {/* MODULE DATE MATRIX & VARIANCE SIDEBAR (RIGHT SIDE) */}
        {!isRegionalView && (
          <ModuleDateMatrixSidebar
            themeColor="amber"
            moduleTitle="Patty Cash"
            iconClass="fa-coins"
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onSelectMonth={(idx) => {
              setSelectedMonth(idx);
              setInputDate(`${selectedYear}-${String(idx + 1).padStart(2, '0')}-01`);
            }}
            selectedDate={inputDate}
            onSelectDate={(dStr) => {
              setInputDate(dStr);
            }}
            dailyMatrix={dailyMatrix}
            currentSpend={totalPattyCashSpend}
            lastMonthSpend={lastMonthSpend}
            currentMtdRevenue={currentMtdRevenue}
            lastMonthMtdRevenue={lastMonthMtdRevenue}
            monthlyOverviewStats={monthlyOverviewStats}
            categoryVariances={categoryVariances}
            itemVariances={itemVariances}
            itemUnit="tx"
          />
        )}
      </div>

      {/* MODAL RINCIAN TRANSAKSI ITEM */}
      <AnimatePresence>
        {selectedItemForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/15 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 bg-slate-950/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                    <i className="fas fa-receipt"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {selectedItemForDetail.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Kategori: <span className="text-amber-400 font-bold">{selectedItemForDetail.categoryLabel}</span> • Total {selectedItemForDetail.txCount} Transaksi
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Modal Body: Transaction Log */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Pengeluaran</span>
                    <span className="text-base font-black font-mono text-amber-400">
                      Rp {selectedItemForDetail.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Volume Qty</span>
                    <span className="text-base font-black font-mono text-blue-400">
                      {selectedItemForDetail.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} pcs
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Harga Rata-rata</span>
                    <span className="text-base font-black font-mono text-emerald-400">
                      Rp {selectedItemForDetail.avgPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Outlet</th>
                        <th className="py-2.5 px-3">Divisi</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                        <th className="py-2.5 px-3 text-right font-black">Subtotal</th>
                        <th className="py-2.5 px-3">PIC / Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {selectedItemForDetail.transactions.map((tx, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">{tx.date}</td>
                          <td className="py-2.5 px-3 font-sans text-white font-bold">{tx.outlet}</td>
                          <td className="py-2.5 px-3 font-sans">
                            {tx.division ? (
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                tx.division === 'BAR'
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}>
                                {tx.division}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{tx.qty}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">Rp {tx.price.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-black text-amber-400">Rp {tx.subtotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px]">{tx.pic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 bg-slate-950/50 flex justify-end">
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL INPUT BUDGET NOMINAL PER KATEGORI PATTY CASH */}
        {isEditingBudgetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg shadow-inner">
                    <i className="fas fa-coins"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      Input Budget Kategori (Nominal Angka)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Periode: <span className="text-amber-400 font-bold">{monthName} {selectedYear}</span> • Acuan: MTD Revenue Aktual <span className="text-emerald-400 font-bold font-mono">Rp {mtdActualRevenue.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditingBudgetModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Information Callout */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="fas fa-lock"></i>
                  </div>
                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-amber-300 block">
                      Aturan Pembekuan Budget Patty Cash:
                    </span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Input kategori budget dibekukan <span className="text-white font-bold">kecuali Maintenance</span>. Kategori Maintenance dapat diinput secara manual dan langsung mengurangi Total Budget Awal Patty Cash, lalu sisa budget dibagikan otomatis ke kategori lainnya secara proporsional.
                    </p>
                  </div>
                </div>

                {/* Total Budget Awal & Quick Presets */}
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black uppercase text-indigo-300 tracking-wider block">
                        Nilai Total Budget Patty Cash Awal
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Total plafon sebelum dikurangi alokasi Maintenance
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-black text-indigo-400 pointer-events-none">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={baseTotalBudget.toLocaleString('id-ID')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const newTotal = parseInt(raw, 10) || 0;
                          setBaseTotalBudget(newTotal);
                          const curMaint = parseInt(String(tempCategoryNominals['maintenance'] || '').replace(/[^0-9]/g, ''), 10) || 0;
                          setTempCategoryNominals(allocateBudgetsFromMaintenance(newTotal, curMaint));
                        }}
                        className="w-44 bg-slate-900 text-white font-mono font-bold text-sm pl-9 pr-3 py-2 rounded-xl border border-indigo-500/40 focus:outline-none focus:border-indigo-400 text-right"
                        placeholder="3.000.000"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Quick Preset dari MTD Revenue Aktual
                      </span>
                      <span className="text-[10px] text-slate-400">
                        MTD Rev: <span className="text-emerald-400 font-mono font-bold">Rp {mtdActualRevenue.toLocaleString('id-ID')}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '0.20% (Ketat)', pct: 0.20 },
                        { label: '0.30% (Standard)', pct: 0.30 },
                        { label: '0.40% (Medium)', pct: 0.40 },
                        { label: '0.50% (Fleksibel)', pct: 0.50 }
                      ].map(p => (
                        <button
                          key={p.pct}
                          type="button"
                          onClick={() => {
                            const baseRev = mtdActualRevenue > 0 ? mtdActualRevenue : 1000000000;
                            const targetTotal = Math.round((p.pct / 100) * baseRev);
                            setBaseTotalBudget(targetTotal);
                            const curMaint = parseInt(String(tempCategoryNominals['maintenance'] || '').replace(/[^0-9]/g, ''), 10) || Math.round(targetTotal * 0.167);
                            setTempCategoryNominals(allocateBudgetsFromMaintenance(targetTotal, curMaint));
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white text-[11px] font-black transition-all border border-white/5 cursor-pointer text-center"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sisa Budget Indicator */}
                {(() => {
                  const curMaint = parseInt(String(tempCategoryNominals['maintenance'] || '').replace(/[^0-9]/g, ''), 10) || 0;
                  const remaining = Math.max(0, baseTotalBudget - curMaint);
                  return (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                        <span className="text-[9px] font-black uppercase text-slate-500 block">Total Budget Awal</span>
                        <span className="text-xs font-mono font-bold text-white">Rp {baseTotalBudget.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/20">
                        <span className="text-[9px] font-black uppercase text-amber-400 block">Maintenance (Manual)</span>
                        <span className="text-xs font-mono font-bold text-amber-300">Rp {curMaint.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20">
                        <span className="text-[9px] font-black uppercase text-blue-400 block">Sisa Dibagikan</span>
                        <span className="text-xs font-mono font-bold text-blue-300">Rp {remaining.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Table Category Nominal Input */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-black uppercase text-slate-400 px-1">
                    <span>Kategori Patty Cash</span>
                    <span>Nominal Budget (Rp) & Status</span>
                  </div>

                  <div className="divide-y divide-white/5 bg-slate-950/60 rounded-2xl border border-white/10 p-2">
                    {PATTY_CASH_CATEGORIES.map(cat => {
                      const rawVal = String(tempCategoryNominals[cat.key] || '').replace(/[^0-9]/g, '');
                      const numVal = parseInt(rawVal, 10) || 0;
                      const catPctOfMtd = mtdActualRevenue > 0 ? (numVal / mtdActualRevenue) * 100 : 0;
                      const catRealization = categorySummaries[cat.key]?.total || 0;
                      const isMaintenance = cat.key === 'maintenance';

                      return (
                        <div
                          key={cat.key}
                          className={`py-3 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl transition-all ${
                            isMaintenance ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-white/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white block">{cat.label}</span>
                              {isMaintenance ? (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <i className="fas fa-pen text-[7px]"></i> Input Manual
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-white/10 flex items-center gap-1">
                                  <i className="fas fa-lock text-[7px]"></i> Dibekukan
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              Realisasi: <span className="font-mono text-amber-400 font-bold">Rp {catRealization.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                              {!isMaintenance && (
                                <span className="text-slate-500 ml-1.5">
                                  • Porsi {(FROZEN_CATEGORY_WEIGHTS[cat.key] ? (FROZEN_CATEGORY_WEIGHTS[cat.key] * 100).toFixed(0) : '12')}% sisa
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="relative flex items-center">
                              <span className={`absolute left-3 text-xs font-black pointer-events-none ${isMaintenance ? 'text-amber-400' : 'text-slate-500'}`}>
                                Rp
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                disabled={!isMaintenance}
                                readOnly={!isMaintenance}
                                value={tempCategoryNominals[cat.key] ?? '0'}
                                onChange={(e) => {
                                  if (!isMaintenance) return;
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const maintVal = parseInt(raw, 10) || 0;
                                  setTempCategoryNominals(allocateBudgetsFromMaintenance(baseTotalBudget, maintVal));
                                }}
                                onBlur={() => {
                                  if (!isMaintenance) return;
                                  const raw = String(tempCategoryNominals[cat.key] || '').replace(/[^0-9]/g, '');
                                  const cleanNum = parseInt(raw, 10) || 0;
                                  setTempCategoryNominals(allocateBudgetsFromMaintenance(baseTotalBudget, cleanNum));
                                }}
                                className={`w-36 font-mono font-bold text-xs pl-9 pr-3 py-2 rounded-xl text-right transition-all ${
                                  isMaintenance
                                    ? 'bg-slate-900 text-amber-300 border border-amber-500/50 focus:outline-none focus:border-amber-400 ring-2 ring-amber-500/20'
                                    : 'bg-slate-950/70 text-slate-400 border border-white/5 cursor-not-allowed opacity-90'
                                }`}
                                placeholder="0"
                                title={!isMaintenance ? 'Input dibekukan. Nilai dihitung otomatis dari sisa budget setelah Maintenance.' : 'Input manual budget Maintenance'}
                              />
                            </div>

                            <div className="w-24 text-right">
                              <span className="text-xs font-mono font-black text-indigo-400 block">
                                {catPctOfMtd > 0 ? `${catPctOfMtd.toFixed(2)}%` : '0%'}
                              </span>
                              <span className="text-[9px] text-slate-500 uppercase tracking-wider block">dari MTD Rev</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Total Summary Row */}
                {(() => {
                  const totalNominal: number = (Object.values(tempCategoryNominals) as any[]).reduce((a: number, b: any): number => {
                    const raw = String(b || '').replace(/[^0-9]/g, '');
                    return a + (parseInt(raw, 10) || 0);
                  }, 0);
                  const totalPct = mtdActualRevenue > 0 ? (totalNominal / mtdActualRevenue) * 100 : 0;
                  return (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-slate-950 border border-indigo-500/30 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-black uppercase text-indigo-300 block">
                          Total Budget Nominal Patty Cash
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {totalPct > 0 ? `${totalPct.toFixed(2)}% dari MTD Revenue Aktual` : 'Total akumulasi budget kategori'}
                          {mtdActualRevenue > 0 ? ` (Rp ${mtdActualRevenue.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})` : ''}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black font-mono text-white block">
                          Rp {totalNominal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        {totalPct > 0 && (
                          <span className="text-[10px] font-bold text-indigo-400 font-mono">
                            {totalPct.toFixed(2)}% dari MTD Rev
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 bg-slate-950/60 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsEditingBudgetModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategoryBudgets}
                  className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-950/50 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i> Simpan Budget
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL PURCHASE REQUEST GENERATOR (TEMPLATE WHATSAPP) */}
        {isPurchaseRequestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-emerald-500/30 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl shadow-inner">
                    <i className="fab fa-whatsapp"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                      Purchase Request (Template WhatsApp)
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        Patty Cash
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Buat pengajuan belanja harian dengan format resmi & kalkulasi budget otomatis
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPurchaseRequestModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form Input Column */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                      <i className="fas fa-edit"></i> Form Purchase Request
                    </h4>
                    <button
                      type="button"
                      onClick={handleImportTodayItemsToPr}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold transition-all border border-amber-500/30 flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fas fa-magic"></i> Ambil dari Belanja Hari Ini ({currentDayAllItems.length})
                    </button>
                  </div>

                  <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-white/10">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        Outlet:
                      </label>
                      <input
                        type="text"
                        value={prOutlet}
                        onChange={(e) => setPrOutlet(e.target.value)}
                        className="w-full bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400"
                        placeholder="Contoh: SH The Barn"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        Date/ Month:
                      </label>
                      <input
                        type="text"
                        value={prDate}
                        onChange={(e) => setPrDate(e.target.value)}
                        className="w-full bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400"
                        placeholder="Contoh: 31 August 2026"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        Amount:
                      </label>
                      <input
                        type="text"
                        value={prAmount}
                        onChange={(e) => setPrAmount(e.target.value)}
                        className="w-full bg-slate-900 text-amber-300 font-mono font-bold text-xs px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400"
                        placeholder="Contoh: ± Rp 150.000,-"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 block">
                          Item (Daftar Barang):
                        </label>
                        <span className="text-[9px] text-slate-500">Awali baris dengan strip (-)</span>
                      </div>
                      <textarea
                        rows={4}
                        value={prItems}
                        onChange={(e) => setPrItems(e.target.value)}
                        className="w-full bg-slate-900 text-white font-mono text-xs p-3 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400 resize-none leading-relaxed"
                        placeholder="- Sayur Segar 2 kg&#10;- Kertas Thermal 5 roll"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        Reason (Alasan Pembelian):
                      </label>
                      <input
                        type="text"
                        value={prReason}
                        onChange={(e) => setPrReason(e.target.value)}
                        className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400"
                        placeholder="Contoh: Kebutuhan Operasional"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        Leader In Charge:
                      </label>
                      <input
                        type="text"
                        value={prLeader}
                        onChange={(e) => setPrLeader(e.target.value)}
                        className="w-full bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400"
                        placeholder="Nama Leader / MOD penanggung jawab"
                      />
                    </div>
                  </div>

                  {/* Real-time Budget Info Preview */}
                  <div className="p-3 rounded-2xl bg-slate-950/80 border border-white/10 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase block">Budget</span>
                      <span className="font-mono font-bold text-indigo-400 text-[11px]">Rp {pattyCashBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase block">Usage</span>
                      <span className="font-mono font-bold text-amber-400 text-[11px]">Rp {pattyCashUsage.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase block">Remaining</span>
                      <span className={`font-mono font-bold text-[11px] ${remainingBudget < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        Rp {remainingBudget.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Live Preview Column */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <i className="fab fa-whatsapp"></i> Live Preview Template WhatsApp
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">Format Pesan Siap Kirim</span>
                  </div>

                  {/* WhatsApp Chat Bubble */}
                  <div className="bg-[#0b141a] p-4 rounded-2xl border border-emerald-500/20 shadow-inner flex-1 flex flex-col justify-between">
                    <div className="bg-[#202c33] p-4 rounded-xl text-slate-100 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all border-l-4 border-emerald-500 shadow-md">
                      {generatePurchaseRequestText()}
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyPurchaseRequestWA}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <i className="fas fa-copy"></i> Salin Template WA
                      </button>
                      <button
                        type="button"
                        onClick={handleSendPurchaseRequestWA}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-black text-xs uppercase tracking-wider transition-all border border-emerald-500/30 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <i className="fab fa-whatsapp text-sm"></i> Kirim ke WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 bg-slate-950/60 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsPurchaseRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleCopyPurchaseRequestWA}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-check"></i> Salin & Selesai
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PattyCashExpenseModule;
