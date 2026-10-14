import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet } from '../types';
import { OUTLETS, INITIAL_STATE } from '../constants';
import ShareActions from './ShareActions';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';
import ModuleDateMatrixSidebar from './ModuleDateMatrixSidebar';
import ModuleExecutiveKpis from './ModuleExecutiveKpis';
import { extractStateMtdRevenue, buildDailyMatrix } from '../lib/moduleAnalytics';
import { RegionalMatrixReportTable } from './RegionalMatrixReportTable';
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

export interface MatrixComplimentaryItem {
  key: string;
  name: string;
  totalQty: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalAmount: number;
  txCount: number;
  outletSpend: Record<string, number>;
  outletQty: Record<string, number>;
  transactions: {
    date: string;
    outlet: string;
    name: string;
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

export const ComplimentaryModule: React.FC<Props> = ({
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
  const [moduleTab, setModuleTab] = useState<'REGIONAL_MATRIX' | 'INPUT' | 'MATRIX'>(
    isRegionalView ? 'REGIONAL_MATRIX' : 'INPUT'
  );
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'amount_desc' | 'amount_asc' | 'qty_desc' | 'name_asc'>('amount_desc');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MatrixComplimentaryItem | null>(null);

  // Input states
  const [inputDate, setInputDate] = useState<string>(() => {
    if (filters?.startDate) return filters.startDate;
    const now = new Date();
    if (now.getMonth() === selectedMonth && now.getFullYear() === selectedYear) {
      return toLocalDateStr(now);
    }
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  });
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
  const reportId = `complimentary-${activeOutlet}-${monthPrefix}`;

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Current day items
  const currentDayItems = useMemo(() => {
    return (data.dailyComplimentary && data.dailyComplimentary[inputDate]) || [];
  }, [data.dailyComplimentary, inputDate]);

  const currentDayTotal = useMemo(() => {
    return currentDayItems.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  }, [currentDayItems]);

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
      const ledger = st.dailyComplimentary || {};
      Object.entries(ledger).forEach(([dStr, items]) => {
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
  }, [data, allMonthlyData, activeOutlet, isRegionalView, selectedYear]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      showToast?.('Nama Menu / Keterangan Complimentary wajib diisi!', 'error');
      return;
    }
    const qtyNum = parseFloat(inputQty) || 1;
    const priceNum = parseFloat(inputPrice) || 0;
    if (priceNum <= 0) {
      showToast?.('Harga / Nilai Complimentary harus lebih dari 0!', 'error');
      return;
    }

    if (!onUpdate) {
      showToast?.('Mode tampilan hanya baca (read-only).', 'error');
      return;
    }

    const newItem: LedgerItem = {
      id: 'comp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: inputName.trim(),
      qty: qtyNum,
      price: priceNum,
      pic: inputPic.trim() || 'General Manager / MOD',
      reason: inputReason.trim() || 'Complimentary / Otorisasi Manajemen'
    };

    onUpdate((prev: AppState) => {
      const currentLedger = prev.dailyComplimentary || {};
      const curList = currentLedger[inputDate] || [];
      const updatedList = [...curList, newItem];
      const updatedDayTotal = updatedList.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

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
          complimentary: updatedDayTotal
        }
      };

      return {
        ...prev,
        dailyComplimentary: {
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
    showToast?.(`Complimentary "${newItem.name}" berhasil ditambahkan!`, 'success');
  };

  const handleDeleteItem = (itemId: string, itemName: string) => {
    if (!onUpdate) return;
    onUpdate((prev: AppState) => {
      const currentLedger = prev.dailyComplimentary || {};
      const curList = currentLedger[inputDate] || [];
      const updatedList = curList.filter(it => it.id !== itemId);
      const updatedDayTotal = updatedList.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);

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
        dailyComplimentary: {
          ...currentLedger,
          [inputDate]: updatedList
        },
        expenses: {
          ...(prev.expenses || {}),
          [inputDate]: {
            ...currentDayExpenses,
            complimentary: updatedDayTotal
          }
        }
      };
    }, undefined, true);

    showToast?.(`Item "${itemName}" dihapus.`, 'info');
  };

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
      complimentary: [],
      dailyComplimentary: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} }
    };
  };

  const targetOutlets = useMemo(() => {
    return isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  // Aggregate Complimentary Matrix Data
  const {
    totalComplimentaryAmount,
    totalQtyAll,
    allMatrixItems,
    dailyChartData,
    top5Items,
    outletDistribution,
    dailyMap,
    dailyTxMap,
    dailyItemsMap
  } = useMemo(() => {
    const itemsMap = new Map<string, MatrixComplimentaryItem>();
    const dailyMap: Record<string, number> = {};
    const dailyTxMap: Record<string, number> = {};
    const dailyItemsMap: Record<string, any[]> = {};
    const outletDistMap: Record<string, number> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${monthPrefix}-${dayStr}`;
      dailyMap[dateStr] = 0;
      dailyTxMap[dateStr] = 0;
      dailyItemsMap[dateStr] = [];
    }

    OUTLETS.forEach(o => {
      outletDistMap[o] = 0;
    });

    targetOutlets.forEach(outletName => {
      const st = getOutletMonthState(outletName, selectedMonth, selectedYear);
      if (!st) return;

      const ledgerRecord = st.dailyComplimentary || {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateStr = `${monthPrefix}-${dayStr}`;
        const itemsList = ledgerRecord[dateStr] || [];

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          itemsList.forEach((it: any) => {
            const cleanName = (it.name || 'Complimentary Item / Promo').trim();
            if (!cleanName) return;

            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const subtotal = qty * price;

            dailyMap[dateStr] = (dailyMap[dateStr] || 0) + subtotal;
            dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
            outletDistMap[outletName] = (outletDistMap[outletName] || 0) + subtotal;

            dailyItemsMap[dateStr].push({
              name: cleanName,
              qty,
              unit: 'porsi',
              price,
              amount: subtotal,
              category: 'Complimentary'
            });

            const mapKey = cleanName.toLowerCase();
            if (!itemsMap.has(mapKey)) {
              itemsMap.set(mapKey, {
                key: mapKey,
                name: cleanName,
                totalQty: qty,
                avgPrice: price,
                minPrice: price,
                maxPrice: price,
                totalAmount: subtotal,
                txCount: 1,
                outletSpend: { [outletName]: subtotal },
                outletQty: { [outletName]: qty },
                transactions: [{
                  date: dateStr,
                  outlet: outletName,
                  name: cleanName,
                  qty,
                  price,
                  subtotal,
                  pic: it.pic || '-',
                  reason: it.reason || '-'
                }]
              });
            } else {
              const ex = itemsMap.get(mapKey)!;
              ex.totalQty += qty;
              ex.totalAmount += subtotal;
              ex.txCount += 1;
              ex.minPrice = Math.min(ex.minPrice, price);
              ex.maxPrice = Math.max(ex.maxPrice, price);
              ex.avgPrice = ex.totalQty > 0 ? ex.totalAmount / ex.totalQty : price;
              ex.outletSpend[outletName] = (ex.outletSpend[outletName] || 0) + subtotal;
              ex.outletQty[outletName] = (ex.outletQty[outletName] || 0) + qty;
              ex.transactions.push({
                date: dateStr,
                outlet: outletName,
                name: cleanName,
                qty,
                price,
                subtotal,
                pic: it.pic || '-',
                reason: it.reason || '-'
              });
            }
          });
        }
      }
    });

    const itemsList = Array.from(itemsMap.values());
    const totalAmount = itemsList.reduce((acc, it) => acc + it.totalAmount, 0);
    const totalQty = itemsList.reduce((acc, it) => acc + it.totalQty, 0);

    const chartData = Object.entries(dailyMap).map(([dateStr, amount]) => ({
      day: dateStr.split('-')[2],
      date: dateStr,
      amount
    }));

    const top5 = [...itemsList].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);

    return {
      totalComplimentaryAmount: totalAmount,
      totalQtyAll: totalQty,
      allMatrixItems: itemsList,
      dailyChartData: chartData,
      top5Items: top5,
      outletDistribution: outletDistMap,
      dailyMap,
      dailyTxMap,
      dailyItemsMap
    };
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth]);

  // Last Month calculations
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthName = MONTH_NAMES[lastMonthIdx];
  const lastMonthPrefix = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, '0')}`;
  const daysInLastMonth = new Date(lastMonthYear, lastMonthIdx + 1, 0).getDate();

  // Current Month MTD Revenue
  const currentMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, selectedMonth, selectedYear);
      return sum + extractStateMtdRevenue(st, monthPrefix);
    }, 0);
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, data, allMonthlyData]);

  // Last Month MTD Revenue
  const lastMonthMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      return sum + extractStateMtdRevenue(st, lastMonthPrefix);
    }, 0);
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, allMonthlyData]);

  // Last Month Spend for Complimentary & Items map
  const { lastMonthSpend, lastMonthItemsMap } = useMemo(() => {
    let total = 0;
    const lastMap: Record<string, { spend: number; qty: number }> = {};
    targetOutlets.forEach(o => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      if (!st) return;
      const ledgerRecord = st.dailyComplimentary || {};
      for (let d = 1; d <= daysInLastMonth; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dStr = `${lastMonthPrefix}-${dayStr}`;
        const items = ledgerRecord[dStr] || [];
        if (Array.isArray(items) && items.length > 0) {
          items.forEach((it: any) => {
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const amt = qty * price;
            total += amt;
            const cleanName = (it.name || '').trim().toLowerCase();
            if (cleanName) {
              if (!lastMap[cleanName]) {
                lastMap[cleanName] = { spend: amt, qty };
              } else {
                lastMap[cleanName].spend += amt;
                lastMap[cleanName].qty += qty;
              }
            }
          });
        }
      }
    });
    return { lastMonthSpend: total, lastMonthItemsMap: lastMap };
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, daysInLastMonth, allMonthlyData]);

  // Daily matrix for sidebar
  const dailyMatrix = useMemo(() => {
    return buildDailyMatrix(selectedYear, selectedMonth, dailyMap, dailyTxMap, dailyItemsMap);
  }, [selectedYear, selectedMonth, dailyMap, dailyTxMap, dailyItemsMap]);

  // Category / Top Item Variances for Sidebar
  const categoryVariances = useMemo(() => {
    const topItems = top5Items.slice(0, 5);
    if (topItems.length === 0) return [];

    return topItems.map(item => {
      const lm = lastMonthItemsMap[item.key];
      return {
        key: item.key,
        label: item.name,
        currentSpend: item.totalAmount,
        lastMonthSpend: lm ? lm.spend : 0,
        currentQty: item.totalQty,
        lastMonthQty: lm ? lm.qty : 0,
        qtyUnit: 'porsi'
      };
    });
  }, [top5Items, lastMonthItemsMap]);

  // Item Variances for Top Items
  const itemVariances = useMemo(() => {
    return allMatrixItems.map(it => {
      const lm = lastMonthItemsMap[it.key];
      return {
        key: it.key,
        label: it.name,
        currentSpend: it.totalAmount,
        lastMonthSpend: lm ? lm.spend : 0,
        currentQty: it.totalQty,
        lastMonthQty: lm ? lm.qty : 0,
        qtyUnit: 'porsi'
      };
    }).sort((a, b) => b.currentSpend - a.currentSpend).slice(0, 20);
  }, [allMatrixItems, lastMonthItemsMap]);

  // Popular items (only from recorded transactions)
  const popularComplimentaryItems = useMemo(() => {
    const recorded = allMatrixItems
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);
    return Array.from(new Set(recorded)).slice(0, 12);
  }, [allMatrixItems]);

  // Filter & Sort
  const filteredMatrixItems = useMemo(() => {
    let list = [...allMatrixItems];

    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) || 
        it.transactions.some(tx => tx.pic.toLowerCase().includes(q) || tx.reason.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (matrixSortBy === 'amount_desc') return b.totalAmount - a.totalAmount;
      if (matrixSortBy === 'amount_asc') return a.totalAmount - b.totalAmount;
      if (matrixSortBy === 'qty_desc') return b.totalQty - a.totalQty;
      if (matrixSortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });

    return list;
  }, [allMatrixItems, matrixSearch, matrixSortBy]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus Executive App';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('REKAP_COMPLIMENTARY');
      summarySheet.addRow([`LAPORAN BILL COMPLIMENTARY & PROMO - ${activeOutlet}`]);
      summarySheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      summarySheet.addRow([`Total Nilai Complimentary: Rp ${totalComplimentaryAmount.toLocaleString('id-ID')}`]);
      summarySheet.addRow([]);

      summarySheet.addRow(['No', 'Nama Item / Promo / VIP', 'Total Qty', 'Jumlah Transaksi', 'Total Nilai (Rp)', '% Kontribusi']);
      filteredMatrixItems.forEach((it, idx) => {
        const share = totalComplimentaryAmount > 0 ? (it.totalAmount / totalComplimentaryAmount) * 100 : 0;
        summarySheet.addRow([
          idx + 1,
          it.name,
          it.totalQty,
          it.txCount,
          it.totalAmount,
          `${share.toFixed(2)}%`
        ]);
      });

      const matrixSheet = workbook.addWorksheet('MATRIX_COMPLIMENTARY');
      matrixSheet.addRow([`MATRIX DETAIL COMPLIMENTARY - ${activeOutlet}`]);
      matrixSheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      matrixSheet.addRow([]);

      const pivotCols = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet];
      matrixSheet.addRow(['No', 'Nama Item Complimentary', 'Total Qty', 'Rata-rata Nilai (Rp)', 'Min Nilai (Rp)', 'Max Nilai (Rp)', 'Total Biaya (Rp)', '% Share', ...pivotCols.map(o => `Biaya ${o}`)]);

      filteredMatrixItems.forEach((it, idx) => {
        const share = totalComplimentaryAmount > 0 ? (it.totalAmount / totalComplimentaryAmount) * 100 : 0;
        matrixSheet.addRow([
          idx + 1,
          it.name,
          it.totalQty,
          Math.round(it.avgPrice),
          it.minPrice,
          it.maxPrice,
          it.totalAmount,
          `${share.toFixed(2)}%`,
          ...pivotCols.map(o => it.outletSpend[o] || 0)
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Complimentary_${activeOutlet}_${monthPrefix}.xlsx`);
      showToast?.('Berhasil mengunduh Laporan Excel Complimentary!', 'success');
    } catch (err) {
      showToast?.('Gagal mengunduh Excel.', 'error');
    }
  };

  // Copy WhatsApp Summary
  const handleCopyWhatsApp = () => {
    let text = `*🎁 REKAP BILL COMPLIMENTARY & PROMO*\n`;
    text += `*Outlet:* ${activeOutlet}\n`;
    text += `*Periode:* ${monthName} ${selectedYear}\n`;
    text += `------------------------------------\n`;
    text += `*💰 Total Nilai Complimentary:* Rp ${totalComplimentaryAmount.toLocaleString('id-ID')}\n`;
    text += `*🍽️ Total Item/Porsi:* ${totalQtyAll.toLocaleString('id-ID')} unit\n`;
    text += `*📑 Varian Menu/Treat:* ${allMatrixItems.length} jenis item\n\n`;

    text += `*🔥 TOP 5 COMPLIMENTARY TERBESAR:*\n`;
    top5Items.forEach((it, i) => {
      text += `${i + 1}. ${it.name} - Rp ${it.totalAmount.toLocaleString('id-ID')} [${it.totalQty} qty]\n`;
    });

    text += `\n_Generated automatically via Justus Executive System_`;

    navigator.clipboard.writeText(text);
    showToast?.('Ringkasan WA Complimentary disalin ke clipboard!', 'success');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-200">
      {/* HEADER BAR */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-700 flex items-center justify-center text-white shadow-lg shadow-purple-900/40">
              <i className="fas fa-gift text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                Complimentary
              </h2>
              <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mt-0.5">
                Monitoring Bill Complimentary, VIP Treats, Media Promo & Matrix Detail
              </p>
            </div>
          </div>
        </div>

        {/* Actions & Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 shadow-sm">
              <i className="fas fa-store text-purple-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500 cursor-pointer"
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
            title={`Complimentary - ${activeOutlet} (${monthName} ${selectedYear})`}
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
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
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
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {outlet}
            </button>
          ))}
        </div>
      )}

      {/* MAIN LAYOUT WITH MONTHLY SIDEBAR ON RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {/* NAVIGATION TABS */}
          <div className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-2xl border border-white/10 w-fit no-print">
            {isRegionalView && (
              <button
                onClick={() => setModuleTab('REGIONAL_MATRIX')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  moduleTab === 'REGIONAL_MATRIX'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'text-amber-400 hover:text-white'
                }`}
              >
                <i className="fas fa-chart-line"></i> Rekap Regional (Daily, Weekly, Monthly, YTD, Compare)
              </button>
            )}
            {!isRegionalView && (
              <button
                onClick={() => setModuleTab('INPUT')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  moduleTab === 'INPUT'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-edit"></i> Input Complimentary
              </button>
            )}
            <button
              onClick={() => setModuleTab('MATRIX')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'MATRIX'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table"></i> Matrix Rekap & Analisis
            </button>
          </div>

          {moduleTab === 'REGIONAL_MATRIX' && (
            <RegionalMatrixReportTable
              title="Laporan Rekapitulasi Complimentary Regional"
              description="Laporan konsolidasi Complimentary: Matriks Tanggal Harian (1-31), Weekly (W1-W5), Bulanan (Jan-Des), YTD Kumulatif, dan Compare Last Week"
              moduleName="Complimentary"
              valueUnit="RP"
              allOutletsData={allMonthlyData || {}}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedArea="ALL"
              selectedOutlet={activeOutlet}
              onSelectOutlet={setActiveOutlet}
              showToast={showToast}
              extractDailyValue={(outletMonths, dateStr) => {
                if (!outletMonths) return 0;
                const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
                const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
                let list = mData.dailyComplimentary?.[dateStr] || outletMonths.dailyComplimentary?.[dateStr];
                if (!list) {
                  for (const k of Object.keys(outletMonths)) {
                    if (outletMonths[k]?.dailyComplimentary?.[dateStr]) {
                      list = outletMonths[k].dailyComplimentary[dateStr];
                      break;
                    }
                  }
                }
                if (Array.isArray(list)) {
                  return list.reduce((sum: number, it: any) => sum + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
                }
                return 0;
              }}
              extractDailyTxCount={(outletMonths, dateStr) => {
                if (!outletMonths) return 0;
                const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
                const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
                let list = mData.dailyComplimentary?.[dateStr] || outletMonths.dailyComplimentary?.[dateStr];
                if (!list) {
                  for (const k of Object.keys(outletMonths)) {
                    if (outletMonths[k]?.dailyComplimentary?.[dateStr]) {
                      list = outletMonths[k].dailyComplimentary[dateStr];
                      break;
                    }
                  }
                }
                return Array.isArray(list) ? list.length : 0;
              }}
            />
          )}

          {moduleTab === 'INPUT' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE METRIC SUMMARY: RATIO & VARIANCE */}
              <ModuleExecutiveKpis
                themeColor="purple"
                spendLabel="Total Nilai Complimentary"
                totalSpend={totalComplimentaryAmount}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="porsi"
                benchmarkRatioThresholds={{ warning: 1.0, danger: 2.0 }}
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
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Complimentary:</span>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Hari Ini ({inputDate}):</span>
                    <span className="text-lg font-black font-mono text-purple-400">
                      Rp {currentDayTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast?.(`Data Complimentary tanggal ${inputDate} tersimpan otomatis!`, 'success')}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <i className="fas fa-save"></i> Submit Data Complimentary
                  </button>
                </div>
              </div>

              {/* INPUT FORM CARD */}
              <div className="glass-card p-6 bg-slate-900/90 border border-purple-500/30 rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-plus-circle text-purple-400"></i>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Form Input Complimentary & Otorisasi Manajemen
                    </h3>
                  </div>
                </div>

                {/* Suggested Chips (Only if recorded items exist) */}
                {popularComplimentaryItems.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      Kategori Complimentary Populer:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {popularComplimentaryItems.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setInputName(item)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 hover:bg-purple-500/20 text-slate-300 hover:text-purple-300 border border-white/5 hover:border-purple-500/30 transition-all cursor-pointer"
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
                      Nama Menu / Keterangan Complimentary *
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Compliment VIP Blogger, R&D Steak..."
                      value={inputName}
                      onChange={e => setInputName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-600 outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Jumlah (Porsi / Qty)
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      placeholder="1"
                      value={inputQty}
                      onChange={e => setInputQty(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Nominal / Nilai (Rp) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={inputPrice}
                      onChange={e => setInputPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-purple-400 font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      PIC / Yang Mengotorisasi
                    </label>
                    <input
                      type="text"
                      placeholder="Nama GM / Manager"
                      value={inputPic}
                      onChange={e => setInputPic(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Event / Catatan Khusus
                    </label>
                    <input
                      type="text"
                      placeholder="Undangan Media / VIP..."
                      value={inputReason}
                      onChange={e => setInputReason(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="md:col-span-12 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer"
                    >
                      <i className="fas fa-plus"></i> Tambah Item Complimentary
                    </button>
                  </div>
                </form>

                <FeatureSubmitSyncButton
                  featureName="Complimentary"
                  subtext={`Klik setelah selesai input transaksi complimentary tanggal ${inputDate} agar data langsung tersinkronkan ke seluruh user.`}
                  className="mt-4"
                />
              </div>

              {/* LIST OF TODAY'S TRANSACTIONS */}
              <div className="glass-card p-5 bg-slate-900/90 border border-purple-500/20 rounded-3xl shadow-xl space-y-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-gift text-purple-400"></i>
                    <h4 className="text-xs font-black uppercase tracking-wider text-white">Daftar Complimentary ({inputDate})</h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-purple-400">
                    Total: Rp {currentDayTotal.toLocaleString('id-ID')}
                  </span>
                </div>

                {currentDayItems.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                    <p className="text-[11px] text-slate-500">Tidak ada pengeluaran Complimentary untuk hari ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[9px]">
                          <th className="py-2 px-3">Item / Menu</th>
                          <th className="py-2 px-3 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Harga</th>
                          <th className="py-2 px-3 text-right font-black">Subtotal</th>
                          <th className="py-2 px-3">PIC</th>
                          <th className="py-2 px-3">Event / Catatan</th>
                          <th className="py-2 px-3 text-center w-12">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                        {currentDayItems.map((it: LedgerItem, idx: number) => {
                          const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
                          return (
                            <tr key={it.id || idx} className="hover:bg-white/5">
                              <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[150px]">{it.name}</td>
                              <td className="py-2 px-3 text-center text-slate-300">{it.qty}</td>
                              <td className="py-2 px-3 text-right text-slate-400">Rp {(Number(it.price) || 0).toLocaleString('id-ID')}</td>
                              <td className="py-2 px-3 text-right font-black text-purple-400">Rp {sub.toLocaleString('id-ID')}</td>
                              <td className="py-2 px-3 font-sans text-slate-300 text-[10px]">{it.pic}</td>
                              <td className="py-2 px-3 font-sans text-slate-400 text-[10px]">{it.reason}</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(it.id, it.name)}
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
                themeColor="purple"
                spendLabel="Total Nilai Complimentary"
                totalSpend={totalComplimentaryAmount}
                mtdRevenue={currentMtdRevenue}
                lastMonthSpend={lastMonthSpend}
                lastMonthName={lastMonthName}
                currentMonthName={monthName}
                selectedYear={selectedYear}
                daysInMonth={daysInMonth}
                totalQtyAll={totalQtyAll}
                qtyUnit="porsi"
                benchmarkRatioThresholds={{ warning: 1.0, danger: 2.0 }}
              />

      {/* TREND CHART & TOP COMPLIMENTARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-chart-bar text-purple-400"></i> Tren Nilai Complimentary Harian
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {monthName} {selectedYear}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickFormatter={(val) => `${(val / 1000).toLocaleString('id-ID')}k`} 
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(val: any) => [`Rp ${Number(val || 0).toLocaleString('id-ID')}`, 'Complimentary']}
                  labelFormatter={(label) => `Tanggal ${label} ${monthName} ${selectedYear}`}
                />
                <Bar dataKey="amount" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <i className="fas fa-crown text-purple-400"></i> Top 5 Complimentary Terbesar
            </h3>

            <div className="space-y-3">
              {top5Items.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">Belum ada data complimentary</p>
              ) : (
                top5Items.map((item, idx) => {
                  const share = totalComplimentaryAmount > 0 ? (item.totalAmount / totalComplimentaryAmount) * 100 : 0;
                  return (
                    <div key={item.key} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-400 font-black flex items-center justify-center text-[10px] flex-none">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate max-w-[180px]">{item.name}</span>
                        </div>
                        <span className="font-mono font-black text-purple-400 text-xs">
                          Rp {item.totalAmount.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${Math.min(100, share * 2)}%` }}></div>
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
              Rp {top5Items.reduce((a, b) => a + b.totalAmount, 0).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* MATRIX DETAIL COMPLIMENTARY */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2.5">
              <i className="fas fa-table text-purple-400"></i> Matrix Detail Bill Complimentary
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rekapitulasi lengkap seluruh item complimentary, promo, VIP treats, serta sebaran biaya per outlet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                placeholder="Cari item, PIC, event/catatan..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <select
              value={matrixSortBy}
              onChange={(e) => setMatrixSortBy(e.target.value as any)}
              className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="amount_desc">Nominal Tertinggi</option>
              <option value="amount_asc">Nominal Terendah</option>
              <option value="qty_desc">Qty/Porsi Terbanyak</option>
              <option value="name_asc">Nama (A-Z)</option>
            </select>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setMatrixViewMode('ITEM_LIST')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'ITEM_LIST' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-list mr-1"></i> List
              </button>
              <button
                onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'OUTLET_PIVOT' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
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
                  <th className="py-3 px-4">Nama Item / Promo / VIP Treat</th>
                  <th className="py-3 px-4 text-center">Total Porsi / Qty</th>
                  <th className="py-3 px-4 text-right">Rata-rata Harga Satuan</th>
                  <th className="py-3 px-4 text-right">Min - Max Satuan</th>
                  <th className="py-3 px-4 text-right font-black text-purple-400">Total Nilai (Rp)</th>
                  <th className="py-3 px-4 text-center">% Share</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredMatrixItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                      <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                      Tidak ada data Complimentary yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixItems.map((item, index) => {
                    const share = totalComplimentaryAmount > 0 ? (item.totalAmount / totalComplimentaryAmount) * 100 : 0;
                    return (
                      <tr key={item.key} className="hover:bg-purple-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold">{index + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="hover:text-purple-400 transition-colors text-left font-bold"
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-200">
                          {item.totalQty.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          Rp {item.avgPrice.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 text-[11px]">
                          {item.minPrice === item.maxPrice ? (
                            `Rp ${item.minPrice.toLocaleString('id-ID')}`
                          ) : (
                            `Rp ${item.minPrice.toLocaleString('id-ID')} - ${item.maxPrice.toLocaleString('id-ID')}`
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-purple-400 bg-purple-500/5">
                          Rp {item.totalAmount.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                          {share.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-600 hover:text-white transition-all text-[10px] font-black uppercase"
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
                      <th className="py-3 px-4 sticky left-12 bg-slate-900 z-10">Nama Item Complimentary</th>
                      {pivotOutlets.map(o => (
                        <th key={o} className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">{o}</th>
                      ))}
                      <th className="py-3 px-4 text-center bg-purple-950/40 text-purple-300">Total Qty</th>
                      <th className="py-3 px-4 text-right bg-purple-950/60 text-purple-300 font-black">Total Nilai (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredMatrixItems.map((item, idx) => (
                      <tr key={item.key} className="hover:bg-purple-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">{idx + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                          <button onClick={() => setSelectedItemForDetail(item)} className="hover:text-purple-400">
                            {item.name}
                          </button>
                        </td>
                        {pivotOutlets.map(o => {
                          const spend = item.outletSpend[o] || 0;
                          const qty = item.outletQty[o] || 0;
                          return (
                            <td key={o} className="py-3 px-4 text-right whitespace-nowrap">
                              {spend > 0 ? (
                                <div>
                                  <span className="text-white font-bold">Rp {spend.toLocaleString('id-ID')}</span>
                                  <span className="block text-[9px] text-slate-500">({qty} porsi)</span>
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-center font-bold text-slate-300 bg-purple-950/20">
                          {item.totalQty.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-purple-400 bg-purple-950/30">
                          Rp {item.totalAmount.toLocaleString('id-ID')}
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
            themeColor="purple"
            moduleTitle="Complimentary"
            iconClass="fa-gift"
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
            currentSpend={totalComplimentaryAmount}
            lastMonthSpend={lastMonthSpend}
            currentMtdRevenue={currentMtdRevenue}
            lastMonthMtdRevenue={lastMonthMtdRevenue}
            monthlyOverviewStats={monthlyOverviewStats}
            categoryVariances={categoryVariances}
            itemVariances={itemVariances}
            itemUnit="porsi"
          />
        )}
      </div>

      {/* MODAL RINCIAN TRANSAKSI */}
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
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
                    <i className="fas fa-gift"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {selectedItemForDetail.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Total <span className="text-purple-400 font-bold">{selectedItemForDetail.txCount} Transaksi</span> Complimentary
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
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Nilai</span>
                    <span className="text-base font-black font-mono text-purple-400">
                      Rp {selectedItemForDetail.totalAmount.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Total Porsi/Qty</span>
                    <span className="text-base font-black font-mono text-pink-400">
                      {selectedItemForDetail.totalQty.toLocaleString('id-ID')} unit
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase block">Rata-rata Harga Satuan</span>
                    <span className="text-base font-black font-mono text-indigo-400">
                      Rp {selectedItemForDetail.avgPrice.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
                        <th className="py-2.5 px-3">PIC</th>
                        <th className="py-2.5 px-3">Event / Catatan Otorisasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {selectedItemForDetail.transactions.map((tx, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">{tx.date}</td>
                          <td className="py-2.5 px-3 font-sans text-white font-bold">{tx.outlet}</td>
                          <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{tx.qty}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">Rp {tx.price.toLocaleString('id-ID')}</td>
                          <td className="py-2.5 px-3 text-right font-black text-purple-400">Rp {tx.subtotal.toLocaleString('id-ID')}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px]">{tx.pic}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px]">{tx.reason}</td>
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

export default ComplimentaryModule;
