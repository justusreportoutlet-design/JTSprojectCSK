import React, { useState, useMemo, useEffect } from 'react';
import { AppState, Outlet, BankingPromoItem } from '../types';
import { OUTLETS, MONTHS, getStoredBankPromos, getActiveOutletNames } from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface Props {
  allOutletsData: Record<string, any>;
  data?: AppState;
  selectedMonth: number; // 0..11
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export interface PromoRegionalSummary {
  promo: BankingPromoItem;
  status: 'ACTIVE' | 'INACTIVE';
  totalCovers: number;
  totalRevenue: number;
  totalDiscount: number;
  participatingOutletsCount: number;
  outletBreakdown: Record<string, { covers: number; revenue: number; discount: number }>;
}

export const RegionalPromoRecapTable: React.FC<Props> = ({
  allOutletsData,
  data,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromoDetail, setSelectedPromoDetail] = useState<PromoRegionalSummary | null>(null);
  const [promoConfigVersion, setPromoConfigVersion] = useState<number>(0);

  // Live real-time listener for promo settings added in Outlet Control or cloud
  useEffect(() => {
    const handlePromoChange = () => setPromoConfigVersion(v => v + 1);
    window.addEventListener('appPromoSettingsChanged', handlePromoChange);

    const promoDocRef = doc(db, 'system_config', 'promo_settings');
    const unsubPromo = onSnapshot(promoDocRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('APP_PROMO_SETTINGS', JSON.stringify(d));
          }
        } catch (e) {}
        setPromoConfigVersion(v => v + 1);
      }
    }, () => {});

    return () => {
      window.removeEventListener('appPromoSettingsChanged', handlePromoChange);
      unsubPromo();
    };
  }, []);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTHS[selectedMonth];

  // Helper to get area for outlet
  const getAreaForOutlet = (outletName: string): string => {
    const jkt = ['SH KELAPA GADING', 'SH CIPETE', 'SH SENAYAN PARK', 'SH PIM 3', 'SH CITRA 6', 'SH GANDARIA CITY'];
    const tgr = ['SH THE BARN', 'SH BINTARO', 'SH SUMMARECON SERPONG', 'SH LIVING WORLD', 'SH SUPERMAL KARAWACI', 'SH BINTARO XCHANGE'];
    const bks = ['SH GRAND KOTA BINTANG', 'SH SUMMARECON BEKASI', 'SH CIBUBUR'];
    const bdg = ['SH BANDUNG', 'SH DAGO', 'SH RIAU', 'SH PARIS VAN JAVA', 'SH TSMM'];

    if (jkt.includes(outletName)) return 'JAKARTA';
    if (tgr.includes(outletName)) return 'TANGGERANG';
    if (bks.includes(outletName)) return 'BEKASI & CIBUBUR';
    if (bdg.includes(outletName)) return 'BANDUNG';
    return 'OTHER';
  };

  // Filter outlets by area
  const targetOutlets = useMemo(() => {
    const activeOutlets = getActiveOutletNames();
    if (!selectedArea || selectedArea === 'ALL') return activeOutlets;
    return activeOutlets.filter(o => getAreaForOutlet(o) === selectedArea);
  }, [selectedArea]);

  // Aggregate master list of all promos (active and historical/inactive)
  const masterPromosList: BankingPromoItem[] = useMemo(() => {
    const promoMap = new Map<string, BankingPromoItem>();

    // Baseline default promos
    const defaultPromos: BankingPromoItem[] = [
      {
        id: 'digibank',
        name: 'Digibank by DBS',
        terms: 'All F&B - JKT/TGR/BKS Disc Rp.150.000 with Min. Purchase Rp.1.250.000',
        isActive: true,
      },
      {
        id: 'bank_mega',
        name: 'Bank MEGA',
        terms: 'All F&B Disc. 15% Min. Purchase Rp.650.000 (Max. Disc Rp.150.000)',
        isActive: true,
      },
      {
        id: 'bca_prioritas',
        name: 'BCA Prioritas',
        terms: 'Diskon 15% All F&B Min. Transaksi Rp 750.000 (Maks. Rp 200.000) - Kartu Kredit Prioritas',
        isActive: false, // Inactive example to show history
      },
      {
        id: 'mandiri_livin',
        name: 'Mandiri Livin',
        terms: 'Diskon 20% Min. Transaksi Rp 500.000 dengan QRIS Livin Mandiri',
        isActive: false,
      }
    ];

    defaultPromos.forEach(p => promoMap.set(p.id, p));

    // Pull from local storage / central stored promos (from Outlet Control)
    try {
      const stored = getStoredBankPromos();
      if (Array.isArray(stored) && stored.length > 0) {
        stored.forEach(p => {
          if (p && p.id) {
            promoMap.set(p.id, { ...(promoMap.get(p.id) || {}), ...p });
          }
        });
      }
    } catch (e) {}

    // Pull from active global data
    if (data?.bankingPromos && Array.isArray(data.bankingPromos)) {
      data.bankingPromos.forEach(p => promoMap.set(p.id, { ...(promoMap.get(p.id) || {}), ...p }));
    }
    if (data?.promoSettings?.customBankPromos && Array.isArray(data.promoSettings.customBankPromos)) {
      data.promoSettings.customBankPromos.forEach(p => promoMap.set(p.id, { ...(promoMap.get(p.id) || {}), ...p }));
    }

    // Pull from each outlet's data across months
    const activeOutlets = getActiveOutletNames();
    activeOutlets.forEach(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};

      const outPromos = outletMonths.bankingPromos || mData.bankingPromos || outletMonths.promoSettings?.customBankPromos || mData.promoSettings?.customBankPromos;
      if (Array.isArray(outPromos)) {
        outPromos.forEach((p: BankingPromoItem) => {
          if (p && p.id) {
            promoMap.set(p.id, { ...(promoMap.get(p.id) || {}), ...p });
          }
        });
      }
    });

    return Array.from(promoMap.values());
  }, [data, allOutletsData, selectedMonth, promoConfigVersion]);

  // Aggregate stats for each promo across target outlets
  const promoSummaries: PromoRegionalSummary[] = useMemo(() => {
    return masterPromosList.map(promo => {
      let totalCovers = 0;
      let totalRevenue = 0;
      let totalDiscount = 0;
      const outletBreakdown: Record<string, { covers: number; revenue: number; discount: number }> = {};
      let participatingOutletsCount = 0;

      targetOutlets.forEach(outletName => {
        const outletMonths = allOutletsData?.[outletName] || {};
        const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
        const sales = mData.sales || outletMonths.sales || {};
        const dailyRecording = sales.dailyRecording || outletMonths.dailyRecording || mData.dailyRecording || {};

        let outCovers = 0;
        let outRev = 0;
        let outDisc = 0;

        Object.entries(dailyRecording).forEach(([dateStr, rec]: [string, any]) => {
          if (!dateStr.startsWith(monthKey) && !dateStr.startsWith(`${selectedYear}-${selectedMonth + 1}-`)) return;
          if (!rec) return;

          if (promo.id === 'digibank' || promo.name.toLowerCase().includes('digibank')) {
            outCovers += Number(rec.digibankCover || rec.todayDigibankCover || 0);
            outRev += Number(rec.digibankRevenue || rec.todayDigibankRevenue || 0);
            outDisc += Number(rec.digibankDiscount || rec.todayDigibankDiscount || 0);
          } else if (promo.id === 'bank_mega' || promo.name.toLowerCase().includes('mega')) {
            outCovers += Number(rec.bankMegaCover || rec.todayBankMegaCover || 0);
            outRev += Number(rec.bankMegaRevenue || rec.todayBankMegaRevenue || 0);
            outDisc += Number(rec.discDinnerBankMega || rec.discLunchBankMega || 0);
          } else {
            // Dynamic promo bank entries
            const entry = rec.promoBankEntries?.[promo.id];
            if (entry) {
              outCovers += Number(entry.cover || 0);
              outRev += Number(entry.rev || entry.revenue || 0);
              outDisc += Number(entry.disc || entry.discount || 0);
            }
          }
        });

        if (outCovers > 0 || outRev > 0) {
          participatingOutletsCount++;
        }

        outletBreakdown[outletName] = {
          covers: outCovers,
          revenue: outRev,
          discount: outDisc
        };

        totalCovers += outCovers;
        totalRevenue += outRev;
        totalDiscount += outDisc;
      });

      return {
        promo,
        status: promo.isActive ? 'ACTIVE' : 'INACTIVE',
        totalCovers,
        totalRevenue,
        totalDiscount,
        participatingOutletsCount,
        outletBreakdown
      };
    });
  }, [masterPromosList, targetOutlets, allOutletsData, selectedMonth, selectedYear, monthKey]);

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return promoSummaries.filter(item => {
      if (statusFilter === 'ACTIVE' && item.status !== 'ACTIVE') return false;
      if (statusFilter === 'INACTIVE' && item.status !== 'INACTIVE') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.promo.name.toLowerCase().includes(q);
        const matchTerms = item.promo.terms?.toLowerCase().includes(q);
        if (!matchName && !matchTerms) return false;
      }

      return true;
    });
  }, [promoSummaries, statusFilter, searchQuery]);

  // Grand totals across all promos
  const grandTotals = useMemo(() => {
    return promoSummaries.reduce(
      (acc, curr) => {
        acc.totalCovers += curr.totalCovers;
        acc.totalRevenue += curr.totalRevenue;
        acc.totalDiscount += curr.totalDiscount;
        if (curr.status === 'ACTIVE') acc.activeCount++;
        else acc.inactiveCount++;
        return acc;
      },
      { totalCovers: 0, totalRevenue: 0, totalDiscount: 0, activeCount: 0, inactiveCount: 0 }
    );
  }, [promoSummaries]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`Rekapan Promo Bank ${monthName}`);

      worksheet.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Nama Promo Bank', key: 'name', width: 28 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Syarat & Ketentuan (T&C)', key: 'terms', width: 45 },
        { header: 'Total Covers (Pax)', key: 'covers', width: 18 },
        { header: 'Total Revenue (Rp)', key: 'revenue', width: 22 },
        { header: 'Total Discount (Rp)', key: 'discount', width: 20 },
        { header: 'Outlets Berpartisipasi', key: 'outlets', width: 24 },
      ];

      // Styling Header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E1B4B' } // indigo-950
      };

      filteredSummaries.forEach((s, idx) => {
        const row = worksheet.addRow({
          no: idx + 1,
          name: s.promo.name,
          status: s.status === 'ACTIVE' ? 'AKTIF' : 'NON-AKTIF / HISTORIS',
          terms: s.promo.terms || '-',
          covers: s.totalCovers,
          revenue: s.totalRevenue,
          discount: s.totalDiscount,
          outlets: `${s.participatingOutletsCount} Outlets`,
        });

        if (s.status === 'ACTIVE') {
          row.getCell('status').font = { color: { argb: 'FF059669' }, bold: true };
        } else {
          row.getCell('status').font = { color: { argb: 'FF94A3B8' }, italic: true };
        }
      });

      // Total Row
      const totRow = worksheet.addRow({
        no: '',
        name: 'TOTAL REGIONAL',
        status: '',
        terms: '',
        covers: grandTotals.totalCovers,
        revenue: grandTotals.totalRevenue,
        discount: grandTotals.totalDiscount,
        outlets: '',
      });
      totRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekapan_Promo_Bank_Regional_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Export Excel Rekapan Promo Bank berhasil!', 'success');
    } catch (err) {
      console.error(err);
      showToast?.('Gagal export Excel rekapan promo.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="glass-card p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                <i className="fas fa-tags text-base"></i>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight uppercase">
                Rekapan Promo Bank Regional
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {monthName} {selectedYear}
              </span>
            </div>
            <p className="text-slate-400 text-xs font-medium max-w-2xl">
              Monitoring seluruh promo perbankan aktif maupun riwayat promo yang pernah berjalan (kadaluarsa/non-aktif).
              Menampilkan syarat &amp; ketentuan, partisipasi outlet, covers, realisasi omzet, serta diskon promo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                }
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-950/40 flex items-center gap-2 cursor-pointer active:scale-95 border border-indigo-400/30"
              title="Atur penambahan promo dan pilihan outlet target di Outlet Control"
            >
              <i className="fas fa-store-alt text-amber-400"></i>
              <span>Outlet Control Promo</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-950/30 flex items-center gap-2 cursor-pointer"
            >
              <i className="fas fa-file-excel"></i>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Total Promo Terdaftar</span>
            <div className="text-xl font-black text-white font-mono">{masterPromosList.length}</div>
            <span className="text-[8px] text-slate-500 font-semibold">Aktif &amp; Non-Aktif</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-emerald-500/20">
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider block mb-1">Promo Aktif Saat Ini</span>
            <div className="text-xl font-black text-emerald-300 font-mono">{grandTotals.activeCount}</div>
            <span className="text-[8px] text-emerald-500/80 font-semibold">Berjalan di Daily Revenue</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-700/40">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">History / Non-Aktif</span>
            <div className="text-xl font-black text-slate-400 font-mono">{grandTotals.inactiveCount}</div>
            <span className="text-[8px] text-slate-500 font-semibold">Arsip &amp; Riwayat</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-cyan-500/20">
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider block mb-1">Total Covers Promo</span>
            <div className="text-xl font-black text-cyan-300 font-mono">{grandTotals.totalCovers.toLocaleString('id-ID')} <span className="text-[10px] font-normal text-slate-400">Pax</span></div>
            <span className="text-[8px] text-cyan-500/80 font-semibold">Volume Transaksi Tamu</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-amber-500/20">
            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block mb-1">Total Omzet Promo</span>
            <div className="text-lg font-black text-amber-300 font-mono truncate">Rp {grandTotals.totalRevenue.toLocaleString('id-ID')}</div>
            <span className="text-[8px] text-amber-500/80 font-semibold">Akumulasi Revenue Bank</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-rose-500/20">
            <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider block mb-1">Total Nilai Diskon</span>
            <div className="text-lg font-black text-rose-300 font-mono truncate">Rp {grandTotals.totalDiscount.toLocaleString('id-ID')}</div>
            <span className="text-[8px] text-rose-500/80 font-semibold">Beban Diskon Promo</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-white/10 w-fit">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Semua ({promoSummaries.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Aktif Berjalan ({grandTotals.activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'INACTIVE'
                ? 'bg-slate-700 text-white shadow-md shadow-slate-700/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Non-Aktif / History ({grandTotals.inactiveCount})
          </button>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama promo atau T&C..."
            className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white text-xs placeholder-slate-500 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Promo Table */}
      <div className="glass-card bg-slate-900/60 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-white/10 text-[9px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-4 px-4 text-center w-12">No</th>
                <th className="py-4 px-4 min-w-[200px]">Nama Promo Bank</th>
                <th className="py-4 px-4 text-center w-28">Status Promo</th>
                <th className="py-4 px-4 min-w-[300px]">Syarat &amp; Ketentuan (T&amp;C)</th>
                <th className="py-4 px-4 text-right">Total Covers</th>
                <th className="py-4 px-4 text-right">Total Omzet</th>
                <th className="py-4 px-4 text-right">Total Diskon</th>
                <th className="py-4 px-4 text-center w-36">Partisipasi Outlet</th>
                <th className="py-4 px-4 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-2 text-slate-600">
                      <i className="fas fa-inbox text-xl"></i>
                    </div>
                    Tidak ditemukan data promo sesuai filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((item, idx) => {
                  const isAct = item.status === 'ACTIVE';

                  return (
                    <tr
                      key={item.promo.id}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => setSelectedPromoDetail(item)}
                    >
                      <td className="py-4 px-4 text-center text-slate-500 font-mono font-bold">
                        {idx + 1}
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black border ${
                              isAct
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                : 'bg-slate-800/40 text-slate-400 border-slate-700/40'
                            }`}
                          >
                            <i className="fas fa-credit-card"></i>
                          </div>
                          <div>
                            <div className="font-black text-white group-hover:text-indigo-300 transition-colors uppercase text-xs">
                              {item.promo.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-mono">
                                ID: {item.promo.id}
                              </span>
                              {item.promo.targetOutlets && !item.promo.targetOutlets.includes('ALL') ? (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {item.promo.targetOutlets.length} Outlet Target
                                </span>
                              ) : (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Semua Outlet
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center">
                        {isAct ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                            Non-Aktif
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <div className="text-slate-300 text-xs font-normal line-clamp-2 max-w-md">
                          {item.promo.terms || (
                            <span className="text-slate-600 italic">Belum ada syarat &amp; ketentuan tercatat</span>
                          )}
                        </div>
                        {item.promo.startDate && item.promo.endDate && (
                          <div className="text-[10px] text-indigo-400 font-mono mt-1">
                            Periode: {item.promo.startDate} s/d {item.promo.endDate}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-cyan-300">
                        {item.totalCovers.toLocaleString('id-ID')} <span className="text-[10px] text-slate-500 font-normal">Pax</span>
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-black text-emerald-400">
                        Rp {item.totalRevenue.toLocaleString('id-ID')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-rose-400">
                        Rp {item.totalDiscount.toLocaleString('id-ID')}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="px-2 py-1 rounded-lg bg-slate-800/80 border border-white/5 text-[10px] font-bold text-slate-300 font-mono">
                          {item.participatingOutletsCount} / {targetOutlets.length} Outlets
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedPromoDetail(item)}
                          className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredSummaries.length > 0 && (
              <tfoot className="bg-slate-950/90 border-t-2 border-white/10 font-black text-xs">
                <tr>
                  <td colSpan={4} className="py-4 px-4 text-right uppercase text-slate-400 tracking-wider">
                    Total Keseluruhan Promo:
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-cyan-400">
                    {grandTotals.totalCovers.toLocaleString('id-ID')} Pax
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400">
                    Rp {grandTotals.totalRevenue.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-rose-400">
                    Rp {grandTotals.totalDiscount.toLocaleString('id-ID')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detail Modal per Promo (Outlet Breakdown) */}
      {selectedPromoDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      selectedPromoDetail.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {selectedPromoDetail.status === 'ACTIVE' ? 'Aktif' : 'Non-Aktif / Historis'}
                  </span>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">
                    {selectedPromoDetail.promo.name}
                  </h3>
                </div>
                <p className="text-slate-400 text-xs font-medium">
                  {selectedPromoDetail.promo.terms || 'Tidak ada catatan syarat & ketentuan khusus.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPromoDetail(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Promo Totals in Modal */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Total Covers</span>
                <span className="text-lg font-black text-cyan-400 font-mono">
                  {selectedPromoDetail.totalCovers.toLocaleString('id-ID')} Pax
                </span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Total Revenue</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  Rp {selectedPromoDetail.totalRevenue.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Total Diskon</span>
                <span className="text-lg font-black text-rose-400 font-mono">
                  Rp {selectedPromoDetail.totalDiscount.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Outlets Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">
                Realisasi Per Outlet ({monthName} {selectedYear})
              </span>
              <div className="border border-white/10 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-wider text-slate-400 sticky top-0">
                    <tr>
                      <th className="p-3">Outlet</th>
                      <th className="p-3 text-right">Covers (Pax)</th>
                      <th className="p-3 text-right">Revenue (Rp)</th>
                      <th className="p-3 text-right">Diskon (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {targetOutlets.map(outletName => {
                      const outData = selectedPromoDetail.outletBreakdown[outletName] || { covers: 0, revenue: 0, discount: 0 };
                      return (
                        <tr key={outletName} className="hover:bg-white/5">
                          <td className="p-3 font-bold text-white flex items-center gap-2">
                            <i className="fas fa-store text-indigo-400 text-[10px]"></i>
                            {outletName}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-cyan-300">
                            {outData.covers.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-400">
                            Rp {outData.revenue.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-400">
                            Rp {outData.discount.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedPromoDetail(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalPromoRecapTable;
