import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem } from '../types';
import { getOrderScheduleForOutlet } from '../constants';
import ShareActions from './ShareActions';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Props {
  data?: AppState;
  onUpdate?: (updater: (prev: AppState) => AppState) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  allMonthlyData?: Record<string, AppState>;
  filters?: any;
  selectedOutlet?: string;
}

const SUPPLIER_COLUMNS = [
  { id: 'mainStore', key: 'dailyMainStoreLedger', label: 'MAIN STORE' },
  { id: 'mainKitchen', key: 'dailyMainKitchenLedger', label: 'MAIN KITCHEN' },
  { id: 'cash', key: 'dailyCashLedger', label: 'CASH' },
  { id: 'saungKubil', key: 'dailySaungKubilLedger', label: 'SAUNG KUBIL' },
  { id: 'tgif', key: 'dailyTgifLedger', label: 'TGIF' },
  { id: 'panfila', key: 'dailyPanfilaLedger', label: 'PANFILA' },
  { id: 'everest', key: 'dailyEverestLedger', label: 'EVEREST' },
  { id: 'sukanda', key: 'dailySukandaLedger', label: 'SUKANDA' },
  { id: 'ikigai', key: 'dailyIkigaiLedger', label: 'IKIGAI' },
  { id: 'kebunku', key: 'dailyKebunkuLedger', label: 'KEBUNKU' }
] as const;

export interface DeductedExpenseItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  category: 'CHEMICAL' | 'STATIONARY' | 'MARKETING';
  subtotal: number;
  pic?: string;
  reason?: string;
}

export interface DailyReceivingRow {
  day: number;
  dateStr: string;
  revenue: number;
  costPct: number;
  totalCost: number;
  supplierCosts: Record<string, number>;
  grossMainStore: number;
  chemicalDeduction: number;
  stationaryDeduction: number;
  marketingDeduction: number;
  totalDeductions: number;
  deductedItems: DeductedExpenseItem[];
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const ReceivingSheetModule: React.FC<Props> = ({
  data,
  onUpdate,
  showToast,
  allMonthlyData,
  filters,
  selectedOutlet
}) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth()); // 0-indexed

  // Modal / Viewing state for daily entries (Read-Only)
  const [viewingDayRow, setViewingDayRow] = useState<DailyReceivingRow | null>(null);

  // Helper to format currency numbers
  const formatNum = (num: number) => {
    if (!num || num === 0) return '-';
    return num.toLocaleString('en-US');
  };

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // Monthly states collected based on selectedOutlet
  const monthlyStates = useMemo(() => {
    const list: AppState[] = [];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      if (allMonthlyData && (allMonthlyData as any)[selectedOutlet]) {
        const outletMap = (allMonthlyData as any)[selectedOutlet];
        const m = outletMap[String(selectedMonth)] || outletMap[selectedMonth];
        if (m) list.push(m);
      } else if (allMonthlyData && ((allMonthlyData as any)[String(selectedMonth)] || (allMonthlyData as any)[selectedMonth])) {
        const m = (allMonthlyData as any)[String(selectedMonth)] || (allMonthlyData as any)[selectedMonth];
        if (m) list.push(m);
      } else if (data && (!data.outlet || data.outlet === selectedOutlet)) {
        list.push(data);
      }
    } else {
      if (allMonthlyData) {
        Object.entries(allMonthlyData).forEach(([_, outletVal]: [string, any]) => {
          if (outletVal) {
            const m = outletVal[String(selectedMonth)] || outletVal[selectedMonth];
            if (m) list.push(m);
            else if (outletVal.sales || outletVal.expenses || outletVal.dailyMainStoreLedger || outletVal.dailyChemicalLedger) list.push(outletVal);
          }
        });
      }
      if (list.length === 0 && data) {
        list.push(data);
      }
    }
    return list;
  }, [selectedOutlet, allMonthlyData, selectedMonth, data]);

  // Combined daily data calculation for the selected month & year
  const dailyRows = useMemo(() => {
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const rows: DailyReceivingRow[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

      // Calculate Daily Revenue
      let revenue = 0;
      for (const st of monthlyStates) {
        if (st.sales?.dailyRecording?.[dateStr]) {
          const rec = st.sales.dailyRecording[dateStr];
          if (rec.revenue && rec.revenue > 0) {
            revenue += rec.revenue;
          } else {
            const revSum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
            if (revSum > 0) {
              revenue += revSum;
            }
          }
        }
      }

      // Calculate Chemical, Stationary, Marketing deductions for dateStr
      let dayChemTotal = 0;
      let dayStatTotal = 0;
      let dayMktTotal = 0;
      const dayDeductedItems: DeductedExpenseItem[] = [];

      for (const st of monthlyStates) {
        const chemLedger = st.dailyChemicalLedger?.[dateStr] as LedgerItem[];
        if (Array.isArray(chemLedger) && chemLedger.length > 0) {
          chemLedger.forEach(it => {
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const sub = qty * price;
            const cat = (it.category || 'CHEMICAL').toUpperCase() as 'CHEMICAL' | 'STATIONARY' | 'MARKETING';
            if (cat === 'STATIONARY') {
              dayStatTotal += sub;
            } else if (cat === 'MARKETING') {
              dayMktTotal += sub;
            } else {
              dayChemTotal += sub;
            }
            dayDeductedItems.push({
              id: it.id || `${cat}-${Math.random()}`,
              name: it.name || 'Item Belanja',
              qty,
              price,
              category: cat,
              subtotal: sub,
              pic: it.pic,
              reason: it.reason
            });
          });
        } else if (st.expenses?.[dateStr]) {
          // Fallback HANYA jika dicatat melalui modul Chemical, Stationary & Marketing (menggunakan stationary & marketing, BUKAN exp.atk dari Patty Cash)
          // PENTING: Belanja ATK & Chemical di Patty Cash (Kas Kecil) bersifat independen Opex dan TIDAK TERHUBUNG / TIDAK MENGURANGI Receiving Sheet.
          const exp = st.expenses[dateStr];
          const sVal = Number((exp as any).stationary) || 0; // Menggunakan stationary khusus, BUKAN exp.atk dari Patty Cash
          const mVal = Number((exp as any).marketing) || 0;
          if (sVal > 0 && dayStatTotal === 0) {
            dayStatTotal += sVal;
            dayDeductedItems.push({
              id: `stat-exp-${dateStr}`,
              name: 'Biaya Stationary / ATK (Modul Chemical & ATK)',
              qty: 1,
              price: sVal,
              category: 'STATIONARY',
              subtotal: sVal
            });
          }
          if (mVal > 0 && dayMktTotal === 0) {
            dayMktTotal += mVal;
            dayDeductedItems.push({
              id: `mkt-exp-${dateStr}`,
              name: 'Biaya Marketing (Modul Chemical & ATK)',
              qty: 1,
              price: mVal,
              category: 'MARKETING',
              subtotal: mVal
            });
          }
        }
      }

      const totalDeductionsForDay = dayChemTotal + dayStatTotal + dayMktTotal;

      // Calculate Supplier Costs
      const supplierCosts: Record<string, number> = {};
      let grossMainStoreForDay = 0;
      let totalCostForDay = 0;

      SUPPLIER_COLUMNS.forEach(sup => {
        let supCost = 0;
        for (const st of monthlyStates) {
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
            grossMainStoreForDay += grossStore;

            // Automatically deduct Chemical, Stationary, and Marketing from Main Store on the same date
            let netStore = grossStore;
            if (Array.isArray(storeList) && storeList.length > 0) {
              netStore = Math.max(0, grossStore - totalDeductionsForDay);
            } else if (grossStore > 0 && !st.expenses?.[dateStr]?.mainStore) {
              netStore = Math.max(0, grossStore - totalDeductionsForDay);
            }
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
            } else if (st.expenses?.[dateStr] && (st.expenses[dateStr] as any)[sup.id]) {
              supCost += Number((st.expenses[dateStr] as any)[sup.id]) || 0;
            }
          }
        }
        supplierCosts[sup.id] = supCost;
        totalCostForDay += supCost;
      });

      const costPct = revenue > 0 ? (totalCostForDay / revenue) * 100 : 0;

      rows.push({
        day,
        dateStr,
        revenue,
        costPct,
        totalCost: totalCostForDay,
        supplierCosts,
        grossMainStore: grossMainStoreForDay,
        chemicalDeduction: dayChemTotal,
        stationaryDeduction: dayStatTotal,
        marketingDeduction: dayMktTotal,
        totalDeductions: totalDeductionsForDay,
        deductedItems: dayDeductedItems
      });
    }

    return rows;
  }, [selectedYear, selectedMonth, daysInMonth, monthlyStates]);

  // Monthly totals
  const monthlyTotals = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    const supplierTotals: Record<string, number> = {};

    SUPPLIER_COLUMNS.forEach(sup => {
      supplierTotals[sup.id] = 0;
    });

    dailyRows.forEach(row => {
      totalRevenue += row.revenue;
      totalCost += row.totalCost;
      SUPPLIER_COLUMNS.forEach(sup => {
        supplierTotals[sup.id] += (row.supplierCosts[sup.id] || 0);
      });
    });

    const overallPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      supplierTotals,
      overallPct
    };
  }, [dailyRows]);

  // Auto ledger sums for Guest Supplies and Non Commodity
  const autoLedgerSums = useMemo(() => {
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    let guestSuppliesSum = 0;
    let nonCommoditySum = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

      for (const st of monthlyStates) {
        const gsList = st.dailyGuestSuppliesLedger?.[dateStr] as LedgerItem[];
        if (Array.isArray(gsList)) {
          guestSuppliesSum += gsList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }

        const ncList = st.dailyNonCommodityLedger?.[dateStr] as LedgerItem[];
        if (Array.isArray(ncList)) {
          nonCommoditySum += ncList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }

        if (st.expenses?.[dateStr]) {
          if (guestSuppliesSum === 0 && (st.expenses[dateStr] as any).guestSupplies) {
            guestSuppliesSum += Number((st.expenses[dateStr] as any).guestSupplies) || 0;
          }
          if (nonCommoditySum === 0 && st.expenses[dateStr].nonCommodity) {
            nonCommoditySum += Number(st.expenses[dateStr].nonCommodity) || 0;
          }
        }
      }
    }

    return { guestSuppliesSum, nonCommoditySum };
  }, [selectedYear, selectedMonth, daysInMonth, monthlyStates]);

  // Saved monthly COGS & inventory data
  const savedCogsData = useMemo(() => {
    if (data?.monthlyCogsData?.[monthKey]) {
      return data.monthlyCogsData[monthKey];
    }
    for (const st of monthlyStates) {
      if (st.monthlyCogsData?.[monthKey]) {
        return st.monthlyCogsData[monthKey];
      }
    }
    return {};
  }, [data, monthlyStates, monthKey]);

  // Inventory & COGS Calculations:
  // 1. Begin Inventory
  const beginningInventory = Number(savedCogsData.beginningInventory) || 0;
  // 2. Belanja (Actual Belanja from monthly Receiving Sheet total)
  const actualBelanja = monthlyTotals.totalCost;
  // 3. Ending Inventory
  const endingInventory = Number(savedCogsData.endingInventory) || 0;
  // 4. RND (Research & Development)
  const rnd = Number(savedCogsData.rnd) || 0;

  // Formula: TOTAL BARANG TERSEDIA = BEGIN INVENTORY + ACTUAL BELANJA - RND
  const totalBarangTersedia = beginningInventory + actualBelanja - rnd;

  // Formula: COGS ACTUAL = TOTAL BARANG TERSEDIA - ENDING INVENTORY
  const cogsActual = totalBarangTersedia - endingInventory;

  // Ratio COGS Actual vs Revenue
  const cogsRatio = monthlyTotals.totalRevenue > 0 ? (cogsActual / monthlyTotals.totalRevenue) * 100 : 0;

  // Budget Category Costs (5% of COGS ACTUAL distributed to 4 Categories):
  // 1. Guest Supplies (1%)
  const budgetGuestSupplies = Math.round(cogsActual * 0.01);
  const actualGuestSupplies = savedCogsData.actualGuestSupplies !== undefined
    ? Number(savedCogsData.actualGuestSupplies)
    : autoLedgerSums.guestSuppliesSum;
  const selisihGuestSupplies = actualGuestSupplies - budgetGuestSupplies;

  // 2. Spoiled (0.5%)
  const budgetSpoiled = Math.round(cogsActual * 0.005);
  const actualSpoiled = Number(savedCogsData.actualSpoiled) || 0;
  const selisihSpoiled = actualSpoiled - budgetSpoiled;

  // 3. Waste (2.5%)
  const budgetWaste = Math.round(cogsActual * 0.025);
  const actualWaste = Number(savedCogsData.actualWaste) || 0;
  const selisihWaste = actualWaste - budgetWaste;

  // 4. Non Commodity (1.0%)
  const budgetNonCommodity = Math.round(cogsActual * 0.01);
  const actualNonCommodity = savedCogsData.actualNonCommodity !== undefined
    ? Number(savedCogsData.actualNonCommodity)
    : autoLedgerSums.nonCommoditySum;
  const selisihNonCommodity = actualNonCommodity - budgetNonCommodity;

  // Totals for 4 Categories (5.0%)
  const totalBudgetCategory = Math.round(cogsActual * 0.05);
  const totalActualCategory = actualGuestSupplies + actualSpoiled + actualWaste + actualNonCommodity;
  const totalSelisihCategory = totalActualCategory - totalBudgetCategory;

  // Modals state for Inventory & 4 Category Actuals
  const [showInventoryModal, setShowInventoryModal] = useState<boolean>(false);
  const [inputBeginInv, setInputBeginInv] = useState<number>(0);
  const [inputEndingInv, setInputEndingInv] = useState<number>(0);
  const [inputRnd, setInputRnd] = useState<number>(0);

  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [inputActualGuestSupplies, setInputActualGuestSupplies] = useState<number>(0);
  const [inputActualSpoiled, setInputActualSpoiled] = useState<number>(0);
  const [inputActualWaste, setInputActualWaste] = useState<number>(0);
  const [inputActualNonCommodity, setInputActualNonCommodity] = useState<number>(0);

  // Open Inventory Modal
  const handleOpenInventoryModal = () => {
    setInputBeginInv(beginningInventory);
    setInputEndingInv(endingInventory);
    setInputRnd(rnd);
    setShowInventoryModal(true);
  };

  // Save Inventory & RND
  const handleSaveInventory = () => {
    if (!onUpdate) return;
    onUpdate(prev => {
      const next = { ...prev };
      if (!next.monthlyCogsData) next.monthlyCogsData = {};
      const existing = next.monthlyCogsData[monthKey] || {};
      next.monthlyCogsData[monthKey] = {
        ...existing,
        beginningInventory: inputBeginInv,
        endingInventory: inputEndingInv,
        rnd: inputRnd
      };
      return next;
    });
    showToast?.("Data Inventory & R&D berhasil diperbarui.", "success");
    setShowInventoryModal(false);
  };

  // Open 4 Category Modal
  const handleOpenCategoryModal = () => {
    setInputActualGuestSupplies(actualGuestSupplies);
    setInputActualSpoiled(actualSpoiled);
    setInputActualWaste(actualWaste);
    setInputActualNonCommodity(actualNonCommodity);
    setShowCategoryModal(true);
  };

  // Save 4 Category Actuals
  const handleSaveCategoryActual = () => {
    if (!onUpdate) return;
    onUpdate(prev => {
      const next = { ...prev };
      if (!next.monthlyCogsData) next.monthlyCogsData = {};
      const existing = next.monthlyCogsData[monthKey] || {};
      next.monthlyCogsData[monthKey] = {
        ...existing,
        actualGuestSupplies: inputActualGuestSupplies,
        actualSpoiled: inputActualSpoiled,
        actualWaste: inputActualWaste,
        actualNonCommodity: inputActualNonCommodity
      };
      return next;
    });
    showToast?.("Data Realisasi 4 Kategori Cost berhasil diperbarui.", "success");
    setShowCategoryModal(false);
  };

  // Calculate item breakdown for selected viewing day (Read-Only)
  const viewingDayItems = useMemo(() => {
    if (!viewingDayRow) return [];
    const dateStr = viewingDayRow.dateStr;
    const result: {
      supplierId: string;
      supplierLabel: string;
      items: LedgerItem[];
      total: number;
      grossTotal?: number;
      deductions?: {
        total: number;
        chemical: number;
        stationary: number;
        marketing: number;
        items: DeductedExpenseItem[];
      };
    }[] = [];

    SUPPLIER_COLUMNS.forEach(sup => {
      const list: LedgerItem[] = [];
      for (const st of monthlyStates) {
        if (sup.id === 'cash') {
          const c1 = st.dailyCashLedger?.[dateStr] as LedgerItem[];
          if (Array.isArray(c1)) list.push(...c1);
          const c2 = st.dailyCommodityLedger?.[dateStr] as LedgerItem[];
          if (Array.isArray(c2)) list.push(...c2);
        } else {
          const l = (st as any)[sup.key]?.[dateStr] as LedgerItem[];
          if (Array.isArray(l)) list.push(...l);
        }
      }
      const dayCost = viewingDayRow.supplierCosts[sup.id] || 0;

      if (sup.id === 'mainStore') {
        const grossSum = list.length > 0 
          ? list.reduce((a, b) => a + ((Number(b.qty) || 1) * (Number(b.price) || 0)), 0)
          : (viewingDayRow.grossMainStore || dayCost);

        const hasDeductions = viewingDayRow.totalDeductions > 0;

        if (list.length > 0 || dayCost > 0 || hasDeductions) {
          result.push({
            supplierId: sup.id,
            supplierLabel: sup.label,
            items: list,
            total: dayCost,
            grossTotal: grossSum,
            deductions: hasDeductions ? {
              total: viewingDayRow.totalDeductions,
              chemical: viewingDayRow.chemicalDeduction,
              stationary: viewingDayRow.stationaryDeduction,
              marketing: viewingDayRow.marketingDeduction,
              items: viewingDayRow.deductedItems
            } : undefined
          });
        }
      } else {
        if (list.length > 0 || dayCost > 0) {
          const sum = list.length > 0 
            ? list.reduce((a, b) => a + ((Number(b.qty) || 1) * (Number(b.price) || 0)), 0)
            : dayCost;
          result.push({
            supplierId: sup.id,
            supplierLabel: sup.label,
            items: list,
            total: sum
          });
        }
      }
    });

    return result;
  }, [viewingDayRow, monthlyStates]);

  // Export Table to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('RECEIVING SHEET');

      // Title header
      worksheet.mergeCells('A1:N1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `RECEIVING SHEET - ${MONTH_NAMES[selectedMonth].toUpperCase()} ${selectedYear}`;
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.addRow([]); // Blank row

      // Header row
      const headers = ['TANGGAL', 'REVENUE', '%', 'COST', ...SUPPLIER_COLUMNS.map(s => s.label)];
      const headerRow = worksheet.addRow(headers);
      
      // Style Header
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colNumber <= 4) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } }; // Yellow accent
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // Gray
        }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Rows for days
      dailyRows.forEach(row => {
        const rowVals = [
          row.day,
          row.revenue || '',
          row.revenue > 0 ? (row.costPct / 100) : 0,
          row.totalCost || '',
          ...SUPPLIER_COLUMNS.map(s => row.supplierCosts[s.id] || '')
        ];
        const r = worksheet.addRow(rowVals);

        r.eachCell((cell, colNumber) => {
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };

          if (colNumber === 1) {
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEEFA3' } };
            cell.font = { name: 'Arial', size: 9, bold: true };
          } else if (colNumber === 2 || colNumber === 4) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEEFA3' } };
          } else if (colNumber === 3) {
            cell.numFmt = '0%';
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEEFA3' } };
          } else {
            if (typeof cell.value === 'number') {
              cell.numFmt = '#,##0';
              cell.alignment = { horizontal: 'right' };
            } else {
              cell.alignment = { horizontal: 'center' };
            }
          }
        });
      });

      // Total Row
      const totalVals = [
        'TOTAL',
        monthlyTotals.totalRevenue,
        monthlyTotals.totalRevenue > 0 ? (monthlyTotals.overallPct / 100) : 0,
        monthlyTotals.totalCost,
        ...SUPPLIER_COLUMNS.map(s => monthlyTotals.supplierTotals[s.id] || 0)
      ];
      const totRow = worksheet.addRow(totalVals);

      totRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } }; // Yellow total
        cell.border = {
          top: { style: 'medium' },
          left: { style: 'thin' },
          bottom: { style: 'medium' },
          right: { style: 'thin' }
        };

        if (colNumber === 1) {
          cell.alignment = { horizontal: 'center' };
        } else if (colNumber === 2 || colNumber === 4 || colNumber > 4) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if (colNumber === 3) {
          cell.numFmt = '0%';
          cell.alignment = { horizontal: 'center' };
        }
      });

      worksheet.addRow([]); // Blank

      // COST BELANJA Summary Row below
      const costBelanjaRow = worksheet.addRow(['COST BELANJA REALISASI', `${monthlyTotals.overallPct.toFixed(2)}%`]);
      costBelanjaRow.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      costBelanjaRow.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
      costBelanjaRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };

      worksheet.addRow([]); // Blank

      // ==========================================
      // SECTION 1: INVENTORY & COGS ACTUAL TABLE IN EXCEL
      // ==========================================
      const invTitleRow = worksheet.addRow(['REKAPITULASI INVENTORY & COGS ACTUAL']);
      invTitleRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
      invTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };

      const invHeader = worksheet.addRow(['KOMPONEN', 'NOMINAL (RP)', 'KETERANGAN / FORMULA']);
      invHeader.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });

      const invData = [
        ['BEGIN INVENTORY', beginningInventory, 'Nilai Persediaan Awal (+)'],
        ['BELANJA (ACTUAL)', actualBelanja, 'Total Belanja Supplier MTD (+)'],
        ['RND (RESEARCH & DEV)', rnd, 'Pengeluaran Trial & Research (-)'],
        ['TOTAL BARANG TERSEDIA', totalBarangTersedia, 'Begin Inventory + Belanja - RND (=)'],
        ['ENDING INVENTORY', endingInventory, 'Nilai Persediaan Akhir (-)'],
        ['COGS ACTUAL', cogsActual, 'Total Barang Tersedia - Ending Inventory (=)'],
        ['% COGS ACTUAL / REVENUE', monthlyTotals.totalRevenue > 0 ? (cogsActual / monthlyTotals.totalRevenue) : 0, 'Rasio COGS Actual terhadap Total Revenue']
      ];

      invData.forEach((d, idx) => {
        const r = worksheet.addRow(d);
        const isHighlight = idx === 3 || idx === 5;
        r.eachCell((cell, colIdx) => {
          cell.font = { name: 'Arial', size: 9, bold: isHighlight };
          cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
          if (isHighlight) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx === 5 ? 'FFFDE047' : 'FFFEEFA3' } };
          }
          if (colIdx === 2) {
            if (idx === 6) {
              cell.numFmt = '0.00%';
              cell.alignment = { horizontal: 'right' };
            } else {
              cell.numFmt = '#,##0';
              cell.alignment = { horizontal: 'right' };
            }
          }
        });
      });

      worksheet.addRow([]); // Blank

      // ==========================================
      // SECTION 2: BUDGET CATEGORY COST (5% COGS ACTUAL) VS ACTUAL
      // ==========================================
      const catTitleRow = worksheet.addRow(['BUDGET CATEGORY COST (5% DARI COGS ACTUAL) & REALISASI']);
      catTitleRow.getCell(1).font = { name: 'Arial', size: 11, bold: true };
      catTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };

      const catHeader = worksheet.addRow(['KATEGORI COST', 'ALOKASI (%)', 'BUDGET (RP)', 'ACTUAL (RP)', 'ACTUAL (%)', 'SELISIH (RP)', 'STATUS']);
      catHeader.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });

      const catData = [
        ['GUEST SUPPLIES', 0.01, budgetGuestSupplies, actualGuestSupplies, cogsActual > 0 ? actualGuestSupplies / cogsActual : 0, selisihGuestSupplies, selisihGuestSupplies <= 0 ? 'HEMAT' : 'OVER BUDGET'],
        ['SPOILED', 0.005, budgetSpoiled, actualSpoiled, cogsActual > 0 ? actualSpoiled / cogsActual : 0, selisihSpoiled, selisihSpoiled <= 0 ? 'AMAN' : 'OVER BUDGET'],
        ['WASTE', 0.025, budgetWaste, actualWaste, cogsActual > 0 ? actualWaste / cogsActual : 0, selisihWaste, selisihWaste <= 0 ? 'AMAN' : 'OVER BUDGET'],
        ['NON COMMODITY', 0.01, budgetNonCommodity, actualNonCommodity, cogsActual > 0 ? actualNonCommodity / cogsActual : 0, selisihNonCommodity, selisihNonCommodity <= 0 ? 'HEMAT' : 'OVER BUDGET']
      ];

      catData.forEach(d => {
        const r = worksheet.addRow(d);
        r.eachCell((cell, colIdx) => {
          cell.font = { name: 'Arial', size: 9 };
          cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
          if (colIdx === 1) {
            cell.font = { name: 'Arial', size: 9, bold: true };
          } else if (colIdx === 2 || colIdx === 5) {
            cell.numFmt = '0.00%';
            cell.alignment = { horizontal: 'center' };
          } else if (colIdx === 3 || colIdx === 4 || colIdx === 6) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right' };
          } else if (colIdx === 7) {
            cell.alignment = { horizontal: 'center' };
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: d[6] === 'OVER BUDGET' ? 'FFEF4444' : 'FF10B981' } };
          }
        });
      });

      // Total Cat Row
      const totCatRow = worksheet.addRow([
        'TOTAL BUDGET CATEGORY (5%)',
        0.05,
        totalBudgetCategory,
        totalActualCategory,
        cogsActual > 0 ? totalActualCategory / cogsActual : 0,
        totalSelisihCategory,
        totalSelisihCategory <= 0 ? 'HEMAT' : 'OVER BUDGET'
      ]);
      totCatRow.eachCell((cell, i) => {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } };
        cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
        if (i === 2 || i === 5) {
          cell.numFmt = '0.00%';
          cell.alignment = { horizontal: 'center' };
        } else if (i === 3 || i === 4 || i === 6) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if (i === 7) {
          cell.alignment = { horizontal: 'center' };
        }
      });

      // Set column widths
      worksheet.columns.forEach((column, i) => {
        if (i === 0) column.width = 24;
        else if (i === 1 || i === 3) column.width = 16;
        else if (i === 2) column.width = 14;
        else if (i === 4) column.width = 14;
        else if (i === 5) column.width = 16;
        else column.width = 16;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer]),
        `Receiving_Sheet_${MONTH_NAMES[selectedMonth]}_${selectedYear}.xlsx`
      );
      showToast?.("Berhasil mengunduh Excel Receiving Sheet & COGS Analysis.", "success");
    } catch (err) {
      console.error(err);
      showToast?.("Gagal mengunduh Excel.", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in no-blur" id="receiving-sheet-module-container">
      {/* HEADER SECTION & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <i className="fas fa-file-invoice-dollar text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  RECEIVING SHEET
                </h2>
                {selectedOutlet && selectedOutlet !== 'ALL' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 font-mono text-[10px] font-black uppercase">
                    Hari Order: {getOrderScheduleForOutlet(selectedOutlet).label}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                Laporan Belanja, Inventory & COGS Actual {selectedOutlet && selectedOutlet !== 'ALL' ? `(${selectedOutlet})` : ''} ({MONTH_NAMES[selectedMonth]} {selectedYear})
              </p>
            </div>
          </div>
        </div>

        {/* MONTH & YEAR SELECTOR + ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-950 border border-white/10 rounded-2xl p-1.5 gap-2">
            <i className="fas fa-calendar-alt text-amber-400 ml-2 text-xs"></i>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-xs font-black text-white outline-none cursor-pointer uppercase pr-2"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={idx} value={idx} className="bg-slate-900 text-white">
                  {m}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-black text-white outline-none cursor-pointer pr-2"
            >
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                <option key={y} value={y} className="bg-slate-900 text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black text-xs uppercase tracking-wider flex items-center gap-2">
            <i className="fas fa-lock text-amber-400"></i>
            <span>Belanja Auto-Sync</span>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center gap-2 border border-emerald-400/30"
          >
            <i className="fas fa-file-excel"></i>
            Export Excel
          </button>

          <ShareActions
            targetId="receiving-sheet-module-container"
            title={`Receiving Sheet ${MONTH_NAMES[selectedMonth]} ${selectedYear}`}
          />
        </div>
      </div>

      {/* NOTICE BANNER: BELANJA FROZEN & CATEGORY COST ACTIVE */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-indigo-500/15 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
            <i className="fas fa-lock text-sm"></i>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase text-amber-300 tracking-wider">
                Kolom Belanja Dibekukan (Auto-Sync)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase border border-emerald-500/30">
                Fitur Input Modul Aktif
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Semua angka belanja ditarik otomatis dari fitur input modul masing-masing (Supplier Expense, Petty Cash, Main Store/Kitchen, & Daily Revenue). Penginputan <strong>Category Cost</strong> & <strong>Inventory Opname</strong> tetap dapat diisi di bagian bawah.
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenCategoryModal}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-indigo-600/20"
        >
          <i className="fas fa-pen-to-square"></i>
          Input Category Cost
        </button>
      </div>

      {/* SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-xl space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <i className="fas fa-cash-register text-emerald-400"></i> Total Revenue MTD
          </span>
          <p className="text-xl font-black text-emerald-400 font-mono">
            Rp {monthlyTotals.totalRevenue.toLocaleString('id-ID')}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-xl space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <i className="fas fa-shopping-cart text-amber-400"></i> Total Cost Belanja
          </span>
          <p className="text-xl font-black text-amber-400 font-mono">
            Rp {monthlyTotals.totalCost.toLocaleString('id-ID')}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/30 bg-amber-500/5 shadow-xl space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
            <i className="fas fa-boxes-stacked text-amber-400"></i> COGS Actual
          </span>
          <p className="text-2xl font-black text-amber-300 font-mono">
            Rp {cogsActual.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] font-bold text-slate-400 block">
            {cogsRatio.toFixed(2)}% dari Total Revenue
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-xl space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <i className="fas fa-pie-chart text-indigo-400"></i> Total Budget 4 Kategori (5%)
          </span>
          <p className="text-xl font-black text-white font-mono">
            Rp {totalBudgetCategory.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] font-bold text-slate-400 block">
            Actual: Rp {totalActualCategory.toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* RECEIVING SHEET TABLE */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-white/10 shadow-2xl space-y-6 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              {/* MAIN HEADER */}
              <tr className="border-b-2 border-slate-700">
                <th className="p-3 text-center bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border border-amber-300/40 w-16">
                  TANGGAL
                </th>
                <th className="p-3 text-center bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border border-amber-300/40 w-36">
                  REVENUE
                </th>
                <th className="p-3 text-center bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border border-amber-300/40 w-16">
                  %
                </th>
                <th className="p-3 text-center bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border border-amber-300/40 w-32">
                  COST
                </th>
                {SUPPLIER_COLUMNS.map(sup => (
                  <th key={sup.id} className="p-3 text-center bg-slate-800 text-slate-200 font-black text-[11px] uppercase tracking-wider border border-white/10">
                    {sup.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(row => (
                <tr
                  key={row.day}
                  onClick={() => setViewingDayRow(row)}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                  title="Klik untuk melihat rincian belanja (Read-Only)"
                >
                  {/* TANGGAL */}
                  <td className="p-2.5 text-center font-black text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20">
                    <div className="flex items-center justify-center gap-1">
                      <span>{row.day}</span>
                      <i className="fas fa-eye text-[9px] text-amber-400/60 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                  </td>

                  {/* REVENUE */}
                  <td className="p-2.5 text-right font-mono text-xs font-bold text-amber-200 bg-amber-500/5 border border-amber-500/20">
                    {formatNum(row.revenue)}
                  </td>

                  {/* PERCENTAGE */}
                  <td className="p-2.5 text-center font-mono text-xs font-bold text-amber-300 bg-amber-500/5 border border-amber-500/20">
                    {row.revenue > 0 ? `${Math.round(row.costPct)}%` : '0%'}
                  </td>

                  {/* COST */}
                  <td className="p-2.5 text-right font-mono text-xs font-black text-amber-300 bg-amber-500/10 border border-amber-500/20">
                    {formatNum(row.totalCost)}
                  </td>

                  {/* SUPPLIER COLUMNS */}
                  {SUPPLIER_COLUMNS.map(sup => {
                    const val = row.supplierCosts[sup.id] || 0;
                    const isMainStore = sup.id === 'mainStore';
                    const hasDeductions = isMainStore && row.totalDeductions > 0;

                    return (
                      <td
                        key={sup.id}
                        className={`p-2.5 text-right font-mono text-xs border border-white/5 ${
                          val > 0 ? 'text-white font-bold' : 'text-slate-600 font-normal'
                        }`}
                      >
                        {hasDeductions ? (
                          <div className="flex flex-col items-end">
                            <span className="text-white font-bold">{formatNum(val)}</span>
                            <span
                              className="text-[9px] font-semibold text-cyan-400 font-sans tracking-tight flex items-center gap-0.5 cursor-help"
                              title={`Main Store Gross: Rp ${formatNum(row.grossMainStore)} | Dipotong (Chemical/Stationary/Marketing): -Rp ${formatNum(row.totalDeductions)}`}
                            >
                              <i className="fas fa-cut text-[8px]"></i>
                              -{formatNum(row.totalDeductions)}
                            </span>
                          </div>
                        ) : (
                          formatNum(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* TOTAL ROW */}
              <tr className="border-t-2 border-amber-400 bg-amber-400 text-slate-950 font-black">
                <td className="p-3 text-center font-black text-xs uppercase tracking-wider border border-amber-300">
                  TOTAL
                </td>
                <td className="p-3 text-right font-mono text-xs font-black border border-amber-300">
                  {monthlyTotals.totalRevenue.toLocaleString('en-US')}
                </td>
                <td className="p-3 text-center font-mono text-xs font-black border border-amber-300">
                  {monthlyTotals.totalRevenue > 0 ? `${Math.round(monthlyTotals.overallPct)}%` : '0%'}
                </td>
                <td className="p-3 text-right font-mono text-xs font-black border border-amber-300">
                  {monthlyTotals.totalCost.toLocaleString('en-US')}
                </td>
                {SUPPLIER_COLUMNS.map(sup => (
                  <td key={sup.id} className="p-3 text-right font-mono text-xs font-black border border-amber-300">
                    {monthlyTotals.supplierTotals[sup.id] > 0
                      ? monthlyTotals.supplierTotals[sup.id].toLocaleString('en-US')
                      : '-'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* BOTTOM LEFT COST BELANJA SUMMARY BOX */}
        <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 bg-amber-400 text-slate-950 px-6 py-3 rounded-2xl shadow-xl border border-amber-300">
            <span className="font-black text-xs uppercase tracking-wider">
              COST BELANJA REALISASI
            </span>
            <span className="font-mono text-xl font-black">
              {monthlyTotals.overallPct.toFixed(2)}%
            </span>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <i className="fas fa-lock text-amber-400"></i>
            <span>
              Kolom belanja Receiving Sheet dibekukan & tersinkronisasi otomatis dari Modul Input masing-masing. Klik baris tanggal untuk melihat rincian (Read-Only).
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. REKAPITULASI INVENTORY & COGS ACTUAL TABLE */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <i className="fas fa-boxes-stacked text-base"></i>
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-tight">
                  REKAPITULASI INVENTORY & COGS ACTUAL
                </h3>
                <p className="text-xs text-slate-400">
                  Perhitungan Total Barang Tersedia dan COGS Actual berdasarkan Begin/Ending Inventory, Belanja, dan R&D.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleOpenInventoryModal}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center gap-2 self-start md:self-auto border border-amber-300/40"
          >
            <i className="fas fa-pen-to-square"></i>
            Input / Edit Inventory & RND
          </button>
        </div>

        {/* Formula Summary Badges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs font-black">
              1
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                RUMUS TOTAL BARANG TERSEDIA
              </span>
              <span className="text-xs font-mono font-bold text-blue-300">
                BEGIN INVENTORY (+) BELANJA (-) RND = TOTAL BARANG TERSEDIA
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-black">
              2
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                RUMUS COGS ACTUAL
              </span>
              <span className="text-xs font-mono font-bold text-emerald-300">
                TOTAL BARANG TERSEDIA (-) ENDING INVENTORY = COGS ACTUAL
              </span>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b-2 border-slate-700">
                <th className="p-3 bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-1/3">
                  KOMPONEN INVENTORY / COST
                </th>
                <th className="p-3 text-right bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-1/4">
                  NOMINAL (RP)
                </th>
                <th className="p-3 text-center bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-24">
                  OPERASI
                </th>
                <th className="p-3 bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10">
                  KETERANGAN / FORMULA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* 1. BEGIN INVENTORY */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-box-open text-blue-400"></i> BEGIN INVENTORY
                </td>
                <td className="p-3 text-right font-mono text-sm font-black text-blue-300">
                  Rp {beginningInventory.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    (+) TAMBAH
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  Nilai persediaan barang pada awal periode bulan ini.
                </td>
              </tr>

              {/* 2. BELANJA */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-shopping-cart text-amber-400"></i> BELANJA (ACTUAL BELANJA MTD)
                </td>
                <td className="p-3 text-right font-mono text-sm font-black text-amber-300">
                  Rp {actualBelanja.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    (+) TAMBAH
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  Total realisasi penerimaan / belanja barang supplier bulan berjalan.
                </td>
              </tr>

              {/* 3. RND */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-flask text-purple-400"></i> RND (RESEARCH & DEVELOPMENT)
                </td>
                <td className="p-3 text-right font-mono text-sm font-black text-purple-300">
                  Rp {rnd.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    (-) KURANG
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  Pengeluaran barang untuk uji coba resep / Research & Development.
                </td>
              </tr>

              {/* 4. TOTAL BARANG TERSEDIA (HIGHLIGHT) */}
              <tr className="bg-amber-500/10 border-y-2 border-amber-500/30">
                <td className="p-3.5 text-xs font-black text-amber-300 flex items-center gap-2">
                  <i className="fas fa-warehouse text-amber-400"></i> TOTAL BARANG TERSEDIA
                </td>
                <td className="p-3.5 text-right font-mono text-base font-black text-amber-300">
                  Rp {totalBarangTersedia.toLocaleString('id-ID')}
                </td>
                <td className="p-3.5 text-center">
                  <span className="px-2.5 py-1 rounded text-xs font-black bg-amber-400 text-slate-950">
                    (=) HASIL
                  </span>
                </td>
                <td className="p-3.5 text-xs font-bold text-amber-200 font-mono">
                  = Begin Inventory + Belanja - RND
                </td>
              </tr>

              {/* 5. ENDING INVENTORY */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-archive text-rose-400"></i> ENDING INVENTORY
                </td>
                <td className="p-3 text-right font-mono text-sm font-black text-rose-300">
                  Rp {endingInventory.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    (-) KURANG
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  Nilai stok fisik opname pada akhir periode bulan berjalan.
                </td>
              </tr>

              {/* 6. COGS ACTUAL (GRAND TOTAL HIGHLIGHT) */}
              <tr className="bg-amber-400 text-slate-950 font-black border-t-2 border-amber-300">
                <td className="p-4 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-calculator text-slate-950 text-base"></i> COGS ACTUAL
                </td>
                <td className="p-4 text-right font-mono text-lg font-black text-slate-950">
                  Rp {cogsActual.toLocaleString('id-ID')}
                </td>
                <td className="p-4 text-center">
                  <span className="px-2.5 py-1 rounded text-xs font-black bg-slate-950 text-amber-400">
                    (=) COGS
                  </span>
                </td>
                <td className="p-4 text-xs font-black text-slate-900 font-mono">
                  = Total Barang Tersedia - Ending Inventory ({cogsRatio.toFixed(2)}% of Revenue)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BUDGET CATEGORY COST (5% DARI COGS ACTUAL) & VARIANCE ANALYSIS */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <i className="fas fa-chart-pie text-base"></i>
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                  BUDGET CATEGORY COST (5% DARI COGS ACTUAL)
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Total 5.00%
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Alokasi 5% dari COGS Actual ke 4 kategori (Guest Supplies 1%, Spoiled 0.5%, Waste 2.5%, Non Commodity 1%) dan perbandingan realisasi input.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleOpenCategoryModal}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2 self-start md:self-auto border border-emerald-400/40"
          >
            <i className="fas fa-plus-circle"></i>
            Input Actual 4 Kategori
          </button>
        </div>

        {/* Category Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Guest Supplies */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <i className="fas fa-concierge-bell text-blue-400"></i> GUEST SUPPLIES
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  1.0%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Budget:</span>
                  <span className="font-mono font-bold text-white">Rp {budgetGuestSupplies.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Actual Input:</span>
                  <span className="font-mono font-bold text-blue-300">Rp {actualGuestSupplies.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-slate-400">Selisih:</span>
                  <span className={`font-mono font-black ${selisihGuestSupplies <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selisihGuestSupplies <= 0 ? '-' : '+'} Rp {Math.abs(selisihGuestSupplies).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleOpenCategoryModal}
              className="w-full py-1.5 px-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/30 text-blue-300 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <i className="fas fa-pen-to-square text-[9px]"></i> Actual Input
            </button>
          </div>

          {/* Card 2: Spoiled */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <i className="fas fa-ban text-amber-400"></i> SPOILED
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  0.5%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Budget:</span>
                  <span className="font-mono font-bold text-white">Rp {budgetSpoiled.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Actual Input:</span>
                  <span className="font-mono font-bold text-amber-300">Rp {actualSpoiled.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-slate-400">Selisih:</span>
                  <span className={`font-mono font-black ${selisihSpoiled <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selisihSpoiled <= 0 ? '-' : '+'} Rp {Math.abs(selisihSpoiled).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleOpenCategoryModal}
              className="w-full py-1.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <i className="fas fa-pen-to-square text-[9px]"></i> Actual Input
            </button>
          </div>

          {/* Card 3: Waste */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <i className="fas fa-trash-alt text-rose-400"></i> WASTE
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  2.5%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Budget:</span>
                  <span className="font-mono font-bold text-white">Rp {budgetWaste.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Actual Input:</span>
                  <span className="font-mono font-bold text-rose-300">Rp {actualWaste.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-slate-400">Selisih:</span>
                  <span className={`font-mono font-black ${selisihWaste <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selisihWaste <= 0 ? '-' : '+'} Rp {Math.abs(selisihWaste).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleOpenCategoryModal}
              className="w-full py-1.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <i className="fas fa-pen-to-square text-[9px]"></i> Actual Input
            </button>
          </div>

          {/* Card 4: Non Commodity */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <i className="fas fa-receipt text-indigo-400"></i> NON COMMODITY
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  1.0%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Budget:</span>
                  <span className="font-mono font-bold text-white">Rp {budgetNonCommodity.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Actual Input:</span>
                  <span className="font-mono font-bold text-indigo-300">Rp {actualNonCommodity.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                  <span className="text-slate-400">Selisih:</span>
                  <span className={`font-mono font-black ${selisihNonCommodity <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selisihNonCommodity <= 0 ? '-' : '+'} Rp {Math.abs(selisihNonCommodity).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleOpenCategoryModal}
              className="w-full py-1.5 px-3 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-300 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <i className="fas fa-pen-to-square text-[9px]"></i> Actual Input
            </button>
          </div>
        </div>

        {/* Category Cost Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="border-b-2 border-slate-700">
                <th className="p-3 bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10">
                  KATEGORI COST
                </th>
                <th className="p-3 text-center bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-24">
                  ALOKASI
                </th>
                <th className="p-3 text-right bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-32">
                  BUDGET COST
                </th>
                <th className="p-3 text-right bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-32">
                  ACTUAL INPUT
                </th>
                <th className="p-3 text-center bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-24">
                  ACTUAL (%)
                </th>
                <th className="p-3 text-right bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-32">
                  SELISIH
                </th>
                <th className="p-3 text-center bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-28">
                  STATUS
                </th>
                <th className="p-3 text-center bg-slate-800 text-slate-200 font-black text-xs uppercase tracking-wider border border-white/10 w-28">
                  AKSI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* 1. GUEST SUPPLIES */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-concierge-bell text-blue-400"></i> GUEST SUPPLIES
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-blue-300">
                  1.00%
                </td>
                <td className="p-3 text-right font-mono text-xs font-bold text-white">
                  Rp {budgetGuestSupplies.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-right font-mono text-xs font-black text-blue-300">
                  Rp {actualGuestSupplies.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-slate-300">
                  {cogsActual > 0 ? ((actualGuestSupplies / cogsActual) * 100).toFixed(2) : '0.00'}%
                </td>
                <td className={`p-3 text-right font-mono text-xs font-black ${selisihGuestSupplies <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selisihGuestSupplies <= 0 ? '-' : '+'} Rp {Math.abs(selisihGuestSupplies).toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    selisihGuestSupplies <= 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {selisihGuestSupplies <= 0 ? 'HEMAT' : 'OVER'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={handleOpenCategoryModal}
                    className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 text-[10px] font-black uppercase transition-all"
                  >
                    Actual Input
                  </button>
                </td>
              </tr>

              {/* 2. SPOILED */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-ban text-amber-400"></i> SPOILED
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-amber-300">
                  0.50%
                </td>
                <td className="p-3 text-right font-mono text-xs font-bold text-white">
                  Rp {budgetSpoiled.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-right font-mono text-xs font-black text-amber-300">
                  Rp {actualSpoiled.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-slate-300">
                  {cogsActual > 0 ? ((actualSpoiled / cogsActual) * 100).toFixed(2) : '0.00'}%
                </td>
                <td className={`p-3 text-right font-mono text-xs font-black ${selisihSpoiled <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selisihSpoiled <= 0 ? '-' : '+'} Rp {Math.abs(selisihSpoiled).toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    selisihSpoiled <= 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {selisihSpoiled <= 0 ? 'HEMAT' : 'OVER'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={handleOpenCategoryModal}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase transition-all"
                  >
                    Actual Input
                  </button>
                </td>
              </tr>

              {/* 3. WASTE */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-trash-alt text-rose-400"></i> WASTE
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-rose-300">
                  2.50%
                </td>
                <td className="p-3 text-right font-mono text-xs font-bold text-white">
                  Rp {budgetWaste.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-right font-mono text-xs font-black text-rose-300">
                  Rp {actualWaste.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-slate-300">
                  {cogsActual > 0 ? ((actualWaste / cogsActual) * 100).toFixed(2) : '0.00'}%
                </td>
                <td className={`p-3 text-right font-mono text-xs font-black ${selisihWaste <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selisihWaste <= 0 ? '-' : '+'} Rp {Math.abs(selisihWaste).toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    selisihWaste <= 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {selisihWaste <= 0 ? 'HEMAT' : 'OVER'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={handleOpenCategoryModal}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase transition-all"
                  >
                    Actual Input
                  </button>
                </td>
              </tr>

              {/* 4. NON COMMODITY */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-xs font-bold text-white flex items-center gap-2">
                  <i className="fas fa-receipt text-indigo-400"></i> NON COMMODITY
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-indigo-300">
                  1.00%
                </td>
                <td className="p-3 text-right font-mono text-xs font-bold text-white">
                  Rp {budgetNonCommodity.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-right font-mono text-xs font-black text-indigo-300">
                  Rp {actualNonCommodity.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono text-xs font-bold text-slate-300">
                  {cogsActual > 0 ? ((actualNonCommodity / cogsActual) * 100).toFixed(2) : '0.00'}%
                </td>
                <td className={`p-3 text-right font-mono text-xs font-black ${selisihNonCommodity <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selisihNonCommodity <= 0 ? '-' : '+'} Rp {Math.abs(selisihNonCommodity).toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    selisihNonCommodity <= 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {selisihNonCommodity <= 0 ? 'HEMAT' : 'OVER'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={handleOpenCategoryModal}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-300 text-[10px] font-black uppercase transition-all"
                  >
                    Actual Input
                  </button>
                </td>
              </tr>

              {/* TOTAL 4 CATEGORIES ROW */}
              <tr className="bg-amber-400 text-slate-950 font-black border-t-2 border-amber-300">
                <td className="p-4 text-xs font-black uppercase tracking-wider">
                  TOTAL BUDGET CATEGORY (5%)
                </td>
                <td className="p-4 text-center font-mono text-xs font-black">
                  5.00%
                </td>
                <td className="p-4 text-right font-mono text-sm font-black">
                  Rp {totalBudgetCategory.toLocaleString('id-ID')}
                </td>
                <td className="p-4 text-right font-mono text-sm font-black">
                  Rp {totalActualCategory.toLocaleString('id-ID')}
                </td>
                <td className="p-4 text-center font-mono text-xs font-black">
                  {cogsActual > 0 ? ((totalActualCategory / cogsActual) * 100).toFixed(2) : '0.00'}%
                </td>
                <td className="p-4 text-right font-mono text-sm font-black">
                  {totalSelisihCategory <= 0 ? '-' : '+'} Rp {Math.abs(totalSelisihCategory).toLocaleString('id-ID')}
                </td>
                <td className="p-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${
                    totalSelisihCategory <= 0
                      ? 'bg-emerald-700 text-white'
                      : 'bg-rose-700 text-white'
                  }`}>
                    {totalSelisihCategory <= 0 ? 'EFISIEN' : 'OVER'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={handleOpenCategoryModal}
                    className="px-3 py-1 rounded-lg bg-slate-950 text-amber-300 hover:bg-slate-900 text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    Edit All
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: INPUT INVENTORY & RND */}
      {/* ========================================================================= */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <i className="fas fa-boxes-stacked text-amber-400"></i>
                  Input Inventory & R&D ({MONTH_NAMES[selectedMonth]} {selectedYear})
                </h3>
                <p className="text-xs text-slate-400">
                  Masukkan nilai Begin Inventory, Ending Inventory, dan Pengeluaran R&D.
                </p>
              </div>
              <button
                onClick={() => setShowInventoryModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* BEGIN INVENTORY */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <label className="text-xs font-black uppercase text-blue-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-box-open"></i> Begin Inventory (Rp)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={inputBeginInv === 0 ? '' : inputBeginInv}
                  onChange={e => setInputBeginInv(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-amber-500"
                />
              </div>

              {/* BELANJA (INFO ONLY) */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/20 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-300 uppercase">
                    Actual Belanja MTD (Otomatis dari Receiving Sheet)
                  </span>
                  <span className="font-mono font-black text-amber-400 text-sm">
                    Rp {actualBelanja.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* RND */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <label className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-flask"></i> R&D / Research & Development (Rp)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={inputRnd === 0 ? '' : inputRnd}
                  onChange={e => setInputRnd(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-purple-500"
                />
              </div>

              {/* ENDING INVENTORY */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <label className="text-xs font-black uppercase text-rose-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-archive"></i> Ending Inventory (Rp)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={inputEndingInv === 0 ? '' : inputEndingInv}
                  onChange={e => setInputEndingInv(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-rose-500"
                />
              </div>

              {/* LIVE SIMULATION BOX */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Total Barang Tersedia:</span>
                  <span className="font-mono font-bold text-amber-300">
                    Rp {(inputBeginInv + actualBelanja - inputRnd).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-amber-500/20 pt-2">
                  <span className="font-black text-amber-200 uppercase">Kalkulasi COGS Actual:</span>
                  <span className="font-mono font-black text-amber-300 text-sm">
                    Rp {(inputBeginInv + actualBelanja - inputRnd - inputEndingInv).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowInventoryModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs uppercase hover:bg-slate-700 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveInventory}
                className="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <i className="fas fa-save"></i>
                Simpan Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: INPUT ACTUAL 4 CATEGORY COST */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <i className="fas fa-pen-to-square text-emerald-400"></i>
                  Input Realisasi 4 Kategori Cost
                </h3>
                <p className="text-xs text-slate-400">
                  Masukkan realisasi aktual untuk Guest Supplies, Spoiled, Waste, dan Non Commodity.
                </p>
              </div>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* GUEST SUPPLIES */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-blue-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-concierge-bell"></i> Guest Supplies (Target: 1.0%)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Budget: Rp {budgetGuestSupplies.toLocaleString('id-ID')}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={inputActualGuestSupplies === 0 ? '' : inputActualGuestSupplies}
                  onChange={e => setInputActualGuestSupplies(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Selisih:</span>
                  <span className={`font-mono font-bold ${(inputActualGuestSupplies - budgetGuestSupplies) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(inputActualGuestSupplies - budgetGuestSupplies) <= 0 ? '-' : '+'} Rp {Math.abs(inputActualGuestSupplies - budgetGuestSupplies).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* SPOILED */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-ban"></i> Spoiled (Target: 0.5%)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Budget: Rp {budgetSpoiled.toLocaleString('id-ID')}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={inputActualSpoiled === 0 ? '' : inputActualSpoiled}
                  onChange={e => setInputActualSpoiled(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Selisih:</span>
                  <span className={`font-mono font-bold ${(inputActualSpoiled - budgetSpoiled) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(inputActualSpoiled - budgetSpoiled) <= 0 ? '-' : '+'} Rp {Math.abs(inputActualSpoiled - budgetSpoiled).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* WASTE */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-rose-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-trash-alt"></i> Waste (Target: 2.5%)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Budget: Rp {budgetWaste.toLocaleString('id-ID')}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={inputActualWaste === 0 ? '' : inputActualWaste}
                  onChange={e => setInputActualWaste(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-rose-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Selisih:</span>
                  <span className={`font-mono font-bold ${(inputActualWaste - budgetWaste) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(inputActualWaste - budgetWaste) <= 0 ? '-' : '+'} Rp {Math.abs(inputActualWaste - budgetWaste).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* NON COMMODITY */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-receipt"></i> Non Commodity (Target: 1.0%)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Budget: Rp {budgetNonCommodity.toLocaleString('id-ID')}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={inputActualNonCommodity === 0 ? '' : inputActualNonCommodity}
                  onChange={e => setInputActualNonCommodity(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-mono font-bold text-white outline-none focus:ring-2 ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Selisih:</span>
                  <span className={`font-mono font-bold ${(inputActualNonCommodity - budgetNonCommodity) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(inputActualNonCommodity - budgetNonCommodity) <= 0 ? '-' : '+'} Rp {Math.abs(inputActualNonCommodity - budgetNonCommodity).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* TOTAL BUDGET & VARIANCE SUMMARY */}
              {(() => {
                const totalInput = inputActualGuestSupplies + inputActualSpoiled + inputActualWaste + inputActualNonCommodity;
                const totalDiff = totalInput - totalBudgetCategory;
                return (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Total Budget 4 Kategori (5%):</span>
                      <span className="font-mono font-bold text-white">
                        Rp {totalBudgetCategory.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Total Realisasi Actual:</span>
                      <span className="font-mono font-bold text-emerald-300">
                        Rp {totalInput.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/10 font-bold">
                      <span className="text-white uppercase">Net Selisih (Variance):</span>
                      <span className={`font-mono font-black ${totalDiff <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalDiff <= 0 ? 'HEMAT (-)' : 'OVER (+)'} Rp {Math.abs(totalDiff).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs uppercase hover:bg-slate-700 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveCategoryActual}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <i className="fas fa-save"></i>
                Simpan Realisasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW-ONLY DETAIL TRANSAKSI BELANJA PER TANGGAL */}
      {/* ========================================================================= */}
      {viewingDayRow && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-2xl w-full space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-fade-in">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-calendar-day text-amber-400"></i>
                    Rincian Belanja Tanggal {viewingDayRow.day} {MONTH_NAMES[selectedMonth]} {selectedYear}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase border border-amber-400/30 flex items-center gap-1">
                    <i className="fas fa-lock text-[9px]"></i>
                    Read-Only (Auto-Sync)
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Data belanja otomatis disinkronisasi dari input modul transaksi terkait.
                </p>
              </div>
              <button
                onClick={() => setViewingDayRow(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Daily Revenue
                </span>
                <span className="font-mono text-base font-black text-emerald-400">
                  Rp {viewingDayRow.revenue.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Total Belanja (Net)
                </span>
                <span className="font-mono text-base font-black text-amber-300">
                  Rp {viewingDayRow.totalCost.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                {viewingDayRow.totalDeductions > 0 && (
                  <span className="text-[9px] font-bold text-cyan-400 block tracking-tight">
                    (Potongan Non-Food: -Rp {viewingDayRow.totalDeductions.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  % Cost vs Rev
                </span>
                <span className="font-mono text-base font-black text-white">
                  {viewingDayRow.revenue > 0 ? `${Math.round(viewingDayRow.costPct)}%` : '0%'}
                </span>
              </div>
            </div>

            {/* Supplier Breakdown Accordion / List */}
            <div className="space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <i className="fas fa-receipt text-amber-400"></i>
                Rincian per Supplier / Sumber Belanja:
              </span>

              {viewingDayItems.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-950/60 border border-dashed border-white/10 text-center space-y-1">
                  <i className="fas fa-inbox text-slate-600 text-2xl mb-1"></i>
                  <p className="text-xs font-semibold text-slate-400">
                    Tidak ada transaksi belanja yang tercatat pada tanggal {viewingDayRow.day}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewingDayItems.map(group => (
                    <div
                      key={group.supplierId}
                      className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          <span className="font-black text-xs uppercase text-amber-300 tracking-wider">
                            {group.supplierLabel}
                          </span>
                          {group.supplierId === 'mainStore' && group.deductions && group.deductions.total > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
                              Net (Dipotong Rp {group.deductions.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-xs font-black text-white block">
                            Rp {group.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                          {group.supplierId === 'mainStore' && group.grossTotal !== undefined && group.deductions && group.deductions.total > 0 && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Gross: Rp {group.grossTotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* SPECIAL DEDUCTION BREAKDOWN FOR MAIN STORE */}
                      {group.supplierId === 'mainStore' && group.deductions && group.deductions.total > 0 && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-purple-500/10 border border-cyan-500/30 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-black uppercase">
                            <span className="text-cyan-300 flex items-center gap-1.5">
                              <i className="fas fa-cut text-cyan-400"></i>
                              Dipotong Belanja Non-Food (Chemical, Stationary, Marketing)
                            </span>
                            <span className="font-mono text-rose-400 font-black">
                              - Rp {group.deductions.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Belanja Main Store untuk tanggal ini otomatis dikurangi oleh transaksi belanja dari modul Chemical, Stationary, dan Marketing agar nilai Belanja di Receiving Sheet murni mencerminkan COGS Bahan Baku. (Catatan: Belanja ATK / Chemical di Patty Cash / Kas Kecil bersifat independen dan tidak terhubung / tidak memotong Receiving Sheet):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {group.deductions.chemical > 0 && (
                              <div className="p-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-xs">
                                <span className="text-[10px] text-cyan-400 font-bold uppercase block">🧪 Chemical</span>
                                <span className="font-mono text-slate-200 font-bold">
                                  - Rp {group.deductions.chemical.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            {group.deductions.stationary > 0 && (
                              <div className="p-2 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs">
                                <span className="text-[10px] text-amber-400 font-bold uppercase block">📝 Stationary / ATK</span>
                                <span className="font-mono text-slate-200 font-bold">
                                  - Rp {group.deductions.stationary.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            {group.deductions.marketing > 0 && (
                              <div className="p-2 rounded-xl bg-slate-900/90 border border-purple-500/30 text-xs">
                                <span className="text-[10px] text-purple-400 font-bold uppercase block">📢 Marketing</span>
                                <span className="font-mono text-slate-200 font-bold">
                                  - Rp {group.deductions.marketing.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* List of deducted items */}
                          <div className="pt-2 border-t border-white/10 space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                              Rincian Item Pengurang:
                            </span>
                            {group.deductions.items.map((dItem, dIdx) => (
                              <div
                                key={dItem.id || dIdx}
                                className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-900/90 border border-white/5"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                    dItem.category === 'STATIONARY'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : dItem.category === 'MARKETING'
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  }`}>
                                    {dItem.category}
                                  </span>
                                  <span className="text-slate-200 font-semibold">{dItem.name}</span>
                                  <span className="text-[10px] text-rose-400 font-bold italic">(Dipotong dari Belanja Main Store)</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono">
                                  <span className="text-slate-400 text-[11px]">
                                    {dItem.qty}x @ {Number(dItem.price || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="font-bold text-rose-400">
                                    - Rp {dItem.subtotal.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ITEM LIST OF SUPPLIER */}
                      {group.items.length > 0 ? (
                        <div className="space-y-1.5">
                          {group.supplierId === 'mainStore' && group.deductions && group.deductions.total > 0 && (
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block pt-1">
                              Rincian Item Bahan Baku Main Store (Kotor / Gross):
                            </span>
                          )}
                          {group.items.map((item, i) => (
                            <div
                              key={item.id || i}
                              className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-900/60 border border-white/5 text-slate-300"
                            >
                              <span className="font-medium text-slate-200">
                                {item.name}
                              </span>
                              <div className="flex items-center gap-3 font-mono">
                                <span className="text-slate-400 text-[11px]">
                                  {item.qty}x @ {Number(item.price || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                                <span className="font-bold text-amber-300">
                                  Rp {(Number(item.qty || 1) * Number(item.price || 0)).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ))}

                          {/* NET SUMMARY AT BOTTOM OF MAIN STORE */}
                          {group.supplierId === 'mainStore' && group.deductions && group.deductions.total > 0 && (
                            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs font-black">
                              <span className="text-emerald-400 uppercase">Net Main Store Masuk Belanja Receiving</span>
                              <span className="font-mono text-emerald-400 text-sm">
                                Rp {group.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">
                          {group.supplierId === 'mainStore' && group.deductions && group.deductions.total > 0 ? (
                            <p className="text-amber-300/80 not-italic font-medium">
                              Tidak ada item bahan baku Main Store yang diinput pada tanggal ini. Tercatat potongan belanja Chemical/Stationary/Marketing sebesar Rp {group.deductions.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.
                            </p>
                          ) : (
                            `Total nominal: Rp ${group.total.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instruction Footer Note */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-300 text-xs flex items-start gap-2.5">
              <i className="fas fa-info-circle text-amber-400 mt-0.5 flex-shrink-0"></i>
              <p className="text-[11px] leading-relaxed">
                <strong>Catatan Penginputan:</strong> Kolom belanja di Receiving Sheet dibekukan untuk menjaga integritas data. Untuk mengubah atau menambah item belanja, silakan input langsung melalui fitur input di Modul <em>Supplier Expense, Patty Cash Expense, Main Store / Main Kitchen</em>, atau Modul <em>Daily Revenue Closing</em>.
              </p>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setViewingDayRow(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivingSheetModule;
