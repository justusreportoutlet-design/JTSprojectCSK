import { AppState } from '../types';
import { DateMatrixDayInfo, DateMatrixItemDetail, CategoryVarianceItem } from '../components/ModuleDateMatrixSidebar';

export const ID_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const ID_DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const ID_DAY_NAMES_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Extract MTD revenue from an AppState for a given month prefix (e.g. "2026-08")
 * Optionally filtered by a day range (startDay - endDay, e.g. 1 - 25)
 */
export const extractStateMtdRevenue = (
  st: AppState | null | undefined, 
  monthPrefix: string,
  startDay?: number,
  endDay?: number
): number => {
  if (!st) return 0;
  let rev = 0;

  const isDayInRange = (dateStr: string) => {
    if (!startDay && !endDay) return true;
    const parts = dateStr.split('-');
    const day = parseInt(parts[2], 10);
    if (isNaN(day)) return true;
    if (startDay && day < startDay) return false;
    if (endDay && day > endDay) return false;
    return true;
  };

  if (st.sales?.dailyRecording) {
    Object.entries(st.sales.dailyRecording).forEach(([dStr, rec]: [string, any]) => {
      if (dStr.startsWith(monthPrefix) && isDayInRange(dStr)) {
        const lunch = Number(rec.lunchRevenue) || 0;
        const dinner = Number(rec.dinnerRevenue) || 0;
        const sum = lunch + dinner;
        rev += sum > 0 ? sum : (Number(rec.revenue) || 0);
      }
    });
  }

  // Fallback to top-level dailyRecording if sales.dailyRecording was empty
  if (rev === 0 && (st as any).dailyRecording) {
    Object.entries((st as any).dailyRecording).forEach(([dStr, rec]: [string, any]) => {
      if (dStr.startsWith(monthPrefix) && isDayInRange(dStr)) {
        const lunch = Number(rec.lunchRevenue) || 0;
        const dinner = Number(rec.dinnerRevenue) || 0;
        const sum = lunch + dinner;
        rev += sum > 0 ? sum : (Number(rec.revenue) || 0);
      }
    });
  }

  // Fallback to sales.revenue if daily recording has no entries and no day range filter was specified
  if (rev === 0 && st.sales?.revenue && !startDay && !endDay) {
    rev = Number(st.sales.revenue) || 0;
  }

  return rev;
};

/**
 * Generate full DateMatrixDayInfo array for every day of a given month
 * with item-level details attached.
 */
export const buildDailyMatrix = (
  year: number,
  monthIdx: number,
  dailySpendMap: Record<string, number>,
  dailyTxMap: Record<string, number>,
  dailyItemsMap?: Record<string, DateMatrixItemDetail[]>
): DateMatrixDayInfo[] => {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const monthPrefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const list: DateMatrixDayInfo[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${monthPrefix}-${dayStr}`;
    const dateObj = new Date(year, monthIdx, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const items = dailyItemsMap ? (dailyItemsMap[dateStr] || []) : [];

    list.push({
      dateStr,
      dayNum: d,
      dayNameShort: ID_DAY_NAMES_SHORT[dayOfWeek],
      dayNameFull: ID_DAY_NAMES_FULL[dayOfWeek],
      isWeekend,
      spend: Number(dailySpendMap[dateStr]) || 0,
      txCount: items.length > 0 ? items.length : (Number(dailyTxMap[dateStr]) || 0),
      items: items.length > 0 ? items : undefined
    });
  }

  return list;
};

export interface ReceivingSheetTotalsResult {
  totalBelanja: number;
  totalRevenue: number;
  supplierTotals: Record<string, number>;
  dailyCostMap: Record<string, number>;
  grossMainStore: number;
  totalDeductions: number;
}

const RECEIVING_SUPPLIERS = [
  { id: 'mainStore', key: 'dailyMainStoreLedger' },
  { id: 'mainKitchen', key: 'dailyMainKitchenLedger' },
  { id: 'cash', key: 'dailyCashLedger' },
  { id: 'saungKubil', key: 'dailySaungKubilLedger' },
  { id: 'tgif', key: 'dailyTgifLedger' },
  { id: 'panfila', key: 'dailyPanfilaLedger' },
  { id: 'everest', key: 'dailyEverestLedger' },
  { id: 'sukanda', key: 'dailySukandaLedger' },
  { id: 'ikigai', key: 'dailyIkigaiLedger' },
  { id: 'kebunku', key: 'dailyKebunkuLedger' }
];

export const calculateReceivingSheetTotalBelanja = (
  monthlyStates: AppState[],
  year: number,
  monthIdx: number,
  cutoffDay?: number
): ReceivingSheetTotalsResult => {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const maxDay = cutoffDay ? Math.min(cutoffDay, daysInMonth) : daysInMonth;
  const monthStr = String(monthIdx + 1).padStart(2, '0');

  let totalBelanja = 0;
  let totalRevenue = 0;
  let totalGrossMainStore = 0;
  let totalAllDeductions = 0;
  const supplierTotals: Record<string, number> = {};
  RECEIVING_SUPPLIERS.forEach(s => { supplierTotals[s.id] = 0; });
  const dailyCostMap: Record<string, number> = {};

  for (let day = 1; day <= maxDay; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    // Revenue
    for (const st of monthlyStates) {
      if (st.sales?.dailyRecording?.[dateStr]) {
        const rec = st.sales.dailyRecording[dateStr];
        if (rec.revenue && rec.revenue > 0) {
          totalRevenue += rec.revenue;
        } else {
          const revSum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
          if (revSum > 0) totalRevenue += revSum;
        }
      } else if ((st as any).dailyRecording?.[dateStr]) {
        const rec = (st as any).dailyRecording[dateStr];
        if (rec.revenue && rec.revenue > 0) {
          totalRevenue += rec.revenue;
        } else {
          const revSum = (Number(rec.lunchRevenue) || 0) + (Number(rec.dinnerRevenue) || 0);
          if (revSum > 0) totalRevenue += revSum;
        }
      }
    }

    // Deductions for this day
    let dayChemTotal = 0;
    let dayStatTotal = 0;
    let dayMktTotal = 0;

    for (const st of monthlyStates) {
      const chemLedger = (st.dailyChemicalLedger?.[dateStr] || (st as any).dailyChemical?.[dateStr]) as any[];
      if (Array.isArray(chemLedger) && chemLedger.length > 0) {
        chemLedger.forEach(it => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          const sub = qty * price;
          const cat = String(it.category || 'CHEMICAL').toUpperCase();
          if (cat === 'STATIONARY') dayStatTotal += sub;
          else if (cat === 'MARKETING') dayMktTotal += sub;
          else dayChemTotal += sub;
        });
      } else if (st.expenses?.[dateStr]) {
        const exp = st.expenses[dateStr];
        const sVal = Number((exp as any).stationary) || 0;
        const mVal = Number((exp as any).marketing) || 0;
        if (sVal > 0 && dayStatTotal === 0) dayStatTotal += sVal;
        if (mVal > 0 && dayMktTotal === 0) dayMktTotal += mVal;
      }

      const atkLedger = (st.dailyAtkLedger?.[dateStr] || (st as any).dailyAtk?.[dateStr]) as any[];
      if (Array.isArray(atkLedger) && atkLedger.length > 0) {
        atkLedger.forEach(it => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          dayStatTotal += qty * price;
        });
      }
    }

    const totalDeductionsForDay = dayChemTotal + dayStatTotal + dayMktTotal;
    totalAllDeductions += totalDeductionsForDay;

    let dayCost = 0;

    RECEIVING_SUPPLIERS.forEach(sup => {
      let supCost = 0;
      for (const st of monthlyStates) {
        if (sup.id === 'cash') {
          let cashSum = 0;
          const cashList = st.dailyCashLedger?.[dateStr] as any[];
          if (Array.isArray(cashList) && cashList.length > 0) {
            cashSum += cashList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
          }
          const commList = st.dailyCommodityLedger?.[dateStr] as any[];
          if (Array.isArray(commList) && commList.length > 0) {
            cashSum += commList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
          }
          if (cashSum === 0 && st.expenses?.[dateStr]) {
            const exp = st.expenses[dateStr];
            cashSum = (Number(exp.cash) || 0) + (Number(exp.commodity) || 0);
          }
          supCost += cashSum;
        } else if (sup.id === 'mainStore') {
          let grossStore = 0;
          const storeList = (st.dailyMainStoreLedger?.[dateStr] || (st as any).dailyMainStore?.[dateStr]) as any[];
          if (Array.isArray(storeList) && storeList.length > 0) {
            grossStore += storeList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
          } else if (st.expenses?.[dateStr]?.mainStore) {
            grossStore += Number(st.expenses[dateStr].mainStore) || 0;
          }
          totalGrossMainStore += grossStore;
          const netStore = Math.max(0, grossStore - totalDeductionsForDay);
          supCost += netStore;
        } else {
          const ledgerList = (st as any)[sup.key]?.[dateStr] as any[];
          if (Array.isArray(ledgerList) && ledgerList.length > 0) {
            supCost += ledgerList.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
          } else if (st.expenses?.[dateStr] && (st.expenses[dateStr] as any)[sup.id]) {
            supCost += Number((st.expenses[dateStr] as any)[sup.id]) || 0;
          }
        }
      }
      supplierTotals[sup.id] = (supplierTotals[sup.id] || 0) + supCost;
      dayCost += supCost;
    });

    dailyCostMap[dateStr] = dayCost;
    totalBelanja += dayCost;
  }

  return {
    totalBelanja,
    totalRevenue,
    supplierTotals,
    dailyCostMap,
    grossMainStore: totalGrossMainStore,
    totalDeductions: totalAllDeductions
  };
};
