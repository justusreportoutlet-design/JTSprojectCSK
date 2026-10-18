import React, { useState, useMemo, useEffect } from 'react';
import { AppState, Outlet, LedgerItem, MonthlyCogsData, DivisionAllocationItem, DivisionSupplierChannelShare } from '../types';
import { ORDER_SCHEDULES_BY_AREA, getOrderScheduleForOutlet, getAreaForOutlet } from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ReferenceLine
} from 'recharts';

interface Props {
  data: AppState;
  selectedDate?: string;
  selectedOutlet?: Outlet;
  onUpdate: (updatedData: Partial<AppState>) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  allMonthlyData?: Record<string, AppState>;
  filterMonth?: string;
  filterYear?: string;
}

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const SUPPLIERS_CONFIG = [
  { id: 'mainStore', key: 'dailyMainStoreLedger', label: 'Main Store', color: '#6366f1' },
  { id: 'mainKitchen', key: 'dailyMainKitchenLedger', label: 'Main Kitchen', color: '#3b82f6' },
  { id: 'cash', key: 'dailyCashLedger', label: 'Cash & Pasar (Commodity)', color: '#f97316' },
  { id: 'saungKubil', key: 'dailySaungKubilLedger', label: 'Saung Kubil', color: '#06b6d4' },
  { id: 'tgif', key: 'dailyTgifLedger', label: 'TGIF', color: '#10b981' },
  { id: 'panfila', key: 'dailyPanfilaLedger', label: 'Panfila', color: '#ec4899' },
  { id: 'everest', key: 'dailyEverestLedger', label: 'Everest', color: '#8b5cf6' },
  { id: 'sukanda', key: 'dailySukandaLedger', label: 'Sukanda', color: '#f59e0b' },
  { id: 'ikigai', key: 'dailyIkigaiLedger', label: 'Ikigai', color: '#14b8a6' },
  { id: 'kebunku', key: 'dailyKebunkuLedger', label: 'Kebunku', color: '#84cc16' },
] as const;

export const PARTNER_SUPPLIERS = [
  { key: 'tgif', label: 'TGIF', color: 'bg-emerald-500', colorText: 'text-emerald-400' },
  { key: 'sukanda', label: 'Sukanda Djaya', color: 'bg-amber-500', colorText: 'text-amber-400' },
  { key: 'everest', label: 'Everest', color: 'bg-purple-500', colorText: 'text-purple-400' },
  { key: 'ikigai', label: 'Ikigai', color: 'bg-teal-500', colorText: 'text-teal-400' },
  { key: 'panfila', label: 'Panfila', color: 'bg-pink-500', colorText: 'text-pink-400' },
  { key: 'saungKubil', label: 'Saung Kubil', color: 'bg-cyan-500', colorText: 'text-cyan-400' },
  { key: 'kebunku', label: 'Kebunku', color: 'bg-lime-500', colorText: 'text-lime-400' },
] as const;

export const DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS: Record<string, DivisionSupplierChannelShare> = {
  kitchen: {
    supplier: 50,
    mainKitchen: 30,
    mainStore: 10,
    cash: 10,
    supplierBreakdown: {
      tgif: 25,
      sukanda: 25,
      everest: 15,
      saungKubil: 15,
      ikigai: 10,
      panfila: 5,
      kebunku: 5,
    }
  },
  bar: {
    supplier: 45,
    mainKitchen: 5,
    mainStore: 35,
    cash: 15,
    supplierBreakdown: {
      sukanda: 35,
      everest: 25,
      tgif: 15,
      ikigai: 10,
      panfila: 5,
      saungKubil: 5,
      kebunku: 5,
    }
  },
  service: {
    supplier: 20,
    mainKitchen: 0,
    mainStore: 60,
    cash: 20,
    supplierBreakdown: {
      tgif: 20,
      sukanda: 20,
      everest: 20,
      saungKubil: 15,
      panfila: 10,
      ikigai: 10,
      kebunku: 5,
    }
  }
};

export const getFallbackDivisionSupplierShare = (divId: string): DivisionSupplierChannelShare => {
  if (DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS[divId]) {
    return { ...DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS[divId] };
  }
  return {
    supplier: 40,
    mainKitchen: 20,
    mainStore: 20,
    cash: 20,
    supplierBreakdown: {
      tgif: 20,
      sukanda: 20,
      everest: 15,
      saungKubil: 15,
      ikigai: 10,
      panfila: 10,
      kebunku: 10,
    }
  };
};

export const CogsModule: React.FC<Props> = ({
  data,
  selectedDate,
  selectedOutlet = 'SH THE BARN',
  onUpdate,
  showToast,
  allMonthlyData,
  filterMonth,
  filterYear
}) => {
  const currentDate = new Date();
  const initMonth = filterMonth !== undefined ? parseInt(filterMonth, 10) : currentDate.getMonth();
  const initYear = filterYear !== undefined ? parseInt(filterYear, 10) : currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(isNaN(initMonth) ? currentDate.getMonth() : initMonth);
  const [selectedYear, setSelectedYear] = useState<number>(isNaN(initYear) ? currentDate.getFullYear() : initYear);

  useEffect(() => {
    if (filterMonth !== undefined) {
      const m = parseInt(filterMonth, 10);
      if (!isNaN(m)) setSelectedMonth(m);
    }
    if (filterYear !== undefined) {
      const y = parseInt(filterYear, 10);
      if (!isNaN(y)) setSelectedYear(y);
    }
  }, [filterMonth, filterYear]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Saved monthly configurations from app state or defaults
  const savedCogsData = data?.monthlyCogsData?.[monthKey] || {};

  // 1. Cutoff Day (e.g. Day 19)
  const defaultCutoff = useMemo(() => {
    if (savedCogsData.manualCutoffDay !== undefined) {
      return Math.min(daysInMonth, Math.max(1, savedCogsData.manualCutoffDay));
    }
    // If viewing current month, default to today's date or 19
    if (selectedYear === currentDate.getFullYear() && selectedMonth === currentDate.getMonth()) {
      return Math.min(daysInMonth, currentDate.getDate());
    }
    return Math.min(19, daysInMonth);
  }, [savedCogsData.manualCutoffDay, daysInMonth, selectedYear, selectedMonth]);

  const [cutoffDay, setCutoffDay] = useState<number>(defaultCutoff);

  useEffect(() => {
    if (savedCogsData.manualCutoffDay !== undefined) {
      setCutoffDay(Math.min(daysInMonth, Math.max(1, savedCogsData.manualCutoffDay)));
    }
  }, [monthKey, daysInMonth]);

  // 2. Budget Belanja Target % (e.g. 43.00%)
  const [targetBudgetPercent, setTargetBudgetPercent] = useState<number>(() => {
    if (savedCogsData.targetBudgetPercent !== undefined) return savedCogsData.targetBudgetPercent;
    const local = localStorage.getItem(`COGS_TARGET_BUDGET_${monthKey}`);
    return local ? parseFloat(local) : 43.0; // Default 43.00%
  });

  // 3. Opening Inventory (+)
  const [openingInventory, setOpeningInventory] = useState<number>(() => {
    if (savedCogsData.beginningInventory !== undefined) return savedCogsData.beginningInventory;
    const local = localStorage.getItem(`COGS_OPENING_INV_${monthKey}`);
    return local ? parseFloat(local) : 0;
  });

  // 4. Closing Inventory % Input State (User now directly edits the percentage of closing inventory)
  const [closingInvPercent, setClosingInvPercent] = useState<number>(() => {
    if (savedCogsData.closingInventoryPercent !== undefined) return savedCogsData.closingInventoryPercent;
    const localPercent = localStorage.getItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`);
    if (localPercent !== null) {
      const p = parseFloat(localPercent);
      if (!isNaN(p)) return p;
    }
    return 10.0; // Default 10.00%
  });

  const [hasUserEditedClosingPercent, setHasUserEditedClosingPercent] = useState<boolean>(false);

  useEffect(() => {
    if (savedCogsData.endingInventory !== undefined && Number(savedCogsData.endingInventory) > 0) {
      if (savedCogsData.closingInventoryPercent !== undefined) {
        setClosingInvPercent(savedCogsData.closingInventoryPercent);
      } else {
        const localPercent = localStorage.getItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`);
        if (localPercent !== null) {
          const p = parseFloat(localPercent);
          if (!isNaN(p)) setClosingInvPercent(p);
        }
      }
    } else if (savedCogsData.closingInventoryPercent !== undefined) {
      setClosingInvPercent(savedCogsData.closingInventoryPercent);
    } else {
      const localPercent = localStorage.getItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`);
      if (localPercent !== null) {
        const p = parseFloat(localPercent);
        if (!isNaN(p)) setClosingInvPercent(p);
      }
    }
  }, [monthKey, savedCogsData.closingInventoryPercent, savedCogsData.endingInventory]);

  // 5. Max Closing Inventory % (Default Max 11%)
  const [maxClosingInvPercent, setMaxClosingInvPercent] = useState<number>(() => {
    if (savedCogsData.maxClosingInvPercent !== undefined) return savedCogsData.maxClosingInvPercent;
    const local = localStorage.getItem(`COGS_MAX_CLOSING_PERCENT_${monthKey}`);
    return local ? parseFloat(local) : 11.0;
  });

  // Manual MTD Belanja Override (optional for simulations)
  const [useManualMtdBelanja, setUseManualMtdBelanja] = useState<boolean>(() => {
    return Boolean(savedCogsData.useManualMtdBelanja);
  });
  const [manualMtdBelanja, setManualMtdBelanja] = useState<string>(() => {
    return savedCogsData.manualMtdBelanja ? String(savedCogsData.manualMtdBelanja) : '';
  });

  // 6. Divisional Allocation % dari Nominal Sisa Budget Belanja (Dapat Diatur Bebas Sesuai Keinginan)
  const [divisionAllocations, setDivisionAllocations] = useState<DivisionAllocationItem[]>(() => {
    if (savedCogsData.divisionAllocations && savedCogsData.divisionAllocations.length > 0) {
      return savedCogsData.divisionAllocations;
    }
    const local = localStorage.getItem(`COGS_DIVISION_ALLOCATIONS_${monthKey}`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // ignore
      }
    }
    const k = savedCogsData.kitchenSharePercent !== undefined ? savedCogsData.kitchenSharePercent : 70;
    const b = savedCogsData.barSharePercent !== undefined ? savedCogsData.barSharePercent : 20;
    const s = savedCogsData.serviceSharePercent !== undefined ? savedCogsData.serviceSharePercent : 10;
    return [
      { id: 'kitchen', name: 'Kitchen', percent: k, color: 'blue', icon: 'fa-utensils' },
      { id: 'bar', name: 'Bar', percent: b, color: 'amber', icon: 'fa-cocktail' },
      { id: 'service', name: 'Service', percent: s, color: 'purple', icon: 'fa-concierge-bell' }
    ];
  });

  useEffect(() => {
    if (savedCogsData.divisionAllocations && savedCogsData.divisionAllocations.length > 0) {
      setDivisionAllocations(savedCogsData.divisionAllocations);
    } else if (savedCogsData.kitchenSharePercent !== undefined) {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: savedCogsData.kitchenSharePercent, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: savedCogsData.barSharePercent ?? 20, color: 'amber', icon: 'fa-cocktail' },
        { id: 'service', name: 'Service', percent: savedCogsData.serviceSharePercent ?? 10, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    }
  }, [monthKey, savedCogsData.divisionAllocations, savedCogsData.kitchenSharePercent, savedCogsData.barSharePercent, savedCogsData.serviceSharePercent]);

  const kitchenPercent = useMemo(() => divisionAllocations.find(d => d.id === 'kitchen')?.percent ?? 70, [divisionAllocations]);
  const barPercent = useMemo(() => divisionAllocations.find(d => d.id === 'bar')?.percent ?? 20, [divisionAllocations]);
  const servicePercent = useMemo(() => divisionAllocations.find(d => d.id === 'service')?.percent ?? 10, [divisionAllocations]);

  const totalAllocatedPercent = useMemo(() => {
    return divisionAllocations.reduce((acc, d) => acc + (d.percent || 0), 0);
  }, [divisionAllocations]);

  const [newDivName, setNewDivName] = useState('');
  const [isAddingDivision, setIsAddingDivision] = useState(false);

  const handleUpdateDivisionPercent = (id: string, newPercent: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(newPercent) ? 0 : parseFloat(newPercent.toFixed(1))));
    setDivisionAllocations(prev => prev.map(div => div.id === id ? { ...div, percent: clamped } : div));
  };

  const handleAutoBalanceDivisions = () => {
    if (divisionAllocations.length === 0) return;
    const currentTotal = divisionAllocations.reduce((sum, d) => sum + (d.percent || 0), 0);
    if (currentTotal === 0) {
      const share = parseFloat((100 / divisionAllocations.length).toFixed(1));
      setDivisionAllocations(prev => prev.map((d, idx) => ({
        ...d,
        percent: idx === 0 ? parseFloat((100 - share * (divisionAllocations.length - 1)).toFixed(1)) : share
      })));
      return;
    }
    let running = 0;
    const normalized = divisionAllocations.map((d, idx) => {
      if (idx === divisionAllocations.length - 1) {
        return { ...d, percent: parseFloat(Math.max(0, 100 - running).toFixed(1)) };
      }
      const p = parseFloat(((d.percent / currentTotal) * 100).toFixed(1));
      running += p;
      return { ...d, percent: p };
    });
    setDivisionAllocations(normalized);
  };

  const handleApplyDivisionPreset = (presetKey: string) => {
    if (presetKey === 'standard') {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: 70, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: 20, color: 'amber', icon: 'fa-cocktail' },
        { id: 'service', name: 'Service', percent: 10, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    } else if (presetKey === 'kitchen_heavy') {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: 75, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: 15, color: 'amber', icon: 'fa-cocktail' },
        { id: 'service', name: 'Service', percent: 10, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    } else if (presetKey === 'food_bar') {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: 55, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: 35, color: 'amber', icon: 'fa-cocktail' },
        { id: 'service', name: 'Service', percent: 10, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    } else if (presetKey === 'equal') {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: 34, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: 33, color: 'amber', icon: 'fa-cocktail' },
        { id: 'service', name: 'Service', percent: 33, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    } else if (presetKey === 'four_divisions') {
      setDivisionAllocations([
        { id: 'kitchen', name: 'Kitchen', percent: 55, color: 'blue', icon: 'fa-utensils' },
        { id: 'bar', name: 'Bar', percent: 20, color: 'amber', icon: 'fa-cocktail' },
        { id: 'pastry', name: 'Pastry', percent: 15, color: 'emerald', icon: 'fa-bread-slice', isCustom: true },
        { id: 'service', name: 'Service', percent: 10, color: 'purple', icon: 'fa-concierge-bell' }
      ]);
    }
  };

  const handleAddNewDivision = () => {
    const trimmed = newDivName.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const colors = ['emerald', 'rose', 'cyan', 'indigo', 'amber'];
    const assignedColor = colors[divisionAllocations.length % colors.length];
    setDivisionAllocations(prev => [
      ...prev,
      {
        id,
        name: trimmed,
        percent: 0,
        color: assignedColor,
        icon: 'fa-tag',
        isCustom: true
      }
    ]);
    setNewDivName('');
    setIsAddingDivision(false);
  };

  const handleRemoveDivision = (id: string) => {
    setDivisionAllocations(prev => prev.filter(d => d.id !== id));
  };

  // 6b. Alokasi Belanja & Supplier per Divisi (dari 100% Sisa Budget Masing-Masing Divisi)
  const [divisionSupplierAllocations, setDivisionSupplierAllocations] = useState<Record<string, DivisionSupplierChannelShare>>(() => {
    if (savedCogsData.divisionSupplierAllocations && Object.keys(savedCogsData.divisionSupplierAllocations).length > 0) {
      return savedCogsData.divisionSupplierAllocations;
    }
    const local = localStorage.getItem(`COGS_DIV_SUPPLIER_ALLOCATIONS_${monthKey}`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        // ignore
      }
    }
    return DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS;
  });

  useEffect(() => {
    if (savedCogsData.divisionSupplierAllocations && Object.keys(savedCogsData.divisionSupplierAllocations).length > 0) {
      setDivisionSupplierAllocations(savedCogsData.divisionSupplierAllocations);
    } else {
      const local = localStorage.getItem(`COGS_DIV_SUPPLIER_ALLOCATIONS_${monthKey}`);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (parsed && typeof parsed === 'object') {
            setDivisionSupplierAllocations(parsed);
            return;
          }
        } catch (e) {
          // ignore
        }
      }
      setDivisionSupplierAllocations(DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS);
    }
  }, [monthKey, savedCogsData.divisionSupplierAllocations]);

  const [activeSupplierDivId, setActiveSupplierDivId] = useState<string>('kitchen');
  const [isSupplierBreakdownExpanded, setIsSupplierBreakdownExpanded] = useState<boolean>(false);
  const [alokasiBudgetDivFilter, setAlokasiBudgetDivFilter] = useState<string>('ALL');

  const handleUpdateDivSupplierChannel = (divId: string, channelKey: 'supplier' | 'mainKitchen' | 'mainStore' | 'cash', val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : parseFloat(val.toFixed(1))));
    setDivisionSupplierAllocations(prev => {
      const current = prev[divId] || getFallbackDivisionSupplierShare(divId);
      return {
        ...prev,
        [divId]: {
          ...current,
          [channelKey]: clamped
        }
      };
    });
  };

  const handleUpdateDivSupplierSubItem = (divId: string, supplierKey: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : parseFloat(val.toFixed(1))));
    setDivisionSupplierAllocations(prev => {
      const current = prev[divId] || getFallbackDivisionSupplierShare(divId);
      const currentBreakdown = current.supplierBreakdown || {};
      return {
        ...prev,
        [divId]: {
          ...current,
          supplierBreakdown: {
            ...currentBreakdown,
            [supplierKey]: clamped
          }
        }
      };
    });
  };

  const handleAutoBalanceDivSupplier = (divId: string) => {
    setDivisionSupplierAllocations(prev => {
      const current = prev[divId] || getFallbackDivisionSupplierShare(divId);
      const sum = (current.supplier || 0) + (current.mainKitchen || 0) + (current.mainStore || 0) + (current.cash || 0);
      if (sum === 0) {
        return {
          ...prev,
          [divId]: {
            ...current,
            supplier: 25,
            mainKitchen: 25,
            mainStore: 25,
            cash: 25
          }
        };
      }
      const newSupplier = parseFloat(((current.supplier / sum) * 100).toFixed(1));
      const newMk = parseFloat(((current.mainKitchen / sum) * 100).toFixed(1));
      const newMs = parseFloat(((current.mainStore / sum) * 100).toFixed(1));
      const newCash = parseFloat(Math.max(0, 100 - newSupplier - newMk - newMs).toFixed(1));
      return {
        ...prev,
        [divId]: {
          ...current,
          supplier: newSupplier,
          mainKitchen: newMk,
          mainStore: newMs,
          cash: newCash
        }
      };
    });
  };

  const handleApplyDivSupplierPreset = (divId: string, presetKey: 'supplier_heavy' | 'mk_heavy' | 'store_heavy' | 'equal') => {
    setDivisionSupplierAllocations(prev => {
      const current = prev[divId] || getFallbackDivisionSupplierShare(divId);
      let newValues = { supplier: 50, mainKitchen: 30, mainStore: 10, cash: 10 };
      if (presetKey === 'supplier_heavy') {
        newValues = { supplier: 60, mainKitchen: 20, mainStore: 10, cash: 10 };
      } else if (presetKey === 'mk_heavy') {
        newValues = { supplier: 35, mainKitchen: 45, mainStore: 10, cash: 10 };
      } else if (presetKey === 'store_heavy') {
        newValues = { supplier: 20, mainKitchen: 10, mainStore: 45, cash: 25 };
      } else if (presetKey === 'equal') {
        newValues = { supplier: 25, mainKitchen: 25, mainStore: 25, cash: 25 };
      }
      return {
        ...prev,
        [divId]: {
          ...current,
          ...newValues
        }
      };
    });
  };

  const handleSaveDivisionSupplierAllocations = () => {
    localStorage.setItem(`COGS_DIV_SUPPLIER_ALLOCATIONS_${monthKey}`, JSON.stringify(divisionSupplierAllocations));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      divisionSupplierAllocations,
      divisionAllocations,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast('Alokasi belanja supplier per divisi berhasil disimpan ke COGS!', 'success');
    }
  };

  const handleCopyDivSupplierWhatsApp = (divId: string) => {
    const divObj = calculationModel.divisionList.find(d => d.id === divId);
    if (!divObj) return;
    const share = divisionSupplierAllocations[divId] || getFallbackDivisionSupplierShare(divId);
    const totalDivBudget = divObj.totalSisaBudget;
    const supNominal = Math.round(totalDivBudget * (share.supplier / 100));
    const mkNominal = Math.round(totalDivBudget * (share.mainKitchen / 100));
    const msNominal = Math.round(totalDivBudget * (share.mainStore / 100));
    const cashNominal = Math.round(totalDivBudget * (share.cash / 100));

    const outletName = selectedOutlet || data?.outlet || '';
    const text = `*ALOKASI BELANJA & SUPPLIER DIVISI ${divObj.name.toUpperCase()} (100% SISA BUDGET)*

*OUTLET* : ${outletName}
*PERIODE* : ${INDO_MONTHS[selectedMonth]} ${selectedYear}
*TOTAL SISA BUDGET ${divObj.name.toUpperCase()}* : *Rp ${totalDivBudget.toLocaleString('id-ID')}* (100%)
*JATAH / HARI SISA* : Rp ${divObj.dailyBudget.toLocaleString('id-ID')}
*JATAH / HARI ORDER (${orderDaysShortLabel})* : Rp ${divObj.orderDayBudget.toLocaleString('id-ID')}

----------------------------------------
*RINCIAN ALOKASI BELANJA & SUPPLIER:*
1. 🏢 *Rekanan Supplier (${share.supplier}%)*
   - Nominal Sisa: *Rp ${supNominal.toLocaleString('id-ID')}*
   - Per Hari Order: Rp ${calculationModel.remainingOrderDaysCount > 0 ? Math.round(supNominal / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}

2. 🍲 *Main Kitchen / MK (${share.mainKitchen}%)*
   - Nominal Sisa: *Rp ${mkNominal.toLocaleString('id-ID')}*
   - Per Hari Order: Rp ${calculationModel.remainingOrderDaysCount > 0 ? Math.round(mkNominal / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}

3. 📦 *Main Store / MS (${share.mainStore}%)*
   - Nominal Sisa: *Rp ${msNominal.toLocaleString('id-ID')}*
   - Per Hari Order: Rp ${calculationModel.remainingOrderDaysCount > 0 ? Math.round(msNominal / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}

4. 💵 *Cash Pasar (${share.cash}%)*
   - Nominal Sisa: *Rp ${cashNominal.toLocaleString('id-ID')}*
   - Per Hari Order: Rp ${calculationModel.remainingOrderDaysCount > 0 ? Math.round(cashNominal / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}

*Total Terdistribusi: ${(share.supplier + share.mainKitchen + share.mainStore + share.cash).toFixed(1)}% dari 100% Sisa Budget Divisi*`;

    navigator.clipboard.writeText(text).then(() => {
      if (showToast) showToast(`Format WA Alokasi Supplier Divisi ${divObj.name} berhasil disalin!`, 'success');
    });
  };

  // 7. Order Purchasing Days in Week (Default based on Regional Area: Jakarta & Bekasi/Cibubur -> Selasa, Kamis, Sabtu; Tanggerang -> Senin, Rabu, Jumat)
  const outletOrderSchedule = useMemo(() => {
    return getOrderScheduleForOutlet(selectedOutlet || data?.outlet || '');
  }, [selectedOutlet, data?.outlet]);

  const [selectedOrderDays, setSelectedOrderDays] = useState<number[]>(() => {
    const sched = getOrderScheduleForOutlet(selectedOutlet || data?.outlet || '');
    if (savedCogsData.orderDays && savedCogsData.orderDays.length > 0) {
      // If legacy data has Monday/Wednesday/Friday for a Tuesday/Thursday/Saturday area, update to area standard
      const isLegacyMonWedFri = savedCogsData.orderDays.length === 3 &&
        savedCogsData.orderDays.includes(1) && savedCogsData.orderDays.includes(3) && savedCogsData.orderDays.includes(5);
      const isTueThuSatArea = sched.dayIndices.includes(2) && sched.dayIndices.includes(4) && sched.dayIndices.includes(6);
      if (isLegacyMonWedFri && isTueThuSatArea) {
        return sched.dayIndices;
      }
      return savedCogsData.orderDays;
    }
    return sched.dayIndices;
  });

  useEffect(() => {
    const sched = outletOrderSchedule;
    if (savedCogsData.orderDays && savedCogsData.orderDays.length > 0) {
      const isLegacyMonWedFri = savedCogsData.orderDays.length === 3 &&
        savedCogsData.orderDays.includes(1) && savedCogsData.orderDays.includes(3) && savedCogsData.orderDays.includes(5);
      const isTueThuSatArea = sched.dayIndices.includes(2) && sched.dayIndices.includes(4) && sched.dayIndices.includes(6);
      if (isLegacyMonWedFri && isTueThuSatArea) {
        setSelectedOrderDays(sched.dayIndices);
      } else {
        setSelectedOrderDays(savedCogsData.orderDays);
      }
    } else {
      setSelectedOrderDays(sched.dayIndices);
    }
  }, [selectedOutlet, data?.outlet, savedCogsData.orderDays, outletOrderSchedule]);

  const orderDaysLabel = useMemo(() => {
    if (!selectedOrderDays || selectedOrderDays.length === 0) return 'Tidak Ada';
    return selectedOrderDays.map(d => INDO_DAYS[d]).join(', ');
  }, [selectedOrderDays]);

  const orderDaysShortLabel = useMemo(() => {
    if (!selectedOrderDays || selectedOrderDays.length === 0) return '-';
    return selectedOrderDays.map(d => INDO_DAYS[d].substring(0, 3)).join('/');
  }, [selectedOrderDays]);

  // UI state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [activeTableFilter, setActiveTableFilter] = useState<'ALL' | 'CUTOFF_PAST' | 'CUTOFF_REMAINING' | 'ORDER_DAYS'>('ALL');
  const [activeChartTab, setActiveChartTab] = useState<'TREND' | 'DIVISION' | 'SUPPLIER'>('TREND');
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<'ALL' | 'STRATEGY' | 'MTD' | 'WEEKDAY' | 'WEEKEND'>('ALL');

  // 9. Navigation Mode: 'OVERVIEW' vs 'ALOKASI_BUDGET' (Alokasi Budget Belanja MK, MS, Cash & Supplier terhubung ke COGS)
  const [cogsMainTab, setCogsMainTab] = useState<'OVERVIEW' | 'ALOKASI_BUDGET'>('OVERVIEW');
  const [alokasiCategoryFilter, setAlokasiCategoryFilter] = useState<'ALL' | 'SUPPLIERS' | 'INTERNAL'>('ALL');
  const [alokasiSearch, setAlokasiSearch] = useState<string>('');
  const [procurementBudgetBasis, setProcurementBudgetBasis] = useState<'COGS_TARGET' | 'COGS_REMAINING' | 'ACTUAL_SPEND' | 'CUSTOM'>(() => {
    return (savedCogsData as any).procurementBudgetBasis || 'COGS_TARGET';
  });
  const [customProcurementBudget, setCustomProcurementBudget] = useState<number>(() => {
    return (savedCogsData as any).customProcurementBudget || 0;
  });
  const [isEditingProcurementBudgetModal, setIsEditingProcurementBudgetModal] = useState<boolean>(false);
  const [inputProcurementBudgetValue, setInputProcurementBudgetValue] = useState<string>('');

  // 8. Strategi Target Sales State (Target Today Revenue x % Kontribusi Lunch/Dinner x 80% Percepatan / 20% Penyeimbang)
  const defaultStrategyTargetDate = useMemo(() => {
    if (savedCogsData.strategyTargetDate) return savedCogsData.strategyTargetDate;
    if (selectedDate && selectedDate.startsWith(monthKey)) return selectedDate;
    const curM = currentDate.getMonth();
    const curY = currentDate.getFullYear();
    const d = (selectedYear === curY && selectedMonth === curM)
      ? currentDate.getDate()
      : Math.min(cutoffDay, daysInMonth);
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }, [savedCogsData.strategyTargetDate, selectedDate, monthKey, selectedYear, selectedMonth, cutoffDay, daysInMonth, currentDate]);

  const [strategyTargetDate, setStrategyTargetDate] = useState<string>(defaultStrategyTargetDate);

  useEffect(() => {
    if (savedCogsData.strategyTargetDate) {
      setStrategyTargetDate(savedCogsData.strategyTargetDate);
    } else {
      setStrategyTargetDate(defaultStrategyTargetDate);
    }
  }, [defaultStrategyTargetDate, savedCogsData.strategyTargetDate]);

  // Target Revenue from System (strictly connected with Admin Panel dailyTargets / sales.dailyTarget)
  const systemDailyTargetForDate = useMemo(() => {
    let t = data?.dailyTargets?.[strategyTargetDate];
    if (t === undefined) {
      const dNum = parseInt(strategyTargetDate.split('-')[2] || '0', 10);
      if (dNum > 0 && data?.dailyTargets?.[String(dNum)] !== undefined) {
        t = data.dailyTargets[String(dNum)];
      }
    }
    if (t === undefined && data?.sales?.dailyTargets) {
      t = data.sales.dailyTargets[strategyTargetDate];
    }
    if (t === undefined && data?.sales?.dailyTarget) {
      t = data.sales.dailyTarget;
    }
    if (!t && data?.sales?.monthlyBudgets?.[monthKey] && daysInMonth > 0) {
      t = Math.round(data.sales.monthlyBudgets[monthKey] / daysInMonth);
    }
    if (!t && data?.sales?.budgetRevenue && daysInMonth > 0) {
      t = Math.round(data.sales.budgetRevenue / daysInMonth);
    }
    return t || 0;
  }, [data?.dailyTargets, data?.sales?.dailyTargets, data?.sales?.dailyTarget, data?.sales?.monthlyBudgets, data?.sales?.budgetRevenue, monthKey, daysInMonth, strategyTargetDate]);

  // Target Today Revenue: DIBEKUKAN & TERHUBUNG LANGSUNG DENGAN TARGET TODAY DI ADMIN PANEL
  const strategyTargetRevenue = systemDailyTargetForDate;

  // Strategi Rasio: % Percepatan (default 80%) & % Penyeimbang (default 20%) - DAPAT DIATUR MANUAL
  const [percepatanPercent, setPercepatanPercent] = useState<number>(() => {
    if (savedCogsData.strategyPercepatanPercent !== undefined) return savedCogsData.strategyPercepatanPercent;
    const local = localStorage.getItem(`COGS_STRATEGY_PERCEPATAN_${monthKey}`);
    return local ? parseFloat(local) : 80;
  });

  const [penyeimbangPercent, setPenyeimbangPercent] = useState<number>(() => {
    if (savedCogsData.strategyPenyeimbangPercent !== undefined) return savedCogsData.strategyPenyeimbangPercent;
    const local = localStorage.getItem(`COGS_STRATEGY_PENYEIMBANG_${monthKey}`);
    return local ? parseFloat(local) : 20;
  });

  const [strategyBasis, setStrategyBasis] = useState<'AUTO' | 'MTD' | 'WEEKDAY' | 'WEEKEND' | 'MANUAL'>(() => {
    if (savedCogsData.strategyBasis) return savedCogsData.strategyBasis;
    return 'AUTO';
  });

  const [manualLunchPercent, setManualLunchPercent] = useState<number>(() => {
    if (savedCogsData.strategyManualLunchPercent !== undefined) return savedCogsData.strategyManualLunchPercent;
    return 40;
  });

  const [manualDinnerPercent, setManualDinnerPercent] = useState<number>(() => {
    if (savedCogsData.strategyManualDinnerPercent !== undefined) return savedCogsData.strategyManualDinnerPercent;
    return 60;
  });

  const handlePercepatanChange = (val: number) => {
    const p = Math.min(100, Math.max(0, val));
    setPercepatanPercent(p);
    const balance = Math.max(0, parseFloat((100 - p).toFixed(1)));
    setPenyeimbangPercent(balance);
  };

  const handlePenyeimbangChange = (val: number) => {
    const p = Math.min(100, Math.max(0, val));
    setPenyeimbangPercent(p);
    const balance = Math.max(0, parseFloat((100 - p).toFixed(1)));
    setPercepatanPercent(balance);
  };

  // Aggregated data source based on selectedOutlet
  const combinedState = useMemo(() => {
    const states: AppState[] = [];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      if (allMonthlyData && (allMonthlyData as any)[selectedOutlet]) {
        const outletMap = (allMonthlyData as any)[selectedOutlet];
        const m = outletMap[String(selectedMonth)] || outletMap[selectedMonth];
        if (m) states.push(m as AppState);
      } else if (data && (!data.outlet || data.outlet === selectedOutlet)) {
        states.push(data);
      }
    } else {
      if (allMonthlyData) {
        Object.entries(allMonthlyData).forEach(([_, outletVal]: [string, any]) => {
          if (outletVal) {
            const m = outletVal[String(selectedMonth)] || outletVal[selectedMonth];
            if (m) states.push(m as AppState);
            else if (outletVal.sales || outletVal.expenses) states.push(outletVal as AppState);
          }
        });
      }
      if (states.length === 0 && data) {
        states.push(data);
      }
    }
    return states;
  }, [data, allMonthlyData, selectedOutlet, selectedMonth]);

  // Helper: Daily Revenue from Sales (with Lunch & Dinner breakdown)
  const getRevenueForDate = (dateStr: string): { 
    revenue: number; 
    lunchRevenue: number; 
    dinnerRevenue: number; 
    isRecorded: boolean 
  } => {
    let totalRev = 0;
    let lunchRev = 0;
    let dinnerRev = 0;
    let recorded = false;

    for (const st of combinedState) {
      const rec = st.sales?.dailyRecording?.[dateStr];
      if (rec) {
        let recLunch = Number(rec.lunchRevenue) || Number((rec as any).revenueLunch) || Number((rec as any).lunchActual) || 0;
        let recDinner = Number(rec.dinnerRevenue) || Number((rec as any).revenueDinner) || Number((rec as any).dinnerActual) || 0;
        let recTotal = 0;

        if (typeof rec.revenue === 'number' && rec.revenue > 0) {
          recTotal = rec.revenue;
          recorded = true;
        } else {
          const revSum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
          if (revSum > 0) {
            recTotal = revSum;
            recorded = true;
          } else {
            const dineIn = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) + 
                           (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
            if (dineIn > 0) {
              recTotal = dineIn;
              recorded = true;
            }
          }
        }

        // Sensible fallback breakdown if total is recorded but lunch/dinner are 0
        if (recTotal > 0 && recLunch === 0 && recDinner === 0) {
          recLunch = Math.round(recTotal * 0.40);
          recDinner = recTotal - recLunch;
        } else if (recDinner === 0 && recTotal > recLunch && recLunch > 0) {
          recDinner = recTotal - recLunch;
        } else if (recLunch === 0 && recTotal > recDinner && recDinner > 0) {
          recLunch = recTotal - recDinner;
        }

        if (recTotal > 0 || recLunch > 0 || recDinner > 0) {
          totalRev += recTotal;
          lunchRev += recLunch;
          dinnerRev += recDinner;
          recorded = true;
        }
      }
    }
    return { revenue: totalRev, lunchRevenue: lunchRev, dinnerRevenue: dinnerRev, isRecorded: recorded };
  };

  // Helper: Daily Purchases from Supplier Ledgers & Expenses (Exact 1:1 match with ReceivingSheetModule Total Cost)
  const getSupplierPurchasesForDate = (dateStr: string) => {
    const result: Record<string, number> = {
      mainStore: 0,
      mainKitchen: 0,
      cash: 0,
      saungKubil: 0,
      tgif: 0,
      panfila: 0,
      everest: 0,
      sukanda: 0,
      ikigai: 0,
      kebunku: 0,
      total: 0,
    };

    // Calculate deductions (Chemical, Stationary, Marketing) for this date to subtract from Main Store
    let dayChemTotal = 0;
    let dayStatTotal = 0;
    let dayMktTotal = 0;

    for (const st of combinedState) {
      const chemList = (st.dailyChemicalLedger?.[dateStr] || (st as any).dailyChemical?.[dateStr]) as LedgerItem[];
      if (Array.isArray(chemList) && chemList.length > 0) {
        chemList.forEach(item => {
          const q = Number(item.qty) || 1;
          const p = Number(item.price) || 0;
          const sub = q * p;
          const cat = String(item.category || '').toUpperCase();
          if (cat === 'STATIONARY') {
            dayStatTotal += sub;
          } else if (cat === 'MARKETING') {
            dayMktTotal += sub;
          } else {
            dayChemTotal += sub;
          }
        });
      }

      const atkList = (st.dailyAtkLedger?.[dateStr] || (st as any).dailyAtk?.[dateStr]) as LedgerItem[];
      if (Array.isArray(atkList) && atkList.length > 0) {
        atkList.forEach(item => {
          const q = Number(item.qty) || 1;
          const p = Number(item.price) || 0;
          dayStatTotal += (q * p);
        });
      }

      if (st.expenses?.[dateStr]) {
        const exp = st.expenses[dateStr];
        const cVal = Number(exp.chemical) || 0;
        const sVal = Number((exp as any).stationary) || Number(exp.atk) || 0;
        const mVal = Number((exp as any).marketing) || 0;
        if (cVal > 0 && dayChemTotal === 0) dayChemTotal += cVal;
        if (sVal > 0 && dayStatTotal === 0) dayStatTotal += sVal;
        if (mVal > 0 && dayMktTotal === 0) dayMktTotal += mVal;
      }
    }
    const totalDeductionsForDay = dayChemTotal + dayStatTotal + dayMktTotal;

    SUPPLIERS_CONFIG.forEach(sup => {
      let supCost = 0;
      for (const st of combinedState) {
        if (sup.id === 'cash') {
          let cashSum = 0;

          // 1. Daily Cash Ledger
          const cashList = st.dailyCashLedger?.[dateStr] as LedgerItem[];
          if (Array.isArray(cashList) && cashList.length > 0) {
            cashSum += cashList.reduce((acc, item) => acc + ((Number(item.qty) || 1) * (Number(item.price) || 0)), 0);
          }

          // 2. Daily Commodity Ledger (Auto masuk ke CASH di Receiving Sheet)
          const commList = st.dailyCommodityLedger?.[dateStr] as LedgerItem[];
          if (Array.isArray(commList) && commList.length > 0) {
            cashSum += commList.reduce((acc, item) => acc + ((Number(item.qty) || 1) * (Number(item.price) || 0)), 0);
          }

          // 3. Fallback to expenses summary object if ledgers empty
          if (cashSum === 0 && st.expenses?.[dateStr]) {
            const exp = st.expenses[dateStr];
            cashSum = (Number(exp.cash) || 0) + (Number(exp.commodity) || 0);
          }

          supCost += cashSum;
        } else if (sup.id === 'mainStore') {
          let grossStore = 0;
          const storeList = (st.dailyMainStoreLedger?.[dateStr] || (st as any).dailyMainStore?.[dateStr]) as LedgerItem[];
          if (Array.isArray(storeList) && storeList.length > 0) {
            grossStore += storeList.reduce((acc, item) => {
              const q = Number(item.qty) || 1;
              const p = Number(item.price) || 0;
              return acc + (q * p);
            }, 0);
          } else if (st.expenses?.[dateStr]?.mainStore) {
            grossStore += Number(st.expenses[dateStr].mainStore) || 0;
          }
          const netStore = Math.max(0, grossStore - totalDeductionsForDay);
          supCost += netStore;
        } else {
          const ledgerList = (st as any)[sup.key]?.[dateStr] as LedgerItem[];
          if (Array.isArray(ledgerList) && ledgerList.length > 0) {
            const sum = ledgerList.reduce((acc, item) => {
              const q = Number(item.qty) || 1;
              const p = Number(item.price) || 0;
              return acc + (q * p);
            }, 0);
            supCost += sum;
          } else if (st.expenses?.[dateStr]) {
            // Fallback to expenses if ledger is empty
            const exp = st.expenses[dateStr];
            const expVal = Number((exp as any)[sup.id]) || 0;
            if (expVal > 0) {
              supCost += expVal;
            }
          }
        }
      }
      result[sup.id] = supCost;
      result.total += supCost;
    });

    return result;
  };

  // Build calendar matrix and calculate actual cut-off & remaining stats
  const calculationModel = useMemo(() => {
    const monthPad = String(selectedMonth + 1).padStart(2, '0');

    // 1. Full Days List
    const days = [];
    let pastWeekdayCount = 0;
    let pastWeekendCount = 0;
    let pastWeekdayRecordedCount = 0;
    let pastWeekendRecordedCount = 0;
    let pastWeekdayRevSum = 0;
    let pastWeekendRevSum = 0;
    let actualRevenueMTD = 0;
    let receivingSheetBelanjaMTD = 0;

    // Daypart analytics tracking
    const dayOfWeekStats: Record<number, {
      dayName: string;
      isWeekday: boolean;
      count: number;
      lunchSum: number;
      dinnerSum: number;
      totalSum: number;
    }> = {
      1: { dayName: 'Senin', isWeekday: true, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      2: { dayName: 'Selasa', isWeekday: true, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      3: { dayName: 'Rabu', isWeekday: true, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      4: { dayName: 'Kamis', isWeekday: true, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      5: { dayName: 'Jumat', isWeekday: true, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      6: { dayName: 'Sabtu', isWeekday: false, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 },
      0: { dayName: 'Minggu', isWeekday: false, count: 0, lunchSum: 0, dinnerSum: 0, totalSum: 0 }
    };

    let mtdLunchSum = 0;
    let mtdDinnerSum = 0;
    let mtdRecordedDaysCount = 0;

    const supplierMtdTotals: Record<string, number> = {
      mainStore: 0,
      mainKitchen: 0,
      cash: 0,
      saungKubil: 0,
      tgif: 0,
      panfila: 0,
      everest: 0,
      sukanda: 0,
    };

    let remainingWeekdayCount = 0;
    let remainingWeekendCount = 0;
    let remainingTotalDays = 0;
    let remainingOrderDaysCount = 0;
    const remainingOrderDates: string[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dObj = new Date(selectedYear, selectedMonth, day);
      const dayOfWeek = dObj.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isOrderDay = selectedOrderDays.includes(dayOfWeek);

      const dateStr = `${selectedYear}-${monthPad}-${String(day).padStart(2, '0')}`;
      const { revenue: actRev, lunchRevenue: dayLunch, dinnerRevenue: dayDinner, isRecorded } = getRevenueForDate(dateStr);
      const purchases = getSupplierPurchasesForDate(dateStr);

      const isPastOrCutoff = day <= cutoffDay;

      if (isPastOrCutoff) {
        actualRevenueMTD += actRev;
        receivingSheetBelanjaMTD += purchases.total;

        SUPPLIERS_CONFIG.forEach(sup => {
          supplierMtdTotals[sup.id] += (purchases[sup.id] || 0);
        });

        if (actRev > 0 || isRecorded) {
          mtdRecordedDaysCount++;
          mtdLunchSum += dayLunch;
          mtdDinnerSum += dayDinner;

          dayOfWeekStats[dayOfWeek].count++;
          dayOfWeekStats[dayOfWeek].lunchSum += dayLunch;
          dayOfWeekStats[dayOfWeek].dinnerSum += dayDinner;
          dayOfWeekStats[dayOfWeek].totalSum += actRev;
        }

        if (isWeekday) {
          pastWeekdayCount++;
          if (actRev > 0 || isRecorded) {
            pastWeekdayRecordedCount++;
            pastWeekdayRevSum += actRev;
          }
        } else {
          pastWeekendCount++;
          if (actRev > 0 || isRecorded) {
            pastWeekendRecordedCount++;
            pastWeekendRevSum += actRev;
          }
        }
      } else {
        remainingTotalDays++;
        if (isWeekday) remainingWeekdayCount++;
        if (isWeekend) remainingWeekendCount++;
        if (isOrderDay) {
          remainingOrderDaysCount++;
          remainingOrderDates.push(`${day} ${INDO_MONTHS[selectedMonth]} (${INDO_DAYS[dayOfWeek]})`);
        }
      }

      days.push({
        day,
        dateStr,
        dayName: INDO_DAYS[dayOfWeek],
        dayOfWeek,
        isWeekday,
        isWeekend,
        isOrderDay,
        isPastOrCutoff,
        isRecorded,
        actualRevenue: actRev,
        purchases
      });
    }

    // Receiving Sheet Total Belanja for the month (ambil dari total belanja fitur Receiving Sheet)
    const fullMonthReceivingBelanja = days.reduce((sum, d) => sum + (d.purchases?.total || 0), 0);

    // Effective MTD Belanja: ALWAYS taken from Total Belanja on Receiving Sheet (or manual override)
    const actualBelanjaMTD = useManualMtdBelanja && manualMtdBelanja !== ''
      ? (parseFloat(manualMtdBelanja) || 0)
      : (fullMonthReceivingBelanja > 0 ? fullMonthReceivingBelanja : receivingSheetBelanjaMTD);

    // 2. Average Sales Weekday & Weekend (Hasil MTD dari Rekapan Harian Revenue Daily Revenue)
    const autoAvgWeekday = pastWeekdayRecordedCount > 0
      ? Math.round(pastWeekdayRevSum / pastWeekdayRecordedCount)
      : (pastWeekdayCount > 0 && pastWeekdayRevSum > 0 ? Math.round(pastWeekdayRevSum / pastWeekdayCount) : 0);

    const autoAvgWeekend = pastWeekendRecordedCount > 0
      ? Math.round(pastWeekendRevSum / pastWeekendRecordedCount)
      : (pastWeekendCount > 0 && pastWeekendRevSum > 0 ? Math.round(pastWeekendRevSum / pastWeekendCount) : 0);

    const avgWeekdaySales = autoAvgWeekday;
    const avgWeekendSales = autoAvgWeekend;

    // 3. Forecast Sisa Hari (Senin-Jumat & Sabtu-Minggu)
    // Sisa Hari Weekday * Rata" Sales Weekday
    const forecastWeekdayRevenue = remainingWeekdayCount * avgWeekdaySales;
    // Sisa Hari Weekend * Rata" Sales Weekend
    const forecastWeekendRevenue = remainingWeekendCount * avgWeekendSales;
    // Total Forecast Revenue Sisa Hari
    const totalForecastRevenueRemaining = forecastWeekdayRevenue + forecastWeekendRevenue;

    // 4. Total Projected Revenue Bulan Ini
    // Actual Revenue (1 s/d Cutoff) + Forecast Revenue (Cutoff+1 s/d Akhir Bulan)
    const totalProjectedRevenue = actualRevenueMTD + totalForecastRevenueRemaining;

    // 5. Daypart Analytics (MTD, Weekday, Weekend)
    const effectiveMtdDays = mtdRecordedDaysCount > 0 ? mtdRecordedDaysCount : (cutoffDay > 0 ? cutoffDay : 1);
    const avgDailyRevenue = mtdRecordedDaysCount > 0 ? Math.round(actualRevenueMTD / mtdRecordedDaysCount) : 0;
    const avgDailyLunch = mtdRecordedDaysCount > 0 ? Math.round(mtdLunchSum / mtdRecordedDaysCount) : 0;
    const avgDailyDinner = mtdRecordedDaysCount > 0 ? Math.round(mtdDinnerSum / mtdRecordedDaysCount) : 0;
    const lunchContributionPercent = actualRevenueMTD > 0 ? (mtdLunchSum / actualRevenueMTD) * 100 : 0;
    const dinnerContributionPercent = actualRevenueMTD > 0 ? (mtdDinnerSum / actualRevenueMTD) * 100 : 0;

    // Weekday analytics (Senin s/d Jumat: 1, 2, 3, 4, 5)
    const weekdayDayList = [1, 2, 3, 4, 5].map(dIdx => {
      const item = dayOfWeekStats[dIdx];
      const count = item.count;
      const avgLunch = count > 0 ? Math.round(item.lunchSum / count) : 0;
      const avgDinner = count > 0 ? Math.round(item.dinnerSum / count) : 0;
      const avgTotal = count > 0 ? Math.round(item.totalSum / count) : 0;
      const lunchContrib = item.totalSum > 0 ? (item.lunchSum / item.totalSum) * 100 : 0;
      const dinnerContrib = item.totalSum > 0 ? (item.dinnerSum / item.totalSum) * 100 : 0;
      return {
        dayIndex: dIdx,
        dayName: item.dayName,
        count,
        lunchSum: item.lunchSum,
        avgLunch,
        lunchContrib,
        dinnerSum: item.dinnerSum,
        avgDinner,
        dinnerContrib,
        totalSum: item.totalSum,
        avgTotal
      };
    });

    const totalWeekdayLunchSum = weekdayDayList.reduce((acc, x) => acc + x.lunchSum, 0);
    const totalWeekdayDinnerSum = weekdayDayList.reduce((acc, x) => acc + x.dinnerSum, 0);
    const avgWeekdayLunch = pastWeekdayRecordedCount > 0 ? Math.round(totalWeekdayLunchSum / pastWeekdayRecordedCount) : 0;
    const avgWeekdayDinner = pastWeekdayRecordedCount > 0 ? Math.round(totalWeekdayDinnerSum / pastWeekdayRecordedCount) : 0;
    const weekdayTotalLunchContrib = pastWeekdayRevSum > 0 ? (totalWeekdayLunchSum / pastWeekdayRevSum) * 100 : 0;
    const weekdayTotalDinnerContrib = pastWeekdayRevSum > 0 ? (totalWeekdayDinnerSum / pastWeekdayRevSum) * 100 : 0;

    // Weekend analytics (Sabtu: 6, Minggu: 0)
    const weekendDayList = [6, 0].map(dIdx => {
      const item = dayOfWeekStats[dIdx];
      const count = item.count;
      const avgLunch = count > 0 ? Math.round(item.lunchSum / count) : 0;
      const avgDinner = count > 0 ? Math.round(item.dinnerSum / count) : 0;
      const avgTotal = count > 0 ? Math.round(item.totalSum / count) : 0;
      const lunchContrib = item.totalSum > 0 ? (item.lunchSum / item.totalSum) * 100 : 0;
      const dinnerContrib = item.totalSum > 0 ? (item.dinnerSum / item.totalSum) * 100 : 0;
      return {
        dayIndex: dIdx,
        dayName: item.dayName,
        count,
        lunchSum: item.lunchSum,
        avgLunch,
        lunchContrib,
        dinnerSum: item.dinnerSum,
        avgDinner,
        dinnerContrib,
        totalSum: item.totalSum,
        avgTotal
      };
    });

    const totalWeekendLunchSum = weekendDayList.reduce((acc, x) => acc + x.lunchSum, 0);
    const totalWeekendDinnerSum = weekendDayList.reduce((acc, x) => acc + x.dinnerSum, 0);
    const avgWeekendLunch = pastWeekendRecordedCount > 0 ? Math.round(totalWeekendLunchSum / pastWeekendRecordedCount) : 0;
    const avgWeekendDinner = pastWeekendRecordedCount > 0 ? Math.round(totalWeekendDinnerSum / pastWeekendRecordedCount) : 0;
    const weekendTotalLunchContrib = pastWeekendRevSum > 0 ? (totalWeekendLunchSum / pastWeekendRevSum) * 100 : 0;
    const weekendTotalDinnerContrib = pastWeekendRevSum > 0 ? (totalWeekendDinnerSum / pastWeekendRevSum) * 100 : 0;

    const daypartAnalytics = {
      mtd: {
        recordedDays: mtdRecordedDaysCount,
        totalRevenue: actualRevenueMTD,
        avgRevenue: avgDailyRevenue,
        totalLunch: mtdLunchSum,
        avgLunch: avgDailyLunch,
        lunchContrib: lunchContributionPercent,
        totalDinner: mtdDinnerSum,
        avgDinner: avgDailyDinner,
        dinnerContrib: dinnerContributionPercent,
      },
      weekday: {
        days: weekdayDayList,
        recordedDays: pastWeekdayRecordedCount,
        totalRevenue: pastWeekdayRevSum,
        avgRevenue: avgWeekdaySales,
        totalLunch: totalWeekdayLunchSum,
        avgLunch: avgWeekdayLunch,
        lunchContrib: weekdayTotalLunchContrib,
        totalDinner: totalWeekdayDinnerSum,
        avgDinner: avgWeekdayDinner,
        dinnerContrib: weekdayTotalDinnerContrib,
      },
      weekend: {
        days: weekendDayList,
        recordedDays: pastWeekendRecordedCount,
        totalRevenue: pastWeekendRevSum,
        avgRevenue: avgWeekendSales,
        totalLunch: totalWeekendLunchSum,
        avgLunch: avgWeekendLunch,
        lunchContrib: weekendTotalLunchContrib,
        totalDinner: totalWeekendDinnerSum,
        avgDinner: avgWeekendDinner,
        dinnerContrib: weekendTotalDinnerContrib,
      }
    };

    // 7. Set Budget Belanja (e.g. 43.00%)
    // Total Alokasi Budget Belanja = Total Projected Revenue * Target Budget %
    const totalTargetBudgetBelanja = Math.round(totalProjectedRevenue * (targetBudgetPercent / 100));

    // Sisa Budget Belanja untuk mencapai Target Budget %
    const sisaBudgetBelanja = totalTargetBudgetBelanja - actualBelanjaMTD;

    // Rata-rata Batas Belanja per Hari Sisa
    const dailyPurchasingBudgetRemaining = remainingTotalDays > 0
      ? Math.round(sisaBudgetBelanja / remainingTotalDays)
      : 0;

    // Jatah Belanja per Hari Order (Jumat, Senin, Rabu / Selasa, Kamis, Sabtu)
    const budgetPerOrderDay = remainingOrderDaysCount > 0
      ? Math.round(sisaBudgetBelanja / remainingOrderDaysCount)
      : dailyPurchasingBudgetRemaining;

    // 8. Inventory & COGS Calculations:
    // If Ending Inventory is set in Receiving Sheet, it directly controls and affects Closing Inventory:
    const hasEndingInvFromReceiving = savedCogsData.endingInventory !== undefined && Number(savedCogsData.endingInventory) > 0;
    const endingInventoryNominal = hasEndingInvFromReceiving ? Number(savedCogsData.endingInventory) : 0;

    let closingInventory = 0;
    let closingInventoryPercent = closingInvPercent;

    if (hasEndingInvFromReceiving) {
      closingInventory = endingInventoryNominal;
      if (totalProjectedRevenue > 0) {
        closingInventoryPercent = Number(((endingInventoryNominal / totalProjectedRevenue) * 100).toFixed(2));
      } else if (actualRevenueMTD > 0) {
        closingInventoryPercent = Number(((endingInventoryNominal / actualRevenueMTD) * 100).toFixed(2));
      } else if (savedCogsData.closingInventoryPercent !== undefined) {
        closingInventoryPercent = savedCogsData.closingInventoryPercent;
      }
    } else {
      closingInventory = Math.round(totalProjectedRevenue * (closingInvPercent / 100));
      closingInventoryPercent = closingInvPercent;
    }

    const effectiveCOGS = Math.max(0, openingInventory + totalTargetBudgetBelanja - closingInventory);
    const actualCogsPercent = totalProjectedRevenue > 0 ? (effectiveCOGS / totalProjectedRevenue) * 100 : 0;

    // Persentase Aktual Belanja = Total Belanja MTD / Actual Revenue MTD
    const actualBelanjaPercent = actualRevenueMTD > 0
      ? (actualBelanjaMTD / actualRevenueMTD) * 100
      : 0;

    // Estimasi Closing Inventory Max 11% dari Total Projected Revenue
    const maxClosingInvNominal = Math.round(totalProjectedRevenue * (maxClosingInvPercent / 100));
    const isClosingInvSafe = closingInvPercent <= maxClosingInvPercent;
    const isActualCogsSafe = actualCogsPercent <= targetBudgetPercent;

    // 8. Pembagian Jatah Belanja per Divisi dari Nominal Sisa Budget Belanja:
    const calculatedDivisionsList = divisionAllocations.map(div => {
      const p = div.percent || 0;
      const nominalSisa = Math.round(sisaBudgetBelanja * (p / 100));
      const dailyBgt = remainingTotalDays > 0 ? Math.round(nominalSisa / remainingTotalDays) : 0;
      const orderBgt = remainingOrderDaysCount > 0 ? Math.round(nominalSisa / remainingOrderDaysCount) : dailyBgt;

      const share = divisionSupplierAllocations[div.id] || getFallbackDivisionSupplierShare(div.id);
      const supplierPct = share.supplier ?? 0;
      const mkPct = share.mainKitchen ?? 0;
      const msPct = share.mainStore ?? 0;
      const cashPct = share.cash ?? 0;
      const totalDivSupplierPct = supplierPct + mkPct + msPct + cashPct;

      const supplierNominal = Math.round(nominalSisa * (supplierPct / 100));
      const mkNominal = Math.round(nominalSisa * (mkPct / 100));
      const msNominal = Math.round(nominalSisa * (msPct / 100));
      const cashNominal = Math.round(nominalSisa * (cashPct / 100));

      const supplierDaily = remainingTotalDays > 0 ? Math.round(supplierNominal / remainingTotalDays) : 0;
      const mkDaily = remainingTotalDays > 0 ? Math.round(mkNominal / remainingTotalDays) : 0;
      const msDaily = remainingTotalDays > 0 ? Math.round(msNominal / remainingTotalDays) : 0;
      const cashDaily = remainingTotalDays > 0 ? Math.round(cashNominal / remainingTotalDays) : 0;

      const supplierOrderDay = remainingOrderDaysCount > 0 ? Math.round(supplierNominal / remainingOrderDaysCount) : supplierDaily;
      const mkOrderDay = remainingOrderDaysCount > 0 ? Math.round(mkNominal / remainingOrderDaysCount) : mkDaily;
      const msOrderDay = remainingOrderDaysCount > 0 ? Math.round(msNominal / remainingOrderDaysCount) : msDaily;
      const cashOrderDay = remainingOrderDaysCount > 0 ? Math.round(cashNominal / remainingOrderDaysCount) : cashDaily;

      return {
        id: div.id,
        name: div.name,
        percent: p,
        color: div.color || 'blue',
        icon: div.icon || 'fa-tag',
        isCustom: div.isCustom,
        totalSisaBudget: nominalSisa,
        dailyBudget: dailyBgt,
        orderDayBudget: orderBgt,
        supplierShare: share,
        supplierPct,
        mkPct,
        msPct,
        cashPct,
        totalDivSupplierPct,
        supplierNominal,
        mkNominal,
        msNominal,
        cashNominal,
        supplierDaily,
        mkDaily,
        msDaily,
        cashDaily,
        supplierOrderDay,
        mkOrderDay,
        msOrderDay,
        cashOrderDay
      };
    });

    const kDiv = calculatedDivisionsList.find(d => d.id === 'kitchen') || {
      id: 'kitchen',
      name: 'Kitchen',
      percent: kitchenPercent,
      color: 'blue',
      icon: 'fa-utensils',
      totalSisaBudget: Math.round(sisaBudgetBelanja * (kitchenPercent / 100)),
      dailyBudget: remainingTotalDays > 0 ? Math.round((sisaBudgetBelanja * (kitchenPercent / 100)) / remainingTotalDays) : 0,
      orderDayBudget: remainingOrderDaysCount > 0 ? Math.round((sisaBudgetBelanja * (kitchenPercent / 100)) / remainingOrderDaysCount) : 0
    };
    const bDiv = calculatedDivisionsList.find(d => d.id === 'bar') || {
      id: 'bar',
      name: 'Bar',
      percent: barPercent,
      color: 'amber',
      icon: 'fa-cocktail',
      totalSisaBudget: Math.round(sisaBudgetBelanja * (barPercent / 100)),
      dailyBudget: remainingTotalDays > 0 ? Math.round((sisaBudgetBelanja * (barPercent / 100)) / remainingTotalDays) : 0,
      orderDayBudget: remainingOrderDaysCount > 0 ? Math.round((sisaBudgetBelanja * (barPercent / 100)) / remainingOrderDaysCount) : 0
    };
    const sDiv = calculatedDivisionsList.find(d => d.id === 'service') || {
      id: 'service',
      name: 'Service',
      percent: servicePercent,
      color: 'purple',
      icon: 'fa-concierge-bell',
      totalSisaBudget: Math.round(sisaBudgetBelanja * (servicePercent / 100)),
      dailyBudget: remainingTotalDays > 0 ? Math.round((sisaBudgetBelanja * (servicePercent / 100)) / remainingTotalDays) : 0,
      orderDayBudget: remainingOrderDaysCount > 0 ? Math.round((sisaBudgetBelanja * (servicePercent / 100)) / remainingOrderDaysCount) : 0
    };

    const divisions = {
      kitchen: kDiv,
      bar: bDiv,
      service: sDiv
    };

    return {
      cutoffDay,
      days,
      pastWeekdayCount,
      pastWeekendCount,
      pastWeekdayRecordedCount,
      pastWeekendRecordedCount,
      pastWeekdayRevSum,
      pastWeekendRevSum,
      actualRevenueMTD,
      receivingSheetBelanjaMTD,
      actualBelanjaMTD,
      supplierMtdTotals,
      remainingWeekdayCount,
      remainingWeekendCount,
      remainingTotalDays,
      remainingOrderDaysCount,
      remainingOrderDates,
      avgWeekdaySales,
      avgWeekendSales,
      forecastWeekdayRevenue,
      forecastWeekendRevenue,
      totalForecastRevenueRemaining,
      totalProjectedRevenue,
      closingInventory,
      closingInventoryPercent,
      effectiveCOGS,
      actualCogsPercent,
      actualBelanjaPercent,
      maxClosingInvNominal,
      isClosingInvSafe,
      isActualCogsSafe,
      totalTargetBudgetBelanja,
      sisaBudgetBelanja,
      dailyPurchasingBudgetRemaining,
      budgetPerOrderDay,
      divisionList: calculatedDivisionsList,
      divisions,
      daypartAnalytics,
      hasEndingInvFromReceiving,
      endingInventoryNominal
    };
  }, [
    selectedMonth,
    selectedYear,
    daysInMonth,
    cutoffDay,
    combinedState,
    useManualMtdBelanja,
    manualMtdBelanja,
    selectedOrderDays,
    openingInventory,
    closingInvPercent,
    maxClosingInvPercent,
    targetBudgetPercent,
    kitchenPercent,
    barPercent,
    servicePercent,
    divisionAllocations,
    divisionSupplierAllocations,
    savedCogsData
  ]);

  // Derived nominal closing inventory for ease of use across exports and components
  const closingInventory = calculationModel.closingInventory;

  // Daily Chart and Table Rows with Projected Values
  const dailyTableData = useMemo(() => {
    let cumRevenue = 0;
    let cumPurchases = 0;

    return calculationModel.days.map(d => {
      const isActual = d.isPastOrCutoff;
      const appliedRevenue = isActual
        ? d.actualRevenue
        : (d.isWeekday ? calculationModel.avgWeekdaySales : calculationModel.avgWeekendSales);

      const appliedPurchases = isActual
        ? d.purchases.total
        : (d.isOrderDay ? calculationModel.budgetPerOrderDay : 0);

      cumRevenue += appliedRevenue;
      cumPurchases += appliedPurchases;

      const dailyCostPercent = appliedRevenue > 0 ? (appliedPurchases / appliedRevenue) * 100 : 0;
      const cumCogsPercent = cumRevenue > 0 ? (cumPurchases / cumRevenue) * 100 : 0;

      return {
        ...d,
        appliedRevenue,
        appliedPurchases,
        dailyCostPercent,
        cumRevenue,
        cumPurchases,
        cumCogsPercent
      };
    });
  }, [calculationModel]);

  // 9. PROCUREMENT ALLOCATION SUMMARY (MK, MS, CASH & 7 REKANAN SUPPLIER) - TERHUBUNG LANGSUNG DENGAN COGS
  const procurementSummary = useMemo(() => {
    let mkSpend = 0;
    let mkCount = 0;
    let msSpend = 0;
    let msCount = 0;
    let cashSpend = 0;
    let cashCount = 0;

    const supplierItemMap: Record<string, { spend: number; count: number }> = {
      tgif: { spend: 0, count: 0 },
      sukanda: { spend: 0, count: 0 },
      everest: { spend: 0, count: 0 },
      ikigai: { spend: 0, count: 0 },
      panfila: { spend: 0, count: 0 },
      saungKubil: { spend: 0, count: 0 },
      kebunku: { spend: 0, count: 0 },
    };

    calculationModel.days.forEach(dayItem => {
      if (!dayItem.isPastOrCutoff) return;
      const p = dayItem.purchases;
      if (!p) return;

      if (p.mainKitchen > 0) {
        mkSpend += p.mainKitchen;
        mkCount += 1;
      }
      if (p.mainStore > 0) {
        msSpend += p.mainStore;
        msCount += 1;
      }
      if (p.cash > 0) {
        cashSpend += p.cash;
        cashCount += 1;
      }

      ['tgif', 'sukanda', 'everest', 'ikigai', 'panfila', 'saungKubil', 'kebunku'].forEach(k => {
        const amt = (p as any)[k] || 0;
        if (amt > 0) {
          supplierItemMap[k].spend += amt;
          supplierItemMap[k].count += 1;
        }
      });
    });

    const totalSupplierSpend = Object.values(supplierItemMap).reduce((acc, s) => acc + s.spend, 0);
    const totalProcurementSpend = totalSupplierSpend + mkSpend + msSpend + cashSpend;

    // Effective Target Budget directly connected to COGS:
    let effectiveBudget = calculationModel.totalTargetBudgetBelanja;
    if (procurementBudgetBasis === 'COGS_REMAINING') {
      effectiveBudget = calculationModel.sisaBudgetBelanja;
    } else if (procurementBudgetBasis === 'ACTUAL_SPEND') {
      effectiveBudget = totalProcurementSpend;
    } else if (procurementBudgetBasis === 'CUSTOM') {
      effectiveBudget = customProcurementBudget > 0 ? customProcurementBudget : calculationModel.totalTargetBudgetBelanja;
    }

    const recordedDaysCount = Math.max(1, cutoffDay);

    const SUPPLIERS_METADATA = [
      { key: 'tgif', label: 'TGIF', color: 'bg-rose-600', colorDot: 'bg-rose-600', borderClass: 'border-rose-500/40', textClass: 'text-rose-400' },
      { key: 'sukanda', label: 'Sukanda Djaya', color: 'bg-blue-600', colorDot: 'bg-blue-600', borderClass: 'border-blue-500/40', textClass: 'text-blue-400' },
      { key: 'everest', label: 'Everest', color: 'bg-cyan-600', colorDot: 'bg-cyan-600', borderClass: 'border-cyan-500/40', textClass: 'text-cyan-400' },
      { key: 'ikigai', label: 'Ikigai Jaya', color: 'bg-teal-600', colorDot: 'bg-teal-600', borderClass: 'border-teal-500/40', textClass: 'text-teal-400' },
      { key: 'panfila', label: 'Panfila Indosari', color: 'bg-purple-600', colorDot: 'bg-purple-600', borderClass: 'border-purple-500/40', textClass: 'text-purple-400' },
      { key: 'saungKubil', label: 'Saung Kubil', color: 'bg-amber-600', colorDot: 'bg-amber-600', borderClass: 'border-amber-500/40', textClass: 'text-amber-400' },
      { key: 'kebunku', label: 'Kebunku', color: 'bg-lime-600', colorDot: 'bg-lime-600', borderClass: 'border-lime-500/40', textClass: 'text-lime-400' },
    ];

    const supplierDetails = SUPPLIERS_METADATA.map(sup => {
      const info = supplierItemMap[sup.key] || { spend: 0, count: 0 };
      const spend = info.spend;
      const tx = info.count;
      const avgDay = spend / recordedDaysCount;
      const avgTx = tx > 0 ? spend / tx : 0;
      const pctOfSupplier = totalSupplierSpend > 0 ? (spend / totalSupplierSpend) * 100 : 0;
      const pctOfTotalBudget = totalProcurementSpend > 0 ? (spend / totalProcurementSpend) * 100 : 0;
      const targetNominal = Math.round((pctOfTotalBudget / 100) * effectiveBudget);

      return {
        ...sup,
        spend,
        txCount: tx,
        avgPerDay: avgDay,
        avgPerTx: avgTx,
        pctOfSupplier,
        pctOfTotalBudget,
        targetNominal
      };
    });

    const mkAvgPerDay = mkSpend / recordedDaysCount;
    const mkAvgPerTx = mkCount > 0 ? mkSpend / mkCount : 0;
    const mkPercent = totalProcurementSpend > 0 ? (mkSpend / totalProcurementSpend) * 100 : 0;
    const mkTargetNominal = Math.round((mkPercent / 100) * effectiveBudget);

    const msAvgPerDay = msSpend / recordedDaysCount;
    const msAvgPerTx = msCount > 0 ? msSpend / msCount : 0;
    const msPercent = totalProcurementSpend > 0 ? (msSpend / totalProcurementSpend) * 100 : 0;
    const msTargetNominal = Math.round((msPercent / 100) * effectiveBudget);

    const cashAvgPerDay = cashSpend / recordedDaysCount;
    const cashAvgPerTx = cashCount > 0 ? cashSpend / cashCount : 0;
    const cashPercent = totalProcurementSpend > 0 ? (cashSpend / totalProcurementSpend) * 100 : 0;
    const cashTargetNominal = Math.round((cashPercent / 100) * effectiveBudget);

    const supplierPercent = totalProcurementSpend > 0 ? (totalSupplierSpend / totalProcurementSpend) * 100 : 0;
    const supplierTargetNominal = Math.round((supplierPercent / 100) * effectiveBudget);

    const totalTxAll = supplierDetails.reduce((a, b) => a + b.txCount, 0) + mkCount + msCount + cashCount;
    const totalAvgPerDay = totalProcurementSpend / recordedDaysCount;
    const totalAvgPerTx = totalTxAll > 0 ? totalProcurementSpend / totalTxAll : 0;

    return {
      mkSpend,
      mkCount,
      mkAvgPerDay,
      mkAvgPerTx,
      mkPercent,
      mkTargetNominal,

      msSpend,
      msCount,
      msAvgPerDay,
      msAvgPerTx,
      msPercent,
      msTargetNominal,

      cashSpend,
      cashCount,
      cashAvgPerDay,
      cashAvgPerTx,
      cashPercent,
      cashTargetNominal,

      totalSupplierSpend,
      supplierPercent,
      supplierTargetNominal,
      supplierDetails,

      totalProcurementSpend,
      effectiveBudget,
      recordedDaysCount,
      totalTxAll,
      totalAvgPerDay,
      totalAvgPerTx
    };
  }, [
    calculationModel.days,
    calculationModel.totalTargetBudgetBelanja,
    calculationModel.sisaBudgetBelanja,
    procurementBudgetBasis,
    customProcurementBudget,
    cutoffDay
  ]);

  // Active Division Object for Supplier & Spending Allocation
  const selectedDivObj = useMemo(() => {
    return calculationModel.divisionList.find(d => d.id === activeSupplierDivId) || calculationModel.divisionList[0] || {
      id: 'kitchen',
      name: 'Kitchen',
      percent: 70,
      totalSisaBudget: 0,
      dailyBudget: 0,
      orderDayBudget: 0,
      color: 'blue',
      icon: 'fa-utensils',
      supplierPct: 50,
      mkPct: 30,
      msPct: 10,
      cashPct: 10,
      totalDivSupplierPct: 100,
      supplierNominal: 0,
      mkNominal: 0,
      msNominal: 0,
      cashNominal: 0,
      supplierShare: DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS.kitchen
    };
  }, [calculationModel.divisionList, activeSupplierDivId]);

  const curDivId = selectedDivObj.id;
  const curShare = divisionSupplierAllocations[curDivId] || getFallbackDivisionSupplierShare(curDivId);
  const curTotalPct = (curShare.supplier || 0) + (curShare.mainKitchen || 0) + (curShare.mainStore || 0) + (curShare.cash || 0);
  const curTotalSisa = selectedDivObj.totalSisaBudget || 0;

  // Calculation of Strategy Target (Target Today Revenue x % Kontribusi Lunch/Dinner x 80% Percepatan / 20% Penyeimbang)
  const strategyCalculations = useMemo(() => {
    const targetDateObj = new Date(strategyTargetDate);
    const dayOfWeek = isNaN(targetDateObj.getTime()) ? 1 : targetDateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayName = INDO_DAYS[dayOfWeek] || 'Hari Ini';

    // Determine % Contribution based on chosen basis
    let lunchContrib = 0;
    let dinnerContrib = 0;
    let basisName = '';

    if (strategyBasis === 'AUTO') {
      if (isWeekend) {
        lunchContrib = calculationModel.daypartAnalytics.weekend.lunchContrib;
        dinnerContrib = calculationModel.daypartAnalytics.weekend.dinnerContrib;
        basisName = `Otomatis Weekend (${dayName})`;
      } else {
        lunchContrib = calculationModel.daypartAnalytics.weekday.lunchContrib;
        dinnerContrib = calculationModel.daypartAnalytics.weekday.dinnerContrib;
        basisName = `Otomatis Weekday (${dayName})`;
      }
    } else if (strategyBasis === 'MTD') {
      lunchContrib = calculationModel.daypartAnalytics.mtd.lunchContrib;
      dinnerContrib = calculationModel.daypartAnalytics.mtd.dinnerContrib;
      basisName = 'Rata-Rata MTD';
    } else if (strategyBasis === 'WEEKDAY') {
      lunchContrib = calculationModel.daypartAnalytics.weekday.lunchContrib;
      dinnerContrib = calculationModel.daypartAnalytics.weekday.dinnerContrib;
      basisName = 'Rata-Rata Weekday (Senin-Jumat)';
    } else if (strategyBasis === 'WEEKEND') {
      lunchContrib = calculationModel.daypartAnalytics.weekend.lunchContrib;
      dinnerContrib = calculationModel.daypartAnalytics.weekend.dinnerContrib;
      basisName = 'Rata-Rata Weekend (Sabtu-Minggu)';
    } else if (strategyBasis === 'MANUAL') {
      lunchContrib = manualLunchPercent;
      dinnerContrib = manualDinnerPercent;
      basisName = 'Kustom Manual';
    }

    // Fallback if data is not recorded or 0%
    if (lunchContrib === 0 && dinnerContrib === 0) {
      lunchContrib = 40;
      dinnerContrib = 60;
      basisName += ' (Standar 40/60)';
    } else if (lunchContrib + dinnerContrib > 0 && Math.abs((lunchContrib + dinnerContrib) - 100) > 0.01) {
      const sum = lunchContrib + dinnerContrib;
      lunchContrib = (lunchContrib / sum) * 100;
      dinnerContrib = (dinnerContrib / sum) * 100;
    }

    // 1. Target Nominal per Sesi (Target Today Revenue x % Kontribusi)
    const targetLunchNominal = Math.round(strategyTargetRevenue * (lunchContrib / 100));
    const targetDinnerNominal = Math.round(strategyTargetRevenue * (dinnerContrib / 100));
    const targetTotalNominal = strategyTargetRevenue;

    // 2. Dikali Hasil Strategi (Percepatan % & Penyeimbang %)
    // Contoh 80% Percepatan, 20% Penyeimbang (Dapat diatur manual)
    const lunchPercepatan = Math.round(targetLunchNominal * (percepatanPercent / 100));
    const lunchPenyeimbang = targetLunchNominal - lunchPercepatan;

    const dinnerPercepatan = Math.round(targetDinnerNominal * (percepatanPercent / 100));
    const dinnerPenyeimbang = targetDinnerNominal - dinnerPercepatan;

    const totalPercepatan = lunchPercepatan + dinnerPercepatan;
    const totalPenyeimbang = lunchPenyeimbang + dinnerPenyeimbang;

    // 3. Realisasi Aktual Hari Ini untuk Tanggal Terpilih (dari Daily Recording)
    const revForDate = getRevenueForDate(strategyTargetDate);
    const actualLunch = revForDate.lunchRevenue;
    const actualDinner = revForDate.dinnerRevenue;
    const actualTotal = revForDate.revenue;
    const isRecorded = revForDate.isRecorded;

    // Progress Realisasi vs Target Sesi & Target Percepatan
    const lunchPercepatanProgress = lunchPercepatan > 0 ? (actualLunch / lunchPercepatan) * 100 : 0;
    const dinnerPercepatanProgress = dinnerPercepatan > 0 ? (actualDinner / dinnerPercepatan) * 100 : 0;
    const totalPercepatanProgress = totalPercepatan > 0 ? (actualTotal / totalPercepatan) * 100 : 0;

    const lunchTotalProgress = targetLunchNominal > 0 ? (actualLunch / targetLunchNominal) * 100 : 0;
    const dinnerTotalProgress = targetDinnerNominal > 0 ? (actualDinner / targetDinnerNominal) * 100 : 0;
    const totalDayProgress = targetTotalNominal > 0 ? (actualTotal / targetTotalNominal) * 100 : 0;

    return {
      strategyTargetDate,
      dayName,
      isWeekend,
      basisName,
      lunchContrib,
      dinnerContrib,
      targetLunchNominal,
      targetDinnerNominal,
      targetTotalNominal,
      lunchPercepatan,
      lunchPenyeimbang,
      dinnerPercepatan,
      dinnerPenyeimbang,
      totalPercepatan,
      totalPenyeimbang,
      actualLunch,
      actualDinner,
      actualTotal,
      isRecorded,
      lunchPercepatanProgress,
      dinnerPercepatanProgress,
      totalPercepatanProgress,
      lunchTotalProgress,
      dinnerTotalProgress,
      totalDayProgress
    };
  }, [
    strategyTargetDate,
    strategyBasis,
    calculationModel.daypartAnalytics,
    manualLunchPercent,
    manualDinnerPercent,
    strategyTargetRevenue,
    percepatanPercent,
    penyeimbangPercent,
    combinedState
  ]);

  const handleSaveStrategy = () => {
    localStorage.setItem(`COGS_STRATEGY_TARGET_REV_${monthKey}`, String(strategyTargetRevenue));
    localStorage.setItem(`COGS_STRATEGY_PERCEPATAN_${monthKey}`, String(percepatanPercent));
    localStorage.setItem(`COGS_STRATEGY_PENYEIMBANG_${monthKey}`, String(penyeimbangPercent));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast(`Tabel Strategi Target Sales (${percepatanPercent}% Percepatan / ${penyeimbangPercent}% Penyeimbang) berhasil disimpan!`, 'success');
    }
  };

  const handleCopyStrategyWhatsApp = () => {
    const sc = strategyCalculations;
    const outletName = selectedOutlet || data?.outlet || '';
    const areaName = getAreaForOutlet(outletName);

    const text = `*TABEL STRATEGI TARGET SALES (${percepatanPercent}% PERCEPATAN / ${penyeimbangPercent}% PENYEIMBANG)*

*OUTLET* : ${outletName}
*AREA* : ${areaName}
*TANGGAL* : ${sc.strategyTargetDate} (${sc.dayName})
*TARGET TODAY REVENUE* : *Rp.${strategyTargetRevenue.toLocaleString('id-ID')}*
*BASIS KONTRIBUSI* : ${sc.basisName}
*STRATEGI RATIO* : *${percepatanPercent}% PERCEPATAN* | *${penyeimbangPercent}% PENYEIMBANG*

----------------------------------------
*1. SESI LUNCH (SIANG)*
- % Kontribusi Lunch : ${sc.lunchContrib.toFixed(1)}%
- Target Lunch (100%) : *Rp.${sc.targetLunchNominal.toLocaleString('id-ID')}*
  ⚡ *Target Percepatan (${percepatanPercent}%)* : *Rp.${sc.lunchPercepatan.toLocaleString('id-ID')}*
  🛡️ *Target Penyeimbang (${penyeimbangPercent}%)* : *Rp.${sc.lunchPenyeimbang.toLocaleString('id-ID')}*
${sc.isRecorded ? `- Realisasi Aktual Lunch : Rp.${sc.actualLunch.toLocaleString('id-ID')} (${sc.lunchTotalProgress.toFixed(1)}% Target)` : ''}

*2. SESI DINNER (MALAM)*
- % Kontribusi Dinner : ${sc.dinnerContrib.toFixed(1)}%
- Target Dinner (100%) : *Rp.${sc.targetDinnerNominal.toLocaleString('id-ID')}*
  ⚡ *Target Percepatan (${percepatanPercent}%)* : *Rp.${sc.dinnerPercepatan.toLocaleString('id-ID')}*
  🛡️ *Target Penyeimbang (${penyeimbangPercent}%)* : *Rp.${sc.dinnerPenyeimbang.toLocaleString('id-ID')}*
${sc.isRecorded ? `- Realisasi Aktual Dinner : Rp.${sc.actualDinner.toLocaleString('id-ID')} (${sc.dinnerTotalProgress.toFixed(1)}% Target)` : ''}

----------------------------------------
*TOTAL ALL DAY (HARI INI)*
- Target Today Revenue : *Rp.${strategyTargetRevenue.toLocaleString('id-ID')}*
  ⚡ *TOTAL TARGET PERCEPATAN (${percepatanPercent}%)* : *Rp.${sc.totalPercepatan.toLocaleString('id-ID')}*
  🛡️ *TOTAL TARGET PENYEIMBANG (${penyeimbangPercent}%)* : *Rp.${sc.totalPenyeimbang.toLocaleString('id-ID')}*
${sc.isRecorded ? `- Realisasi Total Sales : Rp.${sc.actualTotal.toLocaleString('id-ID')} (${sc.totalDayProgress.toFixed(1)}% Target)` : ''}

*Catatan Operasional:*
- Target Percepatan (${percepatanPercent}%): Harus diamankan pada peak hour setiap sesi untuk mengamankan 80% target penjualan lebih awal.
- Target Penyeimbang (${penyeimbangPercent}%): Target penyeimbang untuk menuntaskan 100% target sales harian.`;

    navigator.clipboard.writeText(text).then(() => {
      if (showToast) showToast('Format WhatsApp Tabel Strategi berhasil disalin!', 'success');
    });
  };

  // Simpan Alokasi Persentase Sisa Budget Belanja Divisi
  const handleSaveDivisionAllocations = () => {
    localStorage.setItem(`COGS_DIVISION_ALLOCATIONS_${monthKey}`, JSON.stringify(divisionAllocations));
    localStorage.setItem(`COGS_DIV_SUPPLIER_ALLOCATIONS_${monthKey}`, JSON.stringify(divisionSupplierAllocations));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      divisionAllocations,
      divisionSupplierAllocations,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast('Pengaturan persentase alokasi sisa budget belanja divisi berhasil disimpan!', 'success');
    }
  };

  // Save Settings to State & Local Storage
  const handleSaveConfig = () => {
    const updatedMonthlyCogs: MonthlyCogsData = {
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      manualMtdBelanja: manualMtdBelanja ? parseFloat(manualMtdBelanja) : undefined,
      useManualMtdBelanja,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      divisionAllocations,
      divisionSupplierAllocations,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };

    localStorage.setItem(`COGS_TARGET_BUDGET_${monthKey}`, String(targetBudgetPercent));
    localStorage.setItem(`COGS_OPENING_INV_${monthKey}`, String(openingInventory));
    localStorage.setItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`, String(closingInvPercent));
    localStorage.setItem(`COGS_CLOSING_INV_${monthKey}`, String(closingInventory));
    localStorage.setItem(`COGS_MAX_CLOSING_PERCENT_${monthKey}`, String(maxClosingInvPercent));
    localStorage.setItem(`COGS_DIVISION_ALLOCATIONS_${monthKey}`, JSON.stringify(divisionAllocations));
    localStorage.setItem(`COGS_DIV_SUPPLIER_ALLOCATIONS_${monthKey}`, JSON.stringify(divisionSupplierAllocations));

    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };

    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    setIsConfigOpen(false);
    if (showToast) {
      showToast('Parameter COGS & Budget Belanja berhasil disimpan!', 'success');
    }
  };

  // Submit Opening Inventory Only
  const handleSubmitOpeningInventory = () => {
    localStorage.setItem(`COGS_OPENING_INV_${monthKey}`, String(openingInventory));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      divisionAllocations,
      divisionSupplierAllocations,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast(`Stok Awal (Opening Inventory) Rp ${openingInventory.toLocaleString('id-ID')} berhasil disubmit & disimpan!`, 'success');
    }
  };

  // Submit Closing Inventory Only (now saves percentage and derived nominal)
  const handleSubmitClosingInventory = () => {
    localStorage.setItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`, String(closingInvPercent));
    localStorage.setItem(`COGS_CLOSING_INV_${monthKey}`, String(closingInventory));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      divisionAllocations,
      divisionSupplierAllocations,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast(`Persentase Stok Akhir ${closingInvPercent}% (Rp ${closingInventory.toLocaleString('id-ID')}) berhasil disubmit & disimpan!`, 'success');
    }
  };

  // Submit Both Opening & Closing Inventory
  const handleSubmitAllInventory = () => {
    localStorage.setItem(`COGS_OPENING_INV_${monthKey}`, String(openingInventory));
    localStorage.setItem(`COGS_CLOSING_INV_PERCENT_${monthKey}`, String(closingInvPercent));
    localStorage.setItem(`COGS_CLOSING_INV_${monthKey}`, String(closingInventory));
    const currentSaved = (data.monthlyCogsData || {})[monthKey] || {};
    const updatedMonthlyCogs: MonthlyCogsData = {
      ...currentSaved,
      targetBudgetPercent,
      targetCogsPercent: targetBudgetPercent,
      beginningInventory: openingInventory,
      endingInventory: closingInventory,
      closingInventoryPercent: closingInvPercent,
      maxClosingInvPercent,
      manualCutoffDay: cutoffDay,
      kitchenSharePercent: kitchenPercent,
      barSharePercent: barPercent,
      serviceSharePercent: servicePercent,
      divisionAllocations,
      divisionSupplierAllocations,
      orderDays: selectedOrderDays,
      strategyTargetRevenue,
      strategyPercepatanPercent: percepatanPercent,
      strategyPenyeimbangPercent: penyeimbangPercent,
      strategyBasis,
      strategyManualLunchPercent: manualLunchPercent,
      strategyManualDinnerPercent: manualDinnerPercent,
      strategyTargetDate
    };
    const newMonthlyCogsData = {
      ...(data.monthlyCogsData || {}),
      [monthKey]: updatedMonthlyCogs
    };
    onUpdate({ monthlyCogsData: newMonthlyCogsData });
    if (showToast) {
      showToast(`Stok Awal Rp ${openingInventory.toLocaleString('id-ID')} & Persentase Stok Akhir ${closingInvPercent}% (Rp ${closingInventory.toLocaleString('id-ID')}) berhasil disimpan!`, 'success');
    }
  };

  // Preset Example Filler (Contoh Sesuai Prompt User)
  const handleLoadExamplePreset = () => {
    setCutoffDay(Math.min(19, daysInMonth));
    setTargetBudgetPercent(43.0);
    setMaxClosingInvPercent(11.0);
    setClosingInvPercent(10.0);
    handleApplyDivisionPreset('standard');
    setSelectedOrderDays(outletOrderSchedule.dayIndices);
    setUseManualMtdBelanja(true);
    setManualMtdBelanja('340928547');
    if (showToast) {
      showToast('Preset simulasi sesuai contoh prompt dimuat (MTD Belanja: Rp 340.928.547)!', 'info');
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`COGS_${INDO_MONTHS[selectedMonth]}_${selectedYear}`);

      sheet.addRow(['LAPORAN COGS (HPP), FORECAST REVENUE & BUDGET BELANJA']);
      sheet.addRow([`Outlet: ${selectedOutlet} | Periode: ${INDO_MONTHS[selectedMonth]} ${selectedYear} (Cut-off Tgl 1 - ${cutoffDay})`]);
      sheet.addRow([]);

      // Section 1: Forecast Revenue
      sheet.addRow(['1. FORECAST REVENUE & PROYEKSI PENJUALAN']);
      sheet.addRow(['Actual Revenue (1 - ' + cutoffDay + ' ' + INDO_MONTHS[selectedMonth] + ')', calculationModel.actualRevenueMTD]);
      sheet.addRow(['Sisa Hari Weekday (Senin - Jumat)', `${calculationModel.remainingWeekdayCount} Hari`, 'Rata" Sales MTD:', calculationModel.avgWeekdaySales, 'Forecast:', calculationModel.forecastWeekdayRevenue]);
      sheet.addRow(['Sisa Hari Weekend (Sabtu - Minggu)', `${calculationModel.remainingWeekendCount} Hari`, 'Rata" Sales MTD:', calculationModel.avgWeekendSales, 'Forecast:', calculationModel.forecastWeekendRevenue]);
      sheet.addRow(['Total Forecast Revenue Sisa Hari', calculationModel.totalForecastRevenueRemaining]);
      sheet.addRow(['TOTAL PROJECTED REVENUE FULL MONTH', calculationModel.totalProjectedRevenue]);
      sheet.addRow([]);

      // Section 2: Inventory & COGS
      sheet.addRow(['2. INVENTORY & COGS (HPP) (Formula: Opening + Budget Belanja - Closing Inventory)']);
      sheet.addRow(['Opening Inventory (Stok Awal) (+)', openingInventory]);
      sheet.addRow(['Purchased Budget Belanja (+)', calculationModel.totalTargetBudgetBelanja]);
      sheet.addRow(['MTD Actual Belanja (Receiving Sheet)', calculationModel.actualBelanjaMTD]);
      sheet.addRow(['Closing Inventory (Stok Akhir) (-)', closingInventory]);
      sheet.addRow(['Persentase Closing Inventory (% terhadap Projected Revenue)', `${calculationModel.closingInventoryPercent.toFixed(2)}%`]);
      sheet.addRow(['COGS / HPP (Opening + Budget Belanja - Closing)', calculationModel.effectiveCOGS]);
      sheet.addRow(['COGS %', `${calculationModel.actualCogsPercent.toFixed(2)}%`]);
      sheet.addRow(['Estimasi Max Closing Inventory (Max ' + maxClosingInvPercent + '%)', calculationModel.maxClosingInvNominal, calculationModel.isClosingInvSafe ? 'STATUS: AMAN' : 'STATUS: OVER']);
      sheet.addRow([]);

      // Section: Analisis Sesi & Hari (Lunch vs Dinner, Weekday vs Weekend)
      sheet.addRow(['ANALISIS RATA-RATA HARIAN & KONTRIBUSI SESI (LUNCH VS DINNER)']);
      sheet.addRow(['Kategori', 'Jumlah Hari', 'Rata-Rata Lunch', '% Kontribusi Lunch', 'Rata-Rata Dinner', '% Kontribusi Dinner', 'Rata-Rata Total', 'Total Akumulasi']);
      sheet.addRow([
        'MTD All Sessions',
        calculationModel.daypartAnalytics.mtd.recordedDays,
        calculationModel.daypartAnalytics.mtd.avgLunch,
        `${calculationModel.daypartAnalytics.mtd.lunchContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.mtd.avgDinner,
        `${calculationModel.daypartAnalytics.mtd.dinnerContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.mtd.avgRevenue,
        calculationModel.daypartAnalytics.mtd.totalRevenue
      ]);
      sheet.addRow([
        'Weekday (Senin - Jumat)',
        calculationModel.daypartAnalytics.weekday.recordedDays,
        calculationModel.daypartAnalytics.weekday.avgLunch,
        `${calculationModel.daypartAnalytics.weekday.lunchContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.weekday.avgDinner,
        `${calculationModel.daypartAnalytics.weekday.dinnerContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.weekday.avgRevenue,
        calculationModel.daypartAnalytics.weekday.totalRevenue
      ]);
      sheet.addRow([
        'Weekend (Sabtu - Minggu)',
        calculationModel.daypartAnalytics.weekend.recordedDays,
        calculationModel.daypartAnalytics.weekend.avgLunch,
        `${calculationModel.daypartAnalytics.weekend.lunchContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.weekend.avgDinner,
        `${calculationModel.daypartAnalytics.weekend.dinnerContrib.toFixed(1)}%`,
        calculationModel.daypartAnalytics.weekend.avgRevenue,
        calculationModel.daypartAnalytics.weekend.totalRevenue
      ]);
      sheet.addRow([]);

      // Section: Tabel Strategi Target Sales (Target Today Revenue x % Kontribusi x 80% Percepatan / 20% Penyeimbang)
      sheet.addRow(['TABEL STRATEGI TARGET SALES (TODAY REVENUE × % KONTRIBUSI × STRATEGI PERCEPATAN & PENYEIMBANG)']);
      sheet.addRow([`Target Today Revenue: Rp ${strategyTargetRevenue.toLocaleString('id-ID')} | Tanggal: ${strategyCalculations.strategyTargetDate} (${strategyCalculations.dayName}) | Basis: ${strategyCalculations.basisName}`]);
      sheet.addRow([`Rasio Strategi: ${percepatanPercent}% Percepatan / ${penyeimbangPercent}% Penyeimbang`]);
      sheet.addRow(['Sesi / Kategori', '% Kontribusi', 'Target Sesi (100%)', `Target Percepatan (${percepatanPercent}%)`, `Target Penyeimbang (${penyeimbangPercent}%)`, 'Realisasi Aktual (Rp)', 'Status']);
      sheet.addRow([
        'Lunch Session (Siang)',
        `${strategyCalculations.lunchContrib.toFixed(1)}%`,
        strategyCalculations.targetLunchNominal,
        strategyCalculations.lunchPercepatan,
        strategyCalculations.lunchPenyeimbang,
        strategyCalculations.isRecorded ? strategyCalculations.actualLunch : 0,
        strategyCalculations.isRecorded ? (strategyCalculations.actualLunch >= strategyCalculations.targetLunchNominal ? 'Target Tercapai 100%' : strategyCalculations.actualLunch >= strategyCalculations.lunchPercepatan ? 'Percepatan Tercapai' : 'On Progress') : 'Belum Ada Data'
      ]);
      sheet.addRow([
        'Dinner Session (Malam)',
        `${strategyCalculations.dinnerContrib.toFixed(1)}%`,
        strategyCalculations.targetDinnerNominal,
        strategyCalculations.dinnerPercepatan,
        strategyCalculations.dinnerPenyeimbang,
        strategyCalculations.isRecorded ? strategyCalculations.actualDinner : 0,
        strategyCalculations.isRecorded ? (strategyCalculations.actualDinner >= strategyCalculations.targetDinnerNominal ? 'Target Tercapai 100%' : strategyCalculations.actualDinner >= strategyCalculations.dinnerPercepatan ? 'Percepatan Tercapai' : 'On Progress') : 'Belum Ada Data'
      ]);
      sheet.addRow([
        'TOTAL ALL DAY',
        '100.0%',
        strategyCalculations.targetTotalNominal,
        strategyCalculations.totalPercepatan,
        strategyCalculations.totalPenyeimbang,
        strategyCalculations.isRecorded ? strategyCalculations.actualTotal : 0,
        strategyCalculations.isRecorded ? (strategyCalculations.actualTotal >= strategyCalculations.targetTotalNominal ? 'Target Tercapai 100%' : strategyCalculations.actualTotal >= strategyCalculations.totalPercepatan ? 'Percepatan Tercapai' : 'On Progress') : 'Belum Ada Data'
      ]);
      sheet.addRow([]);

      // Section 3: Budget Belanja & Pembagian Divisi
      sheet.addRow(['3. KONTROL BUDGET BELANJA & ALOKASI DIVISI']);
      sheet.addRow(['Target Set Budget Belanja %', `${targetBudgetPercent}%`]);
      sheet.addRow(['Total Target Belanja Full Month', calculationModel.totalTargetBudgetBelanja]);
      sheet.addRow(['Actual Belanja MTD (1 - ' + cutoffDay + ')', calculationModel.actualBelanjaMTD]);
      sheet.addRow(['Sisa Budget Belanja', calculationModel.sisaBudgetBelanja]);
      sheet.addRow(['Sisa Hari Bulan Ini', `${calculationModel.remainingTotalDays} Hari`]);
      sheet.addRow(['Batas Belanja per Hari Sisa', calculationModel.dailyPurchasingBudgetRemaining]);
      sheet.addRow([`Sisa Hari Order (${orderDaysLabel})`, `${calculationModel.remainingOrderDaysCount} Hari Order`]);
      sheet.addRow(['Jatah Belanja per Hari Order', calculationModel.budgetPerOrderDay]);
      sheet.addRow([]);

      sheet.addRow(['PEMBAGIAN JATAH BELANJA DIVISI & ALOKASI SUPPLIER (100% SISA BUDGET DIVISI)', 'Porsi Divisi', 'Sisa Budget', 'Jatah / Hari', `Jatah / Hari Order (${orderDaysShortLabel})`, 'Rekanan Supplier (Rp / %)', 'Main Kitchen (Rp / %)', 'Main Store (Rp / %)', 'Cash Pasar (Rp / %)']);
      calculationModel.divisionList.forEach(div => {
        sheet.addRow([
          div.name,
          `${div.percent}%`,
          div.totalSisaBudget,
          div.dailyBudget,
          div.orderDayBudget,
          `${div.supplierNominal} (${div.supplierPct}%)`,
          `${div.mkNominal} (${div.mkPct}%)`,
          `${div.msNominal} (${div.msPct}%)`,
          `${div.cashNominal} (${div.cashPct}%)`
        ]);
      });
      sheet.addRow([]);

      // Section 4: Daily Breakdown Table
      sheet.addRow([
        'Tgl', 'Hari', 'Tipe Hari', 'Status', `Hari Order (${orderDaysShortLabel})`, 'Revenue (Rp)',
        'Belanja Supplier (Rp)', 'Daily Cost %', 'Kumulatif Revenue', 'Kumulatif Belanja', 'Kumulatif COGS %'
      ]);

      dailyTableData.forEach(r => {
        sheet.addRow([
          r.day,
          r.dayName,
          r.isWeekday ? 'Weekday (Sen-Jum)' : 'Weekend (Sab-Min)',
          r.isPastOrCutoff ? 'Actual (1-' + cutoffDay + ')' : 'Forecast Remaining',
          r.isOrderDay ? 'YA (ORDER DAY)' : '-',
          r.appliedRevenue,
          r.appliedPurchases,
          `${r.dailyCostPercent.toFixed(1)}%`,
          r.cumRevenue,
          r.cumPurchases,
          `${r.cumCogsPercent.toFixed(1)}%`
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `COGS_Forecast_Budget_${selectedOutlet.replace(/\s+/g, '_')}_${INDO_MONTHS[selectedMonth]}_${selectedYear}.xlsx`);

      if (showToast) showToast('File Excel berhasil diexport!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Gagal export Excel', 'error');
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`LAPORAN COGS, FORECAST REVENUE & BUDGET BELANJA - ${selectedOutlet}`, 14, 15);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periode: ${INDO_MONTHS[selectedMonth]} ${selectedYear} | Cutoff: Tgl 1-${cutoffDay} | Target Budget Belanja: ${targetBudgetPercent}%`, 14, 21);

      // Summary Table 1
      autoTable(doc, {
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        head: [['Indikator Kunci', 'Rincian Perhitungan', 'Nilai (Rp / %)']],
        body: [
          ['Actual Revenue MTD (1 - ' + cutoffDay + ')', `${cutoffDay} Hari Tercatat`, `Rp ${calculationModel.actualRevenueMTD.toLocaleString('id-ID')}`],
          ['Forecast Sisa Weekday (Senin-Jumat)', `${calculationModel.remainingWeekdayCount} Hari × Rp ${calculationModel.avgWeekdaySales.toLocaleString('id-ID')}`, `Rp ${calculationModel.forecastWeekdayRevenue.toLocaleString('id-ID')}`],
          ['Forecast Sisa Weekend (Sabtu-Minggu)', `${calculationModel.remainingWeekendCount} Hari × Rp ${calculationModel.avgWeekendSales.toLocaleString('id-ID')}`, `Rp ${calculationModel.forecastWeekendRevenue.toLocaleString('id-ID')}`],
          ['TOTAL PROJECTED REVENUE BULAN INI', `Actual (1-${cutoffDay}) + Forecast Sisa Hari`, `Rp ${calculationModel.totalProjectedRevenue.toLocaleString('id-ID')}`],
          ['Opening Inventory (+)', 'Stok Awal Bulan', `Rp ${openingInventory.toLocaleString('id-ID')}`],
          ['MTD Actual Belanja (+)', `Total Cost Tgl 1 - ${cutoffDay}`, `Rp ${calculationModel.actualBelanjaMTD.toLocaleString('id-ID')}`],
          ['Closing Inventory (-)', `${calculationModel.closingInventoryPercent.toFixed(2)}% dari MTD Revenue`, `Rp ${closingInventory.toLocaleString('id-ID')}`],
          ['COGS / HPP Estimasi Bulan Ini', `Opening + Budget Belanja - Closing`, `Rp ${calculationModel.effectiveCOGS.toLocaleString('id-ID')} (${calculationModel.actualCogsPercent.toFixed(2)}%)`],
          ['Total Target Budget Belanja (' + targetBudgetPercent + '%)', `Projected Rev × ${targetBudgetPercent}%`, `Rp ${calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}`],
          ['SISA BUDGET BELANJA', `Alokasi Sisa ${calculationModel.remainingTotalDays} Hari (${calculationModel.remainingOrderDaysCount} Hari Order)`, `Rp ${calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}`],
          ['Batas Belanja per Hari Sisa', `Sisa Budget / ${calculationModel.remainingTotalDays} Hari`, `Rp ${calculationModel.dailyPurchasingBudgetRemaining.toLocaleString('id-ID')} / hari`],
          [`Batas Belanja per Hari Order (${orderDaysShortLabel})`, `Sisa Budget / ${calculationModel.remainingOrderDaysCount} Hari Order`, `Rp ${calculationModel.budgetPerOrderDay.toLocaleString('id-ID')} / order`],
          ['Estimasi Max Closing Inventory (' + maxClosingInvPercent + '%)', `Max ${maxClosingInvPercent}% dari Total Projected Rev`, `Rp ${calculationModel.maxClosingInvNominal.toLocaleString('id-ID')} (Aktual: Rp ${closingInventory.toLocaleString('id-ID')} - ${calculationModel.isClosingInvSafe ? 'AMAN' : 'OVER'})`]
        ]
      });

      // Division Summary Table
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        head: [['Divisi', 'Porsi %', 'Total Sisa Budget', 'Jatah / Hari Sisa', `Jatah / Hari Order (${orderDaysShortLabel})`]],
        body: calculationModel.divisionList.map(div => [
          div.name,
          `${div.percent}%`,
          `Rp ${div.totalSisaBudget.toLocaleString('id-ID')}`,
          `Rp ${div.dailyBudget.toLocaleString('id-ID')}`,
          `Rp ${div.orderDayBudget.toLocaleString('id-ID')}`
        ])
      });

      // Strategy Table (Target Sales 80/20)
      const currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 120;
      if (currentY > 140) {
        doc.addPage();
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`TABEL STRATEGI TARGET SALES (${percepatanPercent}% PERCEPATAN / ${penyeimbangPercent}% PENYEIMBANG) - ${selectedOutlet}`, 14, 15);
      }
      autoTable(doc, {
        startY: currentY > 140 ? 20 : currentY + 6,
        theme: 'grid',
        headStyles: { fillColor: [49, 46, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        head: [['Sesi Penjualan', '% Kontribusi', 'Target Sesi (100%)', `Target Percepatan (${percepatanPercent}%)`, `Target Penyeimbang (${penyeimbangPercent}%)`, 'Realisasi Aktual']],
        body: [
          ['Lunch Session (Siang)', `${strategyCalculations.lunchContrib.toFixed(1)}%`, `Rp ${strategyCalculations.targetLunchNominal.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.lunchPercepatan.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.lunchPenyeimbang.toLocaleString('id-ID')}`, strategyCalculations.isRecorded ? `Rp ${strategyCalculations.actualLunch.toLocaleString('id-ID')}` : '-'],
          ['Dinner Session (Malam)', `${strategyCalculations.dinnerContrib.toFixed(1)}%`, `Rp ${strategyCalculations.targetDinnerNominal.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.dinnerPercepatan.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.dinnerPenyeimbang.toLocaleString('id-ID')}`, strategyCalculations.isRecorded ? `Rp ${strategyCalculations.actualDinner.toLocaleString('id-ID')}` : '-'],
          ['TOTAL ALL DAY', '100.0%', `Rp ${strategyCalculations.targetTotalNominal.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.totalPercepatan.toLocaleString('id-ID')}`, `Rp ${strategyCalculations.totalPenyeimbang.toLocaleString('id-ID')}`, strategyCalculations.isRecorded ? `Rp ${strategyCalculations.actualTotal.toLocaleString('id-ID')}` : '-']
        ]
      });

      doc.save(`COGS_Forecast_Budget_${selectedOutlet.replace(/\s+/g, '_')}_${INDO_MONTHS[selectedMonth]}_${selectedYear}.pdf`);
      if (showToast) showToast('File PDF berhasil diexport!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Gagal export PDF', 'error');
    }
  };

  // Last Month MTD Revenue calculation for comparison
  const lastMonthStats = useMemo(() => {
    const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const lastMonthYr = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const lastPad = String(lastMonthIdx + 1).padStart(2, '0');
    const lastPrefix = `${lastMonthYr}-${lastPad}`;
    const daysInLastMonth = new Date(lastMonthYr, lastMonthIdx + 1, 0).getDate();
    const effectiveCutoff = Math.min(cutoffDay, daysInLastMonth);

    const states: AppState[] = [];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      if (allMonthlyData && (allMonthlyData as any)[selectedOutlet]) {
        const outletMap = (allMonthlyData as any)[selectedOutlet];
        const m = outletMap[String(lastMonthIdx)] || outletMap[lastMonthIdx];
        if (m) states.push(m as AppState);
      } else if (allMonthlyData && (allMonthlyData as any)[String(lastMonthIdx)]) {
        states.push((allMonthlyData as any)[String(lastMonthIdx)] as AppState);
      }
    } else {
      if (allMonthlyData) {
        Object.entries(allMonthlyData).forEach(([k, outletVal]: [string, any]) => {
          if (outletVal && typeof outletVal === 'object') {
            const m = outletVal[String(lastMonthIdx)] || outletVal[lastMonthIdx];
            if (m) states.push(m as AppState);
            else if (k === String(lastMonthIdx)) states.push(outletVal as AppState);
          }
        });
      }
    }

    let mtdRev = 0;
    let fullRev = 0;

    if (states.length > 0) {
      for (let day = 1; day <= daysInLastMonth; day++) {
        const dStr = `${lastPrefix}-${String(day).padStart(2, '0')}`;
        for (const st of states) {
          const rec = st.sales?.dailyRecording?.[dStr];
          if (rec) {
            let r = 0;
            if (typeof rec.revenue === 'number' && rec.revenue > 0) {
              r = rec.revenue;
            } else {
              const sum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
              if (sum > 0) r = sum;
              else {
                const dineIn = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) + 
                               (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
                if (dineIn > 0) r = dineIn;
              }
            }
            fullRev += r;
            if (day <= effectiveCutoff) {
              mtdRev += r;
            }
          }
        }
      }
    } else if (data?.sales?.dailyRecording) {
      for (let day = 1; day <= daysInLastMonth; day++) {
        const dStr = `${lastPrefix}-${String(day).padStart(2, '0')}`;
        const rec = data.sales.dailyRecording[dStr];
        if (rec) {
          let r = 0;
          if (typeof rec.revenue === 'number' && rec.revenue > 0) {
            r = rec.revenue;
          } else {
            const sum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
            if (sum > 0) r = sum;
            else {
              const dineIn = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) + 
                             (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
              if (dineIn > 0) r = dineIn;
            }
          }
          fullRev += r;
          if (day <= effectiveCutoff) {
            mtdRev += r;
          }
        }
      }
    }

    const effectiveLastMonthRevenue = mtdRev > 0 ? mtdRev : fullRev;

    return {
      revenue: effectiveLastMonthRevenue,
      fullRevenue: fullRev,
      monthName: INDO_MONTHS[lastMonthIdx],
      year: lastMonthYr
    };
  }, [allMonthlyData, data, selectedOutlet, selectedMonth, selectedYear, cutoffDay]);

  // WhatsApp Summary Copy
  const handleCopyWhatsApp = () => {
    const lastMonthRev = lastMonthStats.revenue;
    const variance = calculationModel.actualRevenueMTD - lastMonthRev;
    const varianceSign = variance >= 0 ? '+' : '-';
    const varianceStr = `${varianceSign}Rp.${Math.abs(variance).toLocaleString('id-ID')}`;
    const performanceStr = lastMonthRev > 0
      ? `${((calculationModel.actualRevenueMTD / lastMonthRev) * 100).toFixed(2)}%`
      : (calculationModel.actualRevenueMTD > 0 ? '100.00%' : '0.00%');

    const outletName = selectedOutlet || data?.outlet || '';
    const areaName = getAreaForOutlet(outletName);

    const text = `*COGS & REVENUE FORECAST*

*OUTLET* : ${outletName}
*AREA* : ${areaName}

*ACTUAL MTD REVENUE* : *Rp.${calculationModel.actualRevenueMTD.toLocaleString('id-ID')}*
*FB Revenue Forecast*
- Rata" Weekday  : Rp. ${calculationModel.avgWeekdaySales.toLocaleString('id-ID')}
- Rata" Weekend  : Rp. ${calculationModel.avgWeekendSales.toLocaleString('id-ID')}
- Rata" Weekday x (sisa ${calculationModel.remainingWeekdayCount} Hari) : Rp.${calculationModel.forecastWeekdayRevenue.toLocaleString('id-ID')}
- Rata" Weekend x (sisa ${calculationModel.remainingWeekendCount} Hari) : Rp.${calculationModel.forecastWeekendRevenue.toLocaleString('id-ID')}
*TOTAL FB REVENUE FORECAST* : *Rp.${calculationModel.totalForecastRevenueRemaining.toLocaleString('id-ID')}*

*ACTUAL MTD REVENUE & FORECAST* : *Rp.${calculationModel.totalProjectedRevenue.toLocaleString('id-ID')}*


*ACTUAL MTD FB REVENUE LAST MONTH* : *Rp.${lastMonthRev.toLocaleString('id-ID')}*
- Variance : ${varianceStr}
- Performance : ${performanceStr}

*FB REVENUE & COST*
- FB Revenue (actual Mtd & Forecast) : Rp.${calculationModel.totalProjectedRevenue.toLocaleString('id-ID')}
- Opening Inventory : Rp.${openingInventory.toLocaleString('id-ID')}
- Purchased Budget (${targetBudgetPercent.toFixed(2)}%) : Rp.${calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}
- Closing Inventory (${calculationModel.closingInventoryPercent.toFixed(2)}%) : Rp.${calculationModel.closingInventory.toLocaleString('id-ID')}
- *COGS* (${calculationModel.actualCogsPercent.toFixed(2)}%) : *Rp.${calculationModel.effectiveCOGS.toLocaleString('id-ID')}*

*Actual MTD Purchased Budget* : *Rp.${calculationModel.actualBelanjaMTD.toLocaleString('id-ID')}*
*Purchase Balance* (sisa budget) : *Rp.${calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}*
${calculationModel.divisionList.map(div => `- ${div.name} (${div.percent}%) Dari Sisa Budget : Rp.${div.totalSisaBudget.toLocaleString('id-ID')}`).join('\n')}

*REVENUE CONTRIBUTION LUNCH & DINNER*
*WEEKDAY Lunch & Dinner*
- Lunch (${calculationModel.daypartAnalytics.weekday.lunchContrib.toFixed(2)}%) : Rp.${calculationModel.daypartAnalytics.weekday.totalLunch.toLocaleString('id-ID')}
- Dinner (${calculationModel.daypartAnalytics.weekday.dinnerContrib.toFixed(2)}%) : Rp.${calculationModel.daypartAnalytics.weekday.totalDinner.toLocaleString('id-ID')}
-*TOTAL* 100% : *Rp.${calculationModel.daypartAnalytics.weekday.totalRevenue.toLocaleString('id-ID')}*

*WEEKEND Lunch & Dinner*
- Lunch (${calculationModel.daypartAnalytics.weekend.lunchContrib.toFixed(2)}%) : Rp.${calculationModel.daypartAnalytics.weekend.totalLunch.toLocaleString('id-ID')}
- Dinner (${calculationModel.daypartAnalytics.weekend.dinnerContrib.toFixed(2)}%) : Rp.${calculationModel.daypartAnalytics.weekend.totalDinner.toLocaleString('id-ID')}
-*TOTAL* (%) : Rp.${calculationModel.daypartAnalytics.weekend.totalRevenue.toLocaleString('id-ID')}

*STRATEGI TARGET SALES (TODAY - ${percepatanPercent}% PERCEPATAN / ${penyeimbangPercent}% PENYEIMBANG)*
*Target Today Revenue* : *Rp.${strategyTargetRevenue.toLocaleString('id-ID')}* (${strategyCalculations.basisName})
- Lunch Target (100%) : Rp.${strategyCalculations.targetLunchNominal.toLocaleString('id-ID')}
  • Percepatan (${percepatanPercent}%) : Rp.${strategyCalculations.lunchPercepatan.toLocaleString('id-ID')}
  • Penyeimbang (${penyeimbangPercent}%) : Rp.${strategyCalculations.lunchPenyeimbang.toLocaleString('id-ID')}
- Dinner Target (100%) : Rp.${strategyCalculations.targetDinnerNominal.toLocaleString('id-ID')}
  • Percepatan (${percepatanPercent}%) : Rp.${strategyCalculations.dinnerPercepatan.toLocaleString('id-ID')}
  • Penyeimbang (${penyeimbangPercent}%) : Rp.${strategyCalculations.dinnerPenyeimbang.toLocaleString('id-ID')}
- *TOTAL TARGET TODAY* (100%) : *Rp.${strategyTargetRevenue.toLocaleString('id-ID')}*
  • Total Percepatan (${percepatanPercent}%) : *Rp.${strategyCalculations.totalPercepatan.toLocaleString('id-ID')}*
  • Total Penyeimbang (${penyeimbangPercent}%) : *Rp.${strategyCalculations.totalPenyeimbang.toLocaleString('id-ID')}*`;

    navigator.clipboard.writeText(text).then(() => {
      if (showToast) showToast('Format WhatsApp berhasil disalin ke clipboard!', 'success');
    });
  };

  // WhatsApp Summary Copy for Alokasi Budget Belanja (MK, MS, Cash, Supplier) - Terhubung COGS
  const handleCopyAlokasiWhatsApp = () => {
    const outletName = selectedOutlet || data?.outlet || '';
    const monthName = INDO_MONTHS[selectedMonth];
    
    let text = `*ALOKASI BUDGET BELANJA PENGADAAN (TERHUBUNG KE COGS)*\n\n`;
    text += `*OUTLET*: ${outletName}\n`;
    text += `*PERIODE*: ${monthName} ${selectedYear}\n`;
    text += `*BASIS TARGET BUDGET COGS*: Rp ${procurementSummary.effectiveBudget.toLocaleString('id-ID')} (${targetBudgetPercent.toFixed(1)}% dari Proyeksi Sales)\n`;
    text += `*REALISASI BELANJA MTD*: Rp ${procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}\n`;
    text += `*SISA BUDGET BELANJA COGS*: Rp ${calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}\n\n`;
    text += `*RINGKASAN 4 KATEGORI UTAMA:*\n`;
    text += `1. Rekanan Supplier (7 Mitra): Rp ${procurementSummary.totalSupplierSpend.toLocaleString('id-ID')} (${procurementSummary.supplierPercent.toFixed(1)}%) -> Target COGS: Rp ${procurementSummary.supplierTargetNominal.toLocaleString('id-ID')}\n`;
    text += `2. Main Kitchen (MK): Rp ${procurementSummary.mkSpend.toLocaleString('id-ID')} (${procurementSummary.mkPercent.toFixed(1)}%) -> Target COGS: Rp ${procurementSummary.mkTargetNominal.toLocaleString('id-ID')} [${procurementSummary.mkCount} PO]\n`;
    text += `3. Main Store (MS): Rp ${procurementSummary.msSpend.toLocaleString('id-ID')} (${procurementSummary.msPercent.toFixed(1)}%) -> Target COGS: Rp ${procurementSummary.msTargetNominal.toLocaleString('id-ID')} [${procurementSummary.msCount} PO]\n`;
    text += `4. Cash Supplier: Rp ${procurementSummary.cashSpend.toLocaleString('id-ID')} (${procurementSummary.cashPercent.toFixed(1)}%) -> Target COGS: Rp ${procurementSummary.cashTargetNominal.toLocaleString('id-ID')} [${procurementSummary.cashCount} Trx]\n\n`;
    text += `*DETAIL 7 REKANAN SUPPLIER:*\n`;
    procurementSummary.supplierDetails.forEach(sup => {
      text += `• ${sup.label}: Rp ${sup.spend.toLocaleString('id-ID')} (${sup.pctOfTotalBudget.toFixed(1)}% dari Budget) -> Target COGS: Rp ${sup.targetNominal.toLocaleString('id-ID')}\n`;
    });
    text += `\n*Rata-rata Belanja/Hari*: Rp ${Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}\n`;
    text += `*Total Transaksi / PO*: ${procurementSummary.totalTxAll} entri (${procurementSummary.recordedDaysCount} hari)\n\n`;
    text += `*Best Regards & Thank you*`;

    navigator.clipboard.writeText(text).then(() => {
      if (showToast) showToast('Format WA Alokasi Budget Belanja berhasil disalin!', 'success');
    }).catch(() => {
      if (showToast) showToast('Gagal menyalin ke clipboard', 'error');
    });
  };

  // Export Excel for Alokasi Budget Belanja (MK, MS, Cash, Supplier) - Terhubung COGS
  const handleExportAlokasiExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Justus App';
      workbook.created = new Date();

      const alokasiSheet = workbook.addWorksheet('ALOKASI_BUDGET_COGS');
      alokasiSheet.addRow([`LAPORAN ALOKASI BUDGET BELANJA PENGADAAN (TERHUBUNG KE FITUR COGS)`]);
      alokasiSheet.addRow([`Outlet: ${selectedOutlet || data?.outlet || ''} | Periode: ${INDO_MONTHS[selectedMonth]} ${selectedYear}`]);
      alokasiSheet.addRow([`Target Budget COGS (${targetBudgetPercent}%): Rp ${procurementSummary.effectiveBudget.toLocaleString('id-ID')} | Realisasi Belanja MTD: Rp ${procurementSummary.totalProcurementSpend.toLocaleString('id-ID')} | Sisa: Rp ${calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}`]);
      alokasiSheet.addRow([]);

      alokasiSheet.addRow([
        'No',
        'Jalur / Kategori Belanja',
        'Total Belanja (Rp)',
        'Jumlah PO / Trx',
        'Rata-rata/Hari (Rp)',
        'Rata-rata/PO (Rp)',
        '% thd Supplier',
        '% Alokasi Budget',
        'Nominal Target COGS (Rp)'
      ]);

      // 7 suppliers
      procurementSummary.supplierDetails.forEach((sup, idx) => {
        alokasiSheet.addRow([
          idx + 1,
          sup.label,
          sup.spend,
          sup.txCount,
          Math.round(sup.avgPerDay),
          Math.round(sup.avgPerTx),
          `${sup.pctOfSupplier.toFixed(1)}%`,
          `${sup.pctOfTotalBudget.toFixed(1)}%`,
          sup.targetNominal
        ]);
      });

      // Subtotal suppliers
      alokasiSheet.addRow([
        'Σ',
        'Subtotal Rekanan Supplier (7 Mitra)',
        procurementSummary.totalSupplierSpend,
        procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0),
        Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount),
        Math.round(procurementSummary.totalSupplierSpend / Math.max(1, procurementSummary.supplierDetails.reduce((a, b) => a + b.txCount, 0))),
        '100.0%',
        `${procurementSummary.supplierPercent.toFixed(1)}%`,
        procurementSummary.supplierTargetNominal
      ]);

      // MK, MS, Cash
      alokasiSheet.addRow([
        8,
        'Main Kitchen (MK)',
        procurementSummary.mkSpend,
        procurementSummary.mkCount,
        Math.round(procurementSummary.mkAvgPerDay),
        Math.round(procurementSummary.mkAvgPerTx),
        '-',
        `${procurementSummary.mkPercent.toFixed(1)}%`,
        procurementSummary.mkTargetNominal
      ]);

      alokasiSheet.addRow([
        9,
        'Main Store (MS)',
        procurementSummary.msSpend,
        procurementSummary.msCount,
        Math.round(procurementSummary.msAvgPerDay),
        Math.round(procurementSummary.msAvgPerTx),
        '-',
        `${procurementSummary.msPercent.toFixed(1)}%`,
        procurementSummary.msTargetNominal
      ]);

      alokasiSheet.addRow([
        10,
        'Cash Supplier & Pasar',
        procurementSummary.cashSpend,
        procurementSummary.cashCount,
        Math.round(procurementSummary.cashAvgPerDay),
        Math.round(procurementSummary.cashAvgPerTx),
        '-',
        `${procurementSummary.cashPercent.toFixed(1)}%`,
        procurementSummary.cashTargetNominal
      ]);

      // Grand Total
      alokasiSheet.addRow([
        'TOTAL',
        'GRAND TOTAL BELANJA PENGADAAN',
        procurementSummary.totalProcurementSpend,
        procurementSummary.totalTxAll,
        Math.round(procurementSummary.totalAvgPerDay),
        Math.round(procurementSummary.totalAvgPerTx),
        '-',
        '100.0%',
        procurementSummary.effectiveBudget
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Alokasi_Budget_Belanja_COGS_${(selectedOutlet || data?.outlet || '').replace(/\s+/g, '_')}_${INDO_MONTHS[selectedMonth]}_${selectedYear}.xlsx`);
      if (showToast) showToast('File Excel Alokasi Budget Belanja berhasil diexport!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Gagal export Excel', 'error');
    }
  };

  const handleSaveProcurementBudget = (newBudget: number, newBasis?: 'COGS_TARGET' | 'COGS_REMAINING' | 'ACTUAL_SPEND' | 'CUSTOM') => {
    const basis = newBasis || procurementBudgetBasis;
    setCustomProcurementBudget(newBudget);
    setProcurementBudgetBasis(basis);
    const updated = {
      ...savedCogsData,
      customProcurementBudget: newBudget,
      procurementBudgetBasis: basis
    };
    onUpdate({
      monthlyCogsData: {
        ...(data?.monthlyCogsData || {}),
        [monthKey]: updated
      }
    });
    if (showToast) showToast('Target Budget Alokasi Belanja berhasil disimpan!', 'success');
  };

  // Filtered rows for display
  const filteredDailyData = useMemo(() => {
    if (activeTableFilter === 'CUTOFF_PAST') return dailyTableData.filter(d => d.isPastOrCutoff);
    if (activeTableFilter === 'CUTOFF_REMAINING') return dailyTableData.filter(d => !d.isPastOrCutoff);
    if (activeTableFilter === 'ORDER_DAYS') return dailyTableData.filter(d => d.isOrderDay);
    return dailyTableData;
  }, [dailyTableData, activeTableFilter]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in text-slate-100">
      {/* Header Banner */}
      <div className="glass-card p-6 md:p-8 bg-gradient-to-r from-slate-900 via-indigo-950/50 to-slate-900 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <i className="fas fa-calculator text-lg"></i>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] tracking-widest uppercase">
                COGS & REVENUE FORECAST ENGINE
              </span>
              <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-[10px] tracking-widest uppercase">
                {selectedOutlet}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight uppercase">
              COGS & Forecast Revenue Control
            </h1>
            <p className="text-xs md:text-sm font-semibold text-slate-400 mt-1 max-w-2xl">
              Model Forecast Revenue (Rata-rata Weekday & Weekend sisa hari), Kontrol Budget Belanja (43%), dan Alokasi Divisi (Kitchen 70%, Bar 20%, Service 10%).
            </p>
          </div>

          {/* Period Selector & Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Cut-off Day quick select */}
            <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-2xl border border-white/10">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cut-off:</span>
              <select
                value={cutoffDay}
                onChange={(e) => setCutoffDay(parseInt(e.target.value, 10))}
                className="bg-slate-900 text-emerald-400 font-black text-xs px-2.5 py-1.5 rounded-xl border border-white/10 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>Tgl 1 - {d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/70 p-1.5 rounded-2xl border border-white/10">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="bg-slate-900 text-white font-black text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {INDO_MONTHS.map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="bg-slate-900 text-white font-black text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsConfigOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 border border-indigo-400/30 active:scale-95 shadow-md"
            >
              <i className="fas fa-sliders-h"></i>
              <span>Setting Parameter</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyWhatsApp}
                title="Salin Ringkasan WhatsApp"
                className="p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all active:scale-95"
              >
                <i className="fab fa-whatsapp text-sm"></i>
              </button>
              <button
                onClick={handleExportExcel}
                title="Export Excel"
                className="p-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30 transition-all active:scale-95"
              >
                <i className="fas fa-file-excel text-sm"></i>
              </button>
              <button
                onClick={handleExportPDF}
                title="Export PDF"
                className="p-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl border border-rose-500/30 transition-all active:scale-95"
              >
                <i className="fas fa-file-pdf text-sm"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Order Schedule Info Bar */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-400 font-semibold">Jadwal Order Area:</span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-black border border-emerald-500/30">
              {outletOrderSchedule.label}
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              ({outletOrderSchedule.areaName})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Hari Order Aktif:</span>
            <span className="text-amber-300 font-bold bg-slate-950/60 px-2 py-0.5 rounded-md border border-white/10">
              {orderDaysLabel}
            </span>
            <button
              onClick={() => setIsConfigOpen(true)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline ml-1"
            >
              Ubah
            </button>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS: OVERVIEW COGS vs ALOKASI BUDGET BELANJA (MK, MS, CASH & SUPPLIER) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2.5 rounded-2xl border border-white/10 no-print shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCogsMainTab('OVERVIEW')}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              cogsMainTab === 'OVERVIEW'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <i className="fas fa-chart-line"></i> Overview COGS & Forecast Control
          </button>
          <button
            type="button"
            onClick={() => setCogsMainTab('ALOKASI_BUDGET')}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              cogsMainTab === 'ALOKASI_BUDGET'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <i className="fas fa-chart-pie text-rose-400"></i> Alokasi Budget Belanja (MK, MS, Cash, Supplier)
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-black/40 font-mono text-rose-300 font-bold">
              Terhubung Target COGS ({targetBudgetPercent.toFixed(1)}%)
            </span>
          </button>
        </div>

        {cogsMainTab === 'ALOKASI_BUDGET' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setInputProcurementBudgetValue(customProcurementBudget > 0 ? String(customProcurementBudget) : String(procurementSummary.effectiveBudget));
                setIsEditingProcurementBudgetModal(true);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
            >
              <i className="fas fa-bullseye text-rose-400"></i>
              <span>Basis: {procurementBudgetBasis === 'COGS_TARGET' ? `Target COGS (${targetBudgetPercent}%)` : procurementBudgetBasis === 'COGS_REMAINING' ? 'Sisa Budget COGS' : procurementBudgetBasis === 'ACTUAL_SPEND' ? 'Realisasi' : 'Manual'}</span>
              <span className="font-mono text-emerald-400 font-bold ml-1">Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyAlokasiWhatsApp}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
            >
              <i className="fab fa-whatsapp"></i> Salin WA Alokasi
            </button>
            <button
              type="button"
              onClick={handleExportAlokasiExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
            >
              <i className="fas fa-file-excel"></i> Excel
            </button>
          </div>
        )}
      </div>

      {cogsMainTab === 'OVERVIEW' && (
        <div className="space-y-6 animate-fade-in">
          {/* SECTION 1: FORECAST REVENUE BREAKDOWN (SESUAI CONTOH USER) */}
      <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-2xl relative">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <i className="fas fa-chart-line"></i>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">
                1. Forecast Revenue & Proyeksi Akhir Bulan
              </h2>
              <p className="text-xs text-slate-400">
                Formula Sisa Hari Weekday (Sen-Jum) & Weekend (Sab-Min) dikalikan rata-rata penjualan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadExamplePreset}
              className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-all"
            >
              <i className="fas fa-magic text-amber-400 mr-1.5"></i>
              Muat Contoh Preset (Tgl 1-19)
            </button>
          </div>
        </div>

        {/* Forecast Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card A: Actual Revenue Cutoff */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              ACTUAL REVENUE (TGL 1 - {cutoffDay} {INDO_MONTHS[selectedMonth].toUpperCase()})
            </div>
            <div className="text-xl md:text-2xl font-black text-white">
              Rp {calculationModel.actualRevenueMTD.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 space-y-1">
              <div className="flex justify-between">
                <span>Total Hari Tercatat:</span>
                <span className="text-slate-200 font-bold">{cutoffDay} Hari</span>
              </div>
              <div className="flex justify-between">
                <span>Rata-rata Harian Aktual:</span>
                <span className="text-emerald-400 font-bold">
                  Rp {cutoffDay > 0 ? Math.round(calculationModel.actualRevenueMTD / cutoffDay).toLocaleString('id-ID') : 0}
                </span>
              </div>
            </div>
          </div>

          {/* Card B: Forecast Sisa Hari Breakdown */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-indigo-500/30">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                FORECAST SISA {calculationModel.remainingTotalDays} HARI (TGL {cutoffDay + 1} - {daysInMonth})
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                AUTO MTD
              </span>
            </div>
            <div className="text-xl md:text-2xl font-black text-indigo-300">
              Rp {calculationModel.totalForecastRevenueRemaining.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 space-y-1.5">
              <div className="flex justify-between">
                <span>Weekday (Sisa {calculationModel.remainingWeekdayCount} Hari × Rp {calculationModel.avgWeekdaySales.toLocaleString('id-ID')}):</span>
                <span className="text-indigo-400 font-bold">Rp {calculationModel.forecastWeekdayRevenue.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Weekend (Sisa {calculationModel.remainingWeekendCount} Hari × Rp {calculationModel.avgWeekendSales.toLocaleString('id-ID')}):</span>
                <span className="text-amber-400 font-bold">Rp {calculationModel.forecastWeekendRevenue.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          {/* Card C: Total Projected Full Month */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-slate-950/80 to-slate-950/60 border border-emerald-500/40">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">
              TOTAL PROJECTED REVENUE FULL MONTH
            </div>
            <div className="text-2xl md:text-3xl font-black text-emerald-400 tracking-tight">
              Rp {calculationModel.totalProjectedRevenue.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-white/10 space-y-1">
              <div className="flex justify-between">
                <span>Actual + Forecast:</span>
                <span className="text-emerald-300 font-bold">
                  Rp {calculationModel.actualRevenueMTD.toLocaleString('id-ID')} + Rp {calculationModel.totalForecastRevenueRemaining.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* REVENUE SESSIONS & DAYPART ANALYTICS (MTD, WEEKDAY, WEEKEND) */}
        <div className="mt-8 pt-6 border-t border-white/10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  REKAPAN ANALISIS PENJUALAN HARIAN & KONTRIBUSI SESI
                </span>
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-chart-pie text-emerald-400 text-base"></i>
                Rata-Rata Revenue & Kontribusi Sesi (Lunch vs Dinner)
              </h3>
              <p className="text-xs text-slate-400">
                Tabel rekapan rata-rata MTD serta pemisahan performa Weekday (Senin-Jumat) & Weekend (Sabtu-Minggu) yang menjadi basis proyeksi forecast COGS
              </p>
            </div>

            {/* Filter Tab Switcher */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/10 self-start md:self-auto flex-wrap">
              {[
                { id: 'ALL', label: 'Semua Tabel', icon: 'fas fa-th-large' },
                { id: 'STRATEGY', label: 'Tabel Strategi (80/20)', icon: 'fas fa-chess-knight' },
                { id: 'MTD', label: 'Rata" MTD', icon: 'fas fa-calendar-check' },
                { id: 'WEEKDAY', label: 'Rata" Weekday', icon: 'fas fa-briefcase' },
                { id: 'WEEKEND', label: 'Rata" Weekend', icon: 'fas fa-umbrella-beach' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveAnalyticsTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeAnalyticsTab === tab.id
                      ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className={tab.icon}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* TABEL 1: RATA-RATA MTD REVENUE, LUNCH, CONTRIBUSI DAN DINNER, CONTRIBUSI */}
          {(activeAnalyticsTab === 'ALL' || activeAnalyticsTab === 'MTD') && (
            <div className="rounded-2xl bg-slate-950/70 border border-emerald-500/30 overflow-hidden shadow-xl">
              <div className="p-4 bg-gradient-to-r from-emerald-950/50 via-slate-900/60 to-slate-950/50 border-b border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                    <i className="fas fa-calendar-alt"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-white text-xs uppercase tracking-wider">
                      1. TABEL RATA-RATA MTD REVENUE, LUNCH, KONTRIBUSI & DINNER, KONTRIBUSI
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Cut-Off Tgl 1 s/d {cutoffDay} {INDO_MONTHS[selectedMonth]} {selectedYear} • {calculationModel.daypartAnalytics.mtd.recordedDays} Hari Tercatat
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Total MTD Revenue:</span>
                  <span className="text-xs font-black text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    Rp {calculationModel.daypartAnalytics.mtd.totalRevenue.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-black border-b border-white/5">
                      <th className="p-3">Sesi / Kategori</th>
                      <th className="p-3 text-center">Hari Tercatat</th>
                      <th className="p-3 text-right">Rata-Rata Harian (Rp)</th>
                      <th className="p-3 text-center">% Kontribusi Sesi</th>
                      <th className="p-3 text-right">Total Akumulasi MTD (Rp)</th>
                      <th className="p-3 w-48 text-center">Visual Kontribusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold">
                    {/* Lunch Row */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 font-black text-amber-300 flex items-center gap-2">
                        <i className="fas fa-sun text-amber-400 text-xs"></i>
                        <span>Lunch Session (Siang)</span>
                      </td>
                      <td className="p-3 text-center text-slate-300">
                        {calculationModel.daypartAnalytics.mtd.recordedDays} Hari
                      </td>
                      <td className="p-3 text-right font-black text-amber-300 text-sm">
                        Rp {calculationModel.daypartAnalytics.mtd.avgLunch.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                          {calculationModel.daypartAnalytics.mtd.lunchContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-200">
                        Rp {calculationModel.daypartAnalytics.mtd.totalLunch.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3">
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-amber-400 h-2 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, calculationModel.daypartAnalytics.mtd.lunchContrib))}%` }}
                          ></div>
                        </div>
                      </td>
                    </tr>

                    {/* Dinner Row */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 font-black text-indigo-300 flex items-center gap-2">
                        <i className="fas fa-moon text-indigo-400 text-xs"></i>
                        <span>Dinner Session (Malam)</span>
                      </td>
                      <td className="p-3 text-center text-slate-300">
                        {calculationModel.daypartAnalytics.mtd.recordedDays} Hari
                      </td>
                      <td className="p-3 text-right font-black text-indigo-300 text-sm">
                        Rp {calculationModel.daypartAnalytics.mtd.avgDinner.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30">
                          {calculationModel.daypartAnalytics.mtd.dinnerContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-200">
                        Rp {calculationModel.daypartAnalytics.mtd.totalDinner.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3">
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-2 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, calculationModel.daypartAnalytics.mtd.dinnerContrib))}%` }}
                          ></div>
                        </div>
                      </td>
                    </tr>

                    {/* Total Row */}
                    <tr className="bg-emerald-950/30 font-black text-white border-t-2 border-emerald-500/40">
                      <td className="p-3 uppercase text-emerald-400 flex items-center gap-2">
                        <i className="fas fa-coins text-emerald-400 text-xs"></i>
                        <span>TOTAL MTD REVENUE (ALL SESSIONS)</span>
                      </td>
                      <td className="p-3 text-center text-emerald-300">
                        {calculationModel.daypartAnalytics.mtd.recordedDays} Hari
                      </td>
                      <td className="p-3 text-right text-emerald-300 text-base">
                        Rp {calculationModel.daypartAnalytics.mtd.avgRevenue.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-xs border border-emerald-500/30">
                          100.0%
                        </span>
                      </td>
                      <td className="p-3 text-right text-emerald-200 text-sm">
                        Rp {calculationModel.daypartAnalytics.mtd.totalRevenue.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3">
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                          <div
                            className="bg-amber-400 h-2"
                            title={`Lunch: ${calculationModel.daypartAnalytics.mtd.lunchContrib.toFixed(1)}%`}
                            style={{ width: `${Math.min(100, Math.max(0, calculationModel.daypartAnalytics.mtd.lunchContrib))}%` }}
                          ></div>
                          <div
                            className="bg-indigo-500 h-2"
                            title={`Dinner: ${calculationModel.daypartAnalytics.mtd.dinnerContrib.toFixed(1)}%`}
                            style={{ width: `${Math.min(100, Math.max(0, calculationModel.daypartAnalytics.mtd.dinnerContrib))}%` }}
                          ></div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABEL 2: RATA-RATA WEEKDAY (SENIN - JUMAT) */}
          {(activeAnalyticsTab === 'ALL' || activeAnalyticsTab === 'WEEKDAY') && (
            <div className="rounded-2xl bg-slate-950/70 border border-blue-500/30 overflow-hidden shadow-xl">
              <div className="p-4 bg-gradient-to-r from-blue-950/50 via-slate-900/60 to-slate-950/50 border-b border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">
                    <i className="fas fa-briefcase"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-white text-xs uppercase tracking-wider">
                      2. TABEL RATA-RATA WEEKDAY (SENIN, SELASA, RABU, KAMIS, JUMAT) - LUNCH & DINNER KONTRIBUSI
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Rincian per hari Weekday & Rata-rata Total Weekday • Acuan Forecast Sisa {calculationModel.remainingWeekdayCount} Hari Weekday (Rp {calculationModel.avgWeekdaySales.toLocaleString('id-ID')}/hari)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Rata" Weekday:</span>
                  <span className="text-xs font-black text-blue-300 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                    Rp {calculationModel.avgWeekdaySales.toLocaleString('id-ID')} / hari
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-black border-b border-white/5">
                      <th className="p-3">Hari Weekday</th>
                      <th className="p-3 text-center">Jumlah Hari</th>
                      <th className="p-3 text-right">Rata" Lunch (Rp)</th>
                      <th className="p-3 text-center">% Kontribusi Lunch</th>
                      <th className="p-3 text-right">Rata" Dinner (Rp)</th>
                      <th className="p-3 text-center">% Kontribusi Dinner</th>
                      <th className="p-3 text-right">Rata" Total Revenue (Rp)</th>
                      <th className="p-3 text-right">Total Akumulasi (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold">
                    {calculationModel.daypartAnalytics.weekday.days.map((row) => (
                      <tr key={row.dayIndex} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 font-black text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                          <span>{row.dayName}</span>
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {row.count} Hari
                        </td>
                        <td className="p-3 text-right text-amber-300 font-bold">
                          Rp {row.avgLunch.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[11px] font-bold">
                            {row.lunchContrib.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right text-indigo-300 font-bold">
                          Rp {row.avgDinner.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[11px] font-bold">
                            {row.dinnerContrib.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-blue-300">
                          Rp {row.avgTotal.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          Rp {row.totalSum.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}

                    {/* Summary Row Weekday */}
                    <tr className="bg-blue-950/40 font-black text-white border-t-2 border-blue-500/40">
                      <td className="p-3 uppercase text-blue-300 flex items-center gap-2">
                        <i className="fas fa-star text-amber-400 text-xs"></i>
                        <span>TOTAL / RATA-RATA WEEKDAY</span>
                      </td>
                      <td className="p-3 text-center text-blue-200">
                        {calculationModel.daypartAnalytics.weekday.recordedDays} Hari
                      </td>
                      <td className="p-3 text-right text-amber-300 text-sm font-black">
                        Rp {calculationModel.daypartAnalytics.weekday.avgLunch.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                          {calculationModel.daypartAnalytics.weekday.lunchContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-indigo-300 text-sm font-black">
                        Rp {calculationModel.daypartAnalytics.weekday.avgDinner.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30">
                          {calculationModel.daypartAnalytics.weekday.dinnerContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-blue-300 text-base font-black">
                        Rp {calculationModel.avgWeekdaySales.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-right text-slate-200 text-sm">
                        Rp {calculationModel.daypartAnalytics.weekday.totalRevenue.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABEL 3: RATA-RATA WEEKEND (SABTU - MINGGU) */}
          {(activeAnalyticsTab === 'ALL' || activeAnalyticsTab === 'WEEKEND') && (
            <div className="rounded-2xl bg-slate-950/70 border border-amber-500/30 overflow-hidden shadow-xl">
              <div className="p-4 bg-gradient-to-r from-amber-950/50 via-slate-900/60 to-slate-950/50 border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">
                    <i className="fas fa-umbrella-beach"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-white text-xs uppercase tracking-wider">
                      3. TABEL RATA-RATA WEEKEND (SABTU, MINGGU) - LUNCH & DINNER KONTRIBUSI
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Rincian per hari Weekend & Rata-rata Total Weekend • Acuan Forecast Sisa {calculationModel.remainingWeekendCount} Hari Weekend (Rp {calculationModel.avgWeekendSales.toLocaleString('id-ID')}/hari)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Rata" Weekend:</span>
                  <span className="text-xs font-black text-amber-300 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
                    Rp {calculationModel.avgWeekendSales.toLocaleString('id-ID')} / hari
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-black border-b border-white/5">
                      <th className="p-3">Hari Weekend</th>
                      <th className="p-3 text-center">Jumlah Hari</th>
                      <th className="p-3 text-right">Rata" Lunch (Rp)</th>
                      <th className="p-3 text-center">% Kontribusi Lunch</th>
                      <th className="p-3 text-right">Rata" Dinner (Rp)</th>
                      <th className="p-3 text-center">% Kontribusi Dinner</th>
                      <th className="p-3 text-right">Rata" Total Revenue (Rp)</th>
                      <th className="p-3 text-right">Total Akumulasi (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold">
                    {calculationModel.daypartAnalytics.weekend.days.map((row) => (
                      <tr key={row.dayIndex} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 font-black text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>{row.dayName}</span>
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {row.count} Hari
                        </td>
                        <td className="p-3 text-right text-amber-300 font-bold">
                          Rp {row.avgLunch.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[11px] font-bold">
                            {row.lunchContrib.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right text-indigo-300 font-bold">
                          Rp {row.avgDinner.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[11px] font-bold">
                            {row.dinnerContrib.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-amber-300">
                          Rp {row.avgTotal.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          Rp {row.totalSum.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}

                    {/* Summary Row Weekend */}
                    <tr className="bg-amber-950/40 font-black text-white border-t-2 border-amber-500/40">
                      <td className="p-3 uppercase text-amber-300 flex items-center gap-2">
                        <i className="fas fa-star text-amber-400 text-xs"></i>
                        <span>TOTAL / RATA-RATA WEEKEND</span>
                      </td>
                      <td className="p-3 text-center text-amber-200">
                        {calculationModel.daypartAnalytics.weekend.recordedDays} Hari
                      </td>
                      <td className="p-3 text-right text-amber-300 text-sm font-black">
                        Rp {calculationModel.daypartAnalytics.weekend.avgLunch.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                          {calculationModel.daypartAnalytics.weekend.lunchContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-indigo-300 text-sm font-black">
                        Rp {calculationModel.daypartAnalytics.weekend.avgDinner.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30">
                          {calculationModel.daypartAnalytics.weekend.dinnerContrib.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-amber-300 text-base font-black">
                        Rp {calculationModel.avgWeekendSales.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-right text-slate-200 text-sm">
                        Rp {calculationModel.daypartAnalytics.weekend.totalRevenue.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABEL 4: TABEL STRATEGI TARGET SALES (TARGET TODAY REVENUE X RATA" PERCENTASE CONTRIBUTION LUNCH & DINNER X STRATEGI 80% PERCEPATAN & 20% PENYEIMBANG) */}
          {(activeAnalyticsTab === 'ALL' || activeAnalyticsTab === 'STRATEGY') && (
            <div className="rounded-2xl bg-slate-950/80 border-2 border-indigo-500/40 overflow-hidden shadow-2xl relative">
              {/* Decorative Accent Glow */}
              <div className="absolute top-0 right-0 w-96 h-32 bg-indigo-500/10 blur-3xl pointer-events-none"></div>
              
              {/* Header Card */}
              <div className="p-4 md:p-5 bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-purple-950/70 border-b border-indigo-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center text-lg shadow-inner shrink-0 mt-0.5 sm:mt-0">
                    <i className="fas fa-chess-knight"></i>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-black text-[9px] uppercase tracking-widest border border-indigo-500/30">
                        FITUR STRATEGI PENJUALAN
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/30">
                        {strategyCalculations.basisName}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold text-[9px] uppercase tracking-wider border border-purple-500/30">
                        Rasio {percepatanPercent}% / {penyeimbangPercent}%
                      </span>
                    </div>
                    <h4 className="font-black text-white text-sm md:text-base uppercase tracking-tight flex items-center gap-2">
                      4. TABEL STRATEGI TARGET SALES (LUNCH & DINNER)
                    </h4>
                    <p className="text-[11px] text-slate-300 max-w-2xl">
                      Formula: <strong className="text-amber-300">(Target Today Revenue × Rata" % Kontribusi Lunch & Dinner)</strong> lalu dikalikan strategi <strong className="text-cyan-300">{percepatanPercent}% Percepatan</strong> & <strong className="text-purple-300">{penyeimbangPercent}% Penyeimbang</strong> (Dapat diatur manual).
                    </p>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                  <button
                    type="button"
                    onClick={handleCopyStrategyWhatsApp}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                    title="Salin Tabel Strategi ke WhatsApp"
                  >
                    <i className="fab fa-whatsapp text-sm"></i>
                    <span>Salin WA</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStrategy}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/30 active:scale-95 border border-indigo-400/40"
                    title="Simpan Parameter Strategi"
                  >
                    <i className="fas fa-save"></i>
                    <span>Simpan Strategi</span>
                  </button>
                </div>
              </div>

              {/* Strategy Configuration & Controller Bar */}
              <div className="p-4 bg-slate-900/60 border-b border-white/5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* Controller 1: Target Today Revenue (DIBEKUKAN & TERHUBUNG KE ADMIN PANEL) */}
                  <div className="md:col-span-4 p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/40 space-y-2.5 shadow-inner">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <i className="fas fa-lock text-amber-400"></i>
                        Target Today Revenue (Dibekukan)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black flex items-center gap-1">
                          <i className="fas fa-link"></i> Admin Panel
                        </span>
                        <input
                          type="date"
                          value={strategyTargetDate}
                          onChange={(e) => setStrategyTargetDate(e.target.value)}
                          className="bg-slate-900 border border-amber-500/30 rounded-lg px-2 py-0.5 text-[10px] text-amber-200 font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
                          title="Pilih tanggal acuan target"
                        />
                      </div>
                    </div>
                    
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-black text-amber-400">Rp</span>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={strategyTargetRevenue > 0 ? strategyTargetRevenue.toLocaleString('id-ID') : '0'}
                        className="w-full pl-9 pr-9 py-2 bg-slate-900/90 border border-amber-500/40 rounded-xl text-base font-black text-amber-300 cursor-not-allowed select-none"
                        title="Target ini dibekukan dan terhubung langsung dari input Target Harian di Admin Panel"
                      />
                      <span className="absolute right-3 top-2.5 text-amber-400" title="Dibekukan & Terkunci dari Admin Panel">
                        <i className="fas fa-lock text-xs"></i>
                      </span>
                    </div>

                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <i className="fas fa-shield-alt text-amber-400 text-[10px]"></i>
                          Status Target:
                        </span>
                        <span className={`font-black ${strategyTargetRevenue > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {strategyTargetRevenue > 0 ? 'Tersinkronisasi dari Admin Panel' : 'Belum Diinput di Admin Panel'}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-tight">
                        🔒 Target harian dibekukan dan terhubung langsung dari input <strong className="text-white">Admin Panel &gt; Target Harian</strong> untuk tanggal <span className="text-amber-300 font-bold">{strategyTargetDate}</span>.
                      </p>
                      {strategyTargetDate !== defaultStrategyTargetDate && (
                        <button
                          type="button"
                          onClick={() => setStrategyTargetDate(defaultStrategyTargetDate)}
                          className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 underline cursor-pointer flex items-center gap-1 mt-0.5"
                        >
                          <i className="fas fa-undo"></i> Kembali ke Tanggal Hari Ini ({defaultStrategyTargetDate})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Controller 2: Basis % Kontribusi (Lunch vs Dinner) */}
                  <div className="md:col-span-4 p-3.5 rounded-xl bg-slate-950/70 border border-indigo-500/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <i className="fas fa-balance-scale text-amber-400"></i>
                        Basis Rata" % Kontribusi
                      </label>
                      <span className="text-[10px] font-black text-emerald-400">
                        L: {strategyCalculations.lunchContrib.toFixed(1)}% | D: {strategyCalculations.dinnerContrib.toFixed(1)}%
                      </span>
                    </div>

                    {/* Basis Selectors */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'AUTO', label: '⚡ Otomatis (Hari Ini)', sub: strategyCalculations.isWeekend ? 'Weekend' : 'Weekday' },
                        { id: 'MTD', label: '📊 Rata" MTD', sub: `${calculationModel.daypartAnalytics.mtd.lunchContrib.toFixed(0)}/${calculationModel.daypartAnalytics.mtd.dinnerContrib.toFixed(0)}%` },
                        { id: 'WEEKDAY', label: '💼 Rata" Weekday', sub: `${calculationModel.daypartAnalytics.weekday.lunchContrib.toFixed(0)}/${calculationModel.daypartAnalytics.weekday.dinnerContrib.toFixed(0)}%` },
                        { id: 'WEEKEND', label: '🏖️ Rata" Weekend', sub: `${calculationModel.daypartAnalytics.weekend.lunchContrib.toFixed(0)}/${calculationModel.daypartAnalytics.weekend.dinnerContrib.toFixed(0)}%` }
                      ].map(b => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setStrategyBasis(b.id as any)}
                          className={`p-1.5 rounded-lg text-left transition-all border cursor-pointer ${
                            strategyBasis === b.id
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-black shadow-sm'
                              : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="text-[10px] font-black truncate">{b.label}</div>
                          <div className="text-[9px] text-slate-400 opacity-80">{b.sub}</div>
                        </button>
                      ))}
                    </div>

                    {/* Option for Manual % Contribution */}
                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setStrategyBasis(strategyBasis === 'MANUAL' ? 'AUTO' : 'MANUAL')}
                        className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                          strategyBasis === 'MANUAL' ? 'text-amber-400 underline' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <i className="fas fa-edit"></i>
                        {strategyBasis === 'MANUAL' ? 'Mode Kustom Aktif' : 'Atur Manual % Kontribusi'}
                      </button>
                      {strategyBasis === 'MANUAL' && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400">Lunch:</span>
                          <input
                            type="number"
                            value={manualLunchPercent}
                            onChange={(e) => {
                              const l = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                              setManualLunchPercent(l);
                              setManualDinnerPercent(parseFloat((100 - l).toFixed(1)));
                            }}
                            className="w-11 px-1 py-0.5 bg-slate-900 border border-white/20 rounded text-[9px] text-center font-black text-amber-300"
                          />
                          <span className="text-[9px] text-slate-400">% | Dinner:</span>
                          <span className="text-[9px] font-black text-indigo-300">{manualDinnerPercent}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Controller 3: Rasio Strategi 80/20% (DAPAT DIATUR MANUAL) */}
                  <div className="md:col-span-4 p-3.5 rounded-xl bg-slate-950/70 border border-indigo-500/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <i className="fas fa-sliders-h text-cyan-400"></i>
                        Rasio Strategi (Dapat Diatur Manual)
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black text-[10px]">
                          ⚡ {percepatanPercent}%
                        </span>
                        <span className="text-slate-500 text-xs">/</span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-black text-[10px]">
                          🛡️ {penyeimbangPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Dual Sliders / Inputs */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-cyan-300 w-20 truncate">Percepatan:</span>
                        <input
                          type="range"
                          min={50}
                          max={95}
                          step={1}
                          value={percepatanPercent}
                          onChange={(e) => handlePercepatanChange(parseFloat(e.target.value))}
                          className="flex-1 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <div className="flex items-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={percepatanPercent}
                            onChange={(e) => handlePercepatanChange(parseFloat(e.target.value) || 0)}
                            className="w-12 px-1.5 py-0.5 bg-slate-900 border border-cyan-500/40 rounded text-xs font-black text-cyan-300 text-center"
                          />
                          <span className="text-[10px] font-black text-cyan-400 ml-0.5">%</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-purple-300 w-20 truncate">Penyeimbang:</span>
                        <input
                          type="range"
                          min={5}
                          max={50}
                          step={1}
                          value={penyeimbangPercent}
                          onChange={(e) => handlePenyeimbangChange(parseFloat(e.target.value))}
                          className="flex-1 accent-purple-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <div className="flex items-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={penyeimbangPercent}
                            onChange={(e) => handlePenyeimbangChange(parseFloat(e.target.value) || 0)}
                            className="w-12 px-1.5 py-0.5 bg-slate-900 border border-purple-500/40 rounded text-xs font-black text-purple-300 text-center"
                          />
                          <span className="text-[10px] font-black text-purple-400 ml-0.5">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Presets for Strategy 80/20 */}
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Preset:</span>
                      <div className="flex items-center gap-1">
                        {[
                          { p: 80, b: 20, tag: '80/20' },
                          { p: 75, b: 25, tag: '75/25' },
                          { p: 70, b: 30, tag: '70/30' },
                          { p: 85, b: 15, tag: '85/15' },
                          { p: 90, b: 10, tag: '90/10' }
                        ].map(preset => (
                          <button
                            key={preset.tag}
                            type="button"
                            onClick={() => {
                              setPercepatanPercent(preset.p);
                              setPenyeimbangPercent(preset.b);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-all ${
                              percepatanPercent === preset.p && penyeimbangPercent === preset.b
                                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                                : 'bg-slate-800/80 text-slate-400 hover:text-white'
                            }`}
                          >
                            {preset.tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Main Strategy Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/95 text-slate-300 text-[10px] uppercase font-black border-b border-indigo-500/20">
                      <th className="p-3.5">Sesi Penjualan</th>
                      <th className="p-3.5 text-center">Rata" % Kontribusi</th>
                      <th className="p-3.5 text-right">
                        <div>Target Sesi (100%)</div>
                        <div className="text-[8px] font-normal text-slate-400">Target Today × % Kontribusi</div>
                      </th>
                      <th className="p-3.5 text-right bg-cyan-950/30 border-l border-cyan-500/20">
                        <div className="text-cyan-300 flex items-center justify-end gap-1">
                          <i className="fas fa-bolt text-xs text-cyan-400"></i>
                          Target Percepatan ({percepatanPercent}%)
                        </div>
                        <div className="text-[8px] font-normal text-cyan-400/70">Hasil Kontribusi × {percepatanPercent}%</div>
                      </th>
                      <th className="p-3.5 text-right bg-purple-950/30 border-l border-purple-500/20">
                        <div className="text-purple-300 flex items-center justify-end gap-1">
                          <i className="fas fa-shield-alt text-xs text-purple-400"></i>
                          Target Penyeimbang ({penyeimbangPercent}%)
                        </div>
                        <div className="text-[8px] font-normal text-purple-400/70">Hasil Kontribusi × {penyeimbangPercent}%</div>
                      </th>
                      <th className="p-3.5 text-right border-l border-white/5">
                        <div>Realisasi Hari Ini</div>
                        <div className="text-[8px] font-normal text-slate-400">{strategyCalculations.strategyTargetDate}</div>
                      </th>
                      <th className="p-3.5 text-center border-l border-white/5 min-w-[180px]">
                        Status & Capaian Target
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold">
                    
                    {/* Row 1: Lunch Session */}
                    <tr className="hover:bg-indigo-950/20 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center text-xs shrink-0">
                            <i className="fas fa-sun"></i>
                          </div>
                          <div>
                            <div className="font-black text-amber-300 text-sm">Lunch Session</div>
                            <div className="text-[10px] text-slate-400 font-normal">Sesi Siang (11:00 - 15:00)</div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="p-3.5 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                          {strategyCalculations.lunchContrib.toFixed(1)}%
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="font-black text-white text-sm">
                          Rp {strategyCalculations.targetLunchNominal.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          Rp {strategyTargetRevenue.toLocaleString('id-ID')} × {strategyCalculations.lunchContrib.toFixed(1)}%
                        </div>
                      </td>

                      {/* Target Percepatan Lunch */}
                      <td className="p-3.5 text-right bg-cyan-950/20 border-l border-cyan-500/20">
                        <div className="font-black text-cyan-300 text-base">
                          Rp {strategyCalculations.lunchPercepatan.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-cyan-400/80">
                          {percepatanPercent}% dari Target Lunch
                        </div>
                      </td>

                      {/* Target Penyeimbang Lunch */}
                      <td className="p-3.5 text-right bg-purple-950/20 border-l border-purple-500/20">
                        <div className="font-black text-purple-300 text-sm">
                          Rp {strategyCalculations.lunchPenyeimbang.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-purple-400/80">
                          {penyeimbangPercent}% dari Target Lunch
                        </div>
                      </td>

                      {/* Realisasi Aktual Lunch */}
                      <td className="p-3.5 text-right border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualLunch > 0 ? (
                          <div>
                            <div className="font-black text-emerald-400 text-sm">
                              Rp {strategyCalculations.actualLunch.toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {strategyCalculations.lunchTotalProgress.toFixed(1)}% dari Target Sesi
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic text-[11px]">- Belum ada data -</div>
                        )}
                      </td>

                      {/* Status & Progress Lunch */}
                      <td className="p-3.5 text-center border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualLunch > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-400">vs Percepatan ({percepatanPercent}%):</span>
                              <span className={`font-black ${strategyCalculations.actualLunch >= strategyCalculations.lunchPercepatan ? 'text-cyan-400' : 'text-amber-400'}`}>
                                {strategyCalculations.lunchPercepatanProgress.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                              <div
                                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, strategyCalculations.lunchPercepatanProgress))}%` }}
                              ></div>
                            </div>
                            <div>
                              {strategyCalculations.actualLunch >= strategyCalculations.targetLunchNominal ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-[9px] border border-emerald-500/30">
                                  ✅ TARGET TERCAPAI
                                </span>
                              ) : strategyCalculations.actualLunch >= strategyCalculations.lunchPercepatan ? (
                                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black text-[9px] border border-cyan-500/30">
                                  ⚡ PERCEPATAN LOLOS
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-[9px] border border-amber-500/30">
                                  ⏳ KEJAR PERCEPATAN
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">
                            Target Peak Siang: <strong className="text-cyan-300">Rp {strategyCalculations.lunchPercepatan.toLocaleString('id-ID')}</strong>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Row 2: Dinner Session */}
                    <tr className="hover:bg-indigo-950/20 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-xs shrink-0">
                            <i className="fas fa-moon"></i>
                          </div>
                          <div>
                            <div className="font-black text-indigo-300 text-sm">Dinner Session</div>
                            <div className="text-[10px] text-slate-400 font-normal">Sesi Malam (17:00 - Closing)</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30">
                          {strategyCalculations.dinnerContrib.toFixed(1)}%
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="font-black text-white text-sm">
                          Rp {strategyCalculations.targetDinnerNominal.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          Rp {strategyTargetRevenue.toLocaleString('id-ID')} × {strategyCalculations.dinnerContrib.toFixed(1)}%
                        </div>
                      </td>

                      {/* Target Percepatan Dinner */}
                      <td className="p-3.5 text-right bg-cyan-950/20 border-l border-cyan-500/20">
                        <div className="font-black text-cyan-300 text-base">
                          Rp {strategyCalculations.dinnerPercepatan.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-cyan-400/80">
                          {percepatanPercent}% dari Target Dinner
                        </div>
                      </td>

                      {/* Target Penyeimbang Dinner */}
                      <td className="p-3.5 text-right bg-purple-950/20 border-l border-purple-500/20">
                        <div className="font-black text-purple-300 text-sm">
                          Rp {strategyCalculations.dinnerPenyeimbang.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-purple-400/80">
                          {penyeimbangPercent}% dari Target Dinner
                        </div>
                      </td>

                      {/* Realisasi Aktual Dinner */}
                      <td className="p-3.5 text-right border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualDinner > 0 ? (
                          <div>
                            <div className="font-black text-emerald-400 text-sm">
                              Rp {strategyCalculations.actualDinner.toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {strategyCalculations.dinnerTotalProgress.toFixed(1)}% dari Target Sesi
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic text-[11px]">- Belum ada data -</div>
                        )}
                      </td>

                      {/* Status & Progress Dinner */}
                      <td className="p-3.5 text-center border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualDinner > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-400">vs Percepatan ({percepatanPercent}%):</span>
                              <span className={`font-black ${strategyCalculations.actualDinner >= strategyCalculations.dinnerPercepatan ? 'text-cyan-400' : 'text-amber-400'}`}>
                                {strategyCalculations.dinnerPercepatanProgress.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                              <div
                                className="bg-gradient-to-r from-cyan-500 to-indigo-400 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, strategyCalculations.dinnerPercepatanProgress))}%` }}
                              ></div>
                            </div>
                            <div>
                              {strategyCalculations.actualDinner >= strategyCalculations.targetDinnerNominal ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-[9px] border border-emerald-500/30">
                                  ✅ TARGET TERCAPAI
                                </span>
                              ) : strategyCalculations.actualDinner >= strategyCalculations.dinnerPercepatan ? (
                                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black text-[9px] border border-cyan-500/30">
                                  ⚡ PERCEPATAN LOLOS
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-[9px] border border-amber-500/30">
                                  ⏳ KEJAR PERCEPATAN
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">
                            Target Peak Malam: <strong className="text-cyan-300">Rp {strategyCalculations.dinnerPercepatan.toLocaleString('id-ID')}</strong>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Row 3: TOTAL ALL DAY */}
                    <tr className="bg-gradient-to-r from-indigo-950/50 via-slate-900/80 to-purple-950/50 font-black border-t-2 border-indigo-500/40">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center text-xs shrink-0">
                            <i className="fas fa-flag-checkered"></i>
                          </div>
                          <div>
                            <div className="text-emerald-300 text-sm uppercase">TOTAL ALL DAY</div>
                            <div className="text-[10px] text-slate-300 font-normal">Target Today Revenue (100%)</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-xs border border-emerald-500/30">
                          100.0%
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="text-emerald-400 text-base">
                          Rp {strategyCalculations.targetTotalNominal.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-slate-400 font-normal">
                          Target Today Revenue
                        </div>
                      </td>

                      {/* Total Percepatan */}
                      <td className="p-3.5 text-right bg-cyan-950/40 border-l border-cyan-500/30">
                        <div className="text-cyan-300 text-lg">
                          Rp {strategyCalculations.totalPercepatan.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-cyan-400/90 font-normal">
                          Total Percepatan ({percepatanPercent}%)
                        </div>
                      </td>

                      {/* Total Penyeimbang */}
                      <td className="p-3.5 text-right bg-purple-950/40 border-l border-purple-500/30">
                        <div className="text-purple-300 text-base">
                          Rp {strategyCalculations.totalPenyeimbang.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[9px] text-purple-400/90 font-normal">
                          Total Penyeimbang ({penyeimbangPercent}%)
                        </div>
                      </td>

                      {/* Realisasi Total Sales */}
                      <td className="p-3.5 text-right border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualTotal > 0 ? (
                          <div>
                            <div className="text-emerald-400 text-base">
                              Rp {strategyCalculations.actualTotal.toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-slate-300 font-normal">
                              {strategyCalculations.totalDayProgress.toFixed(1)}% dari Target Hari Ini
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic text-[11px] font-normal">- Belum ada sales -</div>
                        )}
                      </td>

                      {/* Overall Progress */}
                      <td className="p-3.5 text-center border-l border-white/5">
                        {strategyCalculations.isRecorded || strategyCalculations.actualTotal > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-300">Total Capaian:</span>
                              <span className="text-emerald-400">{strategyCalculations.totalDayProgress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                              <div
                                className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, strategyCalculations.totalDayProgress))}%` }}
                              ></div>
                            </div>
                            <div className="text-[9px] text-slate-300 font-normal">
                              {strategyCalculations.actualTotal >= strategyCalculations.targetTotalNominal ? (
                                <span className="text-emerald-400 font-bold">Surplus: +Rp {(strategyCalculations.actualTotal - strategyCalculations.targetTotalNominal).toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-amber-400 font-bold">Kurang: -Rp {(strategyCalculations.targetTotalNominal - strategyCalculations.actualTotal).toLocaleString('id-ID')}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-normal">
                            Target Capaian: <strong className="text-emerald-400">100%</strong>
                          </div>
                        )}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>

              {/* Bottom Operational Action Cards */}
              <div className="p-4 bg-slate-900/70 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                
                {/* Action Card 1: Lunch Strategy */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/30 to-slate-900/60 border border-amber-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <i className="fas fa-sun text-amber-400"></i>
                      Strategi Lunch ({strategyCalculations.lunchContrib.toFixed(1)}%)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total: Rp {strategyCalculations.targetLunchNominal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                      <div className="text-cyan-400 font-bold">⚡ Percepatan ({percepatanPercent}%)</div>
                      <div className="text-white font-black text-xs mt-0.5">
                        Rp {strategyCalculations.lunchPercepatan.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Push peak 11:30 - 13:30</div>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-500/20">
                      <div className="text-purple-400 font-bold">🛡️ Penyeimbang ({penyeimbangPercent}%)</div>
                      <div className="text-white font-black text-xs mt-0.5">
                        Rp {strategyCalculations.lunchPenyeimbang.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Side & dessert push</div>
                    </div>
                  </div>
                </div>

                {/* Action Card 2: Dinner Strategy */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/30 to-slate-900/60 border border-indigo-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-indigo-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <i className="fas fa-moon text-indigo-400"></i>
                      Strategi Dinner ({strategyCalculations.dinnerContrib.toFixed(1)}%)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total: Rp {strategyCalculations.targetDinnerNominal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                      <div className="text-cyan-400 font-bold">⚡ Percepatan ({percepatanPercent}%)</div>
                      <div className="text-white font-black text-xs mt-0.5">
                        Rp {strategyCalculations.dinnerPercepatan.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Push peak 18:30 - 20:30</div>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-500/20">
                      <div className="text-purple-400 font-bold">🛡️ Penyeimbang ({penyeimbangPercent}%)</div>
                      <div className="text-white font-black text-xs mt-0.5">
                        Rp {strategyCalculations.dinnerPenyeimbang.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Late dinner & upselling</div>
                    </div>
                  </div>
                </div>

                {/* Action Card 3: Grand Total All Day */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/30 to-slate-900/60 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <i className="fas fa-bullseye text-emerald-400"></i>
                      Fokus Eksekusi Hari Ini
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">
                      Target: Rp {strategyTargetRevenue.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Total Percepatan ({percepatanPercent}%):</span>
                      <span className="font-black text-cyan-300">Rp {strategyCalculations.totalPercepatan.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Total Penyeimbang ({penyeimbangPercent}%):</span>
                      <span className="font-black text-purple-300">Rp {strategyCalculations.totalPenyeimbang.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 pt-1 border-t border-white/5">
                      💡 Mengamankan {percepatanPercent}% target di jam peak menjamin outlet mencapai target revenue harian 100%.
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: INVENTORY & COGS (OPENING + BELANJA - CLOSING) */}
      <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-2xl">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
            <i className="fas fa-boxes"></i>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-3">
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">
                2. Persediaan Inventory & Perhitungan COGS (HPP)
              </h2>
              <p className="text-xs text-slate-400">
                Formula COGS: Opening Inventory (+) + Budget Belanja ({targetBudgetPercent}%) - Closing Inventory (-)
              </p>
            </div>
            <button
              onClick={handleSubmitAllInventory}
              type="button"
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 border border-emerald-400/30 shrink-0"
            >
              <i className="fas fa-save"></i> SUBMIT & SIMPAN INVENTORY
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Opening Inventory Input */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  1. OPENING INVENTORY (+)
                </span>
                <span className="text-xs text-emerald-400 font-bold">+ STOK AWAL</span>
              </div>
              <input
                type="number"
                value={openingInventory || ''}
                onChange={(e) => setOpeningInventory(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-slate-900 text-white font-black text-lg px-3 py-2 rounded-xl border border-white/10 focus:border-emerald-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">Stok Awal bulan berjalan (Rp)</p>
            </div>

            <button
              type="button"
              onClick={handleSubmitOpeningInventory}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border border-emerald-400/30"
            >
              <i className="fas fa-check-circle"></i> SUBMIT STOK AWAL
            </button>
          </div>

          {/* MTD Actual Belanja */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-indigo-500/30 relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  2. MTD ACTUAL BELANJA (+)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black flex items-center gap-1">
                  <i className="fas fa-receipt text-[9px]"></i>
                  RECEIVING SHEET
                </span>
              </div>
              <div className="text-xl font-black text-indigo-300 py-1">
                Rp {calculationModel.actualBelanjaMTD.toLocaleString('id-ID')}
              </div>

              {/* Display Actual Belanja % = Actual Belanja / MTD Revenue */}
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-1 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">% Belanja MTD:</span>
                  <span className={`text-sm font-black ${
                    calculationModel.actualBelanjaPercent > targetBudgetPercent ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {calculationModel.actualBelanjaPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>(Actual Belanja ÷ MTD Revenue)</span>
                  <span className={calculationModel.actualBelanjaPercent <= targetBudgetPercent ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    Target: {targetBudgetPercent}% ({calculationModel.actualBelanjaPercent <= targetBudgetPercent ? 'EFISIEN' : 'OVER TARGET'})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px]">
              <span className="text-slate-400">
                Total Cost Tgl 1 - {cutoffDay}
              </span>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(true)}
                className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer flex items-center gap-1"
              >
                <i className="fas fa-search-dollar text-[10px]"></i>
                Rincian 8 Supplier
              </button>
            </div>
          </div>

          {/* Closing Inventory Percentage Input & Nominal Result Display */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  3. % CLOSING INVENTORY (-)
                </span>
                <span className="text-xs text-rose-400 font-bold">% STOK AKHIR</span>
              </div>

              {/* Percentage Input with '%' affix */}
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={closingInvPercent !== undefined ? closingInvPercent : ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setClosingInvPercent(isNaN(val) ? 0 : val);
                    setHasUserEditedClosingPercent(true);
                  }}
                  placeholder="10.0"
                  className="w-full bg-slate-900 text-rose-400 font-black text-xl pl-3 pr-10 py-2 rounded-xl border border-rose-500/40 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 font-black text-base pointer-events-none">
                  %
                </span>
              </div>

              {/* Quick % Selection Chips */}
              <div className="flex items-center gap-1.5 pt-1.5 overflow-x-auto">
                {[8, 9, 10, 10.5, 11].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setClosingInvPercent(pct);
                      setHasUserEditedClosingPercent(true);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      closingInvPercent === pct
                        ? 'bg-rose-500 text-white shadow'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Resulting Derived Nominal Closing Inventory Display */}
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-1 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">Nominal Stok Akhir:</span>
                  <span className="text-sm font-black text-white">
                    Rp {calculationModel.closingInventory.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>({calculationModel.closingInventoryPercent.toFixed(2)}% × MTD Revenue)</span>
                  <span className={calculationModel.isClosingInvSafe ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    Max: {maxClosingInvPercent}% ({calculationModel.isClosingInvSafe ? 'AMAN' : 'OVER TARGET'})
                  </span>
                </div>
                {calculationModel.hasEndingInvFromReceiving && (
                  <div className="pt-1.5 mt-1 border-t border-emerald-500/20 text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                    <i className="fas fa-check-circle text-[10px]"></i>
                    <span>Tersinkron dari Ending Inventory Receiving Sheet (Rp {calculationModel.endingInventoryNominal.toLocaleString('id-ID')})</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                <span>Estimasi Max Nom:</span>
                <span className={calculationModel.isClosingInvSafe ? 'text-slate-300 font-bold' : 'text-rose-400 font-bold'}>
                  Rp {calculationModel.maxClosingInvNominal.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitClosingInventory}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border border-rose-400/30 cursor-pointer"
            >
              <i className="fas fa-check-circle"></i> SUBMIT % STOK AKHIR
            </button>
          </div>

          {/* COGS (HPP) Hasil Akhir */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-950 border border-indigo-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                  TOTAL COGS (HPP) AKTUAL
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                  {calculationModel.actualCogsPercent.toFixed(2)}%
                </span>
              </div>
              <div className="text-xl font-black text-indigo-300 py-1">
                Rp {calculationModel.effectiveCOGS.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Opening (Rp {openingInventory.toLocaleString('id-ID')}) + Budget Belanja (Rp {calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}) - Closing (Rp {closingInventory.toLocaleString('id-ID')})
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 text-[10px] text-slate-400">
              <span className="font-bold text-white">Status COGS:</span> {calculationModel.isActualCogsSafe ? '✅ Optimal (≤ Target)' : '⚠️ Over Budget'}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: KONTROL BUDGET BELANJA (43%) & ALOKASI PERIODE / DIVISI */}
      <div className="glass-card p-6 border border-white/10 bg-slate-900/90 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <i className="fas fa-shopping-cart"></i>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">
                3. Kontrol Budget Belanja ({targetBudgetPercent}%) & Alokasi Jatah Divisi
              </h2>
              <p className="text-xs text-slate-400">
                Alokasi Sisa Budget Belanja untuk periode hari belanja ({orderDaysLabel})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Set Budget:</span>
            <div className="flex items-center gap-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-white/10">
              <input
                type="number"
                step="0.1"
                value={targetBudgetPercent}
                onChange={(e) => setTargetBudgetPercent(parseFloat(e.target.value) || 0)}
                className="w-14 bg-transparent text-emerald-400 font-black text-sm text-right focus:outline-none"
              />
              <span className="text-emerald-400 font-black text-sm">%</span>
            </div>
          </div>
        </div>

        {/* BANNER SHORTCUT: ALOKASI BUDGET BELANJA PENGADAAN TERHUBUNG KE COGS */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-indigo-950/40 border border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg font-black flex-none">
              <i className="fas fa-chart-pie"></i>
            </div>
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                Alokasi Budget Belanja Pengadaan (MK, MS, Cash & Supplier)
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-mono font-bold">Terhubung COGS</span>
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                Pembagian target nominal belanja ke Main Kitchen (MK), Main Store (MS), Cash Pasar, dan 7 Rekanan Supplier berdasarkan Target Budget COGS {targetBudgetPercent}% (Rp {calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCogsMainTab('ALOKASI_BUDGET')}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 flex-none cursor-pointer"
          >
            <i className="fas fa-arrow-right"></i> Buka Alokasi Belanja
          </button>
        </div>

        {/* Budget KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Total Target Belanja */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              TOTAL TARGET BELANJA ({targetBudgetPercent}%)
            </div>
            <div className="text-lg md:text-xl font-black text-white">
              Rp {calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Projected Rev × {targetBudgetPercent}%</p>
          </div>

          {/* Card 2: Actual Belanja MTD */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  ACTUAL BELANJA (1 - {cutoffDay})
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-black ${
                  calculationModel.actualBelanjaPercent > targetBudgetPercent
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {calculationModel.actualBelanjaPercent.toFixed(2)}%
                </span>
              </div>
              <div className="text-lg md:text-xl font-black text-indigo-400">
                Rp {calculationModel.actualBelanjaMTD.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Terpakai s/d cut-off (Tgl 1 - {cutoffDay})</p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold">% Belanja MTD:</span>
                <span className={`font-black ${
                  calculationModel.actualBelanjaPercent > targetBudgetPercent ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {calculationModel.actualBelanjaPercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span>(Actual Belanja ÷ MTD Revenue)</span>
                <span className={calculationModel.actualBelanjaPercent <= targetBudgetPercent ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  Target: {targetBudgetPercent}% ({calculationModel.actualBelanjaPercent <= targetBudgetPercent ? 'EFISIEN' : 'OVER TARGET'})
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Sisa Budget Belanja */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/60 via-slate-950 to-slate-950 border border-amber-500/40">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 mb-1">
              SISA BUDGET BELANJA
            </div>
            <div className={`text-xl md:text-2xl font-black ${
              calculationModel.sisaBudgetBelanja >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Untuk mencapai target {targetBudgetPercent}%</p>
          </div>

          {/* Card 4: Batas Belanja per Hari / per Order */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-emerald-500/30">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">
              BATAS BELANJA SISA HARI
            </div>
            <div className="text-lg md:text-xl font-black text-emerald-400">
              Rp {calculationModel.dailyPurchasingBudgetRemaining.toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-normal">/ hari</span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 text-[11px] text-slate-400 flex justify-between">
              <span>Per Hari Order ({orderDaysShortLabel}):</span>
              <span className="text-amber-300 font-bold">
                Rp {calculationModel.budgetPerOrderDay.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>

        {/* PENGATURAN PERSENTASE ALOKASI SISA BUDGET BELANJA KE SETIAP DIVISI */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-slate-900/80 to-slate-950 border border-indigo-500/30 space-y-4 mb-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">
                  <i className="fas fa-sliders-h"></i>
                </span>
                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
                  Pengaturan Persentase Sisa Budget Belanja ke Setiap Divisi
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Alokasikan <strong className="text-amber-300">Nominal Sisa Budget Belanja (Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')})</strong> ke setiap divisi secara fleksibel sesuai keinginan operasional outlet.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 ${
                Math.abs(totalAllocatedPercent - 100) < 0.01
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : totalAllocatedPercent < 100
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                {Math.abs(totalAllocatedPercent - 100) < 0.01 ? (
                  <>
                    <i className="fas fa-check-circle"></i>
                    Total 100% Dialokasikan Penuh
                  </>
                ) : totalAllocatedPercent < 100 ? (
                  <>
                    <i className="fas fa-exclamation-triangle"></i>
                    Sisa {(100 - totalAllocatedPercent).toFixed(1)}% Belum Dialokasikan
                  </>
                ) : (
                  <>
                    <i className="fas fa-exclamation-circle"></i>
                    Over Alokasi {(totalAllocatedPercent - 100).toFixed(1)}% ({totalAllocatedPercent.toFixed(1)}%)
                  </>
                )}
              </span>

              {Math.abs(totalAllocatedPercent - 100) >= 0.01 && (
                <button
                  type="button"
                  onClick={handleAutoBalanceDivisions}
                  className="px-2.5 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-xs font-bold border border-indigo-500/30 transition-all cursor-pointer flex items-center gap-1"
                  title="Sesuaikan persentase secara proporsional agar genap 100%"
                >
                  <i className="fas fa-magic"></i> Auto 100%
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveDivisionAllocations}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <i className="fas fa-save"></i> Simpan Alokasi Divisi
              </button>
            </div>
          </div>

          {/* Quick Allocation Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <i className="fas fa-bolt text-amber-400"></i> Preset Cepat:
            </span>
            {[
              { key: 'standard', label: 'Standar F&B (70/20/10)' },
              { key: 'kitchen_heavy', label: 'Kitchen Dominan (75/15/10)' },
              { key: 'food_bar', label: 'Food & Bar Imbang (55/35/10)' },
              { key: 'equal', label: 'Bagi Rata (34/33/33)' },
              { key: 'four_divisions', label: '4 Divisi (+ Pastry 15%)' }
            ].map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handleApplyDivisionPreset(p.key)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-indigo-400 text-slate-300 hover:text-white font-medium text-[11px] cursor-pointer transition-all"
              >
                {p.label}
              </button>
            ))}
            
            {!isAddingDivision && (
              <button
                type="button"
                onClick={() => setIsAddingDivision(true)}
                className="px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/30 hover:bg-indigo-900/60 text-indigo-300 font-bold text-[11px] cursor-pointer transition-all ml-auto flex items-center gap-1"
              >
                <i className="fas fa-plus"></i> Tambah Divisi Kustom
              </button>
            )}
          </div>

          {/* Inline Add Division Form */}
          {isAddingDivision && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-500/40 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-white font-bold text-[11px]">Nama Divisi Baru:</span>
              <input
                type="text"
                value={newDivName}
                onChange={(e) => setNewDivName(e.target.value)}
                placeholder="Contoh: Pastry, Bakery, Steward..."
                className="bg-slate-900 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNewDivision();
                  if (e.key === 'Escape') setIsAddingDivision(false);
                }}
              />
              <button
                type="button"
                onClick={handleAddNewDivision}
                disabled={!newDivName.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                Tambah
              </button>
              <button
                type="button"
                onClick={() => { setIsAddingDivision(false); setNewDivName(''); }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
            </div>
          )}

          {/* Interactive Sliders & Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {calculationModel.divisionList.map((div) => {
              const borderCol = div.color === 'blue'
                ? 'border-blue-500/30 bg-blue-950/20'
                : div.color === 'amber'
                ? 'border-amber-500/30 bg-amber-950/20'
                : div.color === 'purple'
                ? 'border-purple-500/30 bg-purple-950/20'
                : div.color === 'emerald'
                ? 'border-emerald-500/30 bg-emerald-950/20'
                : 'border-cyan-500/30 bg-cyan-950/20';

              const textCol = div.color === 'blue'
                ? 'text-blue-400'
                : div.color === 'amber'
                ? 'text-amber-400'
                : div.color === 'purple'
                ? 'text-purple-400'
                : div.color === 'emerald'
                ? 'text-emerald-400'
                : 'text-cyan-400';

              return (
                <div
                  key={div.id}
                  className={`p-4 rounded-2xl border ${borderCol} space-y-3 relative overflow-hidden`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg bg-white/10 ${textCol} flex items-center justify-center text-xs font-black`}>
                        <i className={`fas ${div.icon}`}></i>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white uppercase">{div.name}</h4>
                        <span className={`text-[10px] ${textCol} font-bold`}>
                          Alokasi {div.percent}% dari Sisa Budget
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-white/10">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={div.percent}
                          onChange={(e) => handleUpdateDivisionPercent(div.id, parseFloat(e.target.value) || 0)}
                          className={`w-12 bg-transparent ${textCol} font-black text-xs text-right focus:outline-none`}
                        />
                        <span className={`${textCol} font-black text-xs ml-0.5`}>%</span>
                      </div>

                      {div.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDivision(div.id)}
                          className="w-6 h-6 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 flex items-center justify-center text-[10px] cursor-pointer"
                          title="Hapus divisi kustom"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Range Slider */}
                  <div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={div.percent}
                      onChange={(e) => handleUpdateDivisionPercent(div.id, parseFloat(e.target.value) || 0)}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Live Calculations from Nominal Sisa Budget */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Nominal Alokasi Sisa:</span>
                      <span className="text-white font-black text-xs">
                        Rp {div.totalSisaBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Jatah / Hari Sisa ({calculationModel.remainingTotalDays} Hari):</span>
                      <span className={`${textCol} font-bold`}>
                        Rp {div.dailyBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Jatah / Hari Order ({orderDaysShortLabel}):</span>
                      <span className="text-emerald-400 font-black">
                        Rp {div.orderDayBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Divisional Breakdown Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-black text-slate-300 uppercase tracking-wider">
            <span>Ringkasan Alokasi Jatah Belanja per Divisi</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {calculationModel.divisionList.map(d => `${d.name}: ${d.percent}%`).join(' | ')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {calculationModel.divisionList.map(div => {
              const borderCol = div.color === 'blue'
                ? 'border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-950 to-slate-950'
                : div.color === 'amber'
                ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-950 to-slate-950'
                : div.color === 'purple'
                ? 'border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-slate-950 to-slate-950'
                : div.color === 'emerald'
                ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950'
                : 'border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-slate-950 to-slate-950';

              const textCol = div.color === 'blue'
                ? 'text-blue-400'
                : div.color === 'amber'
                ? 'text-amber-400'
                : div.color === 'purple'
                ? 'text-purple-400'
                : div.color === 'emerald'
                ? 'text-emerald-400'
                : 'text-cyan-400';

              const badgeCol = div.color === 'blue'
                ? 'bg-blue-500/20 text-blue-300'
                : div.color === 'amber'
                ? 'bg-amber-500/20 text-amber-300'
                : div.color === 'purple'
                ? 'bg-purple-500/20 text-purple-300'
                : div.color === 'emerald'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-cyan-500/20 text-cyan-300';

              return (
                <div
                  key={div.id}
                  className={`p-5 rounded-2xl border ${borderCol} relative overflow-hidden`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl bg-white/10 ${textCol} flex items-center justify-center font-black text-sm`}>
                        <i className={`fas ${div.icon}`}></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase">{div.name}</h4>
                        <span className={`text-[10px] ${textCol} font-bold`}>Porsi {div.percent}% dari Sisa Budget</span>
                      </div>
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${badgeCol}`}>
                      {div.percent}%
                    </span>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Sisa Budget:</span>
                      <span className="text-white font-bold">
                        Rp {div.totalSisaBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Jatah / Hari Sisa ({calculationModel.remainingTotalDays} Hari):</span>
                      <span className={`${textCol} font-bold`}>
                        Rp {div.dailyBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Jatah / Hari Order ({orderDaysShortLabel}):</span>
                      <span className="text-emerald-400 font-black">
                        Rp {div.orderDayBudget.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PENGATURAN ALOKASI BELANJA TERUTAMA SUPPLIER PER DIVISI (DARI 100% SISA BUDGET DIVISI) */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 space-y-6 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-rose-500 text-white flex items-center justify-center text-sm font-black shadow-lg">
                  <i className="fas fa-truck-loading"></i>
                </span>
                <h3 className="text-base font-black text-white uppercase tracking-tight">
                  Alokasi Belanja & Mitra Supplier per Divisi
                </h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                  100% Sisa Budget Divisi
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Atur berapa persentase (%) yang ingin digunakan dari <strong className="text-white">100% sisa budget masing-masing divisi</strong> untuk Rekanan Supplier, Main Kitchen (MK), Main Store (MS), dan Cash/Pasar.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleCopyDivSupplierWhatsApp(curDivId)}
                className="px-3 py-1.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow"
                title="Salin rincian alokasi supplier divisi ini ke format WhatsApp"
              >
                <i className="fab fa-whatsapp text-emerald-300"></i> Salin WA Divisi
              </button>
              <button
                type="button"
                onClick={handleSaveDivisionSupplierAllocations}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <i className="fas fa-save"></i> Simpan Alokasi Supplier
              </button>
            </div>
          </div>

          {/* Tab Selector Divisi */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <i className="fas fa-layer-group text-indigo-400"></i> Pilih Divisi yang Ingin Diatur Alokasi Belanjanya:
              </span>
              <span className="text-[11px] text-slate-500">
                Total Sisa Budget Outlet: Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {calculationModel.divisionList.map(div => {
                const isActive = div.id === curDivId;
                const divShare = divisionSupplierAllocations[div.id] || getFallbackDivisionSupplierShare(div.id);
                const sumPct = (divShare.supplier || 0) + (divShare.mainKitchen || 0) + (divShare.mainStore || 0) + (divShare.cash || 0);
                const isExact = Math.abs(sumPct - 100) < 0.01;

                return (
                  <button
                    key={div.id}
                    type="button"
                    onClick={() => setActiveSupplierDivId(div.id)}
                    className={`px-4 py-2.5 rounded-2xl text-left border transition-all cursor-pointer flex items-center gap-3 ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border-indigo-500 text-white shadow-lg ring-1 ring-indigo-500/50'
                        : 'bg-slate-950/70 border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                      div.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                      div.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                      div.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                      div.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      <i className={`fas ${div.icon}`}></i>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider">{div.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          isExact ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {sumPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 font-bold">
                        Rp {div.totalSisaBudget.toLocaleString('id-ID')} <span className="text-[10px] text-slate-500 font-normal">({div.percent}% Sisa Outlet)</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Division Control Card */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-white/10 space-y-5">
            {/* Active Division Summary Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/90 border border-white/10">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${
                  selectedDivObj.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                  selectedDivObj.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                  selectedDivObj.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                  selectedDivObj.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-cyan-500/20 text-cyan-400'
                }`}>
                  <i className={`fas ${selectedDivObj.icon}`}></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                      Divisi {selectedDivObj.name}
                    </h4>
                    <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-lg border border-indigo-500/30">
                      Porsi {selectedDivObj.percent}% dari Sisa Budget Outlet
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                    <span className="text-slate-400">
                      Total 100% Sisa Budget Divisi: <strong className="text-white font-mono font-bold">Rp {curTotalSisa.toLocaleString('id-ID')}</strong>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Jatah / Hari Sisa: <strong className="text-indigo-300 font-mono font-bold">Rp {selectedDivObj.dailyBudget.toLocaleString('id-ID')}</strong> ({calculationModel.remainingTotalDays} Hari)
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Jatah / Hari Order ({orderDaysShortLabel}): <strong className="text-emerald-400 font-mono font-bold">Rp {selectedDivObj.orderDayBudget.toLocaleString('id-ID')}</strong> ({calculationModel.remainingOrderDaysCount} Order)
                    </span>
                  </div>
                </div>
              </div>

              {/* Status 100% & Auto balance & Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5 ${
                  Math.abs(curTotalPct - 100) < 0.01
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : curTotalPct < 100
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {Math.abs(curTotalPct - 100) < 0.01 ? (
                    <>
                      <i className="fas fa-check-circle"></i> 100.0% Pas
                    </>
                  ) : curTotalPct < 100 ? (
                    <>
                      <i className="fas fa-exclamation-triangle"></i> Sisa {(100 - curTotalPct).toFixed(1)}%
                    </>
                  ) : (
                    <>
                      <i className="fas fa-exclamation-circle"></i> Over {(curTotalPct - 100).toFixed(1)}% ({curTotalPct.toFixed(1)}%)
                    </>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => handleAutoBalanceDivSupplier(curDivId)}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-xs font-bold border border-indigo-500/30 transition-all cursor-pointer flex items-center gap-1"
                  title="Sesuaikan channel secara proporsional agar genap 100%"
                >
                  <i className="fas fa-magic"></i> Auto 100%
                </button>
              </div>
            </div>

            {/* Presets Cepat Alokasi Supplier */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <i className="fas fa-bolt text-amber-400"></i> Preset Cepat {selectedDivObj.name}:
              </span>
              <button
                type="button"
                onClick={() => handleApplyDivSupplierPreset(curDivId, 'supplier_heavy')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-rose-400 text-slate-300 hover:text-white font-medium text-[11px] cursor-pointer transition-all"
              >
                Fokus Supplier Mitra (60/20/10/10)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDivSupplierPreset(curDivId, 'mk_heavy')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-amber-400 text-slate-300 hover:text-white font-medium text-[11px] cursor-pointer transition-all"
              >
                Fokus Central Kitchen (35/45/10/10)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDivSupplierPreset(curDivId, 'store_heavy')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-indigo-400 text-slate-300 hover:text-white font-medium text-[11px] cursor-pointer transition-all"
              >
                Fokus Gudang & Pasar (20/10/45/25)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDivSupplierPreset(curDivId, 'equal')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-emerald-400 text-slate-300 hover:text-white font-medium text-[11px] cursor-pointer transition-all"
              >
                Bagi Rata (25/25/25/25)
              </button>
            </div>

            {/* 4 Cards Alokasi Belanja & Supplier */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. REKANAN MITRA SUPPLIER */}
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-950 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-black">
                        <i className="fas fa-handshake"></i>
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-white uppercase">Rekanan Supplier</h5>
                        <span className="text-[10px] text-rose-400 font-bold">7 Mitra Eksternal</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-rose-500/30">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={curShare.supplier || 0}
                        onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'supplier', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-rose-400 font-black text-xs text-right focus:outline-none"
                      />
                      <span className="text-rose-400 font-black text-xs ml-0.5">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={curShare.supplier || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'supplier', parseFloat(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />

                  <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Nominal dari Sisa:</span>
                      <span className="text-white font-mono font-bold text-xs">
                        Rp {Math.round(curTotalSisa * ((curShare.supplier || 0) / 100)).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Jatah / Hari Sisa:</span>
                      <span className="text-rose-300 font-mono font-bold">
                        Rp {calculationModel.remainingTotalDays > 0 ? Math.round((curTotalSisa * ((curShare.supplier || 0) / 100)) / calculationModel.remainingTotalDays).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Per Hari Order:</span>
                      <span className="text-emerald-400 font-mono font-black">
                        Rp {calculationModel.remainingOrderDaysCount > 0 ? Math.round((curTotalSisa * ((curShare.supplier || 0) / 100)) / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsSupplierBreakdownExpanded(!isSupplierBreakdownExpanded)}
                  className="w-full mt-2 py-1 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <i className={`fas fa-chevron-${isSupplierBreakdownExpanded ? 'up' : 'down'}`}></i>
                  {isSupplierBreakdownExpanded ? 'Tutup Rincian 7 Mitra' : 'Rincian 7 Mitra Supplier'}
                </button>
              </div>

              {/* 2. MAIN KITCHEN */}
              <div className="p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-slate-950 to-slate-950 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
                        <i className="fas fa-utensils"></i>
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-white uppercase">Main Kitchen (MK)</h5>
                        <span className="text-[10px] text-amber-400 font-bold">Central Production</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-amber-500/30">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={curShare.mainKitchen || 0}
                        onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'mainKitchen', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-amber-400 font-black text-xs text-right focus:outline-none"
                      />
                      <span className="text-amber-400 font-black text-xs ml-0.5">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={curShare.mainKitchen || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'mainKitchen', parseFloat(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />

                  <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Nominal dari Sisa:</span>
                      <span className="text-white font-mono font-bold text-xs">
                        Rp {Math.round(curTotalSisa * ((curShare.mainKitchen || 0) / 100)).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Jatah / Hari Sisa:</span>
                      <span className="text-amber-300 font-mono font-bold">
                        Rp {calculationModel.remainingTotalDays > 0 ? Math.round((curTotalSisa * ((curShare.mainKitchen || 0) / 100)) / calculationModel.remainingTotalDays).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Per Hari Order:</span>
                      <span className="text-emerald-400 font-mono font-black">
                        Rp {calculationModel.remainingOrderDaysCount > 0 ? Math.round((curTotalSisa * ((curShare.mainKitchen || 0) / 100)) / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 pt-1 border-t border-white/5">
                  Pesanan produk olahan Central Kitchen
                </p>
              </div>

              {/* 3. MAIN STORE */}
              <div className="p-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 via-slate-950 to-slate-950 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">
                        <i className="fas fa-boxes"></i>
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-white uppercase">Main Store (MS)</h5>
                        <span className="text-[10px] text-indigo-400 font-bold">Gudang & Logistik</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-indigo-500/30">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={curShare.mainStore || 0}
                        onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'mainStore', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-indigo-400 font-black text-xs text-right focus:outline-none"
                      />
                      <span className="text-indigo-400 font-black text-xs ml-0.5">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={curShare.mainStore || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'mainStore', parseFloat(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />

                  <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Nominal dari Sisa:</span>
                      <span className="text-white font-mono font-bold text-xs">
                        Rp {Math.round(curTotalSisa * ((curShare.mainStore || 0) / 100)).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Jatah / Hari Sisa:</span>
                      <span className="text-indigo-300 font-mono font-bold">
                        Rp {calculationModel.remainingTotalDays > 0 ? Math.round((curTotalSisa * ((curShare.mainStore || 0) / 100)) / calculationModel.remainingTotalDays).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Per Hari Order:</span>
                      <span className="text-emerald-400 font-mono font-black">
                        Rp {calculationModel.remainingOrderDaysCount > 0 ? Math.round((curTotalSisa * ((curShare.mainStore || 0) / 100)) / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 pt-1 border-t border-white/5">
                  Bahan kering, kemasan & logistik central
                </p>
              </div>

              {/* 4. CASH SUPPLIER / PASAR */}
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-slate-950 to-slate-950 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-black">
                        <i className="fas fa-money-bill-wave"></i>
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-white uppercase">Cash Pasar / Retail</h5>
                        <span className="text-[10px] text-emerald-400 font-bold">Belanja Tunai Langsung</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-emerald-500/30">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={curShare.cash || 0}
                        onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'cash', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-emerald-400 font-black text-xs text-right focus:outline-none"
                      />
                      <span className="text-emerald-400 font-black text-xs ml-0.5">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={curShare.cash || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(curDivId, 'cash', parseFloat(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />

                  <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Nominal dari Sisa:</span>
                      <span className="text-white font-mono font-bold text-xs">
                        Rp {Math.round(curTotalSisa * ((curShare.cash || 0) / 100)).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Jatah / Hari Sisa:</span>
                      <span className="text-emerald-300 font-mono font-bold">
                        Rp {calculationModel.remainingTotalDays > 0 ? Math.round((curTotalSisa * ((curShare.cash || 0) / 100)) / calculationModel.remainingTotalDays).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
                      <span className="text-slate-300 font-bold">Per Hari Order:</span>
                      <span className="text-emerald-400 font-mono font-black">
                        Rp {calculationModel.remainingOrderDaysCount > 0 ? Math.round((curTotalSisa * ((curShare.cash || 0) / 100)) / calculationModel.remainingOrderDaysCount).toLocaleString('id-ID') : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 pt-1 border-t border-white/5">
                  Sayur segar, bumbu pasar & pembelian retail harian
                </p>
              </div>
            </div>

            {/* EXPANDABLE 7 MITRA SUPPLIER BREAKDOWN */}
            <AnimatePresence>
              {isSupplierBreakdownExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 space-y-3 overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-white/10">
                    <div>
                      <h5 className="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
                        <i className="fas fa-network-wired"></i> Rincian 7 Rekanan Mitra Supplier untuk Divisi {selectedDivObj.name}
                      </h5>
                      <p className="text-[11px] text-slate-400">
                        Atur alokasi porsi masing-masing mitra supplier dari Total Budget Rekanan Supplier Divisi (Rp {Math.round(curTotalSisa * ((curShare.supplier || 0) / 100)).toLocaleString('id-ID')})
                      </p>
                    </div>

                    <span className="text-xs font-mono font-bold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-lg">
                      Alokasi Rekanan: {curShare.supplier}% (Rp {Math.round(curTotalSisa * ((curShare.supplier || 0) / 100)).toLocaleString('id-ID')})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {PARTNER_SUPPLIERS.map(sup => {
                      const supPortion = curShare.supplierBreakdown?.[sup.key] ?? (
                        DEFAULT_DIVISION_SUPPLIER_ALLOCATIONS[curDivId]?.supplierBreakdown?.[sup.key] ?? 14.3
                      );
                      const totalSupBudget = Math.round(curTotalSisa * ((curShare.supplier || 0) / 100));
                      const supNominal = Math.round(totalSupBudget * (supPortion / 100));

                      return (
                        <div key={sup.key} className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${sup.color}`}></span>
                              {sup.label}
                            </span>
                            <div className="flex items-center bg-slate-900 px-1.5 py-0.5 rounded border border-white/10">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={supPortion}
                                onChange={(e) => handleUpdateDivSupplierSubItem(curDivId, sup.key, parseFloat(e.target.value) || 0)}
                                className="w-10 bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                              />
                              <span className="text-slate-400 text-xs ml-0.5">%</span>
                            </div>
                          </div>

                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={supPortion}
                            onChange={(e) => handleUpdateDivSupplierSubItem(curDivId, sup.key, parseFloat(e.target.value) || 0)}
                            className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-rose-500"
                          />

                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Estimasi:</span>
                            <span className="font-mono font-bold text-emerald-400">Rp {supNominal.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Division Visual Stacked Allocation Bar */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-chart-bar text-indigo-400"></i> Distribusi Belanja Divisi {selectedDivObj.name} (100% Sisa Budget):
                </span>
                <span className="font-mono text-[11px] text-white">
                  Total: Rp {curTotalSisa.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="h-5 w-full bg-slate-950 rounded-xl flex overflow-hidden border border-white/10 p-0.5 gap-1">
                {(curShare.supplier || 0) > 0 && (
                  <div
                    style={{ width: `${curShare.supplier}%` }}
                    className="h-full bg-rose-500 rounded-lg flex items-center justify-center text-[10px] font-black text-white truncate px-1 transition-all"
                    title={`Rekanan Supplier: ${curShare.supplier}%`}
                  >
                    {(curShare.supplier || 0) > 8 ? `Supplier ${curShare.supplier}%` : ''}
                  </div>
                )}
                {(curShare.mainKitchen || 0) > 0 && (
                  <div
                    style={{ width: `${curShare.mainKitchen}%` }}
                    className="h-full bg-amber-500 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-950 truncate px-1 transition-all"
                    title={`Main Kitchen: ${curShare.mainKitchen}%`}
                  >
                    {(curShare.mainKitchen || 0) > 8 ? `MK ${curShare.mainKitchen}%` : ''}
                  </div>
                )}
                {(curShare.mainStore || 0) > 0 && (
                  <div
                    style={{ width: `${curShare.mainStore}%` }}
                    className="h-full bg-indigo-500 rounded-lg flex items-center justify-center text-[10px] font-black text-white truncate px-1 transition-all"
                    title={`Main Store: ${curShare.mainStore}%`}
                  >
                    {(curShare.mainStore || 0) > 8 ? `MS ${curShare.mainStore}%` : ''}
                  </div>
                )}
                {(curShare.cash || 0) > 0 && (
                  <div
                    style={{ width: `${curShare.cash}%` }}
                    className="h-full bg-emerald-500 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-950 truncate px-1 transition-all"
                    title={`Cash Pasar: ${curShare.cash}%`}
                  >
                    {(curShare.cash || 0) > 8 ? `Cash ${curShare.cash}%` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* TABEL COMPARISON SEMUA DIVISI */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-black text-slate-300 uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5">
                  <i className="fas fa-table text-indigo-400"></i> Tabel Rekapitulasi Alokasi Belanja & Supplier Seluruh Divisi
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  Sisa Budget Belanja: Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 text-[10px] uppercase tracking-wider font-bold border-b border-white/10">
                      <th className="p-3">Divisi</th>
                      <th className="p-3 text-right">Porsi Outlet %</th>
                      <th className="p-3 text-right">Sisa Budget (Rp)</th>
                      <th className="p-3 text-right text-rose-300">Rekanan Supplier</th>
                      <th className="p-3 text-right text-amber-300">Main Kitchen</th>
                      <th className="p-3 text-right text-indigo-300">Main Store</th>
                      <th className="p-3 text-right text-emerald-300">Cash Pasar</th>
                      <th className="p-3 text-center">Status 100%</th>
                      <th className="p-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {calculationModel.divisionList.map(d => {
                      const isSel = d.id === curDivId;
                      return (
                        <tr
                          key={d.id}
                          className={`hover:bg-white/[0.03] transition-colors cursor-pointer ${
                            isSel ? 'bg-indigo-950/20' : ''
                          }`}
                          onClick={() => setActiveSupplierDivId(d.id)}
                        >
                          <td className="p-3 font-sans font-bold text-white flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              d.color === 'blue' ? 'bg-blue-400' :
                              d.color === 'amber' ? 'bg-amber-400' :
                              d.color === 'purple' ? 'bg-purple-400' :
                              d.color === 'emerald' ? 'bg-emerald-400' : 'bg-cyan-400'
                            }`}></span>
                            <span>{d.name}</span>
                          </td>
                          <td className="p-3 text-right text-slate-300 font-bold">{d.percent}%</td>
                          <td className="p-3 text-right font-black text-white">
                            Rp {d.totalSisaBudget.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right text-rose-300 font-bold">
                            Rp {d.supplierNominal.toLocaleString('id-ID')} <span className="text-[10px] text-rose-400">({d.supplierPct}%)</span>
                          </td>
                          <td className="p-3 text-right text-amber-300 font-bold">
                            Rp {d.mkNominal.toLocaleString('id-ID')} <span className="text-[10px] text-amber-400">({d.mkPct}%)</span>
                          </td>
                          <td className="p-3 text-right text-indigo-300 font-bold">
                            Rp {d.msNominal.toLocaleString('id-ID')} <span className="text-[10px] text-indigo-400">({d.msPct}%)</span>
                          </td>
                          <td className="p-3 text-right text-emerald-300 font-bold">
                            Rp {d.cashNominal.toLocaleString('id-ID')} <span className="text-[10px] text-emerald-400">({d.cashPct}%)</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              Math.abs(d.totalDivSupplierPct - 100) < 0.01
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {d.totalDivSupplierPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyDivSupplierWhatsApp(d.id);
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[10px] font-bold transition-all cursor-pointer"
                              title="Salin WA Divisi"
                            >
                              <i className="fab fa-whatsapp"></i> WA
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Order Schedule Pill Box */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-950/60 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <i className="fas fa-calendar-check"></i>
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase">
                Jadwal Hari Belanja Sisa ({calculationModel.remainingOrderDaysCount} Hari Order • {orderDaysLabel}):
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-1.5">
                {calculationModel.remainingOrderDates.map((dt, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-slate-900 text-emerald-300 font-bold border border-emerald-500/20">
                    {dt}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase block">Jatah Belanja Total per Order:</span>
            <span className="text-emerald-400 font-black text-base">
              Rp {calculationModel.budgetPerOrderDay.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 4: TABEL DETAIL 31 HARI */}
      <div className="glass-card p-6 border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <i className="fas fa-table"></i>
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight">
                Tabel Breakdown Harian (1 - {daysInMonth} {INDO_MONTHS[selectedMonth]} {selectedYear})
              </h3>
              <p className="text-[11px] text-slate-400">
                Menampilkan tanggal aktual (1 - {cutoffDay}) dan proyeksi forecast sisa hari beserta hari belanja.
              </p>
            </div>
          </div>

          {/* Table Filters */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-white/10">
            {[
              { id: 'ALL', label: `Semua Hari (${daysInMonth})` },
              { id: 'CUTOFF_PAST', label: `Actual (1 - ${cutoffDay})` },
              { id: 'CUTOFF_REMAINING', label: `Forecast (${cutoffDay + 1} - ${daysInMonth})` },
              { id: 'ORDER_DAYS', label: `Hari Belanja (${orderDaysShortLabel})` }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveTableFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  activeTableFilter === f.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto custom-scrollbar rounded-xl border border-white/10 bg-slate-950/40">
          <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 border-b border-white/10 text-[10px] font-black uppercase tracking-wider">
                <th className="p-3">Tanggal & Hari</th>
                <th className="p-3 text-center">Tipe Hari</th>
                <th className="p-3 text-center">Status Data</th>
                <th className="p-3 text-center">Hari Order</th>
                <th className="p-3 text-right">Revenue (Rp)</th>
                <th className="p-3 text-right">Belanja Supplier (Rp)</th>
                <th className="p-3 text-right">Daily Cost %</th>
                <th className="p-3 text-right">Kum. Revenue</th>
                <th className="p-3 text-right">Kum. Belanja</th>
                <th className="p-3 text-right bg-slate-900/60">Kum. COGS %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredDailyData.map(row => {
                const isPassed = row.isPastOrCutoff;
                const isOrderDay = row.isOrderDay;

                return (
                  <tr
                    key={row.day}
                    className={`hover:bg-white/[0.03] transition-colors ${
                      isPassed ? 'bg-transparent' : 'bg-indigo-950/10'
                    } ${isOrderDay ? 'border-l-2 border-emerald-500' : ''}`}
                  >
                    <td className="p-3 font-bold text-white whitespace-nowrap">
                      {row.dayName}, {row.day} {INDO_MONTHS[selectedMonth].substring(0, 3)}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.isWeekday ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {row.isWeekday ? 'WEEKDAY' : 'WEEKEND'}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isPassed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/20 text-indigo-300'
                      }`}>
                        {isPassed ? 'ACTUAL' : 'FORECAST'}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {isOrderDay ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[9px]">
                          <i className="fas fa-check-circle mr-1"></i> ORDER DAY
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold text-white whitespace-nowrap">
                      Rp {row.appliedRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-bold text-amber-400 whitespace-nowrap">
                      Rp {row.appliedPurchases.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-300 whitespace-nowrap">
                      {row.dailyCostPercent.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right font-semibold text-slate-300 whitespace-nowrap">
                      Rp {row.cumRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-semibold text-amber-300 whitespace-nowrap">
                      Rp {row.cumPurchases.toLocaleString('id-ID')}
                    </td>
                    <td className={`p-3 text-right font-black whitespace-nowrap bg-slate-900/40 ${
                      row.cumCogsPercent > targetBudgetPercent + 3
                        ? 'text-rose-400'
                        : row.cumCogsPercent > targetBudgetPercent
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}>
                      {row.cumCogsPercent.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

  {cogsMainTab === 'ALOKASI_BUDGET' && (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER ALOKASI BUDGET */}
      <div className="glass-card p-6 bg-slate-900/90 border border-rose-500/20 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-sm font-black">
              <i className="fas fa-chart-pie"></i>
            </span>
            <h3 className="text-base font-black text-white uppercase tracking-wider">
              Alokasi Budget Belanja Pengadaan (MK, MS, Cash & Rekanan Supplier)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
              Terhubung ke COGS ({targetBudgetPercent.toFixed(1)}%)
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Rata-rata pengeluaran masing-masing kategori supplier & porsi alokasi terhadap Target Budget Belanja COGS ({INDO_MONTHS[selectedMonth]} {selectedYear} · {selectedOutlet || data?.outlet || ''})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setInputProcurementBudgetValue(customProcurementBudget > 0 ? String(customProcurementBudget) : String(procurementSummary.effectiveBudget));
              setIsEditingProcurementBudgetModal(true);
            }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
          >
            <i className="fas fa-bullseye text-rose-400"></i>
            <span>Basis: Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}</span>
            <span className="text-[10px] text-slate-400 font-normal">
              ({procurementBudgetBasis === 'COGS_TARGET' ? `Target COGS ${targetBudgetPercent}%` : procurementBudgetBasis === 'COGS_REMAINING' ? 'Sisa Budget' : procurementBudgetBasis === 'ACTUAL_SPEND' ? 'Realisasi' : 'Manual'})
            </span>
          </button>
          <button
            type="button"
            onClick={handleCopyAlokasiWhatsApp}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
          >
            <i className="fab fa-whatsapp"></i> Salin WA Alokasi
          </button>
          <button
            type="button"
            onClick={handleExportAlokasiExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Excel
          </button>
        </div>
      </div>

      {/* FILTER & PENGATURAN ALOKASI BELANJA PER DIVISI */}
      <div className="glass-card p-5 bg-slate-900/90 border border-white/10 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">
              <i className="fas fa-filter"></i>
            </span>
            <div>
              <span className="text-xs font-black text-white uppercase tracking-wider block">
                Filter & Atur Alokasi Belanja Supplier per Divisi:
              </span>
              <span className="text-[11px] text-slate-400">
                Pilih divisi untuk melihat atau menyesuaikan % alokasi supplier dari 100% sisa budget divisi
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAlokasiBudgetDivFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                alokasiBudgetDivFilter === 'ALL'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              Semua Divisi (Gabungan Outlet)
            </button>
            {calculationModel.divisionList.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setAlokasiBudgetDivFilter(d.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  alokasiBudgetDivFilter === d.id
                    ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                <span>{d.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({d.percent}%)</span>
              </button>
            ))}
          </div>
        </div>

        {/* JIKA MEMILIH DIVISI SPESIFIK */}
        {alokasiBudgetDivFilter !== 'ALL' && (() => {
          const divItem = calculationModel.divisionList.find(d => d.id === alokasiBudgetDivFilter) || calculationModel.divisionList[0];
          const divId = divItem.id;
          const share = divisionSupplierAllocations[divId] || getFallbackDivisionSupplierShare(divId);
          const totalDivBudget = divItem.totalSisaBudget;
          const totalAlloc = (share.supplier || 0) + (share.mainKitchen || 0) + (share.mainStore || 0) + (share.cash || 0);

          return (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-indigo-500/30 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                    divItem.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                    divItem.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                    divItem.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                    divItem.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    <i className={`fas ${divItem.icon}`}></i>
                  </span>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase tracking-wider">
                      Alokasi Belanja Divisi {divItem.name}
                    </h5>
                    <span className="text-[11px] text-slate-400">
                      100% Sisa Budget Divisi: <strong className="text-white font-mono">Rp {totalDivBudget.toLocaleString('id-ID')}</strong> ({divItem.percent}% Sisa Outlet)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                    Math.abs(totalAlloc - 100) < 0.01 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    Total: {totalAlloc.toFixed(1)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAutoBalanceDivSupplier(divId)}
                    className="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Auto 100%
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDivisionSupplierAllocations}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg cursor-pointer shadow"
                  >
                    <i className="fas fa-save mr-1"></i> Simpan
                  </button>
                </div>
              </div>

              {/* 4 Mini Channel Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Supplier */}
                <div className="p-3 rounded-xl bg-slate-900 border border-rose-500/30 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-rose-400 font-bold">Rekanan Supplier</span>
                    <span className="font-mono font-black text-white">{share.supplier}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={share.supplier || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(divId, 'supplier', parseFloat(e.target.value) || 0)}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-rose-500"
                  />
                  <div className="text-[11px] font-mono text-slate-300 flex justify-between">
                    <span>Nominal:</span>
                    <span className="font-bold text-white">Rp {Math.round(totalDivBudget * ((share.supplier || 0) / 100)).toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {/* MK */}
                <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-amber-400 font-bold">Main Kitchen (MK)</span>
                    <span className="font-mono font-black text-white">{share.mainKitchen}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={share.mainKitchen || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(divId, 'mainKitchen', parseFloat(e.target.value) || 0)}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="text-[11px] font-mono text-slate-300 flex justify-between">
                    <span>Nominal:</span>
                    <span className="font-bold text-white">Rp {Math.round(totalDivBudget * ((share.mainKitchen || 0) / 100)).toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {/* MS */}
                <div className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-indigo-400 font-bold">Main Store (MS)</span>
                    <span className="font-mono font-black text-white">{share.mainStore}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={share.mainStore || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(divId, 'mainStore', parseFloat(e.target.value) || 0)}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="text-[11px] font-mono text-slate-300 flex justify-between">
                    <span>Nominal:</span>
                    <span className="font-bold text-white">Rp {Math.round(totalDivBudget * ((share.mainStore || 0) / 100)).toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {/* Cash */}
                <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-emerald-400 font-bold">Cash Pasar</span>
                    <span className="font-mono font-black text-white">{share.cash}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={share.cash || 0}
                    onChange={(e) => handleUpdateDivSupplierChannel(divId, 'cash', parseFloat(e.target.value) || 0)}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="text-[11px] font-mono text-slate-300 flex justify-between">
                    <span>Nominal:</span>
                    <span className="font-bold text-white">Rp {Math.round(totalDivBudget * ((share.cash || 0) / 100)).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 4 MAJOR PROCUREMENT BUDGET KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL BUDGET BELANJA PENGADAAN (TERHUBUNG KE COGS) */}
        <div className="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/40 border border-rose-500/30 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                Target Budget Belanja COGS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                {targetBudgetPercent.toFixed(1)}% Sales
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-white">
              Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-300 mt-2">
              <span>Realisasi MTD:</span>
              <span className="font-mono font-bold text-rose-300">Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <span>Sisa Budget COGS:</span>
              <span className="font-mono font-bold text-emerald-400">Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}</span>
            </div>
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
                Total Rekanan Supplier (7 Mitra)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-black">
                {procurementSummary.supplierPercent.toFixed(1)}% Alokasi
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-rose-400">
              Rp {procurementSummary.totalSupplierSpend.toLocaleString('id-ID')}
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-300 mt-2">
              <span>Target Nominal COGS:</span>
              <span className="font-mono font-bold text-emerald-400">Rp {procurementSummary.supplierTargetNominal.toLocaleString('id-ID')}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              TGIF, Sukanda, Everest, Ikigai, Panfila, Saung Kubil, Kebunku
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
              <span>Porsi thd Belanja:</span>
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
              Rp {procurementSummary.mkSpend.toLocaleString('id-ID')}
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-300 mt-2">
              <span>Target Nominal COGS:</span>
              <span className="font-mono font-bold text-emerald-400">Rp {procurementSummary.mkTargetNominal.toLocaleString('id-ID')}</span>
            </div>
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
              <span>Frekuensi PO:</span>
              <span className="font-mono font-bold text-amber-400">{procurementSummary.mkCount} pesanan (Rp {Math.round(procurementSummary.mkAvgPerTx).toLocaleString('id-ID')}/PO)</span>
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
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-bold">Main Store (MS):</span>
                <span className="text-sm font-black font-mono text-indigo-400">
                  Rp {procurementSummary.msSpend.toLocaleString('id-ID')} <span className="text-[10px] text-slate-400">({procurementSummary.msPercent.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-bold">Cash Pasar:</span>
                <span className="text-sm font-black font-mono text-emerald-400">
                  Rp {procurementSummary.cashSpend.toLocaleString('id-ID')} <span className="text-[10px] text-slate-400">({procurementSummary.cashPercent.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-300">
              <span>Target MS dari COGS:</span>
              <span className="font-mono font-bold text-indigo-300">Rp {procurementSummary.msTargetNominal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Target Cash dari COGS:</span>
              <span className="font-mono font-bold text-emerald-300">Rp {procurementSummary.cashTargetNominal.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KALKULATOR & SIMULASI ALOKASI TARGET BUDGET PENGADAAN (TERHUBUNG KE COGS) */}
      <div className="glass-card p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/20 border border-rose-500/30 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-sm font-black">
                <i className="fas fa-calculator"></i>
              </span>
              <h4 className="text-base font-black text-white uppercase tracking-wider">
                Simulasi & Kalkulator Alokasi Target Budget Belanja COGS
              </h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Kalkulasi pembagian dana ke Rekanan Supplier (7 Mitra), MK, MS, dan Cash berdasarkan persentase rata-rata belanja aktual terhadap Target Budget COGS
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">Basis Budget:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => handleSaveProcurementBudget(customProcurementBudget, 'COGS_TARGET')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  procurementBudgetBasis === 'COGS_TARGET' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Target COGS ({targetBudgetPercent}%)
              </button>
              <button
                type="button"
                onClick={() => handleSaveProcurementBudget(customProcurementBudget, 'COGS_REMAINING')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  procurementBudgetBasis === 'COGS_REMAINING' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sisa COGS
              </button>
              <button
                type="button"
                onClick={() => handleSaveProcurementBudget(customProcurementBudget, 'ACTUAL_SPEND')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  procurementBudgetBasis === 'ACTUAL_SPEND' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Realisasi
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setInputProcurementBudgetValue(customProcurementBudget > 0 ? String(customProcurementBudget) : String(procurementSummary.effectiveBudget));
                setIsEditingProcurementBudgetModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-black text-xs transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fas fa-edit text-xs text-rose-400"></i>
              Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
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
                Rp {procurementSummary.supplierTargetNominal.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Rata2: <strong className="text-rose-300 font-mono">Rp {Math.round(procurementSummary.totalSupplierSpend / procurementSummary.recordedDaysCount).toLocaleString('id-ID')}/hari</strong>
              </p>
            </div>
            {/* Mini breakdown of 7 suppliers */}
            <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[10px]">
              {procurementSummary.supplierDetails.map(sup => (
                <div key={sup.key} className="flex justify-between items-center text-slate-300">
                  <span className="truncate pr-1">• {sup.label}:</span>
                  <span className="font-mono font-bold text-white flex-none">
                    Rp {sup.targetNominal.toLocaleString('id-ID')} <span className="text-rose-400">({sup.pctOfTotalBudget.toFixed(1)}%)</span>
                  </span>
                </div>
              ))}
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
                Rp {procurementSummary.mkTargetNominal.toLocaleString('id-ID')}
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
              <div className="flex justify-between">
                <span className="text-slate-400">Realisasi Spend:</span>
                <span className="font-mono font-bold text-white">Rp {procurementSummary.mkSpend.toLocaleString('id-ID')}</span>
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
                Rp {procurementSummary.msTargetNominal.toLocaleString('id-ID')}
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
              <div className="flex justify-between">
                <span className="text-slate-400">Realisasi Spend:</span>
                <span className="font-mono font-bold text-white">Rp {procurementSummary.msSpend.toLocaleString('id-ID')}</span>
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
                Rp {procurementSummary.cashTargetNominal.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Rata2: <strong className="text-emerald-300 font-mono">Rp {Math.round(procurementSummary.cashAvgPerDay).toLocaleString('id-ID')}/hari</strong>
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Frekuensi Trx:</span>
                <span className="font-mono">{procurementSummary.cashCount} transaksi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rata2/Trx:</span>
                <span className="font-mono font-bold text-emerald-300">Rp {Math.round(procurementSummary.cashAvgPerTx).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Realisasi Spend:</span>
                <span className="font-mono font-bold text-white">Rp {procurementSummary.cashSpend.toLocaleString('id-ID')}</span>
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
              <i className="fas fa-sliders-h text-rose-400"></i> Distribusi Persentase Alokasi Budget Belanja Pengadaan
            </h4>
            <p className="text-xs text-slate-400">
              Proporsi penyerapan dana terhadap Total Belanja Pengadaan (100%) terhubung ke Target Belanja COGS
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-300 bg-slate-950 px-3 py-1 rounded-xl border border-white/5">
            Total Realisasi: Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}
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
            return (
              <div
                key={sup.key}
                style={{ width: `${sup.pctOfTotalBudget}%` }}
                className={`h-full ${sup.color} hover:brightness-110 transition-all rounded-lg flex items-center justify-center text-[10px] font-black text-white truncate px-1`}
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
          {procurementSummary.supplierDetails.map(sup => (
            <div key={sup.key} className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-white/5">
              <span className={`w-3 h-3 rounded-full ${sup.colorDot} flex-none`}></span>
              <div className="truncate">
                <span className="text-slate-400 block truncate">{sup.label}</span>
                <span className="font-bold text-white font-mono">{sup.pctOfTotalBudget.toFixed(1)}%</span>
              </div>
            </div>
          ))}
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
              Rata-rata belanja harian, rata-rata per transaksi / PO, persentase alokasi, serta nominal pembagian target budget COGS
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-bold bg-slate-950 px-3 py-1.5 rounded-xl border border-white/5">
              Basis: {procurementSummary.recordedDaysCount} Hari Pencatatan
            </span>
            <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
              Target COGS: Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
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
                <th className="py-3.5 px-4 text-right font-black text-emerald-400">Nominal Target COGS (Rp)</th>
                <th className="py-3.5 px-4 w-28 text-center">Distribusi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {/* 7 SUPPLIERS */}
              {(alokasiCategoryFilter === 'ALL' || alokasiCategoryFilter === 'SUPPLIERS') &&
                procurementSummary.supplierDetails
                  .filter(sup => !alokasiSearch.trim() || sup.label.toLowerCase().includes(alokasiSearch.toLowerCase()))
                  .map((sup, idx) => (
                    <tr key={sup.key} className="hover:bg-rose-500/5 transition-colors">
                      <td className="py-3 px-4 text-center text-slate-500 font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 font-sans font-bold text-white flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${sup.colorDot} flex-none`}></span>
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
                        Rp {sup.targetNominal.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${sup.color} rounded-full`}
                            style={{ width: `${Math.min(100, sup.pctOfTotalBudget * 2.5)}%` }}
                          ></div>
                        </div>
                      </td>
                    </tr>
                  ))}

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
                    Rp {procurementSummary.supplierTargetNominal.toLocaleString('id-ID')}
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
                      Rp {procurementSummary.mkTargetNominal.toLocaleString('id-ID')}
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
                      Rp {procurementSummary.msTargetNominal.toLocaleString('id-ID')}
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
                    <td className="py-3 px-4 text-center text-slate-300">{procurementSummary.cashCount} Trx</td>
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
                      Rp {procurementSummary.cashTargetNominal.toLocaleString('id-ID')}
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
              <tr className="bg-slate-900/90 font-sans font-black border-t-2 border-white/20 text-white">
                <td className="py-4 px-4 text-center text-rose-400 font-black">TOTAL</td>
                <td className="py-4 px-4 uppercase tracking-wider text-rose-300">
                  Grand Total Belanja Pengadaan
                </td>
                <td className="py-4 px-4 text-right font-mono text-base text-white">
                  Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4 text-center font-mono text-slate-300">
                  {procurementSummary.totalTxAll} entri
                </td>
                <td className="py-4 px-4 text-right font-mono text-rose-300">
                  Rp {Math.round(procurementSummary.totalAvgPerDay).toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4 text-right font-mono text-slate-300">
                  Rp {Math.round(procurementSummary.totalAvgPerTx).toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4 text-center text-slate-500 font-sans italic">-</td>
                <td className="py-4 px-4 text-center font-mono text-emerald-400 text-sm">
                  100.0%
                </td>
                <td className="py-4 px-4 text-right font-mono text-base text-emerald-400">
                  Rp {procurementSummary.effectiveBudget.toLocaleString('id-ID')}
                </td>
                <td className="py-4 px-4">
                  <div className="w-full h-2 bg-emerald-500 rounded-full"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

  {/* MODAL: EDIT CUSTOM TARGET BUDGET ALOKASI BELANJA */}
  <AnimatePresence>
    {isEditingProcurementBudgetModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass-card p-6 md:p-8 max-w-lg w-full bg-slate-900 border border-white/20 rounded-3xl shadow-2xl space-y-6"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-black">
                <i className="fas fa-bullseye text-lg"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  Basis Target Budget Alokasi Belanja
                </h3>
                <p className="text-xs text-slate-400">Pilih atau kustomisasi acuan anggaran belanja pengadaan</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingProcurementBudgetModal(false)}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300 block">Pilih Acuan Anggaran:</label>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  handleSaveProcurementBudget(customProcurementBudget, 'COGS_TARGET');
                  setIsEditingProcurementBudgetModal(false);
                }}
                className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex justify-between items-center ${
                  procurementBudgetBasis === 'COGS_TARGET'
                    ? 'bg-rose-950/40 border-rose-500 text-white'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">Target Budget COGS ({targetBudgetPercent.toFixed(1)}%)</div>
                  <div className="text-[11px] text-slate-400">Berdasarkan Proyeksi Sales Bulan Ini</div>
                </div>
                <span className="font-mono font-black text-sm text-emerald-400">
                  Rp {calculationModel.totalTargetBudgetBelanja.toLocaleString('id-ID')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSaveProcurementBudget(customProcurementBudget, 'COGS_REMAINING');
                  setIsEditingProcurementBudgetModal(false);
                }}
                className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex justify-between items-center ${
                  procurementBudgetBasis === 'COGS_REMAINING'
                    ? 'bg-rose-950/40 border-rose-500 text-white'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">Sisa Budget Belanja COGS</div>
                  <div className="text-[11px] text-slate-400">Target Belanja dikurangi Realisasi MTD</div>
                </div>
                <span className="font-mono font-black text-sm text-emerald-400">
                  Rp {calculationModel.sisaBudgetBelanja.toLocaleString('id-ID')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSaveProcurementBudget(customProcurementBudget, 'ACTUAL_SPEND');
                  setIsEditingProcurementBudgetModal(false);
                }}
                className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex justify-between items-center ${
                  procurementBudgetBasis === 'ACTUAL_SPEND'
                    ? 'bg-rose-950/40 border-rose-500 text-white'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">Realisasi Belanja MTD (Aktual)</div>
                  <div className="text-[11px] text-slate-400">Total belanja yang telah dibukukan saat ini</div>
                </div>
                <span className="font-mono font-black text-sm text-rose-300">
                  Rp {procurementSummary.totalProcurementSpend.toLocaleString('id-ID')}
                </span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/10">
              <label className="text-xs font-bold text-slate-300 block mb-1.5">Atau Masukkan Target Manual (Rp):</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Contoh: 100000000"
                  value={inputProcurementBudgetValue}
                  onChange={(e) => setInputProcurementBudgetValue(e.target.value)}
                  className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(inputProcurementBudgetValue) || 0;
                    handleSaveProcurementBudget(val, 'CUSTOM');
                    setIsEditingProcurementBudgetModal(false);
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

      {/* MODAL: SETTING PARAMETER */}
      <AnimatePresence>
        {isConfigOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-900 border border-white/20 rounded-3xl shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black">
                    <i className="fas fa-sliders-h text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">
                      Setting Parameter COGS & Forecast
                    </h3>
                    <p className="text-xs text-slate-400">Sesuaikan target persentase, estimasi sales, dan pembagian divisi</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. Cutoff Day */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2">
                  <label className="font-bold text-white uppercase text-[11px] block">
                    Cut-off Hari Aktual (Hari Ini / Terakhir Tercatat):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={daysInMonth}
                      value={cutoffDay}
                      onChange={(e) => setCutoffDay(parseInt(e.target.value, 10) || 1)}
                      className="w-24 bg-slate-900 text-white font-bold text-base px-3 py-2 rounded-xl border border-white/10"
                    />
                    <span className="text-slate-400">
                      Tgl 1 s/d {cutoffDay} dihitung sebagai actual, sisa {daysInMonth - cutoffDay} hari dihitung forecast.
                    </span>
                  </div>
                </div>

                {/* 2. Target Budget Belanja % */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2">
                  <label className="font-bold text-white uppercase text-[11px] block">
                    Target Set Budget Belanja (%):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      value={targetBudgetPercent}
                      onChange={(e) => setTargetBudgetPercent(parseFloat(e.target.value) || 0)}
                      className="w-24 bg-slate-900 text-emerald-400 font-bold text-base px-3 py-2 rounded-xl border border-white/10"
                    />
                    <span className="text-slate-400">Contoh: 43.00% dari Total Projected Revenue</span>
                  </div>
                </div>

                {/* 3. Akumulasi Rata-rata Sales MTD (Otomatis dari Daily Revenue) */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-white uppercase text-[11px] flex items-center gap-2">
                      <i className="fas fa-magic text-indigo-400"></i>
                      Rata-rata Sales Weekday & Weekend (Otomatis MTD Daily Revenue):
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-black">
                      AUTO SYNC
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Nilai rata-rata dihitung otomatis dari akumulasi Daily Revenue yang diinput di modul Sales (Tgl 1 s/d Cut-off). Tidak perlu diinput manual.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-900 border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Rata" Weekday (Senin - Jumat):</span>
                        <span className="text-[10px] text-slate-500">{calculationModel.pastWeekdayRecordedCount} hari tercatat</span>
                      </div>
                      <div className="text-base font-black text-indigo-400">
                        Rp {calculationModel.avgWeekdaySales.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Total MTD: Rp {calculationModel.pastWeekdayRevSum.toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Rata" Weekend (Sabtu - Minggu):</span>
                        <span className="text-[10px] text-slate-500">{calculationModel.pastWeekendRecordedCount} hari tercatat</span>
                      </div>
                      <div className="text-base font-black text-amber-400">
                        Rp {calculationModel.avgWeekendSales.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Total MTD: Rp {calculationModel.pastWeekendRevSum.toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Pembagian Divisi */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-white uppercase text-[11px] block">
                      Pembagian Jatah Belanja per Divisi (%):
                    </label>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      Math.abs(totalAllocatedPercent - 100) < 0.01
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      Total: {totalAllocatedPercent.toFixed(1)}% {Math.abs(totalAllocatedPercent - 100) < 0.01 ? '✓' : `(Sisa: ${(100 - totalAllocatedPercent).toFixed(1)}%)`}
                    </span>
                  </div>

                  {/* Presets in modal */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-slate-500 font-bold">Preset:</span>
                    {[
                      { key: 'standard', label: '70/20/10' },
                      { key: 'kitchen_heavy', label: '75/15/10' },
                      { key: 'food_bar', label: '55/35/10' },
                      { key: 'equal', label: '34/33/33' }
                    ].map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => handleApplyDivisionPreset(p.key)}
                        className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                    {Math.abs(totalAllocatedPercent - 100) >= 0.01 && (
                      <button
                        type="button"
                        onClick={handleAutoBalanceDivisions}
                        className="px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-bold cursor-pointer"
                      >
                        Auto 100%
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {calculationModel.divisionList.map((div) => {
                      const textCol = div.color === 'blue'
                        ? 'text-blue-400'
                        : div.color === 'amber'
                        ? 'text-amber-400'
                        : div.color === 'purple'
                        ? 'text-purple-400'
                        : div.color === 'emerald'
                        ? 'text-emerald-400'
                        : 'text-cyan-400';

                      return (
                        <div key={div.id} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-300 font-bold">{div.name}:</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Rp {div.totalSisaBudget.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={div.percent}
                              onChange={(e) => handleUpdateDivisionPercent(div.id, parseFloat(e.target.value) || 0)}
                              className={`w-full bg-slate-950 ${textCol} font-bold px-2 py-1.5 rounded-lg border border-white/10 text-sm`}
                            />
                            <span className={`${textCol} font-black text-xs`}>%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Max Closing Inventory % */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-white uppercase text-[11px] block">
                      Batas Maksimal Estimasi Closing Inventory (%):
                    </label>
                    <span className="text-[11px] text-slate-300 font-bold">
                      Aktual: <span className="text-rose-400 font-black">{calculationModel.closingInventoryPercent.toFixed(2)}%</span> (÷ MTD Rev)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      value={maxClosingInvPercent}
                      onChange={(e) => setMaxClosingInvPercent(parseFloat(e.target.value) || 0)}
                      className="w-24 bg-slate-900 text-white font-bold text-base px-3 py-2 rounded-xl border border-white/10"
                    />
                    <span className="text-slate-400 text-xs">Default: Max 11.00% dari Total Projected Revenue</span>
                  </div>
                </div>

                {/* 6. MTD Actual Belanja Setting (Receiving Sheet Sync / Manual Override) */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-bold text-white uppercase text-[11px] block">
                        Sumber Data MTD Actual Belanja:
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Default: Otomatis dihitung dari Total Cost di Receiving Sheet (Tgl 1 - {cutoffDay})
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-xl border border-white/10">
                      <input
                        type="checkbox"
                        checked={useManualMtdBelanja}
                        onChange={(e) => setUseManualMtdBelanja(e.target.checked)}
                        className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-400"
                      />
                      <span className="text-xs font-bold text-white">Manual Override</span>
                    </label>
                  </div>

                  {useManualMtdBelanja ? (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <span className="text-slate-400 block text-[11px]">Nilai Manual MTD Belanja (Rp):</span>
                      <input
                        type="number"
                        placeholder="Contoh: 340928547"
                        value={manualMtdBelanja}
                        onChange={(e) => setManualMtdBelanja(e.target.value)}
                        className="w-full bg-slate-900 text-indigo-300 font-bold px-3 py-2 rounded-xl border border-indigo-500/40"
                      />
                      <p className="text-[10px] text-slate-500">
                        Nilai ini akan menggantikan total cost receiving sheet untuk simulasi/preset.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/20 flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Total Cost Otomatis dari Receiving Sheet:</span>
                      <span className="text-emerald-400 font-black">
                        Rp {calculationModel.receivingSheetBelanjaMTD.toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>

                {/* 7. Jadwal Hari Order Belanja per Minggu */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-emerald-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="font-bold text-white uppercase text-[11px] flex items-center gap-2">
                        <i className="fas fa-calendar-alt text-emerald-400"></i>
                        Jadwal Hari Order Belanja ({selectedOutlet || 'Semua Outlet'}):
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Area: <span className="text-emerald-300 font-bold">{outletOrderSchedule.areaName}</span> • Standar: <span className="text-amber-300 font-bold">{outletOrderSchedule.label}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderDays(outletOrderSchedule.dayIndices)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider transition-all self-start sm:self-auto"
                    >
                      <i className="fas fa-undo-alt mr-1"></i>
                      Gunakan Jadwal Area ({outletOrderSchedule.label})
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 pt-1">
                    {[
                      { index: 1, name: 'Sen', full: 'Senin' },
                      { index: 2, name: 'Sel', full: 'Selasa' },
                      { index: 3, name: 'Rab', full: 'Rabu' },
                      { index: 4, name: 'Kam', full: 'Kamis' },
                      { index: 5, name: 'Jum', full: 'Jumat' },
                      { index: 6, name: 'Sab', full: 'Sabtu' },
                      { index: 0, name: 'Min', full: 'Minggu' }
                    ].map(d => {
                      const isSelected = selectedOrderDays.includes(d.index);
                      const isDefaultArea = outletOrderSchedule.dayIndices.includes(d.index);
                      return (
                        <button
                          key={d.index}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedOrderDays(prev => prev.filter(x => x !== d.index));
                            } else {
                              setSelectedOrderDays(prev => [...prev, d.index].sort((a, b) => a - b));
                            }
                          }}
                          className={`p-2 rounded-xl text-center border transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950 font-black'
                              : 'bg-slate-900 text-slate-400 border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="text-xs">{d.name}</div>
                          {isDefaultArea && (
                            <div className="text-[8px] text-amber-300/90 font-bold uppercase mt-0.5">AREA</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
                    <span>Hari Terpilih: <span className="text-emerald-300 font-bold">{orderDaysLabel}</span></span>
                    <span>{selectedOrderDays.length} Hari / Minggu</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveConfig}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 active:scale-95"
                >
                  Simpan Perubahan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: RINCIAN TOTAL COST RECEIVING SHEET PER SUPPLIER */}
      <AnimatePresence>
        {isSupplierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 md:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-900 border border-indigo-500/30 rounded-3xl shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black">
                    <i className="fas fa-receipt text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">
                      Rincian MTD Belanja Dari Receiving Sheet
                    </h3>
                    <p className="text-xs text-slate-400">
                      Total Cost per Supplier dari Tanggal 1 s/d {cutoffDay} {INDO_MONTHS[selectedMonth]} {selectedYear}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Total Summary Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 border border-indigo-500/40 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">
                    TOTAL COST MTD (RECEIVING SHEET)
                  </span>
                  <span className="text-2xl font-black text-white">
                    Rp {calculationModel.receivingSheetBelanjaMTD.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Periode Cut-Off:</span>
                  <span className="text-xs text-emerald-400 font-bold">1 - {cutoffDay} {INDO_MONTHS[selectedMonth]}</span>
                </div>
              </div>

              {/* 10 Suppliers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {SUPPLIERS_CONFIG.map(sup => {
                  const nominal = calculationModel.supplierMtdTotals[sup.id] || 0;
                  const pct = calculationModel.receivingSheetBelanjaMTD > 0
                    ? (nominal / calculationModel.receivingSheetBelanjaMTD) * 100
                    : 0;

                  return (
                    <div
                      key={sup.id}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1 relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-300 truncate">{sup.label}</span>
                        <span className="text-[10px] text-slate-500">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="text-sm font-black text-white">
                        Rp {nominal.toLocaleString('id-ID')}
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: sup.color }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
                <i className="fas fa-info-circle text-indigo-400"></i>
                <span>
                  Data di atas disinkronkan secara realtime dari ledgers supplier dan belanja harian modul <strong>Receiving Sheet</strong>.
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all"
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

export default CogsModule;
