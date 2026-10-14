import React, { useState, useMemo } from 'react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { AppState, LogisticItem, DailyLogisticRecord, PeminjamanRecord } from '../types';
import { getOrderScheduleForOutlet } from '../constants';

// Helper functions for Cut-off (Tanggal 1 - Akhir Bulan)
export interface PeriodInfo {
  key: string; // "YYYY-MM"
  name: string; // "JULI 2026"
  startDateStr: string; // "YYYY-MM-01"
  endDateStr: string; // "YYYY-MM-31" (or 30/28/29)
}

export function getPeriodForDate(dateStr: string): PeriodInfo {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  const pad = (num: number) => String(num).padStart(2, '0');
  const startDateStr = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${pad(month)}-${pad(lastDay)}`;

  const monthNames = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ];
  const name = `${monthNames[month - 1]} ${year}`;
  const key = `${year}-${pad(month)}`;

  return { key, name, startDateStr, endDateStr };
}

export function getPeriodInfoFromKey(periodKey: string): PeriodInfo {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const pad = (num: number) => String(num).padStart(2, '0');
  const startDateStr = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${pad(month)}-${pad(lastDay)}`;

  const monthNames = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ];
  const name = `${monthNames[month - 1]} ${year}`;

  return { key: periodKey, name, startDateStr, endDateStr };
}

export function getPreviousPeriodKey(periodKey: string): string {
  const [yearStr, monthStr] = periodKey.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${year}-${pad(month)}`;
}

export function getNextPeriodKey(periodKey: string): string {
  const [yearStr, monthStr] = periodKey.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${year}-${pad(month)}`;
}

export function getPeriodForMonthAndYear(monthIdxStr?: string, yearStr?: string, fallbackDateStr?: string): PeriodInfo {
  if (monthIdxStr !== undefined && monthIdxStr !== null && monthIdxStr !== '') {
    const monthNum = parseInt(monthIdxStr, 10) + 1;
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    const pad = (num: number) => String(num).padStart(2, '0');
    const key = `${year}-${pad(monthNum)}`;
    return getPeriodInfoFromKey(key);
  }
  return getPeriodForDate(fallbackDateStr || new Date().toISOString().split('T')[0]);
}

interface LogisticsModuleProps {
  data: AppState;
  onUpdate: (updates: Partial<AppState>, isPriority?: boolean) => void;
  selectedDate: string;
  selectedOutlet?: string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  filterMonth?: string;
  filterYear?: string;
}

export const LogisticsModule: React.FC<LogisticsModuleProps> = ({
  data,
  onUpdate,
  selectedDate,
  selectedOutlet,
  showToast,
  filterMonth,
  filterYear
}) => {
  const [activeTab, setActiveTab] = useState<'REKAPAN' | 'PEMINJAMAN' | 'HARGA' | 'LOGS'>('REKAPAN');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [showStockOpnameModal, setShowStockOpnameModal] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetType, setResetType] = useState<'INPUT_ONLY' | 'ALL'>('INPUT_ONLY');

  const handleResetLogistics = () => {
    if (resetType === 'ALL') {
      onUpdate({
        logisticItems: [],
        dailyLogisticRecords: {},
        peminjamanRecords: [],
        logisticBeginningStocks: {},
        logisticPeriodPrices: {}
      }, true);
    } else {
      onUpdate({
        dailyLogisticRecords: {},
        peminjamanRecords: [],
        logisticBeginningStocks: {},
        logisticPeriodPrices: {}
      }, true);
    }
    setShowResetConfirmModal(false);
    showToast(
      resetType === 'ALL'
        ? 'Seluruh data logistik beserta master daftar barang berhasil di-reset!'
        : 'Data input harian logistik, stok awal, harga, dan peminjaman berhasil di-reset! (Daftar barang tetap aman)',
      'success'
    );
  };

  // Dialog States for editing and deleting items safely (avoiding browser confirm/prompt in iframe)
  const [editingItem, setEditingItem] = useState<{ id: string; description: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; description: string } | null>(null);
  const [updatingPriceItem, setUpdatingPriceItem] = useState<{ id: string; description: string; price: number } | null>(null);
  const [updatingBeginStockItem, setUpdatingBeginStockItem] = useState<{ id: string; description: string; beginStock: number } | null>(null);
  const [partialReturnLoan, setPartialReturnLoan] = useState<{ id: string; borrower: string; itemDesc: string; maxQty: number; returnQtyInput: string } | null>(null);

  // Fallbacks for data structures and filter out old/uninputted default items permanently
  const items = useMemo(() => {
    const rawItems = data.logisticItems || [];
    return rawItems.filter(item => {
      if (!item) return false;
      const desc = (item.description || '').toLowerCase();
      const id = String(item.id);
      if (id === 'item_1' || id === 'item_2' || id === 'item_3' || id === 'item_4' || id === 'item_5') {
        return false;
      }
      if (desc === 'piring makan sh' || desc === 'gelas minum kaca' || desc === 'sendok stainless' || desc === 'garpu stainless' || desc === 'nampan saji kayu') {
        return false;
      }
      return true;
    });
  }, [data.logisticItems]);
  const dailyRecords = data.dailyLogisticRecords || {};
  const loans = data.peminjamanRecords || [];

  // Add Item Handler
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      showToast('Nama barang tidak boleh kosong', 'error');
      return;
    }

    const priceNum = parseFloat(newItemPrice) || 0;

    const newItem: LogisticItem = {
      id: `item_${Date.now()}`,
      description: newItemName.trim(),
      createdAt: selectedDate,
      price: priceNum
    };

    const updatedItems = [...items, newItem];
    onUpdate({ logisticItems: updatedItems }, true);
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItemModal(false);
    showToast('Item baru berhasil ditambahkan', 'success');
  };

  // Delete master item (triggers custom confirm modal)
  const handleDeleteItem = (itemId: string, description: string) => {
    setDeletingItem({ id: itemId, description });
  };

  // Handle inline updating of Item Description (triggers custom edit description modal)
  const handleUpdateDescription = (itemId: string, currentVal: string) => {
    setEditingItem({ id: itemId, description: currentVal });
  };

  // Helper to resolve price of an item for a target period
  const getItemPriceForPeriod = (itemId: string, targetPeriodKey: string): number => {
    const periodPrices = data.logisticPeriodPrices || {};
    // 1. Direct match
    if (periodPrices[targetPeriodKey]?.[itemId] !== undefined) {
      return periodPrices[targetPeriodKey][itemId];
    }
    
    // 2. Scan backwards chronologically to find the latest set price
    const masterItem = items.find(i => i.id === itemId);
    const defaultPrice = masterItem?.price || 0;
    
    const sortedKeys = Object.keys(periodPrices).sort();
    const pastKeys = sortedKeys.filter(k => k < targetPeriodKey);
    if (pastKeys.length > 0) {
      for (let i = pastKeys.length - 1; i >= 0; i--) {
        const val = periodPrices[pastKeys[i]]?.[itemId];
        if (val !== undefined) {
          return val;
        }
      }
    }
    
    return defaultPrice;
  };

  // Helper to get active borrowed count for an item
  const getBorrowedCount = (itemId: string): number => {
    return loans
      .filter(l => l.itemId === itemId && l.status === 'BORROWED')
      .reduce((sum, l) => sum + (l.qty - (l.returnQty || 0)), 0);
  };

  // Find current period based on filterMonth, filterYear, or selectedDate
  const currentPeriod = useMemo(() => {
    return getPeriodForMonthAndYear(filterMonth, filterYear, selectedDate);
  }, [filterMonth, filterYear, selectedDate]);

  // Handle inline updating of Beginning Stock (Stok Awal) for current period (triggers custom modal)
  const handleUpdateBeginningStock = (itemId: string, currentVal: number) => {
    const matchedItem = items.find(i => i.id === itemId);
    setUpdatingBeginStockItem({
      id: itemId,
      description: matchedItem?.description || 'Item',
      beginStock: currentVal
    });
  };

  // Handle inline updating of Item Price - ONLY FOR CURRENT PERIOD (triggers custom modal)
  const handleUpdatePrice = (itemId: string, description: string, currentVal: number) => {
    setUpdatingPriceItem({
      id: itemId,
      description,
      price: currentVal
    });
  };

  // Calculate stats for items using chronologically cascaded periods (Cut-off 26 - 25)
  const itemsStats = useMemo(() => {
    const beginningStocks = data.logisticBeginningStocks || {};

    // Gather all unique periods up to the currentPeriod
    const periodsSet = new Set<string>();
    periodsSet.add(currentPeriod.key);
    periodsSet.add(getPreviousPeriodKey(currentPeriod.key));

    Object.keys(beginningStocks).forEach(pKey => periodsSet.add(pKey));

    Object.keys(dailyRecords).forEach(dateStr => {
      try {
        const p = getPeriodForDate(dateStr);
        periodsSet.add(p.key);
      } catch (e) {
        // ignore
      }
    });

    const rawSorted = Array.from(periodsSet).sort();
    const sortedPeriods: string[] = [];
    if (rawSorted.length > 0) {
      let curr = rawSorted[0];
      const targetEnd = currentPeriod.key;
      while (curr <= targetEnd) {
        sortedPeriods.push(curr);
        if (curr === targetEnd) break;
        curr = getNextPeriodKey(curr);
      }
    }

    // Cascading results: periodKey -> itemId -> stats
    const resultsByPeriod: Record<string, Record<string, {
      beginStock: number;
      totalLnb: number;
      totalPenggantian: number;
      latestLayak: number;
      latestTidakLayak: number;
      hasRecord: boolean;
      bookStock: number;
      endingStock: number;
    }>> = {};

    sortedPeriods.forEach((periodKey, idx) => {
      const periodInfo = getPeriodInfoFromKey(periodKey);
      const prevPeriodKey = getPreviousPeriodKey(periodKey);
      
      resultsByPeriod[periodKey] = {};

      items.forEach(item => {
        // 1. Get Beginning Stock
        let beginStock = 0;
        const explicitStock = beginningStocks[periodKey]?.[item.id];
        if (explicitStock !== undefined && explicitStock > 0) {
          beginStock = explicitStock;
        } else if (idx > 0) {
          const prevStats = resultsByPeriod[prevPeriodKey]?.[item.id];
          if (prevStats) {
            beginStock = (prevStats.hasRecord && prevStats.latestLayak > 0) ? prevStats.latestLayak : prevStats.endingStock;
          }
          if (beginStock === 0 && explicitStock !== undefined) {
            beginStock = explicitStock;
          }
        } else if (explicitStock !== undefined) {
          beginStock = explicitStock;
        }

        // 2. Gather daily records in this period
        let totalLnb = 0;
        let totalPenggantian = 0;
        let latestLayak = 0;
        let latestTidakLayak = 0;
        let hasRecord = false;
        let latestDate = '';

        Object.entries(dailyRecords).forEach(([dateStr, itemMap]) => {
          if (dateStr >= periodInfo.startDateStr && dateStr <= periodInfo.endDateStr) {
            const rec = itemMap[item.id];
            if (rec) {
              totalLnb += rec.lnb || 0;
              totalPenggantian += rec.penggantian || 0;
              if (dateStr >= latestDate) {
                latestDate = dateStr;
                latestLayak = rec.layak;
                latestTidakLayak = rec.tidakLayak;
                hasRecord = true;
              }
            }
          }
        });

        const bookStock = beginStock + totalPenggantian - totalLnb;
        
        // Ending stock (Total Barang Tersedia / Stock Opname result)
        // If physical opname record exists on cutoff/daily, use latestLayak, otherwise fallback to bookStock
        const endingStock = (hasRecord && latestLayak > 0) ? latestLayak : bookStock;

        resultsByPeriod[periodKey][item.id] = {
          beginStock,
          totalLnb,
          totalPenggantian,
          latestLayak,
          latestTidakLayak,
          hasRecord,
          bookStock,
          endingStock
        };
      });
    });

    // Now extract current period stats for all items
    return items.map(item => {
      const periodStats = resultsByPeriod[currentPeriod.key]?.[item.id] || {
        beginStock: 0,
        totalLnb: 0,
        totalPenggantian: 0,
        latestLayak: 0,
        latestTidakLayak: 0,
        hasRecord: false,
        bookStock: 0,
        endingStock: 0
      };

      const dipinjam = getBorrowedCount(item.id);
      const actualStock = periodStats.endingStock - periodStats.latestTidakLayak - dipinjam;

      const price = getItemPriceForPeriod(item.id, currentPeriod.key);

      return {
        ...item,
        price,
        beginStock: periodStats.beginStock,
        layak: periodStats.latestLayak,
        tidakLayak: periodStats.latestTidakLayak,
        lnb: periodStats.totalLnb,
        penggantian: periodStats.totalPenggantian,
        dipinjam,
        bookStock: periodStats.bookStock,
        totalStock: periodStats.endingStock, // This is endingStock (Total Barang Tersedia)
        actualStock,
        hasRecord: periodStats.hasRecord,
        totalValue: periodStats.endingStock * price
      };
    });
  }, [items, dailyRecords, loans, currentPeriod, data.logisticBeginningStocks, data.logisticPeriodPrices]);

  // Compute L&B Lost & Broken summary and total loss cost
  const lnbStats = useMemo(() => {
    const lnbItems = itemsStats.filter(item => item.lnb > 0);
    const totalLnbLoss = lnbItems.reduce((sum, item) => sum + (item.lnb * item.price), 0);
    return { lnbItems, totalLnbLoss };
  }, [itemsStats]);

  // Compute price change history with difference (selisih) per period
  const priceChangesHistory = useMemo(() => {
    const periodPrices = data.logisticPeriodPrices || {};
    
    // Gather all unique period keys that have at least one custom price set, plus currentPeriod
    const allPeriodKeys = new Set<string>();
    Object.keys(periodPrices).forEach(k => allPeriodKeys.add(k));
    allPeriodKeys.add(currentPeriod.key);
    
    const sortedPeriods = Array.from(allPeriodKeys).sort();
    
    const historyList: {
      periodKey: string;
      periodName: string;
      changes: {
        itemId: string;
        itemName: string;
        oldPrice: number;
        newPrice: number;
        difference: number;
      }[];
    }[] = [];
    
    sortedPeriods.forEach(periodKey => {
      const periodInfo = getPeriodInfoFromKey(periodKey);
      const prevKey = getPreviousPeriodKey(periodKey);
      
      const changesForPeriod: {
        itemId: string;
        itemName: string;
        oldPrice: number;
        newPrice: number;
        difference: number;
      }[] = [];
      
      items.forEach(item => {
        const currentPrice = getItemPriceForPeriod(item.id, periodKey);
        const previousPrice = getItemPriceForPeriod(item.id, prevKey);
        
        // If they are different, or if there is a specific custom price recorded for this period
        const hasSpecificOverride = periodPrices[periodKey]?.[item.id] !== undefined;
        if (hasSpecificOverride || currentPrice !== previousPrice) {
          changesForPeriod.push({
            itemId: item.id,
            itemName: item.description,
            oldPrice: previousPrice,
            newPrice: currentPrice,
            difference: currentPrice - previousPrice
          });
        }
      });
      
      if (changesForPeriod.length > 0) {
        historyList.push({
          periodKey,
          periodName: periodInfo.name,
          changes: changesForPeriod
        });
      }
    });
    
    // Newest periods first
    return historyList.reverse();
  }, [items, data.logisticPeriodPrices, currentPeriod]);

  // Handle Quick return directly from active loans tab
  const handleQuickReturn = (loanId: string, qtyToReturn: number) => {
    const updatedLoans = loans.map(l => {
      if (l.id === loanId) {
        const newReturnQty = (l.returnQty || 0) + qtyToReturn;
        const status = newReturnQty >= l.qty ? 'RETURNED' : 'BORROWED';
        return {
          ...l,
          returnQty: newReturnQty,
          status,
          returnDate: selectedDate
        } as PeminjamanRecord;
      }
      return l;
    });

    onUpdate({ peminjamanRecords: updatedLoans }, true);
    showToast('Pengembalian barang berhasil dicatat', 'success');
  };

  // Handle submit for custom partial return modal
  const handlePartialReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialReturnLoan) return;

    const num = parseInt(partialReturnLoan.returnQtyInput, 10);
    if (isNaN(num) || num <= 0 || num > partialReturnLoan.maxQty) {
      showToast(`Jumlah input tidak valid. Harus antara 1 dan ${partialReturnLoan.maxQty}`, 'error');
      return;
    }

    handleQuickReturn(partialReturnLoan.id, num);
    setPartialReturnLoan(null);
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-white/5 shadow-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-white uppercase italic">
            REKAPAN INVENTORY LOGISTIK
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Outlet: <span className="text-amber-400 font-black">{selectedOutlet || 'SEMUA OUTLET'}</span> | Tanggal: <span className="text-indigo-400 font-black">{selectedDate}</span>
            </p>
            {selectedOutlet && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 font-mono text-[9px] font-black uppercase">
                Hari Order: {getOrderScheduleForOutlet(selectedOutlet).label}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowAddItemModal(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-indigo-400/20"
          >
            <i className="fas fa-plus"></i>
            Tambah Item Baru
          </button>
          <button
            onClick={() => setShowStockOpnameModal(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-emerald-400/20 shadow-lg shadow-emerald-950/25"
          >
            <i className="fas fa-clipboard-check"></i>
            Input Stock Opname
          </button>
          <button
            onClick={() => setShowInputModal(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-orange-400/20 shadow-lg shadow-orange-950/25"
          >
            <i className="fas fa-edit"></i>
            Input Harian
          </button>
          <button
            onClick={() => {
              setResetType('INPUT_ONLY');
              setShowResetConfirmModal(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-200 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-red-500/30 shadow-lg"
          >
            <i className="fas fa-trash-alt"></i>
            Reset Data Logistik
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 gap-2">
        <button
          onClick={() => setActiveTab('REKAPAN')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'REKAPAN'
              ? 'border-amber-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-boxes mr-2"></i> Rekapan Stock
        </button>
        <button
          onClick={() => setActiveTab('PEMINJAMAN')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all relative ${
            activeTab === 'PEMINJAMAN'
              ? 'border-amber-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-hand-holding-usd mr-2"></i> Peminjaman Aktif
          {loans.filter(l => l.status === 'BORROWED').length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {loans.filter(l => l.status === 'BORROWED').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('HARGA')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'HARGA'
              ? 'border-amber-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-tags mr-2"></i> Perubahan Harga
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'LOGS'
              ? 'border-amber-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-history mr-2"></i> History Log Harian
        </button>
      </div>

      {/* Tab Contents */}
      <div className="animate-fade-in">
        {activeTab === 'REKAPAN' && (
          <div className="space-y-6">
            {/* Summary Information Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Summary Card for Total Stock Value */}
              <div className="glass-card p-6 rounded-2xl border border-white/10 bg-slate-900/40 relative overflow-hidden flex flex-col justify-between shadow-lg">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full pointer-events-none"></div>
                <div>
                  <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">
                    Total Nilai Asset Terbuku (Total Stock)
                  </span>
                  <h3 className="text-2xl font-black text-white mt-1">
                    Rp {itemsStats.reduce((sum, item) => sum + item.totalValue, 0).toLocaleString('id-ID')}
                  </h3>
                </div>
                <p className="text-[10px] text-indigo-400 font-bold mt-4 uppercase">
                  Berdasarkan total stock opname dikali harga satuan masing-masing barang
                </p>
              </div>

              {/* Summary Card for Total L&B loss */}
              <div className="glass-card p-6 rounded-2xl border border-white/10 bg-rose-950/10 relative overflow-hidden lg:col-span-2 flex flex-col md:flex-row justify-between gap-6 shadow-lg">
                <div className="flex-1">
                  <span className="text-[9px] font-black tracking-widest text-rose-400 uppercase">
                    Rekapan Kerugian Lost & Broken (L&B)
                  </span>
                  <h3 className="text-2xl font-black text-rose-500 mt-1">
                    Rp {lnbStats.totalLnbLoss.toLocaleString('id-ID')}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-2 uppercase font-semibold">
                    Total nilai kehilangan dan kerusakan barang logistik pada periode cut-off ({currentPeriod.name}).
                  </p>
                </div>

                {lnbStats.lnbItems.length > 0 ? (
                  <div className="flex-1 max-h-[110px] overflow-y-auto border border-white/5 bg-slate-950/40 rounded-xl p-3 custom-scrollbar">
                    <table className="w-full text-left text-[9px] uppercase font-bold">
                      <thead>
                        <tr className="border-b border-white/5 text-slate-500 pb-1">
                          <th>BARANG</th>
                          <th className="text-center w-16">QTY L&B</th>
                          <th className="text-right w-24">TOTAL RUGI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white">
                        {lnbStats.lnbItems.map(item => (
                          <tr key={item.id}>
                            <td className="py-1 max-w-[120px] truncate">{item.description}</td>
                            <td className="py-1 text-center text-rose-400">{item.lnb}</td>
                            <td className="py-1 text-right text-rose-400 font-mono">Rp {(item.lnb * item.price).toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 rounded-xl p-4 text-center bg-slate-950/20">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      Aman! Tidak ada barang Lost & Broken di periode ini.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Main Stock Table */}
            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-4 bg-slate-950/40 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block">
                    DAFTAR STOCK LOGISTIK AKTIF
                  </span>
                  <p className="text-[9px] font-bold text-amber-500 uppercase">
                    PERIODE CUT-OFF: <span className="text-white">{currentPeriod.startDateStr}</span> S/D <span className="text-white">{currentPeriod.endDateStr}</span> ({currentPeriod.name})
                  </p>
                </div>
                <div className="text-[9px] font-bold text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5 space-y-0.5">
                  <p> rumus estimasi buku: <span className="text-indigo-400">Stok Awal + Penggantian - L&B</span></p>
                  <p> rumus total tersedia (stok akhir): <span className="text-emerald-400 font-black">Menggunakan hasil Stock Opname jika ada, jika tidak ada default ke Estimasi Buku</span></p>
                  <p> rumus stok fisik aktif: <span className="text-amber-400">Total Tersedia - Rusak - Dipinjam</span></p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-950/20 text-[9px] font-black text-slate-400 tracking-widest uppercase">
                      <th className="p-3 w-12 text-center">NO</th>
                      <th className="p-3">NAMA BARANG / DESCRIPTION</th>
                      <th className="p-3">HARGA SATUAN</th>
                      <th className="p-3 text-center text-amber-400">STOK AWAL</th>
                      <th className="p-3 text-center text-cyan-400">PENGGANTIAN (+)</th>
                      <th className="p-3 text-center text-rose-500">L&B (-)</th>
                      <th className="p-3 text-center text-slate-400">ESTIMASI BUKU</th>
                      <th className="p-3 text-center text-emerald-400">STOCK OPNAME (PHYSICAL)</th>
                      <th className="p-3 text-center text-red-400">RUSAK (TIDAK LAYAK)</th>
                      <th className="p-3 text-center text-orange-400">DIPINJAM</th>
                      <th className="p-3 text-center bg-indigo-500/10 text-indigo-300 font-bold">TOTAL TERSEDIA (STOK AKHIR)</th>
                      <th className="p-3 text-right bg-indigo-500/20 text-indigo-200">TOTAL NILAI (RP)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {itemsStats.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider">
                          Belum ada item logistik. Silakan tambah item baru untuk mulai pencatatan.
                        </td>
                      </tr>
                    ) : (
                      itemsStats.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-black text-white uppercase tracking-wide">
                            <div className="flex items-center justify-between gap-2 max-w-[250px]">
                              <span className="truncate">{item.description}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleUpdateDescription(item.id, item.description)}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 transition-all flex items-center justify-center border border-white/5 active:scale-90"
                                  title="Edit Nama Barang"
                                >
                                  <i className="fas fa-pencil-alt text-[9px]"></i>
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id, item.description)}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-red-500 hover:text-white text-slate-400 transition-all flex items-center justify-center border border-white/5 active:scale-90"
                                  title="Hapus Barang"
                                >
                                  <i className="fas fa-trash-alt text-[9px]"></i>
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-300">Rp {item.price.toLocaleString('id-ID')}</span>
                              <button
                                onClick={() => handleUpdatePrice(item.id, item.description, item.price)}
                                className="w-6 h-6 rounded bg-slate-800 hover:bg-indigo-500 hover:text-white text-slate-400 transition-all flex items-center justify-center border border-white/5 active:scale-90"
                                title="Edit Harga Satuan (Hanya Periode Ini)"
                              >
                                <i className="fas fa-pencil-alt text-[9px]"></i>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-amber-400 font-black">{item.beginStock}</span>
                              <button
                                onClick={() => handleUpdateBeginningStock(item.id, item.beginStock)}
                                className="text-slate-500 hover:text-amber-400 transition-colors p-0.5"
                                title="Edit Stok Awal"
                              >
                                <i className="fas fa-pencil-alt text-[9px]"></i>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-cyan-400">+{item.penggantian}</td>
                          <td className="p-3 text-center font-bold text-rose-500">-{item.lnb}</td>
                          <td className="p-3 text-center font-bold text-slate-500 font-mono">{item.bookStock}</td>
                          <td className="p-3 text-center font-bold text-emerald-400">
                            {item.hasRecord ? (
                              <span className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{item.layak}</span>
                            ) : (
                              <span className="text-slate-600 italic">Belum Opname</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-red-400">{item.tidakLayak}</td>
                          <td className="p-3 text-center font-bold text-orange-400">{item.dipinjam}</td>
                          <td className="p-3 text-center font-black bg-indigo-500/5 text-indigo-400 font-mono text-[12px]">
                            {item.totalStock}
                          </td>
                          <td className="p-3 text-right font-black bg-indigo-500/10 text-indigo-300 font-mono">
                            Rp {item.totalValue.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))
                    )}

                    {itemsStats.length > 0 && (
                      <tr className="bg-slate-950/40 border-t border-white/10 font-black text-slate-300 text-[11px]">
                        <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-[10px]">TOTAL SUMMARY</td>
                        <td className="p-3 text-center text-amber-400 font-mono">
                          {itemsStats.reduce((sum, item) => sum + item.beginStock, 0)}
                        </td>
                        <td className="p-3 text-center text-cyan-400 font-mono">
                          +{itemsStats.reduce((sum, item) => sum + item.penggantian, 0)}
                        </td>
                        <td className="p-3 text-center text-rose-500 font-mono">
                          -{itemsStats.reduce((sum, item) => sum + item.lnb, 0)}
                        </td>
                        <td className="p-3 text-center text-slate-400 font-mono">
                          {itemsStats.reduce((sum, item) => sum + item.bookStock, 0)}
                        </td>
                        <td className="p-3 text-center text-emerald-400 font-mono">
                          {itemsStats.reduce((sum, item) => sum + (item.hasRecord ? item.layak : 0), 0)}
                        </td>
                        <td className="p-3 text-center text-red-400 font-mono">
                          {itemsStats.reduce((sum, item) => sum + item.tidakLayak, 0)}
                        </td>
                        <td className="p-3 text-center text-orange-400 font-mono">
                          {itemsStats.reduce((sum, item) => sum + item.dipinjam, 0)}
                        </td>
                        <td className="p-3 text-center text-indigo-400 font-mono bg-indigo-500/5 text-[12px]">
                          {itemsStats.reduce((sum, item) => sum + item.totalStock, 0)}
                        </td>
                        <td className="p-3 text-right text-indigo-300 font-mono bg-indigo-500/10">
                          Rp {itemsStats.reduce((sum, item) => sum + item.totalValue, 0).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Price Changes & Variance History Section */}
            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/40 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <i className="fas fa-history text-amber-400 text-xs"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-tight text-white uppercase italic">
                      REKAPAN RIWAYAT PERUBAHAN HARGA BARANG LOGISTIK
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">
                      Menampilkan riwayat perubahan harga satuan tiap periode beserta selisihnya
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-black tracking-wider px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 uppercase">
                  Audited per cut-off
                </span>
              </div>

              {priceChangesHistory.length === 0 ? (
                <div className="text-center p-6 bg-slate-950/20 rounded-xl border border-dashed border-white/10">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Belum ada riwayat perubahan harga barang logistik antar periode.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                  {priceChangesHistory.map((history) => (
                    <div key={history.periodKey} className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-3">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider font-mono">
                          PERIODE: {history.periodName} ({history.periodKey})
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">
                          {history.changes.length} Perubahan
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {history.changes.map((change) => {
                          const isIncrease = change.difference > 0;
                          const isDecrease = change.difference < 0;
                          return (
                            <div key={change.itemId} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-white/5 hover:border-white/10 transition-all">
                              <div className="space-y-1">
                                <p className="text-xs font-black text-slate-200 uppercase">{change.itemName}</p>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 font-mono">
                                  <span>Sebelumnya: <span className="text-slate-300">Rp {change.oldPrice.toLocaleString('id-ID')}</span></span>
                                  <span>&rarr;</span>
                                  <span>Sekarang: <span className="text-white">Rp {change.newPrice.toLocaleString('id-ID')}</span></span>
                                </div>
                              </div>
                              
                              <div className="text-right shrink-0">
                                {isIncrease && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">
                                    <i className="fas fa-caret-up"></i>
                                    +Rp {change.difference.toLocaleString('id-ID')}
                                  </span>
                                )}
                                {isDecrease && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded bg-rose-500/10 text-rose-400">
                                    <i className="fas fa-caret-down"></i>
                                    -Rp {Math.abs(change.difference).toLocaleString('id-ID')}
                                  </span>
                                )}
                                {change.difference === 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded bg-slate-500/10 text-slate-400 font-mono">
                                    0 (Set Manual)
                                  </span>
                                )}
                                <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">SELISIH</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'PEMINJAMAN' && (
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950/40 border-b border-white/5">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                DAFTAR PEMINJAMAN LOGISTIK AKTIF (BELUM KEMBALI)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-slate-950/20 text-[9px] font-black text-slate-400 tracking-widest uppercase">
                    <th className="p-4">TANGGAL</th>
                    <th className="p-4">NAMA BARANG</th>
                    <th className="p-4">PEMINJAM (BORROWER)</th>
                    <th className="p-4 text-center">QTY PINJAM</th>
                    <th className="p-4 text-center">QTY KEMBALI</th>
                    <th className="p-4 text-center">SISA PINJAM</th>
                    <th className="p-4 text-center">AKSI PENGEMBALIAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px]">
                  {loans.filter(l => l.status === 'BORROWED').length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider">
                        Tidak ada peminjaman aktif saat ini.
                      </td>
                    </tr>
                  ) : (
                    loans
                      .filter(l => l.status === 'BORROWED')
                      .map((loan) => {
                        const item = items.find(i => i.id === loan.itemId);
                        const sisa = loan.qty - (loan.returnQty || 0);
                        return (
                          <tr key={loan.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-4 text-slate-400 font-mono">{loan.date}</td>
                            <td className="p-4 font-black text-white uppercase">{item?.description || 'Item Terhapus'}</td>
                            <td className="p-4 font-bold text-amber-400 uppercase">{loan.borrower}</td>
                            <td className="p-4 text-center font-bold">{loan.qty}</td>
                            <td className="p-4 text-center text-emerald-400 font-bold">{loan.returnQty || 0}</td>
                            <td className="p-4 text-center text-red-400 font-black">{sisa}</td>
                            <td className="p-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleQuickReturn(loan.id, sisa)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider transition-all"
                                >
                                  Kembalikan Semua ({sisa})
                                </button>
                                <button
                                  onClick={() => {
                                    setPartialReturnLoan({
                                      id: loan.id,
                                      borrower: loan.borrower,
                                      itemDesc: item?.description || 'Item',
                                      maxQty: sisa,
                                      returnQtyInput: String(sisa)
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[9px] font-black uppercase tracking-wider transition-all"
                                >
                                  Partial
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'HARGA' && (
          <div className="space-y-6 animate-fade-in">
            {/* Price Change Grid / Table */}
            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-4 bg-slate-950/40 border-b border-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  REKAPAN PERUBAHAN HARGA LOGISTIK ANTAR PERIODE DAN SELISIHNYA
                </span>
              </div>

              <div className="p-6">
                {priceChangesHistory.length === 0 ? (
                  <div className="text-center text-slate-500 p-8 font-bold uppercase tracking-wider">
                    Belum ada riwayat perubahan harga antar periode.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {priceChangesHistory.map((periodGroup) => (
                      <div key={periodGroup.periodKey} className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <h3 className="text-xs font-black text-white uppercase tracking-wider">
                            Periode {periodGroup.periodName}
                          </h3>
                        </div>

                        <div className="overflow-x-auto border border-white/5 bg-slate-950/30 rounded-xl">
                          <table className="w-full text-left text-[11px] uppercase">
                            <thead>
                              <tr className="border-b border-white/5 bg-slate-950/20 text-[9px] font-black text-slate-400 tracking-widest">
                                <th className="p-3">Nama Barang</th>
                                <th className="p-3 text-right">Harga Periode Sebelumnya</th>
                                <th className="p-3 text-right text-indigo-400">Harga Periode Ini</th>
                                <th className="p-3 text-right">Selisih (Difference)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {periodGroup.changes.map((change) => (
                                <tr key={change.itemId} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="p-3 font-bold text-white">{change.itemName}</td>
                                  <td className="p-3 text-right font-mono text-slate-400">
                                    {change.oldPrice > 0 ? `Rp ${change.oldPrice.toLocaleString('id-ID')}` : '-'}
                                  </td>
                                  <td className="p-3 text-right font-mono text-indigo-300 font-bold">
                                    Rp {change.newPrice.toLocaleString('id-ID')}
                                  </td>
                                  <td className="p-3 text-right font-mono font-black">
                                    <span className={change.difference > 0 ? 'text-emerald-400' : change.difference < 0 ? 'text-rose-500' : 'text-slate-500'}>
                                      {change.difference > 0 ? '+' : ''}
                                      {change.difference !== 0 ? `Rp ${change.difference.toLocaleString('id-ID')}` : 'Tidak Ada Perubahan'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'LOGS' && (
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950/40 border-b border-white/5">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                RIWAYAT UPDATE STOCK & TRANSAKSI PEMINJAMAN
              </span>
            </div>

            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar">
              {Object.keys(dailyRecords).length === 0 && loans.length === 0 ? (
                <div className="text-center text-slate-500 p-8 font-bold uppercase tracking-wider">
                  Belum ada riwayat aktivitas logistik.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Map Loans History */}
                  {loans.map(loan => {
                    const item = items.find(i => i.id === loan.itemId);
                    return (
                      <div key={loan.id} className="p-4 rounded-xl bg-slate-950/30 border border-white/5 flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">
                              PEMINJAMAN
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">{loan.date}</span>
                          </div>
                          <p className="text-xs font-bold text-white uppercase">
                            <span className="text-amber-400 font-black">{loan.borrower}</span> meminjam <span className="text-white font-black">{loan.qty} pcs</span> {item?.description}
                          </p>
                          {loan.returnQty && loan.returnQty > 0 && (
                            <p className="text-[10px] text-emerald-400 font-bold">
                              Sudah dikembalikan: {loan.returnQty} pcs (Status: {loan.status})
                            </p>
                          )}
                        </div>
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          loan.status === 'RETURNED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {loan.status}
                        </span>
                      </div>
                    );
                  })}

                  {/* Map Daily Inventory Records */}
                  {Object.entries(dailyRecords).map(([date, itemMap]) => (
                    <div key={date} className="space-y-2">
                      <div className="text-[10px] font-black text-indigo-400 font-mono border-b border-white/5 pb-1 mt-4">
                        STOCK ADJUSTMENT ON {date}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(itemMap).map(([itemId, rec]) => {
                          const item = items.find(i => i.id === itemId);
                          return (
                            <div key={itemId} className="p-3 rounded-lg bg-slate-900/50 border border-white/5 flex justify-between items-center">
                              <div>
                                <h4 className="text-xs font-black text-slate-200 uppercase">{item?.description || 'Item Terhapus'}</h4>
                                <div className="flex gap-4 mt-1 text-[10px] font-bold text-slate-400">
                                  <span>Layak: <span className="text-emerald-400">{rec.layak}</span></span>
                                  <span>Rusak: <span className="text-rose-400">{rec.tidakLayak}</span></span>
                                  <span>L&B: <span className="text-red-400">{rec.lnb}</span></span>
                                  <span>Ganti: <span className="text-cyan-400">{rec.penggantian}</span></span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah Item Baru */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-base font-black tracking-tight text-white uppercase italic">
                TAMBAH ITEM BARANG BARU
              </h3>
              <button onClick={() => setShowAddItemModal(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Nama Barang / Description
                </label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Contoh: Piring Ceper 10 inch"
                  className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Harga Satuan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="Contoh: 15000"
                  className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider"
                >
                  Simpan Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Input Harian */}
      {showInputModal && (
        <LogisticsInputModal
          data={data}
          onUpdate={onUpdate}
          selectedDate={selectedDate}
          onClose={() => setShowInputModal(false)}
          showToast={showToast}
        />
      )}

      {/* Modal Edit Nama Barang */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const newDesc = editingItem.description.trim();
              if (!newDesc) {
                showToast('Nama barang tidak boleh kosong', 'error');
                return;
              }
              const updatedItems = items.map(i => {
                if (i.id === editingItem.id) {
                  return { ...i, description: newDesc };
                }
                return i;
              });
              onUpdate({ logisticItems: updatedItems }, true);
              showToast(`Nama barang berhasil diperbarui menjadi "${newDesc}"`, 'success');
              setEditingItem(null);
            }}
            className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4 bg-slate-900"
          >
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <i className="fas fa-pencil-alt text-xs"></i>
              </div>
              <h3 className="text-xs font-black tracking-tight text-white uppercase italic">
                EDIT NAMA BARANG
              </h3>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Nama Barang / Description
              </label>
              <input
                type="text"
                required
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 font-bold uppercase"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Hapus Barang */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4 bg-slate-900">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                <i className="fas fa-exclamation-triangle text-xs"></i>
              </div>
              <h3 className="text-xs font-black tracking-tight text-white uppercase italic">
                KONFIRMASI HAPUS BARANG
              </h3>
            </div>
            
            <p className="text-xs text-slate-300 font-medium">
              Apakah Anda yakin ingin menghapus item <span className="font-bold text-white uppercase">"{deletingItem.description}"</span> dari data logistik? Tindakan ini akan menghapus data master barang secara permanen di seluruh periode.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const itemId = deletingItem.id;
                  const updatedItems = items.filter(i => i.id !== itemId);
                  onUpdate({ logisticItems: updatedItems }, true);
                  showToast(`Item "${deletingItem.description}" berhasil dihapus`, 'success');
                  setDeletingItem(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-wider"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Harga */}
      {updatingPriceItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const newVal = updatingPriceItem.price;
              if (isNaN(newVal) || newVal < 0) {
                showToast('Input harga tidak valid', 'error');
                return;
              }
              const updatedPeriodPrices = {
                ...(data.logisticPeriodPrices || {}),
                [currentPeriod.key]: {
                  ...((data.logisticPeriodPrices || {})[currentPeriod.key] || {}),
                  [updatingPriceItem.id]: newVal
                }
              };
              onUpdate({ logisticPeriodPrices: updatedPeriodPrices }, true);
              showToast(`Harga item "${updatingPriceItem.description}" untuk periode ${currentPeriod.name} berhasil diperbarui`, 'success');
              setUpdatingPriceItem(null);
            }}
            className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4 bg-slate-900"
          >
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <i className="fas fa-coins text-xs"></i>
              </div>
              <h3 className="text-xs font-black tracking-tight text-white uppercase italic">
                EDIT HARGA SATUAN ({currentPeriod.name})
              </h3>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Barang</span>
              <p className="text-xs font-black text-white uppercase">{updatingPriceItem.description}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Harga Satuan (Rp)
              </label>
              <input
                type="number"
                min="0"
                required
                value={updatingPriceItem.price}
                onChange={(e) => setUpdatingPriceItem({ ...updatingPriceItem, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold font-mono"
              />
              <p className="text-[8px] font-bold text-amber-500 uppercase mt-1">
                * Perubahan ini hanya akan diterapkan pada periode aktif saat ini ({currentPeriod.name})
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUpdatingPriceItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider"
              >
                Terapkan Harga
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Edit Stok Awal */}
      {updatingBeginStockItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const newVal = updatingBeginStockItem.beginStock;
              if (isNaN(newVal) || newVal < 0) {
                showToast('Input stok awal tidak valid', 'error');
                return;
              }

              const updatedBeginningStocks = {
                ...(data.logisticBeginningStocks || {}),
                [currentPeriod.key]: {
                  ...((data.logisticBeginningStocks || {})[currentPeriod.key] || {}),
                  [updatingBeginStockItem.id]: newVal
                }
              };

              onUpdate({ logisticBeginningStocks: updatedBeginningStocks }, true);
              showToast(`Stok awal item "${updatingBeginStockItem.description}" berhasil diperbarui`, 'success');
              setUpdatingBeginStockItem(null);
            }}
            className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4 bg-slate-900"
          >
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <i className="fas fa-boxes text-xs"></i>
              </div>
              <h3 className="text-xs font-black tracking-tight text-white uppercase italic">
                EDIT STOK AWAL ({currentPeriod.name})
              </h3>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Barang</span>
              <p className="text-xs font-black text-white uppercase">{updatingBeginStockItem.description}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Stok Awal (Unit)
              </label>
              <input
                type="number"
                min="0"
                required
                value={updatingBeginStockItem.beginStock}
                onChange={(e) => setUpdatingBeginStockItem({ ...updatingBeginStockItem, beginStock: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 font-bold font-mono"
              />
              <p className="text-[8px] font-bold text-amber-500 uppercase mt-1">
                * Perubahan stok awal hanya berlaku untuk periode aktif saat ini ({currentPeriod.name})
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUpdatingBeginStockItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Partial Return */}
      {partialReturnLoan && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <form
            onSubmit={handlePartialReturnSubmit}
            className="w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4 bg-slate-900"
          >
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <i className="fas fa-hand-holding-usd text-xs"></i>
              </div>
              <h3 className="text-xs font-black tracking-tight text-white uppercase italic">
                PENGEMBALIAN SEBAGIAN (PARTIAL RETURN)
              </h3>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-lg border border-white/5 space-y-2">
              <div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Peminjam</span>
                <p className="text-xs font-black text-white uppercase">{partialReturnLoan.borrower}</p>
              </div>
              <div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Barang</span>
                <p className="text-xs font-bold text-slate-300 uppercase">{partialReturnLoan.itemDesc}</p>
              </div>
              <div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Sisa Belum Kembali</span>
                <p className="text-xs font-black text-amber-400">{partialReturnLoan.maxQty} Unit</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Jumlah Dikembalikan
              </label>
              <input
                type="number"
                min="1"
                max={partialReturnLoan.maxQty}
                required
                value={partialReturnLoan.returnQtyInput}
                onChange={(e) => setPartialReturnLoan({ ...partialReturnLoan, returnQtyInput: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 font-bold font-mono"
              />
              <p className="text-[8px] font-bold text-amber-500 uppercase mt-1">
                * Maksimal {partialReturnLoan.maxQty} unit yang dapat dikembalikan.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPartialReturnLoan(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Reset Data Logistik */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-md glass-card rounded-3xl border border-red-500/30 overflow-hidden shadow-2xl animate-scale-up bg-slate-950">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-base font-black tracking-tight text-red-400 uppercase italic flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-red-500"></i>
                RESET DATA LOGISTIK
              </h3>
              <button onClick={() => setShowResetConfirmModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs leading-relaxed text-red-200">
                Pilih cakupan data logistik yang ingin Anda reset. Tindakan ini tidak dapat dibatalkan.
              </div>

              <div className="space-y-3">
                <label 
                  onClick={() => setResetType('INPUT_ONLY')}
                  className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                    resetType === 'INPUT_ONLY' 
                      ? 'bg-red-500/10 border-red-500/50 text-white' 
                      : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
                  }`}
                >
                  <div className="mt-0.5">
                    <input 
                      type="radio" 
                      name="reset-scope" 
                      checked={resetType === 'INPUT_ONLY'} 
                      onChange={() => setResetType('INPUT_ONLY')}
                      className="accent-red-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider">Reset Input Harian Saja</div>
                    <div className="text-[10px] mt-1 opacity-80 leading-normal">
                      Menghapus data pencatatan harian stock logistik, stok awal periode, history harga, dan peminjaman aktif. <strong className="text-emerald-400">Master daftar barang tetap utuh.</strong>
                    </div>
                  </div>
                </label>

                <label 
                  onClick={() => setResetType('ALL')}
                  className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                    resetType === 'ALL' 
                      ? 'bg-red-500/20 border-red-500 text-white shadow-lg' 
                      : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
                  }`}
                >
                  <div className="mt-0.5">
                    <input 
                      type="radio" 
                      name="reset-scope" 
                      checked={resetType === 'ALL'} 
                      onChange={() => setResetType('ALL')}
                      className="accent-red-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-black text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                      Reset Semua Data Logistik
                    </div>
                    <div className="text-[10px] mt-1 opacity-80 leading-normal">
                      Menghapus seluruh data logistik secara permanen, <strong className="text-red-400">termasuk master daftar barang</strong> yang sudah ditambahkan.
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-white/5 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleResetLogistics}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-red-950/40 border border-red-400/20"
                >
                  Ya, Reset Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Stock Opname Logistik */}
      {showStockOpnameModal && (
        <StockOpnameModal
          itemsStats={itemsStats}
          currentPeriod={currentPeriod}
          selectedOutlet={selectedOutlet}
          data={data}
          onUpdate={onUpdate}
          showToast={showToast}
          onClose={() => setShowStockOpnameModal(false)}
        />
      )}
    </div>
  );
};

// Subcomponent: LogisticsInputModal
interface InputModalProps {
  data: AppState;
  onUpdate: (updates: Partial<AppState>, isPriority?: boolean) => void;
  selectedDate: string;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const LogisticsInputModal: React.FC<InputModalProps> = ({
  data,
  onUpdate,
  selectedDate,
  onClose,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'PINJAM' | 'KEMBALI'>('STOCK');
  const [inputDate, setInputDate] = useState(selectedDate);
  
  // Filter out old/uninputted default items permanently
  const items = useMemo(() => {
    const rawItems = data.logisticItems || [];
    return rawItems.filter(item => {
      if (!item) return false;
      const desc = (item.description || '').toLowerCase();
      const id = String(item.id);
      if (id === 'item_1' || id === 'item_2' || id === 'item_3' || id === 'item_4' || id === 'item_5') {
        return false;
      }
      if (desc === 'piring makan sh' || desc === 'gelas minum kaca' || desc === 'sendok stainless' || desc === 'garpu stainless' || desc === 'nampan saji kayu') {
        return false;
      }
      return true;
    });
  }, [data.logisticItems]);
  const dailyRecords = data.dailyLogisticRecords || {};
  const loans = data.peminjamanRecords || [];

  // Local state for stock inputs as a table
  const [tableRecords, setTableRecords] = useState<Record<string, { layak: string; tidakLayak: string; lnb: string; penggantian: string }>>({});
  const [showPrintReview, setShowPrintReview] = useState(false);
  const [printPaperSize, setPrintPaperSize] = useState<'80MM' | 'A4'>('80MM');

  // Calculate beginning stocks cascading through periods for current inputDate
  const itemBeginningStocks = useMemo(() => {
    const periodInfo = getPeriodForDate(inputDate);
    const beginningStocks = data.logisticBeginningStocks || {};
    
    const periodsSet = new Set<string>();
    periodsSet.add(periodInfo.key);
    Object.keys(dailyRecords).forEach(dateStr => {
      try {
        const p = getPeriodForDate(dateStr);
        periodsSet.add(p.key);
      } catch (e) {
        // ignore
      }
    });
    const sortedPeriods = Array.from(periodsSet).sort();
    
    const resultsByPeriod: Record<string, Record<string, { beginStock: number; endingStock: number; }>> = {};
    
    sortedPeriods.forEach((pKey, idx) => {
      const pInfo = getPeriodInfoFromKey(pKey);
      const prevPKey = getPreviousPeriodKey(pKey);
      resultsByPeriod[pKey] = {};
      
      items.forEach(item => {
        let beginStock = 0;
        if (beginningStocks[pKey]?.[item.id] !== undefined) {
          beginStock = beginningStocks[pKey][item.id];
        } else if (idx > 0) {
          const prevStats = resultsByPeriod[prevPKey]?.[item.id];
          beginStock = prevStats ? prevStats.endingStock : 0;
        }
        
        let totalLnb = 0;
        let totalPenggantian = 0;
        let latestLayak = 0;
        let hasRecord = false;
        let latestDate = '';
        
        Object.entries(dailyRecords).forEach(([dateStr, itemMap]) => {
          if (dateStr >= pInfo.startDateStr && dateStr <= pInfo.endDateStr) {
            const rec = itemMap[item.id];
            if (rec) {
              totalLnb += rec.lnb || 0;
              totalPenggantian += rec.penggantian || 0;
              if (dateStr >= latestDate) {
                latestDate = dateStr;
                latestLayak = rec.layak;
                hasRecord = true;
              }
            }
          }
        });
        
        const bookStock = beginStock + totalPenggantian - totalLnb;
        const endingStock = bookStock;
        
        resultsByPeriod[pKey][item.id] = {
          beginStock,
          endingStock
        };
      });
    });
    
    const resolved: Record<string, { beginStock: number; prevStock: number }> = {};
    
    items.forEach(item => {
      const pStats = resultsByPeriod[periodInfo.key]?.[item.id] || { beginStock: 0, endingStock: 0 };
      const beginStock = pStats.beginStock;
      
      // Calculate cumulative L&B and Penggantian strictly before inputDate in this current period
      let sumLnbBefore = 0;
      let sumPenggantianBefore = 0;
      
      Object.entries(dailyRecords).forEach(([dateStr, itemMap]) => {
        if (dateStr >= periodInfo.startDateStr && dateStr < inputDate) {
          const rec = itemMap[item.id];
          if (rec) {
            sumLnbBefore += rec.lnb || 0;
            sumPenggantianBefore += rec.penggantian || 0;
          }
        }
      });
      
      const prevStock = beginStock - sumLnbBefore + sumPenggantianBefore;
      
      resolved[item.id] = {
        beginStock,
        prevStock
      };
    });
    
    return resolved;
  }, [items, dailyRecords, inputDate, data.logisticBeginningStocks]);

  const computeAutoLnb = (itemId: string, layakStr: string, penggantianStr: string): string => {
    const prevStock = itemBeginningStocks[itemId]?.prevStock || 0;
    const layakNum = parseInt(layakStr, 10);
    const penggantianNum = parseInt(penggantianStr, 10) || 0;
    
    if (isNaN(layakNum)) {
      return '';
    }
    
    const autoLnb = Math.max(0, prevStock + penggantianNum - layakNum);
    return String(autoLnb);
  };

  // Handle printing optimized for connected POS/Receipt/thermal printers (80mm) OR A4 (PDF)
  // Shows ONLY: NAMA BARANG, FISIK (LAYAK), and TIDAK LAYAK
  const handlePrintWithSize = (paperSize: '80MM' | 'A4') => {
    const printTitle = "INPUT OPERASIONAL LOGISTIK";
    const printDateStr = inputDate;
    
    const tableRowsHtml = items.map((item, idx) => {
      const row = tableRecords[item.id] || { layak: '', tidakLayak: '' };
      const layakVal = (row.layak !== '' && row.layak !== '0' && row.layak !== 0) ? row.layak : '';
      const tidakLayakVal = (row.tidakLayak !== '' && row.tidakLayak !== '0' && row.tidakLayak !== 0) ? row.tidakLayak : '';
      const prevStockRaw = itemBeginningStocks[item.id]?.prevStock;
      const prevStockVal = (prevStockRaw === undefined || prevStockRaw === null || prevStockRaw === 0 || prevStockRaw === '0') ? '' : prevStockRaw;
      const borderLeftStyle = paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000';
      const separatorBorderStyle = paperSize === '80MM' ? '2px solid #000000' : '3px solid #000000';
      const borderBottomStyle = paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000';
      const rowBg = '#ffffff';
      return `
        <tr style="background-color: ${rowBg}; page-break-inside: avoid !important; break-inside: avoid !important; font-size: 10px; color: #000000;">
          <td style="text-transform: uppercase; border-bottom: ${borderBottomStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 52%; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 10px;">${item.description}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${separatorBorderStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${prevStockVal}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${borderLeftStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${layakVal}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${borderLeftStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${tidakLayakVal}</td>
        </tr>
      `;
    }).join('');

    const pageStyle = paperSize === '80MM' 
      ? `
        @page {
          margin: 0;
          size: 80mm auto;
        }
        body {
          margin: 0;
          padding: 4mm;
          font-family: 'Courier New', Courier, monospace;
          font-size: 10px;
          line-height: 1.3;
          color: #000000;
          background: #ffffff;
          width: 80mm;
          box-sizing: border-box;
        }
        .title {
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 4px;
          color: #000000;
          background-color: #ffffff;
        }
        .subtitle {
          font-size: 10px;
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 1px dashed #000000;
          padding-bottom: 6px;
          color: #000000;
          background-color: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5px;
          table-layout: fixed;
        }
        th {
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 5px 2px;
          font-weight: bold;
          text-align: left;
          font-size: 10px;
          color: #000000;
        }
        .footer {
          margin-top: 15px;
          border-top: 1px dashed #000000;
          padding-top: 5px;
          text-align: center;
          font-size: 9px;
          color: #000000;
        }
      `
      : `
        @page {
          margin: 10mm;
          size: A4 portrait;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 10px;
          line-height: 1.4;
          color: #000000;
          background: #ffffff;
        }
        .title {
          font-size: 12px;
          font-weight: 800;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
          color: #000000;
          background-color: #ffffff;
        }
        .subtitle {
          font-size: 10px;
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #000000;
          padding-bottom: 8px;
          color: #000000;
          background-color: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          table-layout: fixed;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        th {
          background-color: #ffffff;
          border-top: 1px solid #000000;
          border-bottom: 2px solid #000000;
          padding: 8px 6px;
          font-weight: bold;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          color: #000000;
        }
        td {
          border-bottom: 1px solid #000000;
          padding: 8px 6px;
          font-size: 10px;
          color: #000000;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #000000;
          padding-top: 10px;
          text-align: center;
          font-size: 9px;
          color: #000000;
        }
      `;

    const fullPrintHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Input Harian Logistik</title>
          <style>
            ${pageStyle}
            .center {
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 12px; color: #000000; font-family: ${paperSize === '80MM' ? '"Courier New", Courier, monospace' : 'system-ui, -apple-system, sans-serif'};">
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #000000; background-color: #ffffff;">
              INPUT OPERASIONAL LOGISTIK
            </div>
            <div style="font-size: 10px; margin-top: 4px; border-bottom: ${paperSize === '80MM' ? '1px dashed #000000' : '2px solid #000000'}; padding-bottom: 6px; color: #000000; background-color: #ffffff;">
              <div>Tanggal Input: ${printDateStr}</div>
              <div>Waktu Cetak: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 52%; word-wrap: break-word;">NAMA BARANG</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '2px solid #000000' : '3px solid #000000'}; word-wrap: break-word;">STOK AWAL</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '1px dashed #000' : '1px solid #000000'}; word-wrap: break-word;">FISIK</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '1px dashed #000' : '1px solid #000000'}; word-wrap: break-word;">TIDAK LAYAK</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <div class="footer">
            <div>Meningkatkan Kualitas & Akurasi</div>
            <div>Printed from Logistics System</div>
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    // Create a temporary hidden iframe to isolate print stylesheet from the main workspace
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = paperSize === '80MM' ? '302px' : '794px';
    iframe.style.height = '800px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(fullPrintHtml);
      doc.close();
    }

    // Give browser ample time to print, then clean up iframe
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 10000);
  };

  // Handle direct PDF downloading using html2pdf.js with iframe-isolated parsing to prevent oklab/oklch errors
  const handleDownloadPDF = (paperSize: '80MM' | 'A4') => {
    const printTitle = "INPUT OPERASIONAL LOGISTIK";
    const printDateStr = inputDate;
    
    const tableRowsHtml = items.map((item, idx) => {
      const row = tableRecords[item.id] || { layak: '', tidakLayak: '' };
      const layakVal = (row.layak !== '' && row.layak !== '0' && row.layak !== 0) ? row.layak : '';
      const tidakLayakVal = (row.tidakLayak !== '' && row.tidakLayak !== '0' && row.tidakLayak !== 0) ? row.tidakLayak : '';
      const prevStockRaw = itemBeginningStocks[item.id]?.prevStock;
      const prevStockVal = (prevStockRaw === undefined || prevStockRaw === null || prevStockRaw === 0 || prevStockRaw === '0') ? '' : prevStockRaw;
      const borderLeftStyle = paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000';
      const separatorBorderStyle = paperSize === '80MM' ? '2px solid #000000' : '3px solid #000000';
      const borderBottomStyle = paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000';
      const rowBg = '#ffffff';
      return `
        <tr style="background-color: ${rowBg}; page-break-inside: avoid !important; break-inside: avoid !important; font-size: 10px; color: #000000;">
          <td style="text-transform: uppercase; border-bottom: ${borderBottomStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 52%; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 10px;">${item.description}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${separatorBorderStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${prevStockVal}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${borderLeftStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${layakVal}</td>
          <td style="text-align: center; border-bottom: ${borderBottomStyle}; border-left: ${borderLeftStyle}; padding: 6px 4px; font-weight: 700; color: #000000; width: 16%; word-wrap: break-word; overflow-wrap: break-word; font-size: 10px;">${tidakLayakVal}</td>
        </tr>
      `;
    }).join('');

    const pageStyle = paperSize === '80MM' 
      ? `
        @page {
          margin: 0;
          size: 80mm auto;
        }
        body {
          margin: 0;
          padding: 4mm;
          font-family: 'Courier New', Courier, monospace;
          font-size: 10px;
          line-height: 1.3;
          color: #000000;
          background: #ffffff;
          width: 80mm;
          box-sizing: border-box;
        }
        .title {
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 4px;
          color: #000000;
          background-color: #ffffff;
        }
        .subtitle {
          font-size: 10px;
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 1px dashed #000000;
          padding-bottom: 6px;
          color: #000000;
          background-color: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5px;
          table-layout: fixed;
        }
        th {
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 5px 2px;
          font-weight: bold;
          text-align: left;
          font-size: 10px;
          color: #000000;
        }
        .footer {
          margin-top: 15px;
          border-top: 1px dashed #000000;
          padding-top: 5px;
          text-align: center;
          font-size: 9px;
          color: #000000;
        }
      `
      : `
        @page {
          margin: 10mm;
          size: A4 portrait;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 10px;
          line-height: 1.4;
          color: #000000;
          background: #ffffff;
        }
        .title {
          font-size: 12px;
          font-weight: 800;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
          color: #000000;
          background-color: #ffffff;
        }
        .subtitle {
          font-size: 10px;
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #000000;
          padding-bottom: 8px;
          color: #000000;
          background-color: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          table-layout: fixed;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        th {
          background-color: #ffffff;
          border-top: 1px solid #000000;
          border-bottom: 2px solid #000000;
          padding: 8px 6px;
          font-weight: bold;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          color: #000000;
        }
        td {
          border-bottom: 1px solid #000000;
          padding: 8px 6px;
          font-size: 10px;
          color: #000000;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #000000;
          padding-top: 10px;
          text-align: center;
          font-size: 9px;
          color: #000000;
        }
      `;

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Logistik</title>
          <style>
            ${pageStyle}
            .center {
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 12px; color: #000000; font-family: ${paperSize === '80MM' ? '"Courier New", Courier, monospace' : 'system-ui, -apple-system, sans-serif'};">
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #000000; background-color: #ffffff;">
              INPUT OPERASIONAL LOGISTIK
            </div>
            <div style="font-size: 10px; margin-top: 4px; border-bottom: ${paperSize === '80MM' ? '1px dashed #000000' : '2px solid #000000'}; padding-bottom: 6px; color: #000000; background-color: #ffffff;">
              <div>Tanggal Input: ${printDateStr}</div>
              <div>Waktu Cetak: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 52%; word-wrap: break-word;">NAMA BARANG</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '2px solid #000000' : '3px solid #000000'}; word-wrap: break-word;">STOK AWAL</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000'}; word-wrap: break-word;">FISIK</th>
                <th class="center" style="width: 16%; border-left: ${paperSize === '80MM' ? '1px dashed #000000' : '1px solid #000000'}; word-wrap: break-word;">TIDAK LAYAK</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <div class="footer">
            <div>Meningkatkan Kualitas & Akurasi</div>
            <div>Printed from Logistics System</div>
          </div>
        </body>
      </html>
    `;

    // Create a temporary hidden iframe to isolate stylesheets
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = paperSize === '80MM' ? '302px' : '794px';
    iframe.style.height = '800px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
    }

    // Capture the element from the iframe
    const printElement = doc?.body || iframe.contentWindow?.document.body;
    if (!printElement) {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      return;
    }

    // Use a clean and responsive configuration for high-fidelity conversion
    const opt = {
      margin: paperSize === '80MM' ? 2 : 10,
      filename: `LOGISTIK_${inputDate}_${paperSize}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        letterRendering: true,
        logging: false
      },
      jsPDF: { 
        unit: 'mm', 
        format: paperSize === '80MM' ? [80, 200] : 'a4', 
        orientation: 'portrait' 
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Use html2pdf.js from the main window, but pass the element inside the iframe!
    // @ts-ignore
    html2pdf().from(printElement).set(opt).save().then(() => {
      // Clean up iframe after saving is done
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }).catch((err: any) => {
      console.error("PDF generation failed:", err);
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    });
  };

  // Initialize table from saved records when date or items change
  React.useEffect(() => {
    const recordsForDate = dailyRecords[inputDate] || {};
    const initialRecords: Record<string, { layak: string; tidakLayak: string; lnb: string; penggantian: string }> = {};
    
    items.forEach(item => {
      const rec = recordsForDate[item.id];
      initialRecords[item.id] = {
        layak: rec ? String(rec.layak) : '',
        tidakLayak: rec ? String(rec.tidakLayak) : '',
        lnb: rec ? String(rec.lnb) : '',
        penggantian: rec ? String(rec.penggantian) : ''
      };
    });
    setTableRecords(initialRecords);
  }, [inputDate, items, dailyRecords]);

  // Handle cell change
  const handleCellChange = (itemId: string, field: 'layak' | 'tidakLayak' | 'lnb' | 'penggantian', value: string) => {
    setTableRecords(prev => {
      const currentRow = prev[itemId] || { layak: '', tidakLayak: '', lnb: '', penggantian: '' };
      const updatedRow = { ...currentRow, [field]: value };
      
      // Auto-calculate L&B if they edit 'layak' or 'penggantian'
      if (field === 'layak' || field === 'penggantian') {
        const autoLnb = computeAutoLnb(itemId, updatedRow.layak, updatedRow.penggantian);
        if (autoLnb !== '') {
          updatedRow.lnb = autoLnb;
        }
      }
      
      // Reciprocal: Auto-calculate layak if they edit 'lnb'
      if (field === 'lnb') {
        const prevStock = itemBeginningStocks[itemId]?.prevStock || 0;
        const lnbNum = parseInt(value, 10) || 0;
        const penggantianNum = parseInt(updatedRow.penggantian, 10) || 0;
        const autoLayak = Math.max(0, prevStock + penggantianNum - lnbNum);
        updatedRow.layak = String(autoLayak);
      }
      
      return {
        ...prev,
        [itemId]: updatedRow
      };
    });
  };

  // Form State - Loan
  const [loanItemId, setLoanItemId] = useState('');
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowQty, setBorrowQty] = useState('');

  // Auto-select first item if loanItemId is empty
  React.useEffect(() => {
    if (items.length > 0 && !loanItemId) {
      setLoanItemId(items[0].id);
    }
  }, [items, loanItemId]);

  // Form State - Return
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [returnQty, setReturnQty] = useState('');

  // Filter active loans for selector
  const activeLoans = useMemo(() => {
    return loans.filter(l => l.status === 'BORROWED');
  }, [loans]);

  // Save all stock updates from the table
  const handleSaveAllStock = (e: React.FormEvent) => {
    e.preventDefault();
    
    const recordsToSave: Record<string, DailyLogisticRecord> = {};
    
    items.forEach(item => {
      const row = tableRecords[item.id] || { layak: '', tidakLayak: '', lnb: '', penggantian: '' };
      recordsToSave[item.id] = {
        layak: Math.max(0, parseInt(row.layak, 10) || 0),
        tidakLayak: Math.max(0, parseInt(row.tidakLayak, 10) || 0),
        lnb: Math.max(0, parseInt(row.lnb, 10) || 0),
        penggantian: Math.max(0, parseInt(row.penggantian, 10) || 0)
      };
    });

    const updatedRecords = {
      ...dailyRecords,
      [inputDate]: recordsToSave
    };

    onUpdate({ dailyLogisticRecords: updatedRecords }, true);
    showToast(`Stock harian untuk ${items.length} item berhasil disimpan`, 'success');
    onClose();
  };

  // Submit Loan
  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanItemId) {
      showToast('Pilih item terlebih dahulu', 'error');
      return;
    }
    if (!borrowerName.trim()) {
      showToast('Nama peminjam wajib diisi', 'error');
      return;
    }
    const qty = parseInt(borrowQty, 10) || 0;
    if (qty <= 0) {
      showToast('Jumlah pinjam harus lebih dari 0', 'error');
      return;
    }

    const newLoan: PeminjamanRecord = {
      id: `loan_${Date.now()}`,
      date: inputDate,
      itemId: loanItemId,
      borrower: borrowerName.trim(),
      qty,
      status: 'BORROWED',
      returnQty: 0
    };

    const updatedLoans = [...loans, newLoan];
    onUpdate({ peminjamanRecords: updatedLoans }, true);
    showToast(`Peminjaman ${qty} unit oleh ${borrowerName} berhasil dicatat`, 'success');
    
    // Clear fields
    setBorrowerName('');
    setBorrowQty('');
    onClose();
  };

  // Submit Return
  const handleSaveReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanId) {
      showToast('Pilih catatan peminjaman', 'error');
      return;
    }
    const qty = parseInt(returnQty, 10) || 0;
    if (qty <= 0) {
      showToast('Jumlah pengembalian harus lebih dari 0', 'error');
      return;
    }

    const targetLoan = loans.find(l => l.id === selectedLoanId);
    if (!targetLoan) return;

    const sisa = targetLoan.qty - (targetLoan.returnQty || 0);
    if (qty > sisa) {
      showToast(`Jumlah pengembalian melebihi sisa pinjaman (${sisa} unit)`, 'error');
      return;
    }

    const updatedLoans = loans.map(l => {
      if (l.id === selectedLoanId) {
        const newReturnQty = (l.returnQty || 0) + qty;
        const status = newReturnQty >= l.qty ? 'RETURNED' : 'BORROWED';
        return {
          ...l,
          returnQty: newReturnQty,
          status,
          returnDate: inputDate
        } as PeminjamanRecord;
      }
      return l;
    });

    onUpdate({ peminjamanRecords: updatedLoans }, true);
    showToast(`Pengembalian ${qty} unit dicatat sukses`, 'success');
    
    // Clear fields
    setSelectedLoanId('');
    setReturnQty('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full ${activeTab === 'STOCK' ? 'max-w-4xl' : 'max-w-lg'} glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl transition-all duration-300 animate-scale-up`}>
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-base font-black tracking-tight text-white uppercase italic">
              INPUT INVENTORY LOGISTIK HARIAN
            </h3>
            <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-wider">
              FORM PENCATATAN OPERASIONAL LOGISTIK
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-white/5 bg-slate-950/20 px-3">
          <button
            type="button"
            onClick={() => setActiveTab('STOCK')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 text-center transition-all ${
              activeTab === 'STOCK' ? 'border-amber-500 text-white' : 'border-transparent text-slate-400'
            }`}
          >
            Update Stock & Kondisi (Tabel)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PINJAM')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 text-center transition-all ${
              activeTab === 'PINJAM' ? 'border-amber-500 text-white' : 'border-transparent text-slate-400'
            }`}
          >
            Peminjaman
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('KEMBALI')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 text-center transition-all ${
              activeTab === 'KEMBALI' ? 'border-amber-500 text-white' : 'border-transparent text-slate-400'
            }`}
          >
            Pengembalian
          </button>
        </div>

        <div className="p-6">
          {/* General Inputs: Date */}
          <div className="mb-4">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Tanggal Input
            </label>
            <input
              type="date"
              required
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-mono font-bold"
            />
          </div>

          {/* Tab 1: Stock Adjustment Table */}
          {activeTab === 'STOCK' && (
            <form onSubmit={handleSaveAllStock} className="space-y-4">
              {items.length === 0 ? (
                <div className="text-center p-8 bg-slate-950/30 rounded-xl border border-white/5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Belum ada item logistik.
                  </p>
                  <p className="text-[10px] text-slate-500 mt-2 uppercase">
                    Silakan tutup modal ini dan klik tombol "TAMBAH ITEM BARU" terlebih dahulu untuk mendaftarkan barang.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-white/5 rounded-xl bg-slate-950/30 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-slate-950/50 text-[9px] font-black text-slate-400 tracking-widest uppercase sticky top-0 z-10 backdrop-blur-md">
                          <th className="p-3 w-12 text-center">NO</th>
                          <th className="p-3">NAMA BARANG / DESCRIPTION</th>
                          <th className="p-3 text-center text-amber-400 w-24">STOK AWAL</th>
                          <th className="p-3 text-center text-emerald-400 w-24">LAYAK</th>
                          <th className="p-3 text-center text-rose-400 w-24">TIDAK LAYAK</th>
                          <th className="p-3 text-center text-red-400 w-24">L & B (AUTO)</th>
                          <th className="p-3 text-center text-cyan-400 w-24">PENGGANTIAN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-[11px]">
                        {items.map((item, idx) => {
                          const row = tableRecords[item.id] || { layak: '', tidakLayak: '', lnb: '', penggantian: '' };
                          const prevStock = itemBeginningStocks[item.id]?.prevStock ?? 0;
                          return (
                            <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                              <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="p-3 font-black text-white uppercase tracking-wide">{item.description}</td>
                              
                              {/* Stok Awal */}
                              <td className="p-3 text-center font-bold text-amber-400 font-mono text-xs">
                                {prevStock}
                              </td>

                              {/* Layak Input */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={row.layak}
                                  onChange={(e) => handleCellChange(item.id, 'layak', e.target.value)}
                                  className="w-full px-2 py-1.5 bg-slate-900 border border-white/5 rounded-lg text-center text-emerald-400 text-xs font-bold focus:outline-none focus:border-emerald-500"
                                />
                              </td>

                              {/* Tidak Layak Input */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={row.tidakLayak}
                                  onChange={(e) => handleCellChange(item.id, 'tidakLayak', e.target.value)}
                                  className="w-full px-2 py-1.5 bg-slate-900 border border-white/5 rounded-lg text-center text-rose-400 text-xs font-bold focus:outline-none focus:border-rose-500"
                                />
                              </td>

                              {/* L&B Input */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={row.lnb}
                                  onChange={(e) => handleCellChange(item.id, 'lnb', e.target.value)}
                                  className="w-full px-2 py-1.5 bg-slate-900 border border-white/5 rounded-lg text-center text-red-400 text-xs font-bold focus:outline-none focus:border-red-500"
                                />
                              </td>

                              {/* Penggantian Input */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={row.penggantian}
                                  onChange={(e) => handleCellChange(item.id, 'penggantian', e.target.value)}
                                  className="w-full px-2 py-1.5 bg-slate-900 border border-white/5 rounded-lg text-center text-cyan-400 text-xs font-bold focus:outline-none focus:border-cyan-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => setShowPrintReview(true)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95"
                    >
                      <i className="fas fa-file-pdf"></i> PDF Print & Review
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider"
                    >
                      Simpan Semua Stock ({items.length} Barang)
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* Tab 2: Loan */}
          {activeTab === 'PINJAM' && (
            <form onSubmit={handleSaveLoan} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Pilih Nama Barang
                </label>
                <select
                  value={loanItemId}
                  onChange={(e) => setLoanItemId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold uppercase"
                >
                  <option value="">-- PILIH BARANG --</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>{item.description}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Nama Peminjam / Borrower
                </label>
                <input
                  type="text"
                  required
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="Contoh: Kitchen Team Bintaro"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Jumlah yang Dipinjam
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={borrowQty}
                  onChange={(e) => setBorrowQty(e.target.value)}
                  placeholder="Jumlah unit"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider"
                >
                  Simpan Peminjaman
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Return */}
          {activeTab === 'KEMBALI' && (
            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Pilih Catatan Peminjaman Aktif
                </label>
                <select
                  value={selectedLoanId}
                  onChange={(e) => setSelectedLoanId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold uppercase"
                >
                  <option value="">-- PILIH CATATAN PINJAM --</option>
                  {activeLoans.map(loan => {
                    const item = items.find(i => i.id === loan.itemId);
                    const sisa = loan.qty - (loan.returnQty || 0);
                    return (
                      <option key={loan.id} value={loan.id}>
                        {loan.borrower} - {item?.description} ({sisa} unit sisa)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Jumlah yang Dikembalikan
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  placeholder="Jumlah unit kembali"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider"
                >
                  Simpan Pengembalian
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Print & PDF Review Modal */}
      {showPrintReview && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
              <div>
                <h3 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-file-pdf text-rose-500"></i> Pratinjau Cetak / PDF
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tinjau & Simpan Laporan Logistik ke PDF</p>
              </div>
              <button 
                onClick={() => setShowPrintReview(false)}
                className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-lg transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Selector & Actions bar */}
            <div className="p-4 bg-slate-950/20 border-b border-white/5 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ukuran Kertas:</span>
                <select
                  value={printPaperSize}
                  onChange={(e) => setPrintPaperSize(e.target.value as '80MM' | 'A4')}
                  className="px-3 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-white text-xs font-bold uppercase focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="80MM">Thermal 80 C</option>
                  <option value="A4">Standar A4 (PDF / Laporan)</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPDF(printPaperSize)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shadow-lg cursor-pointer animate-pulse"
                >
                  <i className="fas fa-file-pdf"></i> Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintWithSize(printPaperSize)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shadow-lg cursor-pointer"
                >
                  <i className="fas fa-print"></i> Print Manual
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintReview(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Visual Paper Simulation Box */}
            <div className="p-6 overflow-y-auto bg-slate-950 flex-1 flex justify-center items-start min-h-[300px]">
              <div 
                id="print-logistic-paper-element"
                className="bg-white text-black p-6 rounded shadow-2xl transition-all duration-300 w-full max-w-[500px] min-h-[160mm] font-sans text-[10px]"
                style={{
                  fontFamily: printPaperSize === '80MM' ? '"Courier New", Courier, monospace' : 'system-ui, sans-serif'
                }}
              >
                {/* Simulated Paper Header */}
                <div className="text-center mb-4">
                  <div className="font-bold uppercase tracking-wider text-[12px] text-black font-extrabold bg-white">
                    INPUT OPERASIONAL LOGISTIK
                  </div>
                  <div className={`mt-2 border-b pb-2 text-[10px] text-black bg-white ${printPaperSize === '80MM' ? 'border-dashed border-black' : 'border-black'}`}>
                    <div>Tanggal Input: {inputDate}</div>
                    <div>Waktu Cetak: {new Date().toLocaleDateString('id-ID')} {new Date().toLocaleTimeString('id-ID')}</div>
                  </div>
                </div>

                  {/* Table */}
                <table className="w-full mt-4 border-collapse text-black text-[10px]">
                  <thead>
                    <tr className="bg-white text-black">
                      <th 
                        className={`text-left p-1.5 font-bold w-[52%] text-[10px] ${printPaperSize === '80MM' ? 'border-b border-t border-dashed border-black' : 'border-b-2 border-t border-black'}`}
                      >
                        NAMA BARANG
                      </th>
                      <th 
                        className={`text-center p-1.5 font-bold w-[16%] text-[10px] ${printPaperSize === '80MM' ? 'border-b border-t border-dashed border-black' : 'border-b-2 border-t border-black'}`}
                        style={{ borderLeft: printPaperSize === '80MM' ? '2px solid black' : '3px solid black' }}
                      >
                        STOK AWAL
                      </th>
                      <th 
                        className={`text-center p-1.5 font-bold w-[16%] text-[10px] ${printPaperSize === '80MM' ? 'border-b border-t border-dashed border-black' : 'border-b-2 border-t border-black'}`}
                        style={{ borderLeft: printPaperSize === '80MM' ? '1px dashed black' : '1px solid black' }}
                      >
                        FISIK
                      </th>
                      <th 
                        className={`text-center p-1.5 font-bold w-[16%] text-[10px] ${printPaperSize === '80MM' ? 'border-b border-t border-dashed border-black' : 'border-b-2 border-t border-black'}`}
                        style={{ borderLeft: printPaperSize === '80MM' ? '1px dashed black' : '1px solid black' }}
                      >
                        TIDAK LAYAK
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const row = tableRecords[item.id] || { layak: '', tidakLayak: '' };
                      const layakVal = (row.layak !== '' && row.layak !== '0' && row.layak !== 0) ? row.layak : '';
                      const tidakLayakVal = (row.tidakLayak !== '' && row.tidakLayak !== '0' && row.tidakLayak !== 0) ? row.tidakLayak : '';
                      const prevStockRaw = itemBeginningStocks[item.id]?.prevStock;
                      const prevStockVal = (prevStockRaw === undefined || prevStockRaw === null || prevStockRaw === 0 || prevStockRaw === '0') ? '' : prevStockRaw;
                      const rowClass = printPaperSize === '80MM' 
                        ? "border-b border-dashed border-black" 
                        : "bg-white border-b border-black";
                      return (
                        <tr key={item.id} className={rowClass}>
                          <td 
                            className="text-left p-1.5 uppercase font-medium text-black text-[10px]"
                          >
                            {item.description}
                          </td>
                          <td 
                            className="text-center p-1.5 font-bold font-mono text-black text-[10px]"
                            style={{ borderLeft: printPaperSize === '80MM' ? '2px solid black' : '3px solid black' }}
                          >
                            {prevStockVal}
                          </td>
                          <td 
                            className="text-center p-1.5 font-bold text-black text-[10px]"
                            style={{ borderLeft: printPaperSize === '80MM' ? '1px dashed black' : '1px solid black' }}
                          >
                            {layakVal}
                          </td>
                          <td 
                            className="text-center p-1.5 font-bold text-black text-[10px]"
                            style={{ borderLeft: printPaperSize === '80MM' ? '1px dashed black' : '1px solid black' }}
                          >
                            {tidakLayakVal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Footer on Paper */}
                <div className={`mt-8 pt-3 border-t text-center ${printPaperSize === '80MM' ? 'border-dashed border-black text-[8px]' : 'border-black text-[10px] text-black'}`}>
                  <div className="font-bold uppercase tracking-wider">Meningkatkan Kualitas & Akurasi</div>
                  <div>Printed from Logistics System</div>
                </div>
              </div>
            </div>
            
            {/* Direct Save-to-PDF Guide Footer */}
            <div className="p-3 bg-slate-950/60 border-t border-white/5 text-center text-[9px] text-indigo-300 font-bold uppercase tracking-wider">
              <i className="fas fa-info-circle mr-1"></i> Tips: Pilih "Simpan sebagai PDF" / "Save as PDF" pada tujuan pencetakan untuk mengunduh PDF.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent: StockOpnameModal
interface StockOpnameModalProps {
  itemsStats: any[];
  currentPeriod: PeriodInfo;
  selectedOutlet?: string;
  data: AppState;
  onUpdate: (updates: Partial<AppState>, isPriority?: boolean) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onClose: () => void;
}

const StockOpnameModal: React.FC<StockOpnameModalProps> = ({
  itemsStats,
  currentPeriod,
  selectedOutlet,
  data,
  onUpdate,
  showToast,
  onClose
}) => {
  const nextPeriodKey = getNextPeriodKey(currentPeriod.key);
  const nextPeriodInfo = getPeriodInfoFromKey(nextPeriodKey);
  const existingNextStocks = data.logisticBeginningStocks?.[nextPeriodKey] || {};

  const [opnameInputs, setOpnameInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    itemsStats.forEach(item => {
      if (existingNextStocks[item.id] !== undefined) {
        init[item.id] = String(existingNextStocks[item.id]);
      } else {
        init[item.id] = String(item.totalStock ?? item.bookStock ?? 0);
      }
    });
    return init;
  });

  const handleInputChange = (itemId: string, val: string) => {
    setOpnameInputs(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  const calculatedItems = useMemo(() => {
    return itemsStats.map(item => {
      const rawVal = opnameInputs[item.id];
      const fisikQty = rawVal !== undefined && rawVal !== '' ? Math.max(0, parseInt(rawVal, 10) || 0) : 0;
      const estimasiBuku = item.bookStock ?? (item.beginStock + item.penggantian - item.lnb);
      const calculatedLost = Math.max(0, estimasiBuku - fisikQty);
      const lostQty = Math.max(calculatedLost, item.lnb || 0);
      const price = item.price || 0;
      const lostValue = lostQty * price;
      const nextModalAwalValue = fisikQty * price;

      return {
        ...item,
        estimasiBuku,
        fisikQty,
        lostQty,
        lostValue,
        nextModalAwalValue
      };
    });
  }, [itemsStats, opnameInputs]);

  const totalFisikUnits = useMemo(() => calculatedItems.reduce((s, i) => s + i.fisikQty, 0), [calculatedItems]);
  const totalLostUnits = useMemo(() => calculatedItems.reduce((s, i) => s + i.lostQty, 0), [calculatedItems]);
  const totalLostValue = useMemo(() => calculatedItems.reduce((s, i) => s + i.lostValue, 0), [calculatedItems]);
  const totalNextModalAwalValue = useMemo(() => calculatedItems.reduce((s, i) => s + i.nextModalAwalValue, 0), [calculatedItems]);

  const handleSaveOpname = (e: React.FormEvent) => {
    e.preventDefault();

    const newNextStocks = { ...existingNextStocks };
    const currentDaily = { ...(data.dailyLogisticRecords || {}) };
    const opnameDate = currentPeriod.endDateStr; // Cut-off end date for active period (e.g. 2026-07-25)
    const recordsForOpnameDate = { ...(currentDaily[opnameDate] || {}) };

    calculatedItems.forEach(item => {
      newNextStocks[item.id] = item.fisikQty;

      // Save L&B in active logistics daily record for the cut-off date
      if (item.lostQty > 0 || recordsForOpnameDate[item.id]) {
        const existingRec = recordsForOpnameDate[item.id] || { layak: item.fisikQty, tidakLayak: 0, lnb: 0, penggantian: 0 };
        recordsForOpnameDate[item.id] = {
          ...existingRec,
          layak: item.fisikQty,
          lnb: item.lostQty
        };
      }
    });

    currentDaily[opnameDate] = recordsForOpnameDate;

    const updatedBeginningStocks = {
      ...(data.logisticBeginningStocks || {}),
      [nextPeriodKey]: newNextStocks
    };

    onUpdate({
      logisticBeginningStocks: updatedBeginningStocks,
      dailyLogisticRecords: currentDaily
    }, true);

    showToast(
      `Stock Opname periode ${currentPeriod.name} berhasil disimpan! ${totalLostUnits > 0 ? `L&B (${totalLostUnits} unit) tercatat di daftar logistik aktif. ` : ''}Total ${totalFisikUnits} unit ditetapkan sebagai Modal Awal bulan ${nextPeriodInfo.name}.`,
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-5xl bg-slate-900 rounded-3xl border border-white/10 overflow-hidden shadow-2xl transition-all animate-scale-up flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 bg-slate-950 border-b border-white/10 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-950/40">
                <i className="fas fa-clipboard-check text-lg"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase italic tracking-tight">
                  Stock Opname Logistik Bulanan
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  Hitung Hasil Fisik &amp; Kehilangan &rarr; Tetapkan Modal Awal Bulan Selanjutnya
                </p>
              </div>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/5 cursor-pointer"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Period & Outlet Summary Ribbon */}
        <div className="bg-slate-950/60 p-4 border-b border-white/5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">PERIODE OPNAME SEKARANG</span>
            <span className="text-sm font-black text-emerald-400 uppercase mt-0.5">{currentPeriod.name}</span>
            <span className="text-[8px] font-bold text-slate-400">Cut-Off: {currentPeriod.startDateStr} s/d {currentPeriod.endDateStr}</span>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">TARGET MODAL AWAL BULAN NEXT</span>
            <span className="text-sm font-black text-amber-400 uppercase mt-0.5">{nextPeriodInfo.name}</span>
            <span className="text-[8px] font-bold text-slate-400">Otomatis Terhubung ke Periode Selanjutnya</span>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">OUTLET LOGISTIK</span>
            <span className="text-sm font-black text-indigo-300 uppercase mt-0.5">{selectedOutlet || 'SEMUA OUTLET'}</span>
          </div>
        </div>

        {/* Form & Table */}
        <form onSubmit={handleSaveOpname} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4">
            <div className="overflow-x-auto border border-white/10 rounded-2xl bg-slate-950/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-950 text-[9px] font-black text-slate-400 tracking-widest uppercase sticky top-0 z-10">
                    <th className="p-3.5 w-12 text-center">NO</th>
                    <th className="p-3.5">NAMA BARANG</th>
                    <th className="p-3.5 text-right w-28">HARGA (RP)</th>
                    <th className="p-3.5 text-center w-24 text-amber-400">STOK AWAL</th>
                    <th className="p-3.5 text-center w-24 text-emerald-400">MASUK (+)</th>
                    <th className="p-3.5 text-center w-28 text-slate-300">ESTIMASI BUKU</th>
                    <th className="p-3.5 text-center w-32 text-cyan-400 bg-cyan-950/30 border-x border-cyan-500/20">
                      HASIL OPNAME FISIK
                    </th>
                    <th className="p-3.5 text-center w-28 text-rose-400">KEHILANGAN (L&B)</th>
                    <th className="p-3.5 text-right w-32 text-rose-400">KERUGIAN (RP)</th>
                    <th className="p-3.5 text-center w-36 text-amber-400 bg-amber-950/30 border-l border-amber-500/20">
                      MODAL AWAL NEXT
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px] font-medium">
                  {calculatedItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3 font-black text-white uppercase tracking-wide">
                        {item.description}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        Rp {item.price.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center font-bold text-amber-400 font-mono">
                        {item.beginStock}
                      </td>
                      <td className="p-3 text-center font-bold text-emerald-400 font-mono">
                        +{item.penggantian}
                      </td>
                      <td className="p-3 text-center font-black text-slate-200 font-mono">
                        {item.estimasiBuku}
                      </td>
                      
                      {/* Input Opname Fisik */}
                      <td className="p-2 bg-cyan-950/20 border-x border-cyan-500/20">
                        <input
                          type="number"
                          min="0"
                          value={opnameInputs[item.id] ?? ''}
                          onChange={(e) => handleInputChange(item.id, e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-cyan-500/40 rounded-xl text-center text-cyan-300 text-xs font-black focus:outline-none focus:border-cyan-400 shadow-inner font-mono"
                        />
                      </td>

                      {/* Kehilangan Count */}
                      <td className="p-3 text-center font-black font-mono text-rose-400">
                        {item.lostQty > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                            -{item.lostQty}
                          </span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* Kerugian Value */}
                      <td className="p-3 text-right font-mono font-bold text-rose-400">
                        {item.lostValue > 0 ? `Rp ${item.lostValue.toLocaleString('id-ID')}` : '-'}
                      </td>

                      {/* Modal Awal Next Month */}
                      <td className="p-3 text-center font-black font-mono text-amber-300 bg-amber-950/20 border-l border-amber-500/20">
                        <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
                          {item.fisikQty} Unit
                        </span>
                      </td>
                    </tr>
                  ))}
                  {calculatedItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 uppercase tracking-widest font-black italic">
                        Belum ada item logistik terdaftar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-cyan-500/20 flex flex-col">
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider">TOTAL BARANG LAYAK (FISIK)</span>
                <span className="text-xl font-black text-white font-mono mt-1">{totalFisikUnits.toLocaleString('id-ID')} <span className="text-xs text-cyan-400">UNIT</span></span>
                <span className="text-[8px] font-bold text-slate-400 mt-1">Hasil Opname Fisik Bulan Ini</span>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-rose-500/20 flex flex-col">
                <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider">TOTAL BARANG KEHILANGAN (L&B)</span>
                <span className="text-xl font-black text-rose-400 font-mono mt-1">{totalLostUnits.toLocaleString('id-ID')} <span className="text-xs">UNIT</span></span>
                <span className="text-[8px] font-bold text-slate-400 mt-1">Selisih Fisik vs Estimasi Buku</span>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-rose-500/20 flex flex-col">
                <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider">TOTAL NILAI KERUGIAN</span>
                <span className="text-xl font-black text-rose-300 font-mono mt-1">Rp {totalLostValue.toLocaleString('id-ID')}</span>
                <span className="text-[8px] font-bold text-slate-400 mt-1">Estimasi Kerugian Kehilangan Bulan Ini</span>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-amber-500/30 flex flex-col">
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">MODAL AWAL {nextPeriodInfo.name}</span>
                <span className="text-xl font-black text-amber-300 font-mono mt-1">Rp {totalNextModalAwalValue.toLocaleString('id-ID')}</span>
                <span className="text-[8px] font-bold text-slate-400 mt-1">Total Nilai Asset Modal Awal Periode Next</span>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-5 bg-slate-950 border-t border-white/10 flex flex-wrap justify-between items-center gap-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <i className="fas fa-info-circle text-amber-400"></i>
              Menyimpan Opname akan otomatis menetapkan jumlah fisik ini sebagai <span className="text-amber-400 font-black">Modal Awal Bulan {nextPeriodInfo.name}</span>.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer"
              >
                <i className="fas fa-save"></i>
                Simpan & Tetapkan Modal Awal {nextPeriodInfo.name.split(' ')[0]}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LogisticsModule;
