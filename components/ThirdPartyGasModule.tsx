import React, { useState, useMemo, useEffect } from 'react';
import { AppState, LedgerItem, Outlet } from '../types';
import { OUTLETS } from '../constants';
import BelanjaFullTanggalRecapTable, { RecapColumnDef, DayDetailItem } from './BelanjaFullTanggalRecapTable';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';

interface Props {
  data: AppState;
  filters: { month: string; startDate?: string; endDate?: string; outlet?: string; year?: string };
  selectedOutlet?: string;
  onUpdate?: (path: keyof AppState, newValue: any) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
  allMonthlyData?: Record<string, any>;
  isRegionalView?: boolean;
}

type CategoryType = 'THIRD_PARTY' | 'GAS';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const ThirdPartyGasModule: React.FC<Props> = ({
  data,
  filters,
  selectedOutlet = '',
  onUpdate,
  showToast,
  allMonthlyData,
  isRegionalView = false,
}) => {
  const getInitialYear = () => {
    if (filters?.startDate) return parseInt(filters.startDate.substring(0, 4), 10);
    if (filters?.year) return parseInt(filters.year, 10);
    return new Date().getFullYear();
  };

  const currentMonthIdx = filters?.month ? parseInt(filters.month, 10) : new Date().getMonth();
  const currentYear = getInitialYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const m = parseInt(filters?.month ?? '0', 10);
    return isNaN(m) ? new Date().getMonth() : m;
  });

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Outlet handling: In outlet dashboard, STRICTLY lock to this outlet
  const defaultOutlet = isRegionalView 
    ? (selectedOutlet || 'ALL')
    : (selectedOutlet || filters?.outlet || data?.outlet || 'SH THE BARN');

  const [activeOutlet, setActiveOutlet] = useState<string>(defaultOutlet);

  useEffect(() => {
    if (selectedOutlet) {
      setActiveOutlet(selectedOutlet);
    }
  }, [selectedOutlet]);

  // Target outlets list:
  // IF NOT regional view (i.e. every outlet dashboard), targetOutlets MUST STRICTLY contain ONLY this outlet!
  const targetOutlets = useMemo(() => {
    if (!isRegionalView) {
      return [activeOutlet as Outlet];
    }
    return (activeOutlet === 'ALL' || !activeOutlet) ? OUTLETS : [activeOutlet as Outlet];
  }, [isRegionalView, activeOutlet]);

  // State resolver for each outlet and month
  const getOutletMonthState = (outletName: string, mIdx = selectedMonth, yNum = selectedYear): AppState => {
    // 1. If viewing the current live outlet in the current active month, use live data prop
    if (!isRegionalView && (outletName === activeOutlet || outletName === selectedOutlet)) {
      if (mIdx === currentMonthIdx && yNum === currentYear) {
        return data;
      }
    }
    if (isRegionalView && selectedOutlet && selectedOutlet !== 'ALL' && outletName === selectedOutlet) {
      if (mIdx === currentMonthIdx && yNum === currentYear) {
        return data;
      }
    }

    // 2. Resolve from allMonthlyData
    if (allMonthlyData) {
      // Format A: allMonthlyData has outlet key (allOutletsData in Regional Manager)
      if (allMonthlyData[outletName] && allMonthlyData[outletName][String(mIdx)]) {
        return allMonthlyData[outletName][String(mIdx)];
      }
      // Format B: allMonthlyData is outletMonthlyData for THIS outlet in dashboard (keyed by month index)
      if (!isRegionalView && allMonthlyData[String(mIdx)]) {
        return allMonthlyData[String(mIdx)];
      }
    }

    return data;
  };

  // Aggregate monthly states
  // IN OUTLET DASHBOARD: Contains ONLY 1 state, corresponding strictly to activeOutlet!
  const monthlyStates = useMemo(() => {
    return targetOutlets.map(o => getOutletMonthState(o, selectedMonth, selectedYear)).filter(Boolean);
  }, [targetOutlets, selectedMonth, selectedYear, data, allMonthlyData, isRegionalView]);

  // Active state for input and daily display
  const currentOutletState = useMemo(() => {
    return getOutletMonthState(activeOutlet, selectedMonth, selectedYear);
  }, [activeOutlet, selectedMonth, selectedYear, data, allMonthlyData, isRegionalView]);

  // Input states
  const [activeCategory, setActiveCategory] = useState<CategoryType>('THIRD_PARTY');
  const [inputDate, setInputDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Requested fields:
  // - NAMA ITEM
  // - QTY
  // - HARGA
  // - KETERANGAN
  const [namaItem, setNamaItem] = useState<string>('');
  const [qty, setQty] = useState<number | ''>('');
  const [harga, setHarga] = useState<number | ''>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [pic, setPic] = useState<string>('');

  // Active view tab
  const [activeTab, setActiveTab] = useState<'INPUT_RECAP' | 'FULL_TABLE'>('FULL_TABLE');

  // Subtotal live calculation
  const subtotal = useMemo(() => {
    const q = Number(qty) || 0;
    const h = Number(harga) || 0;
    return q * h;
  }, [qty, harga]);

  // Current outlet items for inputDate (strictly from this outlet's state)
  const currentDayItems = useMemo(() => {
    const tpList = (currentOutletState.dailyThirdPartyLedger?.[inputDate] || []) as LedgerItem[];
    const gasList = (currentOutletState.dailyGasLedger?.[inputDate] || []) as LedgerItem[];

    const combined: Array<LedgerItem & { categoryType: CategoryType }> = [
      ...tpList.map(it => ({ ...it, categoryType: 'THIRD_PARTY' as CategoryType })),
      ...gasList.map(it => ({ ...it, categoryType: 'GAS' as CategoryType }))
    ];

    if (!isRegionalView && activeOutlet) {
      return combined.filter(it => !it.outlet || it.outlet === activeOutlet);
    }

    return combined;
  }, [currentOutletState, inputDate, isRegionalView, activeOutlet]);

  // MTD Totals
  const mtdStats = useMemo(() => {
    let mtdRevenue = 0;
    let mtdThirdParty = 0;
    let mtdGas = 0;

    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;

      for (const st of monthlyStates) {
        // Revenue
        if (st.sales?.dailyRecording?.[dateStr]?.revenue) {
          mtdRevenue += Number(st.sales.dailyRecording[dateStr].revenue) || 0;
        }

        // Third Party
        const tpItems = (st.dailyThirdPartyLedger?.[dateStr] || []) as LedgerItem[];
        let tpSum = tpItems.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        if (tpSum === 0 && st.expenses?.[dateStr]?.thirdParty) {
          tpSum = Number(st.expenses[dateStr].thirdParty) || 0;
        }
        mtdThirdParty += tpSum;

        // Gas
        const gasItems = (st.dailyGasLedger?.[dateStr] || []) as LedgerItem[];
        let gasSum = gasItems.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        if (gasSum === 0 && (st.expenses?.[dateStr] as any)?.gas) {
          gasSum = Number((st.expenses[dateStr] as any).gas) || 0;
        }
        mtdGas += gasSum;
      }
    }

    const mtdTotal = mtdThirdParty + mtdGas;
    const pct = mtdRevenue > 0 ? (mtdTotal / mtdRevenue) * 100 : 0;

    return {
      mtdRevenue,
      mtdThirdParty,
      mtdGas,
      mtdTotal,
      pct
    };
  }, [selectedYear, selectedMonth, monthlyStates]);

  // Save / Add Item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();

    if (!namaItem.trim()) {
      showToast?.('Mohon isi Nama Item', 'error');
      return;
    }
    const q = Number(qty);
    const p = Number(harga);

    if (isNaN(q) || q <= 0) {
      showToast?.('Jumlah Qty harus lebih dari 0', 'error');
      return;
    }
    if (isNaN(p) || p < 0) {
      showToast?.('Harga Satuan tidak valid', 'error');
      return;
    }

    const newItem: LedgerItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: namaItem.trim(),
      qty: q,
      price: p,
      reason: keterangan.trim(),
      pic: pic.trim(),
      category: activeCategory,
      outlet: activeOutlet as Outlet,
    };

    if (activeCategory === 'THIRD_PARTY') {
      const prevItems = currentOutletState.dailyThirdPartyLedger?.[inputDate] || [];
      const updatedList = [...prevItems, newItem];
      const updatedLedger = {
        ...(currentOutletState.dailyThirdPartyLedger || {}),
        [inputDate]: updatedList
      };

      // Also update expenses[inputDate].thirdParty
      const totalDayThirdParty = updatedList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
      const updatedExpenses = {
        ...(currentOutletState.expenses || {}),
        [inputDate]: {
          ...(currentOutletState.expenses?.[inputDate] || {}),
          thirdParty: totalDayThirdParty
        }
      };

      onUpdate?.('dailyThirdPartyLedger', updatedLedger);
      onUpdate?.('expenses', updatedExpenses);
      showToast?.(`Item Third Party "${namaItem}" berhasil disimpan untuk ${activeOutlet}!`, 'success');
    } else {
      const prevItems = currentOutletState.dailyGasLedger?.[inputDate] || [];
      const updatedList = [...prevItems, newItem];
      const updatedLedger = {
        ...(currentOutletState.dailyGasLedger || {}),
        [inputDate]: updatedList
      };

      // Also update expenses[inputDate].gas
      const totalDayGas = updatedList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
      const updatedExpenses = {
        ...(currentOutletState.expenses || {}),
        [inputDate]: {
          ...(currentOutletState.expenses?.[inputDate] || {}),
          gas: totalDayGas
        }
      };

      onUpdate?.('dailyGasLedger', updatedLedger);
      onUpdate?.('expenses', updatedExpenses);
      showToast?.(`Item Gas "${namaItem}" berhasil disimpan untuk ${activeOutlet}!`, 'success');
    }

    // Reset fields
    setNamaItem('');
    setQty('');
    setHarga('');
    setKeterangan('');
    setPic('');
  };

  // Delete item
  const handleDeleteItem = (itemId: string, catType: CategoryType) => {
    if (confirm('Yakin ingin menghapus item ini?')) {
      if (catType === 'THIRD_PARTY') {
        const prevItems = currentOutletState.dailyThirdPartyLedger?.[inputDate] || [];
        const updatedList = prevItems.filter(it => it.id !== itemId);
        const updatedLedger = {
          ...(currentOutletState.dailyThirdPartyLedger || {}),
          [inputDate]: updatedList
        };
        const totalDayThirdParty = updatedList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        const updatedExpenses = {
          ...(currentOutletState.expenses || {}),
          [inputDate]: {
            ...(currentOutletState.expenses?.[inputDate] || {}),
            thirdParty: totalDayThirdParty
          }
        };
        onUpdate?.({
          dailyThirdPartyLedger: updatedLedger,
          expenses: updatedExpenses
        }, undefined, true);
        showToast?.('Item Third Party berhasil dihapus', 'success');
      } else {
        const prevItems = currentOutletState.dailyGasLedger?.[inputDate] || [];
        const updatedList = prevItems.filter(it => it.id !== itemId);
        const updatedLedger = {
          ...(currentOutletState.dailyGasLedger || {}),
          [inputDate]: updatedList
        };
        const totalDayGas = updatedList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        const updatedExpenses = {
          ...(currentOutletState.expenses || {}),
          [inputDate]: {
            ...(currentOutletState.expenses?.[inputDate] || {}),
            gas: totalDayGas
          }
        };
        onUpdate?.({
          dailyGasLedger: updatedLedger,
          expenses: updatedExpenses
        }, undefined, true);
        showToast?.('Item Gas berhasil dihapus', 'success');
      }
    }
  };

  // Columns definition for the full tanggal table
  const recapColumns: RecapColumnDef[] = useMemo(() => [
    {
      id: 'thirdParty',
      label: 'Third Party / Jasa',
      shortLabel: 'THIRD PARTY',
      getValue: (st, dStr) => {
        const list = (st.dailyThirdPartyLedger?.[dStr] || []) as LedgerItem[];
        const filteredList = (!isRegionalView && activeOutlet)
          ? list.filter(it => !it.outlet || it.outlet === activeOutlet)
          : list;
        const sum = filteredList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        if (sum === 0 && st.expenses?.[dStr]?.thirdParty) {
          if (!isRegionalView && st.outlet && st.outlet !== activeOutlet) return 0;
          return Number(st.expenses[dStr].thirdParty) || 0;
        }
        return sum;
      }
    },
    {
      id: 'gas',
      label: 'Gas Operasional / LPG',
      shortLabel: 'GAS LPG',
      getValue: (st, dStr) => {
        const list = (st.dailyGasLedger?.[dStr] || []) as LedgerItem[];
        const filteredList = (!isRegionalView && activeOutlet)
          ? list.filter(it => !it.outlet || it.outlet === activeOutlet)
          : list;
        const sum = filteredList.reduce((acc, it) => acc + (Number(it.price || 0) * (Number(it.qty) || 1)), 0);
        if (sum === 0 && (st.expenses?.[dStr] as any)?.gas) {
          if (!isRegionalView && st.outlet && st.outlet !== activeOutlet) return 0;
          return Number((st.expenses[dStr] as any).gas) || 0;
        }
        return sum;
      }
    }
  ], [isRegionalView, activeOutlet]);

  // Detail items callback for day popup in full tanggal table
  const getDetailItemsForDay = (dateStr: string, states: AppState[]): DayDetailItem[] => {
    const list: DayDetailItem[] = [];

    states.forEach((st, idx) => {
      const outletName = (!isRegionalView ? activeOutlet : (targetOutlets[idx] || (st as any).outlet || activeOutlet));

      // Third Party items
      const tp = (st.dailyThirdPartyLedger?.[dateStr] || []) as LedgerItem[];
      tp.forEach(it => {
        if (!isRegionalView && it.outlet && it.outlet !== activeOutlet) return;
        list.push({
          id: it.id,
          outlet: it.outlet || outletName,
          category: 'Third Party',
          name: it.name,
          qty: it.qty,
          price: it.price,
          subtotal: (it.qty || 1) * (it.price || 0),
          reason: it.reason,
          pic: it.pic
        });
      });

      // Gas items
      const gas = (st.dailyGasLedger?.[dateStr] || []) as LedgerItem[];
      gas.forEach(it => {
        if (!isRegionalView && it.outlet && it.outlet !== activeOutlet) return;
        list.push({
          id: it.id,
          outlet: it.outlet || outletName,
          category: 'Gas LPG',
          name: it.name,
          qty: it.qty,
          price: it.price,
          subtotal: (it.qty || 1) * (it.price || 0),
          reason: it.reason,
          pic: it.pic
        });
      });
    });

    return list;
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 p-6 rounded-3xl border border-white/10 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shadow-inner border border-amber-500/30">
              <i className="fas fa-gas-pump"></i>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2 flex-wrap">
                Third Party & Gas
                {isRegionalView ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase tracking-wider border border-cyan-500/30">
                    Regional View
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-500/30 flex items-center gap-1.5">
                    <i className="fas fa-store text-[9px]"></i>
                    Outlet: {activeOutlet}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {isRegionalView 
                  ? 'Konsolidasi Regional Rekapan Harian Belanja Third Party dan Gas LPG Operasional'
                  : `Penginputan & Rekapan Belanja Third Party dan Gas LPG - Khusus Outlet ${activeOutlet}`}
              </p>
            </div>
          </div>
        </div>

        {/* Month, Year & Outlet pickers */}
        <div className="flex flex-wrap items-center gap-3">
          {isRegionalView && (
            <select
              value={activeOutlet}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="bg-slate-950 text-amber-300 text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">SEMUA OUTLET (REGIONAL)</option>
              {OUTLETS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500"
          >
            {MONTH_NAMES.map((m, idx) => (
              <option key={m} value={idx}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* View Tab Buttons */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('FULL_TABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                activeTab === 'FULL_TABLE'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-days mr-1.5"></i>
              Tabel Rekap Harian
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INPUT_RECAP')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                activeTab === 'INPUT_RECAP'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-plus-circle mr-1.5"></i>
              Form Penginputan
            </button>
          </div>
        </div>
      </div>

      {/* Top Stat Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Third Party Card */}
        <div className="glass-card bg-slate-900/80 p-5 rounded-2xl border border-indigo-500/20 shadow-lg space-y-1">
          <div className="flex justify-between items-center text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <span>Third Party / Jasa</span>
            <i className="fas fa-handshake"></i>
          </div>
          <div className="text-lg md:text-xl font-mono font-black text-white">
            Rp {mtdStats.mtdThirdParty.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400">
            Vendor, perbaikan, jasa pihak ketiga MTD
          </div>
        </div>

        {/* Gas Card */}
        <div className="glass-card bg-slate-900/80 p-5 rounded-2xl border border-amber-500/20 shadow-lg space-y-1">
          <div className="flex justify-between items-center text-amber-400 text-xs font-bold uppercase tracking-wider">
            <span>Gas LPG Operasional</span>
            <i className="fas fa-fire-burner"></i>
          </div>
          <div className="text-lg md:text-xl font-mono font-black text-white">
            Rp {mtdStats.mtdGas.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400">
            Tabung 50kg, 12kg & gas dapur MTD
          </div>
        </div>

        {/* Total Gabungan */}
        <div className="glass-card bg-slate-900/80 p-5 rounded-2xl border border-white/10 shadow-lg space-y-1">
          <div className="flex justify-between items-center text-rose-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Third Party & Gas</span>
            <i className="fas fa-calculator"></i>
          </div>
          <div className="text-lg md:text-xl font-mono font-black text-rose-300">
            Rp {mtdStats.mtdTotal.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400">
            Total biaya penyerapan MTD
          </div>
        </div>

        {/* Rasio Revenue */}
        <div className="glass-card bg-slate-900/80 p-5 rounded-2xl border border-white/10 shadow-lg space-y-1">
          <div className="flex justify-between items-center text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <span>Rasio Terhadap Rev</span>
            <i className="fas fa-percent"></i>
          </div>
          <div className="text-lg md:text-xl font-mono font-black text-emerald-300">
            {mtdStats.pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-400">
            Dari Rev: Rp {mtdStats.mtdRevenue.toLocaleString('id-ID')}
          </div>
        </div>
      </div>

      {/* VIEW 1: FULL TANGGAL RECAP TABLE (Prominent, Always accessible) */}
      {activeTab === 'FULL_TABLE' && (
        <BelanjaFullTanggalRecapTable
          title={isRegionalView ? "Tabel Rekap Harian Third Party & Gas (Regional)" : `Tabel Rekap Harian Third Party & Gas - ${activeOutlet}`}
          subtitle={isRegionalView 
            ? `Konsolidasi seluruh outlet tanggal 1 sampai akhir bulan (${MONTH_NAMES[selectedMonth]} ${selectedYear})`
            : `Rekapan penyerapan harian khusus ${activeOutlet} tanggal 1 sampai akhir bulan (${MONTH_NAMES[selectedMonth]} ${selectedYear})`
          }
          icon="fa-gas-pump"
          themeColor="amber"
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedOutlet={activeOutlet}
          isRegionalView={isRegionalView}
          monthlyStates={monthlyStates}
          columns={recapColumns}
          getDetailItemsForDay={getDetailItemsForDay}
        />
      )}

      {/* VIEW 2: FORM PENGINPUTAN */}
      {activeTab === 'INPUT_RECAP' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Form */}
          <div className="lg:col-span-5 glass-card bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fas fa-edit text-amber-400"></i> Form Penginputan Belanja
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pilih kategori pengeluaran dan lengkapi detail transaksi item
              </p>
            </div>

            {/* KATEGORI SELECTION BUTTONS: THIRD PARTY & GAS */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Pilih Kategori:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveCategory('THIRD_PARTY')}
                  className={`p-3.5 rounded-2xl flex items-center justify-center gap-2.5 font-black text-xs uppercase tracking-wider transition-all border cursor-pointer ${
                    activeCategory === 'THIRD_PARTY'
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-950/50 scale-[1.02]'
                      : 'bg-slate-950 text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <i className="fas fa-handshake text-sm"></i>
                  Third Party
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategory('GAS')}
                  className={`p-3.5 rounded-2xl flex items-center justify-center gap-2.5 font-black text-xs uppercase tracking-wider transition-all border cursor-pointer ${
                    activeCategory === 'GAS'
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-950/50 scale-[1.02]'
                      : 'bg-slate-950 text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <i className="fas fa-fire-burner text-sm"></i>
                  Gas LPG
                </button>
              </div>
            </div>

            {/* FORM INPUT FIELDS */}
            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Tanggal Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-300 tracking-wider">
                  Tanggal Transaksi:
                </label>
                <input
                  type="date"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white font-bold outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* 1. NAMA ITEM */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-tag"></i> 1. Nama Item: *
                </label>
                <input
                  type="text"
                  placeholder={activeCategory === 'GAS' ? 'Contoh: Tabung Gas LPG 50kg, Gas 12kg...' : 'Contoh: Jasa Service AC, Sewa Sound System, Pest Control...'}
                  value={namaItem}
                  onChange={(e) => setNamaItem(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white font-bold outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                  required
                />
              </div>

              {/* 2. QTY & 3. HARGA */}
              <div className="grid grid-cols-2 gap-3">
                {/* 2. QTY */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-cubes"></i> 2. Qty: *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-mono font-bold text-white outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                    required
                  />
                </div>

                {/* 3. HARGA */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-money-bill-wave"></i> 3. Harga Satuan (Rp): *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={harga}
                    onChange={(e) => setHarga(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-mono font-bold text-white outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* LIVE SUBTOTAL DISPLAY */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex justify-between items-center">
                <span className="text-xs font-bold text-amber-300 uppercase">Subtotal Otomatis:</span>
                <span className="text-sm font-mono font-black text-amber-400">
                  Rp {subtotal.toLocaleString('id-ID')}
                </span>
              </div>

              {/* 4. KETERANGAN */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-comment-alt"></i> 4. Keterangan / Keperluan:
                </label>
                <input
                  type="text"
                  placeholder="Keterangan peruntukan, nomor nota, atau catatan..."
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white font-medium outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* PIC */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-user"></i> PIC / Petugas:
                </label>
                <input
                  type="text"
                  placeholder="Nama petugas / staff penerima..."
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white font-medium outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider hover:opacity-95 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <i className="fas fa-plus"></i>
                Tambah Transaksi {activeCategory === 'THIRD_PARTY' ? 'Third Party' : 'Gas'}
              </button>
            </form>

            <FeatureSubmitSyncButton
              featureName="Third Party & Gas"
              subtext={`Klik setelah selesai input transaksi tanggal ${inputDate} agar data langsung tersinkronkan ke seluruh user.`}
              className="mt-4"
            />
          </div>

          {/* Right: Daily Items Table for inputDate */}
          <div className="lg:col-span-7 glass-card bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-list text-amber-400"></i>
                    Daftar Transaksi Tanggal: {inputDate}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Item belanja Third Party dan Gas yang tercatat pada hari ini
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-white/5 text-amber-300 text-xs font-mono font-bold border border-white/5">
                  {currentDayItems.length} Item
                </span>
              </div>

              <div className="overflow-x-auto custom-scrollbar border border-white/5 rounded-2xl bg-slate-950/60 max-h-[420px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-900/80 text-[10px] font-black text-slate-400 uppercase">
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3">Kategori</th>
                      <th className="p-3">Nama Item</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Harga</th>
                      <th className="p-3 text-right">Subtotal</th>
                      <th className="p-3">Keterangan</th>
                      <th className="p-3 text-center w-12">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {currentDayItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                          Belum ada item transaksi tercatat pada tanggal {inputDate}
                        </td>
                      </tr>
                    ) : (
                      currentDayItems.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-white/5">
                          <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              it.categoryType === 'THIRD_PARTY'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {it.categoryType === 'THIRD_PARTY' ? 'Third Party' : 'Gas'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-white">{it.name}</td>
                          <td className="p-3 text-center font-mono">{it.qty}</td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            Rp {Number(it.price || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-amber-400">
                            Rp {(Number(it.qty || 1) * Number(it.price || 0)).toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-slate-400 text-[11px] max-w-[150px] truncate" title={it.reason}>
                            {it.reason || '-'}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(it.id, it.categoryType)}
                              className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 hover:text-rose-200 flex items-center justify-center transition-all mx-auto cursor-pointer"
                              title="Hapus item"
                            >
                              <i className="fas fa-trash-alt text-xs"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Footer for inputDate */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-slate-300 tracking-wider">
                Total Belanja Hari Ini ({inputDate}):
              </span>
              <span className="text-base font-mono font-black text-amber-400">
                Rp {currentDayItems.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThirdPartyGasModule;
