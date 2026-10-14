import { Staff, AppState, GSIRow, Division, Outlet, OutletConfig, BankingPromoItem, StrategyMenuItem } from './types';

export const DIVISIONS: Division[] = ['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_NAMES = MONTHS;

export const DEFAULT_OUTLET_CONFIGS: OutletConfig[] = [
  { id: 'SH CIPETE', name: 'SH CIPETE', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH KEMANG', name: 'SH KEMANG', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH LEBAK BULUS', name: 'SH LEBAK BULUS', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH ALAM SUTERA', name: 'SH ALAM SUTERA', area: 'TANGGERANG', type: 'PRIME OUTLET' },
  { id: 'SH BINTARO', name: 'SH BINTARO', area: 'TANGGERANG', type: 'REGULAR OUTLET' },
  { id: 'SH THE BARN', name: 'SH THE BARN', area: 'TANGGERANG', type: 'PRIME OUTLET' },
  { id: 'SH BEKASI', name: 'SH BEKASI', area: 'BEKASI', type: 'REGULAR OUTLET' },
  { id: 'SH CIBUBUR', name: 'SH CIBUBUR', area: 'BEKASI', type: 'REGULAR OUTLET' }
];

export const OUTLET_AREAS: string[] = [
  'BEKASI',
  'JAKARTA',
  'TANGGERANG',
  'BANDUNG'
];

export const OUTLET_TYPES: string[] = [
  'REGULAR OUTLET',
  'PRIME OUTLET',
  'FOOD COURT',
  'INDONESIAN'
];

export const getDeletedOutletNames = (): string[] => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('APP_DELETED_OUTLETS');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {}
  return [];
};

export const markOutletDeleted = (name: string) => {
  try {
    if (typeof window !== 'undefined') {
      const deleted = getDeletedOutletNames();
      if (!deleted.includes(name)) {
        deleted.push(name);
        localStorage.setItem('APP_DELETED_OUTLETS', JSON.stringify(deleted));
      }
    }
  } catch (e) {}
};

export const getActiveOutletConfigs = (customOutlets?: OutletConfig[]): OutletConfig[] => {
  const deletedSet = new Set(getDeletedOutletNames());
  const defaultNames = new Set(DEFAULT_OUTLET_CONFIGS.map(d => d.name));

  if (customOutlets && Array.isArray(customOutlets) && customOutlets.length > 0) {
    return customOutlets.filter(o => !o.isDeleted && (!deletedSet.has(o.name) || defaultNames.has(o.name)));
  }
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('APP_OUTLET_CONFIGS') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = [...parsed];
        // Ensure all core 8 outlets exist
        DEFAULT_OUTLET_CONFIGS.forEach(def => {
          if (!merged.some((m: any) => m.name === def.name)) {
            merged.push(def);
          }
        });
        return merged.filter((o: any) => !o.isDeleted && (!deletedSet.has(o.name) || defaultNames.has(o.name)));
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_OUTLET_CONFIGS;
};

export const getActiveOutletNames = (customOutlets?: OutletConfig[]): string[] => {
  const configs = getActiveOutletConfigs(customOutlets);
  return configs.map(c => c.name);
};

export const isOutletActive = (name: string): boolean => {
  const activeNames = getActiveOutletNames();
  return activeNames.includes(name);
};

export const getActiveRegionalAreas = (activeNames?: string[]): Record<string, Outlet[]> => {
  const activeList = activeNames || getActiveOutletNames();
  const activeSet = new Set(activeList);
  const areas: Record<string, Outlet[]> = {
    'JAKARTA': [],
    'TANGGERANG': [],
    'BEKASI & CIBUBUR': []
  };

  // Populate from active configs first
  const configs = getActiveOutletConfigs();
  configs.forEach(cfg => {
    if (cfg.isDeleted || !activeSet.has(cfg.name)) return;
    const area = cfg.area || 'JAKARTA';
    const normalizedArea = area.toUpperCase().includes('BEKASI') || area.toUpperCase().includes('CIBUBUR')
      ? 'BEKASI & CIBUBUR'
      : area.toUpperCase().includes('TANGGERANG') || area.toUpperCase().includes('TANGERANG')
      ? 'TANGGERANG'
      : area;
    if (!areas[normalizedArea]) areas[normalizedArea] = [];
    if (!areas[normalizedArea].includes(cfg.name as Outlet)) {
      areas[normalizedArea].push(cfg.name as Outlet);
    }
  });

  // Ensure default area outlets that are active are included
  Object.entries(REGIONAL_AREAS).forEach(([a, list]) => {
    if (!areas[a]) areas[a] = [];
    list.forEach(o => {
      if (activeSet.has(o) && !areas[a].includes(o)) {
        areas[a].push(o);
      }
    });
  });

  return areas;
};

export const saveActiveOutletConfigs = (configs: OutletConfig[]) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('APP_OUTLET_CONFIGS', JSON.stringify(configs));
      window.dispatchEvent(new CustomEvent('appOutletConfigsChanged', { detail: configs }));
    }
  } catch (e) {
    console.error('Failed to save outlet configs to localStorage', e);
  }
};

export const OUTLETS: Outlet[] = [
  'SH CIPETE',
  'SH KEMANG',
  'SH LEBAK BULUS',
  'SH ALAM SUTERA',
  'SH BINTARO',
  'SH THE BARN',
  'SH BEKASI',
  'SH CIBUBUR'
];

export const REGIONAL_AREAS: Record<string, Outlet[]> = {
  'JAKARTA': [
    'SH CIPETE',
    'SH KEMANG',
    'SH LEBAK BULUS'
  ],
  'TANGGERANG': [
    'SH ALAM SUTERA',
    'SH BINTARO',
    'SH THE BARN'
  ],
  'BEKASI & CIBUBUR': [
    'SH BEKASI',
    'SH CIBUBUR'
  ]
};

export interface OrderScheduleInfo {
  area: string;
  areaName: string;
  days: string[];
  dayIndices: number[]; // 0: Sunday, 1: Monday, 2: Tuesday, 3: Wednesday, 4: Thursday, 5: Friday, 6: Saturday
  label: string;
  outlets: Outlet[];
  notes?: string;
}

export const ORDER_SCHEDULES_BY_AREA: Record<string, OrderScheduleInfo> = {
  'JAKARTA': {
    area: 'JAKARTA',
    areaName: 'AREA JAKARTA (CIPETE, KEMANG, LEBAK BULUS)',
    days: ['SELASA', 'KAMIS', 'SABTU'],
    dayIndices: [2, 4, 6],
    label: 'SELASA, KAMIS & SABTU',
    outlets: ['SH CIPETE', 'SH KEMANG', 'SH LEBAK BULUS'],
    notes: 'Jadwal order resmi Area Jakarta'
  },
  'BEKASI & CIBUBUR': {
    area: 'BEKASI & CIBUBUR',
    areaName: 'SMB BEKASI + CIBUBUR',
    days: ['SELASA', 'KAMIS', 'SABTU'],
    dayIndices: [2, 4, 6],
    label: 'SELASA, KAMIS & SABTU',
    outlets: ['SH BEKASI', 'SH CIBUBUR'],
    notes: 'Jadwal order resmi SMB Bekasi & Cibubur'
  },
  'TANGGERANG': {
    area: 'TANGGERANG',
    areaName: 'AREA TANGGERANG (ALAM SUTERA, BINTARO, THE BARN)',
    days: ['SENIN', 'RABU', 'JUMAT'],
    dayIndices: [1, 3, 5],
    label: 'SENIN, RABU & JUMAT',
    outlets: ['SH ALAM SUTERA', 'SH BINTARO', 'SH THE BARN'],
    notes: 'Jadwal order resmi Area Tanggerang'
  }
};

export const getAreaForOutlet = (outlet: string): string => {
  const normalized = (outlet || '').toUpperCase().trim();
  if (normalized === 'SH ALSUT' || normalized === 'ALSUT') return 'TANGGERANG';
  if (
    normalized.includes('CIPETE') ||
    normalized.includes('KEMANG') ||
    normalized.includes('LEBAK') ||
    normalized.includes('JAKARTA')
  ) {
    return 'JAKARTA';
  }
  if (
    normalized.includes('BEKASI') ||
    normalized.includes('CIBUBUR') ||
    normalized.includes('SMB')
  ) {
    return 'BEKASI & CIBUBUR';
  }
  if (
    normalized.includes('ALAM SUTERA') ||
    normalized.includes('BINTARO') ||
    normalized.includes('BARN') ||
    normalized.includes('TANGGERANG') ||
    normalized.includes('TANGERANG')
  ) {
    return 'TANGGERANG';
  }
  for (const [area, list] of Object.entries(REGIONAL_AREAS)) {
    if (list.includes(outlet as Outlet)) return area;
  }
  return 'JAKARTA';
};

export const getOrderScheduleForOutlet = (outlet: string): OrderScheduleInfo => {
  const normalized = (outlet || '').toUpperCase().trim();
  if (
    normalized.includes('CIPETE') ||
    normalized.includes('KEMANG') ||
    normalized.includes('LEBAK') ||
    normalized.includes('JAKARTA') ||
    normalized === 'AREA JAKARTA'
  ) {
    return ORDER_SCHEDULES_BY_AREA['JAKARTA'];
  }
  if (
    normalized.includes('BEKASI') ||
    normalized.includes('SMB') ||
    normalized.includes('CIBUBUR') ||
    normalized.includes('BEKASI & CIBUBUR') ||
    normalized.includes('BEKASI DAN CIBUBUR')
  ) {
    return ORDER_SCHEDULES_BY_AREA['BEKASI & CIBUBUR'];
  }
  if (
    normalized.includes('ALAM SUTERA') ||
    normalized.includes('ALSUT') ||
    normalized.includes('BINTARO') ||
    normalized.includes('BARN') ||
    normalized.includes('TANGGERANG') ||
    normalized.includes('TANGERANG') ||
    normalized === 'AREA TANGGERANG'
  ) {
    return ORDER_SCHEDULES_BY_AREA['TANGGERANG'];
  }
  // Default check via getAreaForOutlet
  const area = getAreaForOutlet(outlet);
  if (ORDER_SCHEDULES_BY_AREA[area]) {
    return ORDER_SCHEDULES_BY_AREA[area];
  }
  return ORDER_SCHEDULES_BY_AREA['JAKARTA'];
};

export const isOrderDayForOutlet = (outlet: string, date: Date | string = new Date()): boolean => {
  const sched = getOrderScheduleForOutlet(outlet);
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  const dayIndex = d.getDay();
  return sched.dayIndices.includes(dayIndex);
};

export const STAFF_LIST: Staff[] = [];


export const ROLES_BY_DIVISION: Record<string, string[]> = {
  'SERVICE': [
    'RESTAURANT MANAGER',
    'ASST RESTAURANT MANAGER',
    'ASST MANAGER',
    'RESTAURANT SUPERVISOR',
    'RESTAURANT CAPTAIN',
    'CASHIER',
    'GREETER',
    'CHECKER',
    'SERVICE',
    'SERVER',
    'PUBLIK ATTENDANCE',
    'PUBLIC ATTENDANCE'
  ],
  'KITCHEN': [
    'SOUS CHEF',
    'CHEF DE PARTIE',
    'DEMI CHEF',
    'COMMIS',
    'STEWARD'
  ],
  'BAR': [
    'BAR CAPTAIN',
    'BARISTA',
    'TRAINEE'
  ],
  'STORE KEEPER': ['STORE KEEPER']
};

export const INITIAL_GSI_STRUCTURE: GSIRow[] = [
  { id: '1', subject: 'Quality of Service', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
  { id: '2', subject: 'Quality of Food', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
  { id: '3', subject: 'Quality of Beverage', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
  { id: '4', subject: 'Quality of Cleanliness', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
  { id: '5', subject: 'Attentiveness of Staff', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
  { id: '6', subject: 'Value for Money', excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 },
];

export const INITIAL_STATE: AppState = {
  staffList: STAFF_LIST,
  googleReview: {
    targetRating: 5,
    currentRating: 0,
    totalReview: 0,
    targetReviewCount: 100,
    stars1: 0,
    stars2: 0,
    stars3: 0,
    stars4: 0,
    stars5: 0,
  },
  dailyGoogleReview: {},
  dailyGSI: {},
  guestComplaints: [],
  qa: {
    kitchen: { product: 0, cleanliness: 0, grooming: 0 },
    bar: { product: 0, cleanliness: 0, grooming: 0 },
    service: { product: 0, grooming: 0, cleanliness: 0 },
  },
  dailyQA: {},
  dailyBreakTime: {},
  monthlyCogsData: {},
  expenses: {},
  dailyMainKitchenLedger: {},
  dailyMainStoreLedger: {},
  dailyChemicalLedger: {},
  dailyGuestSuppliesLedger: {},
  dailyCashLedger: {},
  cityLedger: [],
  dailyCityLedger: {},
  customerSat: [],
  dailyCustomerSat: {},
  complimentary: [],
  dailyComplimentary: {},
  sales: {
    revenue: 0,
    covers: 0,
    budgetRevenue: 0,
    dailyTarget: 0,
    todayRevenue: 0,
    todayCovers: 0,
    dailyRecording: {}
  },
  dailyTargets: {},
  holidays: [],
  leaveRecords: [],
  dailyOvertime: {},
  weeklyOvertime: {},
  dailyAttendance: {},
  dailyReports: {},
  dailyReportSummaries: {},
  overtimeBudgets: {
    SERVICE: 0,
    BAR: 0,
    KITCHEN: 0,
    'STORE KEEPER': 0,
    'PUBLIC ATTENDANCE': 0,
    STEWARD: 0
  },
  dailyNonCommodityLedger: {},
  dailyCommodityLedger: {},
  dailyMaintenanceLedger: {},
  dailyAssetLedger: {},
  dailyCasualLedger: {},
  dailyAtkLedger: {},
  dailyThirdPartyLedger: {},
  dailyIkigaiLedger: {},
  dailyPanfilaLedger: {},
  dailyEverestLedger: {},
  dailySaungKubilLedger: {},
  dailyTgifLedger: {},
  dailySukandaLedger: {},
  dailyKebunkuLedger: {},
  dailyGasLedger: {},
  dailyTips: {},
  dailyCPA: {},
  dailyExternalAudit: {},
  opexBudgetPercentage: 0,
  affiliateHistory: [],
  monthlyDiscountNames: {},
  logisticItems: [],
  dailyLogisticRecords: {},
  peminjamanRecords: [],
  logisticBeginningStocks: {},
  logisticPeriodPrices: {},
  dailyVoidBills: {},
  voidBills: [],
};

export const QA_PASSING_SCORES = {
  kitchen: 85,
  bar: 90,
  service: 95
};

export const QA_PASSING_TIERS = {
  EXCELLENT: { label: 'EXCELLENT', min: 91.00, max: 100.00, range: '91.00% - 100%', description: 'Sangat Baik / Unggul' },
  SATISFACTORY: { label: 'SATISFACTORY', min: 85.00, max: 90.99, range: '85.00% - 90.00%', description: 'Standar Memuaskan' },
  TO_IMPROVE: { label: 'TO IMPROVE', min: 45.00, max: 84.99, range: '45.00% - 84.00%', description: 'Perlu Peningkatan' },
};

export const getQaScoreTier = (score: number) => {
  const num = Number(score) || 0;
  if (num >= 91.0) {
    return {
      tier: 'EXCELLENT' as const,
      label: 'EXCELLENT',
      range: '91.00% - 100%',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      badgeClass: 'bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/40',
      icon: 'fa-award',
      barColor: 'bg-emerald-500'
    };
  }
  if (num >= 85.0) {
    return {
      tier: 'SATISFACTORY' as const,
      label: 'SATISFACTORY',
      range: '85.00% - 90.00%',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      badgeClass: 'bg-blue-600 text-white font-black shadow-lg shadow-blue-900/40',
      icon: 'fa-check-circle',
      barColor: 'bg-blue-500'
    };
  }
  return {
    tier: 'TO IMPROVE' as const,
    label: 'TO IMPROVE',
    range: '45.00% - 84.00%',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    badgeClass: 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-900/40',
    icon: 'fa-exclamation-triangle',
    barColor: 'bg-amber-500'
  };
};

export const OT_RATE = 15000;
export const DEFAULT_OT_BUDGET_HOURS = 35;
export const DEFAULT_OT_RATE = 15000;

export interface DivisionNotes {
  SERVICE?: string;
  KITCHEN?: string;
  BAR?: string;
  'STORE KEEPER'?: string;
  [key: string]: string | undefined;
}

export const getStoredOtBudgetSettings = (): { budgetHours: number; ratePerHour: number } => {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('APP_OT_BUDGET_SETTINGS');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          budgetHours: Number(parsed.budgetHours) || DEFAULT_OT_BUDGET_HOURS,
          ratePerHour: Number(parsed.ratePerHour) || DEFAULT_OT_RATE
        };
      }
    }
  } catch (e) {
    // fallback
  }
  return { budgetHours: DEFAULT_OT_BUDGET_HOURS, ratePerHour: DEFAULT_OT_RATE };
};

export const saveStoredOtBudgetSettings = (settings: { budgetHours: number; ratePerHour: number }) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('APP_OT_BUDGET_SETTINGS', JSON.stringify(settings));
    }
  } catch (e) {
    // fallback
  }
};

export const getStoredDivisionNotes = (periodKey: string): Record<string, DivisionNotes> => {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`APP_DIVISION_NOTES_${periodKey}`);
      if (saved) return JSON.parse(saved);
    }
  } catch (e) {}
  return {};
};

export const saveStoredDivisionNotes = (periodKey: string, notes: Record<string, DivisionNotes>) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`APP_DIVISION_NOTES_${periodKey}`, JSON.stringify(notes));
    }
  } catch (e) {}
};

export const DEFAULT_BANKING_PROMOS: BankingPromoItem[] = [
  {
    id: 'digibank',
    name: 'Digibank by DBS',
    terms: 'All F&B - JKT/TGR/BKS Disc Rp 150.000 min purchase Rp 1.250.000',
    isActive: true,
    targetOutlets: ['ALL']
  },
  {
    id: 'bank_mega',
    name: 'Bank MEGA',
    terms: 'All F&B Disc 15% min purchase Rp 650.000 max disc Rp 150.000',
    isActive: true,
    targetOutlets: ['ALL']
  }
];

export const getStoredBankPromos = (): BankingPromoItem[] => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('APP_PROMO_SETTINGS');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.customBankPromos) && parsed.customBankPromos.length > 0) {
          return parsed.customBankPromos;
        }
      }
    }
  } catch (e) {}
  return DEFAULT_BANKING_PROMOS;
};

export const DEFAULT_STRATEGY_MENU_CATALOG: StrategyMenuItem[] = [
  // Penyeimbang (Balance items)
  { id: 'strat_1', name: 'Ribeye Prime 200gr', category: 'PENYEIMBANG', price: 185000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_2', name: 'Sirloin US Beef 200gr', category: 'PENYEIMBANG', price: 165000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_3', name: 'Cream of Mushroom Soup', category: 'PENYEIMBANG', price: 38000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_4', name: 'Chicken Cordon Bleu', category: 'PENYEIMBANG', price: 85000, session: 'LUNCH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_5', name: 'Justus Ice Lemon Tea Pitcher', category: 'PENYEIMBANG', price: 45000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' },
  // Percepatan (Accelerator items)
  { id: 'strat_6', name: 'Australian Wagyu MB5 Tenderloin', category: 'PERCEPATAN', price: 295000, session: 'DINNER', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_7', name: 'Tomahawk Meltique 500gr', category: 'PERCEPATAN', price: 385000, session: 'DINNER', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_8', name: 'Family Sharing Platter 4 Pax', category: 'PERCEPATAN', price: 450000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_9', name: 'Combo Steak & Pasta Special', category: 'PERCEPATAN', price: 135000, session: 'LUNCH', isActive: true, createdAt: '2026-01-01' },
  { id: 'strat_10', name: 'Surf & Turf Prime Feast', category: 'PERCEPATAN', price: 265000, session: 'BOTH', isActive: true, createdAt: '2026-01-01' }
];

export const getStoredStrategyCatalog = (): StrategyMenuItem[] => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('APP_STRATEGY_CATALOG');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {}
  return DEFAULT_STRATEGY_MENU_CATALOG;
};

export const saveStoredStrategyCatalog = (items: StrategyMenuItem[]) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('APP_STRATEGY_CATALOG', JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('appStrategyCatalogChanged', { detail: items }));
    }
  } catch (e) {}
};

