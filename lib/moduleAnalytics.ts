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
