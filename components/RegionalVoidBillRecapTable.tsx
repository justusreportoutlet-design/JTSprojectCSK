import React, { useState, useMemo } from 'react';
import { VoidBillRecord } from '../types';
import { OUTLETS, getActiveOutletNames } from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Props {
  data: Record<string, any>; // allOutletsData: { [outletName]: { [monthKey]: AppState } }
  selectedMonth: number; // 0-11
  selectedYear: number;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const formatIDR = (num: number) => {
  return (Number(num) || 0).toLocaleString('id-ID');
};

export const RegionalVoidBillRecapTable: React.FC<Props> = ({
  data,
  selectedMonth,
  selectedYear,
  selectedOutlet = 'ALL',
  onSelectOutlet,
  showToast
}) => {
  const [filterOutlet, setFilterOutlet] = useState<string>(selectedOutlet || 'ALL');
  const [searchStaff, setSearchStaff] = useState<string>('');
  const [minFrequencyFilter, setMinFrequencyFilter] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'STAFF_RANKING' | 'OUTLET_SUMMARY' | 'TRANSACTIONS'>('STAFF_RANKING');

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth] || 'Bulan';

  const activeOutletList = useMemo(() => {
    return getActiveOutletNames();
  }, []);

  // Aggregate all void bills across all outlets for the selected period
  const allPeriodVoidBills = useMemo(() => {
    const records: VoidBillRecord[] = [];

    activeOutletList.forEach(outletName => {
      const outletMonthData = data?.[outletName]?.[monthKey] || data?.[outletName]?.[String(selectedMonth)];
      if (!outletMonthData) return;

      // Extract from dailyVoidBills
      if (outletMonthData.dailyVoidBills && typeof outletMonthData.dailyVoidBills === 'object') {
        Object.entries(outletMonthData.dailyVoidBills).forEach(([dKey, dayList]) => {
          if (Array.isArray(dayList)) {
            dayList.forEach(rec => {
              if (rec && (rec.date ? rec.date.startsWith(monthKey) : true)) {
                records.push({
                  ...rec,
                  outlet: rec.outlet || outletName
                });
              }
            });
          }
        });
      }

      // Extract from voidBills array
      if (Array.isArray(outletMonthData.voidBills)) {
        outletMonthData.voidBills.forEach(rec => {
          if (rec && (rec.date ? rec.date.startsWith(monthKey) : true)) {
            if (!records.some(r => r.id === rec.id)) {
              records.push({
                ...rec,
                outlet: rec.outlet || outletName
              });
            }
          }
        });
      }
    });

    return records.sort((a, b) => b.date.localeCompare(a.date));
  }, [data, activeOutletList, monthKey, selectedMonth]);

  // Filtered void bills
  const filteredVoidBills = useMemo(() => {
    let res = allPeriodVoidBills;

    if (filterOutlet !== 'ALL') {
      res = res.filter(r => r.outlet.toLowerCase() === filterOutlet.toLowerCase());
    }

    if (searchStaff.trim()) {
      const q = searchStaff.toLowerCase();
      res = res.filter(r => 
        (r.staffName || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.pic || '').toLowerCase().includes(q) ||
        (r.outlet || '').toLowerCase().includes(q)
      );
    }

    return res;
  }, [allPeriodVoidBills, filterOutlet, searchStaff]);

  // Grouped Staff Analysis (Staff Cumulative Voids in the period)
  const staffCumulativeAnalysis = useMemo(() => {
    const staffMap = new Map<string, {
      staffName: string;
      outlet: string;
      totalCount: number; // Berapa kali kesalahan
      totalAmount: number; // Total nominal void
      reasons: Map<string, number>; // Breakdown alasan
      pics: Set<string>;
      lastDate: string;
      role?: string;
      division?: string;
    }>();

    filteredVoidBills.forEach(rec => {
      const staffKey = `${rec.outlet}___${(rec.staffName || 'Tanpa Nama').trim().toUpperCase()}`;
      const existing = staffMap.get(staffKey) || {
        staffName: rec.staffName || 'Tanpa Nama',
        outlet: rec.outlet,
        totalCount: 0,
        totalAmount: 0,
        reasons: new Map(),
        pics: new Set(),
        lastDate: rec.date,
        role: rec.staffRole,
        division: rec.staffDivision
      };

      existing.totalCount += 1;
      existing.totalAmount += Number(rec.amount) || 0;
      
      const rName = rec.reason || 'Lainnya';
      existing.reasons.set(rName, (existing.reasons.get(rName) || 0) + 1);

      if (rec.pic) existing.pics.add(rec.pic);
      if (rec.date > existing.lastDate) existing.lastDate = rec.date;
      if (!existing.role && rec.staffRole) existing.role = rec.staffRole;

      staffMap.set(staffKey, existing);
    });

    let list = Array.from(staffMap.values()).map(item => {
      // Sort reasons by frequency
      const topReasons = Array.from(item.reasons.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `${reason} (${count}x)`);

      return {
        ...item,
        avgAmount: item.totalCount > 0 ? Math.round(item.totalAmount / item.totalCount) : 0,
        topReasonsStr: topReasons.slice(0, 3).join(', '),
        allReasonsList: topReasons,
        picsStr: Array.from(item.pics).join(', ')
      };
    });

    if (minFrequencyFilter > 0) {
      list = list.filter(x => x.totalCount >= minFrequencyFilter);
    }

    // Rank by totalCount descending, then totalAmount descending
    return list.sort((a, b) => b.totalCount - a.totalCount || b.totalAmount - a.totalAmount);
  }, [filteredVoidBills, minFrequencyFilter]);

  // Grouped Outlet Summary
  const outletSummary = useMemo(() => {
    const outMap = new Map<string, {
      outlet: string;
      totalCount: number;
      totalAmount: number;
      uniqueStaff: Set<string>;
      topStaffName: string;
      topStaffCount: number;
    }>();

    activeOutletList.forEach(oName => {
      outMap.set(oName, {
        outlet: oName,
        totalCount: 0,
        totalAmount: 0,
        uniqueStaff: new Set(),
        topStaffName: '-',
        topStaffCount: 0
      });
    });

    // Count per outlet
    const staffPerOutlet = new Map<string, Map<string, number>>();

    allPeriodVoidBills.forEach(rec => {
      const o = rec.outlet;
      const data = outMap.get(o) || {
        outlet: o,
        totalCount: 0,
        totalAmount: 0,
        uniqueStaff: new Set(),
        topStaffName: '-',
        topStaffCount: 0
      };

      data.totalCount += 1;
      data.totalAmount += Number(rec.amount) || 0;
      data.uniqueStaff.add(rec.staffName || 'Unknown');
      outMap.set(o, data);

      if (!staffPerOutlet.has(o)) staffPerOutlet.set(o, new Map());
      const sMap = staffPerOutlet.get(o)!;
      sMap.set(rec.staffName, (sMap.get(rec.staffName) || 0) + 1);
    });

    // Determine top staff per outlet
    staffPerOutlet.forEach((sMap, o) => {
      const sorted = Array.from(sMap.entries()).sort((a, b) => b[1] - a[1]);
      if (sorted[0] && outMap.has(o)) {
        const d = outMap.get(o)!;
        d.topStaffName = sorted[0][0];
        d.topStaffCount = sorted[0][1];
      }
    });

    return Array.from(outMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allPeriodVoidBills, activeOutletList]);

  // Regional Overall KPIs
  const regionalMetrics = useMemo(() => {
    const totalAmount = allPeriodVoidBills.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalCount = allPeriodVoidBills.length;
    const uniqueStaff = new Set(allPeriodVoidBills.map(r => `${r.outlet}_${r.staffName}`)).size;
    const topStaff = staffCumulativeAnalysis[0] || null;

    return {
      totalAmount,
      totalCount,
      uniqueStaff,
      topStaff
    };
  }, [allPeriodVoidBills, staffCumulativeAnalysis]);

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Staff Ranking / Cumulative
    const sheetStaff = workbook.addWorksheet('Staff Void Cumulative');
    sheetStaff.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'Nama Staff', key: 'staffName', width: 24 },
      { header: 'Role/Divisi', key: 'role', width: 16 },
      { header: 'Total Kesalahan (Kali)', key: 'totalCount', width: 22 },
      { header: 'Total Nominal Void (Rp)', key: 'totalAmount', width: 25 },
      { header: 'Rata-Rata per Void (Rp)', key: 'avgAmount', width: 22 },
      { header: 'Top Alasan Pembatalan', key: 'topReasons', width: 35 },
      { header: 'PIC Terkait', key: 'pics', width: 25 },
      { header: 'Terakhir Kejadian', key: 'lastDate', width: 16 },
    ];

    staffCumulativeAnalysis.forEach((st, idx) => {
      sheetStaff.addRow({
        rank: idx + 1,
        outlet: st.outlet,
        staffName: st.staffName,
        role: st.role || '-',
        totalCount: st.totalCount,
        totalAmount: st.totalAmount,
        avgAmount: st.avgAmount,
        topReasons: st.topReasonsStr,
        pics: st.picsStr,
        lastDate: st.lastDate
      });
    });

    // Sheet 2: Outlet Summary
    const sheetOutlet = workbook.addWorksheet('Outlet Summary');
    sheetOutlet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Outlet', key: 'outlet', width: 22 },
      { header: 'Total Kesalahan (Kali)', key: 'totalCount', width: 22 },
      { header: 'Total Nominal Void (Rp)', key: 'totalAmount', width: 25 },
      { header: 'Staff Terlibat (Orang)', key: 'uniqueStaff', width: 22 },
      { header: 'Staff Terbanyak Void', key: 'topStaff', width: 26 },
      { header: 'Frekuensi Staff Terbanyak', key: 'topCount', width: 24 },
    ];

    outletSummary.forEach((out, idx) => {
      sheetOutlet.addRow({
        no: idx + 1,
        outlet: out.outlet,
        totalCount: out.totalCount,
        totalAmount: out.totalAmount,
        uniqueStaff: out.uniqueStaff.size,
        topStaff: out.topStaffName,
        topCount: out.topStaffCount > 0 ? `${out.topStaffCount}x` : '-'
      });
    });

    // Sheet 3: All Transactions
    const sheetTrans = workbook.addWorksheet('All Transactions');
    sheetTrans.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Shift', key: 'shift', width: 12 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'No. Bill', key: 'bill', width: 14 },
      { header: 'Meja', key: 'table', width: 10 },
      { header: 'Nama Staff', key: 'staffName', width: 22 },
      { header: 'Nominal Void (Rp)', key: 'amount', width: 20 },
      { header: 'Alasan Void', key: 'reason', width: 30 },
      { header: 'PIC', key: 'pic', width: 20 },
      { header: 'Catatan', key: 'notes', width: 25 },
    ];

    filteredVoidBills.forEach((rec, idx) => {
      sheetTrans.addRow({
        no: idx + 1,
        date: rec.date,
        shift: rec.shift || '-',
        outlet: rec.outlet,
        bill: rec.billNumber || '-',
        table: rec.tableNumber || '-',
        staffName: rec.staffName,
        amount: rec.amount,
        reason: rec.reason,
        pic: rec.pic,
        notes: rec.notes || '-'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Regional_Void_Bill_Recap_${monthKey}.xlsx`);
    showToast?.('Laporan Rekapan Void Bill Regional berhasil diunduh!', 'success');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-white">
      {/* HEADER SECTION */}
      <div className="glass-card p-6 border border-rose-500/20 bg-slate-900/90 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl border border-rose-500/30 shadow-lg shadow-rose-950/40">
                <i className="fas fa-chart-pie"></i>
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  REGIONAL REKAPAN VOID BILL
                  <span className="text-[10px] font-black bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                    READ-ONLY
                  </span>
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  Akumulasi Kesalahan Void Staff Seluruh Outlet • Periode {monthName} {selectedYear}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 max-w-xl">
              Catatan staff yang sering melakukan Void Bill terakumulasi dalam masa periode bulan tertentu. Menganalisis frekuensi kesalahan staf, total nominal void, outlet asal, serta verifikasi PIC.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl border border-emerald-400/30 flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              <i className="fas fa-file-excel text-sm"></i>
              <span>Unduh Rekapan Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* REGIONAL KPI METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL REGIONAL AMOUNT */}
        <div className="glass-card p-5 bg-slate-900/80 border border-rose-500/20 rounded-2xl relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Void Regional</span>
            <i className="fas fa-sack-xmark text-rose-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">
            Rp {formatIDR(regionalMetrics.totalAmount)}
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Akumulasi seluruh outlet periode {monthName} {selectedYear}
          </div>
        </div>

        {/* TOTAL TRANSAKSI REGIONAL */}
        <div className="glass-card p-5 bg-slate-900/80 border border-amber-500/20 rounded-2xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Transaksi Void</span>
            <i className="fas fa-receipt text-amber-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-amber-300 tracking-tight">
            {regionalMetrics.totalCount} <span className="text-base text-slate-400 font-bold">Kali</span>
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Total pembatalan bill tercatat di regional
          </div>
        </div>

        {/* JUMLAH STAFF TERLIBAT */}
        <div className="glass-card p-5 bg-slate-900/80 border border-indigo-500/20 rounded-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Staff Terlibat</span>
            <i className="fas fa-users-slash text-indigo-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-indigo-300 tracking-tight">
            {regionalMetrics.uniqueStaff} <span className="text-base text-slate-400 font-bold">Orang</span>
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            Jumlah staf unik yang tercatat melakukan void
          </div>
        </div>

        {/* STAFF DENGAN KESALAHAN TERBANYAK */}
        <div className="glass-card p-5 bg-slate-900/80 border border-purple-500/20 rounded-2xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Top Staff Void</span>
            <i className="fas fa-triangle-exclamation text-purple-400 text-lg"></i>
          </div>
          <div className="text-base lg:text-lg font-black text-purple-300 truncate tracking-tight">
            {regionalMetrics.topStaff ? `${regionalMetrics.topStaff.staffName} (${regionalMetrics.topStaff.outlet})` : '-'}
          </div>
          <div className="text-[9px] text-purple-200/80 font-bold mt-2 flex items-center gap-1.5">
            {regionalMetrics.topStaff ? (
              <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md border border-purple-500/30">
                {regionalMetrics.topStaff.totalCount}x kesalahan (Rp {formatIDR(regionalMetrics.topStaff.totalAmount)})
              </span>
            ) : (
              <span>Belum ada data</span>
            )}
          </div>
        </div>
      </div>

      {/* TABS NAVIGATION & FILTERS */}
      <div className="glass-card p-4 bg-slate-900/80 border border-white/10 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Tab Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('STAFF_RANKING')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'STAFF_RANKING'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-ranking-star"></i>
              <span>Akumulasi Staff Sering Void ({staffCumulativeAnalysis.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('OUTLET_SUMMARY')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'OUTLET_SUMMARY'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-store"></i>
              <span>Rekapan Per Outlet ({activeOutletList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('TRANSACTIONS')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'TRANSACTIONS'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-list-check"></i>
              <span>Semua Transaksi Detail ({filteredVoidBills.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[200px] max-w-xs">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              value={searchStaff}
              onChange={e => setSearchStaff(e.target.value)}
              placeholder="Cari nama staff / alasan..."
              className="w-full bg-slate-950 pl-9 pr-3 py-2 rounded-xl border border-white/10 text-white text-xs outline-none focus:border-rose-500/50"
            />
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter Outlet:</span>
            <select
              value={filterOutlet}
              onChange={e => {
                setFilterOutlet(e.target.value);
                onSelectOutlet?.(e.target.value);
              }}
              className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/10 text-white text-xs outline-none focus:border-rose-500"
            >
              <option value="ALL">Semua Outlet (Regional)</option>
              {activeOutletList.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {activeTab === 'STAFF_RANKING' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Minimal Kesalahan:</span>
              <select
                value={minFrequencyFilter}
                onChange={e => setMinFrequencyFilter(Number(e.target.value))}
                className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/10 text-white text-xs outline-none focus:border-rose-500"
              >
                <option value={0}>Semua (≥ 1 kali)</option>
                <option value={2}>≥ 2 kali kesalahan</option>
                <option value={3}>≥ 3 kali kesalahan (Perhatian)</option>
                <option value={5}>≥ 5 kali kesalahan (Kritis)</option>
              </select>
            </div>
          )}

          {(filterOutlet !== 'ALL' || searchStaff || minFrequencyFilter > 0) && (
            <button
              onClick={() => {
                setFilterOutlet('ALL');
                setSearchStaff('');
                setMinFrequencyFilter(0);
              }}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-[10px] font-bold uppercase transition-all"
            >
              Reset Filter
            </button>
          )}

          <div className="ml-auto text-[10px] font-bold text-slate-400">
            Total tercatat: <strong className="text-white">{filteredVoidBills.length}</strong> transaksi void
          </div>
        </div>
      </div>

      {/* VIEW 1: TABEL AKUMULASI STAFF YANG SERING VOID BILL */}
      {activeTab === 'STAFF_RANKING' && (
        <div className="glass-card bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
            <div className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-2">
              <i className="fas fa-users-gear text-rose-400"></i>
              Ranking &amp; Catatan Staff Sering Melakukan Void Bill (Terakumulasi Periode {monthName} {selectedYear})
            </div>
            <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-white/5">
              Urutan: Frekuensi Terbanyak
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="p-3 text-center w-14">Rank</th>
                  <th className="p-3">Outlet</th>
                  <th className="p-3">Nama Staff</th>
                  <th className="p-3 text-center">Total Kesalahan</th>
                  <th className="p-3 text-right">Total Nominal Void</th>
                  <th className="p-3 text-right">Rata-Rata / Void</th>
                  <th className="p-3">Alasan Paling Sering Terjadi</th>
                  <th className="p-3">PIC Pengawas</th>
                  <th className="p-3 text-center">Status Evaluasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {staffCumulativeAnalysis.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <i className="fas fa-check-circle text-emerald-400 text-3xl"></i>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                          Tidak ada catatan kesalahan void bill untuk kriteria filter ini
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  staffCumulativeAnalysis.map((st, idx) => {
                    const isCritical = st.totalCount >= 5;
                    const isWarning = st.totalCount >= 3 && st.totalCount < 5;

                    return (
                      <tr 
                        key={`${st.outlet}_${st.staffName}`}
                        className={`hover:bg-white/5 transition-colors ${
                          isCritical ? 'bg-rose-950/10' : isWarning ? 'bg-amber-950/10' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black font-mono ${
                            idx === 0
                              ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                              : idx === 1
                              ? 'bg-amber-500 text-slate-900 font-black'
                              : idx === 2
                              ? 'bg-yellow-600 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 text-[10px]">
                            {st.outlet}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-black text-white uppercase text-xs flex items-center gap-1.5">
                            <i className="fas fa-user text-rose-400 text-[10px]"></i>
                            {st.staffName}
                          </div>
                          {st.role && (
                            <div className="text-[9px] text-slate-400 font-medium">{st.role}</div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-xs font-mono border ${
                            isCritical
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse-subtle'
                              : isWarning
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-800 text-slate-300 border-white/10'
                          }`}>
                            <i className="fas fa-triangle-exclamation text-[9px]"></i>
                            {st.totalCount} Kali
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-mono font-black text-rose-400 text-sm">
                            Rp {formatIDR(st.totalAmount)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-mono text-slate-300 text-xs">
                            Rp {formatIDR(st.avgAmount)}
                          </span>
                        </td>
                        <td className="p-3 max-w-sm">
                          <div className="text-[10px] text-slate-300 font-medium">
                            {st.topReasonsStr || '-'}
                          </div>
                          <div className="text-[8px] text-slate-500 mt-0.5">
                            Terakhir: {st.lastDate}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] text-indigo-300 font-bold">
                            {st.picsStr || '-'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isCritical ? (
                            <span className="inline-block bg-rose-500 text-white font-black text-[8px] uppercase tracking-wider px-2 py-0.5 rounded shadow">
                              KRITIS / PERLU SP
                            </span>
                          ) : isWarning ? (
                            <span className="inline-block bg-amber-500/20 text-amber-300 font-black text-[8px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/30">
                              PERINGATAN
                            </span>
                          ) : (
                            <span className="inline-block bg-slate-800 text-slate-400 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                              MONITORING
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: REKAPAN PER OUTLET */}
      {activeTab === 'OUTLET_SUMMARY' && (
        <div className="glass-card bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
            <div className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <i className="fas fa-store text-amber-400"></i>
              Perbandingan Akumulasi Void Bill Antar Outlet ({monthName} {selectedYear})
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="p-3 text-center w-12">No</th>
                  <th className="p-3">Nama Outlet</th>
                  <th className="p-3 text-center">Total Transaksi Kesalahan</th>
                  <th className="p-3 text-right">Total Nominal Void</th>
                  <th className="p-3 text-center">Jumlah Staff Terlibat</th>
                  <th className="p-3">Staff Paling Sering Melakukan Void</th>
                  <th className="p-3 text-center">Aksi Filter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {outletSummary.map((out, idx) => (
                  <tr key={out.outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center text-slate-500 font-mono text-[10px]">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white text-xs">
                      {out.outlet}
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-mono font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-xs">
                        {out.totalCount} Kali
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono font-black text-rose-400 text-sm">
                        Rp {formatIDR(out.totalAmount)}
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-300">
                      {out.uniqueStaff.size} Orang
                    </td>
                    <td className="p-3">
                      {out.topStaffName !== '-' ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white uppercase text-xs">
                            {out.topStaffName}
                          </span>
                          <span className="bg-rose-500/20 text-rose-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-rose-500/30">
                            {out.topStaffCount}x
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Nihil</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setFilterOutlet(out.outlet);
                          setActiveTab('TRANSACTIONS');
                        }}
                        className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-[10px] font-bold border border-indigo-500/30 cursor-pointer transition-all"
                      >
                        Lihat Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: SEMUA TRANSAKSI DETAIL */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="glass-card bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
            <div className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <i className="fas fa-list text-rose-400"></i>
              Daftar Semua Transaksi Void Bill Regional (Read-Only)
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              Total {filteredVoidBills.length} data
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="p-3 text-center w-12">No</th>
                  <th className="p-3">Tanggal &amp; Shift</th>
                  <th className="p-3">Outlet</th>
                  <th className="p-3">Bill / Meja</th>
                  <th className="p-3">Nama Staff</th>
                  <th className="p-3 text-right">Nominal Amount</th>
                  <th className="p-3">Alasan Pembatalan</th>
                  <th className="p-3">PIC Penanggung Jawab</th>
                  <th className="p-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredVoidBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      Tidak ada transaksi void bill yang sesuai dengan filter
                    </td>
                  </tr>
                ) : (
                  filteredVoidBills.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-center text-slate-500 font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        <div className="font-bold text-white">{item.date}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          {item.shift || 'LUNCH'}
                        </div>
                      </td>
                      <td className="p-3 font-bold text-indigo-300 text-[11px]">
                        {item.outlet}
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-amber-300 text-[11px]">
                          {item.billNumber ? `#${item.billNumber}` : '-'}
                        </div>
                        {item.tableNumber && (
                          <div className="text-[9px] text-slate-400">Meja: {item.tableNumber}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-black text-white uppercase text-[11px] flex items-center gap-1.5">
                          <i className="fas fa-user text-rose-400 text-[10px]"></i>
                          {item.staffName}
                        </div>
                        {(item.staffRole || item.staffDivision) && (
                          <div className="text-[9px] text-slate-400 font-medium">
                            {item.staffRole} {item.staffDivision ? `• ${item.staffDivision}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono font-black text-rose-400 text-sm">
                          Rp {formatIDR(item.amount)}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs">
                        <span className="inline-block bg-slate-800/80 text-rose-200 px-2 py-0.5 rounded-lg border border-rose-500/20 text-[10px] font-bold">
                          {item.reason}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-indigo-300 flex items-center gap-1.5 text-[11px]">
                          <i className="fas fa-shield-halved text-indigo-400 text-[10px]"></i>
                          {item.pic}
                        </div>
                        {item.picRole && (
                          <div className="text-[9px] text-slate-500">{item.picRole}</div>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 text-[10px] italic max-w-xs truncate" title={item.notes}>
                        {item.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalVoidBillRecapTable;
