import React, { useState, useEffect } from 'react';
import { SyncStatus, Notification, ModuleType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  filters: { month: string; startDate: string; endDate: string };
  onFilterChange: (f: any) => void;
  onHome: () => void;
  onRefresh: () => void;
  onForceSync: () => void;
  onAdminToggle: () => void;
  onLogout: () => void;
  onShare: () => void;
  onModuleSelect: (module: ModuleType, tab?: any) => void;
  activeModule: ModuleType;
  isAdmin: boolean;
  user: { email: string; selectedOutlet?: string };
  syncStatus: SyncStatus;
  isRefreshing?: boolean;
  notifications: Notification[];
  toast?: { message: string; type: 'success' | 'error' | 'info' } | null;
  onSidebarToggle?: () => void;
  showSidebarToggle?: boolean;
}

const Header: React.FC<Props> = ({ 
  filters, onFilterChange, onHome, 
  onRefresh, onForceSync, onAdminToggle, onLogout, onShare, onModuleSelect, activeModule, isAdmin, 
  user, syncStatus, isRefreshing, notifications, toast,
  onSidebarToggle, showSidebarToggle
}) => {
  const [currentNotifIndex, setCurrentNotifIndex] = useState(0);
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [hasNewNotif, setHasNewNotif] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    // Check initial state from body class
    setIsDarkMode(!document.body.classList.contains('light-mode'));
  }, []);

  const toggleTheme = () => {
    const isLightMode = document.body.classList.contains('light-mode');
    if (isLightMode) {
      document.body.classList.remove('light-mode');
      setIsDarkMode(true);
    } else {
      document.body.classList.add('light-mode');
      setIsDarkMode(false);
    }
  };

  const menuItems = [
    { type: ModuleType.SALES, label: 'Sales', icon: 'fa-cash-register', color: 'text-emerald-400' },
    { type: ModuleType.GOOGLE_REVIEW, label: 'Rekapan OPEX', icon: 'fa-wallet', color: 'text-amber-400' },
    { type: ModuleType.GUEST_COMPLAINT, label: 'Rekapan OT', icon: 'fa-clock', color: 'text-indigo-400' },
    { type: ModuleType.GSI, label: 'GSI', icon: 'fa-poll', color: 'text-indigo-400' },
    { type: ModuleType.QUALITY_ASSURANCE, label: 'QA', icon: 'fa-check-double', color: 'text-blue-400' },
    { type: ModuleType.ATTENDANCE, label: 'Attendance', icon: 'fa-users', color: 'text-orange-400' },
    { type: ModuleType.REGIONAL_REPORT_SERVICE, label: 'Regional', icon: 'fa-globe-asia', color: 'text-purple-400' },
  ];

  useEffect(() => {
    if (notifications.length > 0) {
      setHasNewNotif(true);
      const timer = setTimeout(() => setHasNewNotif(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [notifications.length]);

  useEffect(() => {
    if (notifications.length > 1) {
      const timer = setInterval(() => {
        setCurrentNotifIndex(prev => (prev + 1) % notifications.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [notifications.length]);

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const getStatusConfig = () => {
    switch(syncStatus) {
      case 'syncing': return { icon: 'fa-cloud-upload-alt animate-pulse', color: 'text-emerald-400', label: 'Online' };
      case 'offline': return { icon: 'fa-plane', color: 'text-slate-500', label: 'Offline' };
      case 'error': return { icon: 'fa-exclamation-circle', color: 'text-red-500', label: 'Err' };
      default: return { icon: 'fa-cloud', color: 'text-emerald-500', label: 'Online' };
    }
  };

  const status = getStatusConfig();

  return (
    <div className="flex flex-col gap-1 mb-4">
      {/* Success/Error Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[200] backdrop-blur-xl text-white px-6 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 ${
              toast.type === 'error' ? 'bg-red-600/90 border-red-400/30' : 
              toast.type === 'info' ? 'bg-indigo-600/90 border-indigo-400/30' : 
              'bg-emerald-600/90 border-emerald-400/30'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <i className={`fas ${
                toast.type === 'error' ? 'fa-exclamation-triangle' : 
                toast.type === 'info' ? 'fa-info-circle' : 
                'fa-check'
              } text-sm`}></i>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider">
                {toast.type === 'error' ? 'Error' : toast.type === 'info' ? 'Info' : 'Success'}
              </div>
              <div className="text-[12px] font-bold">{toast.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="glass-card mx-2 md:mx-4 my-1 p-3 md:p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl relative">
        {/* Notification Popup */}
        <AnimatePresence>
          {showNotifPopup && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full right-4 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
            >
              <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                <span className="text-[10px] font-black uppercase text-indigo-400">Recent Updates</span>
                <button onClick={() => setShowNotifPopup(false)} className="text-slate-500 hover:text-white transition-colors">
                  <i className="fas fa-times text-[10px]"></i>
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-[10px] text-slate-500 font-bold uppercase">No updates yet</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[8px] font-black text-indigo-300 uppercase">[{n.outlet}]</span>
                        <span className="text-[7px] text-slate-500">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[9px] text-white font-medium leading-tight">
                        <span className="font-black text-indigo-400 mr-1">{(n.user || '').split('@')[0]}</span>
                        {n.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Section: Home & Filters */}
      <div className="flex items-center gap-2 w-full md:w-auto">
        <button 
          onClick={onHome}
          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all flex items-center justify-center shrink-0"
        >
          <i className="fas fa-home text-sm"></i>
        </button>

        <button 
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all flex items-center justify-center shrink-0 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Refresh Data"
        >
          <i className={`fas fa-sync-alt text-sm ${isRefreshing ? 'fa-spin' : ''}`}></i>
        </button>

        <button 
          onClick={onForceSync}
          disabled={syncStatus === 'syncing' || isRefreshing}
          className={`p-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/10 transition-all flex items-center justify-center shrink-0 ${syncStatus === 'syncing' ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Sync to Cloud Now"
        >
          <i className={`fas fa-cloud-upload-alt text-sm ${syncStatus === 'syncing' ? 'animate-bounce' : ''}`}></i>
        </button>

        <button 
          onClick={onShare}
          className="p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20 transition-all flex items-center justify-center shrink-0"
          title="Share App URL"
        >
          <i className="fas fa-share-alt text-sm"></i>
        </button>

        <div className="h-6 w-px bg-white/10 hidden md:block"></div>

        {/* Slideable Filters Section */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1 flex-1 md:flex-initial">
          <div className="flex items-center gap-2 shrink-0">
            <select 
              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 focus:ring-2 ring-purple-500 outline-none text-[10px] font-black uppercase appearance-none cursor-pointer min-w-[100px]"
              value={filters.month}
              onChange={(e) => onFilterChange({ ...filters, month: e.target.value })}
            >
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[9px] font-black uppercase text-slate-500">From</label>
            <input 
              type="date" 
              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none font-bold text-white"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 pr-4">
            <label className="text-[9px] font-black uppercase text-slate-500">To</label>
            <input 
              type="date" 
              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none font-bold text-white"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Right Section: User Info & Controls */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t border-white/5 md:border-none pt-3 md:pt-0">
        {user.email && (
          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
            <div className="text-right">
              <div className="text-[8px] font-black text-white uppercase leading-none truncate max-w-[80px] md:max-w-[120px]">{(user.email || '').split('@')[0]}</div>
              <div className="text-[7px] font-black text-indigo-400 uppercase leading-none mt-1 truncate max-w-[80px] md:max-w-[120px]">{user.selectedOutlet || 'No Outlet'}</div>
              <div className={`text-[7px] font-bold ${status.color} uppercase flex items-center gap-1 mt-1 justify-end`}>
                <i className={`fas ${status.icon} text-[6px]`}></i> {status.label}
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-[9px] font-black shadow-lg shrink-0">
              {user.email.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        <div className={`flex items-center gap-2 ${user.email ? 'pl-4 border-l border-white/10' : ''}`}>
          <button 
            onClick={() => onModuleSelect(ModuleType.GOOGLE_SHEETS)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${activeModule === ModuleType.GOOGLE_SHEETS ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30' : 'bg-white/5 hover:bg-white/10 text-emerald-400'}`}
            title="Google Sheets Hub"
          >
            <i className="fas fa-file-excel text-xs"></i>
          </button>

          <button 
            onClick={() => onModuleSelect(ModuleType.GMAIL)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${activeModule === ModuleType.GMAIL ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-white/5 hover:bg-white/10 text-rose-400'}`}
            title="Gmail Dispatch"
          >
            <i className="fas fa-envelope text-xs"></i>
          </button>

          <button 
            onClick={() => onModuleSelect(ModuleType.PROJECT_REPORT)}
            className={`px-2.5 py-1.5 h-9 rounded-xl flex items-center gap-1.5 text-xs font-black transition-all ${activeModule === ModuleType.PROJECT_REPORT ? 'purple-gradient-bg text-white shadow-lg shadow-purple-900/40' : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30'}`}
            title="CSK Project Report (Irit Kuota)"
          >
            <i className="fas fa-clipboard-list text-xs"></i>
            <span className="hidden sm:inline uppercase text-[9px] tracking-wider">CSK Report</span>
          </button>

          <button 
            onClick={() => onModuleSelect(ModuleType.TUTORIAL)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${activeModule === ModuleType.TUTORIAL ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'bg-white/5 hover:bg-white/10 text-amber-400'}`}
            title="Tutorial & Panduan Penggunaan Aplikasi"
          >
            <i className="fas fa-graduation-cap text-xs"></i>
          </button>

          <button 
            onClick={() => setShowNotifPopup(!showNotifPopup)}
            className={`p-2 rounded-xl transition-all relative ${showNotifPopup ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <i className="fas fa-bell text-xs"></i>
            {hasNewNotif && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-900 animate-bounce"></span>
            )}
          </button>
          
          <button 
            onClick={toggleTheme}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10 ${isDarkMode ? 'text-yellow-400' : 'text-indigo-600 font-bold bg-white/50 shadow shadow-indigo-200'}`}
            title="Toggle Light/Dark Mode"
          >
            <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-xs`}></i>
          </button>

          {user.email && (
            <>
              <button 
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                  }
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-sm active:scale-95 shrink-0 cursor-pointer"
                title="Pusat Kontrol Outlet & Promo Sistem"
              >
                <i className="fas fa-store-alt text-xs text-amber-400"></i>
              </button>

              <button 
                onClick={onAdminToggle}
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-lg border border-white/20 transition-all active:scale-90 shrink-0 ${isAdmin ? 'bg-indigo-600 shadow-indigo-500/40' : 'mix-gradient-bg shadow-pink-500/20'}`}
              >
                {isAdmin ? <i className="fas fa-unlock-alt text-[10px]"></i> : 'A'}
              </button>

              <button 
                onClick={onLogout}
                className="w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/20 transition-all flex items-center justify-center shrink-0"
                title="Log Out"
              >
                <i className="fas fa-sign-out-alt text-xs"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
    </div>
  );
};

export default Header;