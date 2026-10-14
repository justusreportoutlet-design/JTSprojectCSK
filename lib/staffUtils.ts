
import { Staff, Division, Outlet } from '../types';

export const DIVISION_PRIORITY: Record<string, number> = {
  'SERVICE': 1,
  'KITCHEN': 2,
  'BAR': 3,
  'STORE KEEPER': 4,
  'PUBLIC ATTENDANCE': 5,
  'STEWARD': 6,
};

export const ROLE_PRIORITY: Record<string, number> = {
  // Service
  'RESTAURANT MANAGER': 1,
  'ASST RESTAURANT MANAGER': 2,
  'ASST MANAGER': 2,
  'RESTAURANT SUPERVISOR': 3,
  'RESTAURANT CAPTAIN': 4,
  'CASHIER': 5,
  'GREETER': 6,
  'CHECKER': 7,
  'SERVICE': 8,
  'SERVER': 8,
  'PUBLIK ATTENDANCE': 9,
  'PUBLIC ATTENDANCE': 9,
  
  // Kitchen
  'SOUS CHEF': 1,
  'CHEF DE PARTIE': 2,
  'DEMI CHEF': 3,
  'COMMIS': 4,
  'COOK': 4,
  'STEWARD': 5,
  
  // Bar
  'BAR CAPTAIN': 1,
  'BARISTA': 2,
  'TRAINEE': 3
};

export const sortStaff = (staffList: Staff[]): Staff[] => {
  return [...staffList].sort((a, b) => {
    const divA = (a.division || 'OTHERS').toUpperCase();
    const divB = (b.division || 'OTHERS').toUpperCase();
    
    const divPrioA = DIVISION_PRIORITY[divA] || 999;
    const divPrioB = DIVISION_PRIORITY[divB] || 999;
    
    if (divPrioA !== divPrioB) return divPrioA - divPrioB;
    
    const roleA = (a.role || '').toUpperCase();
    const roleB = (b.role || '').toUpperCase();
    
    const rolePrioA = ROLE_PRIORITY[roleA] || 999;
    const rolePrioB = ROLE_PRIORITY[roleB] || 999;
    
    if (rolePrioA !== rolePrioB) return rolePrioA - rolePrioB;
    
    // Within same role, sort by join date (longer join date first)
    // Earlier date (smaller timestamp) comes first at the top.
    // Later date (larger timestamp) goes to the bottom.
    const dateA = a.joinDate ? new Date(a.joinDate).getTime() : Infinity;
    const dateB = b.joinDate ? new Date(b.joinDate).getTime() : Infinity;
    
    if (dateA !== dateB) return dateA - dateB;

    // Finally alphabetical if everything else is same
    return a.name.localeCompare(b.name);
  });
};

export const calculateLeaveEntitlement = (joinDateStr: string | undefined, targetDate: Date = new Date()) => {
  if (!joinDateStr) return { accrued: 0, total: 12 };
  
  const joinDate = new Date(joinDateStr);
  if (isNaN(joinDate.getTime())) return { accrued: 0, total: 12 };
  
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth(); // 0-11
  
  // Reset time part of dates for proper comparison
  const joinDateZero = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
  const targetDateZero = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  if (targetDateZero < joinDateZero) {
    return { accrued: 0, total: 12 };
  }

  let accrued = 0;
  const joinYear = joinDate.getFullYear();
  const joinMonth = joinDate.getMonth();

  if (joinYear < targetYear) {
    // Crew who joined before the target year (e.g., joined in 2025 and targetYear is 2026):
    // On January 1st (month 0) they start with 1 day of leave, increasing automatically by 1 every month
    accrued = targetMonth + 1;
  } else if (joinYear === targetYear) {
    // Crew who joined in the target year (e.g., joined January 24th, 2026 and targetYear is 2026):
    // Immediately have 1 day of leave on joining, and increases by 1 day at the turn of every new month
    accrued = (targetMonth - joinMonth) + 1;
  } else {
    // targetYear is before joinYear
    accrued = 0;
  }

  return { accrued: Math.max(0, Math.min(12, accrued)), total: 12 };
};

export const getCutoffYearAndMonth = (dateStr: string): { year: number; monthIdx: number } => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { year: new Date().getFullYear(), monthIdx: new Date().getMonth() };
  
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const day = d.getDate(); // 1-31
  
  // January cutoff period is Dec 26 of (year-1) to Jan 25 of year
  if (month === 11 && day >= 26) {
    return { year: year + 1, monthIdx: 0 };
  } else if (month === 0 && day <= 25) {
    return { year: year, monthIdx: 0 };
  }
  
  // For other months: 26th of m-1 to 25th of m -> month m
  if (day >= 26) {
    return { year: year, monthIdx: month + 1 };
  } else {
    return { year: year, monthIdx: month };
  }
};

export const isStaffVisibleAtOutlet = (
  s: Staff, 
  outlet: Outlet | string | undefined, 
  queryYear: number, 
  queryMonthIdx: number
): boolean => {
  if (!outlet || outlet === 'ALL') {
    return s.status === 'ACTIVE' || !s.status;
  }
  if (s.outlet !== outlet) return false;
  
  // Active staff who have never been mutated has no previousOutlet
  if ((!s.status || s.status === 'ACTIVE') && !s.previousOutlet) {
    return true;
  }
  
  // If historical/exited record (MUTASI, RESIGNED_PROSEDUR, RESIGNED_NON_PROSEDUR)
  if (s.status === 'MUTASI' || s.status === 'RESIGNED_PROSEDUR' || s.status === 'RESIGNED_NON_PROSEDUR') {
    if (!s.statusDate) return false;
    const statusPeriod = getCutoffYearAndMonth(s.statusDate);
    
    const statusVal = statusPeriod.year * 12 + statusPeriod.monthIdx;
    const queryVal = queryYear * 12 + queryMonthIdx;
    // They remain visible in the old outlet up to and including the cutoff period of status change date
    return queryVal <= statusVal;
  }
  
  // If newly joined record via mutation (ACTIVE and has previousOutlet)
  if (s.status === 'ACTIVE' && s.previousOutlet) {
    if (!s.statusDate) return true;
    const statusPeriod = getCutoffYearAndMonth(s.statusDate);
    
    const statusVal = statusPeriod.year * 12 + statusPeriod.monthIdx;
    const queryVal = queryYear * 12 + queryMonthIdx;
    // They start appearing in the new outlet starting from the cutoff period of status change date
    return queryVal >= statusVal;
  }
  
  return s.status === 'ACTIVE';
};

