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
  const [useEmailLogin, setUseEmailLogin] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return unsub;
  }, []);

  const manualEmail = safeStorage.getItem('MANUAL_USER_EMAIL') || '';
  const resolvedEmail = (firebaseUser && firebaseUser.email) || (firebaseUser && firebaseUser.isAnonymous ? manualEmail : null);

  const handleQuickLogin = async () => {
    if (!selectedOutlet) {
      showToast?.('Silakan pilih outlet terlebih dahulu.', 'error');
      return;
    }
    if (resolvedEmail) {
      setLoading(true);
      try {
        if (!auth.currentUser) {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.warn('[QuickLogin] Auth ensure notice:', err);
      }
      safeStorage.setItem('BARN_SELECTED_OUTLET', selectedOutlet);
      onLogin(resolvedEmail, selectedOutlet as Outlet);
    }
  };

  const handleManualEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutlet) {
      showToast?.('Silakan pilih outlet terlebih dahulu.', 'error');
      return;
    }
    const cleanEmail = (emailInput.trim() || savedEmail || '').toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast?.('Masukkan email yang valid.', 'error');
      return;
    }

    setLoading(true);
    try {
      if (!auth.currentUser) {
        const { signInAnonymously } = await import('firebase/auth');
        await signInAnonymously(auth);
      }
    } catch (err) {
      console.warn('[ManualLogin] Auth anonymous notice:', err);
    }

    safeStorage.setItem('MANUAL_USER_EMAIL', cleanEmail);
    safeStorage.setItem('BARN_USER_SESSION', cleanEmail);
    safeStorage.setItem('BARN_SELECTED_OUTLET', selectedOutlet);
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
        showToast?.('Berhasil masuk via Google. Silakan pilih outlet untuk melanjutkan.', 'success');
      }
    } catch (error: any) {
      const errorCode = error.code || (error.message && error.message.includes('popup-closed-by-user') ? 'auth/popup-closed-by-user' : '');
      
      // Expected user actions or browser popup restrictions - do not treat as fatal console.error
      if (errorCode === 'auth/popup-closed-by-user' || errorCode === 'auth/cancelled-popup-request') {
        showToast?.('Login dibatalkan atau jendela ditutup.', 'info');
        setLoading(false);
        setNetworkError(true);
        return;
      }

      if (errorCode === 'auth/popup-blocked') {
        console.warn('[Auth] Google popup was blocked by browser or iframe security policy:', error);
        setNetworkError(true);
        setUseEmailLogin(true);
        showToast?.('Popup login Google diblokir oleh browser / batasan Iframe. Silakan login langsung menggunakan Email & Outlet di bawah atau buka Tab Baru.', 'info');
        setLoading(false);
        return;
      }

      console.warn('[Auth] Login attempt notice:', error);
      
      let message = 'Gagal masuk: ' + (error.message || 'Terjadi kesalahan.');
      
      if (errorCode === 'auth/network-request-failed') {
        setNetworkError(true);
        setUseEmailLogin(true);
        message = 'Koneksi ke Google terhalang dalam Iframe. Silakan gunakan Login Email & Outlet di bawah ini atau buka di Tab Baru.';
        showToast?.(message, 'info');
      } else if (errorCode === 'auth/internal-error' && error.message?.includes('assertion failed')) {
        message = 'Terjadi kesalahan internal sistem login. Silakan refresh halaman dan coba lagi.';
        showToast?.(message, 'error');
      } else {
        showToast?.(message, 'error');
      }
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }
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

      <div className="glass-card max-w-md w-full p-6 sm:p-10 border-white/10 shadow-2xl relative animate-fade-in mx-auto my-auto">
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl sm:rounded-3xl mx-auto flex items-center justify-center mb-4 sm:mb-6 shadow-2xl shadow-purple-500/20 transform rotate-12">
            <i className="fas fa-server text-2xl sm:text-3xl text-white"></i>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter mb-2">DAILY REPORT REVENUE</h1>
          <p className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em]">Multi-User Performance Suite</p>
          <div className="mt-4 sm:mt-6 py-1.5 sm:py-2 px-3 sm:px-4 bg-indigo-500/10 border border-indigo-500/20 rounded-full inline-block">
            <p className="text-indigo-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.4em]">SUPPORT BY CHRISTIAN</p>
          </div>
        </div>

        <div className="space-y-6">
          {!resolvedEmail ? (
            <div className="text-center space-y-2 animate-fade-in">
              <h2 className="text-white font-bold text-lg">Silakan Masuk</h2>
              <p className="text-slate-400 text-xs">Pilih outlet dan masuk menggunakan akun Google atau email Anda.</p>
            </div>
          ) : (
            <div className="text-center space-y-2 animate-fade-in">
              <h2 className="text-white font-bold text-lg">Selamat Datang</h2>
              <p className="text-slate-400 text-xs">Pilih outlet untuk masuk atau buka Halaman Regional.</p>
            </div>
          )}

          {resolvedEmail ? (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center">
                <div className="flex justify-center mb-1">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold scale-110">
                    <i className="fas fa-user-check text-sm"></i>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Sesi Aktif Terdeteksi</p>
                  <p className="text-white text-sm font-black tracking-tight select-all truncate max-w-full px-2 py-1 bg-slate-950/30 rounded-lg">{resolvedEmail}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Pilih Outlet</label>
                <select 
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value as Outlet)}
                  className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans"
                >
                  <option value="">-- Pilih Outlet --</option>
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

              <button 
                onClick={handleQuickLogin}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 border border-white/10"
              >
                {loading ? (
                  <>
                    <i className="fas fa-circle-notch fa-spin"></i>
                    MEMPROSES DATA...
                  </>
                ) : (
                  <>
                    <i className="fas fa-sign-in-alt text-xs"></i>
                    MASUK KE: {selectedOutlet || 'PILIH OUTLET'}
                  </>
                )}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[8px] uppercase tracking-widest font-black">
                  <span className="bg-[#1e293b] px-3 text-slate-500 font-black">HALAMAN REGIONAL</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <button 
                  onClick={() => onPublicView?.(ModuleType.REGIONAL_REPORT)}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 border border-white/10"
                >
                  <i className="fas fa-chart-line text-xs"></i>
                  Laporan Regional (All Divisions & Outlets)
                </button>

                <button
                  type="button"
                  onClick={() => setShowOutletControlModal(true)}
                  className="w-full py-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 font-black text-[10px] uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 active:scale-95 border border-amber-500/30 shadow-md"
                >
                  <i className="fas fa-store-alt text-amber-400"></i>
                  Outlet Control (Kelola Outlet & Promo)
                </button>
              </div>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[7px] uppercase tracking-widest font-black">
                  <span className="bg-[#1e293b] px-2 text-slate-500">PILIHAN AKUN LAIN</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const { signOut } = await import('firebase/auth');
                    await signOut(auth);
                    safeStorage.removeItem('MANUAL_USER_EMAIL');
                    safeStorage.removeItem('BARN_SELECTED_OUTLET');
                    safeStorage.removeItem('BARN_USER_SESSION');
                    setFirebaseUser(null);
                    setUseEmailLogin(false);
                    showToast?.('Sesi telah direset. Silakan login kembali.', 'info');
                  }}
                  className="py-3 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-[8px] uppercase tracking-wider transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i className="fas fa-sign-out-alt text-red-400"></i> KELUAR SESI
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { signOut } = await import('firebase/auth');
                    await signOut(auth);
                    safeStorage.removeItem('MANUAL_USER_EMAIL');
                    safeStorage.removeItem('BARN_SELECTED_OUTLET');
                    safeStorage.removeItem('BARN_USER_SESSION');
                    setFirebaseUser(null);
                    setUseEmailLogin(true);
                  }}
                  className="py-3 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-[8px] uppercase tracking-wider transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i className="fas fa-user-plus text-indigo-400"></i> GANTI EMAIL
                </button>
              </div>
            </div>
          ) : !useEmailLogin ? (
            <div className="space-y-4">
              {/* Outlet Selector readily available */}
              <div className="space-y-2 text-left">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">
                  1. Pilih Outlet Anda
                </label>
                <select 
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value as Outlet)}
                  className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans"
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

              <div className="space-y-2.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block text-left">
                  2. Pilih Metode Masuk
                </label>
                <button 
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 border border-white/10 ${
                    loading ? 'bg-slate-800 text-slate-600 cursor-wait' : 'bg-white text-slate-900 hover:bg-slate-100 shadow-purple-500/10'
                  }`}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-circle-notch fa-spin"></i>
                      Menghubungkan...
                    </>
                  ) : (
                    <>
                      <i className="fab fa-google text-base text-red-500"></i>
                      Sign in with Google
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setUseEmailLogin(true)}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-[0.15em] shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 border border-white/10"
                >
                  <i className="fas fa-envelope text-indigo-200"></i>
                  Masuk Langsung via Email
                </button>
              </div>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[8px] uppercase tracking-widest font-black">
                  <span className="bg-[#1e293b] px-3 text-slate-500 font-black">ATAU AKSES LANGSUNG</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={() => onPublicView?.(ModuleType.REGIONAL_REPORT)}
                  className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-[10px] uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 active:scale-95 border border-white/10"
                >
                  <i className="fas fa-chart-line text-indigo-400"></i>
                  Laporan Regional
                </button>
                <button 
                  type="button"
                  onClick={() => setShowOutletControlModal(true)}
                  className="w-full py-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-black text-[10px] uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 active:scale-95 border border-amber-500/30"
                >
                  <i className="fas fa-store-alt text-amber-400"></i>
                  Outlet Control
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualEmailLogin} className="space-y-4 animate-fade-in-up text-left">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Pilih Outlet *</label>
                <select 
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value as Outlet)}
                  className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans"
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

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Pengguna *</label>
                <input 
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="contoh@gmail.com"
                  className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white font-bold text-sm outline-none focus:ring-2 ring-purple-500 transition-all font-sans"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setUseEmailLogin(false)}
                  className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-[10px] uppercase tracking-[0.1em] shadow-lg transition-all active:scale-95 border border-white/10"
                >
                  KEMBALI
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedOutlet}
                  className="py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-[10px] uppercase tracking-[0.1em] shadow-lg transition-all flex justify-center items-center gap-2 active:scale-95 border border-indigo-400/50"
                >
                  {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sign-in-alt"></i>}
                  MASUK {selectedOutlet ? selectedOutlet.replace('SH ', '') : ''}
                </button>
              </div>
            </form>
          )}

          {networkError && (
            <div className="mt-4 p-4 bg-amber-500/15 border border-amber-500/30 rounded-2xl animate-fade-in relative z-50 text-left">
              <p className="text-amber-200 text-xs mb-3 leading-relaxed">
                <i className="fas fa-info-circle mr-2 text-amber-400"></i>
                Browser atau Iframe memblokir popup Google. Anda dapat masuk langsung menggunakan <strong>Email & Outlet</strong> di formulir di atas, atau buka di <strong>Tab Baru</strong>.
              </p>
              <button 
                type="button"
                onClick={() => window.open(window.location.href, '_blank')}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <i className="fas fa-external-link-alt"></i>
                Buka di Tab Baru
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-white/5 text-center">
           <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest leading-relaxed">
             Data outlet disinkronkan secara real-time. Hubungi admin jika terdapat kendala akses.
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

