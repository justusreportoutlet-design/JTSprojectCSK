import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem, Outlet, CustomSupplier } from '../types';
import { OUTLETS, INITIAL_STATE, getStoredCustomSuppliers, saveStoredCustomSuppliers } from '../constants';
import { safeStorage } from '../lib/safeStorage';
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
  onNavigateToCogs?: () => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

interface SupplierDef {
  key: string;
  label: string;
  ledgerKey: keyof AppState;
  expenseKey: string;
  icon: string;
  color: string;
}

const SUPPLIERS_LIST: SupplierDef[] = [
  { key: 'tgif', label: 'TGIF', ledgerKey: 'dailyTgifLedger', expenseKey: 'tgif', icon: 'fa-truck-loading', color: 'border-red-500/30 bg-red-500/10 text-red-400' },
  { key: 'sukanda', label: 'Sukanda Djaya', ledgerKey: 'dailySukandaLedger', expenseKey: 'sukanda', icon: 'fa-box', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
  { key: 'everest', label: 'Everest', ledgerKey: 'dailyEverestLedger', expenseKey: 'everest', icon: 'fa-mountain', color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' },
  { key: 'ikigai', label: 'Ikigai', ledgerKey: 'dailyIkigaiLedger', expenseKey: 'ikigai', icon: 'fa-fish', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  { key: 'panfila', label: 'Panfila', ledgerKey: 'dailyPanfilaLedger', expenseKey: 'panfila', icon: 'fa-leaf', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
  { key: 'saungKubil', label: 'Saung Kubil', ledgerKey: 'dailySaungKubilLedger', expenseKey: 'saungKubil', icon: 'fa-seedling', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  { key: 'kebunku', label: 'Kebunku', ledgerKey: 'dailyKebunkuLedger', expenseKey: 'kebunku', icon: 'fa-carrot', color: 'border-lime-500/30 bg-lime-500/10 text-lime-400' },
];

export interface MatrixSupplierItem {
  key: string;
  name: string;
  supplierKey: string;
  supplierLabel: string;
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
    supplier: string;
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

export const SupplierExpenseModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
  isRegionalView = false,
  onUpdate,
  filters,
  showToast,
  onNavigateToCogs
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
  const [moduleTab, setModuleTab] = useState<'INPUT' | 'ALOKASI_BUDGET' | 'MATRIX'>('INPUT');
  const [activeSupplierFilter, setActiveSupplierFilter] = useState<string>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSortBy, setMatrixSortBy] = useState<'spend_desc' | 'spend_asc' | 'qty_desc' | 'name_asc'>('spend_desc');
  const [matrixViewMode, setMatrixViewMode] = useState<'ITEM_LIST' | 'OUTLET_PIVOT'>('ITEM_LIST');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MatrixSupplierItem | null>(null);

  // Budget Belanja Pengadaan (MK, MS, Cash Supplier, & 7 Rekanan Supplier)
  const budgetStorageKey = `BARN_PROCUREMENT_BUDGET_${activeOutlet}_${selectedYear}_${selectedMonth}`;
  const [customProcurementBudget, setCustomProcurementBudget] = useState<number>(() => {
    const saved = safeStorage.getItem(budgetStorageKey);
    return saved ? parseFloat(saved) || 0 : 0;
  });
  const [isEditingBudgetModal, setIsEditingBudgetModal] = useState<boolean>(false);
  const [inputBudgetValue, setInputBudgetValue] = useState<string>('');
  const [includeProcurementChannelsInRecap, setIncludeProcurementChannelsInRecap] = useState<boolean>(false);
  const [alokasiCategoryFilter, setAlokasiCategoryFilter] = useState<'ALL' | 'SUPPLIERS' | 'INTERNAL'>('ALL');
  const [alokasiSearch, setAlokasiSearch] = useState<string>('');

  // Custom Suppliers State & Handlers
  const [customSuppliersList, setCustomSuppliersList] = useState<CustomSupplier[]>(() => {
    if (data?.customSuppliers && data.customSuppliers.length > 0) return data.customSuppliers;
    return getStoredCustomSuppliers();
  });

  React.useEffect(() => {
    if (data?.customSuppliers && data.customSuppliers.length > 0) {
      setCustomSuppliersList(data.customSuppliers);
    }
  }, [data?.customSuppliers]);

  React.useEffect(() => {
    const handleSupChange = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setCustomSuppliersList(e.detail);
      }
    };
    window.addEventListener('appCustomSuppliersChanged', handleSupChange);
    return () => window.removeEventListener('appCustomSuppliersChanged', handleSupChange);
  }, []);

  const [showAddSupplierModal, setShowAddSupplierModal] = useState<boolean>(false);
  const [newSupplierName, setNewSupplierName] = useState<string>('');
  const [newSupplierCategory, setNewSupplierCategory] = useState<string>('Mitra Bahan Makanan');
  const [newSupplierContact, setNewSupplierContact] = useState<string>('');
  const [newSupplierPhone, setNewSupplierPhone] = useState<string>('');
  const [newSupplierNotes, setNewSupplierNotes] = useState<string>('');

  const handleAddSupplier = () => {
    if (!newSupplierName.trim()) {
      showToast?.('Mohon isi nama supplier baru!', 'error');
      return;
    }
    const cleanId = 'sup_' + newSupplierName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
    const newSup: CustomSupplier = {
      id: cleanId,
      name: newSupplierName.trim(),
      key: `daily_${cleanId}_ledger`,
      category: newSupplierCategory || 'Mitra Bahan Makanan',
      contactPerson: newSupplierContact.trim() || undefined,
      phone: newSupplierPhone.trim() || undefined,
      notes: newSupplierNotes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const updated = [...customSuppliersList, newSup];
    setCustomSuppliersList(updated);
    saveStoredCustomSuppliers(updated);

    if (onUpdate) {
      onUpdate(prev => ({
        ...prev,
        customSuppliers: updated
      }));
    }

    showToast?.(`Supplier "${newSup.name}" berhasil ditambahkan ke Fitur Supplier!`, 'success');
    setNewSupplierName('');
    setNewSupplierContact('');
    setNewSupplierPhone('');
    setNewSupplierNotes('');
    setShowAddSupplierModal(false);
  };

  const handleDeleteCustomSupplier = (supplierId: string, supplierName: string) => {
    const updated = customSuppliersList.filter(s => s.id !== supplierId);
    setCustomSuppliersList(updated);
    saveStoredCustomSuppliers(updated);

    if (onUpdate) {
      onUpdate(prev => ({
        ...prev,
        customSuppliers: updated
      }));
    }
    showToast?.(`Supplier "${supplierName}" berhasil dihapus.`, 'info');
  };

  const dynamicSuppliersList = useMemo<SupplierDef[]>(() => {
    const customDefs: SupplierDef[] = customSuppliersList.map(cs => ({
      key: cs.id,
      label: cs.name,
      ledgerKey: (cs.key || `daily_${cs.id}_ledger`) as keyof AppState,
      expenseKey: cs.id,
      icon: 'fa-truck-fast',
      color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    }));
    return [...SUPPLIERS_LIST, ...customDefs];
  }, [customSuppliersList]);

  React.useEffect(() => {
    const saved = safeStorage.getItem(budgetStorageKey);
    setCustomProcurementBudget(saved ? parseFloat(saved) || 0 : 0);
  }, [budgetStorageKey]);

  const handleSaveBudget = (val: number) => {
    setCustomProcurementBudget(val);
    safeStorage.setItem(budgetStorageKey, String(val));
    setIsEditingBudgetModal(false);
    showToast?.(`Target Budget Belanja berhasil disimpan: Rp ${val.toLocaleString('id-ID')}`, 'success');
  };

  const handleResetBudget = () => {
    setCustomProcurementBudget(0);
    safeStorage.removeItem(budgetStorageKey);
    setIsEditingBudgetModal(false);
    showToast?.('Target Budget Belanja di-reset ke Realisasi Aktual.', 'info');
  };

  // Input states
  const [inputDate, setInputDate] = useState<string>(() => {
    if (filters?.startDate) return filters.startDate;
    const now = new Date();
    if (now.getMonth() === selectedMonth && now.getFullYear() === selectedYear) {
      return toLocalDateStr(now);
    }
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  });
  const [inputSupplier, setInputSupplier] = useState<string>('tgif');
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
  const reportId = `supplier-expense-${activeOutlet}-${monthPrefix}`;

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

  // Current day supplier items across all suppliers
  const currentDayAllSupplierItems = useMemo(() => {
    const list: { supplier: SupplierDef; item: LedgerItem }[] = [];
    SUPPLIERS_LIST.forEach(sup => {
      const ledger = (data as any)[sup.ledgerKey] as Record<string, LedgerItem[]> | undefined;
      const items = (ledger && ledger[inputDate]) || [];
      items.forEach(it => {
        list.push({ supplier: sup, item: it });
      });
    });
    return list;
  }, [data, inputDate]);

  const currentDayTotal = useMemo(() => {
    return currentDayAllSupplierItems.reduce((acc, { item }) => acc + ((Number(item.qty) || 0) * (Number(item.price) || 0)), 0);
  }, [currentDayAllSupplierItems]);

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
      SUPPLIERS_LIST.forEach(sup => {
        const ledger = (st as any)[sup.ledgerKey] as Record<string, LedgerItem[]> | undefined;
        if (!ledger) return;
        Object.entries(ledger).forEach(([dStr, items]) => {
          if (!dStr.startsWith(String(selectedYear))) return;
          const mIdx = parseInt(dStr.split('-')[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12 && Array.isArray(items)) {
            items.forEach((it: any, idx: number) => {
              const uKey = `${sup.key}_${dStr}_${it.id || (it.name + '_' + idx + '_' + it.price)}`;
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

  const handleAddSupplierItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      showToast?.('Nama Barang / Produk Supplier wajib diisi!', 'error');
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

    const targetSup = SUPPLIERS_LIST.find(s => s.key === inputSupplier) || SUPPLIERS_LIST[0];
    const newItem: LedgerItem = {
      id: 'sup-' + targetSup.key + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: inputName.trim(),
      qty: qtyNum,
      price: priceNum,
      pic: inputPic.trim() || 'Purchasing / Chef',
      reason: inputReason.trim() || '-'
    };

    onUpdate((prev: AppState) => {
      const supLedgerKey = targetSup.ledgerKey;
      const currentSupLedger = ((prev as any)[supLedgerKey] || {}) as Record<string, LedgerItem[]>;
      const curList = currentSupLedger[inputDate] || [];
      const updatedSupLedger = {
        ...currentSupLedger,
        [inputDate]: [...curList, newItem]
      };

      // Sum all suppliers for this date
      let totalAllSup = 0;
      SUPPLIERS_LIST.forEach(s => {
        const ledger = s.key === targetSup.key ? updatedSupLedger : ((prev as any)[s.ledgerKey] || {});
        const items = ledger[inputDate] || [];
        totalAllSup += items.reduce((acc: number, it: LedgerItem) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      });

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
          supplierExpense: totalAllSup
        }
      };

      return {
        ...prev,
        [supLedgerKey]: updatedSupLedger,
        expenses: updatedExpenses
      };
    });

    setInputName('');
    setInputQty('1');
    setInputPrice('');
    setInputPic('');
    setInputReason('');
    showToast?.(`Item "${newItem.name}" (${targetSup.label}) berhasil ditambahkan!`, 'success');
  };

  const handleDeleteSupplierItem = (supKey: string, itemId: string, itemName: string) => {
    if (!onUpdate) return;
    const targetSup = SUPPLIERS_LIST.find(s => s.key === supKey) || SUPPLIERS_LIST[0];
    onUpdate((prev: AppState) => {
      const supLedgerKey = targetSup.ledgerKey;
      const currentSupLedger = ((prev as any)[supLedgerKey] || {}) as Record<string, LedgerItem[]>;
      const curList = currentSupLedger[inputDate] || [];
      const updatedSupLedger = {
        ...currentSupLedger,
        [inputDate]: curList.filter(it => it.id !== itemId)
      };

      let totalAllSup = 0;
      SUPPLIERS_LIST.forEach(s => {
        const ledger = s.key === targetSup.key ? updatedSupLedger : ((prev as any)[s.ledgerKey] || {});
        const items = ledger[inputDate] || [];
        totalAllSup += items.reduce((acc: number, it: LedgerItem) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
      });

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
        [supLedgerKey]: updatedSupLedger,
        expenses: {
          ...(prev.expenses || {}),
          [inputDate]: {
            ...currentDayExpenses,
            supplierExpense: totalAllSup
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
      expenses: {},
      dailyCashLedger: {},
      sales: { ...INITIAL_STATE.sales, revenue: 0, covers: 0, dailyRecording: {} }
    };
  };

  const targetOutlets = useMemo(() => {
    return isRegionalView
      ? (activeOutlet === 'ALL' || !activeOutlet ? OUTLETS : [activeOutlet as Outlet])
      : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  // Aggregate Supplier Data
  const {
    supplierSummaries,
    totalSupplierSpend,
    totalQtyAll,
    allMatrixItems,
    dailySpendChartData,
    top5Items,
    dailySpendMap,
    dailyTxMap,
    dailyItemsMap
  } = useMemo(() => {
    const supMap: Record<string, { total: number; count: number; itemsCount: number; totalQty: number }> = {};
    SUPPLIERS_LIST.forEach(s => {
      supMap[s.key] = { total: 0, count: 0, itemsCount: 0, totalQty: 0 };
    });

    const itemsMap = new Map<string, MatrixSupplierItem>();
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

      SUPPLIERS_LIST.forEach(sup => {
        const ledgerRecord = (st as any)[sup.ledgerKey] as Record<string, LedgerItem[]> || {};
        let supSpendForOutlet = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dateStr = `${monthPrefix}-${dayStr}`;
          const itemsList = ledgerRecord[dateStr] || [];
          const isInFilterRange = d >= filterStartDay && d <= filterEndDay;

          if (Array.isArray(itemsList) && itemsList.length > 0) {
            itemsList.forEach((it: any) => {
              const cleanName = (it.name || 'Item Supplier').trim();
              if (!cleanName) return;

              const qty = Number(it.qty) || 1;
              const price = Number(it.price) || 0;
              const subtotal = qty * price;

              dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + subtotal;
              dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;

              dailyItemsMap[dateStr].push({
                name: cleanName,
                qty,
                unit: it.unit || 'unit',
                price,
                amount: subtotal,
                category: sup.label
              });

              if (isInFilterRange) {
                supSpendForOutlet += subtotal;

                const mapKey = `${sup.key}:::${cleanName.toLowerCase()}`;
                if (!itemsMap.has(mapKey)) {
                  itemsMap.set(mapKey, {
                    key: mapKey,
                    name: cleanName,
                    supplierKey: sup.key,
                    supplierLabel: sup.label,
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
                      supplier: sup.label,
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
                    supplier: sup.label,
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
            const fallbackVal = Number(exp[sup.expenseKey]) || 0;
            if (fallbackVal > 0) {
              dailySpendMap[dateStr] = (dailySpendMap[dateStr] || 0) + fallbackVal;
              dailyTxMap[dateStr] = (dailyTxMap[dateStr] || 0) + 1;
              if (isInFilterRange) {
                supSpendForOutlet += fallbackVal;
              }
            }
          }
        }

        supMap[sup.key].total += supSpendForOutlet;
      });
    });

    const itemsList = Array.from(itemsMap.values());
    const totalSpend = Object.values(supMap).reduce((acc, s) => acc + s.total, 0);
    const totalQty = itemsList.reduce((acc, it) => acc + it.totalQty, 0);

    SUPPLIERS_LIST.forEach(sup => {
      const itemsInSup = itemsList.filter(it => it.supplierKey === sup.key);
      supMap[sup.key].itemsCount = itemsInSup.length;
      supMap[sup.key].count = itemsInSup.reduce((acc, it) => acc + it.txCount, 0);
      supMap[sup.key].totalQty = itemsInSup.reduce((acc, it) => acc + it.totalQty, 0);
    });

    const chartData = Object.entries(dailySpendMap).map(([dateStr, spend]) => ({
      day: dateStr.split('-')[2],
      date: dateStr,
      spend
    }));

    const top5 = [...itemsList].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

    return {
      supplierSummaries: supMap,
      totalSupplierSpend: totalSpend,
      totalQtyAll: totalQty,
      allMatrixItems: itemsList,
      dailySpendChartData: chartData,
      top5Items: top5,
      dailySpendMap,
      dailyTxMap,
      dailyItemsMap
    };
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, daysInMonth, filterStartDay, filterEndDay]);

  // Calculations for Main Kitchen (MK), Main Store (MS), Cash Supplier, and Procurement Allocation
  const procurementSummary = useMemo(() => {
    let mkSpend = 0;
    let mkCount = 0;
    let msSpend = 0;
    let msCount = 0;
    let cashSpend = 0;
    let cashCount = 0;

    targetOutlets.forEach(outletName => {
      const st = getOutletMonthState(outletName, selectedMonth, selectedYear);
      if (!st) return;

      for (let d = filterStartDay; d <= filterEndDay; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateStr = `${monthPrefix}-${dayStr}`;

        // 1. Main Kitchen (MK)
        const mkItems = (st.dailyMainKitchenLedger?.[dateStr] || []) as LedgerItem[];
        if (Array.isArray(mkItems) && mkItems.length > 0) {
          mkItems.forEach(it => {
            const sub = (Number(it.qty) || 1) * (Number(it.price) || 0);
            mkSpend += sub;
            mkCount += 1;
          });
        } else if (st.expenses?.[dateStr]?.mainKitchen) {
          const val = Number(st.expenses[dateStr].mainKitchen) || 0;
          if (val > 0) {
            mkSpend += val;
            mkCount += 1;
          }
        }

        // 2. Main Store (MS)
        const msItems = (st.dailyMainStoreLedger?.[dateStr] || []) as LedgerItem[];
        if (Array.isArray(msItems) && msItems.length > 0) {
          msItems.forEach(it => {
            const sub = (Number(it.qty) || 1) * (Number(it.price) || 0);
            msSpend += sub;
            msCount += 1;
          });
        } else if (st.expenses?.[dateStr]?.mainStore) {
          const val = Number(st.expenses[dateStr].mainStore) || 0;
          if (val > 0) {
            msSpend += val;
            msCount += 1;
          }
        }

        // 3. Cash Supplier
        const cashItems = (st.dailyCashLedger?.[dateStr] || []) as LedgerItem[];
        if (Array.isArray(cashItems) && cashItems.length > 0) {
          cashItems.forEach(it => {
            const sub = (Number(it.qty) || 1) * (Number(it.price) || 0);
            cashSpend += sub;
            cashCount += 1;
          });
        } else if (st.expenses?.[dateStr]?.cash) {
          const val = Number(st.expenses[dateStr].cash) || 0;
          if (val > 0) {
            cashSpend += val;
            cashCount += 1;
          }
        }
      }
    });

    const recordedDaysCount = Math.max(1, (filterEndDay - filterStartDay + 1));
    const totalProcurementSpend = totalSupplierSpend + mkSpend + msSpend + cashSpend;
    const effectiveBudget = customProcurementBudget > 0 ? customProcurementBudget : totalProcurementSpend;

    // Supplier category details with averages and allocations
    const supplierDetails = SUPPLIERS_LIST.map(sup => {
      const sData = supplierSummaries[sup.key] || { total: 0, itemsCount: 0, count: 0, totalQty: 0 };
      const spend = sData.total;
      const tx = sData.count;
      const avgDay = spend / recordedDaysCount;
      const avgTx = tx > 0 ? spend / tx : 0;
      const pctOfSupplier = totalSupplierSpend > 0 ? (spend / totalSupplierSpend) * 100 : 0;
      const pctOfTotalBudget = totalProcurementSpend > 0 ? (spend / totalProcurementSpend) * 100 : 0;
      const pctOfTargetBudget = customProcurementBudget > 0 ? (spend / customProcurementBudget) * 100 : pctOfTotalBudget;

      return {
        ...sup,
        spend,
        txCount: tx,
        itemsCount: sData.itemsCount,
        totalQty: sData.totalQty,
        avgPerDay: avgDay,
        avgPerTx: avgTx,
        pctOfSupplier,
        pctOfTotalBudget,
        pctOfTargetBudget
      };
    });

    const mkAvgPerDay = mkSpend / recordedDaysCount;
    const mkAvgPerTx = mkCount > 0 ? mkSpend / mkCount : 0;
    const mkPercent = totalProcurementSpend > 0 ? (mkSpend / totalProcurementSpend) * 100 : 0;
    const mkTargetPercent = customProcurementBudget > 0 ? (mkSpend / customProcurementBudget) * 100 : mkPercent;

    const msAvgPerDay = msSpend / recordedDaysCount;
    const msAvgPerTx = msCount > 0 ? msSpend / msCount : 0;
    const msPercent = totalProcurementSpend > 0 ? (msSpend / totalProcurementSpend) * 100 : 0;
    const msTargetPercent = customProcurementBudget > 0 ? (msSpend / customProcurementBudget) * 100 : msPercent;

    const cashAvgPerDay = cashSpend / recordedDaysCount;
    const cashAvgPerTx = cashCount > 0 ? cashSpend / cashCount : 0;
    const cashPercent = totalProcurementSpend > 0 ? (cashSpend / totalProcurementSpend) * 100 : 0;
    const cashTargetPercent = customProcurementBudget > 0 ? (cashSpend / customProcurementBudget) * 100 : cashPercent;

    const supplierPercent = totalProcurementSpend > 0 ? (totalSupplierSpend / totalProcurementSpend) * 100 : 0;
    const supplierTargetPercent = customProcurementBudget > 0 ? (totalSupplierSpend / customProcurementBudget) * 100 : supplierPercent;

    const totalTxAll = supplierDetails.reduce((a, b) => a + b.txCount, 0) + mkCount + msCount + cashCount;
    const totalAvgPerDay = totalProcurementSpend / recordedDaysCount;
    const totalAvgPerTx = totalTxAll > 0 ? totalProcurementSpend / totalTxAll : 0;

    return {
      mkSpend,
      mkCount,
      mkAvgPerDay,
      mkAvgPerTx,
      mkPercent,
      mkTargetPercent,

      msSpend,
      msCount,
      msAvgPerDay,
      msAvgPerTx,
      msPercent,
      msTargetPercent,

      cashSpend,
      cashCount,
      cashAvgPerDay,
      cashAvgPerTx,
      cashPercent,
      cashTargetPercent,

      totalSupplierSpend,
      supplierPercent,
      supplierTargetPercent,

      totalProcurementSpend,
      customProcurementBudget,
      effectiveBudget,
      recordedDaysCount,
      supplierDetails,
      totalTxAll,
      totalAvgPerDay,
      totalAvgPerTx
    };
  }, [
    targetOutlets,
    selectedMonth,
    selectedYear,
    monthPrefix,
    filterStartDay,
    filterEndDay,
    totalSupplierSpend,
    supplierSummaries,
    customProcurementBudget
  ]);

  // Last Month calculations
  const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const lastMonthName = MONTH_NAMES[lastMonthIdx];
  const lastMonthPrefix = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, '0')}`;
  const daysInLastMonth = new Date(lastMonthYear, lastMonthIdx + 1, 0).getDate();

  // Current Month MTD Revenue (Filtered by date range)
  const currentMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, selectedMonth, selectedYear);
      return sum + extractStateMtdRevenue(st, monthPrefix, filterStartDay, filterEndDay);
    }, 0);
  }, [targetOutlets, selectedMonth, selectedYear, monthPrefix, filterStartDay, filterEndDay, data, allMonthlyData]);

  // Last Month MTD Revenue (Filtered by date range)
  const lastMonthMtdRevenue = useMemo(() => {
    return targetOutlets.reduce((sum, o) => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      return sum + extractStateMtdRevenue(st, lastMonthPrefix, filterStartDay, Math.min(filterEndDay, daysInLastMonth));
    }, 0);
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, filterStartDay, filterEndDay, daysInLastMonth, allMonthlyData]);

  // Last Month Spend for Suppliers & Quantities (Filtered by date range)
  const { lastMonthSpend, lastMonthSupplierSpend, lastMonthSupplierQuantities, lastMonthItemsMap } = useMemo(() => {
    let total = 0;
    const supLastMap: Record<string, number> = {};
    const supLastQty: Record<string, number> = {};
    const lmItems = new Map<string, { name: string; supplierKey: string; qty: number; spend: number }>();
    const maxDayForLm = Math.min(filterEndDay, daysInLastMonth);

    SUPPLIERS_LIST.forEach(s => {
      supLastMap[s.key] = 0;
      supLastQty[s.key] = 0;
    });

    targetOutlets.forEach(o => {
      const st = getOutletMonthState(o, lastMonthIdx, lastMonthYear);
      if (!st) return;

      SUPPLIERS_LIST.forEach(sup => {
        const ledgerRecord = (st as any)[sup.ledgerKey] as Record<string, LedgerItem[]> || {};
        for (let d = filterStartDay; d <= maxDayForLm; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dStr = `${lastMonthPrefix}-${dayStr}`;
          const items = ledgerRecord[dStr] || [];
          if (Array.isArray(items) && items.length > 0) {
            items.forEach((it: any) => {
              const qty = Number(it.qty) || 1;
              const amt = qty * (Number(it.price) || 0);
              total += amt;
              supLastMap[sup.key] = (supLastMap[sup.key] || 0) + amt;
              supLastQty[sup.key] = (supLastQty[sup.key] || 0) + qty;

              const cleanName = (it.name || '').trim();
              if (cleanName) {
                const k = `${sup.key}:::${cleanName.toLowerCase()}`;
                const ex = lmItems.get(k);
                if (ex) {
                  ex.qty += qty;
                  ex.spend += amt;
                } else {
                  lmItems.set(k, { name: cleanName, supplierKey: sup.key, qty, spend: amt });
                }
              }
            });
          } else if (st.expenses && st.expenses[dStr]) {
            const exp = st.expenses[dStr] as any;
            const fallbackVal = Number(exp[sup.expenseKey]) || 0;
            if (fallbackVal > 0) {
              total += fallbackVal;
              supLastMap[sup.key] = (supLastMap[sup.key] || 0) + fallbackVal;
            }
          }
        }
      });
    });

    return {
      lastMonthSpend: total,
      lastMonthSupplierSpend: supLastMap,
      lastMonthSupplierQuantities: supLastQty,
      lastMonthItemsMap: lmItems
    };
  }, [targetOutlets, lastMonthIdx, lastMonthYear, lastMonthPrefix, daysInLastMonth, filterStartDay, filterEndDay, allMonthlyData]);

  // Daily matrix for sidebar
  const dailyMatrix = useMemo(() => {
    return buildDailyMatrix(selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap);
  }, [selectedYear, selectedMonth, dailySpendMap, dailyTxMap, dailyItemsMap]);

  // Category Variances (Per Supplier Breakdown) for Sidebar
  const categoryVariances = useMemo(() => {
    return SUPPLIERS_LIST.map(sup => {
      const curSpend = supplierSummaries[sup.key]?.total || 0;
      const prevSpend = lastMonthSupplierSpend[sup.key] || 0;
      return {
        key: sup.key,
        label: sup.label,
        currentSpend: curSpend,
        lastMonthSpend: prevSpend,
        currentQty: supplierSummaries[sup.key]?.totalQty || 0,
        lastMonthQty: lastMonthSupplierQuantities[sup.key] || 0,
        qtyUnit: 'unit'
      };
    });
  }, [supplierSummaries, lastMonthSupplierSpend, lastMonthSupplierQuantities]);

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
        qtyUnit: 'unit'
      });
    });
    return list.sort((a, b) => b.currentSpend - a.currentSpend).slice(0, 20);
  }, [allMatrixItems, lastMonthItemsMap]);

  // Popular items filtered to selected input supplier only (from recorded items)
  const popularItemsForInputSupplier = useMemo(() => {
    const recordedInSup = allMatrixItems
      .filter(it => it.supplierKey === inputSupplier)
      .sort((a, b) => b.txCount - a.txCount)
      .map(it => it.name);

    return Array.from(new Set(recordedInSup)).slice(0, 12);
  }, [allMatrixItems, inputSupplier]);

  // Filter & Sort
  const filteredMatrixItems = useMemo(() => {
    let list = [...allMatrixItems];

    if (activeSupplierFilter !== 'ALL') {
      list = list.filter(it => it.supplierKey === activeSupplierFilter);
    }

    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(it => 
        it.name.toLowerCase().includes(q) || 
        it.supplierLabel.toLowerCase().includes(q) ||
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
  }, [allMatrixItems, activeSupplierFilter, matrixSearch, matrixSortBy]);

  // Monthly states for full tanggal recap table
  const recapMonthlyStates = useMemo(() => {
    return targetOutlets.map(o => getOutletMonthState(o, selectedMonth, selectedYear)).filter(Boolean);
  }, [targetOutlets, selectedMonth, selectedYear, data, allMonthlyData]);

  // Columns for 7 suppliers + optional MK, MS, Cash Supplier
  const recapColumns: RecapColumnDef[] = useMemo(() => {
    const cols: RecapColumnDef[] = SUPPLIERS_LIST.map(sup => ({
      id: sup.key,
      label: sup.label,
      shortLabel: sup.label.toUpperCase(),
      getValue: (st, dStr) => {
        const list = ((st as any)[sup.ledgerKey]?.[dStr] || []) as LedgerItem[];
        const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        return sum > 0 ? sum : (Number((st.expenses?.[dStr] as any)?.[sup.expenseKey]) || 0);
      }
    }));

    if (includeProcurementChannelsInRecap) {
      cols.push(
        {
          id: 'mainKitchen',
          label: 'Main Kitchen (MK)',
          shortLabel: 'MK',
          colorClass: 'text-amber-400',
          getValue: (st, dStr) => {
            const list = (st.dailyMainKitchenLedger?.[dStr] || []) as LedgerItem[];
            const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
            return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.mainKitchen) || 0);
          }
        },
        {
          id: 'mainStore',
          label: 'Main Store (MS)',
          shortLabel: 'MS',
          colorClass: 'text-indigo-400',
          getValue: (st, dStr) => {
            const list = (st.dailyMainStoreLedger?.[dStr] || []) as LedgerItem[];
            const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
            return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.mainStore) || 0);
          }
        },
        {
          id: 'cashSupplier',
          label: 'Cash Supplier',
          shortLabel: 'CASH',
          colorClass: 'text-emerald-400',
          getValue: (st, dStr) => {
            const list = (st.dailyCashLedger?.[dStr] || []) as LedgerItem[];
            const sum = list.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
            return sum > 0 ? sum : (Number(st.expenses?.[dStr]?.cash) || 0);
          }
        }
      );
    }

    return cols;
  }, [includeProcurementChannelsInRecap]);

  // Detail items callback for day popup in full tanggal table
  const getDetailItemsForDay = (dateStr: string, states: AppState[]): DayDetailItem[] => {
    const list: DayDetailItem[] = [];
    states.forEach(st => {
      const outName = st.outlet || activeOutlet;
      SUPPLIERS_LIST.forEach(sup => {
        const items = (((st as any)[sup.ledgerKey]?.[dateStr]) || []) as LedgerItem[];
        items.forEach(it => {
          list.push({
            id: it.id,
            outlet: outName,
            category: sup.label,
            name: it.name,
            qty: it.qty,
            price: it.price,
            subtotal: (it.qty || 1) * (it.price || 0),
            reason: it.reason,
            pic: it.pic
          });
        });
      });

      if (includeProcurementChannelsInRecap) {
        const mkItems = (st.dailyMainKitchenLedger?.[dateStr] || []) as LedgerItem[];
        mkItems.forEach(it => {
          list.push({
            id: it.id,
            outlet: outName,
            category: 'Main Kitchen (MK)',
            name: it.name,
            qty: it.qty,
            price: it.price,
            subtotal: (it.qty || 1) * (it.price || 0),
            reason: it.reason,
            pic: it.pic
          });
        });

        const msItems = (st.dailyMainStoreLedger?.[dateStr] || []) as LedgerItem[];
        msItems.forEach(it => {
          list.push({
            id: it.id,
            outlet: outName,
            category: 'Main Store (MS)',
            name: it.name,
            qty: it.qty,
            price: it.price,
            subtotal: (it.qty || 1) * (it.price || 0),
            reason: it.reason,
            pic: it.pic
          });
        });

        const cashItems = (st.dailyCashLedger?.[dateStr] || []) as LedgerItem[];
        cashItems.forEach(it => {
          list.push({
            id: it.id,
            outlet: outName,
            category: 'Cash Supplier',
            name: it.name,
            qty: it.qty,
            price: it.price,
            subtotal: (it.qty || 1) * (it.price || 0),
            reason: it.reason,
            pic: it.pic
          });
        });
      }
    });
    return list;
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus App';
      workbook.created = new Date();

      // Sheet 1: ALOKASI_BUDGET_BELANJA (MK, MS, Cash, Supplier)
      const alokasiSheet = workbook.addWorksheet('ALOKASI_BUDGET_BELANJA');
      alokasiSheet.addRow([`LAPORAN ALOKASI BUDGET BELANJA PENGADAAN (MK, MS, CASH & REKANAN SUPPLIER)`]);
      alokasiSheet.addRow([`Outlet: ${activeOutlet} | Periode: ${monthName} ${selectedYear}`]);
      alokasiSheet.addRow([`Total Budget Belanja Pengadaan: Rp ${procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}`]);
      alokasiSheet.addRow([]);

      alokasiSheet.addRow([
        'No', 
        'Jalur / Kategori Belanja', 
        'Total Belanja (Rp)', 
        'Frekuensi PO / Trx', 
        'Rata-rata/Hari (Rp)', 
        'Rata-rata/PO (Rp)', 
        '% Alokasi thd Total Supplier', 
        '% Alokasi thd Total Budget Belanja'
      ]);

      procurementSummary.supplierDetails.forEach((sup, idx) => {
        alokasiSheet.addRow([
          idx + 1,
          sup.label,
          sup.spend,
          sup.txCount,
          Math.round(sup.avgPerDay),
          Math.round(sup.avgPerTx),
          `${sup.pctOfSupplier.toFixed(2)}%`,
          `${sup.pctOfTotalBudget.toFixed(2)}%`
        ]);
      });

      alokasiSheet.addRow([
        '-',
        'SUBTOTAL SUPPLIER REKANAN (7 SUPPLIER)',
        procurementSummary.totalSupplierSpend,
        procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0),
        Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount),
        Math.round(procurementSummary.totalSupplierSpend / Math.max(1, procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0))),
        '100.00%',
        `${procurementSummary.supplierPercent.toFixed(2)}%`
      ]);

      alokasiSheet.addRow([
        '8',
        'MAIN KITCHEN (MK)',
        procurementSummary.mkSpend,
        procurementSummary.mkCount,
        Math.round(procurementSummary.mkAvgPerDay),
        Math.round(procurementSummary.mkAvgPerTx),
        '-',
        `${procurementSummary.mkPercent.toFixed(2)}%`
      ]);

      alokasiSheet.addRow([
        '9',
        'MAIN STORE (MS)',
        procurementSummary.msSpend,
        procurementSummary.msCount,
        Math.round(procurementSummary.msAvgPerDay),
        Math.round(procurementSummary.msAvgPerTx),
        '-',
        `${procurementSummary.msPercent.toFixed(2)}%`
      ]);

      alokasiSheet.addRow([
        '10',
        'CASH SUPPLIER (PASAR & RETAIL FOOD)',
        procurementSummary.cashSpend,
        procurementSummary.cashCount,
        Math.round(procurementSummary.cashAvgPerDay),
        Math.round(procurementSummary.cashAvgPerTx),
        '-',
        `${procurementSummary.cashPercent.toFixed(2)}%`
      ]);

      alokasiSheet.addRow([
        'TOTAL',
        'GRAND TOTAL BUDGET BELANJA PENGADAAN (MK, MS, CASH & SUPPLIER)',
        procurementSummary.totalProcurementSpend,
        procurementSummary.totalTxAll,
        Math.round(procurementSummary.totalAvgPerDay),
        Math.round(procurementSummary.totalAvgPerTx),
        '-',
        '100.00%'
      ]);

      alokasiSheet.addRow([]);

      // Sheet 2: REKAP_SUPPLIER
      const supSheet = workbook.addWorksheet('REKAP_SUPPLIER');
      supSheet.addRow([`LAPORAN BELANJA SUPPLIER - ${activeOutlet}`]);
      supSheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      supSheet.addRow([`Total Pengeluaran: Rp ${totalSupplierSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`]);
      supSheet.addRow([]);

      supSheet.addRow(['No', 'Nama Rekanan / Supplier', 'Jumlah Item', 'Frekuensi Transaksi', 'Total Belanja (Rp)', 'Rata-rata/Hari (Rp)', 'Rata-rata/PO (Rp)', '% Kontribusi Supplier', '% Alokasi Total Budget']);
      procurementSummary.supplierDetails.forEach((sup, idx) => {
        supSheet.addRow([
          idx + 1,
          sup.label,
          sup.itemsCount,
          sup.txCount,
          sup.spend,
          Math.round(sup.avgPerDay),
          Math.round(sup.avgPerTx),
          `${sup.pctOfSupplier.toFixed(2)}%`,
          `${sup.pctOfTotalBudget.toFixed(2)}%`
        ]);
      });

      // Sheet 3: MATRIX_ITEM_SUPPLIER
      const matrixSheet = workbook.addWorksheet('MATRIX_ITEM_SUPPLIER');
      matrixSheet.addRow([`MATRIX DETAIL ITEM SUPPLIER - ${activeOutlet}`]);
      matrixSheet.addRow([`Periode: ${monthName} ${selectedYear}`]);
      matrixSheet.addRow([]);

      const pivotCols = isRegionalView && (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet];
      matrixSheet.addRow(['No', 'Nama Item', 'Supplier', 'Total Qty', 'Harga Rata-rata (Rp)', 'Min Harga (Rp)', 'Max Harga (Rp)', 'Total Belanja (Rp)', '% Share', ...pivotCols.map(o => `Spend ${o}`)]);

      filteredMatrixItems.forEach((it, idx) => {
        const share = totalSupplierSpend > 0 ? (it.totalSpend / totalSupplierSpend) * 100 : 0;
        matrixSheet.addRow([
          idx + 1,
          it.name,
          it.supplierLabel,
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
      saveAs(blob, `Supplier_Expense_Alokasi_Budget_${activeOutlet}_${monthPrefix}.xlsx`);
      showToast?.('Berhasil mengunduh Laporan Excel Alokasi Budget Supplier!', 'success');
    } catch (err) {
      showToast?.('Gagal mengunduh Excel.', 'error');
    }
  };

  // Copy WhatsApp Summary matching strict user template + Procurement Allocation Breakdown
  const handleCopyWhatsApp = (selectedSupplierKey?: string) => {
    const supsToInclude = selectedSupplierKey && selectedSupplierKey !== 'ALL'
      ? SUPPLIERS_LIST.filter(s => s.key === selectedSupplierKey)
      : SUPPLIERS_LIST;

    const categories = supsToInclude.map(sup => {
      const itemsInSup = allMatrixItems.filter(i => i.supplierKey === sup.key);
      return {
        categoryName: sup.label,
        totalSpend: supplierSummaries[sup.key]?.total || 0,
        items: itemsInSup.map(it => ({
          name: it.name,
          qty: it.totalQty,
          unit: 'unit',
          totalSpend: it.totalSpend,
          avgPrice: it.avgPrice
        }))
      };
    });

    const spendToCompare = selectedSupplierKey && selectedSupplierKey !== 'ALL'
      ? (supplierSummaries[selectedSupplierKey]?.total || 0)
      : totalSupplierSpend;

    const lmSpendToCompare = selectedSupplierKey && selectedSupplierKey !== 'ALL'
      ? (lastMonthSupplierSpend[selectedSupplierKey] || 0)
      : lastMonthSpend;

    let text = generateWhatsAppExpenseText({
      title: 'REKAP SUPPLIER EXPENSE & ALOKASI BUDGET BELANJA',
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

    // Append Alokasi Budget Belanja Pengadaan (MK, MS, Cash, Supplier) & Rata-rata Supplier
    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*ALOKASI BUDGET BELANJA PENGADAAN (Tgl ${filterStartDay}-${filterEndDay} ${monthName}):*\n`;
    text += `• *TOTAL BUDGET BELANJA*: Rp ${procurementSummary.totalProcurementSpend.toLocaleString('id-ID')} (100%)\n`;
    text += `  ├─ *Main Kitchen (MK)*: Rp ${procurementSummary.mkSpend.toLocaleString('id-ID')} (${procurementSummary.mkPercent.toFixed(1)}% | Rata2: Rp ${Math.round(procurementSummary.mkAvgPerDay).toLocaleString('id-ID')}/hari)\n`;
    text += `  ├─ *Main Store (MS)*: Rp ${procurementSummary.msSpend.toLocaleString('id-ID')} (${procurementSummary.msPercent.toFixed(1)}% | Rata2: Rp ${Math.round(procurementSummary.msAvgPerDay).toLocaleString('id-ID')}/hari)\n`;
    text += `  ├─ *Cash Supplier*: Rp ${procurementSummary.cashSpend.toLocaleString('id-ID')} (${procurementSummary.cashPercent.toFixed(1)}% | Rata2: Rp ${Math.round(procurementSummary.cashAvgPerDay).toLocaleString('id-ID')}/hari)\n`;
    text += `  └─ *Rekanan Supplier (7 Mitra)*: Rp ${procurementSummary.totalSupplierSpend.toLocaleString('id-ID')} (${procurementSummary.supplierPercent.toFixed(1)}%)\n\n`;
    
    text += `*RATA-RATA & ALOKASI KATEGORI SUPPLIER:*\n`;
    procurementSummary.supplierDetails.forEach((sup, idx) => {
      text += `${idx + 1}. *${sup.label}*:\n`;
      text += `   • Total Belanja: Rp ${sup.spend.toLocaleString('id-ID')}\n`;
      text += `   • Rata-rata/Hari: Rp ${Math.round(sup.avgPerDay).toLocaleString('id-ID')}/hari (${sup.txCount} PO)\n`;
      text += `   • Rata-rata/PO: Rp ${Math.round(sup.avgPerTx).toLocaleString('id-ID')}/PO\n`;
      text += `   • % Alokasi thd Supplier: ${sup.pctOfSupplier.toFixed(1)}%\n`;
      text += `   • % Alokasi thd Budget Belanja (MK,MS,Cash,Sup): *${sup.pctOfTotalBudget.toFixed(1)}%*\n`;
    });

    navigator.clipboard.writeText(text);
    showToast?.(`Rekap WA Supplier & Alokasi Budget Tgl ${filterStartDay} - ${filterEndDay} ${monthName} disalin!`, 'success');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-200">
      {/* HEADER BAR */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/40">
              <i className="fas fa-truck-loading text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                Supplier Expense
              </h2>
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mt-0.5">
                Monitoring Khusus Belanja Rekanan Supplier & Purchasing Matrix
              </p>
            </div>
          </div>
        </div>

        {/* Actions & Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRegionalView && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 shadow-sm">
              <i className="fas fa-store text-rose-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{activeOutlet}</span>
              </div>
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-950 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-rose-500 cursor-pointer"
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
          <button
            type="button"
            onClick={() => setShowAddSupplierModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-indigo-400/30"
            title="Tambah Rekanan Supplier Baru"
          >
            <i className="fas fa-plus"></i> Tambah Supplier
          </button>
          <ShareActions 
            targetId={reportId} 
            title={`Supplier Expense - ${activeOutlet} (${monthName} ${selectedYear})`}
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
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
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
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {outlet}
            </button>
          ))}
        </div>
      )}

      {/* UNIVERSAL DATE RANGE FILTER BAR */}
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
        title="Filter Tanggal Rekap Belanja Supplier"
        accentColor="rose"
        onCopyWhatsApp={() => handleCopyWhatsApp()}
        whatsAppButtonLabel="Salin WA (Tgl 1 - 25)"
      />

      {/* MAIN LAYOUT WITH MONTHLY SIDEBAR ON RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {/* NAVIGATION TABS */}
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-900/80 p-2 rounded-2xl border border-white/10 w-fit no-print">
            <button
              onClick={() => setModuleTab('INPUT')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'INPUT'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-edit"></i> Input Belanja Supplier
            </button>
            <button
              onClick={() => {
                if (onNavigateToCogs) {
                  onNavigateToCogs();
                } else {
                  setModuleTab('ALOKASI_BUDGET');
                }
              }}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'ALOKASI_BUDGET'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
              }`}
              title="Fitur ini terhubung ke Fitur COGS"
            >
              <i className="fas fa-chart-pie"></i> Alokasi Budget Belanja (MK, MS, Cash, Supplier)
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 font-bold text-emerald-300">
                Terhubung COGS ↗
              </span>
            </button>
            <button
              onClick={() => setModuleTab('MATRIX')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                moduleTab === 'MATRIX'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
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
                themeColor="rose"
                spendLabel="Total Belanja Supplier"
                totalSpend={totalSupplierSpend}
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

              {/* QUICK-GLANCE: RATA-RATA BELANJA & ALOKASI BUDGET PENGADAAN (MK, MS, CASH & SUPPLIER) */}
              <div className="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 border border-rose-500/20 rounded-3xl shadow-xl space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-black">
                      <i className="fas fa-chart-pie"></i>
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Rata-rata Belanja Masing-masing Kategori & Alokasi Budget Pengadaan
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Total Budget Belanja Pengadaan (Tgl {filterStartDay}-{filterEndDay} {monthName}): <strong className="text-white font-mono">Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}</strong> (Rata2: <strong className="text-rose-400 font-mono">Rp {Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}/hari</strong>)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModuleTab('ALOKASI_BUDGET')}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-black uppercase tracking-wider transition-all border border-rose-500/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Analisis Alokasi Lengkap</span>
                    <i className="fas fa-arrow-right text-[10px]"></i>
                  </button>
                </div>

                {/* 4 Category Summary Pills */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                  {/* MK */}
                  <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-amber-500/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span> Main Kitchen (MK)
                      </span>
                      <span className="font-mono font-black text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded">
                        {procurementSummary.mkPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-baseline">
                      <span className="text-sm font-black font-mono text-white">
                        Rp {procurementSummary.mkSpend.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Rata2: <strong className="text-amber-300 font-mono">Rp {Math.round(procurementSummary.mkAvgPerDay).toLocaleString('id-ID')}/hari</strong> ({procurementSummary.mkCount} PO)
                    </span>
                  </div>

                  {/* MS */}
                  <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-indigo-500/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-indigo-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Main Store (MS)
                      </span>
                      <span className="font-mono font-black text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                        {procurementSummary.msPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-baseline">
                      <span className="text-sm font-black font-mono text-white">
                        Rp {procurementSummary.msSpend.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Rata2: <strong className="text-indigo-300 font-mono">Rp {Math.round(procurementSummary.msAvgPerDay).toLocaleString('id-ID')}/hari</strong> ({procurementSummary.msCount} PO)
                    </span>
                  </div>

                  {/* Cash */}
                  <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-emerald-500/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Cash Supplier
                      </span>
                      <span className="font-mono font-black text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                        {procurementSummary.cashPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-baseline">
                      <span className="text-sm font-black font-mono text-white">
                        Rp {procurementSummary.cashSpend.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Rata2: <strong className="text-emerald-300 font-mono">Rp {Math.round(procurementSummary.cashAvgPerDay).toLocaleString('id-ID')}/hari</strong> ({procurementSummary.cashCount} PO)
                    </span>
                  </div>

                  {/* Rekanan Supplier (7 Mitra) */}
                  <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-rose-500/30 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span> Rekanan Supplier
                      </span>
                      <span className="font-mono font-black text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">
                        {procurementSummary.supplierPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between items-baseline">
                      <span className="text-sm font-black font-mono text-rose-400">
                        Rp {procurementSummary.totalSupplierSpend.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Rata2: <strong className="text-rose-300 font-mono">Rp {Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount).toLocaleString('id-ID')}/hari</strong> ({procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0)} PO)
                    </span>
                  </div>
                </div>

                {/* 7 Suppliers Mini Allocation Chips */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                    Alokasi thd Budget Belanja:
                  </span>
                  {procurementSummary.supplierDetails.map(sup => (
                    <div
                      key={sup.key}
                      className="px-2 py-0.5 rounded-lg bg-slate-950/90 border border-white/5 text-[10px] flex items-center gap-1.5"
                    >
                      <span className="font-bold text-white">{sup.label}:</span>
                      <span className="text-rose-400 font-mono font-black">{sup.pctOfTotalBudget.toFixed(1)}%</span>
                      <span className="text-slate-500 font-mono">({Math.round(sup.avgPerDay / 1000)}rb/hr)</span>
                    </div>
                  ))}
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
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Penerimaan:</span>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-rose-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Hari Ini ({inputDate}):</span>
                    <span className="text-lg font-black font-mono text-rose-400">
                      Rp {currentDayTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast?.(`Data Supplier tanggal ${inputDate} tersimpan otomatis!`, 'success')}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <i className="fas fa-save"></i> Submit Data Supplier
                  </button>
                </div>
              </div>

              {/* INPUT FORM CARD */}
              <div className="glass-card p-6 bg-slate-900/90 border border-rose-500/30 rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-plus-circle text-rose-400"></i>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Form Input Belanja Rekanan Supplier
                    </h3>
                  </div>

                  {/* Supplier Pills Selector */}
                  <div className="flex flex-wrap gap-1.5">
                    {SUPPLIERS_LIST.map(sup => (
                      <button
                        key={sup.key}
                        type="button"
                        onClick={() => setInputSupplier(sup.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                          inputSupplier === sup.key
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                        }`}
                      >
                        <i className={`fas ${sup.icon} text-[10px]`}></i> {sup.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Suggested Chips (Only if recorded items exist) */}
                {popularItemsForInputSupplier.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      Item Populer Rekanan ({SUPPLIERS_LIST.find(s => s.key === inputSupplier)?.label}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {popularItemsForInputSupplier.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setInputName(item)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                        >
                          + {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleAddSupplierItem} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Nama Barang / Bahan *
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Daging Sirloin, Susu UHT..."
                      value={inputName}
                      onChange={e => setInputName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-600 outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Jumlah (Qty / Kg / Pcs)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      placeholder="1"
                      value={inputQty}
                      onChange={e => setInputQty(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:border-rose-500"
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
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-rose-400 font-mono font-bold outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      PIC Penerima / Chef
                    </label>
                    <input
                      type="text"
                      placeholder="Nama Receiving / Chef"
                      value={inputPic}
                      onChange={e => setInputPic(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      No. SJ / Invoice
                    </label>
                    <input
                      type="text"
                      placeholder="SJ-9876..."
                      value={inputReason}
                      onChange={e => setInputReason(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="md:col-span-12 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 cursor-pointer"
                    >
                      <i className="fas fa-plus"></i> Tambah Item ({SUPPLIERS_LIST.find(s => s.key === inputSupplier)?.label})
                    </button>
                  </div>
                </form>

                <FeatureSubmitSyncButton
                  featureName="Supplier Expense"
                  subtext={`Klik setelah selesai input belanja supplier tanggal ${inputDate} agar data langsung tersinkronkan ke seluruh user.`}
                  className="mt-4"
                />
              </div>

              {/* LIST OF TODAY'S TRANSACTIONS */}
              <div className="glass-card p-5 bg-slate-900/90 border border-rose-500/20 rounded-3xl shadow-xl space-y-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-truck-loading text-rose-400"></i>
                    <h4 className="text-xs font-black uppercase tracking-wider text-white">Item Supplier Diterima ({inputDate})</h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-400">
                    Total: Rp {currentDayTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {currentDayAllSupplierItems.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                    <p className="text-[11px] text-slate-500">Tidak ada pengeluaran Supplier untuk hari ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[9px]">
                          <th className="py-2 px-3">Supplier</th>
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-3 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Harga</th>
                          <th className="py-2 px-3 text-right font-black">Subtotal</th>
                          <th className="py-2 px-3">PIC / No. SJ</th>
                          <th className="py-2 px-3 text-center w-12">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                        {currentDayAllSupplierItems.map(({ supplier, item: it }, idx: number) => {
                          const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
                          return (
                            <tr key={it.id || idx} className="hover:bg-white/5">
                              <td className="py-2 px-3 font-sans">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${supplier.color}`}>
                                  {supplier.label}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[150px]">{it.name}</td>
                              <td className="py-2 px-3 text-center text-slate-300">{it.qty}</td>
                              <td className="py-2 px-3 text-right text-slate-400">Rp {(Number(it.price) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="py-2 px-3 text-right font-black text-rose-400">Rp {sub.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                              <td className="py-2 px-3 font-sans text-slate-400 text-[10px]">{it.pic} {it.reason && it.reason !== '-' ? `• ${it.reason}` : ''}</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSupplierItem(supplier.key, it.id, it.name)}
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

          {moduleTab === 'ALOKASI_BUDGET' && (
            <div className="space-y-6 animate-fade-in">
              {/* BANNER NOTIFIKASI: TELAH DIHUBUNGKAN KE FITUR COGS */}
              <div className="p-4 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/60 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg flex-shrink-0">
                    <i className="fas fa-link"></i>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-emerald-300 uppercase tracking-wide">
                      Alokasi Budget Belanja Terhubung Langsung ke Fitur COGS
                    </h4>
                    <p className="text-xs text-slate-300">
                      Alokasi Budget Belanja Pengadaan (MK, MS, Cash & Rekanan Supplier) kini disinkronkan dan terintegrasi dengan Target COGS, Sisa Budget Belanja & Kontrol Forecast di menu COGS.
                    </p>
                  </div>
                </div>
                {onNavigateToCogs && (
                  <button
                    onClick={onNavigateToCogs}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/30 flex-shrink-0 cursor-pointer"
                  >
                    <span>Buka di Menu COGS</span>
                    <i className="fas fa-arrow-right"></i>
                  </button>
                )}
              </div>

              {/* HEADER ALOKASI BUDGET */}
              <div className="glass-card p-6 bg-slate-900/90 border border-rose-500/20 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-sm font-black">
                      <i className="fas fa-chart-pie"></i>
                    </span>
                    <h3 className="text-base font-black text-white uppercase tracking-wider">
                      Alokasi Budget Belanja Pengadaan (MK, MS, Cash & Supplier)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Rata-rata pengeluaran masing-masing kategori supplier & porsi alokasi terhadap total budget belanja operasional ({monthName} {selectedYear} · {activeOutlet})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setInputBudgetValue(procurementSummary.customProcurementBudget > 0 ? String(procurementSummary.customProcurementBudget) : '');
                      setIsEditingBudgetModal(true);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                  >
                    <i className="fas fa-bullseye text-rose-400"></i>
                    {procurementSummary.customProcurementBudget > 0 ? `Target: Rp ${procurementSummary.customProcurementBudget.toLocaleString('id-ID')}` : 'Set Target Budget'}
                  </button>
                  <button
                    onClick={() => handleCopyWhatsApp()}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
                  >
                    <i className="fab fa-whatsapp"></i> Salin WA Alokasi
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
                  >
                    <i className="fas fa-file-excel"></i> Excel
                  </button>
                </div>
              </div>

              {/* 4 MAJOR PROCUREMENT BUDGET KPI CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. TOTAL BUDGET BELANJA PENGADAAN */}
                <div className="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/40 border border-rose-500/30 rounded-3xl shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        Total Budget Belanja
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                        100%
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-white">
                      Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gabungan MK + MS + Cash + 7 Supplier
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-300">
                      <span>Rata-rata/Hari:</span>
                      <span className="font-mono font-bold text-white">
                        Rp {Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Total Transaksi / PO:</span>
                      <span className="font-mono">{procurementSummary.totalTxAll} entri ({procurementSummary.recordedDaysCount} hari)</span>
                    </div>
                  </div>
                </div>

                {/* 2. REKANAN SUPPLIER (7 MITRA) */}
                <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Total Rekanan Supplier
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-black">
                        {procurementSummary.supplierPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-rose-400">
                      Rp {procurementSummary.totalSupplierSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      TGIF, Sukanda, Everest, Ikigai, dll
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-300">
                      <span>Rata-rata/Hari:</span>
                      <span className="font-mono font-bold text-white">
                        Rp {Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Porsi thd Budget:</span>
                      <span className="font-mono font-bold text-rose-400">{procurementSummary.supplierPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* 3. MAIN KITCHEN (MK) */}
                <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Main Kitchen (MK)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-black">
                        {procurementSummary.mkPercent.toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-amber-400">
                      Rp {procurementSummary.mkSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Pesanan Central Production Kitchen
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-300">
                      <span>Rata-rata/Hari:</span>
                      <span className="font-mono font-bold text-white">
                        Rp {Math.round(procurementSummary.mkAvgPerDay).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Porsi thd Budget:</span>
                      <span className="font-mono font-bold text-amber-400">{procurementSummary.mkPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* 4. MAIN STORE (MS) & CASH SUPPLIER */}
                <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Main Store & Cash
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-black">
                        {(procurementSummary.msPercent + procurementSummary.cashPercent).toFixed(1)}% Alokasi
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-slate-400 font-bold">Main Store:</span>
                        <span className="text-base font-black font-mono text-indigo-400">
                          Rp {procurementSummary.msSpend.toLocaleString('id-ID')} <span className="text-[10px] text-slate-400">({procurementSummary.msPercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-slate-400 font-bold">Cash Supplier:</span>
                        <span className="text-base font-black font-mono text-emerald-400">
                          Rp {procurementSummary.cashSpend.toLocaleString('id-ID')} <span className="text-[10px] text-slate-400">({procurementSummary.cashPercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 text-[11px] flex justify-between text-slate-300">
                    <span>Total Store & Cash:</span>
                    <span className="font-mono font-bold text-white">
                      Rp {(procurementSummary.msSpend + procurementSummary.cashSpend).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* KALKULATOR & SIMULASI ALOKASI TARGET BUDGET PENGADAAN */}
              <div className="glass-card p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/20 border border-rose-500/30 rounded-3xl shadow-2xl space-y-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-sm font-black">
                        <i className="fas fa-calculator"></i>
                      </span>
                      <h4 className="text-base font-black text-white uppercase tracking-wider">
                        Simulasi & Kalkulator Alokasi Target Budget Belanja
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Kalkulasi pembagian dana ke Rekanan Supplier, MK, MS, dan Cash berdasarkan persentase rata-rata belanja
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-bold">Basis Budget:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setInputBudgetValue(procurementSummary.customProcurementBudget > 0 ? String(procurementSummary.customProcurementBudget) : String(procurementSummary.totalProcurementSpend));
                        setIsEditingBudgetModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-black text-xs transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <i className="fas fa-edit text-xs"></i>
                      Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
                      <span className="text-[10px] font-sans font-normal opacity-80">
                        {procurementSummary.customProcurementBudget > 0 ? '(Target Manual)' : '(Realisasi)'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Simulation Breakdown Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Rekanan Supplier (7 Mitra) */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-rose-500/40 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase text-rose-400">Alokasi Rekanan Supplier</span>
                        <span className="text-xs font-mono font-black text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded">
                          {procurementSummary.supplierPercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xl font-mono font-black text-white mt-1">
                        Rp {Math.round((procurementSummary.supplierPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Rata2: <strong className="text-rose-300 font-mono">Rp {Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount).toLocaleString('id-ID')}/hari</strong>
                      </p>
                    </div>
                    {/* Mini breakdown of 7 suppliers */}
                    <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[10px]">
                      {procurementSummary.supplierDetails.map(sup => {
                        const supNominal = Math.round((sup.pctOfTotalBudget / 100) * procurementSummary.effectiveBudget);
                        return (
                          <div key={sup.key} className="flex justify-between items-center text-slate-300">
                            <span className="truncate pr-1">• {sup.label}:</span>
                            <span className="font-mono font-bold text-white flex-none">
                              Rp {supNominal.toLocaleString('id-ID')} <span className="text-rose-400">({sup.pctOfTotalBudget.toFixed(1)}%)</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Main Kitchen (MK) */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase text-amber-400">Alokasi Main Kitchen (MK)</span>
                        <span className="text-xs font-mono font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                          {procurementSummary.mkPercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xl font-mono font-black text-white mt-1">
                        Rp {Math.round((procurementSummary.mkPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Rata2: <strong className="text-amber-300 font-mono">Rp {Math.round(procurementSummary.mkAvgPerDay).toLocaleString('id-ID')}/hari</strong>
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[11px] text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frekuensi PO:</span>
                        <span className="font-mono">{procurementSummary.mkCount} pesanan</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rata2/PO:</span>
                        <span className="font-mono font-bold text-amber-300">Rp {Math.round(procurementSummary.mkAvgPerTx).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Store (MS) */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-indigo-500/30 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase text-indigo-400">Alokasi Main Store (MS)</span>
                        <span className="text-xs font-mono font-black text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded">
                          {procurementSummary.msPercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xl font-mono font-black text-white mt-1">
                        Rp {Math.round((procurementSummary.msPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Rata2: <strong className="text-indigo-300 font-mono">Rp {Math.round(procurementSummary.msAvgPerDay).toLocaleString('id-ID')}/hari</strong>
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[11px] text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frekuensi PO:</span>
                        <span className="font-mono">{procurementSummary.msCount} pesanan</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rata2/PO:</span>
                        <span className="font-mono font-bold text-indigo-300">Rp {Math.round(procurementSummary.msAvgPerTx).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cash Supplier */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase text-emerald-400">Alokasi Cash Supplier</span>
                        <span className="text-xs font-mono font-black text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded">
                          {procurementSummary.cashPercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xl font-mono font-black text-white mt-1">
                        Rp {Math.round((procurementSummary.cashPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Rata2: <strong className="text-emerald-300 font-mono">Rp {Math.round(procurementSummary.cashAvgPerDay).toLocaleString('id-ID')}/hari</strong>
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[11px] text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frekuensi PO:</span>
                        <span className="font-mono">{procurementSummary.cashCount} transaksi</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rata2/PO:</span>
                        <span className="font-mono font-bold text-emerald-300">Rp {Math.round(procurementSummary.cashAvgPerTx).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VISUAL MULTI-COLOR STACKED ALLOCATION BAR */}
              <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-sliders-h text-rose-400"></i> Distribusi Persentase Alokasi Budget Belanja
                    </h4>
                    <p className="text-xs text-slate-400">
                      Proporsi penyerapan dana terhadap Total Budget Belanja Pengadaan (100%)
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300 bg-slate-950 px-3 py-1 rounded-xl border border-white/5">
                    Total: Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}
                  </span>
                </div>

                {/* The Bar */}
                <div className="h-6 w-full bg-slate-950 rounded-2xl flex overflow-hidden border border-white/10 shadow-inner p-1 gap-1">
                  {/* MK */}
                  {procurementSummary.mkPercent > 0 && (
                    <div
                      style={{ width: `${procurementSummary.mkPercent}%` }}
                      className="h-full bg-amber-500 hover:brightness-110 transition-all rounded-lg flex items-center justify-center text-[10px] font-black text-slate-950 truncate px-1"
                      title={`Main Kitchen: Rp ${procurementSummary.mkSpend.toLocaleString('id-ID')} (${procurementSummary.mkPercent.toFixed(1)}%)`}
                    >
                      {procurementSummary.mkPercent > 4 ? `MK ${procurementSummary.mkPercent.toFixed(0)}%` : ''}
                    </div>
                  )}

                  {/* MS */}
                  {procurementSummary.msPercent > 0 && (
                    <div
                      style={{ width: `${procurementSummary.msPercent}%` }}
                      className="h-full bg-indigo-500 hover:brightness-110 transition-all rounded-lg flex items-center justify-center text-[10px] font-black text-white truncate px-1"
                      title={`Main Store: Rp ${procurementSummary.msSpend.toLocaleString('id-ID')} (${procurementSummary.msPercent.toFixed(1)}%)`}
                    >
                      {procurementSummary.msPercent > 4 ? `MS ${procurementSummary.msPercent.toFixed(0)}%` : ''}
                    </div>
                  )}

                  {/* Cash */}
                  {procurementSummary.cashPercent > 0 && (
                    <div
                      style={{ width: `${procurementSummary.cashPercent}%` }}
                      className="h-full bg-emerald-500 hover:brightness-110 transition-all rounded-lg flex items-center justify-center text-[10px] font-black text-slate-950 truncate px-1"
                      title={`Cash Supplier: Rp ${procurementSummary.cashSpend.toLocaleString('id-ID')} (${procurementSummary.cashPercent.toFixed(1)}%)`}
                    >
                      {procurementSummary.cashPercent > 4 ? `Cash ${procurementSummary.cashPercent.toFixed(0)}%` : ''}
                    </div>
                  )}

                  {/* 7 Suppliers */}
                  {procurementSummary.supplierDetails.map(sup => {
                    if (sup.pctOfTotalBudget <= 0) return null;
                    const colorMap: Record<string, string> = {
                      tgif: 'bg-rose-600',
                      sukanda: 'bg-blue-600',
                      everest: 'bg-cyan-600',
                      ikigai: 'bg-teal-600',
                      panfila: 'bg-purple-600',
                      saungKubil: 'bg-amber-600',
                      kebunku: 'bg-lime-600'
                    };
                    const bgClass = colorMap[sup.key] || 'bg-rose-500';
                    return (
                      <div
                        key={sup.key}
                        style={{ width: `${sup.pctOfTotalBudget}%` }}
                        className={`h-full ${bgClass} hover:brightness-110 transition-all rounded-lg flex items-center justify-center text-[10px] font-black text-white truncate px-1`}
                        title={`${sup.label}: Rp ${sup.spend.toLocaleString('id-ID')} (${sup.pctOfTotalBudget.toFixed(1)}%)`}
                      >
                        {sup.pctOfTotalBudget > 5 ? `${sup.label.split(' ')[0]} ${sup.pctOfTotalBudget.toFixed(0)}%` : ''}
                      </div>
                    );
                  })}
                </div>

                {/* Legend Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-[11px]">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="w-3 h-3 rounded-full bg-amber-500 flex-none"></span>
                    <div className="truncate">
                      <span className="text-slate-400 block truncate">Main Kitchen</span>
                      <span className="font-bold text-white font-mono">{procurementSummary.mkPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="w-3 h-3 rounded-full bg-indigo-500 flex-none"></span>
                    <div className="truncate">
                      <span className="text-slate-400 block truncate">Main Store</span>
                      <span className="font-bold text-white font-mono">{procurementSummary.msPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 flex-none"></span>
                    <div className="truncate">
                      <span className="text-slate-400 block truncate">Cash Supplier</span>
                      <span className="font-bold text-white font-mono">{procurementSummary.cashPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                  {procurementSummary.supplierDetails.map(sup => {
                    const colorDot: Record<string, string> = {
                      tgif: 'bg-rose-600',
                      sukanda: 'bg-blue-600',
                      everest: 'bg-cyan-600',
                      ikigai: 'bg-teal-600',
                      panfila: 'bg-purple-600',
                      saungKubil: 'bg-amber-600',
                      kebunku: 'bg-lime-600'
                    };
                    return (
                      <div key={sup.key} className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-white/5">
                        <span className={`w-3 h-3 rounded-full ${colorDot[sup.key] || 'bg-rose-500'} flex-none`}></span>
                        <div className="truncate">
                          <span className="text-slate-400 block truncate">{sup.label}</span>
                          <span className="font-bold text-white font-mono">{sup.pctOfTotalBudget.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TABLE ANALISIS ALOKASI & RATA-RATA BELANJA */}
              <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-4">
                  <div>
                    <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-list-ol text-rose-400"></i> Tabel Rata-rata & Alokasi Budget Masing-Masing Kategori Supplier
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Rata-rata belanja harian, rata-rata per transaksi / PO, persentase alokasi, serta nominal pembagian target budget
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 font-bold bg-slate-950 px-3 py-1.5 rounded-xl border border-white/5">
                      Basis: {procurementSummary.recordedDaysCount} Hari Pencatatan
                    </span>
                    <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
                      Budget: Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Filter and Search Bar for Table */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 no-print">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAlokasiCategoryFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                        alokasiCategoryFilter === 'ALL'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      Semua Kategori (10)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlokasiCategoryFilter('SUPPLIERS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                        alokasiCategoryFilter === 'SUPPLIERS'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      Hanya Rekanan Supplier (7)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlokasiCategoryFilter('INTERNAL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                        alokasiCategoryFilter === 'INTERNAL'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      Internal (MK, MS, Cash)
                    </button>
                  </div>

                  <div className="relative">
                    <i className="fas fa-search absolute left-3 top-2.5 text-xs text-slate-500"></i>
                    <input
                      type="text"
                      placeholder="Cari kategori / supplier..."
                      value={alokasiSearch}
                      onChange={(e) => setAlokasiSearch(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 w-full sm:w-60"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-bold border-b border-white/10 text-[10px]">
                        <th className="py-3.5 px-4 w-12 text-center">#</th>
                        <th className="py-3.5 px-4">Jalur / Kategori Belanja</th>
                        <th className="py-3.5 px-4 text-right font-black text-white">Total Belanja (Rp)</th>
                        <th className="py-3.5 px-4 text-center">Jml PO / Trx</th>
                        <th className="py-3.5 px-4 text-right font-bold text-rose-300">Rata-rata/Hari (Rp)</th>
                        <th className="py-3.5 px-4 text-right font-bold text-slate-300">Rata-rata/PO (Rp)</th>
                        <th className="py-3.5 px-4 text-center font-bold text-slate-400">% thd Supplier</th>
                        <th className="py-3.5 px-4 text-center font-black text-rose-400">% Alokasi Budget</th>
                        <th className="py-3.5 px-4 text-right font-black text-emerald-400">Nominal Target (Rp)</th>
                        <th className="py-3.5 px-4 w-28 text-center">Distribusi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {/* 7 SUPPLIERS */}
                      {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'SUPPLIERS') &&
                        procurementSummary.supplierDetails
                          .filter(sup => !alokasiSearch.trim() || sup.label.toLowerCase().includes(alokasiSearch.toLowerCase()))
                          .map((sup, idx) => {
                            const supTargetNominal = Math.round((sup.pctOfTotalBudget / 100) * procurementSummary.effectiveBudget);
                            return (
                              <tr key={sup.key} className="hover:bg-rose-500/5 transition-colors">
                                <td className="py-3 px-4 text-center text-slate-500 font-bold">{idx + 1}</td>
                                <td className="py-3 px-4 font-sans font-bold text-white flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-none"></span>
                                  <span>{sup.label}</span>
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-white">
                                  Rp {sup.spend.toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-4 text-center text-slate-300">{sup.txCount} PO</td>
                                <td className="py-3 px-4 text-right font-bold text-rose-300">
                                  Rp {Math.round(sup.avgPerDay).toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-300">
                                  Rp {Math.round(sup.avgPerTx).toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-4 text-center font-bold text-slate-300">
                                  {sup.pctOfSupplier.toFixed(1)}%
                                </td>
                                <td className="py-3 px-4 text-center font-black text-rose-400 text-sm">
                                  {sup.pctOfTotalBudget.toFixed(1)}%
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-emerald-400">
                                  Rp {supTargetNominal.toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-rose-500 rounded-full"
                                      style={{ width: `${Math.min(100, sup.pctOfTotalBudget * 2.5)}%` }}
                                    ></div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                      {/* SUBTOTAL REKANAN SUPPLIER */}
                      {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'SUPPLIERS') && (
                        <tr className="bg-rose-950/20 font-sans font-bold border-y-2 border-rose-500/30">
                          <td className="py-3 px-4 text-center text-rose-400">Σ</td>
                          <td className="py-3 px-4 text-rose-300 font-black uppercase">
                            Subtotal Rekanan Supplier (7 Mitra)
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-rose-400 text-sm">
                            Rp {procurementSummary.totalSupplierSpend.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-rose-300">
                            {procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0)} PO
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-300">
                            Rp {Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-300">
                            Rp {Math.round(procurementSummary.totalSupplierSpend / Math.max(1, procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0))).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-black text-white">100.0%</td>
                          <td className="py-3 px-4 text-center font-mono font-black text-rose-400 text-sm">
                            {procurementSummary.supplierPercent.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-emerald-400">
                            Rp {Math.round((procurementSummary.supplierPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full"
                                style={{ width: `${Math.min(100, procurementSummary.supplierPercent)}%` }}
                              ></div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* MAIN KITCHEN */}
                      {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'INTERNAL') &&
                        (!alokasiSearch.trim() || 'main kitchen mk'.includes(alokasiSearch.toLowerCase())) && (
                          <tr className="hover:bg-amber-500/5 transition-colors">
                            <td className="py-3 px-4 text-center text-slate-500 font-bold">8</td>
                            <td className="py-3 px-4 font-sans font-bold text-amber-300 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-none"></span>
                              <span>Main Kitchen (MK)</span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-amber-400">
                              Rp {procurementSummary.mkSpend.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">{procurementSummary.mkCount} PO</td>
                            <td className="py-3 px-4 text-right font-bold text-amber-300">
                              Rp {Math.round(procurementSummary.mkAvgPerDay).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              Rp {Math.round(procurementSummary.mkAvgPerTx).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500 font-sans italic">-</td>
                            <td className="py-3 px-4 text-center font-black text-amber-400 text-sm">
                              {procurementSummary.mkPercent.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-400">
                              Rp {Math.round((procurementSummary.mkPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4">
                              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full"
                                  style={{ width: `${Math.min(100, procurementSummary.mkPercent * 2.5)}%` }}
                                ></div>
                              </div>
                            </td>
                          </tr>
                        )}

                      {/* MAIN STORE */}
                      {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'INTERNAL') &&
                        (!alokasiSearch.trim() || 'main store ms'.includes(alokasiSearch.toLowerCase())) && (
                          <tr className="hover:bg-indigo-500/5 transition-colors">
                            <td className="py-3 px-4 text-center text-slate-500 font-bold">9</td>
                            <td className="py-3 px-4 font-sans font-bold text-indigo-300 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-none"></span>
                              <span>Main Store (MS)</span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-400">
                              Rp {procurementSummary.msSpend.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">{procurementSummary.msCount} PO</td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-300">
                              Rp {Math.round(procurementSummary.msAvgPerDay).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              Rp {Math.round(procurementSummary.msAvgPerTx).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500 font-sans italic">-</td>
                            <td className="py-3 px-4 text-center font-black text-indigo-400 text-sm">
                              {procurementSummary.msPercent.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-400">
                              Rp {Math.round((procurementSummary.msPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4">
                              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${Math.min(100, procurementSummary.msPercent * 2.5)}%` }}
                                ></div>
                              </div>
                            </td>
                          </tr>
                        )}

                      {/* CASH SUPPLIER */}
                      {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'INTERNAL') &&
                        (!alokasiSearch.trim() || 'cash supplier pasar retail food'.includes(alokasiSearch.toLowerCase())) && (
                          <tr className="hover:bg-emerald-500/5 transition-colors">
                            <td className="py-3 px-4 text-center text-slate-500 font-bold">10</td>
                            <td className="py-3 px-4 font-sans font-bold text-emerald-300 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-none"></span>
                              <span>Cash Supplier (Pasar & Retail Food)</span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-400">
                              Rp {procurementSummary.cashSpend.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">{procurementSummary.cashCount} PO</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-300">
                              Rp {Math.round(procurementSummary.cashAvgPerDay).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              Rp {Math.round(procurementSummary.cashAvgPerTx).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500 font-sans italic">-</td>
                            <td className="py-3 px-4 text-center font-black text-emerald-400 text-sm">
                              {procurementSummary.cashPercent.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-400">
                              Rp {Math.round((procurementSummary.cashPercent / 100) * procurementSummary.effectiveBudget).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4">
                              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${Math.min(100, procurementSummary.cashPercent * 2.5)}%` }}
                                ></div>
                              </div>
                            </td>
                          </tr>
                        )}

                      {/* GRAND TOTAL */}
                      <tr className="bg-slate-900 font-sans font-bold border-t-2 border-white/20">
                        <td className="py-4 px-4 text-center text-white font-black text-sm">TOTAL</td>
                        <td className="py-4 px-4 text-white font-black text-sm uppercase">
                          Grand Total Budget Belanja Pengadaan
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-black text-white text-base">
                          Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-white">
                          {procurementSummary.totalTxAll} entri
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-black text-white">
                          Rp {Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-white">
                          Rp {Math.round(procurementSummary.totalAvgPerTx).toLocaleString('id-ID')}
                        </td>
                        <td className="py-4 px-4 text-center text-slate-500 italic font-mono">-</td>
                        <td className="py-4 px-4 text-center font-mono font-black text-emerald-400 text-base">
                          100.0%
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-black text-emerald-400 text-base">
                          Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block text-center">
                            Lengkap 100%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {moduleTab === 'MATRIX' && (
            <div className="space-y-6 animate-fade-in">
              {/* EXECUTIVE KPI SUMMARY CARDS (RATIO VS MTD REV & VARIANCE) */}
              <ModuleExecutiveKpis
                themeColor="rose"
                spendLabel="Total Belanja Supplier"
                totalSpend={totalSupplierSpend}
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

              {/* RINGKASAN ALOKASI BUDGET BELANJA PENGADAAN (MK, MS, CASH & REKANAN SUPPLIER) */}
              <div className="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 border border-rose-500/20 rounded-3xl shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-chart-pie text-rose-400"></i> Porsi Alokasi Belanja Pengadaan (MK, MS, Cash & Supplier)
                    </h4>
                    <p className="text-xs text-slate-400">
                      Total Belanja Gabungan: <strong className="text-white font-mono">Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}</strong> · Rata-rata: <strong className="text-white font-mono">Rp {Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}/hari</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setModuleTab('ALOKASI_BUDGET')}
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    Buka Detail Alokasi Budget <i className="fas fa-arrow-right text-[10px]"></i>
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-4 w-full bg-slate-950 rounded-xl flex overflow-hidden border border-white/10 p-0.5 gap-0.5">
                  <div style={{ width: `${procurementSummary.mkPercent}%` }} className="h-full bg-amber-500 rounded-sm" title={`MK: ${procurementSummary.mkPercent.toFixed(1)}%`}></div>
                  <div style={{ width: `${procurementSummary.msPercent}%` }} className="h-full bg-indigo-500 rounded-sm" title={`MS: ${procurementSummary.msPercent.toFixed(1)}%`}></div>
                  <div style={{ width: `${procurementSummary.cashPercent}%` }} className="h-full bg-emerald-500 rounded-sm" title={`Cash: ${procurementSummary.cashPercent.toFixed(1)}%`}></div>
                  <div style={{ width: `${procurementSummary.supplierPercent}%` }} className="h-full bg-rose-500 rounded-sm" title={`7 Supplier: ${procurementSummary.supplierPercent.toFixed(1)}%`}></div>
                </div>

                {/* Legend badges */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-slate-400">MK:</span>
                    <span className="font-mono font-bold text-white">Rp {procurementSummary.mkSpend.toLocaleString('id-ID')} ({procurementSummary.mkPercent.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    <span className="text-slate-400">MS:</span>
                    <span className="font-mono font-bold text-white">Rp {procurementSummary.msSpend.toLocaleString('id-ID')} ({procurementSummary.msPercent.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-slate-400">Cash:</span>
                    <span className="font-mono font-bold text-white">Rp {procurementSummary.cashSpend.toLocaleString('id-ID')} ({procurementSummary.cashPercent.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    <span className="text-slate-400">7 Supplier:</span>
                    <span className="font-mono font-black text-rose-400">Rp {procurementSummary.totalSupplierSpend.toLocaleString('id-ID')} ({procurementSummary.supplierPercent.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>

      {/* SUPPLIER BREAKDOWN CARDS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <i className="fas fa-store-alt text-rose-400"></i> Rekanan Supplier (Klik untuk Filter)
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {activeSupplierFilter !== 'ALL' && (
              <button
                onClick={() => setActiveSupplierFilter('ALL')}
                className="text-xs text-rose-400 hover:underline font-bold"
              >
                Reset Filter (Tampilkan Semua)
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddSupplierModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer border border-indigo-400/30"
              title="Tambah Supplier Baru"
            >
              <i className="fas fa-plus"></i> Tambah Supplier
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'SUPPLIER' } }));
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
              title="Kelola Master Supplier di Outlet Control"
            >
              <i className="fas fa-sliders-h"></i> Outlet Control
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {dynamicSuppliersList.map(sup => {
            const sDetail = procurementSummary.supplierDetails.find(d => d.key === sup.key);
            const sData = supplierSummaries[sup.key] || { total: 0, itemsCount: 0, count: 0 };
            const isSelected = activeSupplierFilter === sup.key;
            const shareOfSupplier = sDetail?.pctOfSupplier || (totalSupplierSpend > 0 ? (sData.total / totalSupplierSpend) * 100 : 0);
            const shareOfTotalBudget = sDetail?.pctOfTotalBudget || 0;
            const avgPerDay = sDetail?.avgPerDay || 0;
            const avgPerTx = sDetail?.avgPerTx || 0;

            return (
              <div
                key={sup.key}
                onClick={() => setActiveSupplierFilter(isSelected ? 'ALL' : sup.key)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between ${
                  isSelected 
                    ? 'bg-rose-500/20 border-rose-400 ring-2 ring-rose-500/40 shadow-lg' 
                    : `${sup.color} hover:bg-white/5`
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <i className={`fas ${sup.icon} text-xs`}></i>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/40 text-rose-300">
                      {shareOfTotalBudget.toFixed(1)}% Budget
                    </span>
                  </div>
                  <p className="text-xs font-black uppercase tracking-tight text-white leading-tight">
                    {sup.label}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/5 space-y-1">
                  <div>
                    <p className="text-xs font-black font-mono text-white">
                      Rp {sData.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300">
                    <span className="text-slate-400">Rata2/Hari:</span>
                    <span className="font-mono font-bold text-rose-300">
                      Rp {Math.round(avgPerDay).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Rata2/PO:</span>
                    <span className="font-mono">Rp {Math.round(avgPerTx).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="bg-slate-950/70 p-1.5 rounded-lg border border-white/5 mt-1">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                      <span className="text-slate-400">Porsi Budget:</span>
                      <span className="text-rose-400 font-mono font-black">{shareOfTotalBudget.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{ width: `${Math.min(100, shareOfTotalBudget * 2.5)}%` }}
                      ></div>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 pt-0.5 flex justify-between">
                    <span>{sData.itemsCount} varian</span>
                    <span>{sData.count} PO</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FULL DATE RECAP TABLE (TANGGAL 1 - 31) */}
      <div className="space-y-2">
        <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-2xl border border-white/5 no-print">
          <div className="flex items-center gap-2 text-xs">
            <i className="fas fa-layer-group text-rose-400"></i>
            <span className="font-bold text-white">Opsi Kolom Tabel Rekap Harian:</span>
          </div>
          <button
            onClick={() => setIncludeProcurementChannelsInRecap(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              includeProcurementChannelsInRecap
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <i className={`fas ${includeProcurementChannelsInRecap ? 'fa-check-circle' : 'fa-plus-circle'}`}></i>
            {includeProcurementChannelsInRecap ? 'Menampilkan Kolom MK, MS & Cash' : 'Sertakan Kolom MK, MS & Cash'}
          </button>
        </div>

        <BelanjaFullTanggalRecapTable
          title="Tabel Rekap Harian Supplier Expense"
          subtitle={`Rekapan penyerapan harian 7 Supplier (TGIF, Sukanda Djaya, Everest, Ikigai, Panfila, Saung Kubil, Kebunku)${includeProcurementChannelsInRecap ? ' serta Main Kitchen, Main Store & Cash' : ''} tanggal 1 sampai akhir bulan (${monthName} ${selectedYear})`}
          icon="fa-truck-loading"
          themeColor="rose"
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedOutlet={activeOutlet}
          isRegionalView={isRegionalView}
          monthlyStates={recapMonthlyStates}
          columns={recapColumns}
          getDetailItemsForDay={getDetailItemsForDay}
        />
      </div>

      {/* TREND CHART & TOP ITEMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-chart-bar text-rose-400"></i> Tren Belanja Supplier Harian
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
                  formatter={(val: any) => [`Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, 'Belanja Supplier']}
                  labelFormatter={(label) => `Tanggal ${label} ${monthName} ${selectedYear}`}
                />
                <Bar dataKey="spend" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 glass-card p-6 bg-slate-900/80 border border-white/10 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <i className="fas fa-crown text-rose-400"></i> Top 5 Bahan Baku / Item Supplier Terbesar
            </h3>

            <div className="space-y-3">
              {top5Items.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">Belum ada data belanja supplier</p>
              ) : (
                top5Items.map((item, idx) => {
                  const share = totalSupplierSpend > 0 ? (item.totalSpend / totalSupplierSpend) * 100 : 0;
                  return (
                    <div key={item.key} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="w-5 h-5 rounded-lg bg-rose-500/20 text-rose-400 font-black flex items-center justify-center text-[10px] flex-none">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate max-w-[150px]">{item.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5 flex-none">
                            {item.supplierLabel}
                          </span>
                        </div>
                        <span className="font-mono font-black text-rose-400 text-xs">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full" style={{ width: `${Math.min(100, share * 2.5)}%` }}></div>
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

      {/* MATRIX DETAIL ITEM SUPPLIER */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2.5">
              <i className="fas fa-table text-rose-400"></i> Matrix Detail Item Belanja Supplier
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar seluruh item bahan baku dari rekanan supplier, volume, harga satuan, dan distribusi outlet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                placeholder="Cari item, supplier, PIC..."
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <select
              value={matrixSortBy}
              onChange={(e) => setMatrixSortBy(e.target.value as any)}
              className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-rose-500 cursor-pointer"
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
                  matrixViewMode === 'ITEM_LIST' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-list mr-1"></i> List
              </button>
              <button
                onClick={() => setMatrixViewMode('OUTLET_PIVOT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  matrixViewMode === 'OUTLET_PIVOT' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
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
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-center">Total Qty</th>
                  <th className="py-3 px-4 text-right">Rata-rata Harga</th>
                  <th className="py-3 px-4 text-right">Min - Max Harga</th>
                  <th className="py-3 px-4 text-right font-black text-rose-400">Total Belanja (Rp)</th>
                  <th className="py-3 px-4 text-center">% Share</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredMatrixItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                      <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                      Tidak ada data item supplier yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixItems.map((item, index) => {
                    const share = totalSupplierSpend > 0 ? (item.totalSpend / totalSupplierSpend) * 100 : 0;
                    return (
                      <tr key={item.key} className="hover:bg-rose-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold">{index + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="hover:text-rose-400 transition-colors text-left font-bold"
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-white/10">
                            {item.supplierLabel}
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
                        <td className="py-3 px-4 text-right font-black text-rose-400 bg-rose-500/5">
                          Rp {item.totalSpend.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                          {share.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => setSelectedItemForDetail(item)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-600 hover:text-white transition-all text-[10px] font-black uppercase"
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
                      <th className="py-3 px-4">Supplier</th>
                      {pivotOutlets.map(o => (
                        <th key={o} className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">{o}</th>
                      ))}
                      <th className="py-3 px-4 text-center bg-rose-950/40 text-rose-300">Total Qty</th>
                      <th className="py-3 px-4 text-right bg-rose-950/60 text-rose-300 font-black">Total Belanja (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredMatrixItems.map((item, idx) => (
                      <tr key={item.key} className="hover:bg-rose-500/5 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-bold sticky left-0 bg-slate-950 z-10">{idx + 1}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white sticky left-12 bg-slate-950 z-10 whitespace-nowrap">
                          <button onClick={() => setSelectedItemForDetail(item)} className="hover:text-rose-400">
                            {item.name}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/10 whitespace-nowrap">
                            {item.supplierLabel}
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
                        <td className="py-3 px-4 text-center font-bold text-slate-300 bg-rose-950/20">
                          {item.totalQty.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-rose-400 bg-rose-950/30">
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
          themeColor="rose"
          moduleTitle="Supplier Expense"
          iconClass="fa-truck-loading"
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
          currentSpend={totalSupplierSpend}
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
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">
                    <i className="fas fa-truck-loading"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {selectedItemForDetail.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Supplier: <span className="text-rose-400 font-bold">{selectedItemForDetail.supplierLabel}</span> • Total {selectedItemForDetail.txCount} Transaksi
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
                    <span className="text-base font-black font-mono text-rose-400">
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
                          <td className="py-2.5 px-3 text-right font-black text-rose-400">Rp {tx.subtotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
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

        {/* MODAL SET TARGET BUDGET BELANJA PENGADAAN */}
        {isEditingBudgetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/15 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/10 bg-slate-950/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">
                    <i className="fas fa-bullseye"></i>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-tight">
                      Atur Target Budget Belanja Pengadaan
                    </h3>
                    <p className="text-xs text-slate-400">
                      Total budget gabungan (MK, MS, Cash & Supplier) untuk {activeOutlet}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingBudgetModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                    Nominal Target Budget Belanja (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100000"
                    placeholder={`Realisasi saat ini: Rp ${procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}`}
                    value={inputBudgetValue}
                    onChange={(e) => setInputBudgetValue(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono font-black text-rose-400 focus:outline-none focus:border-rose-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Target ini akan digunakan sebagai basis 100% alokasi persentase & simulasi pembagian dana ke Rekanan Supplier (TGIF, Sukanda, Everest, dll), MK, MS, dan Cash.
                  </p>
                </div>

                {/* Quick Presets */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                    Preset Pilihan Cepat:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInputBudgetValue(String(procurementSummary.totalProcurementSpend))}
                      className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:border-rose-500/50 text-left text-xs transition-all cursor-pointer"
                    >
                      <span className="text-[10px] text-slate-400 block">Sesuai Realisasi:</span>
                      <span className="font-mono font-bold text-white">Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputBudgetValue('50000000')}
                      className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:border-rose-500/50 text-left text-xs transition-all cursor-pointer"
                    >
                      <span className="text-[10px] text-slate-400 block">Preset Standar:</span>
                      <span className="font-mono font-bold text-white">Rp 50.000.000</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputBudgetValue('100000000')}
                      className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:border-rose-500/50 text-left text-xs transition-all cursor-pointer"
                    >
                      <span className="text-[10px] text-slate-400 block">Preset Sedang:</span>
                      <span className="font-mono font-bold text-white">Rp 100.000.000</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputBudgetValue('150000000')}
                      className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:border-rose-500/50 text-left text-xs transition-all cursor-pointer"
                    >
                      <span className="text-[10px] text-slate-400 block">Preset Besar:</span>
                      <span className="font-mono font-bold text-white">Rp 150.000.000</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-slate-950/50 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleResetBudget}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Reset ke Realisasi
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingBudgetModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(inputBudgetValue) || 0;
                      handleSaveBudget(val);
                    }}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-rose-500/20 cursor-pointer"
                  >
                    Simpan Target
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: TAMBAH REKANAN SUPPLIER BARU */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg">
                  <i className="fas fa-truck-fast"></i>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">
                    Tambah Supplier Baru
                  </h3>
                  <p className="text-xs text-slate-400">
                    Daftarkan mitra supplier ke Fitur Supplier & Receiving Sheet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* NAMA SUPPLIER */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <label className="text-xs font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-building"></i> Nama Supplier / Vendor <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Sumber Berkah / Surya Mandiri"
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
                />
              </div>

              {/* KATEGORI SUPPLIER */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-tags text-indigo-400"></i> Kategori Produk / Supplier
                </label>
                <select
                  value={newSupplierCategory}
                  onChange={e => setNewSupplierCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500 cursor-pointer"
                >
                  <option value="Mitra Bahan Makanan">Mitra Bahan Makanan (Food & Ingredients)</option>
                  <option value="Mitra Bahan Minuman">Mitra Bahan Minuman (Beverage & Bar)</option>
                  <option value="Sayur & Buah Segar">Sayur & Buah Segar</option>
                  <option value="Daging & Seafood">Daging, Ayam & Seafood</option>
                  <option value="Kemasan & Disposable">Kemasan & Packaging</option>
                  <option value="Peralatan & Chemical">Peralatan & Chemical</option>
                  <option value="Supplier Pasar & Cash">Supplier Pasar & Cash</option>
                  <option value="Vendor Operasional">Vendor Operasional Lainnya</option>
                </select>
              </div>

              {/* KONTAK & TELEPON */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950 border border-white/5 space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                    PIC / Kontak Person
                  </label>
                  <input
                    type="text"
                    placeholder="Nama PIC (opsional)"
                    value={newSupplierContact}
                    onChange={e => setNewSupplierContact(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:ring-2 ring-indigo-500"
                  />
                </div>
                <div className="p-3 rounded-2xl bg-slate-950 border border-white/5 space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                    No. Telp / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="08123xxx (opsional)"
                    value={newSupplierPhone}
                    onChange={e => setNewSupplierPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:ring-2 ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* CATATAN / TERMS */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Catatan / Syarat Pembayaran (TOP)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: TOP 14 Hari, Pengiriman Tiap Selasa & Jumat"
                  value={newSupplierNotes}
                  onChange={e => setNewSupplierNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:ring-2 ring-indigo-500"
                />
              </div>

              {/* DAFTAR SUPPLIER KUSTOM YANG SUDAH DITAMBAHKAN */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  Daftar Rekanan Kustom Tambahan ({customSuppliersList.length})
                </span>
                {customSuppliersList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Belum ada rekanan kustom tambahan. 7 rekanan inti default aktif.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {customSuppliersList.map(cs => (
                      <div key={cs.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-white/5 text-xs">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-truck text-emerald-400 text-xs"></i>
                          <span className="font-bold text-white">{cs.name}</span>
                          {cs.category && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {cs.category}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Hapus supplier "${cs.name}"?`)) {
                              handleDeleteCustomSupplier(cs.id, cs.name);
                            }
                          }}
                          className="text-slate-400 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                          title="Hapus Supplier"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowAddSupplierModal(false);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'SUPPLIER' } }));
                  }
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i className="fas fa-sliders-h"></i> Buka Master Outlet Control
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs uppercase hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <i className="fas fa-plus"></i>
                  Tambah Supplier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierExpenseModule;
