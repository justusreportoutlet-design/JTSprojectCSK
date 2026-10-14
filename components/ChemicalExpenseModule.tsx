import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet, ChemicalSubCategory } from '../types';
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

import { toLocalDateStr } from '../lib/dateUtils';

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
  onUpdate?: (updater: (prev: AppState) => AppState) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export interface MatrixChemicalItem {
  key: string;
  name: string;
  category: ChemicalSubCategory;
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
    category: ChemicalSubCategory;
    qty: number;
    price: number;
    subtotal: number;
    pic: string;
    reason: string;
  }[];
}

const POPULAR_SUGGESTIONS: Record<ChemicalSubCategory, string[]> = {
  CHEMICAL: [
    'Sunlight 5L',
    'Floor Cleaner Lavender 5L',
    'Porstex / Karbol 5L',
    'Dishwashing Liquid 20L',
    'Sanitizer Spray 5L',
    'Clorin Tablet',
    'Handsoap Strawberry 5L',
    'Degreaser Grill & Hood 5L'
  ],
  STATIONARY: [
    'Kertas Kasir Thermal 80x80 (Dus)',
    'Kertas Kasir Thermal 57x50',
    'Pulpen Gel Hitam (Pack)',
    'Lakban Bening 2 Inch (Slop)',
    'Buku Nota Kontan 2 Ply',
    'Stapler & Isi Staples No. 10',
    'Spidol Whiteboard & Marker',
    'Kertas HVS A4 (Rim)'
  ],
  MARKETING: [
    'Tent Card Acrylic Promo Meja',
    'Brosur Menu Takeaway & Delivery',
    'Banner Spanduk Event / Seasonal Promo',
    'Voucher Voucher Promo Diskon',
    'Sticker Logo Packaging (Roll)',
    'Flyer Promo Membership',
    'Poster Acrylic A3 Frame'
  ]
};

export const ChemicalExpenseModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
  isRegionalView = false,
  filters,
  onUpdate,
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
  const [moduleTab, setModuleTab] = useState<'INPUT' | 'MATRIX'>('INPUT');
  const [inputDate, setInputDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [inputCategory, setInputCategory] = useState<ChemicalSubCategory>('CHEMICAL');
  const [inputName, setInputName] = useState<string>('');
  const [inputQty, setInputQty] = useState<string>('1');
  const [inputPrice, setInputPrice] = useState<string>('');
  const [inputPic, setInputPic] = useState<string>('Steward');
  const [inputReason, setInputReason] = useState<string>('');

  const [tableCategoryFilter, setTableCategoryFilter] = useState<'ALL' | ChemicalSubCategory>('ALL');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<'ALL' | ChemicalSubCategory>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'spend_desc' | 'spend_asc' | 'qty_desc' | 'name_asc'>('spend_desc');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MatrixChemicalItem | null>(null);

  // Daily items for current inputDate
  const currentDayItems: LedgerItem[] = useMemo(() => {
    return (data.dailyChemicalLedger && data.dailyChemicalLedger[inputDate]) || [];
  }, [data.dailyChemicalLedger, inputDate]);

  // Current day breakdowns
  const currentDayBreakdown = useMemo(() => {
    let chem = 0;
    let stat = 0;
    let mkt = 0;
    currentDayItems.forEach((it: any) => {
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
      totalDeductions: chem + stat + mkt
    };
  }, [currentDayItems]);

  // Main store raw total for inputDate to show exact net result
  const currentDayMainStoreGross = useMemo(() => {
    const msLedger = (data.dailyMainStoreLedger && data.dailyMainStoreLedger[inputDate]) || [];
    return msLedger.reduce((sum: number, it: any) => sum + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  }, [data.dailyMainStoreLedger, inputDate]);

  const currentDayMainStoreNet = Math.max(0, currentDayMainStoreGross - currentDayBreakdown.totalDeductions);

  // Monthly Overview for Mini Sidebar
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
      if (!st.dailyChemicalLedger) return;
      Object.entries(st.dailyChemicalLedger).forEach(([dStr, items]) => {
        if (!dStr.startsWith(String(selectedYear))) return;
        const mIdx = parseInt(dStr.split('-')[1], 10) - 1;
        if (mIdx >= 0 && mIdx < 12 && Array.isArray(items)) {
          items.forEach((it: any, idx: number) => {
            const uKey = `${dStr}_${it.id || (it.name + '_' + idx + '_' + it.price)}`;
            if (processedTx.has(uKey)) return;
            processedTx.add(uKey);
            const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
            stats[mIdx].totalSpend += sub;
            stats[mIdx].txCount += 1;
          });
        }
      });
    });

    return stats;
  }, [data, allMonthlyData, activeOutlet, isRegionalView, selectedYear, selectedMonth]);

  const handleAddChemicalItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      showToast?.('Nama item wajib diisi!', 'error');
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

    const prefix = inputCategory.toLowerCase().slice(0, 4);
    const newItem: LedgerItem = {
      id: `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: inputName.trim(),
      category: inputCategory,
      qty: qtyNum,
      price: priceNum,
      pic: inputPic.trim() || (inputCategory === 'CHEMICAL' ? 'Steward' : inputCategory === 'STATIONARY' ? 'Admin / Kasir' : 'Marketing / Floor'),
      reason: inputReason.trim() || '-'
    };

    onUpdate((prev: AppState) => {
      const prevLedger = (prev.dailyChemicalLedger && prev.dailyChemicalLedger[inputDate]) || [];
      const updatedLedger = [...prevLedger, newItem];

      // Calculate totals per category for that date
      let chemSum = 0;
      let statSum = 0;
      let mktSum = 0;
      updatedLedger.forEach((it: any) => {
        const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
        const cat = (it.category || 'CHEMICAL').toUpperCase();
        if (cat === 'STATIONARY') statSum += sub;
        else if (cat === 'MARKETING') mktSum += sub;
        else chemSum += sub;
      });
      const allDeductions = chemSum + statSum + mktSum;

      // Calculate gross Main Store for that date
      const storeLedger = (prev.dailyMainStoreLedger && prev.dailyMainStoreLedger[inputDate]) || [];
      const grossMainStore = storeLedger.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.price) || 0)), 0);
      const netMainStore = Math.max(0, grossMainStore - allDeductions);

      const prevExpenses = (prev.expenses && prev.expenses[inputDate]) || {};

      return {
        ...prev,
        dailyChemicalLedger: {
          ...prev.dailyChemicalLedger,
          [inputDate]: updatedLedger
        },
        expenses: {
          ...prev.expenses,
          [inputDate]: {
            ...prevExpenses,
            chemical: chemSum,
            stationary: statSum,
            marketing: mktSum,
            mainStore: netMainStore
          }
        }
      };
    });

    setInputName('');
    setInputQty('1');
    setInputPrice('');
    setInputReason('');
    showToast?.(`Item "${newItem.name}" (${inputCategory}) berhasil ditambahkan! Belanja Main Store di Receiving Sheet otomatis terpotong.`, 'success');
  };

  const handleDeleteChemicalItem = (itemId: string) => {
    if (!onUpdate) return;
    onUpdate((prev: AppState) => {
      const prevLedger = (prev.dailyChemicalLedger && prev.dailyChemicalLedger[inputDate]) || [];
      const updatedLedger = prevLedger.filter((it: any) => it.id !== itemId);

      let chemSum = 0;
      let statSum = 0;
      let mktSum = 0;
      updatedLedger.forEach((it: any) => {
        const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
        const cat = (it.category || 'CHEMICAL').toUpperCase();
        if (cat === 'STATIONARY') statSum += sub;
        else if (cat === 'MARKETING') mktSum += sub;
        else chemSum += sub;
      });
      const allDeductions = chemSum + statSum + mktSum;

      const storeLedger = (prev.dailyMainStoreLedger && prev.dailyMainStoreLedger[inputDate]) || [];
      const grossMainStore = storeLedger.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.price) || 0)), 0);
      const netMainStore = Math.max(0, grossMainStore - allDeductions);

      const prevExpenses = (prev.expenses && prev.expenses[inputDate]) || {};

      return {
        ...prev,
        dailyChemicalLedger: {
          ...prev.dailyChemicalLedger,
          [inputDate]: updatedLedger
        },
        expenses: {
          ...prev.expenses,
          [inputDate]: {
            ...prevExpenses,
            chemical: chemSum,
            stationary: statSum,
            marketing: mktSum,
            mainStore: netMainStore
          }
        }
      };
    }, undefined, true);
    showToast?.('Item berhasil dihapus & total Main Store di Receiving Sheet diperbarui.', 'info');
  };

  React.useEffect(() => {
    if (!isRegionalView && propSelectedOutlet) {
      setActiveOutlet(propSelectedOutlet);
    } else if (isRegionalView) {
      setActiveOutlet(propSelectedOutlet || 'ALL');
    }
  }, [propSelectedOutlet, isRegionalView]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];
  const reportId = `chemical-expense-${activeOutlet}-${monthPrefix}`;

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

  // Clamp filterEndDay if selected month has fewer days
  React.useEffect(() => {
    if (filterEndDay > daysInMonth) {
      setFilterEndDay(daysInMonth);
    }
    if (filterStartDay > daysInMonth) {
      setFilterStartDay(1);
    }
  }, [daysInMonth, filterEndDay, filterStartDay]);

  // Resolve state helper
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
      dailyChemicalLedger: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} }
    };
  };

  const targetOutlets = useMemo(() => {
    return isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  // Process Chemical, Stationary & Marketing Data
  const {
    totalChemicalSpend,
    totalStationarySpend,
    totalMarketingSpend,
    totalCombinedDeductions,
    totalQtyAll,
    allMatrixItems,
    dailySpendChartData,
    top5ChemicalItems,
    dailySpendMap,
    dailyTxMap,
    dailyItemsMap
  } = useMemo(() => {
    const itemsMap = new Map<string, MatrixChemicalItem>();
    const dailySpendMap: Record<string, number> = {};
    const dailyTxMap: Record<string, number> = {};
    const dailyItemsMap: Record<string, any[]> = {};
    let chemSum = 0;
    let statSum = 0;
    let mktSum = 0;

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

      const ledgerRecord = st.dailyChemicalLedger || {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateStr = `${monthPrefix}-${dayStr}`;
        const itemsList = ledgerRecord[dateStr] || [];
        const isInFilterRange = d >= filterStartDay && d <= filterEndDay;

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          itemsList.forEach((it: any) => {
            const cleanName = (it.name || 'Item Operasional').trim();
            if (!cleanName) return;

            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const subtotal = qty * price;
            const cat: ChemicalSubCategory = (it.category || 'CHEMICAL').toUpperCase() as ChemicalSubCategory;

            dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + subtotal;
            dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;

            dailyItemsMap[dateStr].push({
              name: cleanName,
              qty,
              unit: it.unit || 'unit',
              price,
              amount: subtotal,
              category: cat === 'STATIONARY' ? 'Stationary' : cat === 'MARKETING' ? 'Marketing' : 'Chemical'
            });

            if (isInFilterRange) {
              if (cat === 'STATIONARY') statSum += subtotal;
              else if (cat === 'MARKETING') mktSum += subtotal;
              else chemSum += subtotal;

              const mapKey = `${cat}:::${cleanName.toLowerCase()}`;
              if (!itemsMap.has(mapKey)) {
                itemsMap.set(mapKey, {
                  key: mapKey,
                  name: cleanName,
                  category: cat,
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
                    category: cat,
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
                  category: cat,
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
          const fallbackChem = Number(exp.chemical) || 0;
          const fallbackAtk = Number(exp.atk) || 0;
          const totalFb = fallbackChem + fallbackAtk;
          if (totalFb > 0) {
            dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + totalFb;
            dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
            if (isInFilterRange) {
              chemSum += fallbackChem;
              statSum += fallbackAtk;
            }
          }
        }
      }
    });

    const itemsList = Array.from(itemsMap.values());
    const totalQty = itemsList.reduce((acc, it) => acc + it.totalQty, 0);

    const chartData = Object.entries(dailySpendMap).map(([dateStr, spend]) => ({
      day: dateStr.split('-')[2],
      date: dateStr,
      spend
    }));

    const top5 = [...itemsList].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

    return {
      totalChemicalSpend: chemSum,
      totalStationarySpend: statSum,
      totalMarketingSpend: mktSum,
      totalCombinedDeductions: chemSum + statSum + mktSum,
      totalQtyAll: totalQty,
      allMatrixItems: itemsList,
      dailySpendChartData: chartData,
      top5ChemicalItems: top5,
      dailySpendMap,
      dailyTxMap,
      dailyItemsMap
    };
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth, filterStartDay, filterEndDay]);

  // Last Month calculations (Filtered by same date range!)
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

  // Last Month Spend & Quantities (Filtered by same date range)
  const { 
    lastMonthSpend, 
    lastMonthChemicalSpend, 
    lastMonthStationarySpend, 
    lastMonthMarketingSpend, 
    lastMonthItemsMap 
  } = useMemo(() => {
    let total = 0;
    let chemTotal = 0;
    let statTotal = 0;
    let mktTotal = 0;
    const itemSpendMap: Record<string, { spend: number; qty: number }> = {};
    const maxDayForLm = Math.min(filterEndDay, daysInLastMonth);

    targetOutlets.forEach(o => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      if (!st) return;

      const ledger = st.dailyChemicalLedger || {};
      for (let d = filterStartDay; d <= maxDayForLm; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dStr = `${lastMonthPrefix}-${dayStr}`;
        const items = ledger[dStr] || [];
        if (Array.isArray(items) && items.length > 0) {
          items.forEach((it: any) => {
            const qty = Number(it.qty) || 1;
            const amt = qty * (Number(it.price) || 0);
            total += amt;
            const cat = (it.category || 'CHEMICAL').toUpperCase();
            if (cat === 'STATIONARY') statTotal += amt;
            else if (cat === 'MARKETING') mktTotal += amt;
            else chemTotal += amt;

            const cleanName = `${cat}:::${(it.name || 'Item').trim().toLowerCase()}`;
            if (!itemSpendMap[cleanName]) {
              itemSpendMap[cleanName] = { spend: amt, qty };
            } else {
              itemSpendMap[cleanName].spend += amt;
              itemSpendMap[cleanName].qty += qty;
            }
          });
        } else if (st.expenses && st.expenses[dStr]) {
          const exp = st.expenses[dStr] as any;
          const chemVal = Number(exp.chemical) || 0;
          const atkVal = Number(exp.atk) || 0;
          const fallbackVal = chemVal + atkVal;
          if (fallbackVal > 0) {
            total += fallbackVal;
            chemTotal += chemVal;
            statTotal += atkVal;
          }
        }
      }
    });

    return { 
      lastMonthSpend: total, 
      lastMonthChemicalSpend: chemTotal,
      lastMonthStationarySpend: statTotal,
      lastMonthMarketingSpend: mktTotal,
      lastMonthItemsMap: itemSpendMap 
    };
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, daysInLastMonth, filterStartDay, filterEndDay, allMonthlyData]);

  // Daily matrix for sidebar
  const dailyMatrix = useMemo(() => {
    return buildDailyMatrix(selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap);
  }, [selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap]);

  // Category variances for sidebar
  const categoryVariances = useMemo(() => {
    return [
      {
        key: 'cat-chemical',
        label: '🧪 Chemical (Cleaning)',
        currentSpend: totalChemicalSpend,
        lastMonthSpend: 0,
        currentQty: allMatrixItems.filter(i => i.category === 'CHEMICAL').reduce((s, i) => s + i.totalQty, 0),
        lastMonthQty: 0,
        qtyUnit: 'unit'
      },
      {
        key: 'cat-stationary',
        label: '📝 Stationary (ATK / Kasir)',
        currentSpend: totalStationarySpend,
        lastMonthSpend: 0,
        currentQty: allMatrixItems.filter(i => i.category === 'STATIONARY').reduce((s, i) => s + i.totalQty, 0),
        lastMonthQty: 0,
        qtyUnit: 'unit'
      },
      {
        key: 'cat-marketing',
        label: '📢 Marketing (Promo & Tentcard)',
        currentSpend: totalMarketingSpend,
        lastMonthSpend: 0,
        currentQty: allMatrixItems.filter(i => i.category === 'MARKETING').reduce((s, i) => s + i.totalQty, 0),
        lastMonthQty: 0,
        qtyUnit: 'unit'
      }
    ];
  }, [totalChemicalSpend, totalStationarySpend, totalMarketingSpend, allMatrixItems]);

  // Item Variances for Top Items
  const itemVariances = useMemo(() => {
    return allMatrixItems.map(it => {
      const lm = lastMonthItemsMap[it.key];
      return {
        key: it.key,
        label: it.name,
        currentSpend: it.totalSpend,
        lastMonthSpend: lm ? lm.spend : 0,
        currentQty: it.totalQty,
        lastMonthQty: lm ? lm.qty : 0,
        qtyUnit: 'unit'
      };
    }).sort((a, b) => b.currentSpend - a.currentSpend).slice(0, 20);
  }, [allMatrixItems, lastMonthItemsMap]);

  // Dynamic Suggestion Chips based on active input category
  const dynamicSuggestions = useMemo(() => {
    const recorded = allMatrixItems
      .filter(it => it.category === inputCategory)
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);
    
    const standard = POPULAR_SUGGESTIONS[inputCategory] || [];
    return Array.from(new Set([...recorded, ...standard])).slice(0, 10);
  }, [allMatrixItems, inputCategory]);

  // Filtered Today Items based on tableCategoryFilter
  const filteredCurrentDayItems = useMemo(() => {
    if (tableCategoryFilter === 'ALL') return currentDayItems;
    return currentDayItems.filter((it: any) => (it.category || 'CHEMICAL').toUpperCase() === tableCategoryFilter);
  }, [currentDayItems, tableCategoryFilter]);

  // Filter & Sort Matrix Items
  const filteredMatrixItems = useMemo(() => {
    let list = [...allMatrixItems];

    if (matrixCategoryFilter !== 'ALL') {
      list = list.filter(it => it.category === matrixCategoryFilter);
    }

    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) ||
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
  }, [allMatrixItems, matrixCategoryFilter, matrixSearch, matrixSortBy]);

  // Monthly states for full tanggal recap table
  const recapMonthlyStates = useMemo(() => {
    return targetOutlets.map(o => getOutletMonthState(o, selectedMonth, selectedYear)).filter(Boolean);
  }, [targetOutlets, selectedMonth, selectedYear, data, allMonthlyData]);

  // Columns for Chemical, Stationary, Marketing
  const recapColumns: RecapColumnDef[] = useMemo(() => [
    {
      id: 'chemical',
      label: 'Chemical Operasional',
      shortLabel: 'CHEMICAL',
      getValue: (st, dStr) => {
        const list = (st.dailyChemicalLedger?.[dStr] || []) as LedgerItem[];
        return list.filter(it => (it.category || 'CHEMICAL') === 'CHEMICAL')
          .reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    },
    {
      id: 'stationary',
      label: 'Stationary / ATK',
      shortLabel: 'STATIONARY',
      getValue: (st, dStr) => {
        const list = (st.dailyChemicalLedger?.[dStr] || []) as LedgerItem[];
        return list.filter(it => it.category === 'STATIONARY')
          .reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    },
    {
      id: 'marketing',
      label: 'Marketing',
      shortLabel: 'MARKETING',
      getValue: (st, dStr) => {
        const list = (st.dailyChemicalLedger?.[dStr] || []) as LedgerItem[];
        return list.filter(it => it.category === 'MARKETING')
          .reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
      }
    }
  ], []);

  // Detail items callback for day popup in full tanggal table
  const getDetailItemsForDay = (dateStr: string, states: AppState[]): DayDetailItem[] => {
    const list: DayDetailItem[] = [];
    states.forEach(st => {
      const outName = st.outlet || activeOutlet;
      const items = (st.dailyChemicalLedger?.[dateStr] || []) as LedgerItem[];
      items.forEach(it => {
        list.push({
          id: it.id,
          outlet: outName,
          category: it.category || 'Chemical',
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

      const sheet = workbook.addWorksheet('CHEMICAL_STATIONARY_MKT');
      sheet.addRow([`LAPORAN BELANJA CHEMICAL, STATIONARY & MARKETING - ${activeOutlet}`]);
      sheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      sheet.addRow([`Total Pengurang Belanja Main Store: Rp ${totalCombinedDeductions.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([`- Total Chemical: Rp ${totalChemicalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([`- Total Stationary: Rp ${totalStationarySpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([`- Total Marketing: Rp ${totalMarketingSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      sheet.addRow([]);

      const pivotCols = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet];
      sheet.addRow(['No', 'Kategori', 'Nama Item', 'Total Qty', 'Rata-rata Harga (Rp)', 'Min Harga (Rp)', 'Max Harga (Rp)', 'Total Belanja (Rp)', '% Kontribusi', ...pivotCols.map(o => `Spend ${o}`)]);

      filteredMatrixItems.forEach((it, idx) => {
        const share = totalCombinedDeductions > 0 ? (it.totalSpend / totalCombinedDeductions) * 100 : 0;
        sheet.addRow([
          idx + 1,
          it.category,
          it.name,
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
      saveAs(blob, `Chemical_Stationary_Marketing_${activeOutlet}_${monthPrefix}.xlsx`);
      showToast?.('Berhasil mengunduh Laporan Excel Chemical, Stationary & Marketing!', 'success');
    } catch (err) {
      showToast?.('Gagal mengunduh Excel.', 'error');
    }
  };

  // Copy WhatsApp Summary matching strict user template
  const handleCopyWhatsApp = (categoryType?: 'ALL' | ChemicalSubCategory) => {
    const chosenCat = categoryType || matrixCategoryFilter;
    const categories: Array<{ categoryName: string; totalSpend?: number; items: any[] }> = [];

    if (chosenCat === 'ALL' || chosenCat === 'CHEMICAL') {
      const chemItems = allMatrixItems.filter(i => i.category === 'CHEMICAL');
      categories.push({
        categoryName: 'CHEMICAL',
        totalSpend: totalChemicalSpend,
        items: chemItems.map(i => ({
          name: i.name,
          qty: i.totalQty,
          unit: 'unit',
          totalSpend: i.totalSpend,
          avgPrice: i.avgPrice
        }))
      });
    }

    if (chosenCat === 'ALL' || chosenCat === 'STATIONARY') {
      const statItems = allMatrixItems.filter(i => i.category === 'STATIONARY');
      categories.push({
        categoryName: 'STATIONARY',
        totalSpend: totalStationarySpend,
        items: statItems.map(i => ({
          name: i.name,
          qty: i.totalQty,
          unit: 'unit',
          totalSpend: i.totalSpend,
          avgPrice: i.avgPrice
        }))
      });
    }

    if (chosenCat === 'ALL' || chosenCat === 'MARKETING') {
      const mktItems = allMatrixItems.filter(i => i.category === 'MARKETING');
      categories.push({
        categoryName: 'MARKETING',
        totalSpend: totalMarketingSpend,
        items: mktItems.map(i => ({
          name: i.name,
          qty: i.totalQty,
          unit: 'unit',
          totalSpend: i.totalSpend,
          avgPrice: i.avgPrice
        }))
      });
    }

    const spendToCompare = chosenCat === 'CHEMICAL' 
      ? totalChemicalSpend 
      : chosenCat === 'STATIONARY' 
      ? totalStationarySpend 
      : chosenCat === 'MARKETING' 
      ? totalMarketingSpend 
      : totalCombinedDeductions;

    const lmSpendToCompare = chosenCat === 'CHEMICAL'
      ? lastMonthChemicalSpend
      : chosenCat === 'STATIONARY'
      ? lastMonthStationarySpend
      : chosenCat === 'MARKETING'
      ? lastMonthMarketingSpend
      : lastMonthSpend;

    const titleStr = chosenCat === 'CHEMICAL'
      ? 'REKAP CHEMICAL'
      : chosenCat === 'STATIONARY'
      ? 'REKAP STATIONARY'
      : chosenCat === 'MARKETING'
      ? 'REKAP MARKETING'
      : 'REKAP CHEMICAL, STATIONARY & MARKETING';

    const text = generateWhatsAppExpenseText({
      title: titleStr,
      templateType: 'DETAILED_ITEMS',
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
    showToast?.(`Rekap WA Tgl ${filterStartDay} - ${filterEndDay} ${monthName} (${chosenCat}) disalin!`, 'success');
  };

  const getCategoryBadge = (cat: string) => {
    const c = (cat || 'CHEMICAL').toUpperCase();
    if (c === 'STATIONARY') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase inline-flex items-center gap-1">
          <i className="fas fa-pencil-alt text-[8px]"></i> Stationary
        </span>
      );
    }
    if (c === 'MARKETING') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-black uppercase inline-flex items-center gap-1">
          <i className="fas fa-bullhorn text-[8px]"></i> Marketing
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-black uppercase inline-flex items-center gap-1">
        <i className="fas fa-flask text-[8px]"></i> Chemical
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-200">
      {/* HEADER BAR */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-teal-900/40">
              <i className="fas fa-flask text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                Chemical, Stationary & Marketing
              </h2>
              <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest mt-0.5">
                Pengeluaran Operasional yang Otomatis Memotong Total Belanja Main Store
              </p>
            </div>
          </div>
        </div>

        {/* Actions & Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shadow-sm">
              <i className="fas fa-store text-cyan-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500 cursor-pointer"
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
            <i className="fab fa-whatsapp"></i> WA Rekap
          </button>
          <ShareActions 
            targetId={reportId} 
            title={`Chemical Stationary Marketing - ${activeOutlet} (${monthName} ${selectedYear})`}
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
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
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
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
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
        title="Filter Tanggal Rekap Belanja"
        accentColor="cyan"
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
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-edit"></i> Input Chemical, Stationary & Marketing
            </button>
            <button
              onClick={() => setModuleTab('MATRIX')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'MATRIX'
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table"></i> Matrix Rekap & Analisis
            </button>
          </div>

          {moduleTab === 'INPUT' && (
            <div className="space-y-6 animate-fade-in">
              {/* DATE SELECTOR & TODAY'S TOTAL CARD */}
              <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10">
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
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Transaksi:</span>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Pengurang Main Store ({inputDate}):</span>
                    <span className="text-lg font-black font-mono text-cyan-400">
                      Rp {currentDayBreakdown.totalDeductions.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* AUTOMATION EXPLANATION BANNER */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900/90 to-indigo-950/50 border border-cyan-500/30 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-none">
                    <i className="fas fa-bolt text-base"></i>
                  </div>
                  <div>
                    <span className="font-black text-white block uppercase tracking-wide">
                      Otomatisasi Potongan Belanja Main Store
                    </span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Total belanja <b>Chemical</b>, <b>Stationary</b>, dan <b>Marketing</b> setiap tanggalnya otomatis memotong total belanja Main Store pada tanggal yang sama.
                    </p>
                  </div>
                </div>
                <div className="text-right flex-none hidden md:block">
                  <span className="text-[10px] text-slate-400 block font-mono">
                    Gross MS: Rp {currentDayMainStoreGross.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} - Potongan: Rp {currentDayBreakdown.totalDeductions.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    = Net MS: Rp {currentDayMainStoreNet.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* INPUT FORM */}
              <form onSubmit={handleAddChemicalItem} className="glass-card p-6 bg-slate-900/90 border border-cyan-500/30 rounded-3xl space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                    <i className="fas fa-plus-circle"></i> Tambah Item ({inputCategory})
                  </h3>

                  {/* CATEGORY SWITCHER BUTTONS */}
                  <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setInputCategory('CHEMICAL');
                        setInputPic('Steward');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        inputCategory === 'CHEMICAL'
                          ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="fas fa-flask"></i> Chemical
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputCategory('STATIONARY');
                        setInputPic('Admin / Kasir');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        inputCategory === 'STATIONARY'
                          ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="fas fa-pencil-alt"></i> Stationary
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputCategory('MARKETING');
                        setInputPic('Marketing / Floor');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        inputCategory === 'MARKETING'
                          ? 'bg-purple-500 text-white shadow-md font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="fas fa-bullhorn"></i> Marketing
                    </button>
                  </div>
                </div>

                {/* Quick Suggestion Chips */}
                {dynamicSuggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                      Item Populer {inputCategory} (Klik untuk mengisi):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {dynamicSuggestions.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setInputName(chip)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 text-[10px] font-bold transition-all cursor-pointer"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                      Nama Item {inputCategory} *
                    </label>
                    <input
                      type="text"
                      placeholder={
                        inputCategory === 'CHEMICAL' 
                          ? 'Contoh: Sunlight 5L / Floor Cleaner' 
                          : inputCategory === 'STATIONARY' 
                          ? 'Contoh: Kertas Kasir Thermal 80x80' 
                          : 'Contoh: Tent Card Acrylic Promo Meja'
                      }
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:ring-2 ring-cyan-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Qty (Jumlah) *</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="1"
                      value={inputQty}
                      onChange={(e) => setInputQty(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:ring-2 ring-cyan-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Harga Satuan (Rp) *</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={inputPrice}
                      onChange={(e) => setInputPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:ring-2 ring-cyan-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">PIC / Bagian</label>
                    <input
                      type="text"
                      placeholder="Steward / Kasir / Marketing"
                      value={inputPic}
                      onChange={(e) => setInputPic(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:ring-2 ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Keterangan / Keperluan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Pembelian operasional mingguan..."
                    value={inputReason}
                    onChange={(e) => setInputReason(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:ring-2 ring-cyan-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 cursor-pointer"
                  >
                    <i className="fas fa-plus"></i> Tambah Item {inputCategory}
                  </button>
                </div>
              </form>

              <FeatureSubmitSyncButton
                featureName="Chemical & Floor Supplies"
                subtext={`Klik setelah selesai input pengeluaran chemical tanggal ${inputDate} agar data langsung diterima oleh perangkat lain.`}
                className="mt-4"
              />

              {/* TABLE OF TODAY'S ITEMS */}
              <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <i className="fas fa-list text-cyan-400"></i>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Rincian Belanja ({inputDate})
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold flex items-center gap-1">
                      <i className="fas fa-cut text-[9px]"></i>
                      Otomatis Memotong Belanja Main Store di Receiving Sheet (Patty Cash / Kas Kecil Terpisah & Tidak Memotong)
                    </span>
                  </div>

                  {/* FILTER CHIPS FOR TABLE */}
                  <div className="flex items-center gap-1.5">
                    {(['ALL', 'CHEMICAL', 'STATIONARY', 'MARKETING'] as const).map(catKey => (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setTableCategoryFilter(catKey)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                          tableCategoryFilter === catKey
                            ? 'bg-cyan-500 text-slate-950 font-black shadow'
                            : 'bg-slate-950/80 text-slate-400 hover:text-white border border-white/5'
                        }`}
                      >
                        {catKey === 'ALL' ? 'Semua' : catKey}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredCurrentDayItems.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-xs font-bold">
                    <i className="fas fa-box-open text-3xl mb-3 block opacity-30 text-cyan-400"></i>
                    Belum ada transaksi {tableCategoryFilter !== 'ALL' ? tableCategoryFilter : ''} yang diinput pada tanggal {inputDate}.
                  </div>
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-950/60 border-b border-white/10">
                          <th className="p-3">Kategori</th>
                          <th className="p-3">Nama Item</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3 text-right">Harga Satuan</th>
                          <th className="p-3 text-right text-cyan-400">Subtotal</th>
                          <th className="p-3">PIC</th>
                          <th className="p-3">Catatan</th>
                          <th className="p-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-xs font-mono">
                        {filteredCurrentDayItems.map((item: any, idx: number) => {
                          const sub = (Number(item.qty) || 0) * (Number(item.price) || 0);
                          return (
                            <tr key={item.id || idx} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 font-sans">{getCategoryBadge(item.category)}</td>
                              <td className="p-3 font-bold text-white font-sans">{item.name}</td>
                              <td className="p-3 text-center text-slate-300">{item.qty}</td>
                              <td className="p-3 text-right text-slate-300">Rp {(Number(item.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right text-cyan-300 font-bold">Rp {sub.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="p-3 text-slate-400 font-sans text-[11px]">{item.pic || '-'}</td>
                              <td className="p-3 text-slate-400 font-sans text-[11px]">{item.reason || '-'}</td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteChemicalItem(item.id)}
                                  className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-all mx-auto cursor-pointer"
                                  title="Hapus item"
                                >
                                  <i className="fas fa-trash-alt text-xs"></i>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-950/80 text-xs font-black uppercase border-t border-white/10">
                          <td colSpan={4} className="p-3 text-white">
                            TOTAL PENGURANG MAIN STORE ({inputDate})
                          </td>
                          <td className="p-3 text-right font-mono text-cyan-400 text-sm">
                            Rp {currentDayBreakdown.totalDeductions.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td colSpan={3} className="p-3 text-[10px] text-slate-400 font-mono">
                            (Chem: Rp {currentDayBreakdown.chemical.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | Stat: Rp {currentDayBreakdown.stationary.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | Mkt: Rp {currentDayBreakdown.marketing.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {moduleTab === 'MATRIX' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE KPI SUMMARY CARDS */}
              <ModuleExecutiveKpis
                themeColor="cyan"
                spendLabel="Total Belanja (Pengurang Main Store)"
                totalSpend={totalCombinedDeductions}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="unit"
                benchmarkRatioThresholds={{ warning: 1.5, danger: 2.5 }}
              />

              {/* 3 CATEGORY BREAKDOWN CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest block">🧪 Belanja Chemical</span>
                    <span className="text-lg font-black font-mono text-white mt-1 block">
                      Rp {totalChemicalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {allMatrixItems.filter(i => i.category === 'CHEMICAL').reduce((s, i) => s + i.totalQty, 0)} unit terpakai
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg">
                    <i className="fas fa-flask"></i>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">📝 Belanja Stationary (ATK)</span>
                    <span className="text-lg font-black font-mono text-white mt-1 block">
                      Rp {totalStationarySpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {allMatrixItems.filter(i => i.category === 'STATIONARY').reduce((s, i) => s + i.totalQty, 0)} unit terpakai
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                    <i className="fas fa-pencil-alt"></i>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest block">📢 Belanja Marketing</span>
                    <span className="text-lg font-black font-mono text-white mt-1 block">
                      Rp {totalMarketingSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {allMatrixItems.filter(i => i.category === 'MARKETING').reduce((s, i) => s + i.totalQty, 0)} unit terpakai
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
                    <i className="fas fa-bullhorn"></i>
                  </div>
                </div>
              </div>

              {/* FULL DATE RECAP TABLE (TANGGAL 1 - 31) */}
              <BelanjaFullTanggalRecapTable
                title="Tabel Rekap Harian Chemical & Stationary"
                subtitle={`Rekapan penyerapan harian Chemical, Stationary, dan Marketing tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
                icon="fa-flask"
                themeColor="cyan"
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                selectedOutlet={activeOutlet}
                isRegionalView={isRegionalView}
                monthlyStates={recapMonthlyStates}
                columns={recapColumns}
                getDetailItemsForDay={getDetailItemsForDay}
              />

              {/* TREND CHART & TOP ITEMS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-chart-bar text-cyan-400"></i> Tren Pengeluaran Harian
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
                          formatter={(val: any) => [`Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, 'Total Pengeluaran']}
                          labelFormatter={(label) => `Tanggal ${label} ${monthName} ${selectedYear}`}
                        />
                        <Bar dataKey="spend" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                      <i className="fas fa-crown text-cyan-400"></i> Top 5 Item Terbanyak Digunakan
                    </h3>

                    <div className="space-y-3">
                      {top5ChemicalItems.length === 0 ? (
                        <p className="text-xs text-slate-500 italic text-center py-8">Belum ada data transaksi</p>
                      ) : (
                        top5ChemicalItems.map((item, idx) => {
                          const share = totalCombinedDeductions > 0 ? (item.totalSpend / totalCombinedDeductions) * 100 : 0;
                          return (
                            <div key={item.key} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                              <div className="flex justify-between items-center text-xs mb-1.5">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 font-black flex items-center justify-center text-[10px] flex-none">
                                    {idx + 1}
                                  </span>
                                  <span className="font-bold text-white truncate max-w-[170px]">{item.name}</span>
                                </div>
                                <span className="font-mono font-black text-cyan-400 text-xs">
                                  Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full" style={{ width: `${Math.min(100, share * 2.5)}%` }}></div>
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
                      Rp {top5ChemicalItems.reduce((a, b) => a + b.totalSpend, 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* MATRIX DETAIL ITEM */}
              <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl space-y-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2.5">
                      <i className="fas fa-table text-cyan-400"></i> Matrix Detail Item Operasional
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Rincian item Chemical, Stationary & Marketing yang otomatis memotong belanja Main Store
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    {/* Category Filter for Matrix */}
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                      {(['ALL', 'CHEMICAL', 'STATIONARY', 'MARKETING'] as const).map(catKey => (
                        <button
                          key={catKey}
                          onClick={() => setMatrixCategoryFilter(catKey)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                            matrixCategoryFilter === catKey ? 'bg-cyan-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {catKey === 'ALL' ? 'Semua' : catKey}
                        </button>
                      ))}
                    </div>

                    <div className="relative flex-1 md:w-56">
                      <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                      <input
                        type="text"
                        placeholder="Cari item, PIC..."
                        value={matrixSearch}
                        onChange={(e) => setMatrixSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <select
                      value={matrixSortBy}
                      onChange={(e) => setMatrixSortBy(e.target.value as any)}
                      className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="spend_desc">Nominal Tertinggi</option>
                      <option value="spend_asc">Nominal Terendah</option>
                      <option value="qty_desc">Qty Terbanyak</option>
                      <option value="name_asc">Nama (A-Z)</option>
                    </select>

                    <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                      <button
                        onClick={() => setMatrixViewMode('ITEM_LIST')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                          matrixViewMode === 'ITEM_LIST' ? 'bg-cyan-500 text-white shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <i className="fas fa-list mr-1"></i> List
                      </button>
                      <button
                        onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                          matrixViewMode === 'OUTLET_PIVOT' ? 'bg-cyan-500 text-white shadow' : 'text-slate-400 hover:text-white'
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
                          <th className="py-3 px-4">Kategori</th>
                          <th className="py-3 px-4">Nama Item</th>
                          <th className="py-3 px-4 text-center">Total Qty</th>
                          <th className="py-3 px-4 text-right">Rata-rata Harga</th>
                          <th className="py-3 px-4 text-right">Min - Max Harga</th>
                          <th className="py-3 px-4 text-right font-black text-cyan-400">Total Belanja (Rp)</th>
                          <th className="py-3 px-4 text-center">% Kontribusi</th>
                          <th className="py-3 px-4 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {filteredMatrixItems.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                              <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                              Tidak ada data item yang cocok.
                            </td>
                          </tr>
                        ) : (
                          filteredMatrixItems.map((item, index) => {
                            const share = totalCombinedDeductions > 0 ? (item.totalSpend / totalCombinedDeductions) * 100 : 0;
                            return (
                              <tr key={item.key} className="hover:bg-cyan-500/5 transition-colors">
                                <td className="py-3 px-4 text-center text-slate-500 font-bold">{index + 1}</td>
                                <td className="py-3 px-4 font-sans">{getCategoryBadge(item.category)}</td>
                                <td className="py-3 px-4 font-sans font-bold text-white">
                                  <button
                                    onClick={() => setSelectedItemForDetail(item)}
                                    className="hover:text-cyan-400 transition-colors text-left font-bold cursor-pointer"
                                  >
                                    {item.name}
                                  </button>
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
                                <td className="py-3 px-4 text-right font-black text-cyan-400 bg-cyan-500/5">
                                  Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                                  {share.toFixed(2)}%
                                </td>
                                <td className="py-3 px-4 text-center font-sans">
                                  <button
                                    onClick={() => setSelectedItemForDetail(item)}
                                    className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-white transition-all text-[10px] font-black uppercase cursor-pointer"
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
                              {pivotOutlets.map(o => (
                                <th key={o} className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">{o}</th>
                              ))}
                              <th className="py-3 px-4 text-center bg-cyan-950/40 text-cyan-300">Total Qty</th>
                              <th className="py-3 px-4 text-right bg-cyan-950/60 text-cyan-300 font-black">Total Belanja (Rp)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {filteredMatrixItems.map((item, idx) => (
                              <tr key={item.key} className="hover:bg-cyan-500/5 transition-colors">
                                <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">{idx + 1}</td>
                                <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                                  <button onClick={() => setSelectedItemForDetail(item)} className="hover:text-cyan-400 cursor-pointer flex items-center gap-1.5">
                                    {getCategoryBadge(item.category)}
                                    <span>{item.name}</span>
                                  </button>
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
                                <td className="py-3 px-4 text-center font-bold text-slate-300 bg-cyan-950/20">
                                  {item.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-cyan-400 bg-cyan-950/30">
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
          themeColor="cyan"
          moduleTitle="Chemical & Supplies"
          iconClass="fa-flask"
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
          currentSpend={totalCombinedDeductions}
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
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg">
                    <i className="fas fa-flask"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-white uppercase tracking-tight">
                        {selectedItemForDetail.name}
                      </h3>
                      {getCategoryBadge(selectedItemForDetail.category)}
                    </div>
                    <p className="text-xs text-slate-400">
                      Total {selectedItemForDetail.txCount} Transaksi Requisition
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Belanja</span>
                    <span className="text-base font-black font-mono text-cyan-400">
                      Rp {selectedItemForDetail.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Qty</span>
                    <span className="text-base font-black font-mono text-teal-400">
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
                          <td className="py-2.5 px-3 text-right font-black text-cyan-400">Rp {tx.subtotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
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
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
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

export default ChemicalExpenseModule;
