
import React, { useState, useMemo, useEffect } from 'react';
import { AppState, Staff, GSIRow, StaffStatus, Division, Outlet, User, PromoSettings, QAData, QASection } from '../types';
import { sortStaff, calculateLeaveEntitlement } from '../lib/staffUtils';
import { getMergedLeaveRecords } from '../lib/scheduleUtils';
import { toLocalDateStr } from '../lib/dateUtils';
import { INITIAL_GSI_STRUCTURE, DIVISIONS, OUTLETS, ROLES_BY_DIVISION, MONTH_NAMES, QA_PASSING_TIERS, getQaScoreTier } from '../constants';
import { pushNotification } from '../services/cloudService';
import { safeWindow } from '../lib/safeStorage';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface Props {
  data: AppState;
  onUpdate: (path: any, newValue?: any) => void;
  onRestore?: (fullData: any) => void;
  filters: { month: string; year?: string; startDate: string; endDate: string };
  onFilterChange: (filters: any) => void;
  selectedOutlet?: Outlet;
  user: User;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  allMonthlyData?: Record<string, any>;
  onNavigateToRegionalSummaryReport?: () => void;
}

const AdminModule: React.FC<Props> = ({ data, onUpdate, onRestore, filters, onFilterChange, selectedOutlet, user, showToast, allMonthlyData, onNavigateToRegionalSummaryReport }) => {
  const [activeTab, setActiveTab] = useState<'QA' | 'PROMO_CONTROL' | 'MASTER' | 'DATABASE' | 'CONFIG' | 'GSI' | 'GOOGLE' | 'DANGER'>('QA');

  const handleNuclearDelete = (type: 'SALES' | 'CPA' | 'QA' | 'ALL') => {
    const messages = {
      SALES: "HAPUS SELURUH DATABASE SALES? Seluruh data penjualan di semua tanggal akan dihapus.",
      CPA: "HAPUS SELURUH DATABASE CPA? Seluruh temuan CPA dan foto-foto akan dihapus dari history.",
      QA: "HAPUS SELURUH DATABASE QA? Seluruh skor QA audit akan dikosongkan.",
      ALL: "NUKLIR: HAPUS SELURUH DATABASE APLIKASI? (Sales, CPA, QA, GSI, Expenses, Complaints, dll). Data staff tidak akan dihapus."
    };

    setShowConfirm({
      title: "⚠ KONFIRMASI NUKLIR ⚠",
      message: messages[type],
      onConfirm: () => {
        if (type === 'SALES') onUpdate('sales', { ...data.sales, daily: {} });
        else if (type === 'CPA') onUpdate('dailyCPA', {});
        else if (type === 'QA') onUpdate('dailyQA', {});
        else if (type === 'ALL') {
          onUpdate({
            sales: { ...data.sales, daily: {} },
            dailyCPA: {},
            dailyQA: {},
            dailyGSI: {},
            expenses: [],
            complaints: [],
            dailyAttendance: {},
            dailyOvertime: {},
            dailyExternalAudit: {}
          });
        }
        setShowConfirm(null);
        if (showToast) showToast(`Berhasil menghapus database ${type}`, 'success');
      }
    });
  };

  const renderDangerTab = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="glass-card p-10 bg-rose-950/20 border-rose-500/30 border-2 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 opacity-10 rotate-12 pointer-events-none">
          <i className="fas fa-radiation text-[200px] text-rose-500"></i>
        </div>
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
             <div className="w-16 h-16 bg-rose-500 rounded-3xl flex items-center justify-center shadow-lg shadow-rose-900/50">
                <i className="fas fa-biohazard text-3xl text-white"></i>
             </div>
             <div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">Danger Zone</h2>
                <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2">Dilarang bagi pengguna selain Super Admin atau Regional Manager</p>
             </div>
          </div>
          
          <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-2xl">
            Area ini berisi instruksi penghapusan data secara masal. Semua tindakan di sini bersifat <span className="text-rose-500 font-black">PERMANEN</span> dan tidak dapat dibatalkan. Pastikan Anda telah melakukan backup sebelum melanjutkan.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
             <button 
               onClick={() => handleNuclearDelete('SALES')}
               className="p-8 bg-slate-900 border border-white/5 hover:border-rose-500/50 rounded-[2rem] transition-all group flex flex-col items-center text-center gap-4 hover:shadow-2xl hover:shadow-rose-900/20"
             >
                <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center group-hover:bg-rose-500 transition-all">
                   <i className="fas fa-chart-line text-rose-500 group-hover:text-white transition-colors"></i>
                </div>
                <div className="space-y-1">
                   <div className="text-xs font-black text-white uppercase tracking-widest">Hapus Seluruh Sales</div>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Mengosongkan semua data report harian</div>
                </div>
             </button>

             <button 
               onClick={() => handleNuclearDelete('CPA')}
               className="p-8 bg-slate-900 border border-white/5 hover:border-rose-500/50 rounded-[2rem] transition-all group flex flex-col items-center text-center gap-4 hover:shadow-2xl hover:shadow-rose-900/20"
             >
                <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center group-hover:bg-rose-500 transition-all">
                   <i className="fas fa-camera text-rose-500 group-hover:text-white transition-colors"></i>
                </div>
                <div className="space-y-1">
                   <div className="text-xs font-black text-white uppercase tracking-widest">Hapus Seluruh CPA</div>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Menghapus semua history CPA audit & foto</div>
                </div>
             </button>

             <button 
               onClick={() => handleNuclearDelete('QA')}
               className="p-8 bg-slate-900 border border-white/5 hover:border-rose-500/50 rounded-[2rem] transition-all group flex flex-col items-center text-center gap-4 hover:shadow-2xl hover:shadow-rose-900/20"
             >
                <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center group-hover:bg-rose-500 transition-all">
                   <i className="fas fa-clipboard-check text-rose-500 group-hover:text-white transition-colors"></i>
                </div>
                <div className="space-y-1">
                   <div className="text-xs font-black text-white uppercase tracking-widest">Hapus Seluruh QA</div>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Mereset semua skor audit ke nol</div>
                </div>
             </button>

             <button 
               onClick={() => handleNuclearDelete('ALL')}
               className="p-8 bg-rose-600 rounded-[2rem] transition-all group flex flex-col items-center text-center gap-4 shadow-xl shadow-rose-900/40 hover:scale-[1.02] active:scale-95"
             >
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                   <i className="fas fa-radiation text-white animate-spin-slow"></i>
                </div>
                <div className="space-y-1">
                   <div className="text-xs font-black text-white uppercase tracking-widest">RESET SELURUH DATABASE</div>
                   <div className="text-[9px] font-bold text-white/50 uppercase tracking-tighter italic">Tindakan Nuklir: Bersihkan semua log transaksi</div>
                </div>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
  const [isSaving, setIsSaving] = useState(false);
  const [gsiDate, setGsiDate] = useState(filters.startDate);
  const [googleReviewDate, setGoogleReviewDate] = useState(filters.startDate);
  const [googleReviewInput, setGoogleReviewInput] = useState({
    stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0
  });
  const [isEditingGoogleReview, setIsEditingGoogleReview] = useState(false);

  useEffect(() => {
    setIsEditingGoogleReview(false);
    setGoogleReviewInput({ stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0 });
  }, [googleReviewDate]);

  // Added missing states to handle staff management input
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffDivision, setNewStaffDivision] = useState<Division | ''>('');
  const [newStaffOutlet, setNewStaffOutlet] = useState<Outlet | ''>(selectedOutlet || '');
  const [newStaffIsLeader, setNewStaffIsLeader] = useState(false);
  const [newStaffJoinDate, setNewStaffJoinDate] = useState(toLocalDateStr(new Date()));
  const [newStaffBasicSalary, setNewStaffBasicSalary] = useState<number>(0);
  const [newStaffBankAccount, setNewStaffBankAccount] = useState('');
  const [newStaffPersonalPhone, setNewStaffPersonalPhone] = useState('');
  const [newStaffParentPhone, setNewStaffParentPhone] = useState('');
  const [newStaffNik, setNewStaffNik] = useState('');
  const [newStaffBirthDate, setNewStaffBirthDate] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [staffFilterOutlet, setStaffFilterOutlet] = useState<Outlet | 'ALL'>(selectedOutlet || 'ALL');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [showSuccess, setShowSuccess] = useState<{ title: string; message: string } | null>(null);
  
  const [selectedStaffForStatus, setSelectedStaffForStatus] = useState<string | null>(null);
  const [statusChangeDate, setStatusChangeDate] = useState(toLocalDateStr(new Date()));
  const [pendingStatus, setPendingStatus] = useState<StaffStatus | null>(null);
  const [statusChangeResignReason, setStatusChangeResignReason] = useState('');
  const [statusChangeMutationReason, setStatusChangeMutationReason] = useState('');

  // Edit Staff States
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDivision, setEditDivision] = useState<Division | ''>('');
  const [editIsLeader, setEditIsLeader] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState('');
  const [editBasicSalary, setEditBasicSalary] = useState<number>(0);
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editPersonalPhone, setEditPersonalPhone] = useState('');
  const [editParentPhone, setEditParentPhone] = useState('');
  const [editNik, setEditNik] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editResignDate, setEditResignDate] = useState('');
  const [editResignReason, setEditResignReason] = useState('');
  const [editMutationDate, setEditMutationDate] = useState('');
  const [editMutationReason, setEditMutationReason] = useState('');
  
  // localInput digunakan untuk menampung angka yang sedang diketik user sekarang
  // Automate leave entitlement based on join date
  

  const calculateEntitlement = (joinDateStr: string | undefined) => {
    return calculateLeaveEntitlement(joinDateStr);
  };

  const [localInput, setLocalInput] = useState<GSIRow[]>(
    INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0}))
  );

  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentYear = parseInt(filters.year || new Date().getFullYear().toString());
  const selectedMonthIdx = parseInt(filters.month);
  
  const daysInMonth = useMemo(() => {
    // Correctly calculate days in month for the specific year
    return new Date(currentYear, selectedMonthIdx + 1, 0).getDate();
  }, [selectedMonthIdx, currentYear]);

  const handleGSIInputChange = (id: string, field: keyof GSIRow, val: string) => {
    const num = parseInt(val) || 0;
    setLocalInput(prev => prev.map(row => row.id === id ? { ...row, [field]: num } : row));
  };

  // Logika kumulatif: Menambahkan input saat ini ke data yang sudah tersimpan di database harian
  const handleSaveGSI = () => {
    if (isSaving) return;
    
    // Cek apakah ada data yang diinput (agar tidak simpan kosong)
    const hasInput = localInput.some(row => 
      row.excellent > 0 || row.good > 0 || row.average > 0 || row.poor > 0 || row.abstain > 0
    );
    if (!hasInput) return;

    setIsSaving(true);
    
    // Ambil data yang sudah ada di tanggal tersebut (jika ada)
    const existingDailyData = data.dailyGSI?.[gsiDate] || INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0}));

    // Selalu timpa data lama dengan input baru sesuai permintaan (Input baru menimpa data sebelumnya)
    const updatedDailyData = localInput.map(inputRow => ({
      ...inputRow,
      excellent: inputRow.excellent || 0,
      good: inputRow.good || 0,
      average: inputRow.average || 0,
      poor: inputRow.poor || 0,
      abstain: inputRow.abstain || 0,
    }));

    // Update state utama
    onUpdate('dailyGSI', { 
      ...data.dailyGSI, 
      [gsiDate]: updatedDailyData 
    }, true);

    if (selectedOutlet) {
      pushNotification(user.email, selectedOutlet, `${isEditingGSI ? 'Updated' : 'Added'} GSI data for ${gsiDate}`).catch(err => console.error("Notification Error:", err));
    }

    if (showToast) {
       showToast(`Berhasil menyimpan data GSI untuk ${gsiDate} (Data telah diperbarui)`, 'success');
    }

    // Simulasi feedback dan RESET (Auto Refresh input field)
    setTimeout(() => {
      setIsSaving(false);
      setIsEditingGSI(false);
      // Reset input field ke 0 agar siap untuk input batch berikutnya
      setLocalInput(INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0})));
    }, 400);
  };

  const handleClearGSI = () => {
    setShowConfirm({
      title: "Konfirmasi Hapus",
      message: `Hapus SEMUA data GSI untuk tanggal ${gsiDate}? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: () => {
        const updatedDailyGSI = { ...data.dailyGSI };
        delete updatedDailyGSI[gsiDate];
        onUpdate('dailyGSI', updatedDailyGSI, true);
        setShowConfirm(null);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveGSI();
    }
  };

  const [showConfirm, setShowConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [isClearingOtherLogistics, setIsClearingOtherLogistics] = useState(false);

  // PROMO & BANK CONTROL (OUTLET PROMO SETTINGS)
  const [promoPeriodMonth, setPromoPeriodMonth] = useState<number>(parseInt(filters.month) || 0);
  const [promoPeriodYear, setPromoPeriodYear] = useState<number>(parseInt(filters.year || '') || new Date().getFullYear());
  const [promoScope, setPromoScope] = useState<'PERIOD' | 'GLOBAL'>('PERIOD');

  const currentPeriodKey = `${promoPeriodYear}-${(promoPeriodMonth + 1).toString().padStart(2, '0')}`;
  const periodSetting = data.promoSettings?.periodSettings?.[currentPeriodKey];
  const isPeriodBankPromoActive = periodSetting && typeof periodSetting.bankPromoEnabled === 'boolean'
    ? periodSetting.bankPromoEnabled 
    : (data.promoSettings?.bankPromoEnabled ?? true);
  const isPeriodPromoActive = periodSetting && typeof periodSetting.promoEnabled === 'boolean'
    ? periodSetting.promoEnabled 
    : (data.promoSettings?.promoEnabled ?? true);
  const isGlobalBankPromoActive = data.promoSettings?.bankPromoEnabled ?? true;
  const isGlobalPromoActive = data.promoSettings?.promoEnabled ?? true;

  const activeBankPromoDisplay = promoScope === 'GLOBAL' ? isGlobalBankPromoActive : isPeriodBankPromoActive;
  const activePromoDisplay = promoScope === 'GLOBAL' ? isGlobalPromoActive : isPeriodPromoActive;

  const handleToggleBankPromo = (newValue: boolean) => {
    let updatedSettings: PromoSettings;
    if (promoScope === 'GLOBAL') {
      updatedSettings = {
        ...(data.promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        bankPromoEnabled: newValue
      };
    } else {
      const curr = data.promoSettings?.periodSettings?.[currentPeriodKey] || {
        bankPromoEnabled: data.promoSettings?.bankPromoEnabled ?? true,
        promoEnabled: data.promoSettings?.promoEnabled ?? true
      };
      updatedSettings = {
        ...(data.promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        periodSettings: {
          ...(data.promoSettings?.periodSettings || {}),
          [currentPeriodKey]: {
            ...curr,
            bankPromoEnabled: newValue
          }
        }
      };
    }

    onUpdate('promoSettings', updatedSettings);
    // Promo banking is scoped to this specific outlet only, not global system_config
    if (showToast) {
      const scopeLabel = promoScope === 'GLOBAL' ? 'Semua Periode' : `Periode ${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`;
      showToast(`Bank Promo berhasil di-${newValue ? 'ON-kan (Aktif)' : 'OFF-kan (Nonaktif)'} untuk outlet ini (${scopeLabel})`, 'success');
    }
  };

  const handleTogglePromo = (newValue: boolean) => {
    let updatedSettings: PromoSettings;
    if (promoScope === 'GLOBAL') {
      updatedSettings = {
        ...(data.promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        promoEnabled: newValue
      };
    } else {
      const curr = data.promoSettings?.periodSettings?.[currentPeriodKey] || {
        bankPromoEnabled: data.promoSettings?.bankPromoEnabled ?? true,
        promoEnabled: data.promoSettings?.promoEnabled ?? true
      };
      updatedSettings = {
        ...(data.promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        periodSettings: {
          ...(data.promoSettings?.periodSettings || {}),
          [currentPeriodKey]: {
            ...curr,
            promoEnabled: newValue
          }
        }
      };
    }

    onUpdate('promoSettings', updatedSettings);
    if (showToast) {
      const scopeLabel = promoScope === 'GLOBAL' ? 'Semua Periode' : `Periode ${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`;
      showToast(`Promo Diskon berhasil di-${newValue ? 'ON-kan (Aktif)' : 'OFF-kan (Nonaktif)'} untuk outlet ini (${scopeLabel})`, 'success');
    }
  };

  const [mutationOutlet, setMutationOutlet] = useState<Outlet | ''>('');
  const [localDailyTargets, setLocalDailyTargets] = useState<Record<string, number>>(data.dailyTargets || {});
  const [localBudgetRevenue, setLocalBudgetRevenue] = useState<number>(data.sales.budgetRevenue || 0);
  const [localDiscountNames, setLocalDiscountNames] = useState<Record<string, string>>({
    cadanganName1: 'CADANGAN 1',
    cadanganName2: 'CADANGAN 2',
    cadanganName3: 'CADANGAN 3',
    investorName: 'INVESTOR 1',
    investorName2: 'INVESTOR 2',
    investorName3: 'INVESTOR 3'
  });
  const [googleReviewTarget, setGoogleReviewTarget] = useState<number>(data.googleReview.targetRating || 0);
  const [googleReviewTargetCount, setGoogleReviewTargetCount] = useState<number>(data.googleReview.targetReviewCount || 0);
  const [isEditingGSI, setIsEditingGSI] = useState(false);
  const [lastCheckDate, setLastCheckDate] = useState<string | null>(null);

  // Auto-populate GSI inputs when date changes if data already exists
  useEffect(() => {
    if (activeTab === 'GSI' && gsiDate !== lastCheckDate) {
      const existing = data.dailyGSI?.[gsiDate];
      if (existing) {
        setLocalInput(existing.map(row => ({
          ...row,
          excellent: row.excellent || 0,
          good: row.good || 0,
          average: row.average || 0,
          poor: row.poor || 0,
          abstain: row.abstain || 0
        })));
        setIsEditingGSI(true);
      } else {
        setLocalInput(INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0})));
        setIsEditingGSI(false);
      }
      setLastCheckDate(gsiDate);
    }
  }, [gsiDate, activeTab, data.dailyGSI, lastCheckDate]);
  const [localOvertimeBudgets, setLocalOvertimeBudgets] = useState<Record<string, number>>(data.overtimeBudgets || {
    SERVICE: 0,
    BAR: 0,
    KITCHEN: 0,
    'STORE KEEPER': 0,
    'PUBLIC ATTENDANCE': 0,
    STEWARD: 0
  });

  useEffect(() => {
    const monthKey = `${currentYear}-${(selectedMonthIdx + 1).toString().padStart(2, '0')}`;
    setLocalDailyTargets(data.dailyTargets || {});
    setLocalBudgetRevenue(data.sales.monthlyBudgets?.[monthKey] || data.sales.budgetRevenue || 0);
    setLocalDiscountNames(data.monthlyDiscountNames?.[monthKey] || {
      cadanganName1: 'CADANGAN 1',
      cadanganName2: 'CADANGAN 2',
      cadanganName3: 'CADANGAN 3',
      investorName: 'INVESTOR 1',
      investorName2: 'INVESTOR 2',
      investorName3: 'INVESTOR 3'
    });
    setGoogleReviewTarget(data.googleReview.targetRating || 0);
    
    const monthlyOT = data.monthlyOvertimeBudgets?.[monthKey] || data.overtimeBudgets || {
      SERVICE: 0,
      BAR: 0,
      KITCHEN: 0,
      'STORE KEEPER': 0,
      'PUBLIC ATTENDANCE': 0,
      STEWARD: 0
    };
    setLocalOvertimeBudgets(monthlyOT);
  }, [data.dailyTargets, data.sales.budgetRevenue, data.sales.monthlyBudgets, data.googleReview.targetRating, data.overtimeBudgets, data.monthlyOvertimeBudgets, selectedMonthIdx, currentYear]);

  const handleUpdateBudget = (val: number) => setLocalBudgetRevenue(val);

  const handleUpdateDailyTarget = (day: number, val: number) => {
    const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateKey = `${currentYear}-${monthStr}-${dayStr}`;
    setLocalDailyTargets(prev => ({ ...prev, [dateKey]: val }));
  };

  const handleAutoDistribute = () => {
    const budget = localBudgetRevenue || 0;
    const daily = Math.floor(budget / daysInMonth);
    const newTargets = { ...localDailyTargets };
    for (let i = 1; i <= daysInMonth; i++) {
      const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
      const dateKey = `${currentYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
      newTargets[dateKey] = daily;
    }
    setLocalDailyTargets(newTargets);
  };

  const handleApplyDefaultTarget = () => {
    const newTargets = { ...localDailyTargets };
    for (let i = 1; i <= daysInMonth; i++) {
      const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
      const dateKey = `${currentYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
      newTargets[dateKey] = defaultTarget;
    }
    setLocalDailyTargets(newTargets);
  };

  const handleClearAllTargets = () => {
    const newTargets = { ...localDailyTargets };
    for (let i = 1; i <= daysInMonth; i++) {
      const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
      const dateKey = `${currentYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
      delete newTargets[dateKey];
    }
    setLocalDailyTargets(newTargets);
  };

  const totalDailyTargets = useMemo(() => {
    let total = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
      const dateKey = `${currentYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
      total += localDailyTargets[dateKey] || 0;
    }
    return total;
  }, [localDailyTargets, daysInMonth, selectedMonthIdx, currentYear]);

  const handleUpdateStaffStatus = (id: string, status: StaffStatus) => {
    let newStaffList = [...data.staffList];
    const staffToUpdate = newStaffList.find(s => s.id === id);
    
    if (!staffToUpdate) return;

    if (status === 'MUTASI' && mutationOutlet) {
      // 1. Mark existing record as MUTASI to preserve history
      newStaffList = newStaffList.map(s => {
        if (s.id === id) {
          return { 
            ...s, 
            status: 'MUTASI' as StaffStatus,
            statusDate: statusChangeDate,
            mutationDate: statusChangeDate,
            mutationReason: statusChangeMutationReason,
            outlet: s.outlet, // keep current outlet as where they mutated from
            mutatedTo: mutationOutlet as Outlet
          };
        }
        return s;
      });

      // 2. Create NEW record for the target outlet
      const newInstanceId = `${staffToUpdate.staffId}_${mutationOutlet}_${Date.now()}`;
      const newStaffInstance: Staff = {
        ...staffToUpdate,
        id: newInstanceId,
        outlet: mutationOutlet as Outlet,
        previousOutlet: staffToUpdate.outlet,
        status: 'ACTIVE' as StaffStatus,
        statusDate: statusChangeDate
      };
      newStaffList.push(newStaffInstance);
    } else {
      newStaffList = newStaffList.map(s => {
        if (s.id === id) {
          return { 
            ...s, 
            status, 
            statusDate: statusChangeDate,
            resignDate: (status === 'RESIGNED_PROSEDUR' || status === 'RESIGNED_NON_PROSEDUR') ? statusChangeDate : s.resignDate,
            resignReason: (status === 'RESIGNED_PROSEDUR' || status === 'RESIGNED_NON_PROSEDUR') ? statusChangeResignReason : s.resignReason
          };
        }
        return s;
      });
    }

    onUpdate('staffList', newStaffList, true);
    
    if (selectedOutlet) {
      pushNotification(user.email, selectedOutlet, `Updated status for ${staffToUpdate.name} to ${status}${status === 'MUTASI' ? ' (ke ' + mutationOutlet + ')' : ''}`).catch(err => console.error("Notification Error:", err));
    }

    setSelectedStaffForStatus(null);
    setPendingStatus(null);
    setMutationOutlet('');
    setStatusChangeResignReason('');
    setStatusChangeMutationReason('');
  };


  const handleAddStaff = () => {
    if (!newStaffName.trim()) {
      setShowConfirm({
        title: "Error",
        message: "Nama Staff tidak boleh kosong",
        onConfirm: () => setShowConfirm(null)
      });
      return;
    }
    if (!newStaffDivision) {
      setShowConfirm({
        title: "Error",
        message: "Pilih Divisi",
        onConfirm: () => setShowConfirm(null)
      });
      return;
    }
    const finalOutlet = newStaffOutlet || selectedOutlet;
    if (!finalOutlet) {
      setShowConfirm({
        title: "Error",
        message: "Pilih Outlet",
        onConfirm: () => setShowConfirm(null)
      });
      return;
    }
    
    const permanentId = Date.now().toString();
    const newStaff: Staff = { 
      id: permanentId, 
      staffId: permanentId,
      name: newStaffName, 
      role: newStaffRole, 
      division: newStaffDivision as Division,
      outlet: finalOutlet as Outlet,
      isLeader: newStaffIsLeader,
      joinDate: newStaffJoinDate,
      basicSalary: newStaffBasicSalary,
      bankAccount: newStaffBankAccount,
      personalPhone: newStaffPersonalPhone,
      parentPhone: newStaffParentPhone,
      nik: newStaffNik,
      birthDate: newStaffBirthDate,
      email: newStaffEmail,
      status: 'ACTIVE'
    };
    onUpdate('staffList', sortStaff([...data.staffList, newStaff]), true);
    
    if (selectedOutlet) {
      pushNotification(user.email, selectedOutlet, `Added new staff: ${newStaffName}`).catch(err => console.error("Notification Error:", err));
    }

    if (showToast) showToast(`Berhasil menambahkan staff: ${newStaffName}`, 'success');

    setNewStaffName('');
    setNewStaffRole('');
    setNewStaffDivision('');
    setNewStaffOutlet(selectedOutlet || '');
    setNewStaffIsLeader(false);
    setNewStaffJoinDate(new Date().toISOString().split('T')[0]);
    setNewStaffBasicSalary(0);
    setNewStaffBankAccount('');
    setNewStaffPersonalPhone('');
    setNewStaffParentPhone('');
    setNewStaffNik('');
    setNewStaffBirthDate('');
    setNewStaffEmail('');
  };

  const handleRemoveStaff = (id: string) => {
    const staff = data.staffList.find(s => s.id === id);
    if (staff && staff.outlet !== selectedOutlet) {
      setShowConfirm({
        title: "Permission Denied",
        message: `Anda tidak memiliki izin untuk menghapus staff dari outlet ${staff.outlet}. Silakan login ke outlet tersebut.`,
        onConfirm: () => setShowConfirm(null)
      });
      return;
    }
    setShowConfirm({
      title: "Konfirmasi Hapus",
      message: "Hapus staff ini dari database secara permanen?",
      onConfirm: () => {
        const staffId = staff?.staffId;
        
        let newStaffList = data.staffList.filter(s => s.id !== id);
        let newDailyAttendance = { ...data.dailyAttendance };
        let newDailyOvertime = { ...data.dailyOvertime };
        let newLeaveRecords = Array.isArray(data.leaveRecords) ? data.leaveRecords.filter(r => r.staffId !== staffId) : [];

        if (staffId) {
          Object.keys(newDailyAttendance).forEach(date => {
            if (Array.isArray(newDailyAttendance[date])) {
              newDailyAttendance[date] = newDailyAttendance[date].filter(a => a.staffId !== staffId);
            }
          });
          Object.keys(newDailyOvertime).forEach(date => {
            if (Array.isArray(newDailyOvertime[date])) {
              newDailyOvertime[date] = newDailyOvertime[date].filter(o => o.staffId !== staffId);
            }
          });
        }

        onUpdate({
          staffList: newStaffList,
          dailyAttendance: newDailyAttendance,
          dailyOvertime: newDailyOvertime,
          leaveRecords: newLeaveRecords
        }, undefined, true);

        setShowConfirm(null);
      }
    });
  };

  const handleStartEdit = (staff: Staff) => {
    setEditingStaffId(staff.id);
    setEditName(staff.name);
    setEditRole(staff.role);
    setEditDivision(staff.division || '');
    setEditIsLeader(staff.isLeader);
    setEditJoinDate(staff.joinDate || '');
    setEditBasicSalary(staff.basicSalary || 0);
    setEditBankAccount(staff.bankAccount || '');
    setEditPersonalPhone(staff.personalPhone || '');
    setEditParentPhone(staff.parentPhone || '');
    setEditNik(staff.nik || '');
    setEditBirthDate(staff.birthDate || '');
    setEditEmail(staff.email || '');
    setEditResignDate(staff.resignDate || staff.statusDate || '');
    setEditResignReason(staff.resignReason || '');
    setEditMutationDate(staff.mutationDate || staff.statusDate || '');
    setEditMutationReason(staff.mutationReason || '');
  };

  const handleSaveEdit = async () => {
    if (!editingStaffId) return;
    const staffToEdit = data.staffList.find(s => s.id === editingStaffId);
    if (!staffToEdit) return;

    // Update ALL instances of this staff member (same staffId) for name, role, division, isLeader
    // but only update joinDate for the current instance (or we could update all, but usually joinDate is per instance)
    // Actually, joinDate is usually global for the person, but in mutation it might reset.
    // Let's update name globally.
    const updatedList = sortStaff(data.staffList.map(s => 
      s.staffId === staffToEdit.staffId 
        ? { 
            ...s, 
            name: editName, 
            role: editRole, 
            division: editDivision as Division, 
            isLeader: editIsLeader,
            basicSalary: editBasicSalary,
            bankAccount: editBankAccount,
            personalPhone: editPersonalPhone,
            parentPhone: editParentPhone,
            nik: editNik,
            birthDate: editBirthDate,
            email: editEmail,
            resignDate: editResignDate,
            resignReason: editResignReason,
            mutationDate: editMutationDate,
            mutationReason: editMutationReason,
            // Only update joinDate if it's the specific instance being edited
            joinDate: s.id === editingStaffId ? editJoinDate : s.joinDate
          } 
        : s
    ));
    onUpdate('staffList', updatedList, true);
    
    if (selectedOutlet) {
      pushNotification(user.email, selectedOutlet, `Updated staff info for ${editName}`).catch(err => console.error("Notification Error:", err));
    }

    if (showToast) showToast(`Berhasil memperbarui data: ${editName}`, 'success');
    
    setEditingStaffId(null);
  };

  const handleClearOutletStaff = (outlet: Outlet) => {
    if (outlet !== selectedOutlet) {
      setShowConfirm({
        title: "Permission Denied",
        message: `Anda tidak memiliki izin untuk menghapus staff dari outlet ${outlet}. Silakan login ke outlet tersebut.`,
        onConfirm: () => setShowConfirm(null)
      });
      return;
    }
    setShowConfirm({
      title: "Peringatan Keras",
      message: `PERINGATAN: Hapus SEMUA staff di outlet ${outlet}? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: () => {
        const staffToRemove = data.staffList.filter(s => s.outlet === outlet);
        const staffIds = new Set(staffToRemove.map(s => s.staffId).filter(Boolean));

        let newStaffList = data.staffList.filter(s => s.outlet !== outlet);
        let newDailyAttendance = { ...data.dailyAttendance };
        let newDailyOvertime = { ...data.dailyOvertime };
        let newLeaveRecords = Array.isArray(data.leaveRecords) ? data.leaveRecords.filter(r => !staffIds.has(r.staffId)) : [];

        Object.keys(newDailyAttendance).forEach(date => {
          if (Array.isArray(newDailyAttendance[date])) {
            newDailyAttendance[date] = newDailyAttendance[date].filter(a => !staffIds.has(a.staffId));
          }
        });
        Object.keys(newDailyOvertime).forEach(date => {
          if (Array.isArray(newDailyOvertime[date])) {
            newDailyOvertime[date] = newDailyOvertime[date].filter(o => !staffIds.has(o.staffId));
          }
        });

        onUpdate({
          staffList: newStaffList,
          dailyAttendance: newDailyAttendance,
          dailyOvertime: newDailyOvertime,
          leaveRecords: newLeaveRecords
        }, undefined, true);

        setShowConfirm(null);
      }
    });
  };

  // Helper untuk melihat total yang sudah tersimpan di tanggal terpilih (View Only)
  const storedTotalForDate = useMemo(() => {
    return data.dailyGSI?.[gsiDate] || INITIAL_GSI_STRUCTURE;
  }, [data.dailyGSI, gsiDate]);

  // =========================================================================
  // QA (QUALITY ASSURANCE) 3-MONTH EVALUATION & CURRENT MONTH INPUT STATES
  // =========================================================================
  const initialCurrentMonthIdx = parseInt(filters.month) || 0;
  const initialQuarter = `Q${Math.floor(initialCurrentMonthIdx / 3) + 1}` as 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ROLLING';

  const [qaYear, setQaYear] = useState<number>(() => {
    return parseInt(filters.year || new Date().getFullYear().toString());
  });
  const [qaQuarter, setQaQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ROLLING'>(initialQuarter);
  const [qaInputDate, setQaInputDate] = useState<string>(filters.startDate || toLocalDateStr(new Date()));
  const [isSavingQA, setIsSavingQA] = useState(false);
  const [isEditingQA, setIsEditingQA] = useState(false);

  // Form input states for 3 Divisions
  const [qaKitchen, setQaKitchen] = useState<{ product: number; cleanliness: number; grooming: number }>({
    product: 0, cleanliness: 0, grooming: 0
  });
  const [qaBar, setQaBar] = useState<{ product: number; cleanliness: number; grooming: number }>({
    product: 0, cleanliness: 0, grooming: 0
  });
  const [qaService, setQaService] = useState<{ product: number; cleanliness: number; grooming: number }>({
    product: 0, cleanliness: 0, grooming: 0
  });

  // Load audit data when qaInputDate changes
  useEffect(() => {
    let existingAudit: QAData | null = null;
    if (data.dailyQA?.[qaInputDate]) {
      existingAudit = data.dailyQA[qaInputDate];
    } else if (allMonthlyData) {
      for (const mData of Object.values(allMonthlyData)) {
        const anyMData = mData as any;
        if (anyMData?.dailyQA?.[qaInputDate]) {
          existingAudit = anyMData.dailyQA[qaInputDate];
          break;
        }
      }
    }

    if (existingAudit) {
      setQaKitchen({
        product: Number(existingAudit.kitchen?.product) || 0,
        cleanliness: Number(existingAudit.kitchen?.cleanliness) || 0,
        grooming: Number(existingAudit.kitchen?.grooming) || 0
      });
      setQaBar({
        product: Number(existingAudit.bar?.product) || 0,
        cleanliness: Number(existingAudit.bar?.cleanliness) || 0,
        grooming: Number(existingAudit.bar?.grooming) || 0
      });
      setQaService({
        product: Number(existingAudit.service?.product) || 0,
        cleanliness: Number(existingAudit.service?.cleanliness) || 0,
        grooming: Number(existingAudit.service?.grooming) || 0
      });
      setIsEditingQA(true);
    } else {
      setQaKitchen({ product: 0, cleanliness: 0, grooming: 0 });
      setQaBar({ product: 0, cleanliness: 0, grooming: 0 });
      setQaService({ product: 0, cleanliness: 0, grooming: 0 });
      setIsEditingQA(false);
    }
  }, [qaInputDate, data.dailyQA, allMonthlyData]);

  // Live average calculations for active input form
  const calcSectionAvg = (sec: { product: number; cleanliness: number; grooming: number }) => {
    const vals = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
    return vals.length === 0 ? 0 : Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const liveKitchenAvg = useMemo(() => calcSectionAvg(qaKitchen), [qaKitchen]);
  const liveBarAvg = useMemo(() => calcSectionAvg(qaBar), [qaBar]);
  const liveServiceAvg = useMemo(() => calcSectionAvg(qaService), [qaService]);

  const liveOutletAvg = useMemo(() => {
    const active = [liveKitchenAvg, liveBarAvg, liveServiceAvg].filter(v => v > 0);
    return active.length === 0 ? 0 : Number(((liveKitchenAvg + liveBarAvg + liveServiceAvg) / 3).toFixed(2));
  }, [liveKitchenAvg, liveBarAvg, liveServiceAvg]);

  // Determine the 3 months for the selected quarter
  const quarterMonthIndices = useMemo(() => {
    if (qaQuarter === 'Q1') return [0, 1, 2];
    if (qaQuarter === 'Q2') return [3, 4, 5];
    if (qaQuarter === 'Q3') return [6, 7, 8];
    if (qaQuarter === 'Q4') return [9, 10, 11];
    // ROLLING: 3 consecutive months ending in current selected month
    const cur = parseInt(filters.month) || 0;
    const m1 = (cur - 2 + 12) % 12;
    const m2 = (cur - 1 + 12) % 12;
    const m3 = cur;
    return [m1, m2, m3];
  }, [qaQuarter, filters.month]);

  // Calculate monthly QA data for each of the 3 months
  const quarterlyQAData = useMemo(() => {
    return quarterMonthIndices.map(mIdx => {
      const monthPrefix = `${qaYear}-${String(mIdx + 1).padStart(2, '0')}`;
      const auditsMap: Record<string, QAData> = {};

      // 1. From allMonthlyData
      if (allMonthlyData) {
        const mStore = allMonthlyData[String(mIdx)];
        if (mStore?.dailyQA) {
          Object.entries(mStore.dailyQA).forEach(([d, q]) => {
            if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
          });
        }
        Object.values(allMonthlyData).forEach((otherM: any) => {
          if (otherM?.dailyQA) {
            Object.entries(otherM.dailyQA).forEach(([d, q]) => {
              if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
            });
          }
        });
      }

      // 2. From current active data.dailyQA
      if (data?.dailyQA) {
        Object.entries(data.dailyQA).forEach(([d, q]) => {
          if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
        });
      }

      const auditList: {
        date: string;
        data: QAData;
        kitchenAvg: number;
        barAvg: number;
        serviceAvg: number;
        overallAvg: number;
      }[] = [];

      Object.entries(auditsMap).forEach(([date, qa]) => {
        const getSec = (sec?: any) => {
          if (!sec) return 0;
          const vals = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        };
        const k = getSec(qa.kitchen);
        const b = getSec(qa.bar);
        const s = getSec(qa.service);
        if (k > 0 || b > 0 || s > 0) {
          const overall = (k + b + s) / 3;
          auditList.push({
            date,
            data: qa,
            kitchenAvg: Number(k.toFixed(2)),
            barAvg: Number(b.toFixed(2)),
            serviceAvg: Number(s.toFixed(2)),
            overallAvg: Number(overall.toFixed(2))
          });
        }
      });

      auditList.sort((a, b) => a.date.localeCompare(b.date));

      const kList = auditList.filter(a => a.kitchenAvg > 0);
      const bList = auditList.filter(a => a.barAvg > 0);
      const sList = auditList.filter(a => a.serviceAvg > 0);

      const kitchenMonthAvg = kList.length > 0
        ? Number((kList.reduce((acc, a) => acc + a.kitchenAvg, 0) / kList.length).toFixed(2))
        : 0;
      const barMonthAvg = bList.length > 0
        ? Number((bList.reduce((acc, a) => acc + a.barAvg, 0) / bList.length).toFixed(2))
        : 0;
      const serviceMonthAvg = sList.length > 0
        ? Number((sList.reduce((acc, a) => acc + a.serviceAvg, 0) / sList.length).toFixed(2))
        : 0;

      // Overall monthly average calculated according to average of the 3 divisions:
      const activeDivCount = (kitchenMonthAvg > 0 ? 1 : 0) + (barMonthAvg > 0 ? 1 : 0) + (serviceMonthAvg > 0 ? 1 : 0);
      const overallMonthAvg = activeDivCount > 0
        ? Number(((kitchenMonthAvg + barMonthAvg + serviceMonthAvg) / 3).toFixed(2))
        : 0;

      return {
        monthIdx: mIdx,
        monthName: MONTH_NAMES[mIdx],
        monthPrefix,
        auditList,
        kitchenMonthAvg,
        barMonthAvg,
        serviceMonthAvg,
        overallMonthAvg,
        auditCount: auditList.length
      };
    });
  }, [quarterMonthIndices, qaYear, allMonthlyData, data.dailyQA]);

  // Grand Total QA summary across the 3 months
  const quarterlySummary = useMemo(() => {
    const validKitchenMonths = quarterlyQAData.filter(m => m.kitchenMonthAvg > 0);
    const kitchen3MonthAvg = validKitchenMonths.length > 0
      ? Number((validKitchenMonths.reduce((acc, m) => acc + m.kitchenMonthAvg, 0) / validKitchenMonths.length).toFixed(2))
      : 0;

    const validBarMonths = quarterlyQAData.filter(m => m.barMonthAvg > 0);
    const bar3MonthAvg = validBarMonths.length > 0
      ? Number((validBarMonths.reduce((acc, m) => acc + m.barMonthAvg, 0) / validBarMonths.length).toFixed(2))
      : 0;

    const validServiceMonths = quarterlyQAData.filter(m => m.serviceMonthAvg > 0);
    const service3MonthAvg = validServiceMonths.length > 0
      ? Number((validServiceMonths.reduce((acc, m) => acc + m.serviceMonthAvg, 0) / validServiceMonths.length).toFixed(2))
      : 0;

    // Rata-rata nilai dihitung per tiga bulan sesuai rata-rata nilai ke-3 divisi:
    const activeDivisions = [kitchen3MonthAvg, bar3MonthAvg, service3MonthAvg].filter(v => v > 0);
    const overall3MonthAvg = activeDivisions.length > 0
      ? Number(((kitchen3MonthAvg + bar3MonthAvg + service3MonthAvg) / 3).toFixed(2))
      : 0;

    const totalAuditsCount = quarterlyQAData.reduce((acc, m) => acc + m.auditCount, 0);

    return {
      kitchen3MonthAvg,
      bar3MonthAvg,
      service3MonthAvg,
      overall3MonthAvg,
      totalAuditsCount,
      kitchenTier: getQaScoreTier(kitchen3MonthAvg),
      barTier: getQaScoreTier(bar3MonthAvg),
      serviceTier: getQaScoreTier(service3MonthAvg),
      overallTier: getQaScoreTier(overall3MonthAvg)
    };
  }, [quarterlyQAData]);

  // Handle Save QA Audit for Bulan Berjalan
  const handleSaveQA = () => {
    if (isSavingQA) return;
    const hasData = liveKitchenAvg > 0 || liveBarAvg > 0 || liveServiceAvg > 0;
    if (!hasData) {
      if (showToast) showToast('Harap masukkan nilai audit minimal untuk salah satu divisi!', 'error');
      return;
    }

    setIsSavingQA(true);
    const newQaEntry: QAData = {
      kitchen: {
        product: Math.min(100, Math.max(0, Number(qaKitchen.product) || 0)),
        cleanliness: Math.min(100, Math.max(0, Number(qaKitchen.cleanliness) || 0)),
        grooming: Math.min(100, Math.max(0, Number(qaKitchen.grooming) || 0))
      },
      bar: {
        product: Math.min(100, Math.max(0, Number(qaBar.product) || 0)),
        cleanliness: Math.min(100, Math.max(0, Number(qaBar.cleanliness) || 0)),
        grooming: Math.min(100, Math.max(0, Number(qaBar.grooming) || 0))
      },
      service: {
        product: Math.min(100, Math.max(0, Number(qaService.product) || 0)),
        cleanliness: Math.min(100, Math.max(0, Number(qaService.cleanliness) || 0)),
        grooming: Math.min(100, Math.max(0, Number(qaService.grooming) || 0))
      }
    };

    const updatedDailyQA = {
      ...(data.dailyQA || {}),
      [qaInputDate]: newQaEntry
    };

    onUpdate('dailyQA', updatedDailyQA, true);

    if (selectedOutlet) {
      pushNotification(user.email, selectedOutlet, `${isEditingQA ? 'Updated' : 'Created'} QA Audit for ${qaInputDate}`).catch(e => console.error(e));
    }

    setTimeout(() => {
      setIsSavingQA(false);
      if (showToast) {
        showToast(`Audit QA untuk tanggal ${qaInputDate} berhasil disimpan! Rata-rata 3 Divisi: ${liveOutletAvg}% (${getQaScoreTier(liveOutletAvg).label})`, 'success');
      }
    }, 300);
  };

  // Handle Delete QA Audit
  const handleDeleteQA = (targetDate: string) => {
    setShowConfirm({
      title: "HAPUS DATA AUDIT QA",
      message: `Apakah Anda yakin ingin menghapus data QA Audit untuk tanggal ${targetDate}? Data yang dihapus tidak dapat dipulihkan.`,
      onConfirm: () => {
        const next = { ...(data.dailyQA || {}) };
        delete next[targetDate];
        onUpdate('dailyQA', next, true);
        if (targetDate === qaInputDate) {
          setQaKitchen({ product: 0, cleanliness: 0, grooming: 0 });
          setQaBar({ product: 0, cleanliness: 0, grooming: 0 });
          setQaService({ product: 0, cleanliness: 0, grooming: 0 });
          setIsEditingQA(false);
        }
        setShowConfirm(null);
        if (showToast) showToast(`Data QA Audit untuk ${targetDate} berhasil dihapus.`, 'info');
      }
    });
  };

  // Quick Preset Handlers
  const handleApplyQAPreset = (tier: 'EXCELLENT' | 'SATISFACTORY' | 'TO_IMPROVE') => {
    if (tier === 'EXCELLENT') {
      setQaKitchen({ product: 95, cleanliness: 92, grooming: 94 });
      setQaBar({ product: 94, cleanliness: 93, grooming: 95 });
      setQaService({ product: 96, cleanliness: 94, grooming: 95 });
    } else if (tier === 'SATISFACTORY') {
      setQaKitchen({ product: 87, cleanliness: 86, grooming: 88 });
      setQaBar({ product: 89, cleanliness: 85, grooming: 88 });
      setQaService({ product: 88, cleanliness: 86, grooming: 90 });
    } else {
      setQaKitchen({ product: 78, cleanliness: 75, grooming: 80 });
      setQaBar({ product: 80, cleanliness: 76, grooming: 79 });
      setQaService({ product: 82, cleanliness: 78, grooming: 81 });
    }
  };

  // Copy Summary to Clipboard
  const handleCopyQASummary = () => {
    const periodLabel = qaQuarter === 'ROLLING' 
      ? `3 Bulan Berjalan (${quarterlyQAData.map(m => m.monthName).join(', ')})`
      : `${qaQuarter} ${qaYear} (${quarterlyQAData.map(m => m.monthName).join(', ')})`;
      
    const text = `*LAPORAN EVALUASI QA AUDIT (PER 3 BULAN)*
*OUTLET:* ${selectedOutlet || 'SEMUA OUTLET'}
*PERIODE:* ${periodLabel}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 *RATA-RATA TOTAL 3 BULAN: ${quarterlySummary.overall3MonthAvg}%*
Status: *${quarterlySummary.overallTier.label} (${quarterlySummary.overallTier.range})*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*HASIL EVALUASI 3 DIVISI (PER 3 BULAN):*
🍳 *KITCHEN*: *${quarterlySummary.kitchen3MonthAvg}%* • ${quarterlySummary.kitchenTier.label}
☕ *BAR*: *${quarterlySummary.bar3MonthAvg}%* • ${quarterlySummary.barTier.label}
🛎️ *SERVICE*: *${quarterlySummary.service3MonthAvg}%* • ${quarterlySummary.serviceTier.label}

*STANDAR PASSING SCORE:*
• EXCELLENT: 91.00% - 100%
• SATISFACTORY: 85.00% - 90.00%
• TO IMPROVE: 45.00% - 84.00%

*Rincian Per Bulan:*
${quarterlyQAData.map(m => `• ${m.monthName}: Kitchen ${m.kitchenMonthAvg}%, Bar ${m.barMonthAvg}%, Service ${m.serviceMonthAvg}% (Rata-rata: ${m.overallMonthAvg}%)`).join('\n')}

_Dibuat otomatis dari Sistem Admin Panel QA Audit_`;

    navigator.clipboard.writeText(text);
    if (showToast) showToast('Rangkuman evaluasi QA 3 Bulan berhasil disalin ke clipboard!', 'success');
  };

  // Export QA to Excel
  const handleExportQAExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('QA Audit 3 Bulan');

      // Title rows
      worksheet.mergeCells('A1:G1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `LAPORAN QA AUDIT 3 DIVISI (PER 3 BULAN) - ${selectedOutlet || 'OUTLET'}`;
      titleCell.font = { name: 'Arial Black', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.mergeCells('A2:G2');
      const subCell = worksheet.getCell('A2');
      subCell.value = `Periode: ${qaQuarter} ${qaYear} (${quarterlyQAData.map(m => m.monthName).join(' - ')}) • Passing Score Standard (Excellent: 91-100%, Satisfactory: 85-90%, To Improve: 45-84%)`;
      subCell.font = { name: 'Arial', size: 10, italic: true };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.addRow([]);
      const headerRow = worksheet.addRow(['DIVISI', 'DESKRIPSI PENILAIAN', quarterlyQAData[0].monthName, quarterlyQAData[1].monthName, quarterlyQAData[2].monthName, 'RATA-RATA 3 BULAN', 'STATUS PASSING SCORE']);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const rows = [
        ['KITCHEN', 'Quality of Food / Cleanliness / Grooming', `${quarterlyQAData[0].kitchenMonthAvg}%`, `${quarterlyQAData[1].kitchenMonthAvg}%`, `${quarterlyQAData[2].kitchenMonthAvg}%`, `${quarterlySummary.kitchen3MonthAvg}%`, quarterlySummary.kitchenTier.label],
        ['BAR', 'Quality of Beverage / Cleanliness / Grooming', `${quarterlyQAData[0].barMonthAvg}%`, `${quarterlyQAData[1].barMonthAvg}%`, `${quarterlyQAData[2].barMonthAvg}%`, `${quarterlySummary.bar3MonthAvg}%`, quarterlySummary.barTier.label],
        ['SERVICE', 'Quality of Service / Cleanliness / Grooming', `${quarterlyQAData[0].serviceMonthAvg}%`, `${quarterlyQAData[1].serviceMonthAvg}%`, `${quarterlyQAData[2].serviceMonthAvg}%`, `${quarterlySummary.service3MonthAvg}%`, quarterlySummary.serviceTier.label],
        ['TOTAL / RATA-RATA 3 DIVISI', 'Rata-rata Akumulasi 3 Divisi', `${quarterlyQAData[0].overallMonthAvg}%`, `${quarterlyQAData[1].overallMonthAvg}%`, `${quarterlyQAData[2].overallMonthAvg}%`, `${quarterlySummary.overall3MonthAvg}%`, `${quarterlySummary.overallTier.label} (${quarterlySummary.overallTier.range})`]
      ];

      rows.forEach(r => {
        const row = worksheet.addRow(r);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
        row.font = { bold: r[0].includes('TOTAL') };
        if (r[0].includes('TOTAL')) {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          });
        }
      });

      worksheet.columns.forEach(col => { col.width = 24; });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `QA_Audit_3_Bulan_${selectedOutlet || 'Outlet'}_${qaQuarter}_${qaYear}.xlsx`);
      if (showToast) showToast('File Excel QA 3 Bulan berhasil diunduh!', 'success');
    } catch (e) {
      console.error(e);
      if (showToast) showToast('Gagal mengekspor file Excel', 'error');
    }
  };

  // Render the QA Tab
  const renderQATab = () => (
    <div className="space-y-8 animate-fade-in relative z-10" id="qa-3month-container">
      {/* 1. Header Banner & Standards Reference */}
      <div className="glass-card p-8 border-l-4 border-indigo-500 bg-slate-900/70 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <i className="fas fa-award text-[180px]"></i>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-3">
              <i className="fas fa-check-double"></i> QUALITY ASSURANCE SYSTEM • 3 DIVISI
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              QA Audit Persentase 3 Divisi (Per 3 Bulan)
            </h3>
            <p className="text-slate-400 text-xs font-medium mt-1 max-w-2xl leading-relaxed">
              Penginputan audit tetap dilakukan di <strong className="text-white">bulan berjalan</strong>, namun akumulasi nilai dihitung <strong className="text-indigo-400">per 3 bulan (Triwulan / Kuartal)</strong> sesuai rata-rata ke-3 divisi (<span className="text-emerald-400 font-bold">Bar</span>, <span className="text-blue-400 font-bold">Service</span>, <span className="text-purple-400 font-bold">Kitchen</span>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleCopyQASummary}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2 active:scale-95 shadow-md"
              title="Salin Rangkuman untuk WhatsApp"
            >
              <i className="fab fa-whatsapp text-emerald-400 text-sm"></i>
              Copy WhatsApp
            </button>
            <button
              onClick={handleExportQAExcel}
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-emerald-900/30 border border-emerald-400/30"
              title="Unduh Laporan Format Excel"
            >
              <i className="fas fa-file-excel text-sm"></i>
              Export Excel
            </button>
          </div>
        </div>

        {/* Passing Score Standards Reference Card */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg font-black shadow-lg shadow-emerald-500/30">
              <i className="fas fa-award"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Passing Score Tier 1</div>
              <div className="text-base font-black text-white">EXCELLENT</div>
              <div className="text-xs font-bold text-emerald-300">91.00% - 100%</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-black shadow-lg shadow-blue-500/30">
              <i className="fas fa-check-circle"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Passing Score Tier 2</div>
              <div className="text-base font-black text-white">SATISFACTORY</div>
              <div className="text-xs font-bold text-blue-300">85.00% - 90.00%</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shadow-lg shadow-amber-500/30">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Passing Score Tier 3</div>
              <div className="text-base font-black text-white">TO IMPROVE</div>
              <div className="text-xs font-bold text-amber-300">45.00% - 84.00%</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Quarter & Period Selection Bar */}
      <div className="glass-card p-6 bg-slate-900/60 border border-white/5 flex flex-wrap items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <i className="fas fa-calendar-alt text-indigo-400"></i> Pilih Kuartal (3 Bulan):
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'Q1', label: 'Q1 (Jan - Mar)', months: 'Jan, Feb, Mar' },
              { id: 'Q2', label: 'Q2 (Apr - Jun)', months: 'Apr, Mei, Jun' },
              { id: 'Q3', label: 'Q3 (Jul - Sep)', months: 'Jul, Agu, Sep' },
              { id: 'Q4', label: 'Q4 (Okt - Des)', months: 'Okt, Nov, Des' },
              { id: 'ROLLING', label: '⚡ 3 Bulan Berjalan', months: 'Rolling 3M' }
            ].map(q => (
              <button
                key={q.id}
                onClick={() => setQaQuarter(q.id as any)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  qaQuarter === q.id 
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-900/30 scale-105' 
                    : 'bg-slate-950/40 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{q.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tahun:</label>
          <select
            value={qaYear}
            onChange={(e) => setQaYear(parseInt(e.target.value))}
            className="bg-slate-950/60 border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white outline-none focus:ring-2 ring-indigo-500"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y} className="bg-slate-900 text-white">{y}</option>
            ))}
          </select>
          <div className="text-[10px] font-bold text-slate-500 px-3 py-1.5 rounded-lg bg-slate-950/40 border border-white/5">
            Outlet: <strong className="text-white">{selectedOutlet || 'SH CIPETE'}</strong>
          </div>
        </div>
      </div>

      {/* 3. Main 3-Month Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Grand Total 3-Month Score Card */}
        <div className={`glass-card p-6 border-2 ${quarterlySummary.overallTier.borderColor} bg-slate-900/80 shadow-2xl relative overflow-hidden flex flex-col justify-between`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <i className="fas fa-trophy text-amber-400"></i> RATA-RATA 3 BULAN
              </span>
              <h4 className="text-base font-black text-white uppercase tracking-tight mt-1">
                Total QA Score (3 Divisi)
              </h4>
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${quarterlySummary.overallTier.badgeClass}`}>
              {quarterlySummary.overallTier.label}
            </span>
          </div>

          <div className="my-4">
            <div className={`text-4xl font-black tracking-tight ${quarterlySummary.overallTier.textColor}`}>
              {quarterlySummary.overall3MonthAvg}%
            </div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
              {quarterlySummary.overallTier.range} • {quarterlySummary.totalAuditsCount} Audit Tercatat
            </p>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-white/10">
            <div className="flex justify-between text-[9px] font-bold text-slate-400">
              <span>Passing Progress</span>
              <span className="text-white">{quarterlySummary.overall3MonthAvg}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${quarterlySummary.overallTier.barColor}`}
                style={{ width: `${Math.min(100, Math.max(0, quarterlySummary.overall3MonthAvg))}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[7px] font-black text-slate-500 uppercase tracking-tighter pt-0.5">
              <span>0%</span>
              <span className="text-amber-500">45%</span>
              <span className="text-blue-500">85%</span>
              <span className="text-emerald-500">91%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Kitchen Division Card */}
        <div className={`glass-card p-6 border-t-4 border-purple-500 bg-slate-900/60 shadow-xl flex flex-col justify-between`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-1.5">
                <i className="fas fa-utensils"></i> DIVISI KITCHEN
              </span>
              <h4 className="text-base font-black text-white uppercase tracking-tight mt-1">
                Kitchen 3 Bulan
              </h4>
            </div>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${quarterlySummary.kitchenTier.badgeClass}`}>
              {quarterlySummary.kitchenTier.label}
            </span>
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-white">
              {quarterlySummary.kitchen3MonthAvg}%
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Target: &ge; 85%
            </span>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-1 text-[9px]">
            {quarterlyQAData.map(m => (
              <div key={m.monthIdx} className="flex justify-between text-slate-400">
                <span>{m.monthName.substring(0, 3)}:</span>
                <span className="font-black text-white">{m.kitchenMonthAvg}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Division Card */}
        <div className={`glass-card p-6 border-t-4 border-emerald-500 bg-slate-900/60 shadow-xl flex flex-col justify-between`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                <i className="fas fa-glass-martini-alt"></i> DIVISI BAR
              </span>
              <h4 className="text-base font-black text-white uppercase tracking-tight mt-1">
                Bar 3 Bulan
              </h4>
            </div>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${quarterlySummary.barTier.badgeClass}`}>
              {quarterlySummary.barTier.label}
            </span>
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-white">
              {quarterlySummary.bar3MonthAvg}%
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Target: &ge; 85%
            </span>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-1 text-[9px]">
            {quarterlyQAData.map(m => (
              <div key={m.monthIdx} className="flex justify-between text-slate-400">
                <span>{m.monthName.substring(0, 3)}:</span>
                <span className="font-black text-white">{m.barMonthAvg}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Service Division Card */}
        <div className={`glass-card p-6 border-t-4 border-blue-500 bg-slate-900/60 shadow-xl flex flex-col justify-between`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-1.5">
                <i className="fas fa-concierge-bell"></i> DIVISI SERVICE
              </span>
              <h4 className="text-base font-black text-white uppercase tracking-tight mt-1">
                Service 3 Bulan
              </h4>
            </div>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${quarterlySummary.serviceTier.badgeClass}`}>
              {quarterlySummary.serviceTier.label}
            </span>
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-white">
              {quarterlySummary.service3MonthAvg}%
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Target: &ge; 85%
            </span>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-1 text-[9px]">
            {quarterlyQAData.map(m => (
              <div key={m.monthIdx} className="flex justify-between text-slate-400">
                <span>{m.monthName.substring(0, 3)}:</span>
                <span className="font-black text-white">{m.serviceMonthAvg}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Comparison Matrix Table (Per 3 Bulan) */}
      <div className="glass-card bg-slate-900/60 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 bg-slate-950/40 border-b border-white/5 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-table text-indigo-400"></i> Matriks Nilai QA 3 Divisi Per 3 Bulan ({quarterlyQAData.map(m => m.monthName).join(' - ')})
            </h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Rata-rata dihitung per tiga bulan sesuai rata-rata ke-3 divisi
            </p>
          </div>
          <div className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20">
            {qaQuarter} {qaYear}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5">
                <th className="p-4 pl-6">Divisi</th>
                <th className="p-4">Komponen Audit</th>
                {quarterlyQAData.map(m => (
                  <th key={m.monthIdx} className="p-4 text-center">
                    <div>{m.monthName}</div>
                    <div className="text-[8px] font-normal text-slate-500">{m.auditCount} Audit</div>
                  </th>
                ))}
                <th className="p-4 text-center bg-indigo-950/30 border-l border-white/5 text-indigo-300">
                  Rata-rata 3 Bulan
                </th>
                <th className="p-4 text-center">Status Passing Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {/* KITCHEN ROW */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-4 pl-6 font-black text-white flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">
                    <i className="fas fa-utensils"></i>
                  </div>
                  KITCHEN
                </td>
                <td className="p-4 text-slate-400 text-[11px]">Quality Food, Cleanliness, Grooming</td>
                {quarterlyQAData.map(m => (
                  <td key={m.monthIdx} className="p-4 text-center font-black text-white">
                    {m.kitchenMonthAvg > 0 ? `${m.kitchenMonthAvg}%` : <span className="text-slate-600">-</span>}
                  </td>
                ))}
                <td className="p-4 text-center font-black text-lg text-purple-400 bg-indigo-950/20 border-l border-white/5">
                  {quarterlySummary.kitchen3MonthAvg}%
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${quarterlySummary.kitchenTier.badgeClass}`}>
                    {quarterlySummary.kitchenTier.label}
                  </span>
                </td>
              </tr>

              {/* BAR ROW */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-4 pl-6 font-black text-white flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                    <i className="fas fa-glass-martini-alt"></i>
                  </div>
                  BAR
                </td>
                <td className="p-4 text-slate-400 text-[11px]">Quality Beverage, Cleanliness, Grooming</td>
                {quarterlyQAData.map(m => (
                  <td key={m.monthIdx} className="p-4 text-center font-black text-white">
                    {m.barMonthAvg > 0 ? `${m.barMonthAvg}%` : <span className="text-slate-600">-</span>}
                  </td>
                ))}
                <td className="p-4 text-center font-black text-lg text-emerald-400 bg-indigo-950/20 border-l border-white/5">
                  {quarterlySummary.bar3MonthAvg}%
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${quarterlySummary.barTier.badgeClass}`}>
                    {quarterlySummary.barTier.label}
                  </span>
                </td>
              </tr>

              {/* SERVICE ROW */}
              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-4 pl-6 font-black text-white flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">
                    <i className="fas fa-concierge-bell"></i>
                  </div>
                  SERVICE
                </td>
                <td className="p-4 text-slate-400 text-[11px]">Quality Service, Cleanliness, Grooming</td>
                {quarterlyQAData.map(m => (
                  <td key={m.monthIdx} className="p-4 text-center font-black text-white">
                    {m.serviceMonthAvg > 0 ? `${m.serviceMonthAvg}%` : <span className="text-slate-600">-</span>}
                  </td>
                ))}
                <td className="p-4 text-center font-black text-lg text-blue-400 bg-indigo-950/20 border-l border-white/5">
                  {quarterlySummary.service3MonthAvg}%
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${quarterlySummary.serviceTier.badgeClass}`}>
                    {quarterlySummary.serviceTier.label}
                  </span>
                </td>
              </tr>

              {/* OVERALL 3 DIVISI SUMMARY ROW */}
              <tr className="bg-slate-950/80 border-t-2 border-indigo-500/40 text-sm">
                <td className="p-5 pl-6 font-black text-indigo-300 uppercase tracking-wider flex items-center gap-2" colSpan={2}>
                  <i className="fas fa-star text-amber-400"></i> RATA-RATA KESELURUHAN (3 DIVISI)
                </td>
                {quarterlyQAData.map(m => (
                  <td key={m.monthIdx} className="p-5 text-center font-black text-white">
                    {m.overallMonthAvg > 0 ? `${m.overallMonthAvg}%` : <span className="text-slate-600">-</span>}
                  </td>
                ))}
                <td className="p-5 text-center font-black text-2xl text-white bg-indigo-600/30 border-l border-white/10">
                  {quarterlySummary.overall3MonthAvg}%
                </td>
                <td className="p-5 text-center">
                  <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${quarterlySummary.overallTier.badgeClass}`}>
                    {quarterlySummary.overallTier.label} ({quarterlySummary.overallTier.range})
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Input Form: PENGINPUTAN BULAN BERJALAN */}
      <div className="glass-card p-8 bg-slate-900/80 border-2 border-indigo-500/30 rounded-3xl shadow-2xl relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-2">
              <i className="fas fa-edit"></i> INPUT AUDIT BULAN BERJALAN
            </div>
            <h4 className="text-xl font-black text-white uppercase tracking-tight">
              {isEditingQA ? 'Edit / Perbarui Data Audit QA' : 'Input Data Audit QA Baru'}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Penginputan tetap dilakukan di bulan berjalan. Masukkan nilai persentase (0 - 100%) untuk Bar, Service, dan Kitchen.
            </p>
          </div>

          {/* Quick Date Presets & Date Picker */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/60 p-2 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Tanggal Audit:</label>
              <input
                type="date"
                value={qaInputDate}
                onChange={(e) => setQaInputDate(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white outline-none focus:ring-2 ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setQaInputDate(toLocalDateStr(new Date()))}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-wider"
            >
              Hari Ini
            </button>
          </div>
        </div>

        {/* Quick Presets for Testing */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i className="fas fa-bolt text-yellow-400"></i> Isi Cepat (Preset Passing Score):
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleApplyQAPreset('EXCELLENT')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider transition-all"
            >
              ⚡ Preset Excellent (~95%)
            </button>
            <button
              type="button"
              onClick={() => handleApplyQAPreset('SATISFACTORY')}
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-black uppercase tracking-wider transition-all"
            >
              ⚡ Preset Satisfactory (~88%)
            </button>
            <button
              type="button"
              onClick={() => handleApplyQAPreset('TO_IMPROVE')}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider transition-all"
            >
              ⚡ Preset To Improve (~78%)
            </button>
            <button
              type="button"
              onClick={() => {
                setQaKitchen({ product: 0, cleanliness: 0, grooming: 0 });
                setQaBar({ product: 0, cleanliness: 0, grooming: 0 });
                setQaService({ product: 0, cleanliness: 0, grooming: 0 });
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider transition-all"
            >
              <i className="fas fa-eraser"></i> Kosongkan
            </button>
          </div>
        </div>

        {/* 3 Division Input Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          {/* 1. KITCHEN INPUT */}
          <div className="glass-card p-6 bg-slate-950/50 border-t-4 border-purple-500 rounded-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h5 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-utensils text-purple-400"></i> Divisi Kitchen
              </h5>
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getQaScoreTier(liveKitchenAvg).badgeClass}`}>
                {getQaScoreTier(liveKitchenAvg).label}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Quality Food</span>
                  <span className="text-white font-mono">{qaKitchen.product}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaKitchen.product}
                  onChange={(e) => setQaKitchen({ ...qaKitchen, product: Number(e.target.value) })}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaKitchen.product || ''}
                  placeholder="0"
                  onChange={(e) => setQaKitchen({ ...qaKitchen, product: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Cleanliness</span>
                  <span className="text-white font-mono">{qaKitchen.cleanliness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaKitchen.cleanliness}
                  onChange={(e) => setQaKitchen({ ...qaKitchen, cleanliness: Number(e.target.value) })}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaKitchen.cleanliness || ''}
                  placeholder="0"
                  onChange={(e) => setQaKitchen({ ...qaKitchen, cleanliness: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Grooming</span>
                  <span className="text-white font-mono">{qaKitchen.grooming}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaKitchen.grooming}
                  onChange={(e) => setQaKitchen({ ...qaKitchen, grooming: Number(e.target.value) })}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaKitchen.grooming || ''}
                  placeholder="0"
                  onChange={(e) => setQaKitchen({ ...qaKitchen, grooming: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-purple-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 uppercase tracking-widest font-black text-[9px]">Rata-rata Kitchen:</span>
              <span className="text-lg font-black text-purple-400">{liveKitchenAvg}%</span>
            </div>
          </div>

          {/* 2. BAR INPUT */}
          <div className="glass-card p-6 bg-slate-950/50 border-t-4 border-emerald-500 rounded-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h5 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-glass-martini-alt text-emerald-400"></i> Divisi Bar
              </h5>
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getQaScoreTier(liveBarAvg).badgeClass}`}>
                {getQaScoreTier(liveBarAvg).label}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Quality Beverage</span>
                  <span className="text-white font-mono">{qaBar.product}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaBar.product}
                  onChange={(e) => setQaBar({ ...qaBar, product: Number(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaBar.product || ''}
                  placeholder="0"
                  onChange={(e) => setQaBar({ ...qaBar, product: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Cleanliness</span>
                  <span className="text-white font-mono">{qaBar.cleanliness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaBar.cleanliness}
                  onChange={(e) => setQaBar({ ...qaBar, cleanliness: Number(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaBar.cleanliness || ''}
                  placeholder="0"
                  onChange={(e) => setQaBar({ ...qaBar, cleanliness: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Grooming</span>
                  <span className="text-white font-mono">{qaBar.grooming}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaBar.grooming}
                  onChange={(e) => setQaBar({ ...qaBar, grooming: Number(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaBar.grooming || ''}
                  placeholder="0"
                  onChange={(e) => setQaBar({ ...qaBar, grooming: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 uppercase tracking-widest font-black text-[9px]">Rata-rata Bar:</span>
              <span className="text-lg font-black text-emerald-400">{liveBarAvg}%</span>
            </div>
          </div>

          {/* 3. SERVICE INPUT */}
          <div className="glass-card p-6 bg-slate-950/50 border-t-4 border-blue-500 rounded-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h5 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-concierge-bell text-blue-400"></i> Divisi Service
              </h5>
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getQaScoreTier(liveServiceAvg).badgeClass}`}>
                {getQaScoreTier(liveServiceAvg).label}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Quality Service</span>
                  <span className="text-white font-mono">{qaService.product}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaService.product}
                  onChange={(e) => setQaService({ ...qaService, product: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaService.product || ''}
                  placeholder="0"
                  onChange={(e) => setQaService({ ...qaService, product: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Cleanliness</span>
                  <span className="text-white font-mono">{qaService.cleanliness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaService.cleanliness}
                  onChange={(e) => setQaService({ ...qaService, cleanliness: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaService.cleanliness || ''}
                  placeholder="0"
                  onChange={(e) => setQaService({ ...qaService, cleanliness: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  <span>Grooming</span>
                  <span className="text-white font-mono">{qaService.grooming}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={qaService.grooming}
                  onChange={(e) => setQaService({ ...qaService, grooming: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qaService.grooming || ''}
                  placeholder="0"
                  onChange={(e) => setQaService({ ...qaService, grooming: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-1 ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 uppercase tracking-widest font-black text-[9px]">Rata-rata Service:</span>
              <span className="text-lg font-black text-blue-400">{liveServiceAvg}%</span>
            </div>
          </div>
        </div>

        {/* Live Total & Save Action Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-950/60 -mx-8 -mb-8 p-8 rounded-b-3xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-black text-indigo-400">
              <i className="fas fa-calculator"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Nilai Total Audit Tanggal {qaInputDate}:
              </div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black text-white">{liveOutletAvg}%</span>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${getQaScoreTier(liveOutletAvg).badgeClass}`}>
                  {getQaScoreTier(liveOutletAvg).label} ({getQaScoreTier(liveOutletAvg).range})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            {isEditingQA && (
              <button
                type="button"
                onClick={() => handleDeleteQA(qaInputDate)}
                className="px-5 py-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
              >
                <i className="fas fa-trash-alt mr-2"></i> Hapus Audit
              </button>
            )}
            <button
              type="button"
              disabled={isSavingQA}
              onClick={handleSaveQA}
              className="flex-1 md:flex-initial px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/40 border border-emerald-400/40 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isSavingQA ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Menyimpan...
                </>
              ) : (
                <>
                  <i className="fas fa-save"></i> {isEditingQA ? 'Simpan Perubahan Audit' : 'Simpan QA Bulan Berjalan'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 6. Riwayat Audit Triwulan Terpilih */}
      <div className="glass-card bg-slate-900/60 border border-white/5 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 bg-slate-950/40 border-b border-white/5 flex justify-between items-center">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-history text-indigo-400"></i> Riwayat Input Audit QA ({qaQuarter} {qaYear})
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Daftar audit harian/bulanan yang tercatat dalam periode 3 bulan terpilih
            </p>
          </div>
          <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            {quarterlySummary.totalAuditsCount} Data Tersimpan
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/40 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5">
                <th className="p-4 pl-6">Tanggal Audit</th>
                <th className="p-4 text-center">Kitchen</th>
                <th className="p-4 text-center">Bar</th>
                <th className="p-4 text-center">Service</th>
                <th className="p-4 text-center bg-indigo-950/20 text-indigo-300">Rata-rata 3 Divisi</th>
                <th className="p-4 text-center">Passing Status</th>
                <th className="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-bold">
              {quarterlyQAData.flatMap(m => m.auditList).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <i className="fas fa-clipboard-check text-4xl mb-3 opacity-30"></i>
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada data audit QA untuk kuartal ini</p>
                    <p className="text-[10px] text-slate-600 mt-1">Gunakan form di atas untuk menginput audit pada bulan berjalan</p>
                  </td>
                </tr>
              ) : (
                quarterlyQAData.flatMap(m => m.auditList).map(audit => {
                  const auditTier = getQaScoreTier(audit.overallAvg);
                  return (
                    <tr key={audit.date} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 pl-6 font-mono font-black text-white">
                        {audit.date}
                      </td>
                      <td className="p-4 text-center font-black text-purple-300">
                        {audit.kitchenAvg}%
                      </td>
                      <td className="p-4 text-center font-black text-emerald-300">
                        {audit.barAvg}%
                      </td>
                      <td className="p-4 text-center font-black text-blue-300">
                        {audit.serviceAvg}%
                      </td>
                      <td className="p-4 text-center font-black text-base text-white bg-indigo-950/10">
                        {audit.overallAvg}%
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${auditTier.badgeClass}`}>
                          {auditTier.label}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setQaInputDate(audit.date);
                              if (showToast) showToast(`Data audit untuk ${audit.date} dimuat ke form input!`, 'info');
                            }}
                            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white transition-all text-xs"
                            title="Edit / Tinjau di Form"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQA(audit.date)}
                            className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-xs"
                            title="Hapus Audit"
                          >
                            <i className="fas fa-trash-alt"></i>
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
    </div>
  );

  const renderGSITab = () => (
    <div className="space-y-8 animate-fade-in relative z-10">
       <div className="glass-card p-8 border-l-4 border-indigo-500 bg-slate-900/60 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><i className="fas fa-poll text-[180px]"></i></div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
             <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                  <i className={`fas ${isEditingGSI ? 'fa-edit text-yellow-400' : 'fa-plus-circle text-indigo-400'}`}></i>
                  {isEditingGSI ? 'Review / Edit GSI Entry' : 'Cumulative GSI Entry'}
                </h3>
                <p className="text-slate-500 text-[10px] font-black uppercase mt-1 tracking-widest italic">
                  {isEditingGSI 
                    ? `Mengedit data yang sudah ada untuk tanggal ${gsiDate} (Data akan menimpa data lama)` 
                    : `Input batch respon untuk tanggal ${gsiDate} (Data akan menimpa data lama)`}
                </p>
             </div>
             <div className="flex flex-wrap items-center gap-4 bg-slate-950/50 p-2 rounded-2xl border border-white/5">
                <div className="flex items-center">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2 mr-3">Tanggal Entry:</label>
                   <input 
                     type="date" 
                     className="bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-black text-white focus:ring-2 ring-indigo-500 outline-none"
                     value={gsiDate}
                     onChange={(e) => {
                       const newDate = e.target.value;
                       setGsiDate(newDate);
                       const newMonthIdx = parseInt(newDate.split('-')[1]) - 1;
                       if (newMonthIdx !== parseInt(filters.month)) {
                         const year = newDate.split('-')[0];
                         const lastDay = new Date(parseInt(year), newMonthIdx + 1, 0).getDate();
                         onFilterChange({ 
                           ...filters, 
                           month: newMonthIdx.toString(),
                           year: year,
                           startDate: newDate,
                           endDate: `${year}-${(newMonthIdx + 1).toString().padStart(2, '0')}-${lastDay}`
                         });
                       } else {
                         onFilterChange({ ...filters, startDate: newDate });
                       }
                     }}
                   />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocalInput(INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0})));
                    setIsEditingGSI(false);
                    if (showToast) showToast(`Modus input diaktifkan untuk tanggal ${gsiDate}. Simpan data ini untuk menimpa data sebelumnya.`, 'info');
                  }}
                  className="px-4 py-3 bg-indigo-600 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-400/50 hover:border-emerald-400 active:scale-95 flex items-center gap-2 shadow-lg shadow-indigo-900/20"
                >
                  <i className="fas fa-plus"></i>
                  Add Data for {gsiDate}
                </button>
                {onNavigateToRegionalSummaryReport && (
                  <button
                    type="button"
                    onClick={onNavigateToRegionalSummaryReport}
                    className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-900/30 active:scale-95 flex items-center gap-2 border border-purple-400/30"
                    title="Buka Summary Report GSI di halaman Regional"
                  >
                    <i className="fas fa-chart-line"></i>
                    <span>Lihat di Summary Report Regional</span>
                  </button>
                )}
             </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-indigo-300">
            <i className="fas fa-link text-indigo-400"></i>
            <span className="font-semibold">Terhubung ke Regional:</span>
            <span className="text-slate-400">Data GSI yang disimpan di sini otomatis terhubung & direkap secara live ke kolom GSI (QOS, QOF, QOB, AOS, VFM, Total Response) di tabel Summary Report Regional.</span>
          </div>
       </div>

       {/* Tabel Input Batch Baru */}
       <div className="glass-card overflow-hidden border border-white/10 shadow-2xl bg-indigo-500/5">
          <div className="p-4 bg-indigo-500/10 border-b border-white/5">
             <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Input Data GSI (Data Baru Akan Menimpa Data Lama)</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-slate-950 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="p-6">Subject</th>
                  <th className="p-6 text-center text-emerald-400">Excellent</th>
                  <th className="p-6 text-center text-blue-400">Good</th>
                  <th className="p-6 text-center text-yellow-400">Average</th>
                  <th className="p-6 text-center text-orange-400">Poor</th>
                  <th className="p-6 text-center text-slate-400">Abstain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                 {localInput.map(row => (
                   <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-6 font-black text-white text-xs uppercase tracking-tight">{row.subject}</td>
                      {['excellent', 'good', 'average', 'poor', 'abstain'].map(field => (
                        <td key={field} className="p-4 text-center">
                          <input 
                            type="number" 
                            onKeyDown={handleKeyDown}
                            className="w-20 bg-slate-900 border border-white/5 rounded-xl p-3 text-center font-black text-white text-sm focus:ring-2 ring-indigo-500 outline-none transition-all placeholder:text-slate-800"
                            placeholder="0"
                            value={(row as any)[field] || ''}
                            onChange={(e) => handleGSIInputChange(row.id, field as any, e.target.value)}
                          />
                        </td>
                      ))}
                   </tr>
                 ))}
              </tbody>
            </table>
          </div>
       </div>

       {/* Tombol Enter Action */}
       <div className="flex gap-4">
         {isEditingGSI && (
           <button 
             onClick={() => {
               setIsEditingGSI(false);
               setLocalInput(INITIAL_GSI_STRUCTURE.map(item => ({...item, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0})));
             }}
             className="px-8 py-8 rounded-3xl font-black text-xs uppercase tracking-widest bg-slate-800 text-slate-300 border border-white/5"
           >
             Cancel
           </button>
         )}
         <button 
          onClick={handleSaveGSI}
          disabled={isSaving}
          className={`flex-1 py-8 rounded-3xl font-black text-lg uppercase tracking-[0.5em] shadow-2xl transition-all flex flex-col items-center justify-center gap-2 active:scale-95 border border-white/10 ${
            isSaving ? 'bg-slate-800 text-slate-600 cursor-wait' : isEditingGSI ? 'bg-gradient-to-r from-yellow-600 to-amber-700 text-white shadow-yellow-500/30' : 'bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white shadow-indigo-500/30'
          }`}
         >
           <div className="flex items-center gap-4">
             {isSaving ? <i className="fas fa-sync fa-spin"></i> : <i className={`fas ${isEditingGSI ? 'fa-save' : 'fa-keyboard'}`}></i>}
             {isSaving ? 'UPDATING...' : isEditingGSI ? 'UPDATE DATA' : 'ENTER DATA'}
           </div>
           {!isSaving && <span className="text-[9px] opacity-50 tracking-[0.2em]">{isEditingGSI ? 'Simpan perubahan data GSI' : 'Klik di sini atau tekan tombol Enter di keyboard'}</span>}
         </button>

         <button 
          onClick={handleClearGSI}
          className="px-10 py-8 rounded-3xl font-black text-lg uppercase tracking-[0.2em] bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white transition-all border border-red-500/30 active:scale-95 flex items-center justify-center"
          title="Clear all data for this date"
         >
           <i className="fas fa-trash-alt"></i>
         </button>
       </div>

       {/* Preview Data Terkumpul (Read Only) */}
       <div className="glass-card overflow-hidden border border-white/10 shadow-xl bg-slate-900/40">
          <div className="p-4 bg-slate-950/80 border-b border-white/5 flex justify-between items-center">
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Terkumpul di Database ({gsiDate})</span>
             <div className="flex items-center gap-2">
                {!isEditingGSI && (
                   <button 
                     onClick={() => {
                        setLocalInput(storedTotalForDate);
                        setIsEditingGSI(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                     }}
                     className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-lg border border-yellow-500/30 hover:bg-yellow-500 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest"
                   >
                      <i className="fas fa-edit mr-1"></i> Edit Mode
                   </button>
                )}
                <span className="text-[8px] font-bold text-emerald-500 uppercase px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">Stored Data</span>
             </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left opacity-60 min-w-[600px]">
            <tbody className="divide-y divide-white/5">
               {storedTotalForDate.map(row => (
                 <tr key={row.id} className="text-[10px]">
                    <td className="p-4 font-black text-slate-400 uppercase">{row.subject}</td>
                    <td className="p-4 text-center text-white font-bold">{row.excellent} Exc</td>
                    <td className="p-4 text-center text-white font-bold">{row.good} G</td>
                    <td className="p-4 text-center text-white font-bold">{row.average} Avg</td>
                    <td className="p-4 text-center text-white font-bold">{row.poor} P</td>
                    <td className="p-4 text-center text-white font-bold">{row.abstain} Abs</td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderMasterTab = () => (
    <div className="space-y-8 animate-fade-in relative z-10">
      <div className="glass-card p-8 bg-slate-900/60 border-white/10 space-y-6 shadow-2xl">
        <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
          <i className="fas fa-user-plus text-indigo-400"></i>
          Register New Staff Member
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Staff Name</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="Full Name..."
              value={newStaffName}
              onChange={e => setNewStaffName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Division</label>
            <select 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              value={newStaffDivision}
              onChange={e => {
                const div = e.target.value as Division;
                setNewStaffDivision(div);
                setNewStaffRole(''); // Reset role when division changes
              }}
            >
              <option value="">-- Select Division --</option>
              {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Role / Position</label>
            <select 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500 disabled:opacity-50"
              value={newStaffRole}
              onChange={e => setNewStaffRole(e.target.value)}
              disabled={!newStaffDivision}
            >
              <option value="">-- Select Role --</option>
              {newStaffDivision && ROLES_BY_DIVISION[newStaffDivision]?.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
              {!newStaffDivision && <option disabled>Select division first</option>}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Outlet</label>
            <div className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-black text-emerald-400 uppercase tracking-widest">
              {selectedOutlet || 'NOT SELECTED'}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Join Date</label>
            <input 
              type="date" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              value={newStaffJoinDate}
              onChange={e => setNewStaffJoinDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Basic Salary (Rp)</label>
            <input 
              type="number" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="0"
              value={newStaffBasicSalary || ''}
              onChange={e => setNewStaffBasicSalary(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">No. Rekening</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="Bank & No Rekening..."
              value={newStaffBankAccount}
              onChange={e => setNewStaffBankAccount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">No. Telp Pribadi</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="0812..."
              value={newStaffPersonalPhone}
              onChange={e => setNewStaffPersonalPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">No. Telp Orang Tua</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="0812..."
              value={newStaffParentPhone}
              onChange={e => setNewStaffParentPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">NIK KTP</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="16 Digit NIK..."
              value={newStaffNik}
              onChange={e => setNewStaffNik(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Tanggal Lahir</label>
            <input 
              type="date" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              value={newStaffBirthDate}
              onChange={e => setNewStaffBirthDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Email Address</label>
            <input 
              type="email" 
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500"
              placeholder="email@sh.com..."
              value={newStaffEmail}
              onChange={e => setNewStaffEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Hak Cuti Terhitung</label>
            <div className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Otomatis By Join Date</span>
              <span className="text-sm font-black text-indigo-400">{calculateEntitlement(newStaffJoinDate).accrued} <span className="text-[9px] text-slate-500">HARI</span></span>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1 flex items-center gap-3 bg-slate-950 p-4 rounded-xl border border-white/10">
              <input 
                type="checkbox" 
                id="isLeader" 
                checked={newStaffIsLeader}
                onChange={e => setNewStaffIsLeader(e.target.checked)}
                className="w-5 h-5 accent-indigo-500"
              />
              <label htmlFor="isLeader" className="text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer">Leader Status</label>
            </div>
            <button 
              onClick={handleAddStaff}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 border border-white/10"
            >
              SUBMIT STAFF
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Staff Database</h3>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
            <input 
              type="text" 
              placeholder="CARI NAMA STAFF..."
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-[10px] font-black text-white outline-none focus:ring-2 ring-indigo-500 uppercase"
              value={staffSearchQuery}
              onChange={e => setStaffSearchQuery(e.target.value)}
            />
          </div>
          {staffFilterOutlet !== 'ALL' && staffFilterOutlet === selectedOutlet && (
            <button 
              onClick={() => handleClearOutletStaff(staffFilterOutlet as Outlet)}
              className="px-4 py-2 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-red-500/20 flex items-center gap-2"
            >
              <i className="fas fa-trash-alt"></i> Hapus Semua Staff di {staffFilterOutlet}
            </button>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Outlet:</label>
            <select 
              className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-emerald-400 uppercase tracking-widest outline-none focus:ring-1 ring-indigo-500"
              value={staffFilterOutlet}
              onChange={(e) => setStaffFilterOutlet(e.target.value as Outlet | 'ALL')}
            >
              <option value="ALL">ALL OUTLETS</option>
              {OUTLETS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER', 'PUBLIC ATTENDANCE', 'STEWARD', 'OTHERS'].map(div => {
          const divStaff = sortStaff(data.staffList)
            .filter(s => staffFilterOutlet === 'ALL' || s.outlet === staffFilterOutlet)
            .filter(s => !staffSearchQuery || s.name.toUpperCase().includes(staffSearchQuery.toUpperCase()))
            .filter(s => s.status === 'ACTIVE' || !s.status)
            .filter(s => {
              if (div === 'OTHERS') {
                return !s.division || !['SERVICE', 'BAR', 'KITCHEN', 'PUBLIC ATTENDANCE', 'STORE KEEPER', 'STEWARD'].includes(s.division);
              }
              return s.division === div;
            });

          if (divStaff.length === 0) return null;

          return (
            <React.Fragment key={div}>
              <div className="col-span-full mt-4 mb-2">
                <span className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase border-b border-indigo-500/20 pb-1">{div}</span>
              </div>
              {divStaff.map(staff => {
                const isEditing = editingStaffId === staff.id;
                const canEdit = staff.outlet === selectedOutlet;

                const mergedLeaveRecords = getMergedLeaveRecords(data.leaveRecords || [], data.monthlySchedule);
                const totalLeaveTaken = mergedLeaveRecords
                  .filter(r => r.staffId === staff.staffId)
                  .reduce((acc, r) => acc + (r.totalDays || 1), 0);
                const autoEntitlement = calculateEntitlement(staff.joinDate).accrued;
                const currentEntitlement = autoEntitlement;
                const sisaCuti = currentEntitlement - totalLeaveTaken;

                return (
                  <div key={staff.id} className={`glass-card p-6 border border-white/10 transition-all hover:shadow-2xl hover:border-indigo-500/30 group relative overflow-hidden ${isEditing ? 'ring-2 ring-indigo-500 bg-slate-800' : 'bg-slate-900/40'}`}>
                    {/* Background Icon Decor */}
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity">
                      <i className={`fas ${staff.isLeader ? 'fa-crown' : 'fa-user'} text-[120px]`}></i>
                    </div>

                    <div className="relative z-10 space-y-4">
                      {/* Header: Name & Role */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          {isEditing ? (
                            <input 
                              type="text" 
                              className="bg-slate-950 border border-white/10 rounded-xl p-3 text-sm font-black text-white w-full outline-none focus:ring-2 ring-indigo-500"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              placeholder="Nama Lengkap"
                            />
                          ) : (
                            <h4 className="font-black text-white text-lg tracking-tighter uppercase group-hover:text-indigo-400 transition-colors">{staff.name}</h4>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {isEditing ? (
                              <div className="space-y-2 w-full mt-2">
                                <select 
                                  className="bg-slate-950 border border-white/10 rounded-xl p-2 text-[10px] font-black text-indigo-400 w-full uppercase outline-none"
                                  value={editDivision}
                                  onChange={e => {
                                    setEditDivision(e.target.value as Division);
                                    setEditRole('');
                                  }}
                                >
                                  <option value="">-- Divisi --</option>
                                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select 
                                  className="bg-slate-950 border border-white/10 rounded-xl p-2 text-[10px] font-bold text-white w-full uppercase outline-none disabled:opacity-50"
                                  value={editRole}
                                  onChange={e => setEditRole(e.target.value)}
                                  disabled={!editDivision}
                                >
                                  <option value="">-- Role --</option>
                                  {editDivision && ROLES_BY_DIVISION[editDivision]?.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <>
                                <span className="text-indigo-400 text-[9px] font-black uppercase tracking-widest">{staff.role}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                <span className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">{staff.division || '-'}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${staff.isLeader ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20' : 'bg-slate-800 text-slate-500 border-white/5'}`}>
                            {staff.isLeader ? 'LEADER' : 'CREW'}
                          </span>
                          <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {staff.outlet || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Join Date</label>
                          {isEditing ? (
                            <input 
                              type="date" 
                              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                              value={editJoinDate}
                              onChange={e => setEditJoinDate(e.target.value)}
                            />
                          ) : (
                            <div className="text-slate-300 text-[10px] font-bold">{staff.joinDate || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Basic Salary</label>
                          {isEditing ? (
                            <input 
                              type="number" 
                              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                              value={editBasicSalary || ''}
                              onChange={e => setEditBasicSalary(Number(e.target.value))}
                            />
                          ) : (
                            <div className="text-emerald-400 text-[10px] font-black">Rp {(staff.basicSalary || 0).toLocaleString('id-ID')}</div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">NIK KTP</label>
                          {isEditing ? (
                            <input 
                              type="text" 
                              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                              value={editNik}
                              onChange={e => setEditNik(e.target.value)}
                              placeholder="NIK"
                            />
                          ) : (
                            <div className="text-slate-300 text-[10px] font-bold">{staff.nik || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Tanggal Lahir</label>
                          {isEditing ? (
                            <input 
                              type="date" 
                              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                              value={editBirthDate}
                              onChange={e => setEditBirthDate(e.target.value)}
                            />
                          ) : (
                            <div className="text-slate-300 text-[10px] font-bold">{staff.birthDate || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Hak Cuti</label>
                          <div className="text-indigo-400 text-[10px] font-black">{currentEntitlement} Hari</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Sisa Cuti</label>
                          <div className={`text-[10px] font-black ${sisaCuti <= 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                            {sisaCuti} Hari
                          </div>
                        </div>

                        {(staff.status === 'RESIGNED_PROSEDUR' || staff.status === 'RESIGNED_NON_PROSEDUR' || isEditing) && (
                          <>
                            <div className="space-y-1 col-span-2 border-t border-white/5 pt-2">
                              <label className="text-[8px] font-black text-red-500 uppercase tracking-widest">Tanggal Resign</label>
                              {isEditing ? (
                                <input 
                                  type="date" 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                                  value={editResignDate}
                                  onChange={e => setEditResignDate(e.target.value)}
                                />
                              ) : (
                                <div className="text-red-400 text-[10px] font-bold">{staff.resignDate || staff.statusDate || '-'}</div>
                              )}
                            </div>
                            <div className="space-y-1 col-span-2">
                              <label className="text-[8px] font-black text-red-500 uppercase tracking-widest">Alasan Resign</label>
                              {isEditing ? (
                                <textarea 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-3 text-[10px] font-black text-white w-full outline-none h-16 resize-none"
                                  placeholder="Alasan pengunduran diri..."
                                  value={editResignReason}
                                  onChange={e => setEditResignReason(e.target.value)}
                                />
                              ) : (
                                <div className="text-slate-300 text-[10px] font-bold bg-slate-950/30 p-2 rounded-lg border border-white/5">{staff.resignReason || 'Tidak ada keterangan'}</div>
                              )}
                            </div>
                          </>
                        )}

                        {(staff.status === 'MUTASI' || isEditing) && (
                          <>
                            <div className="space-y-1 col-span-2 border-t border-white/5 pt-2">
                              <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Tanggal Mutasi</label>
                              {isEditing ? (
                                <input 
                                  type="date" 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none"
                                  value={editMutationDate}
                                  onChange={e => setEditMutationDate(e.target.value)}
                                />
                              ) : (
                                <div className="text-blue-400 text-[10px] font-bold">{staff.mutationDate || staff.statusDate || '-'}</div>
                              )}
                            </div>
                            <div className="space-y-1 col-span-2">
                              <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Alasan Mutasi</label>
                              {isEditing ? (
                                <textarea 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-3 text-[10px] font-black text-white w-full outline-none h-16 resize-none"
                                  placeholder="Keterangan mutasi..."
                                  value={editMutationReason}
                                  onChange={e => setEditMutationReason(e.target.value)}
                                />
                              ) : (
                                <div className="text-slate-300 text-[10px] font-bold bg-slate-950/30 p-2 rounded-lg border border-white/5">{staff.mutationReason || 'Tidak ada keterangan'}</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Contact & Bank Info */}
                      <div className="space-y-3 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-white/5 flex items-center justify-center text-indigo-400 text-xs shadow-inner">
                            <i className="fas fa-university"></i>
                          </div>
                          <div className="flex-1">
                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest block">No. Rekening</label>
                            {isEditing ? (
                              <input 
                                type="text" 
                                className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none mt-1"
                                value={editBankAccount}
                                onChange={e => setEditBankAccount(e.target.value)}
                                placeholder="Bank & No Rek"
                              />
                            ) : (
                              <div className="text-slate-300 text-[10px] font-bold tracking-tight">{staff.bankAccount || 'Belum diisi'}</div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-950 border border-white/5 flex items-center justify-center text-blue-400 text-xs shadow-inner">
                              <i className="fas fa-mobile-alt"></i>
                            </div>
                            <div className="flex-1">
                              <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest block">Telp Pribadi</label>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none mt-1"
                                  value={editPersonalPhone}
                                  onChange={e => setEditPersonalPhone(e.target.value)}
                                  placeholder="08..."
                                />
                              ) : (
                                <div className="text-slate-300 text-[10px] font-bold">{staff.personalPhone || '-'}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-950 border border-white/5 flex items-center justify-center text-orange-400 text-xs shadow-inner">
                              <i className="fas fa-users"></i>
                            </div>
                            <div className="flex-1">
                              <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest block">Telp Orang Tua</label>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none mt-1"
                                  value={editParentPhone}
                                  onChange={e => setEditParentPhone(e.target.value)}
                                  placeholder="08..."
                                />
                              ) : (
                                <div className="text-slate-300 text-[10px] font-bold">{staff.parentPhone || '-'}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-white/5 flex items-center justify-center text-emerald-400 text-xs shadow-inner">
                            <i className="fas fa-envelope"></i>
                          </div>
                          <div className="flex-1">
                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest block">Email Address</label>
                            {isEditing ? (
                              <input 
                                type="email" 
                                className="bg-slate-950 border border-white/10 rounded-lg p-2 text-[10px] font-black text-white w-full outline-none mt-1"
                                value={editEmail}
                                onChange={e => setEditEmail(e.target.value)}
                                placeholder="email@sh.com"
                              />
                            ) : (
                              <div className="text-slate-300 text-[10px] font-bold">{staff.email || '-'}</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                id={`editLeader-${staff.id}`}
                                checked={editIsLeader}
                                onChange={e => setEditIsLeader(e.target.checked)}
                                className="w-4 h-4 accent-indigo-500"
                              />
                              <label htmlFor={`editLeader-${staff.id}`} className="text-[8px] font-black text-slate-400 uppercase cursor-pointer">LEADER</label>
                            </div>
                          ) : (
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ID: {staff.staffId}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={handleSaveEdit} className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20">
                                <i className="fas fa-check"></i>
                              </button>
                              <button onClick={() => setEditingStaffId(null)} className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all flex items-center justify-center">
                                <i className="fas fa-times"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  if (staff.outlet !== selectedOutlet) {
                                    setShowConfirm({
                                      title: "Permission Denied",
                                      message: `Anda tidak memiliki izin untuk mengedit staff dari outlet ${staff.outlet}. Silakan login ke outlet tersebut.`,
                                      onConfirm: () => setShowConfirm(null)
                                    });
                                    return;
                                  }
                                  handleStartEdit(staff);
                                }}
                                className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${canEdit ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white' : 'bg-slate-800/50 border-white/5 text-slate-700 cursor-not-allowed'}`}
                                title="Edit Staff Info"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button 
                                onClick={() => {
                                  if (staff.outlet !== selectedOutlet) {
                                    setShowConfirm({
                                      title: "Permission Denied",
                                      message: `Anda tidak memiliki izin untuk mengubah status staff dari outlet ${staff.outlet}. Silakan login ke outlet tersebut.`,
                                      onConfirm: () => setShowConfirm(null)
                                    });
                                    return;
                                  }
                                  setSelectedStaffForStatus(staff.id);
                                  setStatusChangeDate(new Date().toISOString().split('T')[0]);
                                  setPendingStatus(staff.status || 'ACTIVE');
                                }}
                                className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${canEdit ? 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700 hover:text-white' : 'bg-slate-800/50 border-white/5 text-slate-700 cursor-not-allowed'}`}
                                title="Update Status"
                              >
                                <i className="fas fa-user-edit"></i>
                              </button>
                              <button 
                                onClick={() => handleRemoveStaff(staff.id)} 
                                className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${canEdit ? 'bg-red-600/10 border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white' : 'bg-slate-800/50 border-white/5 text-slate-700 cursor-not-allowed'}`}
                                title="Remove Staff"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* Final Submit Button */}
      <div className="pt-10 flex justify-center">
        <button 
          onClick={async () => {
            if (selectedOutlet) {
              await pushNotification(user.email, selectedOutlet, "Finalized and submitted Staff Database updates");
            }
            setShowSuccess({
              title: "DATABASE UPDATED",
              message: "Database Staff telah berhasil disubmit dan diperbarui secara cloud!",
            });
            safeWindow.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="group relative px-12 py-6 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 border border-white/10 flex items-center gap-4"
        >
          <i className="fas fa-check-double text-xl group-hover:scale-125 transition-transform"></i>
          FINISH & SUBMIT DATABASE
        </button>
      </div>

      {/* Status Update Modal */}
      {selectedStaffForStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-md p-8 border border-white/10 shadow-2xl bg-slate-900 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Update Staff Status</h3>
              <button onClick={() => {
                setSelectedStaffForStatus(null);
                setPendingStatus(null);
              }} className="text-slate-500 hover:text-white">
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Choose status first */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Status Baru</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      setPendingStatus('ACTIVE');
                      setStatusChangeResignReason('');
                      setStatusChangeMutationReason('');
                    }}
                    className={`p-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all border ${
                      pendingStatus === 'ACTIVE' 
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' 
                      : 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/20'
                    }`}
                  >
                    Active
                  </button>
                  <button 
                    onClick={() => {
                      setPendingStatus('MUTASI');
                      setStatusChangeResignReason('');
                    }}
                    className={`p-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all border ${
                      pendingStatus === 'MUTASI' 
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' 
                      : 'bg-blue-600/10 text-blue-400 border-blue-500/20 hover:bg-blue-600/20'
                    }`}
                  >
                    Mutasi
                  </button>
                  <button 
                    onClick={() => {
                      setPendingStatus('RESIGNED_PROSEDUR');
                      setStatusChangeMutationReason('');
                    }}
                    className={`p-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all border ${
                      pendingStatus === 'RESIGNED_PROSEDUR' 
                      ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/20' 
                      : 'bg-red-600/10 text-red-400 border-red-500/20 hover:bg-red-600/10 hover:text-red-300'
                    }`}
                  >
                    Resign Prosedur
                  </button>
                  <button 
                    onClick={() => {
                      setPendingStatus('RESIGNED_NON_PROSEDUR');
                      setStatusChangeMutationReason('');
                    }}
                    className={`p-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all border ${
                      pendingStatus === 'RESIGNED_NON_PROSEDUR' 
                      ? 'bg-orange-600 text-white border-orange-500 shadow-lg shadow-orange-500/20' 
                      : 'bg-orange-600/10 text-orange-400 border-orange-500/20 hover:bg-orange-600/10 hover:text-orange-300'
                    }`}
                  >
                    Resign Non-Pros
                  </button>
                </div>
              </div>

              {/* Dynamic Date & Fields Selection depending on selected status */}
              {pendingStatus && (
                <div className="space-y-4 pt-2 border-t border-white/5 animate-fade-in text-left">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                      {pendingStatus === 'MUTASI' && 'Tanggal Mutasi'}
                      {(pendingStatus === 'RESIGNED_PROSEDUR' || pendingStatus === 'RESIGNED_NON_PROSEDUR') && 'Tanggal Resign (Efektif)'}
                      {pendingStatus === 'ACTIVE' && 'Tanggal Aktif'}
                    </label>
                    <input 
                      type="date" 
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3.5 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500 transition-all font-sans"
                      value={statusChangeDate}
                      onChange={e => setStatusChangeDate(e.target.value)}
                    />
                  </div>

                  {pendingStatus === 'MUTASI' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Target Outlet Mutasi</label>
                        <select 
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-3.5 text-sm font-bold text-white outline-none focus:ring-2 ring-indigo-500 transition-all font-sans"
                          value={mutationOutlet}
                          onChange={e => setMutationOutlet(e.target.value as Outlet)}
                        >
                          <option value="">-- Pilih Outlet Tujuan --</option>
                          {OUTLETS.filter(o => o !== data.staffList.find(s => s.id === selectedStaffForStatus)?.outlet).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Alasan / Catatan Mutasi</label>
                        <textarea 
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-bold text-white outline-none focus:ring-2 ring-indigo-500 transition-all h-20 resize-none"
                          placeholder="Masukkan alasan mutasi..."
                          value={statusChangeMutationReason}
                          onChange={e => setStatusChangeMutationReason(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {(pendingStatus === 'RESIGNED_PROSEDUR' || pendingStatus === 'RESIGNED_NON_PROSEDUR') && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Alasan Resign</label>
                      <textarea 
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-bold text-white outline-none focus:ring-2 ring-indigo-500 transition-all h-20 resize-none"
                        placeholder="Masukkan alasan pengunduran diri..."
                        value={statusChangeResignReason}
                        onChange={e => setStatusChangeResignReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-white/5">
                <button 
                  disabled={!pendingStatus || (pendingStatus === 'MUTASI' && !mutationOutlet)}
                  onClick={() => pendingStatus && handleUpdateStaffStatus(selectedStaffForStatus, pendingStatus)}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 cursor-pointer"
                >
                  SUBMIT STATUS CHANGE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="glass-card w-full max-w-sm p-8 border border-white/10 shadow-2xl bg-slate-900 text-center space-y-6">
            <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto text-2xl">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">{showConfirm.title}</h3>
              <p className="text-slate-400 text-xs mt-2 font-bold leading-relaxed">{showConfirm.message}</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirm(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                BATAL
              </button>
              <button 
                onClick={showConfirm.onConfirm}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
              >
                YA, LANJUTKAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="glass-card w-full max-w-sm p-8 border border-emerald-500/20 shadow-2xl bg-slate-900 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              <i className="fas fa-check-circle"></i>
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{showSuccess.title}</h3>
              <p className="text-slate-400 text-xs mt-2 font-bold leading-relaxed uppercase tracking-widest">{showSuccess.message}</p>
            </div>
            <button 
              onClick={() => setShowSuccess(null)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-500/20"
            >
              MENGERTI
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const [backups, setBackups] = useState<{ id: string; name: string; timestamp: string }[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      if (data.backups) setBackups(data.backups);
    } catch (err) {
      console.error("Failed to fetch backups:", err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'DATABASE') {
      fetchBackups();
    }
  }, [activeTab]);

  const handleRestore = async (backupId: string) => {
    setShowConfirm({
      title: "Peringatan Restore",
      message: "PERINGATAN: Mengembalikan data akan menimpa data saat ini dengan data dari cadangan ini. Lanjutkan?",
      onConfirm: async () => {
        setShowConfirm(null);
        try {
          const res = await fetch(`/api/backups/restore/${backupId}`, { method: 'POST' });
          const result = await res.json();
          if (result.success && result.data && onRestore) {
            onRestore(result.data);
            setShowConfirm({
              title: "Restore Success",
              message: "Data berhasil dipulihkan! Database telah diperbarui dengan versi cadangan.",
              onConfirm: () => setShowConfirm(null)
            });
          } else if (result.success && result.data) {
            // Fallback if onRestore not provided
            onUpdate(result.data);
            setShowConfirm({
              title: "Restore Success",
              message: "Data berhasil dipulihkan! Database telah diperbarui dengan versi cadangan.",
              onConfirm: () => setShowConfirm(null)
            });
          } else {
            setShowConfirm({
              title: "Restore Failed",
              message: "Gagal memulihkan data: " + (result.error || "Data tidak ditemukan"),
              onConfirm: () => setShowConfirm(null)
            });
          }
        } catch (err) {
          console.error("Restore error:", err);
          setShowConfirm({
            title: "System Error",
            message: "Terjadi kesalahan sistem saat memulihkan data.",
            onConfirm: () => setShowConfirm(null)
          });
        }
      }
    });
  };

  const handleCreateBackup = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, outletId: selectedOutlet })
      });
      const result = await res.json();
      if (result.success) {
        setShowSuccess({
          title: "Backup Success",
          message: "Database berhasil dicadangkan secara manual."
        });
        fetchBackups();
      }
    } catch (err) {
      console.error("Backup error:", err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleResetOvertime = () => {
    setShowConfirm({
      title: "RESET ALL OVERTIME",
      message: "ARE YOU SURE YOU WANT TO RESET ALL OVERTIME DATA? This action cannot be undone.",
      onConfirm: () => {
        onUpdate({ dailyOvertime: {} });
        setShowSuccess({
          title: "OVERTIME RESET",
          message: "All overtime data has been cleared from the database."
        });
        setShowConfirm(null);
      }
    });
  };

  const handleResetStaffOvertime = (staffId: string, staffName: string) => {
    setShowConfirm({
      title: `RESET OVERTIME FOR ${staffName.toUpperCase()}`,
      message: `ARE YOU SURE YOU WANT TO RESET ALL OVERTIME DATA FOR ${staffName.toUpperCase()}? This action cannot be undone.`,
      onConfirm: () => {
        const updatedDailyOT = { ...data.dailyOvertime };
        Object.keys(updatedDailyOT).forEach(date => {
          updatedDailyOT[date] = updatedDailyOT[date].filter(entry => entry.staffId !== staffId);
        });
        onUpdate({ dailyOvertime: updatedDailyOT });
        setShowSuccess({
          title: "STAFF OVERTIME RESET",
          message: `All overtime data for ${staffName} has been cleared.`
        });
        setShowConfirm(null);
      }
    });
  };

  const handleCleanupDatabase = () => {
    setShowConfirm({
      title: "CLEANUP DATABASE",
      message: "Yakin ingin menghapus data Floor Order, OPEX, Overtime Christian & Dedi, serta laporan tanpa history terbaru?",
      onConfirm: () => {
        const updates: any = {};

        // 1. Hapus data Floor Order (Ledgers)
        updates.dailyMainKitchenLedger = {};
        updates.dailyMainStoreLedger = {};
        updates.dailyChemicalLedger = {};
        updates.dailyGuestSuppliesLedger = {};

        // 2. Hapus data OPEX (Ledgers)
        updates.dailyNonCommodityLedger = {};
        updates.dailyCommodityLedger = {};
        updates.dailyMaintenanceLedger = {};
        updates.dailyAssetLedger = {};
        updates.dailyCasualLedger = {};
        updates.dailyAtkLedger = {};
        updates.dailyThirdPartyLedger = {};

        // 3. Hapus data Supplier (Ledgers)
        updates.dailyIkigaiLedger = {};
        updates.dailyPanfilaLedger = {};
        updates.dailyEverestLedger = {};
        updates.dailySaungKubilLedger = {};
        updates.dailyTgifLedger = {};
        updates.dailySukandaLedger = {};
        updates.dailyKebunkuLedger = {};

        // 4. Hapus data Expenses (Totals & Energy)
        updates.expenses = {};

        // 5. Hapus overtime christian dan Dedi
        const updatedDailyOT = { ...data.dailyOvertime };
        Object.keys(updatedDailyOT).forEach(date => {
          updatedDailyOT[date] = updatedDailyOT[date].filter(entry => {
            const staff = data.staffList.find(s => s.staffId === entry.staffId);
            const name = staff?.name.toLowerCase() || '';
            return !name.includes('christian') && !name.includes('dedi') && !name.includes('dei');
          });
        });
        updates.dailyOvertime = updatedDailyOT;

        // 6. Hapus semua laporan yang tidak ada historical penginputan terbaru (empty reports)
        const updatedDailyReports = { ...data.dailyReports };
        Object.keys(updatedDailyReports).forEach(date => {
          if (!updatedDailyReports[date] || updatedDailyReports[date].length === 0) {
            delete updatedDailyReports[date];
          }
        });
        updates.dailyReports = updatedDailyReports;

        onUpdate(updates);
        setShowSuccess({
          title: "CLEANUP BERHASIL",
          message: "Data Floor Order, OPEX, Overtime Christian/Dedi, dan Laporan kosong telah dibersihkan secara menyeluruh."
        });
        setShowConfirm(null);
      }
    });
  };

  const handleClearOtherOutletsLogistics = async () => {
    setShowConfirm({
      title: "KOSONGKAN DATA LOGISTIK",
      message: "Apakah Anda yakin ingin mengosongkan seluruh data logistik (Item, Saldo Awal, Harga Periode, Peminjaman, Catatan Harian) untuk outlet SH BINTARO dan SH ALSUT?",
      onConfirm: async () => {
        setIsClearingOtherLogistics(true);
        setShowConfirm(null);
        try {
          const outletsToClear = ['SH BINTARO', 'SH ALSUT'];
          for (const outletId of outletsToClear) {
            const docRef = doc(db, 'dashboards', outletId);
            const snap = await getDoc(docRef);
            
            if (snap.exists()) {
              const docData = snap.data();
              const monthlyData = { ...(docData.monthlyData || {}) };
              
              for (let m = 0; m < 12; m++) {
                const mKey = String(m);
                if (!monthlyData[mKey]) {
                  monthlyData[mKey] = {};
                }
                monthlyData[mKey] = {
                  ...monthlyData[mKey],
                  logisticItems: [],
                  logisticBeginningStocks: {},
                  logisticPeriodPrices: {},
                  dailyLogisticRecords: {},
                  peminjamanRecords: []
                };
              }
              
              await updateDoc(docRef, { 
                monthlyData,
                updatedAt: new Date(),
                lastUpdatedBy: user.email || 'system_cleanup'
              });
            } else {
              const monthlyData: Record<string, any> = {};
              for (let m = 0; m < 12; m++) {
                const mKey = String(m);
                monthlyData[mKey] = {
                  logisticItems: [],
                  logisticBeginningStocks: {},
                  logisticPeriodPrices: {},
                  dailyLogisticRecords: {},
                  peminjamanRecords: []
                };
              }
              
              await setDoc(docRef, {
                monthlyData,
                updatedAt: new Date(),
                lastUpdatedBy: user.email || 'system_cleanup'
              }, { merge: true });
            }
          }
          
          showToast?.("Data logistik SH BINTARO & SH ALSUT berhasil dikosongkan.", "success");
          setShowSuccess({
            title: "PEMBERSIHAN BERHASIL",
            message: "Seluruh data logistik di outlet SH BINTARO dan SH ALSUT yang belum di-input telah berhasil dikosongkan."
          });
        } catch (error: any) {
          console.error("Error clearing other outlets logistics:", error);
          showToast?.(`Gagal mengosongkan data logistik: ${error.message || error}`, "error");
        } finally {
          setIsClearingOtherLogistics(false);
        }
      }
    });
  };

  const renderDatabaseTab = () => (
    <div className="space-y-8 animate-fade-in relative z-10">
      <div className="glass-card p-8 bg-slate-900/60 border-white/10 space-y-6 shadow-2xl">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <i className="fas fa-history text-orange-400"></i>
              Data Management Center
            </h3>
            <p className="text-slate-500 text-[10px] font-black uppercase mt-1 tracking-widest italic">Kelola cadangan data dan pemulihan sistem</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCreateBackup}
              disabled={isLoadingBackups}
              className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
            >
              <i className={`fas ${isLoadingBackups ? 'fa-circle-notch fa-spin' : 'fa-cloud-upload-alt'}`}></i>
              Backup Now
            </button>
            <button 
              onClick={fetchBackups}
              className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all border border-white/5"
              title="Refresh Backups"
            >
              <i className={`fas fa-sync-alt ${isLoadingBackups ? 'fa-spin' : ''}`}></i>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {isLoadingBackups ? (
            <div className="py-20 text-center animate-pulse">
              <i className="fas fa-circle-notch fa-spin text-4xl text-indigo-500 mb-4"></i>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Memuat daftar cadangan...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="py-20 text-center glass-card border-dashed border-white/10">
              <i className="fas fa-ghost text-4xl text-slate-700 mb-4"></i>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Belum ada cadangan otomatis yang tersedia.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {backups.map(backup => (
                <div key={backup.id} className="glass-card p-5 border border-white/5 bg-slate-950/40 hover:bg-slate-900/60 transition-all flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
                      <i className="fas fa-file-archive"></i>
                    </div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tight">{backup.name}</p>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">ID: {backup.id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRestore(backup.id)}
                    className="px-4 py-2 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white rounded-lg font-black text-[9px] uppercase tracking-widest transition-all border border-orange-500/20"
                  >
                    RESTORE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-8 bg-red-500/5 border-red-500/10 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-red-500/10 pb-6">
          <div className="space-y-1">
            <h4 className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <i className="fas fa-exclamation-triangle"></i> Security & Cleanup Center
            </h4>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">Pembersihan data permanen dan manajemen sistem</p>
          </div>
          <button 
            onClick={handleCleanupDatabase}
            className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-amber-900/20 flex items-center gap-3"
          >
            <i className="fas fa-broom"></i>
            CLEANUP ALL SYSTEM DATA
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* STAFF CLEANUP */}
          <div className="space-y-4">
            <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-users"></i> Staff Data Reset
            </h5>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  const christian = data.staffList.find(s => s.name.toLowerCase().includes('christian'));
                  if (christian) {
                    handleResetStaffOvertime(christian.staffId, christian.name);
                  } else {
                    showToast?.("Staff 'Christian' not found in database.", "error");
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2"
              >
                <i className="fas fa-user-minus"></i>
                RESET CHRISTIAN
              </button>
              <button 
                onClick={() => {
                  const dedi = data.staffList.find(s => s.name.toLowerCase().includes('dedi')) || data.staffList.find(s => s.name.toLowerCase().includes('dei'));
                  if (dedi) {
                    handleResetStaffOvertime(dedi.staffId, dedi.name);
                  } else {
                    showToast?.("Staff 'Dedi' not found in database.", "error");
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2"
              >
                <i className="fas fa-user-minus"></i>
                RESET DEDI
              </button>
              <button 
                onClick={handleResetOvertime}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-red-500/20 flex items-center gap-2"
              >
                <i className="fas fa-trash-alt"></i>
                RESET ALL OT
              </button>
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET ALL ATTENDANCE",
                    message: "Yakin ingin menghapus SEMUA data Absensi Staff?",
                    onConfirm: () => {
                      onUpdate({ dailyAttendance: {} });
                      setShowSuccess({
                        title: "ATTENDANCE RESET",
                        message: "Semua data absensi telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2"
              >
                <i className="fas fa-calendar-times"></i>
                RESET ATTENDANCE
              </button>
            </div>
          </div>

          {/* FINANCIAL CLEANUP */}
          <div className="space-y-4">
            <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-file-invoice-dollar"></i> Financial Data Reset
            </h5>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET ALL OPEX",
                    message: "Yakin ingin menghapus SEMUA data Operational Expenses (OPEX) yang tercatat?",
                    onConfirm: () => {
                      const newExpenses = { ...data.expenses };
                      const opexKeys = ['nonCommodity', 'commodity', 'maintenance', 'asset', 'casual', 'atk', 'thirdParty'];
                      Object.keys(newExpenses).forEach(date => {
                        opexKeys.forEach(key => {
                          (newExpenses[date] as any)[key] = 0;
                        });
                      });
                      onUpdate({
                        dailyNonCommodityLedger: {},
                        dailyCommodityLedger: {},
                        dailyMaintenanceLedger: {},
                        dailyAssetLedger: {},
                        dailyCasualLedger: {},
                        dailyAtkLedger: {},
                        dailyThirdPartyLedger: {},
                        expenses: newExpenses
                      });
                      setShowSuccess({
                        title: "OPEX RESET",
                        message: "Semua data Operational Expenses telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-red-900/40 hover:bg-red-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-red-500/20 flex items-center gap-2"
              >
                <i className="fas fa-file-invoice-dollar"></i>
                RESET OPEX
              </button>
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET ALL SUPPLIERS",
                    message: "Yakin ingin menghapus SEMUA data Supplier Expenses yang tercatat?",
                    onConfirm: () => {
                      const newExpenses = { ...data.expenses };
                      const supplierKeys = ['ikigai', 'panfila', 'everest', 'saungKubil', 'tgif', 'sukanda', 'kebunku'];
                      Object.keys(newExpenses).forEach(date => {
                        supplierKeys.forEach(key => {
                          (newExpenses[date] as any)[key] = 0;
                        });
                      });
                      onUpdate({
                        dailyIkigaiLedger: {},
                        dailyPanfilaLedger: {},
                        dailyEverestLedger: {},
                        dailySaungKubilLedger: {},
                        dailyTgifLedger: {},
                        dailySukandaLedger: {},
                        dailyKebunkuLedger: {},
                        expenses: newExpenses
                      });
                      setShowSuccess({
                        title: "SUPPLIER RESET",
                        message: "Semua data Supplier Expenses telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-purple-900/40 hover:bg-purple-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-purple-500/20 flex items-center gap-2"
              >
                <i className="fas fa-truck-loading"></i>
                RESET SUPPLIER
              </button>
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET ENERGY DATA",
                    message: "Yakin ingin menghapus SEMUA data Energy (Listrik, Air, Gas) yang tercatat?",
                    onConfirm: () => {
                      const newExpenses = { ...data.expenses };
                      const energyKeys = ['electricity', 'water', 'gas', 'elecLwbpOpen', 'elecLwbpClose', 'elecwbpOpen', 'elecwbpClose', 'waterOpen', 'waterClose', 'gasOpen', 'gasClose'];
                      Object.keys(newExpenses).forEach(date => {
                        energyKeys.forEach(key => {
                          (newExpenses[date] as any)[key] = 0;
                        });
                      });
                      onUpdate({ expenses: newExpenses });
                      setShowSuccess({
                        title: "ENERGY RESET",
                        message: "Semua data Energy telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-blue-500/20 flex items-center gap-2"
              >
                <i className="fas fa-bolt"></i>
                RESET ENERGY
              </button>
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET FLOOR ORDER",
                    message: "Yakin ingin menghapus SEMUA data Floor Order?",
                    onConfirm: () => {
                      const newExpenses = { ...data.expenses };
                      const floorKeys = ['mainKitchen', 'mainStore', 'chemical', 'guestSupplies', 'cash'];
                      Object.keys(newExpenses).forEach(date => {
                        floorKeys.forEach(key => {
                          (newExpenses[date] as any)[key] = 0;
                        });
                      });
                      onUpdate({
                        dailyMainKitchenLedger: {},
                        dailyMainStoreLedger: {},
                        dailyChemicalLedger: {},
                        dailyGuestSuppliesLedger: {},
                        dailyCashLedger: {},
                        expenses: newExpenses
                      });
                      setShowSuccess({
                        title: "FLOOR ORDER RESET",
                        message: "Semua data Floor Order telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-amber-900/40 hover:bg-amber-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-amber-500/20 flex items-center gap-2"
              >
                <i className="fas fa-store"></i>
                RESET FLOOR
              </button>
              <button 
                onClick={() => {
                  setShowConfirm({
                    title: "RESET ALL REPORTS",
                    message: "Yakin ingin menghapus SEMUA Daily Reports?",
                    onConfirm: () => {
                      onUpdate({ dailyReports: {} });
                      setShowSuccess({
                        title: "REPORTS RESET",
                        message: "Semua Daily Reports telah dibersihkan."
                      });
                      setShowConfirm(null);
                    }
                  });
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2"
              >
                <i className="fas fa-file-alt"></i>
                RESET REPORTS
              </button>
            </div>
          </div>

          {/* LOGISTICS CLEANUP */}
          <div className="col-span-1 md:col-span-2 border-t border-white/5 pt-6 space-y-4">
            <h5 className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-boxes"></i> Logistics Data Management
            </h5>
            <div className="bg-slate-950/40 p-5 rounded-2xl border border-white/5 space-y-4">
              <div>
                <p className="text-xs font-black text-white uppercase">KOSONGKAN DATA LOGISTIK OUTLET LAIN</p>
                <p className="text-[9px] text-slate-400 font-medium uppercase mt-1 leading-relaxed">
                  Mengosongkan seluruh data logistik (Daftar Item, Saldo Awal, Harga Periode, Peminjaman, Catatan Harian) untuk outlet <span className="text-amber-400 font-bold">SH BINTARO</span> dan <span className="text-amber-400 font-bold">SH ALSUT</span> karena belum di-input, guna mereset atau merapikan database.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleClearOtherOutletsLogistics}
                  disabled={isClearingOtherLogistics}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-amber-500/10 flex items-center gap-2"
                >
                  <i className={`fas ${isClearingOtherLogistics ? 'fa-spinner fa-spin' : 'fa-eraser'}`}></i>
                  {isClearingOtherLogistics ? 'MEMPROSES...' : 'KOSONGKAN DATA LOGISTIK (BINTARO & ALSUT)'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[9px] text-slate-500 font-bold leading-relaxed uppercase tracking-wide pt-4 border-t border-white/5">
          Sistem melakukan pencadangan otomatis setiap kali data disimpan (maksimal 30 cadangan terakhir). 
          Gunakan fitur pemulihan hanya jika data utama mengalami kerusakan atau terhapus secara tidak sengaja. 
          Proses pemulihan akan menyinkronkan data ke semua perangkat yang sedang aktif secara real-time.
        </p>
      </div>
    </div>
  );

  const renderGoogleReviewTab = () => {
    const dailyData = data.dailyGoogleReview?.[googleReviewDate] || {
      stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0, totalReview: 0, currentRating: 0, targetRating: data.googleReview.targetRating
    };

    const handleUpdateTarget = () => {
      const newTarget = prompt("Enter Target Rating (e.g. 4.8):", data.googleReview.targetRating.toString());
      if (newTarget !== null) {
        onUpdate({ 
          googleReview: { ...data.googleReview, targetRating: parseFloat(newTarget) || 5 }
        });
      }
    };

    const handleSaveGoogleReview = () => {
      if (isSaving) return;
      
      setIsSaving(true);
      
      const existingDailyData = data.dailyGoogleReview?.[googleReviewDate] || {
        stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0, totalReview: 0, currentRating: 0, targetRating: data.googleReview.targetRating
      };

      const updatedDaily = { ...data.dailyGoogleReview };
      const currentDay = { ...existingDailyData };
      
      if (isEditingGoogleReview) {
        currentDay.stars1 = googleReviewInput.stars1;
        currentDay.stars2 = googleReviewInput.stars2;
        currentDay.stars3 = googleReviewInput.stars3;
        currentDay.stars4 = googleReviewInput.stars4;
        currentDay.stars5 = googleReviewInput.stars5;
      } else {
        currentDay.stars1 = (currentDay.stars1 || 0) + googleReviewInput.stars1;
        currentDay.stars2 = (currentDay.stars2 || 0) + googleReviewInput.stars2;
        currentDay.stars3 = (currentDay.stars3 || 0) + googleReviewInput.stars3;
        currentDay.stars4 = (currentDay.stars4 || 0) + googleReviewInput.stars4;
        currentDay.stars5 = (currentDay.stars5 || 0) + googleReviewInput.stars5;
      }
      
      const total = (currentDay.stars1 || 0) + (currentDay.stars2 || 0) + (currentDay.stars3 || 0) + (currentDay.stars4 || 0) + (currentDay.stars5 || 0);
      const points = (currentDay.stars1 || 0) * 1 + (currentDay.stars2 || 0) * 2 + (currentDay.stars3 || 0) * 3 + (currentDay.stars4 || 0) * 4 + (currentDay.stars5 || 0) * 5;
      
      currentDay.totalReview = total;
      currentDay.currentRating = total === 0 ? 0 : Number((points / total).toFixed(2));
      
      updatedDaily[googleReviewDate] = currentDay;
      onUpdate({ dailyGoogleReview: updatedDaily });

      setTimeout(() => {
        setIsSaving(false);
        setIsEditingGoogleReview(false);
        setGoogleReviewInput({ stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0 });
      }, 400);
    };

    // -- ADAPTIVE CUMULATIVE LOGIC (EXCLUDING BASELINE) --
    let prevMonthsStars = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    if (allMonthlyData) {
      for (let m = 0; m < selectedMonthIdx; m++) {
        const mData = allMonthlyData[m.toString()];
        if (mData && mData.dailyGoogleReview) {
          Object.values(mData.dailyGoogleReview).forEach((day: any) => {
            prevMonthsStars.s1 += (day.stars1 || 0);
            prevMonthsStars.s2 += (day.stars2 || 0);
            prevMonthsStars.s3 += (day.stars3 || 0);
            prevMonthsStars.s4 += (day.stars4 || 0);
            prevMonthsStars.s5 += (day.stars5 || 0);
          });
        }
      }
    }

    // Calculate total including current daily sum (FOR THIS SELECTED MONTH)
    const currentDailySum: any = Object.values(data.dailyGoogleReview || {}).reduce((acc: any, day: any) => ({
      s1: (acc.s1 || 0) + (day.stars1 || 0),
      s2: (acc.s2 || 0) + (day.stars2 || 0),
      s3: (acc.s3 || 0) + (day.stars3 || 0),
      s4: (acc.s4 || 0) + (day.stars4 || 0),
      s5: (acc.s5 || 0) + (day.stars5 || 0),
    }), { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 });

    const totalReviews = (prevMonthsStars.s1 + prevMonthsStars.s2 + prevMonthsStars.s3 + prevMonthsStars.s4 + prevMonthsStars.s5) + (currentDailySum.s1 + currentDailySum.s2 + currentDailySum.s3 + currentDailySum.s4 + currentDailySum.s5);
    const totalPointsSum = (prevMonthsStars.s1 * 1 + prevMonthsStars.s2 * 2 + prevMonthsStars.s3 * 3 + prevMonthsStars.s4 * 4 + prevMonthsStars.s5 * 5) + (currentDailySum.s1 * 1 + currentDailySum.s2 * 2 + currentDailySum.s3 * 3 + currentDailySum.s4 * 4 + currentDailySum.s5 * 5);
    const currentTotalRating = totalReviews === 0 ? 0 : Number((totalPointsSum / totalReviews).toFixed(2));
    
    // MTD Current Month Rating (Requested: "YANG DI TAMPILKAN DI FITUR GOOGLE REVIEW ADALAH CURENT RATING DATI TOTAL REVIEW DI MTD BULAN YANG SEDANG BERJALAN")
    const mtdTotalCount = (currentDailySum.s1 + currentDailySum.s2 + currentDailySum.s3 + currentDailySum.s4 + currentDailySum.s5);
    const mtdTotalPoints = (currentDailySum.s1 * 1 + currentDailySum.s2 * 2 + currentDailySum.s3 * 3 + currentDailySum.s4 * 4 + currentDailySum.s5 * 5);
    const mtdRating = mtdTotalCount === 0 ? 0 : Number((mtdTotalPoints / mtdTotalCount).toFixed(2));

    // -- AUTO TARGET LOGIC --
    let activeTarget = googleReviewTarget;
    if (currentTotalRating >= 4.8) {
      activeTarget = Math.max(activeTarget, 4.9);
    }
    if (currentTotalRating >= 4.9) {
      activeTarget = 5.0;
    }

    let reviewsNeeded = 0;
    if (currentTotalRating < activeTarget && activeTarget < 5) {
      reviewsNeeded = Math.ceil((activeTarget * totalReviews - totalPointsSum) / (5 - activeTarget));
    }

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Google Review MTD Entry</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Input daily star counts for {googleReviewDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="date" 
              value={googleReviewDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setGoogleReviewDate(newDate);
                const newMonthIdx = parseInt(newDate.split('-')[1]) - 1;
                if (newMonthIdx !== parseInt(filters.month)) {
                  const year = newDate.split('-')[0];
                  const lastDay = new Date(parseInt(year), newMonthIdx + 1, 0).getDate();
                  onFilterChange({ 
                    ...filters, 
                    month: newMonthIdx.toString(),
                    year: year,
                    startDate: `${year}-${(newMonthIdx + 1).toString().padStart(2, '0')}-01`,
                    endDate: `${year}-${(newMonthIdx + 1).toString().padStart(2, '0')}-${lastDay}`
                  });
                }
              }}
              className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
            />
            <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-1">
              <i className="fas fa-bullseye text-yellow-500 text-[10px]"></i>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Auto Target {currentTotalRating >= 4.8 && <span className="text-emerald-400 ml-1">(AUTO)</span>}</span>
              <div className="w-12 text-xs font-black text-white text-center">
                {activeTarget.toFixed(1)}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-1">
              <i className="fas fa-chart-line text-blue-500 text-[10px]"></i>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Kekurangan</span>
              <div className="w-16 text-xs font-black text-blue-400 text-center">
                {reviewsNeeded}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-1">
              <i className="fas fa-star text-indigo-400 text-[10px]"></i>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">MTD Rating</span>
              <div className="w-12 text-xs font-black text-indigo-100 text-center">
                {mtdRating.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex gap-4">
            <div className="flex-1 p-3 bg-slate-950/40 rounded-xl">
               <span className="text-[8px] font-black text-slate-500 uppercase">Cumulative Progress (All Months)</span>
               <div className="text-xs font-black text-indigo-400 mt-1">
                 {totalReviews} Total Reviews Counted
               </div>
            </div>
            <div className="flex-1 p-3 bg-slate-950/40 rounded-xl">
               <span className="text-[8px] font-black text-slate-500 uppercase">Cumulative Avg Rating</span>
               <div className="text-xs font-black text-white mt-1">
                 {currentTotalRating.toFixed(2)}
               </div>
            </div>
          </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-950/80 border-b border-white/5">
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Rating Category</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center w-40">Review Count</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center w-40">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[5, 4, 3, 2, 1].map((star) => (
                <tr key={star} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black ${
                        star === 5 ? 'bg-emerald-500' : star === 4 ? 'bg-blue-500' : star === 3 ? 'bg-yellow-500' : star === 2 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {star}
                      </div>
                      <span className="text-xs font-bold text-slate-300 uppercase">{star} Stars Review</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center">
                      <input 
                        type="number"
                        min="0"
                        value={(googleReviewInput as any)[`stars${star}`] || 0}
                        onChange={(e) => setGoogleReviewInput(prev => ({ ...prev, [`stars${star}`]: parseInt(e.target.value) || 0 }))}
                        className="w-24 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-center text-white text-xs font-black focus:ring-2 focus:ring-yellow-500 outline-none transition-all"
                      />
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-xs font-black text-slate-500">
                      {((googleReviewInput as any)[`stars${star}`] || 0) * star} Pts
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-950/50">
                <td className="p-4 font-black text-white uppercase text-[10px]">
                  <div className="flex items-center justify-between">
                    <span>Daily Summary (Existing)</span>
                    {(data.dailyGoogleReview?.[googleReviewDate] !== undefined) && !isEditingGoogleReview && (
                      <button 
                        onClick={() => {
                          setGoogleReviewInput({
                            stars1: dailyData.stars1 || 0,
                            stars2: dailyData.stars2 || 0,
                            stars3: dailyData.stars3 || 0,
                            stars4: dailyData.stars4 || 0,
                            stars5: dailyData.stars5 || 0,
                          });
                          setIsEditingGoogleReview(true);
                        }}
                        className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-lg border border-yellow-500/30 hover:bg-yellow-500 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest"
                      >
                        <i className="fas fa-edit mr-1"></i> Edit Data
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <div className="text-sm font-black text-yellow-500">{dailyData.totalReview} Reviews</div>
                </td>
                <td className="p-4 text-center">
                  <div className="text-sm font-black text-white">{dailyData.currentRating} / 5.0</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end items-center gap-4 pt-4">
          {isEditingGoogleReview && (
            <button 
              onClick={() => {
                setIsEditingGoogleReview(false);
                setGoogleReviewInput({ stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0 });
              }}
              className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            >
              Cancel Edit
            </button>
          )}
          <button 
            onClick={handleSaveGoogleReview}
            disabled={isSaving}
            className={`px-10 py-4 ${isEditingGoogleReview ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/20 flex items-center gap-3 ${isSaving ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
          >
            {isSaving ? (
              <><i className="fas fa-circle-notch animate-spin"></i> SAVING...</>
            ) : (
              <><i className={`fas ${isEditingGoogleReview ? 'fa-save' : 'fa-cloud-upload-alt'}`}></i> {isEditingGoogleReview ? 'UPDATE DATA' : 'SUBMIT DATA'}</>
            )}
          </button>
        </div>

        {/* Google Review History List */}
        <div className="pt-10 border-t border-white/5 space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
              <i className="fas fa-history text-slate-500"></i> Entry History
            </h4>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{Object.keys(data.dailyGoogleReview || {}).length} Entries Found</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(data.dailyGoogleReview || {})
              .sort((a, b) => b[0].localeCompare(a[0]))
              .slice(0, 12)
              .map(([date, entry]: [string, any]) => (
                <button 
                  key={date}
                  onClick={() => {
                    setGoogleReviewDate(date);
                    setGoogleReviewInput({
                      stars1: entry.stars1 || 0,
                      stars2: entry.stars2 || 0,
                      stars3: entry.stars3 || 0,
                      stars4: entry.stars4 || 0,
                      stars5: entry.stars5 || 0,
                    });
                    setIsEditingGoogleReview(true);
                    safeWindow.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="glass-card p-4 bg-slate-950/30 border-white/5 hover:border-yellow-500/50 transition-all text-left group"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">{date}</span>
                    <i className="fas fa-edit text-[10px] text-slate-700 group-hover:text-yellow-500 transition-colors"></i>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-black text-white">{entry.currentRating} <span className="text-[10px] text-slate-500">/ 5.0</span></div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{entry.totalReview} Reviews</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPromoControlTab = () => {
    return (
      <div className="space-y-10 animate-fade-in relative z-10">
        {/* TOP OVERVIEW CARD */}
        <div className="p-6 md:p-8 bg-slate-900/80 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                <i className="fas fa-percent"></i> Control Panel Program Promo & Bank
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                Pusat Kontrol Fitur Promo & Bank
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1 max-w-2xl">
                Kelola aktivasi tombol input dan pelaporan Bank Promo (Bank Mega, Digibank DBS) serta Diskon Promo (Cadangan & Investor) di Daily Revenue per periode atau global.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 1: PROMO TOGGLES (BANK PROMO & PROMO DISKON) */}
        <div className="glass-card p-6 md:p-8 bg-slate-900/60 rounded-3xl border border-white/10 shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <i className="fas fa-tags text-amber-400"></i>
                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                  Kontrol On / Off Bank Promo & Promo Diskon
                </h4>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Pengaturan ini langsung mengontrol tampilan tombol input dan laporan pada fitur Daily Revenue.
              </p>
            </div>

            {/* Period & Scope Selector */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-950/80 p-2 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2 px-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Periode:</span>
                <select
                  value={promoPeriodMonth}
                  onChange={(e) => setPromoPeriodMonth(parseInt(e.target.value))}
                  className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={promoPeriodYear}
                  onChange={(e) => setPromoPeriodYear(parseInt(e.target.value))}
                  className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="flex rounded-xl overflow-hidden border border-white/10">
                <button
                  type="button"
                  onClick={() => setPromoScope('PERIOD')}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase transition-all ${
                    promoScope === 'PERIOD'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Periode Terpilih
                </button>
                <button
                  type="button"
                  onClick={() => setPromoScope('GLOBAL')}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase transition-all ${
                    promoScope === 'GLOBAL'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Semua Periode (Global)
                </button>
              </div>
            </div>
          </div>

          {/* OUTLET CONTROL PROMO BANNER */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/60 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  PUSAT KONTROL OUTLET &amp; PROMO
                </span>
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-tags text-indigo-400"></i>
                  Penambahan &amp; Alokasi Outlet Target Promo
                </h4>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Tombol <strong>Add Promo</strong> dan pengaturan pilihan <strong className="text-amber-400">outlet mana saja yang akan ditambahkan promo</strong> dikelola secara terpusat melalui <strong>Outlet Control</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                }
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-950/60 flex items-center gap-2 active:scale-95 cursor-pointer whitespace-nowrap border border-indigo-400/30 shrink-0"
            >
              <i className="fas fa-store-alt text-amber-400 text-sm"></i>
              <span>Buka Outlet Control Promo</span>
            </button>
          </div>

          {/* TWO PROMO CARDS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. BANK PROMO TOGGLE CARD */}
            <div className={`p-6 rounded-2xl border transition-all ${
              activeBankPromoDisplay 
                ? 'bg-gradient-to-br from-emerald-950/30 to-slate-900 border-emerald-500/30 shadow-lg shadow-emerald-950/20' 
                : 'bg-gradient-to-br from-rose-950/20 to-slate-900 border-rose-500/20'
            }`}>
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeBankPromoDisplay ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      <i className="fas fa-credit-card"></i>
                    </div>
                    <h5 className="text-base font-black text-white uppercase tracking-tight">Bank Promo</h5>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Mencakup promo perbankan: <strong>Bank Mega</strong> dan <strong>Digibank by DBS</strong>. Pengaturan ini <strong>hanya berlaku untuk outlet {selectedOutlet || 'ini'}</strong> pada Daily Revenue dan Template WA.
                  </p>
                </div>

                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                  activeBankPromoDisplay 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                }`}>
                  {activeBankPromoDisplay ? '● AKTIF (ON)' : '○ NONAKTIF (OFF)'}
                </span>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[10px] text-slate-400 leading-relaxed">
                {activeBankPromoDisplay 
                  ? `Tombol input transaksi Bank Mega & Digibank serta laporan dinner/closing aktif pada Daily Revenue & Template WA ${selectedOutlet || 'outlet ini'}.`
                  : `Tombol input & template WA Bank Mega/Digibank dinonaktifkan pada outlet ${selectedOutlet || 'ini'} (tidak mempengaruhi outlet lain).`}
              </div>

              <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">
                  Target: {promoScope === 'GLOBAL' ? 'Global Seluruh Periode' : `${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleBankPromo(!activeBankPromoDisplay)}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 shadow-md ${
                    activeBankPromoDisplay
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                  }`}
                >
                  <i className={`fas ${activeBankPromoDisplay ? 'fa-toggle-on' : 'fa-toggle-off'} text-sm`}></i>
                  {activeBankPromoDisplay ? 'Matikan (Turn OFF)' : 'Aktifkan (Turn ON)'}
                </button>
              </div>
            </div>

            {/* 2. PROMO DISKON TOGGLE CARD */}
            <div className={`p-6 rounded-2xl border transition-all ${
              activePromoDisplay 
                ? 'bg-gradient-to-br from-emerald-950/30 to-slate-900 border-emerald-500/30 shadow-lg shadow-emerald-950/20' 
                : 'bg-gradient-to-br from-rose-950/20 to-slate-900 border-rose-500/20'
            }`}>
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activePromoDisplay ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      <i className="fas fa-percent"></i>
                    </div>
                    <h5 className="text-base font-black text-white uppercase tracking-tight">Promo & Diskon</h5>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Mencakup diskon <strong>Investor Promo 1-3</strong>, <strong>Management Promo</strong>, dan <strong>Cadangan Diskon 1-3</strong>.
                  </p>
                </div>

                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                  activePromoDisplay 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                }`}>
                  {activePromoDisplay ? '● AKTIF (ON)' : '○ NONAKTIF (OFF)'}
                </span>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[10px] text-slate-400 leading-relaxed">
                {activePromoDisplay 
                  ? 'Input diskon promo Investor & Cadangan serta breakdown rekapan diskon aktif pada Daily Revenue.'
                  : 'Input diskon promo Investor & Cadangan dinonaktifkan/disembunyikan pada Daily Revenue.'}
              </div>

              <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">
                  Target: {promoScope === 'GLOBAL' ? 'Global Seluruh Periode' : `${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleTogglePromo(!activePromoDisplay)}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 shadow-md ${
                    activePromoDisplay
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                  }`}
                >
                  <i className={`fas ${activePromoDisplay ? 'fa-toggle-on' : 'fa-toggle-off'} text-sm`}></i>
                  {activePromoDisplay ? 'Matikan (Turn OFF)' : 'Aktifkan (Turn ON)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in no-blur">
      <div className="glass-card p-8 border-l-4 border-slate-500 shadow-2xl relative overflow-hidden bg-[#1e293b]/95">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><i className="fas fa-user-shield text-[220px]"></i></div>
        <div className="relative z-10 mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none flex items-center gap-5">
              <i className="fas fa-shield-alt text-slate-400"></i> Admin Control Center
            </h2>
            <p className="text-slate-500 font-black uppercase text-[10px] mt-2 tracking-[0.2em]">Operational Settings, Targets & Security Control</p>
          </div>
        </div>

        <div className="flex gap-4 mb-10 relative z-10 overflow-x-auto no-scrollbar pb-2">
           {[
             { id: 'QA', label: 'QA 3 Divisi (Per 3 Bulan)', icon: 'fa-award' },
             { id: 'GSI', label: 'GSI Cumulative Entry', icon: 'fa-poll' },
             { id: 'GOOGLE', label: 'Google Review', icon: 'fa-star' },
             { id: 'CONFIG', label: 'Revenue & Targets', icon: 'fa-sliders-h' },
             { id: 'DATABASE', label: 'Security & Restore', icon: 'fa-history' },
             { id: 'DANGER', label: 'Danger Zone', icon: 'fa-radiation' }
           ].map(tab => (
             <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
               className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-3 border active:scale-95 ${
                 activeTab === tab.id ? 'bg-indigo-600 text-white shadow-xl border-white/10' : 'bg-slate-900/40 text-slate-500 border-white/5 hover:bg-slate-800'
               }`}>
               <i className={`fas ${tab.icon}`}></i> {tab.label}
             </button>
           ))}
        </div>

        {activeTab === 'QA' && renderQATab()}
        {activeTab === 'PROMO_CONTROL' && (
          <div className="p-8 bg-slate-900/80 rounded-3xl border border-indigo-500/20 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-amber-400 flex items-center justify-center text-3xl mx-auto border border-indigo-500/20">
              <i className="fas fa-store-alt"></i>
            </div>
            <h3 className="text-xl font-black text-white uppercase">Promo Dikelola Terpusat di Outlet Control</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
              Pengaturan tombol Add Promo dan aktivasi promo per outlet kini dikelola langsung di <strong>Outlet Control</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                }
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <i className="fas fa-tags text-amber-400"></i>
              <span>Buka Outlet Control Promo</span>
            </button>
          </div>
        )}
        {activeTab === 'GSI' && renderGSITab()}
        {activeTab === 'GOOGLE' && renderGoogleReviewTab()}
        {activeTab === 'DATABASE' && renderDatabaseTab()}
        {activeTab === 'DANGER' && renderDangerTab()}
        {activeTab === 'CONFIG' && (
           <div className="space-y-10 animate-fade-in relative z-10">
             {/* Local Month Filter */}
             <div className="flex flex-wrap items-center justify-between gap-6 p-6 bg-slate-950/40 rounded-3xl border border-white/5 backdrop-blur-md">
                <div className="flex flex-col gap-1 ring-1 ring-white/10 p-4 rounded-2xl bg-slate-900 shadow-inner min-w-[200px]">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                     <i className="fas fa-calendar-alt text-indigo-500"></i> Selected Budgeting Period
                   </label>
                   <div className="flex items-center gap-3 mt-1">
                      <select 
                        value={filters.month} 
                        onChange={(e) => {
                          const newMonth = e.target.value;
                          const year = currentYear;
                          const lastDay = new Date(year, parseInt(newMonth) + 1, 0).getDate();
                          const monthStr = (parseInt(newMonth) + 1).toString().padStart(2, '0');
                          onFilterChange({
                            ...filters,
                            month: newMonth,
                            startDate: `${year}-${monthStr}-01`,
                            endDate: `${year}-${monthStr}-${lastDay}`
                          });
                        }}
                        className="bg-transparent text-white font-black text-xs outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                      >
                        {months.map((m, i) => <option key={i} value={i} className="bg-slate-900 text-white">{m}</option>)}
                      </select>
                      <div className="w-px h-4 bg-white/10"></div>
                      <select 
                        value={currentYear}
                        onChange={(e) => {
                          const newYear = e.target.value;
                          const month = parseInt(filters.month);
                          const lastDay = new Date(parseInt(newYear), month + 1, 0).getDate();
                          const monthStr = (month + 1).toString().padStart(2, '0');
                          onFilterChange({
                            ...filters,
                            year: newYear,
                            startDate: `${newYear}-${monthStr}-01`,
                            endDate: `${newYear}-${monthStr}-${lastDay}`
                          });
                        }}
                        className="bg-transparent text-white font-black text-xs outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                      >
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y} className="bg-slate-900 text-white">{y}</option>)}
                      </select>
                   </div>
                </div>
                <div className="flex flex-col items-end">
                   <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Configuration</div>
                   <div className="text-sm font-black text-white uppercase">{months[selectedMonthIdx]} {currentYear}</div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-1 space-y-6">
               <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-3 border-b border-indigo-500/20 pb-2">
                 <i className="fas fa-money-bill-wave"></i> BUDGET BULANAN: {months[selectedMonthIdx].toUpperCase()} {currentYear}
               </h3>
               <div className="glass-card bg-slate-900/60 p-8 border-white/5 space-y-6">
                 <div className="space-y-4">
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SET REVENUE BUDGET (MTD)</label>
                     <div className="flex items-center gap-3 bg-slate-950 p-4 rounded-xl border border-white/5 focus-within:ring-2 ring-indigo-500 transition-all shadow-inner">
                       <span className="text-slate-700 text-xs font-black">RP.</span>
                       <input type="number" className="flex-1 bg-transparent text-white font-black outline-none text-xl" placeholder="0" value={localBudgetRevenue || ''} onChange={(e) => handleUpdateBudget(Number(e.target.value))}/>
                     </div>
                   </div>
                 </div>
               </div>

               <h3 className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-3 border-b border-rose-500/20 pb-2 pt-4">
                 <i className="fas fa-percentage"></i> NAMA PROMO/CADANGAN: {months[selectedMonthIdx].toUpperCase()} {currentYear}
               </h3>
               <div className="glass-card bg-slate-900/60 p-6 border-white/5 space-y-4">
                 <div className="grid grid-cols-1 gap-4">
                   {[
                     { key: 'cadanganName1', label: 'Cadangan 1' },
                     { key: 'cadanganName2', label: 'Cadangan 2' },
                     { key: 'cadanganName3', label: 'Cadangan 3' },
                     { key: 'investorName', label: 'Investor 1' },
                     { key: 'investorName2', label: 'Investor 2' },
                     { key: 'investorName3', label: 'Investor 3' }
                   ].map(item => (
                     <div key={item.key} className="space-y-1">
                       <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{item.label}</label>
                       <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-white/5 focus-within:ring-1 ring-rose-500 transition-all">
                         <input 
                           type="text" 
                           className="flex-1 bg-transparent text-white font-black outline-none text-xs uppercase" 
                           placeholder={item.label.toUpperCase()} 
                           value={localDiscountNames[item.key] || ''} 
                           onChange={(e) => setLocalDiscountNames(prev => ({ ...prev, [item.key]: e.target.value }))}
                         />
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

             </div>
              <div className="lg:col-span-2 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-emerald-500/20 pb-2">
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-3">
                    <i className="fas fa-calendar-alt"></i> TARGET HARI: {months[selectedMonthIdx].toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="text-[9px] font-black text-slate-500 uppercase">Total Target:</div>
                    <div className={`text-xs font-black ${totalDailyTargets >= (localBudgetRevenue || 0) ? 'text-emerald-400' : 'text-orange-400'}`}>
                      Rp {totalDailyTargets.toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                <div className="glass-card bg-slate-900/60 p-6 border-white/5 space-y-6">
                  <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <div className="flex-1 min-w-[200px] space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Set Default Daily Target</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          className="flex-1 bg-slate-900 border border-white/10 rounded-lg p-2 text-xs font-black text-white outline-none"
                          placeholder="0"
                          value={defaultTarget || ''}
                          onChange={e => setDefaultTarget(Number(e.target.value))}
                        />
                        <button 
                          onClick={handleApplyDefaultTarget}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest transition-all"
                        >
                          APPLY ALL
                        </button>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/5 hidden md:block"></div>
                    <button 
                      onClick={handleAutoDistribute}
                      className="px-6 py-3 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-emerald-500/20 flex items-center gap-2"
                    >
                      <i className="fas fa-magic"></i> AUTO DISTRIBUTE BUDGET
                    </button>
                    <button 
                      onClick={handleClearAllTargets}
                      className="px-6 py-3 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-red-500/20 flex items-center gap-2"
                    >
                      <i className="fas fa-trash-alt"></i> CLEAR ALL
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-3">
                     {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                       const monthStr = (selectedMonthIdx + 1).toString().padStart(2, '0');
                       const dateKey = `${currentYear}-${monthStr}-${day.toString().padStart(2, '0')}`;
                       const val = localDailyTargets[dateKey] || 0;
                       return (
                         <div key={day} className="space-y-1 group">
                            <div className="flex justify-between items-center px-1"><span className="text-[8px] font-black text-slate-500">{day}</span></div>
                            <input type="number" className="w-full bg-slate-950 border border-white/5 rounded-lg p-2 text-[10px] font-black text-center text-white focus:ring-1 ring-emerald-500 outline-none" value={val || ''} onChange={(e) => handleUpdateDailyTarget(day, Number(e.target.value))}/>
                         </div>
                       );
                     })}
                  </div>
                </div>
              </div>
           </div>

           {/* Final Submit Button for Revenue & Targets */}
           <div className="pt-10 flex justify-center">
             <button 
               disabled={isSaving}
               onClick={async () => {
                 setIsSaving(true);
                 try {
                   if (selectedOutlet) {
                     pushNotification(user.email, selectedOutlet, "Updated Revenue Budget, Daily Targets, and Overtime Budgets").catch(console.error);
                   }
                   // Sync local state to global state in one call
                    onUpdate({
                      sales: { 
                        ...data.sales, 
                        budgetRevenue: localBudgetRevenue, 
                        dailyTarget: localDailyTargets[filters.startDate] || 0,
                        monthlyBudgets: {
                          ...(data.sales.monthlyBudgets || {}),
                          [`${currentYear}-${(selectedMonthIdx + 1).toString().padStart(2, '0')}`]: localBudgetRevenue
                        }
                      },
                      dailyTargets: localDailyTargets,
                      monthlyOvertimeBudgets: {
                        ...(data.monthlyOvertimeBudgets || {}),
                        [`${currentYear}-${(selectedMonthIdx + 1).toString().padStart(2, '0')}`]: localOvertimeBudgets
                      },
                      overtimeBudgets: localOvertimeBudgets,
                      monthlyDiscountNames: {
                        ...(data.monthlyDiscountNames || {}),
                        [`${currentYear}-${(selectedMonthIdx + 1).toString().padStart(2, '0')}`]: localDiscountNames
                      }
                    });
                   
                   setShowSuccess({
                     title: "SUBMIT BERHASIL",
                     message: "Target Revenue, Budget bulanan, dan Budget Overtime telah berhasil diperbarui."
                   });
                   safeWindow.scrollTo({ top: 0, behavior: 'smooth' });
                 } catch (err) {
                   console.error("Submit Error:", err);
                   showToast?.("Terjadi kesalahan saat menyimpan config.", "error");
                 } finally {
                   setIsSaving(false);
                 }
               }}
               className={`group relative px-12 py-6 rounded-2xl font-black text-sm uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 border border-white/10 flex items-center gap-4 ${
                 isSaving ? 'bg-slate-800 text-slate-500 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white'
               }`}
             >
               <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'} text-xl group-hover:scale-110 transition-transform`}></i>
               {isSaving ? 'PROCESSING...' : 'SUBMIT CONFIGURATION'}
             </button>
           </div>
         </div>
        )}
      </div>
    </div>
  );
};

export default AdminModule;
