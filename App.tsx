import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ModuleType, AppState, User, SyncStatus, Outlet, Notification, LeaveRecord } from './types';
import { INITIAL_STATE, ROLES_BY_DIVISION, DIVISIONS, OUTLETS, getActiveOutletNames } from './constants';
import { fetchUserData, saveGlobalData, saveOutletData, startRealtimeListener, startNotificationListener, isQuotaExceeded, resetQuotaExceeded, fetchAllOutletsData, startAllOutletsListener, testConnection } from './services/cloudService';
import { safeStorage, safeClipboard, safeWindow } from './lib/safeStorage';
import { toLocalDateStr } from './lib/dateUtils';
import { calculateLeaveEntitlement } from './lib/staffUtils';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LoginModule from './components/LoginModule';
import CogsModule from './components/CogsModule';
import OvertimeRekapanModule from './components/OvertimeRekapanModule';
import PattyCashOpexRekapanModule from './components/PattyCashOpexRekapanModule';
import ReportingModule from './components/ReportingModule';
import ReceivingSheetModule from './components/ReceivingSheetModule';
import SalesModule from './components/SalesModule';
import AdminModule from './components/AdminModule';
import OvertimeModule from './components/OvertimeModule';
import { LogisticsModule, LogisticsInputModal } from './components/LogisticsModule';
import RegionalManagerModule from './components/RegionalManagerModule';
import TutorialModule from './components/TutorialModule';
import ThirdPartyGasModule from './components/ThirdPartyGasModule';
import OutletPerformanceModule from './components/OutletPerformanceModule';
import PattyCashExpenseModule from './components/PattyCashExpenseModule';
import ChemicalExpenseModule from './components/ChemicalExpenseModule';
import MainStoreKitchenModule from './components/MainStoreKitchenModule';
import SupplierExpenseModule from './components/SupplierExpenseModule';
import CityLedgerModule from './components/CityLedgerModule';
import GuestSatisfactionModule from './components/GuestSatisfactionModule';
import ComplimentaryModule from './components/ComplimentaryModule';
import EnergyCostModule from './components/EnergyCostModule';
import WeeklyOvertimeInputModule from './components/WeeklyOvertimeInputModule';
import { StrategiMenuModule } from './components/StrategiMenuModule';
import RealtimeFeatures from './components/RealtimeFeatures';
import DailyReminderPopup from './components/DailyReminderPopup';
import { OutletControlModal } from './components/OutletControlModal';
import VoidBillModule from './components/VoidBillModule';

const sortStaffList = (a: any, b: any) => {
  if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
  if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
  
  const divA = DIVISIONS.indexOf(a.division || '');
  const divB = DIVISIONS.indexOf(b.division || '');
  const finalDivA = divA === -1 ? 999 : divA;
  const finalDivB = divB === -1 ? 999 : divB;
  
  if (finalDivA !== finalDivB) return finalDivA - finalDivB;
  
  const roles = ROLES_BY_DIVISION[a.division] || [];
  const roleA = roles.indexOf(a.role?.toUpperCase() || '');
  const roleB = roles.indexOf(b.role?.toUpperCase() || '');
  const finalRoleA = roleA === -1 ? 999 : roleA;
  const finalRoleB = roleB === -1 ? 999 : roleB;
  
  if (finalRoleA !== finalRoleB) return finalRoleA - finalRoleB;
  
  const dateA = a.joinDate || '9999-12-31';
  const dateB = b.joinDate || '9999-12-31';
  return dateA.localeCompare(dateB);
};

const mergeArrayById = (localArr: any[], cloudArr: any[]): any[] => {
  if (!Array.isArray(localArr)) return cloudArr || [];
  if (!Array.isArray(cloudArr)) return localArr || [];
  
  const mergedMap = new Map<string, any>();
  
  localArr.forEach(item => {
    if (item && item.id) {
      mergedMap.set(String(item.id), item);
    }
  });
  
  cloudArr.forEach(item => {
    if (item && item.id) {
      const idStr = String(item.id);
      const existing = mergedMap.get(idStr);
      if (existing) {
        mergedMap.set(idStr, { ...existing, ...item });
      } else {
        mergedMap.set(idStr, item);
      }
    }
  });
  
  return Array.from(mergedMap.values());
};

const mergeDeep = (local: any, cloud: any): any => {
  if (local === undefined) return cloud;
  if (cloud === undefined) return local;
  
  if (local === null || cloud === null) {
    return cloud !== undefined ? cloud : local;
  }
  
  if (typeof local !== 'object' || typeof cloud !== 'object') {
    return cloud;
  }
  
  if (Array.isArray(local) || Array.isArray(cloud)) {
    const hasIds = (Array.isArray(local) && local.some(x => x && x.id)) || 
                   (Array.isArray(cloud) && cloud.some(x => x && x.id));
    if (hasIds) {
      return mergeArrayById(local, cloud);
    }
    return Array.isArray(cloud) ? cloud : local;
  }
  
  const merged: any = { ...local };
  
  Object.keys(cloud).forEach(key => {
    if (local[key] !== undefined) {
      merged[key] = mergeDeep(local[key], cloud[key]);
    } else {
      merged[key] = cloud[key];
    }
  });
  
  return merged;
};

const cleanLogisticItemsList = (itemsList: any[]) => {
  if (!Array.isArray(itemsList)) return [];
  return itemsList.filter((item: any) => {
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
};

const cleanOutletDataOfDefaultLogistics = (outletData: any) => {
  if (!outletData) return {};
  const cleaned = { ...outletData };
  Object.keys(cleaned).forEach(monthKey => {
    if (cleaned[monthKey]) {
      const monthData = cleaned[monthKey];
      if (monthData.logisticItems) {
        cleaned[monthKey] = {
          ...monthData,
          logisticItems: cleanLogisticItemsList(monthData.logisticItems)
        };
      }
    }
  });
  return cleaned;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User>({ email: '', isLoggedIn: false });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const syncTimeout = useRef<any>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [globalData, setGlobalDataState] = useState({
    staffList: INITIAL_STATE.staffList,
    leaveRecords: INITIAL_STATE.leaveRecords,
    manpowerData: {} as Record<string, any>,
    dailyOvertime: INITIAL_STATE.dailyOvertime,
    weeklyOvertime: (INITIAL_STATE as any).weeklyOvertime || {},
    dailyAttendance: INITIAL_STATE.dailyAttendance,
    dailyExternalAudit: INITIAL_STATE.dailyExternalAudit || {},
    dailyCPA: INITIAL_STATE.dailyCPA || {},
    dailyGSI: INITIAL_STATE.dailyGSI || {},
    guestComplaints: INITIAL_STATE.guestComplaints || [],
    affiliateHistory: INITIAL_STATE.affiliateHistory || []
  });
  const [outletMonthlyData, setOutletMonthlyDataState] = useState<Record<string, any>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [birthdayNotifications, setBirthdayNotifications] = useState<Notification[]>([]);
  const [allOutletsData, setAllOutletsData] = useState<Record<string, any>>({});
  const [isAllOutletsLoading, setIsAllOutletsLoading] = useState(false);

  const [activeModule, setActiveModule] = useState<ModuleType>(() => {
    const saved = safeStorage.getItem('BARN_ACTIVE_MODULE');
    return (saved as ModuleType) || ModuleType.REGIONAL_REPORT;
  });
  const [activeRMTab, setActiveRMTab] = useState<any>(() => {
    return safeStorage.getItem('BARN_ACTIVE_RM_TAB') || 'REVENUE_MTD';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => {
    return safeStorage.getItem('BARN_ADMIN_MODE') === 'true';
  });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showConfirm, setShowConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [showLogisticsInputModal, setShowLogisticsInputModal] = useState(false);
  const [quotaExceededState, setQuotaExceededState] = useState(isQuotaExceeded());
  const [isPublicView, setIsPublicView] = useState(false);
  const [isOutletControlOpen, setIsOutletControlOpen] = useState(false);
  const [outletControlTab, setOutletControlTab] = useState<'OUTLETS' | 'PROMO'>('OUTLETS');

  useEffect(() => {
    const handleOpenOutletControl = (e: any) => {
      if (e?.detail?.tab) {
        setOutletControlTab(e.detail.tab);
      } else {
        setOutletControlTab('OUTLETS');
      }
      setIsOutletControlOpen(true);
    };
    window.addEventListener('openOutletControl', handleOpenOutletControl);
    return () => window.removeEventListener('openOutletControl', handleOpenOutletControl);
  }, []);

  const lastSyncedGlobal = useRef<Record<string, string>>({});
  const lastSyncedOutlet = useRef<Record<string, string>>({});
  const isHydrated = useRef(false);
  const isPrioritySync = useRef(false);
  const maxDailyInputLimitRef = useRef<number>(2500);
  const flushPendingSyncRef = useRef<(() => Promise<boolean>) | null>(null);

  // Synchronize dynamic settings (like Batas Maksimal Input Harian) across users in real-time
  useEffect(() => {
    if (!user.isLoggedIn || !user.email) return;

    // Fetch from server API first
    fetch('/api/sync/system-config')
      .then(res => res.json())
      .then(data => {
        if (data?.config?.maxDailyInputs !== undefined) {
          maxDailyInputLimitRef.current = data.config.maxDailyInputs;
          localStorage.setItem('MAX_DAILY_INPUT_LIMIT', data.config.maxDailyInputs.toString());
        }
      })
      .catch(() => {});

    try {
      const saved = localStorage.getItem('MAX_DAILY_INPUT_LIMIT');
      if (saved) maxDailyInputLimitRef.current = parseInt(saved, 10);
    } catch (e) {
      // Ignore
    }

    if (!auth.currentUser) return;

    const configRef = doc(db, 'system_data', 'system_config');
    getDoc(configRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.maxDailyInputs !== undefined) {
          maxDailyInputLimitRef.current = data.maxDailyInputs;
          localStorage.setItem('MAX_DAILY_INPUT_LIMIT', data.maxDailyInputs.toString());
        }
      }
    }).catch((error) => {
      console.warn("[App] Could not fetch system config:", error);
    });
  }, [user.isLoggedIn, user.email]);

  const [filters, setFilters] = useState(() => {
    const defaultFilters = {
      month: new Date().getMonth().toString(),
      year: new Date().getFullYear().toString(),
      startDate: toLocalDateStr(new Date()),
      endDate: toLocalDateStr(new Date())
    };
    const saved = safeStorage.getItem('BARN_FILTERS');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultFilters, ...parsed };
      } catch (e) {
        // Fallback to default
      }
    }
    return defaultFilters;
  });

  // Save state to localStorage on changes
  useEffect(() => {
    safeStorage.setItem('BARN_ACTIVE_MODULE', activeModule);
  }, [activeModule]);

  useEffect(() => {
    safeStorage.setItem('BARN_ACTIVE_RM_TAB', activeRMTab);
  }, [activeRMTab]);

  useEffect(() => {
    safeStorage.setItem('BARN_FILTERS', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    safeStorage.setItem('BARN_ADMIN_MODE', isAdmin.toString());
  }, [isAdmin]);
  const [orientation, setOrientation] = useState<string>('portrait');

  // Initial connection test
  useEffect(() => {
    testConnection().finally(() => {
      setSyncTrigger(prev => prev + 1);
    });
  }, []);

  // Handle Orientation Changes with safe property access
  useEffect(() => {
    const handleOrientation = () => {
      safeWindow.run((win: any) => {
        const screen = win.screen;
        
        if (screen && screen.orientation) {
          setOrientation(screen.orientation.type);
        } else {
          setOrientation(win.innerHeight > win.innerWidth ? 'portrait' : 'landscape');
        }
        // Force scroll to top on rotation
        safeWindow.scrollTo(0, 0);
      });
    };

    const win = safeWindow.obj();
    if (win) {
      win.addEventListener('orientationchange', handleOrientation);
      
      try {
        if (win.screen && win.screen.orientation) {
          win.screen.orientation.addEventListener('change', handleOrientation);
        }
      } catch (e) {
        // Ignore security errors when adding listeners to restricted objects
      }
    }

    // Initial run
    handleOrientation();

    return () => {
      const w = safeWindow.obj();
      if (w) {
        w.removeEventListener('orientationchange', handleOrientation);
        try {
          if (w.screen && w.screen.orientation) {
            w.screen.orientation.removeEventListener('change', handleOrientation);
          }
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  // Listen to Firebase Auth state & auto-ensure authenticated connection across all devices (PC, iOS, Android)
  useEffect(() => {
    let isMounted = true;

    const ensureAuth = async () => {
      try {
        if (!auth.currentUser) {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.warn('[Auth] Anonymous bootstrap skipped/failed:', err);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) return;

      const manualEmail = safeStorage.getItem('MANUAL_USER_EMAIL') || safeStorage.getItem('BARN_USER_SESSION') || '';
      const resolvedEmail = (firebaseUser && firebaseUser.email) || (firebaseUser && firebaseUser.isAnonymous ? manualEmail : null) || (manualEmail || null);

      if (resolvedEmail) {
        const savedOutlet = safeStorage.getItem('BARN_SELECTED_OUTLET') as Outlet;
        if (savedOutlet) {
          handleLogin(resolvedEmail, savedOutlet);
        } else {
          setUser({ email: resolvedEmail, isLoggedIn: false });
        }
      } else {
        setUser({ email: '', isLoggedIn: false });
      }
      setIsAuthReady(true);
    });

    ensureAuth();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user.isLoggedIn) return;
    const unsubscribe = startNotificationListener((notifs) => {
      setNotifications(notifs);
    });
    return unsubscribe;
  }, [user.isLoggedIn, syncTrigger]);
  
  useEffect(() => {
    if (!globalData.staffList) return;
    
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const tomorrowMonth = tomorrow.getMonth() + 1;
    const tomorrowDay = tomorrow.getDate();

    const bdayNotifs: Notification[] = [];

    globalData.staffList.forEach(staff => {
      if (!staff.birthDate || staff.status === 'RESIGNED_PROSEDUR' || staff.status === 'RESIGNED_NON_PROSEDUR') return;
      
      const birthDateObj = new Date(staff.birthDate);
      const bMonth = birthDateObj.getMonth() + 1;
      const bDay = birthDateObj.getDate();
      
      if (bMonth === todayMonth && bDay === todayDay) {
        bdayNotifs.push({
          id: `bday-today-${staff.id}`,
          user: 'SYSTEM',
          outlet: staff.outlet || 'ALL',
          timestamp: new Date().toISOString(),
          message: `HARI INI BERULANG TAHUN! 🎉 Selamat ulang tahun untuk ${staff.name}!`
        });
      } else if (bMonth === tomorrowMonth && bDay === tomorrowDay) {
        bdayNotifs.push({
          id: `bday-tomorrow-${staff.id}`,
          user: 'SYSTEM',
          outlet: staff.outlet || 'ALL',
          timestamp: new Date().toISOString(),
          message: `BESOK BERULANG TAHUN! 🎂 Persiapkan kejutan untuk ${staff.name}!`
        });
      }
    });

    setBirthdayNotifications(bdayNotifs);
  }, [globalData.staffList]);

  const currentData = useMemo(() => {
    const monthKey = filters.month;
    const monthBase = { ...INITIAL_STATE, ...(outletMonthlyData[monthKey] || {}) };
    
    // Fetch month-specific staffList or fallback to most recent previous month of this outlet
    let staffList = monthBase.staffList;
    if (!outletMonthlyData[monthKey]?.staffList) {
      for (let m = parseInt(monthKey) - 1; m >= 0; m--) {
        if (outletMonthlyData[m.toString()]?.staffList) {
          staffList = outletMonthlyData[m.toString()].staffList;
          break;
        }
      }
    }
    if (!staffList) staffList = INITIAL_STATE.staffList;

    // Fetch month-specific leaveRecords or fallback to most recent previous month of this outlet
    let leaveRecords = monthBase.leaveRecords;
    if (!outletMonthlyData[monthKey]?.leaveRecords) {
      for (let m = parseInt(monthKey) - 1; m >= 0; m--) {
        if (outletMonthlyData[m.toString()]?.leaveRecords) {
          leaveRecords = outletMonthlyData[m.toString()].leaveRecords;
          break;
        }
      }
    }
    if (!leaveRecords) leaveRecords = INITIAL_STATE.leaveRecords;

    // Fetch month-specific logisticItems or fallback to most recent previous month of this outlet
    let rawLogisticItems = monthBase.logisticItems;
    if (!rawLogisticItems || rawLogisticItems.length === 0) {
      for (let m = parseInt(monthKey) - 1; m >= 0; m--) {
        const prev = outletMonthlyData[m.toString()]?.logisticItems;
        if (prev && prev.length > 0) {
          rawLogisticItems = prev;
          break;
        }
      }
    }
    if (!rawLogisticItems || rawLogisticItems.length === 0) {
      for (let m = 0; m < 12; m++) {
        const anyItems = outletMonthlyData[m.toString()]?.logisticItems;
        if (anyItems && anyItems.length > 0) {
          rawLogisticItems = anyItems;
          break;
        }
      }
    }
    const logisticItems = cleanLogisticItemsList(rawLogisticItems || []);

    // Aggregate logistics data across all 12 months for this outlet so all period records are available
    const mergedBeginningStocks: Record<string, Record<string, number>> = {};
    const mergedDailyRecords: Record<string, any> = {};
    const mergedPeminjaman: any[] = [];
    const mergedPeriodPrices: Record<string, Record<string, number>> = {};

    for (let m = 0; m < 12; m++) {
      const mData = outletMonthlyData[m.toString()];
      if (mData) {
        if (mData.logisticBeginningStocks) {
          Object.entries(mData.logisticBeginningStocks).forEach(([pKey, itemMap]) => {
            mergedBeginningStocks[pKey] = {
              ...(mergedBeginningStocks[pKey] || {}),
              ...(itemMap as Record<string, number>)
            };
          });
        }
        if (mData.dailyLogisticRecords) {
          Object.entries(mData.dailyLogisticRecords).forEach(([dateStr, itemMap]) => {
            mergedDailyRecords[dateStr] = {
              ...(mergedDailyRecords[dateStr] || {}),
              ...(itemMap as any)
            };
          });
        }
        if (mData.peminjamanRecords && Array.isArray(mData.peminjamanRecords)) {
          mData.peminjamanRecords.forEach(p => {
            if (!mergedPeminjaman.some(existing => existing.id === p.id)) {
              mergedPeminjaman.push(p);
            }
          });
        }
        if (mData.logisticPeriodPrices) {
          Object.entries(mData.logisticPeriodPrices).forEach(([pKey, itemMap]) => {
            mergedPeriodPrices[pKey] = {
              ...(mergedPeriodPrices[pKey] || {}),
              ...(itemMap as Record<string, number>)
            };
          });
        }
      }
    }

    const mergedDailyOvertime: Record<string, any[]> = {};
    for (let m = 0; m < 12; m++) {
      const mData = outletMonthlyData[m.toString()];
      if (mData && mData.dailyOvertime) {
        Object.entries(mData.dailyOvertime).forEach(([dateStr, entries]) => {
          if (Array.isArray(entries) && entries.length > 0) {
            mergedDailyOvertime[dateStr] = entries;
          }
        });
      }
    }
    if (globalData.dailyOvertime) {
      Object.entries(globalData.dailyOvertime).forEach(([dateStr, entries]) => {
        if (Array.isArray(entries) && entries.length > 0) {
          mergedDailyOvertime[dateStr] = entries;
        }
      });
    }

    // Consolidate manpowerData across all 12 months, globalData, and monthBase so filled manpower is never lost when changing months
    const mergedManpowerData: Record<string, any> = {};
    if (globalData.manpowerData && typeof globalData.manpowerData === 'object') {
      Object.assign(mergedManpowerData, globalData.manpowerData);
    }
    for (let m = 0; m < 12; m++) {
      const mData = outletMonthlyData[m.toString()];
      if (mData?.manpowerData && typeof mData.manpowerData === 'object') {
        Object.assign(mergedManpowerData, mData.manpowerData);
      }
    }
    if (monthBase.manpowerData && typeof monthBase.manpowerData === 'object') {
      Object.assign(mergedManpowerData, monthBase.manpowerData);
    }

    const activeDailyRec = {
      ...(monthBase.dailyRecording || {}),
      ...((monthBase.sales && monthBase.sales.dailyRecording) || {})
    };

    return {
      ...monthBase,
      dailyRecording: activeDailyRec,
      sales: {
        ...(monthBase.sales || {}),
        dailyRecording: activeDailyRec
      },
      staffList,
      leaveRecords,
      logisticItems,
      manpowerData: mergedManpowerData,
      dailyOvertime: { ...(monthBase.dailyOvertime || {}), ...mergedDailyOvertime },
      logisticBeginningStocks: mergedBeginningStocks,
      dailyLogisticRecords: mergedDailyRecords,
      peminjamanRecords: mergedPeminjaman,
      logisticPeriodPrices: mergedPeriodPrices
    } as AppState;
  }, [outletMonthlyData, filters.month, globalData.manpowerData]);

  const dataRef = useRef<AppState>(currentData);
  useEffect(() => {
    dataRef.current = currentData;
  }, [currentData]);

  // Synchronize globalData state with the current selected month's values (including fallbacks)
  useEffect(() => {
    const monthKey = filters.month;
    const monthData = outletMonthlyData[monthKey] || {};
    
    // Fallback for staffList: find most recent non-empty staffList backwards
    let staffList = monthData.staffList;
    if (!staffList) {
      for (let m = parseInt(monthKey) - 1; m >= 0; m--) {
        if (outletMonthlyData[m.toString()]?.staffList) {
          staffList = outletMonthlyData[m.toString()].staffList;
          break;
        }
      }
    }
    if (!staffList) staffList = INITIAL_STATE.staffList;

    // Fallback for leaveRecords: find most recent non-empty leaveRecords backwards
    let leaveRecords = monthData.leaveRecords;
    if (!leaveRecords) {
      for (let m = parseInt(monthKey) - 1; m >= 0; m--) {
        if (outletMonthlyData[m.toString()]?.leaveRecords) {
          leaveRecords = outletMonthlyData[m.toString()].leaveRecords;
          break;
        }
      }
    }
    if (!leaveRecords) leaveRecords = INITIAL_STATE.leaveRecords;

    // Consolidate manpower across all months so switching months preserves filled manpower
    const mergedMp: Record<string, any> = {};
    for (let m = 0; m < 12; m++) {
      const mData = outletMonthlyData[m.toString()];
      if (mData?.manpowerData && typeof mData.manpowerData === 'object') {
        Object.assign(mergedMp, mData.manpowerData);
      }
    }
    if (monthData.manpowerData && typeof monthData.manpowerData === 'object') {
      Object.assign(mergedMp, monthData.manpowerData);
    }

    setGlobalDataState(prev => ({
      ...prev,
      staffList,
      leaveRecords,
      manpowerData: Object.keys(mergedMp).length > 0 ? { ...(prev.manpowerData || {}), ...mergedMp } : (prev.manpowerData || {}),
      dailyOvertime: { ...(prev.dailyOvertime || {}), ...(monthData.dailyOvertime || {}) },
      weeklyOvertime: { ...(prev.weeklyOvertime || {}), ...(monthData.weeklyOvertime || {}) },
      dailyAttendance: { ...(prev.dailyAttendance || {}), ...(monthData.dailyAttendance || {}) },
      dailyExternalAudit: { ...(prev.dailyExternalAudit || {}), ...(monthData.dailyExternalAudit || {}) },
      dailyCPA: { ...(prev.dailyCPA || {}), ...(monthData.dailyCPA || {}) },
      dailyGSI: { ...(prev.dailyGSI || {}), ...(monthData.dailyGSI || {}) },
      guestComplaints: monthData.guestComplaints && Array.isArray(monthData.guestComplaints) && monthData.guestComplaints.length > 0
        ? mergeArrayById(prev.guestComplaints || [], monthData.guestComplaints)
        : (prev.guestComplaints || []),
      affiliateHistory: monthData.affiliateHistory && Array.isArray(monthData.affiliateHistory) && monthData.affiliateHistory.length > 0
        ? mergeArrayById(prev.affiliateHistory || [], monthData.affiliateHistory)
        : (prev.affiliateHistory || [])
    }));
  }, [filters.month, outletMonthlyData]);

  const [outletConfigVersion, setOutletConfigVersion] = useState<number>(0);
  useEffect(() => {
    const handleConfigChange = () => {
      setOutletConfigVersion(v => v + 1);
    };
    window.addEventListener('appOutletConfigsChanged', handleConfigChange);
    window.addEventListener('appOutletDeleted', handleConfigChange);
    return () => {
      window.removeEventListener('appOutletConfigsChanged', handleConfigChange);
      window.removeEventListener('appOutletDeleted', handleConfigChange);
    };
  }, []);

  const mergedAllOutletsData = useMemo(() => {
    const activeNames = new Set(getActiveOutletNames());
    const merged: Record<string, any> = {};

    // 1. Include all valid outlets from Firestore listener & server sync (allOutletsData)
    Object.entries(allOutletsData).forEach(([oName, oVal]: [string, any]) => {
      if (oVal) {
        merged[oName] = { ...oVal, isDeleted: false };
      }
    });

    // 2. Also ensure all configured active outlets exist in merged
    activeNames.forEach(name => {
      if (!merged[name]) {
        merged[name] = { monthlyData: {}, isDeleted: false };
      }
    });

    // 3. If user is currently editing an outlet, merge active local state synchronously
    // so any numbers entered in this outlet instantly reflect on the Regional Page!
    if (user.selectedOutlet) {
      // Find matching key (exact or case-insensitive)
      const matchedKey = Object.keys(merged).find(
        k => k.trim().toUpperCase() === user.selectedOutlet!.trim().toUpperCase()
      ) || user.selectedOutlet;

      const activeOutletData = { ...(merged[matchedKey] || {}) };
      const monthlyDataMap = { ...(activeOutletData.monthlyData || {}) };

      // Merge all months from outletMonthlyData
      Object.entries(outletMonthlyData).forEach(([mKey, mVal]) => {
        const rawMVal = (mVal as any) || {};
        const mMerged = {
          ...(activeOutletData[mKey] || {}),
          ...rawMVal,
          sales: rawMVal.sales || activeOutletData[mKey]?.sales || {},
          dailyRecording: rawMVal.dailyRecording || rawMVal.sales?.dailyRecording || activeOutletData[mKey]?.dailyRecording || {},
          dailyTargets: rawMVal.dailyTargets || rawMVal.sales?.dailyTargets || activeOutletData[mKey]?.dailyTargets || {},
          expenses: rawMVal.expenses || activeOutletData[mKey]?.expenses || {},
          dailyMainKitchenLedger: rawMVal.dailyMainKitchenLedger || activeOutletData[mKey]?.dailyMainKitchenLedger || {},
          dailyMainStoreLedger: rawMVal.dailyMainStoreLedger || activeOutletData[mKey]?.dailyMainStoreLedger || {},
          dailyChemicalLedger: rawMVal.dailyChemicalLedger || activeOutletData[mKey]?.dailyChemicalLedger || {},
          dailyCashLedger: rawMVal.dailyCashLedger || activeOutletData[mKey]?.dailyCashLedger || {},
          dailyCommodityLedger: rawMVal.dailyCommodityLedger || activeOutletData[mKey]?.dailyCommodityLedger || {},
          dailyGuestSuppliesLedger: rawMVal.dailyGuestSuppliesLedger || activeOutletData[mKey]?.dailyGuestSuppliesLedger || {},
          dailyCityLedger: rawMVal.dailyCityLedger || activeOutletData[mKey]?.dailyCityLedger || {},
          dailyTgifLedger: rawMVal.dailyTgifLedger || activeOutletData[mKey]?.dailyTgifLedger || {},
          dailySukandaLedger: rawMVal.dailySukandaLedger || activeOutletData[mKey]?.dailySukandaLedger || {},
          dailyEverestLedger: rawMVal.dailyEverestLedger || activeOutletData[mKey]?.dailyEverestLedger || {},
          dailyPanfilaLedger: rawMVal.dailyPanfilaLedger || activeOutletData[mKey]?.dailyPanfilaLedger || {},
          dailyIkigaiLedger: rawMVal.dailyIkigaiLedger || activeOutletData[mKey]?.dailyIkigaiLedger || {},
          dailyKebunkuLedger: rawMVal.dailyKebunkuLedger || activeOutletData[mKey]?.dailyKebunkuLedger || {},
          dailySaungKubilLedger: rawMVal.dailySaungKubilLedger || activeOutletData[mKey]?.dailySaungKubilLedger || {},
          monthlyCogsData: rawMVal.monthlyCogsData || activeOutletData[mKey]?.monthlyCogsData || {},
          dailyQA: rawMVal.dailyQA || activeOutletData[mKey]?.dailyQA || {},
          dailyGoogleReview: rawMVal.dailyGoogleReview || activeOutletData[mKey]?.dailyGoogleReview || {},
          dailyBreakTime: rawMVal.dailyBreakTime || activeOutletData[mKey]?.dailyBreakTime || {},
          staffList: rawMVal.staffList || globalData.staffList,
          leaveRecords: rawMVal.leaveRecords || globalData.leaveRecords,
          dailyAttendance: rawMVal.dailyAttendance || globalData.dailyAttendance,
          dailyOvertime: rawMVal.dailyOvertime || globalData.dailyOvertime,
          weeklyOvertime: rawMVal.weeklyOvertime || globalData.weeklyOvertime,
          dailyExternalAudit: rawMVal.dailyExternalAudit || globalData.dailyExternalAudit,
          dailyCPA: rawMVal.dailyCPA || globalData.dailyCPA,
          dailyGSI: (globalData as any).dailyGSI || rawMVal.dailyGSI || {},
          guestComplaints: rawMVal.guestComplaints || globalData.guestComplaints,
          manpowerData: rawMVal.manpowerData || globalData.manpowerData || currentData.manpowerData,
          dailyVoidBills: rawMVal.dailyVoidBills || activeOutletData[mKey]?.dailyVoidBills || {},
          voidBills: rawMVal.voidBills || activeOutletData[mKey]?.voidBills || [],
        };
        activeOutletData[mKey] = mMerged;
        monthlyDataMap[mKey] = mMerged;
      });

      // Also ensure current active month is completely up to date with currentData with ZERO delay
      const currMonthKey = String(filters.month !== undefined ? filters.month : new Date().getMonth());
      const currentMonthMerged = {
        ...(activeOutletData[currMonthKey] || {}),
        ...(outletMonthlyData[currMonthKey] || {}),
        ...currentData,
        sales: currentData.sales || activeOutletData[currMonthKey]?.sales || {},
        dailyRecording: currentData.sales?.dailyRecording || currentData.dailyRecording || activeOutletData[currMonthKey]?.dailyRecording || {},
        dailyTargets: currentData.dailyTargets || currentData.sales?.dailyTargets || activeOutletData[currMonthKey]?.dailyTargets || {},
        expenses: currentData.expenses || activeOutletData[currMonthKey]?.expenses || {},
        dailyMainKitchenLedger: currentData.dailyMainKitchenLedger || activeOutletData[currMonthKey]?.dailyMainKitchenLedger || {},
        dailyMainStoreLedger: currentData.dailyMainStoreLedger || activeOutletData[currMonthKey]?.dailyMainStoreLedger || {},
        dailyChemicalLedger: currentData.dailyChemicalLedger || activeOutletData[currMonthKey]?.dailyChemicalLedger || {},
        dailyCashLedger: currentData.dailyCashLedger || activeOutletData[currMonthKey]?.dailyCashLedger || {},
        dailyCommodityLedger: currentData.dailyCommodityLedger || activeOutletData[currMonthKey]?.dailyCommodityLedger || {},
        dailyGuestSuppliesLedger: currentData.dailyGuestSuppliesLedger || activeOutletData[currMonthKey]?.dailyGuestSuppliesLedger || {},
        dailyCityLedger: currentData.dailyCityLedger || activeOutletData[currMonthKey]?.dailyCityLedger || {},
        dailyTgifLedger: (currentData as any).dailyTgifLedger || activeOutletData[currMonthKey]?.dailyTgifLedger || {},
        dailySukandaLedger: (currentData as any).dailySukandaLedger || activeOutletData[currMonthKey]?.dailySukandaLedger || {},
        dailyEverestLedger: (currentData as any).dailyEverestLedger || activeOutletData[currMonthKey]?.dailyEverestLedger || {},
        dailyPanfilaLedger: (currentData as any).dailyPanfilaLedger || activeOutletData[currMonthKey]?.dailyPanfilaLedger || {},
        dailyIkigaiLedger: (currentData as any).dailyIkigaiLedger || activeOutletData[currMonthKey]?.dailyIkigaiLedger || {},
        dailyKebunkuLedger: (currentData as any).dailyKebunkuLedger || activeOutletData[currMonthKey]?.dailyKebunkuLedger || {},
        dailySaungKubilLedger: (currentData as any).dailySaungKubilLedger || activeOutletData[currMonthKey]?.dailySaungKubilLedger || {},
        dailyGasLedger: (currentData as any).dailyGasLedger || activeOutletData[currMonthKey]?.dailyGasLedger || {},
        dailyThirdPartyLedger: (currentData as any).dailyThirdPartyLedger || activeOutletData[currMonthKey]?.dailyThirdPartyLedger || {},
        energyCost: (currentData as any).energyCost || activeOutletData[currMonthKey]?.energyCost || {},
        monthlyCogsData: currentData.monthlyCogsData || activeOutletData[currMonthKey]?.monthlyCogsData || {},
        dailyQA: currentData.dailyQA || activeOutletData[currMonthKey]?.dailyQA || {},
        dailyGoogleReview: currentData.dailyGoogleReview || activeOutletData[currMonthKey]?.dailyGoogleReview || {},
        dailyBreakTime: currentData.dailyBreakTime || activeOutletData[currMonthKey]?.dailyBreakTime || {},
        staffList: globalData.staffList,
        leaveRecords: globalData.leaveRecords,
        dailyAttendance: globalData.dailyAttendance,
        dailyOvertime: globalData.dailyOvertime,
        weeklyOvertime: globalData.weeklyOvertime,
        dailyExternalAudit: globalData.dailyExternalAudit,
        dailyCPA: globalData.dailyCPA,
        dailyGSI: (globalData as any).dailyGSI || (currentData as any)?.dailyGSI || {},
        guestComplaints: globalData.guestComplaints,
        manpowerData: currentData.manpowerData || globalData.manpowerData,
        dailyVoidBills: (currentData as any).dailyVoidBills || activeOutletData[currMonthKey]?.dailyVoidBills || {},
        voidBills: (currentData as any).voidBills || activeOutletData[currMonthKey]?.voidBills || [],
      };
      activeOutletData[currMonthKey] = currentMonthMerged;
      monthlyDataMap[currMonthKey] = currentMonthMerged;

      // Attach root level properties for modules reading outlet-level root
      activeOutletData.monthlyData = monthlyDataMap;
      activeOutletData.sales = currentData.sales || activeOutletData.sales;
      activeOutletData.dailyRecording = currentData.sales?.dailyRecording || currentData.dailyRecording || activeOutletData.dailyRecording;
      activeOutletData.dailyTargets = currentData.dailyTargets || currentData.sales?.dailyTargets || activeOutletData.dailyTargets;
      activeOutletData.expenses = currentData.expenses || activeOutletData.expenses;
      activeOutletData.staffList = globalData.staffList;
      activeOutletData.leaveRecords = globalData.leaveRecords;
      activeOutletData.dailyAttendance = globalData.dailyAttendance;
      activeOutletData.dailyOvertime = globalData.dailyOvertime;
      activeOutletData.weeklyOvertime = globalData.weeklyOvertime;
      activeOutletData.dailyExternalAudit = globalData.dailyExternalAudit;
      activeOutletData.dailyCPA = globalData.dailyCPA;
      activeOutletData.dailyVoidBills = (currentData as any).dailyVoidBills || activeOutletData.dailyVoidBills || {};
      activeOutletData.voidBills = (currentData as any).voidBills || activeOutletData.voidBills || [];
      activeOutletData.dailyGSI = (globalData as any).dailyGSI;
      activeOutletData.guestComplaints = globalData.guestComplaints;
      activeOutletData.manpowerData = currentData.manpowerData || globalData.manpowerData;
      activeOutletData.monthlyCogsData = currentData.monthlyCogsData || activeOutletData.monthlyCogsData;
      activeOutletData.dailyMainKitchenLedger = currentData.dailyMainKitchenLedger || activeOutletData.dailyMainKitchenLedger;
      activeOutletData.dailyMainStoreLedger = currentData.dailyMainStoreLedger || activeOutletData.dailyMainStoreLedger;
      activeOutletData.dailyChemicalLedger = currentData.dailyChemicalLedger || activeOutletData.dailyChemicalLedger;
      activeOutletData.dailyCashLedger = currentData.dailyCashLedger || activeOutletData.dailyCashLedger;
      activeOutletData.dailyCommodityLedger = currentData.dailyCommodityLedger || activeOutletData.dailyCommodityLedger;
      activeOutletData.dailyGuestSuppliesLedger = currentData.dailyGuestSuppliesLedger || activeOutletData.dailyGuestSuppliesLedger;
      activeOutletData.dailyCityLedger = currentData.dailyCityLedger || activeOutletData.dailyCityLedger;
      activeOutletData.dailyTgifLedger = (currentData as any).dailyTgifLedger || activeOutletData.dailyTgifLedger;
      activeOutletData.dailySukandaLedger = (currentData as any).dailySukandaLedger || activeOutletData.dailySukandaLedger;
      activeOutletData.dailyEverestLedger = (currentData as any).dailyEverestLedger || activeOutletData.dailyEverestLedger;
      activeOutletData.dailyPanfilaLedger = (currentData as any).dailyPanfilaLedger || activeOutletData.dailyPanfilaLedger;
      activeOutletData.dailyIkigaiLedger = (currentData as any).dailyIkigaiLedger || activeOutletData.dailyIkigaiLedger;
      activeOutletData.dailyKebunkuLedger = (currentData as any).dailyKebunkuLedger || activeOutletData.dailyKebunkuLedger;
      activeOutletData.dailySaungKubilLedger = (currentData as any).dailySaungKubilLedger || activeOutletData.dailySaungKubilLedger;
      activeOutletData.dailyGasLedger = (currentData as any).dailyGasLedger || activeOutletData.dailyGasLedger;
      activeOutletData.dailyThirdPartyLedger = (currentData as any).dailyThirdPartyLedger || activeOutletData.dailyThirdPartyLedger;
      activeOutletData.energyCost = (currentData as any).energyCost || activeOutletData.energyCost;
      activeOutletData.dailyQA = currentData.dailyQA || activeOutletData.dailyQA;
      activeOutletData.dailyGoogleReview = currentData.dailyGoogleReview || activeOutletData.dailyGoogleReview;
      activeOutletData.dailyBreakTime = currentData.dailyBreakTime || activeOutletData.dailyBreakTime;
      activeOutletData.logisticItems = currentData.logisticItems || activeOutletData.logisticItems || [];
      activeOutletData.dailyLogisticRecords = currentData.dailyLogisticRecords || activeOutletData.dailyLogisticRecords || {};
      activeOutletData.peminjamanRecords = currentData.peminjamanRecords || activeOutletData.peminjamanRecords || [];
      activeOutletData.logisticBeginningStocks = currentData.logisticBeginningStocks || activeOutletData.logisticBeginningStocks || {};
      activeOutletData.logisticPeriodPrices = currentData.logisticPeriodPrices || activeOutletData.logisticPeriodPrices || {};
      
      merged[matchedKey] = activeOutletData;
      if (matchedKey !== user.selectedOutlet) {
        merged[user.selectedOutlet] = activeOutletData;
      }
    }
    return merged;
  }, [allOutletsData, user.selectedOutlet, outletMonthlyData, globalData, currentData, filters.month, outletConfigVersion]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, []);

  const getTodayStr = (): string => {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getDailyCounts = useCallback((dataStore: any) => {
    const today = getTodayStr();
    let complaintCount = 0;
    let overtimeCount = 0;
    let attendanceCount = 0;
    let cpaCount = 0;
    let auditCount = 0;
    let leaveCount = 0;
    let revenueCount = 0;
    let gsiCount = 0;
    let googleReviewCount = 0;
    let targetCount = 0;
    let expenseCount = 0;

    if (dataStore) {
      if (dataStore.guestComplaints) {
        complaintCount = dataStore.guestComplaints.filter((c: any) => c.date === today).length;
      }
      if (dataStore.dailyOvertime?.[today]) {
        overtimeCount = dataStore.dailyOvertime[today].length;
      }
      if (dataStore.dailyAttendance?.[today]) {
        attendanceCount = dataStore.dailyAttendance[today].length;
      }
      if (dataStore.dailyCPA?.[today]) {
        cpaCount = dataStore.dailyCPA[today].length;
      }
      if (dataStore.dailyExternalAudit?.[today]) {
        auditCount = dataStore.dailyExternalAudit[today].length;
      }
      if (dataStore.leaveRecords) {
        leaveCount = dataStore.leaveRecords.filter((r: any) => r.date === today).length;
      }
      // New requested additions
      if (dataStore.sales?.dailyRecording?.[today]) {
        revenueCount = 1;
      }
      if (dataStore.dailyGSI?.[today]) {
        gsiCount = dataStore.dailyGSI[today].length;
      }
      if (dataStore.dailyGoogleReview?.[today]) {
        googleReviewCount = 1;
      }
      if (dataStore.dailyTargets?.[today] !== undefined) {
        targetCount = 1;
      }
      if (dataStore.expenses?.[today]) {
        expenseCount = 1;
      }
    }
    return (
      complaintCount +
      overtimeCount +
      attendanceCount +
      cpaCount +
      auditCount +
      leaveCount +
      revenueCount +
      gsiCount +
      googleReviewCount +
      targetCount +
      expenseCount
    );
  }, []);

  const setGlobalData = useCallback((updater: any) => {
    setGlobalDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      
      try {
        // Replicate these changes directly into the current active month in outletMonthlyDataState!
        setOutletMonthlyDataState(prevMonths => {
          const mKey = filters.month;
          const nextMonths: Record<string, any> = {
            ...prevMonths,
            [mKey]: {
              ...INITIAL_STATE,
              ...(prevMonths[mKey] || {}),
              ...next
            }
          };
          if (next.manpowerData && typeof next.manpowerData === 'object') {
            for (let m = 0; m < 12; m++) {
              const k = m.toString();
              nextMonths[k] = {
                ...INITIAL_STATE,
                ...(nextMonths[k] || {}),
                manpowerData: {
                  ...(nextMonths[k]?.manpowerData || {}),
                  ...next.manpowerData
                }
              };
            }
          }
          return nextMonths;
        });
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, [filters.month]);

  const setOutletMonthlyData = useCallback((updater: any) => {
    setOutletMonthlyDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return next;
    });
  }, []);

  const persistSyncedHashes = useCallback(() => {}, []);

  // Synchronously serialize and persist state to localStorage to prevent data loss on refresh/crash
  // Removed local storage overrides as they overwrite real database inputs in multi-user settings

  const handleLogin = async (email: string, outlet: Outlet) => {
    isHydrated.current = false;
    setIsRefreshing(true);

    let cloudData = await fetchUserData(email, outlet);

    const emailKey = email.toLowerCase();
    const outletKey = outlet;
    const hasPending = safeStorage.getItem(`HAS_PENDING_SYNC_${emailKey}_${outletKey}`) === 'true';

    if (hasPending) {
      const pendingGlobalStr = safeStorage.getItem(`PENDING_SYNC_GLOBAL_${emailKey}_${outletKey}`);
      const pendingOutletStr = safeStorage.getItem(`PENDING_SYNC_OUTLET_${emailKey}_${outletKey}`);
      
      if (pendingGlobalStr || pendingOutletStr) {
        console.info("[Offline Recovery] Merging pending local data that failed to sync previously.");
        if (!cloudData) {
          cloudData = {};
        }
        try {
          if (pendingGlobalStr) {
            const parsedGlobal = JSON.parse(pendingGlobalStr);
            Object.keys(parsedGlobal).forEach(fKey => {
              cloudData[fKey] = parsedGlobal[fKey];
            });
          }
          if (pendingOutletStr) {
            const parsedOutlet = JSON.parse(pendingOutletStr);
            Object.keys(parsedOutlet).forEach(mKey => {
              cloudData[mKey] = parsedOutlet[mKey];
            });
          }
          showToast("Data tersimpan Anda telah berhasil disinkronkan ke Firebase.", "info");
        } catch (e) {
          console.error('[Offline Recovery] Error parsing pending sync data:', e);
        }
      }
    }

    if (cloudData) {
      // Clean old/uninputted default logistics items permanently from fetched data
      cloudData = cleanOutletDataOfDefaultLogistics(cloudData);

      // Clean staffList in cloudData if exists
      if (cloudData.staffList) {
        const seen = new Set();
        cloudData.staffList = cloudData.staffList
          .sort(sortStaffList)
          .filter((s: any) => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          })
          .map((s: any) => {
            const { leaveEntitlement, ...rest } = s;
            return rest;
          });
      }

      const { staffList, leaveRecords, dailyOvertime, dailyAttendance, dailyExternalAudit, dailyCPA, guestComplaints, affiliateHistory, ...rest } = cloudData;
      
      const hydratedGlobal: any = {
        staffList: staffList || INITIAL_STATE.staffList,
        leaveRecords: leaveRecords || INITIAL_STATE.leaveRecords,
        dailyOvertime: dailyOvertime || INITIAL_STATE.dailyOvertime,
        dailyAttendance: dailyAttendance || INITIAL_STATE.dailyAttendance,
        dailyExternalAudit: dailyExternalAudit || {},
        dailyCPA: dailyCPA || {},
        guestComplaints: guestComplaints || [],
        affiliateHistory: affiliateHistory || []
      };

      setGlobalDataState(hydratedGlobal);
      setOutletMonthlyData(rest || {});

      // Build initial sync hashes
      const globalFieldsList = ['staffList', 'leaveRecords', 'dailyOvertime', 'weeklyOvertime', 'dailyAttendance', 'dailyExternalAudit', 'dailyCPA', 'dailyGSI', 'guestComplaints', 'affiliateHistory', 'manpowerData'];
      const nextGlobalHashes: Record<string, string> = {};
      globalFieldsList.forEach(field => {
        nextGlobalHashes[field] = JSON.stringify((hydratedGlobal as any)[field]);
      });
      lastSyncedGlobal.current = nextGlobalHashes;

      const nextOutletHashes: Record<string, string> = {};
      Object.keys(rest || {}).forEach(monthKey => {
        nextOutletHashes[monthKey] = JSON.stringify(rest[monthKey]);
      });
      lastSyncedOutlet.current = nextOutletHashes;
      isHydrated.current = true;
    }

    setUser({ email, isLoggedIn: true, selectedOutlet: outlet });
    setIsPublicView(false);
    safeStorage.setItem('BARN_USER_SESSION', email);
    safeStorage.setItem('MANUAL_USER_EMAIL', email);
    safeStorage.setItem('BARN_SELECTED_OUTLET', outlet);

    setSyncStatus('online');
    setIsRefreshing(false);
  };

  const forceSync = useCallback(async () => {
    if (!user.isLoggedIn || !user.selectedOutlet || isQuotaExceeded()) return;
    
    setSyncStatus('syncing');
    
    const globalToSync = {
      staffList: globalData.staffList,
      leaveRecords: globalData.leaveRecords,
      dailyOvertime: globalData.dailyOvertime,
      weeklyOvertime: globalData.weeklyOvertime,
      dailyAttendance: globalData.dailyAttendance,
      dailyExternalAudit: globalData.dailyExternalAudit,
      dailyCPA: globalData.dailyCPA,
      dailyGSI: (globalData as any).dailyGSI || {},
      guestComplaints: globalData.guestComplaints,
      affiliateHistory: globalData.affiliateHistory,
      manpowerData: globalData.manpowerData || {}
    };

    const oldGlobalData: any = {};
    const globalFields = ['staffList', 'leaveRecords', 'dailyOvertime', 'weeklyOvertime', 'dailyAttendance', 'dailyExternalAudit', 'dailyCPA', 'dailyGSI', 'guestComplaints', 'affiliateHistory', 'manpowerData'];
    globalFields.forEach(field => {
      if (lastSyncedGlobal.current[field]) {
        try {
          oldGlobalData[field] = JSON.parse(lastSyncedGlobal.current[field]);
        } catch (e) {
          oldGlobalData[field] = undefined;
        }
      }
    });

    const oldOutletData: Record<string, any> = {};
    Object.keys(lastSyncedOutlet.current).forEach(monthKey => {
      if (lastSyncedOutlet.current[monthKey]) {
        try {
          oldOutletData[monthKey] = JSON.parse(lastSyncedOutlet.current[monthKey]);
        } catch (e) {
          oldOutletData[monthKey] = undefined;
        }
      }
    });
    
    const [gSuccess, oSuccess] = await Promise.all([
      saveGlobalData(user.email, globalToSync, oldGlobalData),
      saveOutletData(user.email, user.selectedOutlet!, outletMonthlyData, oldOutletData, undefined, true)
    ]);
    
    if (gSuccess && oSuccess) {
      // Refresh all hashes on manual force sync
      globalFields.forEach(field => {
        lastSyncedGlobal.current[field] = JSON.stringify((globalData as any)[field]);
      });
      Object.keys(outletMonthlyData).forEach(monthKey => {
        lastSyncedOutlet.current[monthKey] = JSON.stringify(outletMonthlyData[monthKey]);
      });
      persistSyncedHashes();

      setSyncStatus('online');
      showToast("Data berhasil disinkronkan secara manual.", "success");
    } else {
      setSyncStatus('error');
      showToast("Gagal melakukan sinkronisasi manual. Periksa koneksi internet Anda.", "error");
    }
  }, [globalData, outletMonthlyData, user.email, user.isLoggedIn, user.selectedOutlet, showToast, persistSyncedHashes]);

  // Real-time spreadsheet-like submit and sync trigger from any outlet feature
  useEffect(() => {
    const handleSubmitSyncFeature = async (e: any) => {
      const featureName = e?.detail?.featureName || 'Fitur';
      isPrioritySync.current = true;
      if (flushPendingSyncRef.current) {
        await flushPendingSyncRef.current();
      } else {
        await forceSync();
      }
      showToast(`Data ${featureName} berhasil disubmit & disinkronkan ke seluruh pengguna!`, 'success');
    };
    window.addEventListener('appSubmitSyncFeature', handleSubmitSyncFeature);
    return () => window.removeEventListener('appSubmitSyncFeature', handleSubmitSyncFeature);
  }, [forceSync, showToast]);

  useEffect(() => {
    if (!user.isLoggedIn || !user.selectedOutlet) return;
    
    // Strict guard against overwriting cloud data with initial empty state during hydration
    if (!isHydrated.current) {
      return;
    }
    
    // 1. Identify which global fields changed
    const globalFields = ['staffList', 'leaveRecords', 'dailyOvertime', 'weeklyOvertime', 'dailyAttendance', 'dailyExternalAudit', 'dailyCPA', 'dailyGSI', 'guestComplaints', 'affiliateHistory', 'manpowerData'];
    const changedGlobalFields: Partial<any> = {};
    const newGlobalHashes: Record<string, string> = { ...lastSyncedGlobal.current };

    globalFields.forEach(field => {
      const currentVal = (globalData as any)[field];
      const currentHash = JSON.stringify(currentVal);
      if (currentHash !== lastSyncedGlobal.current[field]) {
        changedGlobalFields[field] = currentVal;
        newGlobalHashes[field] = currentHash;
      }
    });

    // 2. Identify which months changed
    const changedMonths: Record<string, any> = {};
    const newOutletHashes: Record<string, string> = { ...lastSyncedOutlet.current };

    Object.keys(outletMonthlyData).forEach(monthKey => {
      const currentVal = outletMonthlyData[monthKey];
      const currentHash = JSON.stringify(currentVal);
      if (currentHash !== lastSyncedOutlet.current[monthKey]) {
        // Prevent saving empty month data if cloud previously had data
        if (!currentVal || Object.keys(currentVal).length === 0) {
          if (lastSyncedOutlet.current[monthKey] && lastSyncedOutlet.current[monthKey] !== '{}') {
            console.warn(`[Sync Protection] Blocked accidental wiping of month ${monthKey}`);
            return;
          }
        }
        changedMonths[monthKey] = currentVal;
        newOutletHashes[monthKey] = currentHash;
      }
    });

    const globalChanged = Object.keys(changedGlobalFields).length > 0;
    const outletChanged = Object.keys(changedMonths).length > 0;

    if (!globalChanged && !outletChanged) {
      flushPendingSyncRef.current = null;
      return;
    }

    // SAVE LATEST LOCAL changes to survive sudden offline/quota events or browser close
    try {
      const emailKey = user.email!.toLowerCase();
      const outletKey = user.selectedOutlet!;
      safeStorage.setItem(`PENDING_SYNC_GLOBAL_${emailKey}_${outletKey}`, JSON.stringify(globalData));
      safeStorage.setItem(`PENDING_SYNC_OUTLET_${emailKey}_${outletKey}`, JSON.stringify(outletMonthlyData));
      safeStorage.setItem(`HAS_PENDING_SYNC_${emailKey}_${outletKey}`, 'true');
    } catch (e) {
      console.error('[Offline Backup] Local save error:', e);
    }

    if (quotaExceededState) {
      setSyncStatus('error');
      return;
    }

    setSyncStatus('syncing');
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    
    const performSync = async (): Promise<boolean> => {
      flushPendingSyncRef.current = null;
      let gSuccess = true;
      let oSuccess = true;

      const oldOutletData: Record<string, any> = {};
      Object.keys(changedMonths).forEach(monthKey => {
        if (lastSyncedOutlet.current[monthKey]) {
          try {
            oldOutletData[monthKey] = JSON.parse(lastSyncedOutlet.current[monthKey]);
          } catch (e) {
            oldOutletData[monthKey] = undefined;
          }
        }
      });

      const isPriority = isPrioritySync.current;
      isPrioritySync.current = false;

      oSuccess = await saveOutletData(
        user.email, 
        user.selectedOutlet!, 
        changedMonths, 
        oldOutletData,
        globalChanged ? changedGlobalFields : undefined,
        isPriority
      );

      if (oSuccess) {
        if (globalChanged) {
          Object.keys(changedGlobalFields).forEach(field => {
            lastSyncedGlobal.current[field] = JSON.stringify(changedGlobalFields[field]);
          });
        }
        if (outletChanged) {
          Object.keys(changedMonths).forEach(monthKey => {
            lastSyncedOutlet.current[monthKey] = JSON.stringify(changedMonths[monthKey]);
          });
        }
        setSyncStatus('online');
        persistSyncedHashes();
        
        // Clear pending items on successful database confirmation
        try {
          const emailKey = user.email!.toLowerCase();
          const outletKey = user.selectedOutlet!;
          safeStorage.removeItem(`PENDING_SYNC_GLOBAL_${emailKey}_${outletKey}`);
          safeStorage.removeItem(`PENDING_SYNC_OUTLET_${emailKey}_${outletKey}`);
          safeStorage.setItem(`HAS_PENDING_SYNC_${emailKey}_${outletKey}`, 'false');
        } catch (e) {
          // Ignore
        }
        return true;
      } else {
        setSyncStatus('error');
        return false;
      }
    };

    flushPendingSyncRef.current = performSync;

    if (isPrioritySync.current) {
      isPrioritySync.current = false;
      performSync();
    } else {
      syncTimeout.current = setTimeout(performSync, 1200);
    }

    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, [globalData, outletMonthlyData, user.email, user.isLoggedIn, user.selectedOutlet, syncTrigger, persistSyncedHashes, quotaExceededState]);

  // Prevent data loss on refresh if sync is pending
  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (syncStatus === 'syncing') {
          e.preventDefault();
          e.returnValue = '';
        }
      };
      
      const w = safeWindow.obj();
      if (w) {
        w.addEventListener('beforeunload', handleBeforeUnload);
        return () => w.removeEventListener('beforeunload', handleBeforeUnload);
      }
    }, [syncStatus]);

  // Lightweight connection & quota check (zero redundant Firestore reads to save quota)
  useEffect(() => {
    if (!user.isLoggedIn) return;
    
    const handleOnline = () => {
      setSyncStatus('online');
      setQuotaExceededState(isQuotaExceeded());
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Light ping to server API health check (costs 0 Firestore quota/reads)
    const checkServerHealth = async () => {
      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setSyncStatus('online');
        }
      } catch {
        // Network or server unreachable
      }
    };

    const interval = setInterval(checkServerHealth, 60000);
    checkServerHealth();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [user.isLoggedIn]);

  // Auto-refresh when the app becomes visible/active again (especially useful on mobile browsers and tablets which suspend tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.info('[Visibility] Tab activated, refreshing latest outlet and regional data from server...');
        if (user.isLoggedIn && user.email && user.selectedOutlet) {
          handleLogin(user.email, user.selectedOutlet);
        }
        fetchAllOutletsData().then(initialData => {
          if (initialData && Object.keys(initialData).length > 0) {
            setAllOutletsData(prev => ({ ...prev, ...initialData }));
          }
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user.isLoggedIn, user.email, user.selectedOutlet]);

  useEffect(() => {
    if (!user.isLoggedIn || !user.email || !user.selectedOutlet) return;
    const unsubscribe = startRealtimeListener(
      user.email, 
      user.selectedOutlet,
      (newData) => {
        const { staffList, leaveRecords, dailyOvertime, dailyAttendance, dailyExternalAudit, dailyCPA, guestComplaints, affiliateHistory, ...rest } = newData;
        
        const globalFields = ['staffList', 'leaveRecords', 'dailyOvertime', 'dailyAttendance', 'dailyExternalAudit', 'dailyCPA', 'guestComplaints', 'affiliateHistory'];

        setGlobalDataState(prev => {
          let hasChange = false;
          const nextGlobal = { ...prev };

          globalFields.forEach(field => {
            const cloudVal = newData[field];
            if (cloudVal === undefined) return;

            const cloudHash = JSON.stringify(cloudVal);
            const localHash = JSON.stringify(prev[field]);

            const lastSyncedHash = lastSyncedGlobal.current[field];
            const isLocalDirty = lastSyncedHash !== undefined && localHash !== lastSyncedHash;

            if (cloudHash !== lastSyncedHash) {
              if (!isLocalDirty) {
                // Local state is clean/in sync with last known server state: adopt server state 100% to handle deletions, modifications, etc.
                nextGlobal[field] = cloudVal;
                lastSyncedGlobal.current[field] = cloudHash;
                hasChange = true;
              }
              // If local state is dirty (has uncommitted edits/deletions), do NOT merge old cloud data over it,
              // as that resurrects deleted records! Local changes will sync to server authoritatively.
            }
          });

          if (hasChange && nextGlobal.staffList) {
            const seen = new Set();
            nextGlobal.staffList = nextGlobal.staffList
              .sort(sortStaffList)
              .filter((s: any) => {
                if (seen.has(s.id)) return false;
                seen.add(s.id);
                return true;
              });
          }

          if (hasChange) {
            try {
              const emailKey = user.email!.toLowerCase();
              const outletKey = user.selectedOutlet!;
              safeStorage.setItem(`BARN_LAST_SYNCED_GLOBAL_${emailKey}_${outletKey}`, JSON.stringify(lastSyncedGlobal.current));
            } catch (e) {
              // Ignore
            }
          }

          return hasChange ? nextGlobal : prev;
        });

        setOutletMonthlyData(prev => {
          let hasChange = false;
          const nextOutlet = { ...prev };

          Object.keys(rest).forEach(monthKey => {
            // Only process valid numeric month keys 0..11
            if (isNaN(parseInt(monthKey, 10)) || parseInt(monthKey, 10) < 0 || parseInt(monthKey, 10) > 11) return;

            let cloudVal = rest[monthKey];
            if (cloudVal === undefined) return;

            // Clean old/uninputted default logistics items permanently
            if (cloudVal.logisticItems) {
              cloudVal = {
                ...cloudVal,
                logisticItems: cleanLogisticItemsList(cloudVal.logisticItems)
              };
            }

            const cloudHash = JSON.stringify(cloudVal);
            const localHash = JSON.stringify(prev[monthKey] || {});

            const lastSyncedHash = lastSyncedOutlet.current[monthKey];
            const isLocalDirty = lastSyncedHash !== undefined && localHash !== lastSyncedHash;

            if (cloudHash !== lastSyncedHash) {
              if (!isLocalDirty) {
                // Local state is clean: overwrite month data entirely to respect additions, edits, and deletions
                nextOutlet[monthKey] = cloudVal;
                lastSyncedOutlet.current[monthKey] = cloudHash;
                hasChange = true;
              } else {
                // Local state is partially dirty: perform smart field-level merge like a spreadsheet
                let lastSyncedMonthObj: any = {};
                try {
                  if (lastSyncedHash) lastSyncedMonthObj = JSON.parse(lastSyncedHash);
                } catch (e) {}

                const currentMonthObj = prev[monthKey] || {};
                const mergedMonth: Record<string, any> = { ...currentMonthObj };
                let fieldChanged = false;

                Object.keys(cloudVal).forEach(fKey => {
                  const cloudF = cloudVal[fKey];
                  const localF = currentMonthObj[fKey];
                  const lastSyncedF = lastSyncedMonthObj[fKey];

                  const cloudFHash = JSON.stringify(cloudF);
                  const localFHash = JSON.stringify(localF);
                  const lastSyncedFHash = JSON.stringify(lastSyncedF);

                  // If user did not modify this particular feature, adopt the cloud update immediately
                  if (cloudFHash !== lastSyncedFHash) {
                    if (localFHash === lastSyncedFHash || lastSyncedFHash === undefined) {
                      mergedMonth[fKey] = cloudF;
                      fieldChanged = true;
                    }
                  }
                });

                if (fieldChanged) {
                  nextOutlet[monthKey] = mergedMonth;
                  lastSyncedOutlet.current[monthKey] = cloudHash;
                  hasChange = true;
                }
              }
            }
          });

          if (hasChange) {
            try {
              const emailKey = user.email!.toLowerCase();
              const outletKey = user.selectedOutlet!;
              safeStorage.setItem(`BARN_LAST_SYNCED_OUTLET_${emailKey}_${outletKey}`, JSON.stringify(lastSyncedOutlet.current));
            } catch (e) {
              // Ignore
            }
          }

          return hasChange ? nextOutlet : prev;
        });
      },
      (status) => {
        setSyncStatus(prev => {
          if (prev === 'syncing') return prev;
          if (status === 'connected') return 'online';
          if (status === 'disconnected') return 'offline';
          return prev;
        });
      }
    );
    return unsubscribe;
  }, [user.isLoggedIn, user.email, user.selectedOutlet]);

  useEffect(() => {
    let monthIdx = parseInt(filters.month);
    let yearIdx = parseInt(filters.year);

    if (isNaN(monthIdx)) monthIdx = new Date().getMonth();
    if (isNaN(yearIdx)) yearIdx = new Date().getFullYear();

    const firstDay = new Date(yearIdx, monthIdx, 1);
    const lastDay = new Date(yearIdx, monthIdx + 1, 0);

    if (isNaN(firstDay.getTime()) || isNaN(lastDay.getTime())) return;
    
    const firstDayStr = toLocalDateStr(firstDay);
    const lastDayStr = toLocalDateStr(lastDay);
    const expectedMonthPrefix = `${yearIdx}-${String(monthIdx + 1).padStart(2, '0')}`;

    // Only update if dates are empty or outside the selected month/year to prevent jumping loop
    if (
      !filters.startDate || 
      !filters.endDate || 
      !filters.startDate.startsWith(expectedMonthPrefix)
    ) {
      setFilters(prev => ({
        ...prev,
        startDate: firstDayStr,
        endDate: lastDayStr
      }));
    }
  }, [filters.month, filters.year]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(safeWindow.isFullscreen());
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!safeWindow.isFullscreen()) {
      const res = safeWindow.requestFullscreen();
      if (res instanceof Promise) {
        res.then(() => setIsFullScreen(true)).catch((e) => console.error('[Full Screen] Request failed:', e));
      } else {
        setIsFullScreen(true);
      }
    } else {
      const res = safeWindow.exitFullscreen();
      if (res instanceof Promise) {
        res.then(() => setIsFullScreen(false)).catch((e) => console.error('[Full Screen] Exit failed:', e));
      } else {
        setIsFullScreen(false);
      }
    }
  };

  const restoreFullState = useCallback((fullData: any) => {
    const { staffList, leaveRecords, dailyOvertime, dailyAttendance, dailyExternalAudit, dailyCPA, guestComplaints, affiliateHistory, ...monthlyData } = fullData;
    setGlobalData({ 
      staffList: staffList || INITIAL_STATE.staffList, 
      leaveRecords: leaveRecords || INITIAL_STATE.leaveRecords,
      dailyOvertime: dailyOvertime || INITIAL_STATE.dailyOvertime,
      dailyAttendance: dailyAttendance || INITIAL_STATE.dailyAttendance,
      dailyExternalAudit: dailyExternalAudit || {},
      dailyCPA: dailyCPA || {},
      guestComplaints: guestComplaints || INITIAL_STATE.guestComplaints || [],
      affiliateHistory: affiliateHistory || []
    });
    setOutletMonthlyData(monthlyData);
    showToast("Data berhasil dipulihkan! Database telah diperbarui dengan versi cadangan.", "success");
  }, [showToast]);

  const updateCurrentData = useCallback((path: keyof AppState | Partial<AppState>, newValue?: any, priority: boolean = false) => {
    const updates: Record<string, any> = typeof path === 'string' ? { [path]: newValue } : path;
    
    const globalPaths = ['staffList', 'leaveRecords', 'dailyOvertime', 'weeklyOvertime', 'manpowerData', 'dailyAttendance', 'dailyExternalAudit', 'dailyCPA', 'guestComplaints', 'affiliateHistory', 'dailyGSI'];
    const globalUpdates: any = {};
    const monthlyUpdates: any = {};

    Object.entries(updates).forEach(([p, v]) => {
      if (globalPaths.includes(p)) {
        if (p === 'staffList' && Array.isArray(v)) {
          globalUpdates[p] = [...v].sort(sortStaffList);
        } else {
          globalUpdates[p] = v;
        }
        monthlyUpdates[p] = globalUpdates[p];
      } else {
        monthlyUpdates[p] = v;
      }
    });

    if (Object.keys(globalUpdates).length > 0) {
      setGlobalData(prev => ({ ...prev, ...globalUpdates }));
    }

    if (Object.keys(monthlyUpdates).length > 0) {
      setOutletMonthlyData(prev => {
        const monthKey = filters.month;
        const currentMonthBase = prev[monthKey] || INITIAL_STATE;

        // Synchronize dailyRecording and sales.dailyRecording
        if (monthlyUpdates.sales) {
          const sDaily = monthlyUpdates.sales.dailyRecording || (monthlyUpdates.sales as any).sales?.dailyRecording;
          if (sDaily) {
            monthlyUpdates.dailyRecording = {
              ...(currentMonthBase.dailyRecording || {}),
              ...sDaily
            };
            monthlyUpdates.sales = {
              ...monthlyUpdates.sales,
              dailyRecording: monthlyUpdates.dailyRecording
            };
          }
        } else if (monthlyUpdates.dailyRecording) {
          monthlyUpdates.sales = {
            ...(currentMonthBase.sales || {}),
            dailyRecording: {
              ...((currentMonthBase.sales && currentMonthBase.sales.dailyRecording) || {}),
              ...monthlyUpdates.dailyRecording
            }
          };
        }

        // If manpowerData is updated, replicate it across all 12 months in outletMonthlyData
        // so that switching months never encounters empty manpowerData!
        if (monthlyUpdates.manpowerData) {
          const nextMonths: Record<string, any> = { ...prev };
          for (let m = 0; m < 12; m++) {
            const mKey = m.toString();
            const existingMonth = nextMonths[mKey] || INITIAL_STATE;
            nextMonths[mKey] = {
              ...existingMonth,
              manpowerData: monthlyUpdates.manpowerData
            };
          }
          nextMonths[monthKey] = {
            ...currentMonthBase,
            ...monthlyUpdates,
            manpowerData: monthlyUpdates.manpowerData
          };
          return nextMonths;
        }

        // Also ensure that if dates belong to specific month indices, those months in prev are also updated
        const targetMonthsToUpdate: Record<string, Record<string, any>> = {};
        if (monthlyUpdates.dailyRecording) {
          Object.entries(monthlyUpdates.dailyRecording).forEach(([dStr, rec]) => {
            const parts = dStr.split('-');
            if (parts.length >= 2) {
              const mIdx = parseInt(parts[1], 10) - 1;
              if (!isNaN(mIdx) && mIdx >= 0 && mIdx < 12) {
                const mKey = mIdx.toString();
                if (!targetMonthsToUpdate[mKey]) targetMonthsToUpdate[mKey] = {};
                targetMonthsToUpdate[mKey][dStr] = rec;
              }
            }
          });
        }

        const nextMonths: Record<string, any> = {
          ...prev,
          [monthKey]: { ...currentMonthBase, ...monthlyUpdates }
        };

        Object.entries(targetMonthsToUpdate).forEach(([tMKey, entries]) => {
          if (tMKey !== monthKey) {
            const tBase = nextMonths[tMKey] || INITIAL_STATE;
            const updatedTDailyRec = {
              ...(tBase.dailyRecording || {}),
              ...entries
            };
            nextMonths[tMKey] = {
              ...tBase,
              dailyRecording: updatedTDailyRec,
              sales: {
                ...(tBase.sales || {}),
                dailyRecording: updatedTDailyRec
              }
            };
          }
        });

        return nextMonths;
      });
    }

    if (priority) {
      isPrioritySync.current = true;
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      setSyncTrigger(prev => prev + 1);
    }
  }, [filters.month]);

  const updateFullState = useCallback((updater: any, arg2?: any, arg3?: boolean) => {
    const priority = arg2 === true || arg3 === true;
    const currentState = dataRef.current;
    const newState = typeof updater === 'function' 
      ? updater(currentState) 
      : (typeof updater === 'string' ? { ...currentState, [updater]: arg2 } : { ...currentState, ...updater });
    const { staffList, leaveRecords, dailyOvertime, weeklyOvertime, manpowerData, dailyAttendance, dailyExternalAudit, dailyCPA, dailyGSI, guestComplaints, affiliateHistory, ...rest } = newState;
    
    const globalUpdates: any = {};
    if (staffList !== undefined) globalUpdates.staffList = Array.isArray(staffList) ? [...staffList].sort(sortStaffList) : [];
    if (leaveRecords !== undefined) globalUpdates.leaveRecords = leaveRecords;
    if (dailyOvertime !== undefined) globalUpdates.dailyOvertime = dailyOvertime;
    if (weeklyOvertime !== undefined) globalUpdates.weeklyOvertime = weeklyOvertime;
    if (manpowerData !== undefined) globalUpdates.manpowerData = manpowerData;
    if (dailyAttendance !== undefined) globalUpdates.dailyAttendance = dailyAttendance;
    if (dailyExternalAudit !== undefined) globalUpdates.dailyExternalAudit = dailyExternalAudit;
    if (dailyCPA !== undefined) globalUpdates.dailyCPA = dailyCPA;
    if (dailyGSI !== undefined) globalUpdates.dailyGSI = dailyGSI;
    if (guestComplaints !== undefined) globalUpdates.guestComplaints = guestComplaints;
    if (affiliateHistory !== undefined) globalUpdates.affiliateHistory = affiliateHistory;

    if (Object.keys(globalUpdates).length > 0) {
      setGlobalData(prev => ({ ...prev, ...globalUpdates }));
    }
    
    setOutletMonthlyData(prev => {
      const monthKey = filters.month;
      const currentMonthBase = prev[monthKey] || {};
      const nextMonthData = {
        ...INITIAL_STATE,
        ...currentMonthBase,
        ...rest,
        ...globalUpdates
      };

      const next = {
        ...prev,
        [monthKey]: nextMonthData
      };

      // Propagate global updates (staffList, manpowerData, etc.) cleanly to all 12 months
      if (Object.keys(globalUpdates).length > 0) {
        for (let m = 0; m < 12; m++) {
          const mk = m.toString();
          next[mk] = {
            ...(next[mk] || INITIAL_STATE),
            ...globalUpdates
          };
        }
      }

      // Propagate logistics fields to all months ONLY if logistics was explicitly updated
      const logisticsKeys = [
        'logisticItems',
        'logisticPeriodPrices',
        'logisticBeginningStocks',
        'dailyLogisticRecords',
        'peminjamanRecords'
      ];

      const hasLogisticsUpdate = (typeof updater === 'object' && updater !== null && logisticsKeys.some(k => (updater as any)[k] !== undefined)) ||
        (typeof updater === 'string' && logisticsKeys.includes(updater));

      if (hasLogisticsUpdate) {
        logisticsKeys.forEach(key => {
          if (rest[key] !== undefined) {
            for (let m = 0; m < 12; m++) {
              const mKey = String(m);
              next[mKey] = {
                ...(next[mKey] || INITIAL_STATE),
                [key]: rest[key]
              };
            }
          }
        });
      }

      // If expenses or daily ledgers are updated for dates in other months, sync to those target months as well
      const expenseKeys = [
        'expenses',
        'dailyNonCommodityLedger',
        'dailyCommodityLedger',
        'dailyMaintenanceLedger',
        'dailyAssetLedger',
        'dailyCasualLedger',
        'dailyAtkLedger',
        'dailyCashLedger',
        'dailyThirdPartyLedger',
        'dailyGasLedger'
      ];
      expenseKeys.forEach(ek => {
        if (rest[ek] && typeof rest[ek] === 'object') {
          const map = rest[ek];
          Object.keys(map).forEach(dateStr => {
            if (dateStr && dateStr.includes('-')) {
              const parts = dateStr.split('-');
              if (parts.length >= 2) {
                const targetM = (parseInt(parts[1], 10) - 1).toString();
                if (targetM !== monthKey && !isNaN(parseInt(targetM, 10)) && parseInt(targetM, 10) >= 0 && parseInt(targetM, 10) <= 11) {
                  const targetBase = next[targetM] || INITIAL_STATE;
                  const currentSubMap = targetBase[ek] || {};
                  next[targetM] = {
                    ...targetBase,
                    [ek]: {
                      ...currentSubMap,
                      [dateStr]: map[dateStr]
                    }
                  };
                }
              }
            }
          });
        }
      });

      return next;
    });

    if (priority) {
      isPrioritySync.current = true;
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      setSyncTrigger(prev => prev + 1);
    }
  }, [filters.month]);

  const toggleAdminMode = () => {
    setIsAdmin(!isAdmin);
    if (!isAdmin) {
       setActiveModule(ModuleType.ADMIN);
    } else {
       setActiveModule(ModuleType.DASHBOARD);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser({ email: '', isLoggedIn: false });
      safeStorage.removeItem('BARN_USER_SESSION');
      safeStorage.removeItem('MANUAL_USER_EMAIL');
      safeStorage.removeItem('BARN_SELECTED_OUTLET');
      setActiveModule(ModuleType.DASHBOARD);
      setIsAdmin(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleShare = () => {
    // Shared App URL from runtime context
    const sharedUrl = "https://ais-pre-hw575cvbfiwclx63dkmzec-57088962471.asia-east1.run.app";
    safeClipboard.writeText(sharedUrl).then(success => {
      if (success) {
        showToast("URL Aplikasi telah disalin! Bagikan URL ini agar orang lain bisa mengakses tanpa perlu remix.", "success");
      } else {
        showToast("Gagal menyalin URL. Silakan salin manual dari address bar.", "error");
      }
    });
  };

  const loadPublicData = async () => {
    setIsRefreshing(true);
    let cloudData = await fetchUserData('public@dashboard.com', 'SH THE BARN');

    if (cloudData) {
      const { staffList, ...rest } = cloudData;
      if (staffList) setGlobalDataState(prev => ({ ...prev, staffList }));
      setOutletMonthlyData(rest);
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (isPublicView && !user.isLoggedIn) {
      loadPublicData();
    }
  }, [isPublicView]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user.isLoggedIn && !isPublicView) {
      setIsAllOutletsLoading(false);
      return;
    }

    setIsAllOutletsLoading(true);
    fetchAllOutletsData().then(initialData => {
      if (initialData && Object.keys(initialData).length > 0) {
        setAllOutletsData(prev => ({ ...initialData, ...prev }));
        setIsAllOutletsLoading(false);
      }
    }).catch(console.error);

    const unsubscribe = startAllOutletsListener((results) => {
      setAllOutletsData(results);
      setIsAllOutletsLoading(false);
    });
    return unsubscribe;
  }, [isAuthReady, user.isLoggedIn, isPublicView]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user.isLoggedIn && !isPublicView) {
    return (
      <LoginModule 
        onLogin={handleLogin} 
        onPublicView={(type) => {
          setIsPublicView(true);
          const targetModule = type || ModuleType.REGIONAL_REPORT;
          setActiveModule(targetModule);
          setActiveRMTab('OVERVIEW');
        }}
        isFullScreen={isFullScreen} 
        onToggleFS={toggleFullScreen} 
        showToast={showToast} 
      />
    );
  }

  const filteredStaffList = currentData.staffList.filter(s => 
    (!user.selectedOutlet || user.selectedOutlet === 'ALL' || s.outlet === user.selectedOutlet) && 
    (s.status === 'ACTIVE' || !s.status)
  );

  const handleModuleSelect = (module: ModuleType, tab?: any) => {
    // Instantly flush pending sync to Firestore so Regional data is 100% up-to-date
    if (flushPendingSyncRef.current) {
      flushPendingSyncRef.current().catch(console.error);
    }

    if (tab === 'REKAPAN_PATTY_CASH') {
      setActiveModule(ModuleType.REGIONAL_REPORT);
      setActiveRMTab('PATTY_CASH_EXPENSE');
      return;
    }
    if (tab === 'REKAPAN_OVERTIME') {
      setActiveModule(ModuleType.REGIONAL_REPORT);
      setActiveRMTab('REKAPAN_OVERTIME');
      return;
    }
    if (tab === 'REKAPAN_LOGISTIK') {
      setActiveModule(ModuleType.REGIONAL_REPORT);
      setActiveRMTab('REKAPAN_LOGISTIK');
      return;
    }
    if (tab === 'THIRD_PARTY_GAS' || tab === 'REKAPAN_DISCOUNT') {
      setActiveModule(ModuleType.REGIONAL_REPORT);
      setActiveRMTab('THIRD_PARTY_GAS');
      return;
    }

    setActiveModule(module);
    if (module === ModuleType.REGIONAL_REPORT) {
      if (tab) {
        setActiveRMTab(tab);
      } else {
        setActiveRMTab('OVERVIEW');
      }
    }
    if (module === ModuleType.DASHBOARD && !user.isLoggedIn) {
      setIsPublicView(false);
    }
  };

  const renderModule = () => {
    const moduleContent = (() => {
      switch (activeModule) {
        case ModuleType.DASHBOARD:
          return (
            <Dashboard 
              onSelect={handleModuleSelect} 
              isAdmin={isAdmin} 
              onToggleFS={toggleFullScreen} 
              onOpenLogisticsInput={() => setShowLogisticsInputModal(true)} 
            />
          );
        case ModuleType.SALES:
          return <SalesModule 
            data={currentData.sales} 
            dailyTargets={currentData.dailyTargets} 
            filters={{...filters, outlet: user.selectedOutlet}}
            onUpdate={(v, p) => {
              const dailyRec = v.dailyRecording || (v.sales && v.sales.dailyRecording);
              updateCurrentData({
                sales: v,
                dailyRecording: dailyRec
              }, undefined, p !== undefined ? p : false);
              try {
                window.dispatchEvent(new CustomEvent('dailyRevenueUpdated', { detail: { sales: v } }));
                window.dispatchEvent(new CustomEvent('appSalesUpdated', { detail: { sales: v } }));
              } catch (e) {}
            }} 
            showToast={showToast} 
            dailyCustomerSat={currentData.dailyCustomerSat || {}}
          />;
        case ModuleType.WEEKLY_OVERTIME:
          return <WeeklyOvertimeInputModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            onUpdate={updateCurrentData}
            selectedOutlet={user.selectedOutlet}
            isRegionalView={user.role === 'REGIONAL_MANAGER'}
            filters={filters}
            showToast={showToast}
            onNavigateToDailyOvertime={() => setActiveModule(ModuleType.OVERTIME)}
          />;
        case ModuleType.COGS:
          return <CogsModule 
            data={currentData} 
            selectedDate={filters.startDate}
            selectedOutlet={user.selectedOutlet!}
            onUpdate={updateFullState}
            showToast={showToast}
            allMonthlyData={outletMonthlyData}
            filterMonth={filters.month?.toString()}
            filterYear={filters.year?.toString()}
          />;
        case ModuleType.PATTY_CASH_EXPENSE:
          return <PattyCashExpenseModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.ENERGY_COST:
          return <EnergyCostModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.CHEMICAL:
          return <ChemicalExpenseModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.MAIN_STORE_KITCHEN:
          return <MainStoreKitchenModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.SUPPLIER_EXPENSE:
          return <SupplierExpenseModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
            onNavigateToCogs={() => {
              setActiveModule(ModuleType.COGS);
            }}
          />;
        case ModuleType.CITY_LEDGER:
          return <CityLedgerModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.GUEST_SATISFACTION:
          return <GuestSatisfactionModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.COMPLIMENTARY:
          return <ComplimentaryModule
            data={currentData}
            allMonthlyData={outletMonthlyData}
            selectedOutlet={user.selectedOutlet!}
            filters={filters}
            showToast={showToast}
            isRegionalView={false}
            onUpdate={updateFullState}
          />;
        case ModuleType.RECEIVING_SHEET:
          return <ReceivingSheetModule 
            data={currentData} 
            onUpdate={updateFullState} 
            showToast={showToast} 
            allMonthlyData={outletMonthlyData}
            filters={filters}
            selectedOutlet={user.selectedOutlet!}
          />;
        case ModuleType.REKAPAN:
          return <ReportingModule data={currentData} filters={filters} selectedOutlet={user.selectedOutlet!} allMonthlyData={outletMonthlyData} />;
        case ModuleType.OVERTIME:
          return <OvertimeModule 
            data={currentData} 
            onUpdate={updateFullState} 
            selectedDate={filters.startDate}
            selectedOutlet={user.selectedOutlet}
            filterMonth={filters.month}
            filterYear={filters.year}
          />;
        case ModuleType.LOGISTICS:
          return <LogisticsModule 
            data={currentData} 
            onUpdate={updateFullState} 
            selectedDate={filters.startDate}
            selectedOutlet={user.selectedOutlet}
            showToast={showToast}
            filterMonth={filters.month}
            filterYear={filters.year}
          />;
        case ModuleType.EXTERNAL_AUDIT:
          return <ThirdPartyGasModule 
            data={currentData}
            allMonthlyData={outletMonthlyData}
            filters={filters}
            selectedOutlet={user.selectedOutlet!}
            isRegionalView={false}
            onUpdate={updateCurrentData}
            showToast={showToast}
          />;
        case ModuleType.STRATEGI:
          return <StrategiMenuModule 
            data={currentData}
            staffList={currentData.staffList || []}
            selectedOutlet={user.selectedOutlet || ''}
            filters={filters}
            onUpdate={updateCurrentData}
            showToast={showToast}
            allMonthlyData={outletMonthlyData}
          />;
        case ModuleType.VOID_BILL:
          return <VoidBillModule
            data={currentData}
            staffList={globalData.staffList || currentData.staffList || []}
            selectedOutlet={user.selectedOutlet || ''}
            filters={filters}
            onUpdate={updateFullState}
            showToast={showToast}
          />;
        case ModuleType.REGIONAL_REPORT:
          return <RegionalManagerModule 
            data={currentData} 
            allOutletsData={mergedAllOutletsData}
            isLoading={isAllOutletsLoading}
            selectedMonth={filters.month !== undefined && !isNaN(parseInt(filters.month)) ? parseInt(filters.month) : new Date().getMonth()}
            selectedYear={filters.year !== undefined && !isNaN(parseInt(filters.year)) ? parseInt(filters.year) : new Date().getFullYear()}
            onPeriodChange={(m, y) => {
              if (flushPendingSyncRef.current) {
                flushPendingSyncRef.current().catch(console.error);
              }
              const validMonth = (!isNaN(Number(m)) && Number(m) >= 0 && Number(m) <= 11) ? Number(m) : new Date().getMonth();
              const validYear = (!isNaN(Number(y)) && Number(y) >= 2020) ? Number(y) : new Date().getFullYear();
              setFilters(prev => ({ ...prev, month: validMonth.toString(), year: validYear.toString() }));
            }}
            initialTab={activeRMTab}
            moduleType={activeModule}
            onRefresh={() => {
              if (flushPendingSyncRef.current) {
                flushPendingSyncRef.current().catch(console.error);
              }
              setSyncTrigger(prev => prev + 1);
            }}
            showToast={showToast}
            onUpdate={updateCurrentData}
            selectedOutlet=""
          />;
        case ModuleType.TUTORIAL:
          return <TutorialModule 
            onSelectModule={handleModuleSelect}
            showToast={showToast}
          />;
        case ModuleType.ADMIN:
          return <AdminModule 
            data={currentData} 
            onUpdate={updateCurrentData} 
            onRestore={restoreFullState}
            filters={filters} 
            onFilterChange={setFilters}
            selectedOutlet={user.selectedOutlet}
            user={user}
            showToast={showToast}
            allMonthlyData={outletMonthlyData}
            onNavigateToRegionalSummaryReport={() => {
              setActiveModule(ModuleType.REGIONAL_REPORT);
              setActiveRMTab('SUMMARY_REPORT');
            }}
          />;
        default:
          return <Dashboard onSelect={handleModuleSelect} isAdmin={isAdmin} />;
      }
    })();

    return (
      <div className="relative min-h-[60vh]">
        {isRefreshing && (
          <div className="absolute inset-0 z-50 bg-slate-950/20 backdrop-blur-[2px] flex items-center justify-center rounded-3xl overflow-hidden">
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-white/10 flex flex-col items-center gap-4 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Syncing Cloud</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase mt-1 tracking-widest">Please wait...</p>
              </div>
            </div>
          </div>
        )}
        {moduleContent}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <main className="flex-1 overflow-y-auto overflow-x-auto p-4 md:p-8 custom-scrollbar scroll-smooth relative">
        <div className="sticky top-0 z-50 -mx-4 md:-mx-8 px-4 md:px-8 mb-6 bg-slate-900/80 backdrop-blur-md pb-4 border-b border-white/5">
          <Header 
            filters={filters}
            onFilterChange={setFilters}
            onHome={() => handleModuleSelect(ModuleType.DASHBOARD)}
            onRefresh={async () => {
              if (user.selectedOutlet) {
                await forceSync();
                handleLogin(user.email, user.selectedOutlet!);
              }
            }}
            onForceSync={forceSync}
            onAdminToggle={toggleAdminMode}
            onLogout={handleLogout}
            onShare={handleShare}
            onModuleSelect={handleModuleSelect}
            activeModule={activeModule}
            isAdmin={isAdmin}
            user={user}
            syncStatus={syncStatus}
            isRefreshing={isRefreshing}
            notifications={[...birthdayNotifications, ...notifications]}
            toast={toast}
          />
        </div>
        {isQuotaExceeded() && (
          <div className="max-w-7xl mx-auto mb-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between gap-4 text-red-400">
              <div className="flex items-center gap-4">
                <i className="fas fa-exclamation-triangle text-xl"></i>
                <div>
                  <p className="font-black text-xs uppercase tracking-widest">Firestore Quota Exceeded</p>
                  <p className="text-[10px] font-bold opacity-80 uppercase">Free daily write units reached. Auto-save is paused for 1 hour to prevent errors. Your changes are currently local-only.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  resetQuotaExceeded();
                  setQuotaExceededState(false);
                  setSyncStatus('syncing');
                  setSyncTrigger(prev => prev + 1);
                }}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/20"
              >
                Retry Sync
              </button>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto pb-10">
          <div className="animate-fade-in">
            {renderModule()}
          </div>
        </div>
      </main>

      {/* Logistics Quick Input Modal */}
      {showLogisticsInputModal && (
        <LogisticsInputModal
          data={currentData}
          onUpdate={updateFullState}
          selectedDate={filters.startDate}
          onClose={() => setShowLogisticsInputModal(false)}
          showToast={showToast}
        />
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
              
              <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{showConfirm.title}</h3>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest leading-relaxed">{showConfirm.message}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setShowConfirm(null)}
                  className="py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-white/5"
                >
                  BATALKAN
                </button>
                <button 
                  onClick={showConfirm.onConfirm}
                  className="py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-red-900/40"
                >
                  YA, HAPUS
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <RealtimeFeatures user={user} isAdmin={isAdmin} globalData={globalData} outletMonthlyData={outletMonthlyData} filters={filters} />
      <DailyReminderPopup user={user} isOnDashboard={activeModule === ModuleType.DASHBOARD} />
      <OutletControlModal
        isOpen={isOutletControlOpen}
        onClose={() => setIsOutletControlOpen(false)}
        initialTab={outletControlTab}
        showToast={showToast}
      />
    </div>
  );
};

export default App;