import React, { useState, useEffect, useMemo } from 'react';
import { ModuleType, BankingPromoItem, StrategyMenuItem, OutletConfig } from '../types';
import { getActiveOutletConfigs, getStoredBankPromos, getStoredStrategyCatalog } from '../constants';

interface Props {
  onSelect: (m: ModuleType, tab?: any) => void;
  isAdmin?: boolean;
  onToggleFS?: () => void;
  onOpenLogisticsInput?: () => void;
  selectedOutlet?: string;
}

const Dashboard: React.FC<Props> = ({ 
  onSelect, 
  isAdmin, 
  onToggleFS, 
  onOpenLogisticsInput,
  selectedOutlet 
}) => {
  // Realtime state loaded from permanent storage (LocalStorage, Server, Firestore)
  const [bankPromos, setBankPromos] = useState<BankingPromoItem[]>(() => getStoredBankPromos());
  const [strategyCatalog, setStrategyCatalog] = useState<StrategyMenuItem[]>(() => getStoredStrategyCatalog());
  const [outletConfigs, setOutletConfigs] = useState<OutletConfig[]>(() => getActiveOutletConfigs());

  // Interactive UI Filters in Dashboard
  const [promoFilter, setPromoFilter] = useState<'CURRENT' | 'ALL'>('ALL');
  const [strategyCategoryFilter, setStrategyCategoryFilter] = useState<'ALL' | 'PENYEIMBANG' | 'PERCEPATAN'>('ALL');
  const [strategySearch, setStrategySearch] = useState('');
  const [isPromosCollapsed, setIsPromosCollapsed] = useState(false);
  const [isStrategyCollapsed, setIsStrategyCollapsed] = useState(false);

  // Sync with permanent storage updates
  useEffect(() => {
    const refreshData = () => {
      setBankPromos(getStoredBankPromos());
      setStrategyCatalog(getStoredStrategyCatalog());
      setOutletConfigs(getActiveOutletConfigs());
    };

    window.addEventListener('appPromoSettingsChanged', refreshData);
    window.addEventListener('appStrategyCatalogChanged', refreshData);
    window.addEventListener('appOutletConfigsChanged', refreshData);
    window.addEventListener('storage', refreshData);

    return () => {
      window.removeEventListener('appPromoSettingsChanged', refreshData);
      window.removeEventListener('appStrategyCatalogChanged', refreshData);
      window.removeEventListener('appOutletConfigsChanged', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  const openControl = (tab: 'OUTLETS' | 'PROMO' | 'STRATEGI' = 'OUTLETS') => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab } }));
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Filtered active bank promos
  const activePromos = useMemo(() => {
    const list = bankPromos.filter(p => p.isActive);
    if (promoFilter === 'CURRENT' && selectedOutlet) {
      return list.filter(p => {
        if (!p.targetOutlets || p.targetOutlets.length === 0 || p.targetOutlets.includes('ALL')) {
          return true;
        }
        return p.targetOutlets.includes(selectedOutlet);
      });
    }
    return list;
  }, [bankPromos, promoFilter, selectedOutlet]);

  // Filtered active strategy menu catalog
  const activeStrategyList = useMemo(() => {
    let list = strategyCatalog.filter(s => s.isActive);
    if (strategyCategoryFilter !== 'ALL') {
      list = list.filter(s => s.category === strategyCategoryFilter);
    }
    if (strategySearch.trim()) {
      const q = strategySearch.toLowerCase();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.category.toLowerCase().includes(q) ||
        (s.session && s.session.toLowerCase().includes(q))
      );
    }
    return list;
  }, [strategyCatalog, strategyCategoryFilter, strategySearch]);

  const totalPenyeimbang = useMemo(() => {
    return strategyCatalog.filter(s => s.isActive && s.category === 'PENYEIMBANG').length;
  }, [strategyCatalog]);

  const totalPercepatan = useMemo(() => {
    return strategyCatalog.filter(s => s.isActive && s.category === 'PERCEPATAN').length;
  }, [strategyCatalog]);

  const currentOutletConfig = useMemo(() => {
    if (!selectedOutlet) return null;
    return outletConfigs.find(o => o.name === selectedOutlet);
  }, [outletConfigs, selectedOutlet]);

  const cards = [
    { type: ModuleType.PROJECT_REPORT, label: 'CSK Project Report', icon: 'fa-clipboard-list', color: 'from-purple-600 to-indigo-800', desc: 'Laporan Pekerjaan Lapangan, Progres Harian & Irit Kuota' },
    { type: ModuleType.SALES, label: 'Daily Revenue', icon: 'fa-cash-register', color: 'from-emerald-600 to-teal-800', desc: 'Revenue, Covers & Avg Check' },
    { type: ModuleType.RECEIVING_SHEET, label: 'Receiving Sheet', icon: 'fa-file-invoice-dollar', color: 'from-amber-500 to-yellow-600', desc: 'Laporan Belanja & Cost Supplier Harian' },
    { type: ModuleType.PATTY_CASH_EXPENSE, label: 'Patty Cash Expense', icon: 'fa-wallet', color: 'from-amber-500 to-orange-600', desc: 'Belanja Patty Cash & Matrix Detail Item' },
    { type: ModuleType.ENERGY_COST, label: 'Energy Cost', icon: 'fa-bolt', color: 'from-amber-400 to-yellow-600', desc: 'Listrik, Air PDAM, Gas & Monitoring KWh' },
    { type: ModuleType.CHEMICAL, label: 'Chemical', icon: 'fa-flask', color: 'from-cyan-500 to-teal-600', desc: 'Belanja Chemical Floor & Matrix Requisition' },
    { type: ModuleType.MAIN_STORE_KITCHEN, label: 'Main Store & Kitchen', icon: 'fa-warehouse', color: 'from-blue-600 to-indigo-700', desc: 'Belanja Main Store/Kitchen & Matrix Detail' },
    { type: ModuleType.SUPPLIER_EXPENSE, label: 'Supplier Expense', icon: 'fa-truck-loading', color: 'from-rose-600 to-red-700', desc: 'Belanja Supplier Rekanan & Purchasing Matrix' },
    { type: ModuleType.CITY_LEDGER, label: 'City Ledger', icon: 'fa-building', color: 'from-blue-600 to-cyan-700', desc: 'Bill City Ledger & Matrix Detail Piutang' },
    { type: ModuleType.GUEST_SATISFACTION, label: 'Guest Satisfaction', icon: 'fa-face-smile', color: 'from-emerald-600 to-teal-700', desc: 'Customer Care & Matrix Detail Recovery' },
    { type: ModuleType.COMPLIMENTARY, label: 'Complimentary', icon: 'fa-gift', color: 'from-purple-600 to-pink-700', desc: 'Bill Complimentary & Matrix Detail Promo' },
    { type: ModuleType.STRATEGI, label: 'Menu Strategi', icon: 'fa-bullseye', color: 'from-amber-500 to-orange-600', desc: 'Target & Actual Penyeimbang & Percepatan Lunch/Dinner' },
    { type: ModuleType.WEEKLY_OVERTIME, label: 'Input Weekly Overtime', icon: 'fa-business-time', color: 'from-indigo-600 to-purple-800', desc: 'Total Staff, Total Overtime & Average Overtime' },
    { type: ModuleType.COGS, label: 'COGS & Forecast Rev', icon: 'fa-calculator', color: 'from-emerald-600 to-teal-700', desc: 'HPP COGS, Forecast Revenue Weekday & Weekend' },
    { type: ModuleType.REKAPAN, label: 'Rekapan Harian', icon: 'fa-file-invoice', color: 'from-indigo-600 to-purple-800', desc: 'Summary Performa Harian' },
    { type: ModuleType.LOGISTICS, label: 'Rekapan Logistik', icon: 'fa-boxes', color: 'from-amber-500 to-orange-600', desc: 'Inventory & Peminjaman Barang' },
    { type: ModuleType.EXTERNAL_AUDIT, label: 'Third Party & Gas', icon: 'fa-gas-pump', color: 'from-amber-600 to-orange-700', desc: 'Penginputan & Rekapan Belanja Third Party & Gas' },
    { type: ModuleType.VOID_BILL, label: 'Void Bill Monitoring', icon: 'fa-ban', color: 'from-rose-600 to-red-800', desc: 'Pencatatan Kesalahan Void Staff & Otorisasi PIC' },
    { type: ModuleType.TUTORIAL, label: 'Tutorial & SOP', icon: 'fa-graduation-cap', color: 'from-blue-600 to-indigo-800', desc: 'Panduan Operasional Leader, Cashier & Store Keeper' },
  ];

  if (isAdmin) {
    cards.push({ type: ModuleType.ADMIN, label: 'Admin Panel', icon: 'fa-user-shield', color: 'from-slate-700 to-slate-900', desc: 'Master Configuration Center' });
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap justify-center sm:justify-between items-center gap-3 bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm">
            <i className="fas fa-store"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>Outlet Aktif:</span>
              <span className="text-white font-mono bg-white/10 px-2 py-0.5 rounded text-[11px] font-bold">
                {selectedOutlet || 'SEMUA OUTLET'}
              </span>
            </div>
            {currentOutletConfig && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-amber-400 font-bold uppercase">{currentOutletConfig.area}</span>
                <span className="text-slate-600">•</span>
                <span className="text-[9px] text-indigo-400 font-bold uppercase">{currentOutletConfig.type}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            type="button"
            onClick={onToggleFS}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-[0.15em] text-[10px] transition-all active:scale-95 flex items-center gap-1.5 border border-white/10 cursor-pointer"
          >
            <i className="fas fa-expand text-slate-400"></i>
            Full Screen
          </button>

          <button 
            type="button"
            onClick={() => openControl('OUTLETS')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-700 hover:from-amber-400 hover:to-indigo-600 text-slate-950 font-black uppercase tracking-[0.15em] text-[10px] shadow-lg shadow-amber-950/40 transition-all active:scale-95 flex items-center gap-1.5 border border-amber-400/40 cursor-pointer"
          >
            <i className="fas fa-sliders-h text-slate-950"></i>
            Outlet Control Master
          </button>

          {onOpenLogisticsInput && (
            <button 
              type="button"
              onClick={onOpenLogisticsInput}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black uppercase tracking-[0.15em] text-[10px] shadow-lg shadow-orange-950/40 transition-all active:scale-95 flex items-center gap-1.5 border border-orange-400/30 cursor-pointer"
            >
              <i className="fas fa-boxes text-slate-950"></i>
              Input Logistik
            </button>
          )}
        </div>
      </div>

      {/* OUTLET CONTROL STATUS & QUICK ACCESS MASTER BANNER */}
      <div className="glass-card p-4 sm:p-5 border border-amber-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/20 shadow-xl rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl shadow-inner shrink-0">
            <i className="fas fa-layer-group"></i>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                PERMANENT CLOUD PERSISTENCE
              </span>
              <h4 className="text-sm font-black text-white uppercase tracking-tight">
                Outlet Control &amp; Master Strategi
              </h4>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Setiap <strong className="text-amber-300">Outlet</strong>, <strong className="text-indigo-300">Promo Banking</strong>, dan <strong className="text-purple-300">Menu Penyeimbang &amp; Percepatan</strong> yang ditambahkan bersifat <span className="text-emerald-400 underline decoration-emerald-500/50">permanen di dashboard</span>. Hanya hilang jika dinonaktifkan atau dihapus pada Outlet Control.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
          <button
            type="button"
            onClick={() => openControl('PROMO')}
            className="px-3 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Kelola Promo Banking"
          >
            <i className="fas fa-tags text-[9px] text-indigo-400"></i>
            <span>{bankPromos.filter(p => p.isActive).length} Promo Bank</span>
          </button>

          <button
            type="button"
            onClick={() => openControl('STRATEGI')}
            className="px-3 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Kelola Katalog Menu Penyeimbang & Percepatan"
          >
            <i className="fas fa-chess text-[9px] text-purple-400"></i>
            <span>{strategyCatalog.filter(s => s.isActive).length} Menu Strategi</span>
          </button>

          <button
            type="button"
            onClick={() => openControl('OUTLETS')}
            className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Kelola & Tambah Outlet"
          >
            <i className="fas fa-store text-[9px] text-amber-400"></i>
            <span>{outletConfigs.filter(o => o.isActive !== false).length} Outlet Aktif</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DAFTAR PROMO BANKING AKTIF & PERMANEN DI DASHBOARD OUTLET    */}
      {/* ========================================================================= */}
      <div className="glass-card rounded-2xl border border-indigo-500/30 bg-slate-950/70 shadow-2xl overflow-hidden transition-all">
        <div className="p-4 sm:p-5 border-b border-indigo-500/20 bg-gradient-to-r from-indigo-950/50 via-slate-900/80 to-slate-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 text-base shadow-inner">
              <i className="fas fa-credit-card"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  Daftar Promo Banking Aktif
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activePromos.length} Promo
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Permanen
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Promo banking aktif yang otomatis terhubung ke perhitungan Daily Sales &amp; POS outlet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {selectedOutlet && (
              <div className="inline-flex rounded-xl bg-slate-900/90 border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setPromoFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    promoFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua Promo
                </button>
                <button
                  type="button"
                  onClick={() => setPromoFilter('CURRENT')}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    promoFilter === 'CURRENT'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Khusus Outlet Ini
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => openControl('PROMO')}
              className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <i className="fas fa-plus text-[9px]"></i>
              <span>Tambah / Kelola Promo</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPromosCollapsed(!isPromosCollapsed)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all text-xs"
              title={isPromosCollapsed ? 'Tampilkan Promo' : 'Sembunyikan Promo'}
            >
              <i className={`fas fa-chevron-${isPromosCollapsed ? 'down' : 'up'}`}></i>
            </button>
          </div>
        </div>

        {!isPromosCollapsed && (
          <div className="p-4 sm:p-5">
            {activePromos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {activePromos.map((promo) => {
                  const appliesToCurrent = !selectedOutlet || 
                    !promo.targetOutlets || 
                    promo.targetOutlets.includes('ALL') || 
                    promo.targetOutlets.includes(selectedOutlet);

                  return (
                    <div 
                      key={promo.id}
                      className="group relative p-4 rounded-xl bg-gradient-to-br from-slate-900/90 to-indigo-950/30 border border-white/10 hover:border-indigo-500/50 transition-all duration-300 shadow-md flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xs shrink-0">
                              <i className="fas fa-university"></i>
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-white uppercase tracking-tight group-hover:text-indigo-300 transition-colors">
                                {promo.name}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                                  Aktif
                                </span>
                                {promo.targetOutlets && promo.targetOutlets.includes('ALL') ? (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    Semua Outlet
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    {promo.targetOutlets?.length || 0} Outlet
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => openControl('PROMO')}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 transition-all text-[10px] cursor-pointer"
                            title="Edit Target Outlet atau Ketentuan di Outlet Control"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5 my-2">
                          <p className="text-[11px] font-medium text-slate-300 leading-snug line-clamp-2">
                            {promo.terms || 'Ketentuan diskon dan transaksi berlaku.'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1 text-slate-400">
                          <i className="far fa-calendar-alt text-indigo-400"></i>
                          {promo.periodStart || promo.periodEnd ? (
                            <span>{promo.periodStart || 'Mulai'} s/d {promo.periodEnd || 'Seterusnya'}</span>
                          ) : (
                            <span className="text-emerald-400 font-bold">Permanen Sepanjang Masa</span>
                          )}
                        </span>

                        {selectedOutlet && (
                          <span className={`font-black uppercase text-[8px] px-1.5 py-0.5 rounded ${
                            appliesToCurrent 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-slate-800 text-slate-500'
                          }`}>
                            {appliesToCurrent ? '✓ Berlaku di Outlet Ini' : 'Tidak Berlaku'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 px-4 rounded-xl bg-slate-900/40 border border-dashed border-white/10">
                <i className="fas fa-tags text-2xl text-slate-600 mb-2"></i>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Belum ada promo banking aktif yang terdaftar.
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Tambahkan promo banking melalui Outlet Control agar tersimpan permanen di seluruh outlet.
                </p>
                <button
                  type="button"
                  onClick={() => openControl('PROMO')}
                  className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                >
                  <i className="fas fa-plus mr-1"></i> Tambah Promo Bank Sekarang
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: KATALOG MENU PENYEIMBANG & PERCEPATAN PERMANEN                 */}
      {/* ========================================================================= */}
      <div className="glass-card rounded-2xl border border-purple-500/30 bg-slate-950/70 shadow-2xl overflow-hidden transition-all">
        <div className="p-4 sm:p-5 border-b border-purple-500/20 bg-gradient-to-r from-purple-950/50 via-slate-900/80 to-slate-950 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-base shadow-inner">
              <i className="fas fa-utensils"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  Katalog Menu Penyeimbang &amp; Percepatan
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {strategyCatalog.filter(s => s.isActive).length} Menu
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Permanen
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Katalog menu panduan strategi harian lunch &amp; dinner untuk menjaga dan mendongkrak revenue outlet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            {/* Filter Penyeimbang vs Percepatan */}
            <div className="inline-flex rounded-xl bg-slate-900/90 border border-white/10 p-1">
              <button
                type="button"
                onClick={() => setStrategyCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  strategyCategoryFilter === 'ALL'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua ({strategyCatalog.filter(s => s.isActive).length})
              </button>
              <button
                type="button"
                onClick={() => setStrategyCategoryFilter('PENYEIMBANG')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  strategyCategoryFilter === 'PENYEIMBANG'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Penyeimbang ({totalPenyeimbang})
              </button>
              <button
                type="button"
                onClick={() => setStrategyCategoryFilter('PERCEPATAN')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  strategyCategoryFilter === 'PERCEPATAN'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Percepatan ({totalPercepatan})
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
              <input 
                type="text"
                value={strategySearch}
                onChange={(e) => setStrategySearch(e.target.value)}
                placeholder="Cari menu..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-white text-[10px] focus:outline-none focus:border-purple-500 w-32 sm:w-40"
              />
            </div>

            <button
              type="button"
              onClick={() => openControl('STRATEGI')}
              className="px-3 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <i className="fas fa-plus text-[9px]"></i>
              <span>Tambah Menu</span>
            </button>

            <button
              type="button"
              onClick={() => onSelect(ModuleType.STRATEGI)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 border border-purple-500/30 cursor-pointer"
              title="Buka Input Target & Actual Menu Strategi"
            >
              <i className="fas fa-bullseye text-[9px]"></i>
              <span>Buka Menu Strategi</span>
            </button>

            <button
              type="button"
              onClick={() => setIsStrategyCollapsed(!isStrategyCollapsed)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all text-xs"
              title={isStrategyCollapsed ? 'Tampilkan Menu' : 'Sembunyikan Menu'}
            >
              <i className={`fas fa-chevron-${isStrategyCollapsed ? 'down' : 'up'}`}></i>
            </button>
          </div>
        </div>

        {!isStrategyCollapsed && (
          <div className="p-4 sm:p-5">
            {activeStrategyList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {activeStrategyList.map((item) => {
                  const isPenyeimbang = item.category === 'PENYEIMBANG';

                  return (
                    <div 
                      key={item.id}
                      className={`group relative p-3.5 rounded-xl bg-slate-900/90 border transition-all duration-300 shadow-md flex flex-col justify-between ${
                        isPenyeimbang 
                          ? 'border-amber-500/30 hover:border-amber-400 hover:bg-amber-950/20' 
                          : 'border-purple-500/30 hover:border-purple-400 hover:bg-purple-950/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                            isPenyeimbang 
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          }`}>
                            {item.category}
                          </span>

                          <span className="text-[8px] font-bold text-slate-400 uppercase bg-slate-800/80 px-1.5 py-0.5 rounded">
                            {item.session === 'BOTH' ? 'Lunch & Dinner' : item.session}
                          </span>
                        </div>

                        <h4 className="text-xs font-black text-white tracking-tight group-hover:text-amber-200 transition-colors line-clamp-2 min-h-[32px]">
                          {item.name}
                        </h4>

                        <div className="mt-2 text-xs font-black text-emerald-400 font-mono">
                          {formatRupiah(item.price)}
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between text-[8px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Permanen Aktif
                        </span>
                        <button
                          type="button"
                          onClick={() => openControl('STRATEGI')}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Ubah di Outlet Control"
                        >
                          <i className="fas fa-cog"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 px-4 rounded-xl bg-slate-900/40 border border-dashed border-white/10">
                <i className="fas fa-utensils text-2xl text-slate-600 mb-2"></i>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Tidak ada menu strategi yang sesuai dengan filter.
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Tambahkan menu penyeimbang atau percepatan melalui Outlet Control agar tersimpan permanen.
                </p>
                <button
                  type="button"
                  onClick={() => openControl('STRATEGI')}
                  className="mt-3 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                >
                  <i className="fas fa-plus mr-1"></i> Tambah Menu ke Katalog
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: GRID MODUL OPERASIONAL DASHBOARD                              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 animate-fade-in no-blur p-1 pb-20">
        {cards.map((card, idx) => (
          <div
            key={card.type + idx}
            onClick={() => onSelect(card.type)}
            className="group relative h-40 md:h-52 rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-white/40 transition-all duration-300 hover:-translate-y-1 active:scale-95 text-left focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-xl"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5 group-hover:opacity-20 transition-opacity duration-300`}></div>
            <div className="absolute top-4 right-4 md:top-6 md:right-6 text-white/5 group-hover:text-white/10 transition-all duration-300 transform group-hover:scale-110">
              <i className={`fas ${card.icon} text-5xl md:text-7xl`}></i>
            </div>
            <div className="relative h-full p-6 md:p-8 flex flex-col justify-between items-start z-10">
              <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-lg group-hover:shadow-2xl transition-all`}>
                <i className={`fas ${card.icon} text-lg md:text-2xl`}></i>
              </div>
              
              <div className="pointer-events-none">
                <h3 className="text-base md:text-xl font-black text-white mb-1 md:mb-2 uppercase tracking-tight group-hover:text-purple-300 transition-colors">
                  {card.label}
                </h3>
                <p className="text-[9px] md:text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors max-w-[150px] md:max-w-[180px]">
                  {card.desc}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;