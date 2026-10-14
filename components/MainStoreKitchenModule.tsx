import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet } from '../types';
import { OUTLETS, INITIAL_STATE, ORDER_SCHEDULES_BY_AREA, getOrderScheduleForOutlet, isOrderDayForOutlet } from '../constants';
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

export interface MatrixStoreKitchenItem {
  key: string;
  name: string;
  sourceKey: 'MAIN_STORE' | 'MAIN_KITCHEN';
  sourceLabel: string;
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
    source: string;
    qty: number;
    price: number;
    subtotal: number;
    pic: string;
    reason: string;
  }[];
}

const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const MainStoreKitchenModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
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
  const [moduleTab, setModuleTab] = useState<'INPUT' | 'REKAP_HARIAN' | 'MATRIX'>('INPUT');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'MAIN_STORE' | 'MAIN_KITCHEN'>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'spend_desc' | 'spend_asc' | 'qty_desc' | 'name_asc'>('spend_desc');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MatrixStoreKitchenItem | null>(null);

  // Input states
  const [inputDate, setInputDate] = useState<string>(() => {
    if (filters?.startDate) return filters.startDate;
    const now = new Date();
    if (now.getMonth() === selectedMonth && now.getFullYear() === selectedYear) {
      return toLocalDateStr(now);
    }
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  });
  const [inputSource, setInputSource] = useState<'MAIN_STORE' | 'MAIN_KITCHEN'>('MAIN_STORE');
  const [inputName, setInputName] = useState<string>('');
  const [inputQty, setInputQty] = useState<string>('1');
  const [inputPrice, setInputPrice] = useState<string>('');
  const [inputPic, setInputPic] = useState<string>('');
  const [inputReason, setInputReason] = useState<string>('');

  React.useEffect(() => {
    if (!isRegionalView && propSelectedOutlet) {
      setActiveOutlet(propSelectedOutlet);
    } else if (isRegionalView) {
      setActiveOutlet(propSelectedOutlet || 'ALL');
    }
  }, [propSelectedOutlet, isRegionalView]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];
  const reportId = `main-store-kitchen-${activeOutlet}-${monthPrefix}`;

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

  const outletOrderSchedule = useMemo(() => {
    return getOrderScheduleForOutlet(activeOutlet);
  }, [activeOutlet]);

  const isInputDateOrderDay = useMemo(() => {
    return isOrderDayForOutlet(activeOutlet, inputDate);
  }, [activeOutlet, inputDate]);

  // Current day items
  const currentDayStoreItems = useMemo(() => {
    return (data.dailyMainStoreLedger && data.dailyMainStoreLedger[inputDate]) || (data.dailyMainStore && data.dailyMainStore[inputDate]) || [];
  }, [data.dailyMainStoreLedger, data.dailyMainStore, inputDate]);

  const currentDayKitchenItems = useMemo(() => {
    return (data.dailyMainKitchenLedger && data.dailyMainKitchenLedger[inputDate]) || (data.dailyMainKitchen && data.dailyMainKitchen[inputDate]) || [];
  }, [data.dailyMainKitchenLedger, data.dailyMainKitchen, inputDate]);

  const currentDayDeductions = useMemo(() => {
    const list = (data.dailyChemicalLedger && data.dailyChemicalLedger[inputDate]) || [];
    let chem = 0;
    let stat = 0;
    let mkt = 0;
    list.forEach((it: any) => {
      const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const cat = (it.category || 'CHEMICAL').toUpperCase();
      if (cat === 'STATIONARY') stat += sub;
      else if (cat === 'MARKETING') mkt += sub;
      else chem += sub;
    });
    return {
      chemical: chem,
      stationary: stat,
      marketing: mkt,
      total: chem + stat + mkt,
      items: list
    };
  }, [data.dailyChemicalLedger, inputDate]);

  const currentDayStoreTotal = useMemo(() => {
    return currentDayStoreItems.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  }, [currentDayStoreItems]);

  const currentDayStoreNet = Math.max(0, currentDayStoreTotal - currentDayDeductions.total);

  const currentDayKitchenTotal = useMemo(() => {
    return currentDayKitchenItems.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  }, [currentDayKitchenItems]);

  const currentDayCombinedTotal = currentDayStoreNet + currentDayKitchenTotal;

  // Monthly overview stats for Sidebar
  const monthlyOverviewStats = useMemo(() => {
    const stats: Record<number, { totalSpend: number; storeSpend: number; kitchenSpend: number; txCount: number }> = {};
    for (let m = 0; m < 12; m++) {
      stats[m] = { totalSpend: 0, storeSpend: 0, kitchenSpend: 0, txCount: 0 };
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
      // Store
      if (st.dailyMainStoreLedger) {
        Object.entries(st.dailyMainStoreLedger).forEach(([dStr, items]) => {
          if (!dStr.startsWith(String(selectedYear))) return;
          const mIdx = parseInt(dStr.split('-')[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12 && Array.isArray(items)) {
            items.forEach((it: any, idx: number) => {
              const uKey = `store_${dStr}_${it.id || (it.name + '_' + idx + '_' + it.price)}`;
              if (processedTx.has(uKey)) return;
              processedTx.add(uKey);
              const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
              stats[mIdx].totalSpend += sub;
              stats[mIdx].storeSpend += sub;
              stats[mIdx].txCount += 1;
            });
          }
        });
      }

      // Kitchen
      if (st.dailyMainKitchenLedger) {
        Object.entries(st.dailyMainKitchenLedger).forEach(([dStr, items]) => {
          if (!dStr.startsWith(String(selectedYear))) return;
          const mIdx = parseInt(dStr.split('-')[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12 && Array.isArray(items)) {
            items.forEach((it: any, idx: number) => {
              const uKey = `kitchen_${dStr}_${it.id || (it.name + '_' + idx + '_' + it.price)}`;
              if (processedTx.has(uKey)) return;
              processedTx.add(uKey);
              const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
              stats[mIdx].totalSpend += sub;
              stats[mIdx].kitchenSpend += sub;
              stats[mIdx].txCount += 1;
            });
          }
        });
      }
    });

    return stats;
  }, [data, allMonthlyData, activeOutlet, isRegionalView, selectedYear]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      showToast?.('Nama Item Barang / Bahan wajib diisi!', 'error');
      return;
    }
    const qtyNum = parseFloat(inputQty.toString().replace(/,/g, '.')) || 1;
    const priceNum = parseFloat(inputPrice.toString().replace(/,/g, '.')) || 0;
    if (priceNum <= 0) {
      showToast?.('Harga satuan harus lebih dari 0!', 'error');
      return;
    }

    if (!onUpdate) {
      showToast?.('Mode tampilan hanya baca (read-only).', 'error');
      return;
    }

    const newItem: LedgerItem = {
      id: (inputSource === 'MAIN_STORE' ? 'ms-' : 'mk-') + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: inputName.trim(),
      qty: qtyNum,
      price: priceNum,
      pic: inputPic.trim() || (inputSource === 'MAIN_STORE' ? 'Staff Store' : 'Staff Kitchen'),
      reason: inputReason.trim() || '-'
    };

    onUpdate((prev: AppState) => {
      let updatedStore = prev.dailyMainStoreLedger || {};
      let updatedKitchen = prev.dailyMainKitchenLedger || {};

      if (inputSource === 'MAIN_STORE') {
        const curList = updatedStore[inputDate] || [];
        updatedStore = {
          ...updatedStore,
          [inputDate]: [...curList, newItem]
        };
      } else {
        const curList = updatedKitchen[inputDate] || [];
        updatedKitchen = {
          ...updatedKitchen,
          [inputDate]: [...curList, newItem]
        };
      }

      // Sync expenses (Main Store is net of Chemical, Stationary, Marketing)
      const grossStoreTotal = (updatedStore[inputDate] || []).reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      const kitchenTotal = (updatedKitchen[inputDate] || []).reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

      const chemItems = (prev.dailyChemicalLedger && prev.dailyChemicalLedger[inputDate]) || [];
      const totalDeductions = chemItems.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      const netStoreTotal = Math.max(0, grossStoreTotal - totalDeductions);

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
          mainStore: netStoreTotal,
          mainKitchen: kitchenTotal
        }
      };

      return {
        ...prev,
        dailyMainStoreLedger: updatedStore,
        dailyMainKitchenLedger: updatedKitchen,
        expenses: updatedExpenses
      };
    });

    setInputName('');
    setInputQty('1');
    setInputPrice('');
    setInputPic('');
    setInputReason('');
    showToast?.(`Item "${newItem.name}" (${inputSource === 'MAIN_STORE' ? 'Main Store' : 'Main Kitchen'}) berhasil ditambahkan!`, 'success');
  };

  const handleDeleteItem = (source: 'MAIN_STORE' | 'MAIN_KITCHEN', itemId: string, itemName: string) => {
    if (!onUpdate) return;
    onUpdate((prev: AppState) => {
      let updatedStore = prev.dailyMainStoreLedger || {};
      let updatedKitchen = prev.dailyMainKitchenLedger || {};

      if (source === 'MAIN_STORE') {
        const curList = updatedStore[inputDate] || [];
        updatedStore = {
          ...updatedStore,
          [inputDate]: curList.filter(it => it.id !== itemId)
        };
      } else {
        const curList = updatedKitchen[inputDate] || [];
        updatedKitchen = {
          ...updatedKitchen,
          [inputDate]: curList.filter(it => it.id !== itemId)
        };
      }

      const grossStoreTotal = (updatedStore[inputDate] || []).reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      const kitchenTotal = (updatedKitchen[inputDate] || []).reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

      const chemItems = (prev.dailyChemicalLedger && prev.dailyChemicalLedger[inputDate]) || [];
      const totalDeductions = chemItems.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      const netStoreTotal = Math.max(0, grossStoreTotal - totalDeductions);

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
        dailyMainStoreLedger: updatedStore,
        dailyMainKitchenLedger: updatedKitchen,
        expenses: {
          ...(prev.expenses || {}),
          [inputDate]: {
            ...currentDayExpenses,
            mainStore: netStoreTotal,
            mainKitchen: kitchenTotal
          }
        }
      };
    }, undefined, true);

    showToast?.(`Item "${itemName}" dihapus.`, 'info');
  };

  // State resolver
  const getOutletMonthState = (outletName: string, mIdx = selectedMonth, yNum = selectedYear): AppState => {
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet) {
      if (mIdx === currentMonthIdx && yNum === currentYear) {
        return data;
      }
    }
    if (allMonthlyData) {
      if (allMonthlyData[outletName] && allMonthlyData[outletName][String(mIdx)]) {
        return allMonthlyData[outletName][String(mIdx)];
      }
      if (!isRegionalView && propSelectedOutlet && outletName === propSelectedOutlet && allMonthlyData[String(mIdx)]) {
        return allMonthlyData[String(mIdx)];
      }
    }
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet && mIdx === currentMonthIdx) {
      return data;
    }
    return {
      ...INITIAL_STATE,
      dailyMainStoreLedger: {},
      dailyMainKitchenLedger: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} }
    };
  };

  const targetOutlets = useMemo(() => {
    return isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  // Aggregate Data
  const {
    totalCombinedSpend,
    totalMainStoreSpend,
    totalMainKitchenSpend,
    totalQtyAll,
    allMatrixItems,
    dailySpendChartData,
    top5Items,
    dailySpendMap,
    dailyTxMap,
    dailyItemsMap
  } = useMemo(() => {
    const itemsMap = new Map<string, MatrixStoreKitchenItem>();
    const dailySpendMap: Record<string, { store: number; kitchen: number; total: number }> = {};
    const dailyTxMap: Record<string, number> = {};
    const dailyItemsMap: Record<string, any[]> = {};
    let storeSum = 0;
    let kitchenSum = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${monthPrefix}-${dayStr}`;
      dailySpendMap[dateStr] = { store: 0, kitchen: 0, total: 0 };
      dailyTxMap[dateStr] = 0;
      dailyItemsMap[dateStr] = [];
    }

    const processLedger = (
      st: AppState, 
      outletName: string, 
      ledgerKey: 'dailyMainStoreLedger' | 'dailyMainKitchenLedger',
      sourceKey: 'MAIN_STORE' | 'MAIN_KITCHEN',
      sourceLabel: string
    ) => {
      const ledgerRecord = st[ledgerKey] || {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateStr = `${monthPrefix}-${dayStr}`;
        const itemsList = ledgerRecord[dateStr] || [];
        const isInFilterRange = d >= filterStartDay && d <= filterEndDay;

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          itemsList.forEach((it: any) => {
            const cleanName = (it.name || 'Item Store/Kitchen').trim();
            if (!cleanName) return;

            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const subtotal = qty * price;

            if (dailySpendMap[dateStr]) {
              if (sourceKey === 'MAIN_STORE') dailySpendMap[dateStr].store += subtotal;
              else dailySpendMap[dateStr].kitchen += subtotal;
              dailySpendMap[dateStr].total += subtotal;
              dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
            }

            dailyItemsMap[dateStr].push({
              name: cleanName,
              qty,
              unit: 'unit',
              price,
              amount: subtotal,
              category: sourceLabel
            });

            if (isInFilterRange) {
              if (sourceKey === 'MAIN_STORE') storeSum += subtotal;
              else kitchenSum += subtotal;

              const mapKey = `${sourceKey}:::${cleanName.toLowerCase()}`;
              if (!itemsMap.has(mapKey)) {
                itemsMap.set(mapKey, {
                  key: mapKey,
                  name: cleanName,
                  sourceKey,
                  sourceLabel,
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
                    source: sourceLabel,
                    qty,
                    price,
                    subtotal,
                    pic: it.pic || it.reason || '-',
                    reason: it.reason || '-'
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
                  source: sourceLabel,
                  qty,
                  price,
                  subtotal,
                  pic: it.pic || it.reason || '-',
                  reason: it.reason || '-'
                });
              }
            }
          });
        } else if (st.expenses && st.expenses[dateStr]) {
          const exp = st.expenses[dateStr] as any;
          const fbKey = sourceKey === 'MAIN_STORE' ? 'mainStore' : 'mainKitchen';
          const fallbackVal = Number(exp[fbKey]) || 0;
          if (fallbackVal > 0) {
            dailySpendMap[dateStr].total += fallbackVal;
            dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
            if (sourceKey === 'MAIN_STORE') {
              dailySpendMap[dateStr].store += fallbackVal;
              if (isInFilterRange) storeSum += fallbackVal;
            } else {
              dailySpendMap[dateStr].kitchen += fallbackVal;
              if (isInFilterRange) kitchenSum += fallbackVal;
            }
          }
        }
      }
    };

    targetOutlets.forEach(outletName => {
      const st = getOutletMonthState(outletName, selectedMonth, selectedYear);
      if (!st) return;

      processLedger(st, outletName, 'dailyMainStoreLedger', 'MAIN_STORE', 'Main Store');
      processLedger(st, outletName, 'dailyMainKitchenLedger', 'MAIN_KITCHEN', 'Main Kitchen');
    });

    const itemsList = Array.from(itemsMap.values());
    const totalQty = itemsList.reduce((acc, it) => acc + it.totalQty, 0);

    const chartData = Object.entries(dailySpendMap).map(([dateStr, obj]) => ({
      day: dateStr.split('-')[2],
      date: dateStr,
      store: obj.store,
      kitchen: obj.kitchen,
      total: obj.total
    }));

    const top5 = [...itemsList].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

    return {
      totalCombinedSpend: storeSum + kitchenSum,
      totalMainStoreSpend: storeSum,
      totalMainKitchenSpend: kitchenSum,
      totalQtyAll: totalQty,
      allMatrixItems: itemsList,
      dailySpendChartData: chartData,
      top5Items: top5,
      dailySpendMap,
      dailyTxMap,
      dailyItemsMap
    };
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth, filterStartDay, filterEndDay]);

  // Last Month calculations (Filtered by same date range)
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

  // Last Month Main Store & Kitchen Spend + item map (Filtered by same date range)
  const { lastMonthSpend, lastMonthStoreSpend, lastMonthKitchenSpend, lastMonthStoreQty, lastMonthKitchenQty, lastMonthItemsMap } = useMemo(() => {
    let storeSum = 0;
    let kitchenSum = 0;
    let storeQty = 0;
    let kitchenQty = 0;
    const lastMap: Record<string, { spend: number; qty: number }> = {};
    const maxDayForLm = Math.min(filterEndDay, daysInLastMonth);

    targetOutlets.forEach(o => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      if (!st) return;

      const calcLedger = (
        ledgerKey: 'dailyMainStoreLedger' | 'dailyMainKitchenLedger', 
        expKey: 'mainStore' | 'mainKitchen',
        sourceKey: 'MAIN_STORE' | 'MAIN_KITCHEN'
      ) => {
        let total = 0;
        const ledger = st[ledgerKey] || {};
        for (let d = filterStartDay; d <= maxDayForLm; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dStr = `${lastMonthPrefix}-${dayStr}`;
          const items = ledger[dStr] || [];
          if (Array.isArray(items) && items.length > 0) {
            items.forEach((it: any) => {
              const qty = Number(it.qty) || 1;
              const price = Number(it.price) || 0;
              const amt = qty * price;
              total += amt;
              if (sourceKey === 'MAIN_STORE') storeQty += qty;
              else kitchenQty += qty;

              const cleanName = (it.name || '').trim().toLowerCase();
              if (cleanName) {
                const mapKey = `${sourceKey}:::${cleanName}`;
                if (!lastMap[mapKey]) {
                  lastMap[mapKey] = { spend: amt, qty };
                } else {
                  lastMap[mapKey].spend += amt;
                  lastMap[mapKey].qty += qty;
                }
              }
            });
          } else if (st.expenses && st.expenses[dStr]) {
            const exp = st.expenses[dStr] as any;
            total += Number(exp[expKey]) || 0;
          }
        }
        return total;
      };

      storeSum += calcLedger('dailyMainStoreLedger', 'mainStore', 'MAIN_STORE');
      kitchenSum += calcLedger('dailyMainKitchenLedger', 'mainKitchen', 'MAIN_KITCHEN');
    });

    return {
      lastMonthSpend: storeSum + kitchenSum,
      lastMonthStoreSpend: storeSum,
      lastMonthKitchenSpend: kitchenSum,
      lastMonthStoreQty: storeQty,
      lastMonthKitchenQty: kitchenQty,
      lastMonthItemsMap: lastMap
    };
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, daysInLastMonth, filterStartDay, filterEndDay, allMonthlyData]);

  // Current division total quantities
  const { currentStoreQty, currentKitchenQty } = useMemo(() => {
    let sQty = 0;
    let kQty = 0;
    allMatrixItems.forEach(it => {
      if (it.sourceKey === 'MAIN_STORE') sQty += it.totalQty;
      else kQty += it.totalQty;
    });
    return { currentStoreQty: sQty, currentKitchenQty: kQty };
  }, [allMatrixItems]);

  // Daily matrix for sidebar
  const dailyMatrix = useMemo(() => {
    const totalDailySpend: Record<string, number> = {};
    Object.entries(dailySpendMap).forEach(([dStr, obj]) => {
      totalDailySpend[dStr] = (obj as { total: number }).total;
    });
    return buildDailyMatrix(selectedYear, selectedMonth, totalDailySpend, dailyTxMap, dailyItemsMap);
  }, [selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap]);

  // Category Variances for Sidebar
  const categoryVariances = useMemo(() => {
    return [
      {
        key: 'MAIN_STORE',
        label: 'Main Store',
        currentSpend: totalMainStoreSpend,
        lastMonthSpend: lastMonthStoreSpend,
        currentQty: currentStoreQty,
        lastMonthQty: lastMonthStoreQty,
        qtyUnit: 'item'
      },
      {
        key: 'MAIN_KITCHEN',
        label: 'Main Kitchen',
        currentSpend: totalMainKitchenSpend,
        lastMonthSpend: lastMonthKitchenSpend,
        currentQty: currentKitchenQty,
        lastMonthQty: lastMonthKitchenQty,
        qtyUnit: 'item'
      }
    ];
  }, [totalMainStoreSpend, totalMainKitchenSpend, lastMonthStoreSpend, lastMonthKitchenSpend, currentStoreQty, currentKitchenQty, lastMonthStoreQty, lastMonthKitchenQty]);

  // Item Variances for Top Items
  const itemVariances = useMemo(() => {
    return allMatrixItems.map(it => {
      const lm = lastMonthItemsMap[it.key];
      return {
        key: it.key,
        label: `[${it.sourceKey === 'MAIN_STORE' ? 'Store' : 'Kitchen'}] ${it.name}`,
        currentSpend: it.totalSpend,
        lastMonthSpend: lm ? lm.spend : 0,
        currentQty: it.totalQty,
        lastMonthQty: lm ? lm.qty : 0,
        qtyUnit: 'item'
      };
    }).sort((a, b) => b.currentSpend - a.currentSpend).slice(0, 20);
  }, [allMatrixItems, lastMonthItemsMap]);

  // Category-specific popular items for input chips (only from recorded transactions)
  const popularStoreItems = useMemo(() => {
    const recorded = allMatrixItems
      .filter(it => it.sourceKey === 'MAIN_STORE')
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);
    return Array.from(new Set(recorded)).slice(0, 12);
  }, [allMatrixItems]);

  const popularKitchenItems = useMemo(() => {
    const recorded = allMatrixItems
      .filter(it => it.sourceKey === 'MAIN_KITCHEN')
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);
    return Array.from(new Set(recorded)).slice(0, 12);
  }, [allMatrixItems]);

  // Filter & Sort
  const filteredMatrixItems = useMemo(() => {
    let list = [...allMatrixItems];

    if (sourceFilter !== 'ALL') {
      list = list.filter(it => it.sourceKey === sourceFilter);
    }

    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) ||
        it.sourceLabel.toLowerCase().includes(q) ||
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
  }, [allMatrixItems, sourceFilter, matrixSearch, matrixSortBy]);

  // Monthly states for full tanggal recap table
  const recapMonthlyStates = useMemo(() => {
    return targetOutlets.map(o => getOutletMonthState(o, selectedMonth, selectedYear)).filter(Boolean);
  }, [targetOutlets, selectedMonth, selectedYear, data, allMonthlyData]);

  // Columns for Main Store & Main Kitchen
  const recapColumns: RecapColumnDef[] = useMemo(() => [
    {
      id: 'mainStoreGross',
      label: 'Main Store (Kotor)',
      shortLabel: 'MS KOTOR',
      getValue: (st, dStr) => {
        const list = (st.dailyMainStoreLedger?.[dStr] || []) as LedgerItem[];
        return list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    },
    {
      id: 'chemDeductions',
      label: 'Pengurang (Chemical/Stationary)',
      shortLabel: 'PENGURANG',
      getValue: (st, dStr) => {
        const chemItems = (st.dailyChemicalLedger?.[dStr] || []) as LedgerItem[];
        return chemItems.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    },
    {
      id: 'mainStoreNet',
      label: 'Main Store (Bersih)',
      shortLabel: 'MS BERSIH',
      getValue: (st, dStr) => {
        const list = (st.dailyMainStoreLedger?.[dStr] || []) as LedgerItem[];
        const gross = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        const chemItems = (st.dailyChemicalLedger?.[dStr] || []) as LedgerItem[];
        const ded = chemItems.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return Math.max(0, gross - ded);
      }
    },
    {
      id: 'mainKitchen',
      label: 'Main Kitchen',
      shortLabel: 'MAIN KITCHEN',
      getValue: (st, dStr) => {
        const list = (st.dailyMainKitchenLedger?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.mainKitchen) || 0);
      }
    }
  ], []);

  // Detail items callback for day popup in full tanggal table
  const getDetailItemsForDay = (dateStr: string, states: AppState[]): DayDetailItem[] => {
    const list: DayDetailItem[] = [];
    states.forEach(st => {
      const outName = st.outlet || activeOutlet;
      const msList = (st.dailyMainStoreLedger?.[dateStr] || []) as LedgerItem[];
      msList.forEach(it => {
        list.push({
          id: it.id,
          outlet: outName,
          category: 'Main Store',
          name: it.name,
          qty: it.qty,
          price: it.price,
          subtotal: (it.qty || 1) * (it.price || 0),
          reason: it.reason,
          pic: it.pic
        });
      });

      const mkList = (st.dailyMainKitchenLedger?.[dateStr] || []) as LedgerItem[];
      mkList.forEach(it => {
        list.push({
          id: it.id,
          outlet: outName,
          category: 'Main Kitchen',
          name: it.name,
          qty: it.qty,
          price: it.price,
          subtotal: (it.qty || 1) * (it.price || 0),
          reason: it.reason,
          pic: it.pic
        });
      });
    });
    return list;
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus App';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('MAIN_STORE_KITCHEN');
      sheet.addRow([`LAPORAN BELANJA MAIN STORE & MAIN KITCHEN - ${activeOutlet}`]);
      sheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      sheet.addRow([`Total Main Store: Rp ${totalMainStoreSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([`Total Main Kitchen: Rp ${totalMainKitchenSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([`Total Combined: Rp ${totalCombinedSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([]);

      const pivotCols = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet];
      sheet.addRow(['No', 'Nama Item', 'Divisi Sumber', 'Total Qty', 'Harga Rata-rata (Rp)', 'Min Harga (Rp)', 'Max Harga (Rp)', 'Total Belanja (Rp)', '% Kontribusi', ...pivotCols.map(o => `Spend ${o}`)]);

      filteredMatrixItems.forEach((it, idx) => {
        const share = totalCombinedSpend > 0 ? (it.totalSpend / totalCombinedSpend) * 100 : 0;
        sheet.addRow([
          idx + 1,
          it.name,
          it.sourceLabel,
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
      saveAs(blob, `Main_Store_Kitchen_${activeOutlet}_${monthPrefix}.xlsx`);
      showToast?.('Berhasil mengunduh Laporan Excel Main Store & Kitchen!', 'success');
    } catch (err) {
      showToast?.('Gagal mengunduh Excel.', 'error');
    }
  };

  // Copy WhatsApp Summary matching strict user template
  const handleCopyWhatsApp = (sourceType?: 'ALL' | 'MAIN_STORE' | 'MAIN_KITCHEN') => {
    const chosenSource = sourceType || sourceFilter;
    const categories: Array<{ categoryName: string; totalSpend?: number; items: any[] }> = [];

    if (chosenSource === 'ALL' || chosenSource === 'MAIN_STORE') {
      const storeItems = allMatrixItems.filter(i => i.sourceKey === 'MAIN_STORE');
      categories.push({
        categoryName: 'MAIN STORE',
        totalSpend: totalMainStoreSpend,
        items: storeItems.map(i => ({
          name: i.name,
          qty: i.totalQty,
          unit: 'unit',
          totalSpend: i.totalSpend,
          avgPrice: i.avgPrice
        }))
      });
    }

    if (chosenSource === 'ALL' || chosenSource === 'MAIN_KITCHEN') {
      const kitchenItems = allMatrixItems.filter(i => i.sourceKey === 'MAIN_KITCHEN');
      categories.push({
        categoryName: 'MAIN KITCHEN',
        totalSpend: totalMainKitchenSpend,
        items: kitchenItems.map(i => ({
          name: i.name,
          qty: i.totalQty,
          unit: 'unit',
          totalSpend: i.totalSpend,
          avgPrice: i.avgPrice
        }))
      });
    }

    const spendToCompare = chosenSource === 'MAIN_STORE'
      ? totalMainStoreSpend
      : chosenSource === 'MAIN_KITCHEN'
      ? totalMainKitchenSpend
      : totalCombinedSpend;

    const lmSpendToCompare = chosenSource === 'MAIN_STORE'
      ? lastMonthStoreSpend
      : chosenSource === 'MAIN_KITCHEN'
      ? lastMonthKitchenSpend
      : lastMonthSpend;

    const titleStr = chosenSource === 'MAIN_STORE'
      ? 'REKAP MAIN STORE EXPENSE'
      : chosenSource === 'MAIN_KITCHEN'
      ? 'REKAP MAIN KITCHEN EXPENSE'
      : 'REKAP MAIN STORE & MAIN KITCHEN EXPENSE';

    const text = generateWhatsAppExpenseText({
      title: titleStr,
      templateType: 'CATEGORY_AMOUNT_ONLY',
      outletName: activeOutlet,
      startDay: filterStartDay,
      endDay: filterEndDay,
      monthName,
      year: selectedYear,
      categories,
      totalSpendAll: spendToCompare,
      lastMonthSpend: lmSpendToCompare,
      currentMtdRevenue,
      lastMonthMtdRevenue
    });

    navigator.clipboard.writeText(text);
    showToast?.(`Rekap WA Tgl ${filterStartDay} - ${filterEndDay} ${monthName} (${chosenSource}) disalin!`, 'success');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-200">
      {/* HEADER BAR */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
              <i className="fas fa-warehouse text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                Main Store & Main Kitchen
              </h2>
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                Monitoring Khusus Requisition Internal Main Store & Central Kitchen
              </p>
            </div>
          </div>
        </div>

        {/* Actions & Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 shadow-sm">
              <i className="fas fa-store text-indigo-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

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
            onClick={() => handleCopyWhatsApp()}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fab fa-whatsapp"></i> WA Rekap
          </button>
          <ShareActions 
            targetId={reportId} 
            title={`Main Store & Kitchen - ${activeOutlet} (${monthName} ${selectedYear})`}
            showToast={showToast}
          />
        </div>
      </div>

      {/* REGIONAL OUTLET FILTER PILLS */}
      {isRegionalView && (
        <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2.5 rounded-2xl border border-white/5 no-print">
          <button
            onClick={() => setActiveOutlet('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
              activeOutlet === 'ALL' || !activeOutlet
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
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
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
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
        title="Filter Tanggal Rekap Belanja Main Store & Kitchen"
        accentColor="indigo"
        onCopyWhatsApp={() => handleCopyWhatsApp()}
        whatsAppButtonLabel="Salin WA (Tgl 1 - 25)"
      />

      {/* MAIN LAYOUT WITH MONTHLY SIDEBAR ON RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {/* NAVIGATION TABS */}
          <div className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-2xl border border-white/10 w-fit no-print">
            <button
              onClick={() => setModuleTab('INPUT')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'INPUT'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-edit"></i> Input Requisition (Store & Kitchen)
            </button>
            <button
              onClick={() => setModuleTab('REKAP_HARIAN')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'REKAP_HARIAN'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-days"></i> Tabel Rekap Harian (1-31)
            </button>
            <button
              onClick={() => setModuleTab('MATRIX')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'MATRIX'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table"></i> Matrix Rekap & Analisis
            </button>
          </div>

          {moduleTab === 'INPUT' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE METRIC SUMMARY: RATIO & VARIANCE */}
              <ModuleExecutiveKpis
                themeColor="indigo"
                totalSpend={totalCombinedSpend}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="unit"
                benchmarkRatioThresholds={{ warning: 25.0, danger: 35.0 }}
              />

              {/* HARI ORDER SCHEDULE INFO BANNER */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 flex-none shadow-inner">
                    <i className="fas fa-truck-ramp-box text-lg"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Jadwal Hari Order ({outletOrderSchedule.areaName})
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-[10px] font-black uppercase">
                        {outletOrderSchedule.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-semibold mt-0.5">
                      Outlet <span className="font-black text-white">{activeOutlet}</span>: Hari Order Requisition resmi adalah <span className="font-black text-amber-400">{outletOrderSchedule.label}</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isInputDateOrderDay ? (
                    <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black flex items-center gap-1.5 shadow-sm">
                      <i className="fas fa-calendar-check text-emerald-400"></i> Hari Order Resmi
                    </span>
                  ) : (
                    <span className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-white/10 text-slate-400 text-xs font-bold flex items-center gap-1.5">
                      <i className="fas fa-calendar-day text-amber-400"></i> Non-Order Day
                    </span>
                  )}
                </div>
              </div>

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
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Requisition:</span>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Hari Ini (Store + Kitchen):</span>
                    <span className="text-lg font-black font-mono text-indigo-400">
                      Rp {currentDayCombinedTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast?.(`Data Requisition tanggal ${inputDate} tersimpan otomatis!`, 'success')}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <i className="fas fa-save"></i> Submit Data Store & Kitchen
                  </button>
                </div>
              </div>

              {/* INPUT FORM CARD */}
              <div className="glass-card p-6 bg-slate-900/90 border border-indigo-500/30 rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-plus-circle text-indigo-400"></i>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Form Input Requisition Internal
                    </h3>
                  </div>

                  {/* Division Toggle */}
                  <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setInputSource('MAIN_STORE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                        inputSource === 'MAIN_STORE'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="fas fa-box-open mr-1"></i> Main Store
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputSource('MAIN_KITCHEN')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                        inputSource === 'MAIN_KITCHEN'
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="fas fa-utensils mr-1"></i> Main Kitchen
                    </button>
                  </div>
                </div>

                {/* Suggested Chips (Only if recorded items exist) */}
                {(inputSource === 'MAIN_STORE' ? popularStoreItems : popularKitchenItems).length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      Item Populer ({inputSource === 'MAIN_STORE' ? 'Main Store' : 'Main Kitchen'}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(inputSource === 'MAIN_STORE' ? popularStoreItems : popularKitchenItems).map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setInputName(item)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer"
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
                      Nama Barang / Bahan *
                    </label>
                    <input
                      type="text"
                      placeholder={inputSource === 'MAIN_STORE' ? 'Contoh: Plastic Bag, Tissue...' : 'Contoh: Minyak Goreng, Bumbu Dasar...'}
                      value={inputName}
                      onChange={e => setInputName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-600 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Jumlah (Qty / Pack / Kg)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      placeholder="1"
                      value={inputQty}
                      onChange={e => setInputQty(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:border-indigo-500"
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
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-indigo-400 font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      PIC / Pemohon
                    </label>
                    <input
                      type="text"
                      placeholder="Nama Staff / Outlet"
                      value={inputPic}
                      onChange={e => setInputPic(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      No. SPB / Catatan
                    </label>
                    <input
                      type="text"
                      placeholder="SPB-1234 / Urgent..."
                      value={inputReason}
                      onChange={e => setInputReason(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-12 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 cursor-pointer"
                    >
                      <i className="fas fa-plus"></i> Tambah Item {inputSource === 'MAIN_STORE' ? 'Main Store' : 'Main Kitchen'}
                    </button>
                  </div>
                </form>

                <FeatureSubmitSyncButton
                  featureName="Main Store & Kitchen"
                  subtext={`Klik setelah selesai input belanja Main Store / Main Kitchen tanggal ${inputDate} agar data langsung tersinkronkan ke seluruh user.`}
                  className="mt-4"
                />
              </div>

              {/* LIST OF TODAY'S TRANSACTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Main Store Table */}
                <div className="glass-card p-5 bg-slate-900/90 border border-blue-500/20 rounded-3xl shadow-xl space-y-3">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Main Store ({inputDate})</h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-400">
                      Rp {currentDayStoreTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {currentDayStoreItems.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                      <p className="text-[11px] text-slate-500">Tidak ada pengeluaran Main Store untuk hari ini.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[9px]">
                            <th className="py-2 px-3">Item</th>
                            <th className="py-2 px-3 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Harga</th>
                            <th className="py-2 px-3 text-right font-black">Subtotal</th>
                            <th className="py-2 px-3 text-center w-12">Hapus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                          {currentDayStoreItems.map((it: LedgerItem, idx: number) => {
                            const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
                            return (
                              <tr key={it.id || idx} className="hover:bg-blue-500/5">
                                <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[120px]">{it.name}</td>
                                <td className="py-2 px-3 text-center text-slate-300">{it.qty}</td>
                                <td className="py-2 px-3 text-right text-slate-400">Rp {(Number(it.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-3 text-right font-black text-blue-400">Rp {sub.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem('MAIN_STORE', it.id, it.name)}
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

                  {/* Deduction Breakdown Banner */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-cyan-500/20 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                      <span>Total Belanja Main Store (Gross)</span>
                      <span className="font-mono text-white">Rp {currentDayStoreTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-cyan-400 font-bold uppercase">
                      <span className="flex items-center gap-1">
                        <i className="fas fa-minus-circle text-[9px]"></i> Potongan (Chemical + ATK + Marketing)
                      </span>
                      <span className="font-mono">- Rp {currentDayDeductions.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </div>

                    {/* Breakdown per category if deductions exist */}
                    {currentDayDeductions.total > 0 && (
                      <div className="pt-1.5 border-t border-white/5 space-y-1">
                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          {currentDayDeductions.chemical > 0 && (
                            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex flex-col">
                              <span className="text-[9px] text-cyan-400 font-bold">🧪 Chemical</span>
                              <span className="font-mono text-slate-300 font-bold">-Rp {currentDayDeductions.chemical.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {currentDayDeductions.stationary > 0 && (
                            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col">
                              <span className="text-[9px] text-amber-400 font-bold">📝 Stationary</span>
                              <span className="font-mono text-slate-300 font-bold">-Rp {currentDayDeductions.stationary.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {currentDayDeductions.marketing > 0 && (
                            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 flex flex-col">
                              <span className="text-[9px] text-purple-400 font-bold">📢 Marketing</span>
                              <span className="font-mono text-slate-300 font-bold">-Rp {currentDayDeductions.marketing.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 italic pt-0.5">
                          * Otomatis memotong kolom Belanja Main Store di Receiving Sheet pada tanggal yang sama.
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-white/10 flex justify-between items-center text-xs font-black uppercase">
                      <span className="text-emerald-400">Net Main Store (Masuk Receiving Sheet)</span>
                      <span className="font-mono text-emerald-400 text-sm">Rp {currentDayStoreNet.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Main Kitchen Table */}
                <div className="glass-card p-5 bg-slate-900/90 border border-amber-500/20 rounded-3xl shadow-xl space-y-3">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Main Kitchen ({inputDate})</h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      Rp {currentDayKitchenTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {currentDayKitchenItems.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                      <p className="text-[11px] text-slate-500">Tidak ada pengeluaran Main Kitchen untuk hari ini.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[9px]">
                            <th className="py-2 px-3">Item</th>
                            <th className="py-2 px-3 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Harga</th>
                            <th className="py-2 px-3 text-right font-black">Subtotal</th>
                            <th className="py-2 px-3 text-center w-12">Hapus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                          {currentDayKitchenItems.map((it: LedgerItem, idx: number) => {
                            const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
                            return (
                              <tr key={it.id || idx} className="hover:bg-amber-500/5">
                                <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[120px]">{it.name}</td>
                                <td className="py-2 px-3 text-center text-slate-300">{it.qty}</td>
                                <td className="py-2 px-3 text-right text-slate-400">Rp {(Number(it.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-3 text-right font-black text-amber-400">Rp {sub.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem('MAIN_KITCHEN', it.id, it.name)}
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

              {/* FULL DATE RECAP TABLE (TANGGAL 1 - 31) */}
              <BelanjaFullTanggalRecapTable
                title="Tabel Rekap Harian Main Store & Main Kitchen"
                subtitle={`Rekapan penyerapan harian Main Store dan Main Kitchen internal tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
                icon="fa-warehouse"
                themeColor="indigo"
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

          {moduleTab === 'REKAP_HARIAN' && (
            <div className="space-y-6 animate-fade-in">
              <BelanjaFullTanggalRecapTable
                title="Tabel Rekap Harian Main Store & Main Kitchen"
                subtitle={`Rekapan penyerapan harian Main Store dan Main Kitchen internal tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
                icon="fa-warehouse"
                themeColor="indigo"
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

          {moduleTab === 'MATRIX' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE KPI SUMMARY CARDS (RATIO VS MTD REV & VARIANCE) */}
              <ModuleExecutiveKpis
                themeColor="indigo"
                totalSpend={totalCombinedSpend}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="unit"
                benchmarkRatioThresholds={{ warning: 25.0, danger: 35.0 }}
              />

      {/* SOURCE FILTER TABS */}
      <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-white/10 w-fit">
        <button
          onClick={() => setSourceFilter('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            sourceFilter === 'ALL'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Semua Divisi ({allMatrixItems.length})
        </button>
        <button
          onClick={() => setSourceFilter('MAIN_STORE')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            sourceFilter === 'MAIN_STORE'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Main Store Only ({allMatrixItems.filter(it => it.sourceKey === 'MAIN_STORE').length})
        </button>
        <button
          onClick={() => setSourceFilter('MAIN_KITCHEN')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            sourceFilter === 'MAIN_KITCHEN'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Main Kitchen Only ({allMatrixItems.filter(it => it.sourceKey === 'MAIN_KITCHEN').length})
        </button>
      </div>

      {/* TREND CHART & TOP ITEMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-chart-bar text-indigo-400"></i> Tren Requisition Harian (Store & Kitchen)
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
                  formatter={(val: any, name: any) => [
                    `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, 
                    name === 'store' ? 'Main Store' : 'Main Kitchen'
                  ]}
                  labelFormatter={(label) => `Tanggal ${label} ${monthName} ${selectedYear}`}
                />
                <Bar dataKey="store" name="store" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="kitchen" name="kitchen" fill="#a855f7" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <i className="fas fa-crown text-indigo-400"></i> Top 5 Item Requisition Terbesar
            </h3>

            <div className="space-y-3">
              {top5Items.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">Belum ada data requisition</p>
              ) : (
                top5Items.map((item, idx) => {
                  const share = totalCombinedSpend > 0 ? (item.totalSpend / totalCombinedSpend) * 100 : 0;
                  return (
                    <div key={item.key} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 font-black flex items-center justify-center text-[10px] flex-none">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate max-w-[150px]">{item.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border flex-none font-bold ${
                            item.sourceKey === 'MAIN_STORE' 
                              ? 'bg-blue-950/60 text-blue-300 border-blue-500/30' 
                              : 'bg-purple-950/60 text-purple-300 border-purple-500/30'
                          }`}>
                            {item.sourceLabel}
                          </span>
                        </div>
                        <span className="font-mono font-black text-indigo-400 text-xs">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${Math.min(100, share * 2.5)}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 text-[10px] text-slate-400 flex justify-between">
            <span>Total Top 5:</span>
            <span className="font-bold text-white font-mono">
              Rp {top5Items.reduce((a, b) => a + b.totalSpend, 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* MATRIX DETAIL ITEM MAIN STORE & KITCHEN */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2.5">
              <i className="fas fa-table text-indigo-400"></i> Matrix Detail Item Main Store & Main Kitchen
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rincian item bahan baku, pergerakan kuantitas internal, harga satuan, dan distribusi outlet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                placeholder="Cari item, PIC..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={matrixSortBy}
              onChange={(e) => setMatrixSortBy(e.target.value as any)}
              className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="spend_desc">Nominal Tertinggi</option>
              <option value="spend_asc">Nominal Terendah</option>
              <option value="qty_desc">Qty Terbanyak</option>
              <option value="name_asc">Nama (A-Z)</option>
            </select>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setMatrixViewMode('ITEM_LIST')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'ITEM_LIST' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-list mr-1"></i> List
              </button>
              <button
                onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'OUTLET_PIVOT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-th mr-1"></i> Pivot Outlet
              </button>
            </div>
          </div>
        </div>

        {/* LIST VIEW */}
        {matrixViewMode === 'ITEM_LIST' ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Nama Item</th>
                  <th className="py-3 px-4">Divisi Sumber</th>
                  <th className="py-3 px-4 text-center">Total Qty</th>
                  <th className="py-3 px-4 text-right">Rata-rata Harga</th>
                  <th className="py-3 px-4 text-right">Min - Max Harga</th>
                  <th className="py-3 px-4 text-right font-black text-indigo-400">Total Belanja (Rp)</th>
                  <th className="py-3 px-4 text-center">% Kontribusi</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredMatrixItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                      <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                      Tidak ada data item Main Store / Main Kitchen yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixItems.map((item, index) => {
                    const share = totalCombinedSpend > 0 ? (item.totalSpend / totalCombinedSpend) * 100 : 0;
                    return (
                      <tr key={item.key} className="hover:bg-indigo-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold">{index + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="hover:text-indigo-400 transition-colors text-left font-bold"
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${
                            item.sourceKey === 'MAIN_STORE' 
                              ? 'bg-blue-950/60 text-blue-300 border-blue-500/30' 
                              : 'bg-purple-950/60 text-purple-300 border-purple-500/30'
                          }`}>
                            {item.sourceLabel}
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
                        <td className="py-3 px-4 text-right font-black text-indigo-400 bg-indigo-500/5">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                          {share.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-black uppercase"
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
                      <th className="py-3 px-4">Divisi</th>
                      {pivotOutlets.map(o => (
                        <th key={o} className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">{o}</th>
                      ))}
                      <th className="py-3 px-4 text-center bg-indigo-950/40 text-indigo-300">Total Qty</th>
                      <th className="py-3 px-4 text-right bg-indigo-950/60 text-indigo-300 font-black">Total Belanja (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredMatrixItems.map((item, idx) => (
                      <tr key={item.key} className="hover:bg-indigo-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">{idx + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                          <button onClick={() => setSelectedItemForDetail(item)} className="hover:text-indigo-400">
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/10 whitespace-nowrap">
                            {item.sourceLabel}
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
                                  <span className="block text-[9px] text-slate-500">({qty} unit)</span>
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-center font-bold text-slate-300 bg-indigo-950/20">
                          {item.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-indigo-400 bg-indigo-950/30">
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
        <ModuleDateMatrixSidebar
          themeColor="indigo"
          moduleTitle="Store & Kitchen"
          iconClass="fa-warehouse"
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
          currentSpend={totalCombinedSpend}
          lastMonthSpend={lastMonthSpend}
          currentMtdRevenue={currentMtdRevenue}
          lastMonthMtdRevenue={lastMonthMtdRevenue}
          monthlyOverviewStats={monthlyOverviewStats}
          categoryVariances={categoryVariances}
          itemVariances={itemVariances}
          itemUnit="unit"
        />
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
              <div className="p-6 border-b border-white/10 bg-slate-950/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">
                    <i className="fas fa-warehouse"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {selectedItemForDetail.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Divisi: <span className="text-indigo-400 font-bold">{selectedItemForDetail.sourceLabel}</span> • Total {selectedItemForDetail.txCount} Transaksi
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

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Belanja</span>
                    <span className="text-base font-black font-mono text-indigo-400">
                      Rp {selectedItemForDetail.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Qty</span>
                    <span className="text-base font-black font-mono text-blue-400">
                      {selectedItemForDetail.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} unit
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
                          <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{tx.qty}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">Rp {tx.price.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-black text-indigo-400">Rp {tx.subtotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px]">{tx.pic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-slate-950/50 flex justify-end">
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider transition-all"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MainStoreKitchenModule;
