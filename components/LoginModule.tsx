import React, { useState, useEffect, useMemo } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { Outlet, ModuleType, OutletConfig } from '../types';
import { OUTLETS, getActiveOutletConfigs } from '../constants';
import { safeStorage } from '../lib/safeStorage';
import { OutletControlModal } from './OutletControlModal';

interface Props {
  onLogin: (email: string, outlet: Outlet) => void;
  onPublicView?: (moduleType?: ModuleType) => void;
  isFullScreen: boolean;
  onToggleFS: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const LoginModule: React.FC<Props> = ({ onLogin, onPublicView, isFullScreen, onToggleFS, showToast }) => {
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [showOutletControlModal, setShowOutletControlModal] = useState(false);
  const [outletConfigs, setOutletConfigs] = useState<OutletConfig[]>(() => getActiveOutletConfigs());

  const refreshOutlets = (newConfigs?: OutletConfig[]) => {
    if (newConfigs && newConfigs.length > 0) {
      setOutletConfigs(newConfigs);
    } else {
      setOutletConfigs(getActiveOutletConfigs());
    }
  };

  const groupedOutlets: Record<string, OutletConfig[]> = useMemo(() => {
    const groups: Record<string, OutletConfig[]> = {};
    outletConfigs.forEach(cfg => {
      const areaKey = cfg.area || 'LAINNYA';
      if (!groups[areaKey]) groups[areaKey] = [];
      groups[areaKey].push(cfg);
    });
    return groups;
  }, [outletConfigs]);

  const savedOutlet = (safeStorage.getItem('BARN_SELECTED_OUTLET') as Outlet) || '';
  const savedEmail = safeStorage.getItem('MANUAL_USER_EMAIL') || safeStorage.getItem('BARN_USER_SESSION') || '';

  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | ''>(savedOutlet);
  const [emailInput, setEmailInput] = useState<string>(() => savedEmail || '');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user && user.email) {
        setEmailInput(user.email);
        safeStorage.setItem('MANUAL_USER_EMAIL', user.email);
        safeStorage.setItem('BARN_USER_SESSION', user.email);
      }
    });
    return unsub;
  }, []);

  const manualEmail = safeStorage.getItem('MANUAL_USER_EMAIL') || emailInput || '';
  const activeSessionEmail = (firebaseUser && firebaseUser.email) || manualEmail || '';

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedOutlet) {
      showToast?.('Silakan pilih outlet terlebih dahulu.', 'error');
      return;
    }
    const cleanEmail = (emailInput.trim() || activeSessionEmail || '').toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast?.('Silakan masukkan alamat email yang valid.', 'error');
      return;
    }

    setLoading(true);

    try {
      if (!auth.currentUser) {
        const { signInAnonymously } = await import('firebase/auth');
        await Promise.race([
          signInAnonymously(auth),
          new Promise(res => setTimeout(res, 2000))
        ]);
      }
    } catch (err) {
      console.warn('[LoginModule] Auth anonymous notice:', err);
    }

    safeStorage.setItem('MANUAL_USER_EMAIL', cleanEmail);
    safeStorage.setItem('BARN_USER_SESSION', cleanEmail);
    safeStorage.setItem('BARN_SELECTED_OUTLET', selectedOutlet);

    showToast?.(`Masuk sebagai ${cleanEmail} di ${selectedOutlet}`, 'success');
    onLogin(cleanEmail, selectedOutlet as Outlet);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setNetworkError(false);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const result = await signInWithPopup(auth, provider);
      if (result.user.email) {
        const userEmail = result.user.email.toLowerCase();
        setEmailInput(userEmail);
        safeStorage.setItem('MANUAL_USER_EMAIL', userEmail);
        safeStorage.setItem('BARN_USER_SESSION', userEmail);
        
        if (selectedOutlet) {
          safeStorage.setItem('BARN_SELECTED_OUTLET', selectedOutlet);
          showToast?.(`Login Google berhasil! Membuka ${selectedOutlet}...`, 'success');
          onLogin(userEmail, selectedOutlet as Outlet);
          return;
        } else {
          showToast?.('Berhasil masuk via Google! Silakan pilih outlet Anda untuk melanjutkan.', 'success');
        }
      }
    } catch (error: any) {
      const errorCode = error.code || (error.message && error.message.includes('popup-closed-by-user') ? 'auth/popup-closed-by-user' : '');
      
      if (errorCode === 'auth/popup-closed-by-user' || errorCode === 'auth/cancelled-popup-request') {
        showToast?.('Jendela login Google ditutup. Anda juga bisa langsung memasukkan email di bawah.', 'info');
        setLoading(false);
        return;
      }

      if (errorCode === 'auth/popup-blocked') {
        console.warn('[Auth] Google popup was blocked by browser or iframe security policy:', error);
        setNetworkError(true);
        showToast?.('Popup login Google diblokir browser. Silakan masukkan email Anda langsung pada formulir di bawah.', 'info');
        setLoading(false);
        return;
      }

      console.warn('[Auth] Login notice:', error);
      
      if (errorCode === 'auth/network-request-failed') {
        setNetworkError(true);
        showToast?.('Koneksi Google terhalang iframe. Silakan login langsung menggunakan Email di bawah.', 'info');
      } else {
        showToast?.('Gagal masuk via Google. Silakan gunakan formulir Email & Outlet di bawah.', 'error');
      }
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }
  };

  const handleResetSession = async () => {
    try {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    } catch (e) {
      // ignore
    }
    safeStorage.removeItem('MANUAL_USER_EMAIL');
    safeStorage.removeItem('BARN_SELECTED_OUTLET');
    safeStorage.removeItem('BARN_USER_SESSION');
    setFirebaseUser(null);
    setEmailInput('');
    setSelectedOutlet('');
    showToast?.('Sesi telah direset. Silakan login kembali dengan akun baru.', 'info');
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto relative">
      {/* Top Header Bar for Fullscreen and Quick Controls */}
      <div className="w-full max-w-md sm:max-w-xl mx-auto flex items-center justify-between gap-3 z-50 py-3 mb-1">
        <div className="flex items-center gap-2.5 bg-slate-950/70 px-3.5 py-2 rounded-2xl border border-white/10">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-[10px] sm:text-xs font-black text-slate-300 uppercase tracking-widest">SH SYSTEM PORTAL</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOutletControlModal(true)}
            type="button"
            title="Buka Pusat Kontrol Outlet & Promo Sistem"
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 transition-all border border-amber-500/40 text-[10px] sm:text-xs font-black uppercase tracking-wider active:scale-95 cursor-pointer shadow-lg shadow-amber-500/10"
          >
            <i className="fas fa-store-alt text-amber-400"></i>
            <span>Outlet Control</span>
          </button>

          <button 
            onClick={onToggleFS}
            type="button"
            aria-label={isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider transition-all border border-indigo-400/40 shadow-xl shadow-indigo-600/30 group active:scale-95 cursor-pointer"
          >
            <i className={`fas ${isFullScreen ? 'fa-compress' : 'fa-expand'} text-white group-hover:scale-110 transition-transform`}></i>
            <span className="text-[10px] sm:text-xs font-black">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>

          <button
            onClick={() => window.open(window.location.href, '_blank')}
            type="button"
            title="Buka di Tab Baru untuk tampilan penuh & login lancar"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-white/10 text-[10px] sm:text-xs font-black uppercase tracking-wider active:scale-95 cursor-pointer"
          >
            <i className="fas fa-external-link-alt text-amber-400"></i>
            <span className="hidden sm:inline">Tab Baru</span>
          </button>
        </div>
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="glass-card max-w-md w-full p-6 sm:p-8 border-white/10 shadow-2xl relative animate-fade-in mx-auto my-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl sm:rounded-3xl mx-auto flex items-center justify-center mb-3 sm:mb-4 shadow-2xl shadow-purple-500/20 transform rotate-12">
            <i className="fas fa-server text-2xl sm:text-3xl text-white"></i>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter mb-1">DAILY REPORT REVENUE</h1>
          <p className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em]">Multi-User Performance Suite</p>
          <div className="mt-3 py-1 px-3 bg-indigo-500/10 border border-indigo-500/20 rounded-full inline-block">
            <p className="text-indigo-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.4em]">SUPPORT BY CHRISTIAN</p>
          </div>
        </div>

        {/* Active Session Badge if detected */}
        {activeSessionEmail && (
          <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                <i className="fas fa-user-check text-xs"></i>
              </div>
              <div className="overflow-hidden">
                <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider">Sesi Terdeteksi</p>
                <p className="text-white text-xs font-bold truncate max-w-[190px]">{activeSessionEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              title="Ganti akun atau reset sesi"
              className="text-[9px] font-black text-slate-400 hover:text-red-400 uppercase tracking-wider px-2 py-1 bg-slate-800/80 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer border border-white/5 flex-shrink-0"
            >
              Ganti Akun
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
          {/* 1. Pilih Outlet */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 flex items-center justify-between">
              <span>1. Pilih Outlet *</span>
              {selectedOutlet && (
                <span className="text-emerald-400 font-bold lowercase tracking-normal text-[10px]">
                  ✓ {selectedOutlet}
                </span>
              )}
            </label>
            <select 
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value as Outlet)}
              className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans cursor-pointer"
              required
            >
              <option value="">-- Pilih Outlet Anda --</option>
              {(Object.entries(groupedOutlets) as [string, OutletConfig[]][]).map(([area, list]) => (
                <optgroup key={area} label={`📍 ${area}`} className="bg-slate-950 text-indigo-400 font-black">
                  {list.map(cfg => (
                    <option key={cfg.name} value={cfg.name} className="bg-slate-900 text-white font-bold">
                      {cfg.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 2. Email User */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">
              2. Email Pengguna *
            </label>
            <div className="relative">
              <input 
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="contoh@gmail.com"
                className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 pr-10 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans"
                required
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <i className="fas fa-envelope text-xs"></i>
              </div>
            </div>
          </div>

          {/* Primary Submit Button */}
          <button 
            type="submit"
            disabled={loading || !selectedOutlet}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/60 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2.5 active:scale-95 border border-indigo-400/30 cursor-pointer"
          >
            {loading ? (
              <>
                <i className="fas fa-circle-notch fa-spin"></i>
                MEMPROSES MASUK...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt text-xs"></i>
                MASUK KE {selectedOutlet || 'OUTLET'}
              </>
            )}
          </button>
        </form>

        {/* Google Login Alternative */}
        <div className="mt-4 pt-3 border-t border-white/5 space-y-3">
          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 border border-white/10 cursor-pointer ${
              loading ? 'bg-slate-800 text-slate-600 cursor-wait' : 'bg-white text-slate-900 hover:bg-slate-100 shadow-purple-500/10'
            }`}
          >
            <i className="fab fa-google text-red-500 text-base"></i>
            <span>Masuk Cepat dengan Google</span>
          </button>
        </div>

        {/* Secondary Links: Regional Report & Outlet Control */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-white/5"></div>
          </div>
          <div className="relative flex justify-center text-[8px] uppercase tracking-widest font-black">
            <span className="bg-[#1e293b] px-3 text-slate-500 font-black">AKSES CEPAT</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button 
            type="button"
            onClick={() => onPublicView?.(ModuleType.REGIONAL_REPORT)}
            className="py-3 px-3 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 border border-indigo-500/30 cursor-pointer"
          >
            <i className="fas fa-chart-line text-xs"></i>
            <span>Laporan Regional</span>
          </button>

          <button
            type="button"
            onClick={() => setShowOutletControlModal(true)}
            className="py-3 px-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 border border-amber-500/30 cursor-pointer"
          >
            <i className="fas fa-store-alt text-amber-400 text-xs"></i>
            <span>Outlet Control</span>
          </button>
        </div>

        {networkError && (
          <div className="mt-4 p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-left">
            <p className="text-amber-200 text-xs mb-2 leading-relaxed">
              <i className="fas fa-info-circle mr-1.5 text-amber-400"></i>
              Browser memblokir popup Google. Anda dapat masuk langsung menggunakan <strong>Email & Outlet</strong> di formulir di atas.
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-white/5 text-center">
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
            Multi-User Real-time Sync. Semua outlet terhubung secara otomatis.
          </p>
        </div>
      </div>

      {/* OUTLET CONTROL MODAL */}
      <OutletControlModal
        isOpen={showOutletControlModal}
        onClose={() => {
          setShowOutletControlModal(false);
          refreshOutlets();
        }}
        showToast={showToast}
        onOutletsChange={(newOutlets) => {
          refreshOutlets(newOutlets);
        }}
      />
    </div>
  );
};

export default LoginModule;
