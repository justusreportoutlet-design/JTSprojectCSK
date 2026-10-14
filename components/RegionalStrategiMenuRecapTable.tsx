import React, { useState, useMemo, useEffect } from 'react';
import { getStoredStrategyCatalog, DEFAULT_STRATEGY_MENU_CATALOG, getActiveOutletNames, getAreaForOutlet, MONTHS } from '../constants';
import { StrategyMenuItem } from '../types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface Props {
  allOutletsData: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RegionalStrategiMenuRecapTable: React.FC<Props> = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [catalog, setCatalog] = useState<StrategyMenuItem[]>(() => getStoredStrategyCatalog());
  const [searchOutlet, setSearchOutlet] = useState('');
  const [filterShift, setFilterShift] = useState<'ALL' | 'LUNCH' | 'DINNER'>('ALL');

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTHS[selectedMonth];

  // Listen to strategy catalog updates
  useEffect(() => {
    const handleCatalogEvent = (e: any) => {
      if (Array.isArray(e?.detail)) setCatalog(e.detail);
    };
    window.addEventListener('appStrategyCatalogChanged', handleCatalogEvent);

    const catRef = doc(db, 'system_config', 'strategy_catalog');
    const unsub = onSnapshot(catRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (Array.isArray(d.items) && d.items.length > 0) {
          setCatalog(d.items);
        }
      }
    }, () => {});

    return () => {
      window.removeEventListener('appStrategyCatalogChanged', handleCatalogEvent);
      unsub();
    };
  }, []);

  // Filter outlets by area and search
  const targetOutlets = useMemo(() => {
    let list = getActiveOutletNames();
    if (selectedArea && selectedArea !== 'ALL') {
      list = list.filter(o => getAreaForOutlet(o) === selectedArea);
    }
    if (selectedOutlet) {
      list = list.filter(o => o === selectedOutlet);
    }
    if (searchOutlet.trim()) {
      list = list.filter(o => o.toLowerCase().includes(searchOutlet.toLowerCase()));
    }
    return list;
  }, [selectedArea, selectedOutlet, searchOutlet]);

  // Aggregate strategy performance per outlet
  const outletSummaries = useMemo(() => {
    return targetOutlets.map(outletName => {
      const outletRoot = allOutletsData?.[outletName] || {};
      const mData = outletRoot[String(selectedMonth)] || outletRoot[selectedMonth] || {};
      const dailyStrategy = mData.dailyStrategy || outletRoot.dailyStrategy || {};
      const dailyRecording = mData.dailyRecording || outletRoot.dailyRecording || mData.sales?.dailyRecording || outletRoot.sales?.dailyRecording || {};

      let tgtPenLunch = 0;
      let tgtPerLunch = 0;
      let tgtPenDinner = 0;
      let tgtPerDinner = 0;

      let actPenLunch = 0;
      let actPerLunch = 0;
      let actPenDinner = 0;
      let actPerDinner = 0;

      let daysCount = 0;

      Object.entries(dailyStrategy).forEach(([dateStr, rec]: [string, any]) => {
        if (!dateStr.startsWith(monthStr)) return;
        if (!rec) return;

        daysCount++;
        tgtPenLunch += Number(rec.targetPenyeimbangLunch || 0);
        tgtPerLunch += Number(rec.targetPercepatanLunch || 0);
        tgtPenDinner += Number(rec.targetPenyeimbangDinner || 0);
        tgtPerDinner += Number(rec.targetPercepatanDinner || 0);

        actPenLunch += Number(rec.actualRevenuePenyeimbangLunch || 0);
        actPerLunch += Number(rec.actualRevenuePercepatanLunch || 0);
        actPenDinner += Number(rec.actualRevenuePenyeimbangDinner || 0);
        actPerDinner += Number(rec.actualRevenuePercepatanDinner || 0);
      });

      // Total Kasir / POS from dailyRecording
      let totalKasirRev = 0;
      Object.entries(dailyRecording).forEach(([dateStr, rec]: [string, any]) => {
        if (!dateStr.startsWith(monthStr)) return;
        const l = Number(rec?.lunchRevenue) || 0;
        const d = Number(rec?.dinnerRevenue) || 0;
        const t = (l + d) > 0 ? (l + d) : (Number(rec?.revenue) || 0);
        totalKasirRev += t;
      });

      const totalTgtPen = tgtPenLunch + tgtPenDinner;
      const totalActPen = actPenLunch + actPenDinner;
      const pctPen = totalTgtPen > 0 ? (totalActPen / totalTgtPen) * 100 : totalActPen > 0 ? 100 : 0;

      const totalTgtPer = tgtPerLunch + tgtPerDinner;
      const totalActPer = actPerLunch + actPerDinner;
      const pctPer = totalTgtPer > 0 ? (totalActPer / totalTgtPer) * 100 : totalActPer > 0 ? 100 : 0;

      const totalTgtLunch = tgtPenLunch + tgtPerLunch;
      const totalActLunch = actPenLunch + actPerLunch;
      const pctLunch = totalTgtLunch > 0 ? (totalActLunch / totalTgtLunch) * 100 : 0;

      const totalTgtDinner = tgtPenDinner + tgtPerDinner;
      const totalActDinner = actPenDinner + actPerDinner;
      const pctDinner = totalTgtDinner > 0 ? (totalActDinner / totalTgtDinner) * 100 : 0;

      const grandTgt = totalTgtPen + totalTgtPer;
      const grandAct = totalActPen + totalActPer;
      const grandPct = grandTgt > 0 ? (grandAct / grandTgt) * 100 : grandAct > 0 ? 100 : 0;
      const gap = grandAct - grandTgt;

      const totalOutsideMenu = Math.max(0, totalKasirRev - grandAct);
      const menuContribPct = totalKasirRev > 0 ? (grandAct / totalKasirRev) * 100 : 0;

      return {
        outletName,
        area: getAreaForOutlet(outletName),
        daysCount,
        tgtPenLunch,
        tgtPerLunch,
        tgtPenDinner,
        tgtPerDinner,
        actPenLunch,
        actPerLunch,
        actPenDinner,
        actPerDinner,
        totalTgtPen,
        totalActPen,
        pctPen,
        totalTgtPer,
        totalActPer,
        pctPer,
        totalTgtLunch,
        totalActLunch,
        pctLunch,
        totalTgtDinner,
        totalActDinner,
        pctDinner,
        grandTgt,
        grandAct,
        grandPct,
        gap,
        totalKasirRev,
        totalOutsideMenu,
        menuContribPct
      };
    });
  }, [targetOutlets, allOutletsData, selectedMonth, monthStr]);

  // Grand Totals across all outlets
  const grandTotals = useMemo(() => {
    return outletSummaries.reduce((acc, curr) => {
      acc.tgtPenLunch += curr.tgtPenLunch;
      acc.tgtPerLunch += curr.tgtPerLunch;
      acc.tgtPenDinner += curr.tgtPenDinner;
      acc.tgtPerDinner += curr.tgtPerDinner;

      acc.actPenLunch += curr.actPenLunch;
      acc.actPerLunch += curr.actPerLunch;
      acc.actPenDinner += curr.actPenDinner;
      acc.actPerDinner += curr.actPerDinner;

      acc.totalTgtPen += curr.totalTgtPen;
      acc.totalActPen += curr.totalActPen;
      acc.totalTgtPer += curr.totalTgtPer;
      acc.totalActPer += curr.totalActPer;

      acc.totalTgtLunch += curr.totalTgtLunch;
      acc.totalActLunch += curr.totalActLunch;
      acc.totalTgtDinner += curr.totalTgtDinner;
      acc.totalActDinner += curr.totalActDinner;

      acc.grandTgt += curr.grandTgt;
      acc.grandAct += curr.grandAct;
      acc.totalKasirRev += curr.totalKasirRev;
      acc.totalOutsideMenu += curr.totalOutsideMenu;

      if (curr.daysCount > 0) acc.activeOutletsCount++;
      return acc;
    }, {
      tgtPenLunch: 0, tgtPerLunch: 0, tgtPenDinner: 0, tgtPerDinner: 0,
      actPenLunch: 0, actPerLunch: 0, actPenDinner: 0, actPerDinner: 0,
      totalTgtPen: 0, totalActPen: 0, totalTgtPer: 0, totalActPer: 0,
      totalTgtLunch: 0, totalActLunch: 0, totalTgtDinner: 0, totalActDinner: 0,
      grandTgt: 0, grandAct: 0, totalKasirRev: 0, totalOutsideMenu: 0, activeOutletsCount: 0
    });
  }, [outletSummaries]);

  const grandPctPen = grandTotals.totalTgtPen > 0 ? (grandTotals.totalActPen / grandTotals.totalTgtPen) * 100 : 0;
  const grandPctPer = grandTotals.totalTgtPer > 0 ? (grandTotals.totalActPer / grandTotals.totalTgtPer) * 100 : 0;
  const grandPctAll = grandTotals.grandTgt > 0 ? (grandTotals.grandAct / grandTotals.grandTgt) * 100 : 0;
  const grandMenuContribPct = grandTotals.totalKasirRev > 0 ? (grandTotals.grandAct / grandTotals.totalKasirRev) * 100 : 0;

  // Aggregate menu catalog performance across outlets
  const menuCatalogPerformance = useMemo(() => {
    const itemMap = new Map<string, {
      item: StrategyMenuItem;
      qtyLunch: number;
      qtyDinner: number;
      totalQty: number;
      revLunch: number;
      revDinner: number;
      totalRev: number;
      outletsServing: Set<string>;
    }>();

    catalog.forEach(item => {
      itemMap.set(item.id, {
        item,
        qtyLunch: 0,
        qtyDinner: 0,
        totalQty: 0,
        revLunch: 0,
        revDinner: 0,
        totalRev: 0,
        outletsServing: new Set()
      });
    });

    targetOutlets.forEach(outletName => {
      const outletRoot = allOutletsData?.[outletName] || {};
      const mData = outletRoot[String(selectedMonth)] || outletRoot[selectedMonth] || {};
      const dailyStrategy = mData.dailyStrategy || outletRoot.dailyStrategy || {};

      Object.entries(dailyStrategy).forEach(([dateStr, rec]: [string, any]) => {
        if (!dateStr.startsWith(monthStr)) return;
        if (!rec) return;

        // Check lunch items
        const allLunch = { ...(rec.lunchPenyeimbangItems || {}), ...(rec.lunchPercepatanItems || {}) };
        Object.entries(allLunch).forEach(([mId, it]: [string, any]) => {
          const entry = itemMap.get(mId);
          if (entry) {
            const q = Number(it.actualQty || 0);
            const r = Number(it.actualRevenue || q * entry.item.price);
            entry.qtyLunch += q;
            entry.revLunch += r;
            entry.totalQty += q;
            entry.totalRev += r;
            if (q > 0) entry.outletsServing.add(outletName);
          }
        });

        // Check dinner items
        const allDinner = { ...(rec.dinnerPenyeimbangItems || {}), ...(rec.dinnerPercepatanItems || {}) };
        Object.entries(allDinner).forEach(([mId, it]: [string, any]) => {
          const entry = itemMap.get(mId);
          if (entry) {
            const q = Number(it.actualQty || 0);
            const r = Number(it.actualRevenue || q * entry.item.price);
            entry.qtyDinner += q;
            entry.revDinner += r;
            entry.totalQty += q;
            entry.totalRev += r;
            if (q > 0) entry.outletsServing.add(outletName);
          }
        });
      });
    });

    return Array.from(itemMap.values()).sort((a, b) => b.totalRev - a.totalRev);
  }, [catalog, targetOutlets, allOutletsData, selectedMonth, monthStr]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Rekap_Strategi_${monthStr}`);

      sheet.addRow([`REKAPITULASI REGIONAL MENU STRATEGI - ${monthName.toUpperCase()} ${selectedYear}`]);
      sheet.addRow([`Area: ${selectedArea} | Total Outlet: ${targetOutlets.length}`]);
      sheet.addRow([]);

      sheet.addRow([
        'Outlet', 'Area', 'Hari Input',
        'Tgt Penyeimbang (Rp)', 'Act Penyeimbang (Rp)', '% Penyeimbang',
        'Tgt Percepatan (Rp)', 'Act Percepatan (Rp)', '% Percepatan',
        'Total Target (Rp)', 'Total Actual (Rp)', 'Selisih (Rp)', 'Pencapaian (%)',
        'Actual Kasir POS (Rp)', '% Kontribusi Menu', 'Di Luar Menu (Rp)'
      ]);

      outletSummaries.forEach(o => {
        sheet.addRow([
          o.outletName, o.area, o.daysCount,
          o.totalTgtPen, o.totalActPen, o.pctPen.toFixed(1) + '%',
          o.totalTgtPer, o.totalActPer, o.pctPer.toFixed(1) + '%',
          o.grandTgt, o.grandAct, o.gap, o.grandPct.toFixed(1) + '%',
          o.totalKasirRev, o.menuContribPct.toFixed(1) + '%', o.totalOutsideMenu
        ]);
      });

      sheet.addRow([]);
      sheet.addRow([
        'TOTAL REGIONAL', '', '',
        grandTotals.totalTgtPen, grandTotals.totalActPen, grandPctPen.toFixed(1) + '%',
        grandTotals.totalTgtPer, grandTotals.totalActPer, grandPctPer.toFixed(1) + '%',
        grandTotals.grandTgt, grandTotals.grandAct, grandTotals.grandAct - grandTotals.grandTgt, grandPctAll.toFixed(1) + '%',
        grandTotals.totalKasirRev, grandMenuContribPct.toFixed(1) + '%', grandTotals.totalOutsideMenu
      ]);

      sheet.addRow([]);
      sheet.addRow(['PERFORMA PENJUALAN MENU STRATEGI']);
      sheet.addRow(['Nama Menu', 'Kategori', 'Harga (Rp)', 'Qty Lunch', 'Qty Dinner', 'Total Qty', 'Revenue Lunch (Rp)', 'Revenue Dinner (Rp)', 'Total Revenue (Rp)', 'Outlet Menjual']);

      menuCatalogPerformance.forEach(m => {
        sheet.addRow([
          m.item.name,
          m.item.category,
          m.item.price,
          m.qtyLunch,
          m.qtyDinner,
          m.totalQty,
          m.revLunch,
          m.revDinner,
          m.totalRev,
          m.outletsServing.size
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekap_Regional_Strategi_${monthStr}.xlsx`);
      showToast?.('Berhasil mengunduh Excel Rekap Strategi!', 'success');
    } catch (e) {
      console.error(e);
      showToast?.('Gagal mengekspor Excel', 'error');
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(14);
      doc.text(`REKAPITULASI REGIONAL MENU STRATEGI - ${monthName.toUpperCase()} ${selectedYear}`, 14, 15);
      doc.setFontSize(9);
      doc.text(`Area: ${selectedArea} | Filter: ${selectedOutlet || 'Semua Outlet'}`, 14, 22);

      const tableData = outletSummaries.map(o => [
        o.outletName,
        o.area,
        `Rp ${o.totalTgtPen.toLocaleString('id-ID')}`,
        `Rp ${o.totalActPen.toLocaleString('id-ID')}`,
        `${o.pctPen.toFixed(1)}%`,
        `Rp ${o.totalTgtPer.toLocaleString('id-ID')}`,
        `Rp ${o.totalActPer.toLocaleString('id-ID')}`,
        `${o.pctPer.toFixed(1)}%`,
        `Rp ${o.grandTgt.toLocaleString('id-ID')}`,
        `Rp ${o.grandAct.toLocaleString('id-ID')}`,
        `${o.grandPct.toFixed(1)}%`,
        `Rp ${o.totalKasirRev.toLocaleString('id-ID')}`,
        `${o.menuContribPct.toFixed(1)}%`,
        `Rp ${o.totalOutsideMenu.toLocaleString('id-ID')}`
      ]);

      autoTable(doc, {
        head: [['Outlet', 'Area', 'Tgt Pen', 'Act Pen', '% Pen', 'Tgt Per', 'Act Per', '% Per', 'Grand Target', 'Grand Actual', '% Capai', 'Kasir POS', '% Menu', 'Di Luar Menu']],
        body: tableData,
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [88, 28, 135] },
        styles: { fontSize: 7 }
      });

      doc.save(`Rekap_Regional_Strategi_${monthStr}.pdf`);
      showToast?.('Berhasil mengunduh PDF Rekap Strategi!', 'success');
    } catch (e) {
      console.error(e);
      showToast?.('Gagal mengekspor PDF', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* TOP HEADER CONTROLS */}
      <div className="bg-slate-950/60 p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
              REGIONAL STRATEGY MONITORING
            </span>
            <h3 className="text-lg font-black text-white uppercase tracking-tight">
              Rekapan Menu Penyeimbang & Percepatan
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Konsolidasi pencapaian target revenue menu strategi seluruh outlet ({monthName} {selectedYear})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="relative min-w-[180px]">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              value={searchOutlet}
              onChange={(e) => setSearchOutlet(e.target.value)}
              placeholder="Cari outlet..."
              className="w-full bg-slate-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-white font-bold text-xs outline-none focus:border-purple-400"
            />
          </div>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <i className="fas fa-file-excel text-xs"></i>
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <i className="fas fa-file-pdf text-xs"></i>
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* REGIONAL KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Penyeimbang Card */}
        <div className="glass-card bg-slate-900 border-white/10 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Total Penyeimbang</span>
              <h4 className="text-xl font-black text-white mt-1">
                Rp {grandTotals.totalActPen.toLocaleString('id-ID')}
              </h4>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${grandPctPen >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'}`}>
              {grandPctPen.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-bold border-t border-white/5 pt-2">
            <span>Target: Rp {grandTotals.totalTgtPen.toLocaleString('id-ID')}</span>
            <span className={grandTotals.totalActPen >= grandTotals.totalTgtPen ? 'text-emerald-400' : 'text-slate-400'}>
              Gap: Rp {(grandTotals.totalActPen - grandTotals.totalTgtPen).toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Total Percepatan Card */}
        <div className="glass-card bg-slate-900 border-white/10 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Total Percepatan</span>
              <h4 className="text-xl font-black text-white mt-1">
                Rp {grandTotals.totalActPer.toLocaleString('id-ID')}
              </h4>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${grandPctPer >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
              {grandPctPer.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-bold border-t border-white/5 pt-2">
            <span>Target: Rp {grandTotals.totalTgtPer.toLocaleString('id-ID')}</span>
            <span className={grandTotals.totalActPer >= grandTotals.totalTgtPer ? 'text-emerald-400' : 'text-slate-400'}>
              Gap: Rp {(grandTotals.totalActPer - grandTotals.totalTgtPer).toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Shift Breakdown Card */}
        <div className="glass-card bg-slate-900 border-white/10 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Lunch vs Dinner</span>
              <div className="text-xs text-white font-bold mt-1 space-y-0.5">
                <div>Lunch: <span className="font-mono text-amber-300 font-black">Rp {grandTotals.totalActLunch.toLocaleString('id-ID')}</span></div>
                <div>Dinner: <span className="font-mono text-indigo-300 font-black">Rp {grandTotals.totalActDinner.toLocaleString('id-ID')}</span></div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-bold border-t border-white/5 pt-2">
            <span>Lunch Capai: {grandTotals.totalTgtLunch > 0 ? ((grandTotals.totalActLunch / grandTotals.totalTgtLunch) * 100).toFixed(1) + '%' : '-'}</span>
            <span>Dinner Capai: {grandTotals.totalTgtDinner > 0 ? ((grandTotals.totalActDinner / grandTotals.totalTgtDinner) * 100).toFixed(1) + '%' : '-'}</span>
          </div>
        </div>

        {/* Overall Grand Achievement Card */}
        <div className="glass-card bg-slate-900 border-white/10 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Grand Total Strategi</span>
              <h4 className="text-xl font-black text-amber-400 mt-1">
                Rp {grandTotals.grandAct.toLocaleString('id-ID')}
              </h4>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase border ${grandPctAll >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
              {grandPctAll.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-bold border-t border-white/5 pt-2">
            <span>Target: Rp {grandTotals.grandTgt.toLocaleString('id-ID')}</span>
            <span className="text-slate-400 font-mono">{grandTotals.activeOutletsCount} Outlet Input</span>
          </div>
        </div>
      </div>

      {/* MATRIX TABLE: REKAP PER OUTLET */}
      <div className="bg-slate-950/40 rounded-2xl border border-white/10 overflow-hidden space-y-3 p-5">
        <div className="flex justify-between items-center px-1">
          <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
            <i className="fas fa-store text-purple-400"></i>
            Performa Menu Strategi Antar Outlet (Penyeimbang & Percepatan)
          </h4>
          <span className="text-[10px] text-slate-500 font-bold">{targetOutlets.length} Outlet Ditampilkan</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-white/10 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="p-3 text-center w-10">No</th>
                <th className="p-3">Outlet</th>
                <th className="p-3 text-center">Area</th>
                <th className="p-3 text-right">Tgt Penyeimbang</th>
                <th className="p-3 text-right">Act Penyeimbang</th>
                <th className="p-3 text-center w-16">% Pen</th>
                <th className="p-3 text-right">Tgt Percepatan</th>
                <th className="p-3 text-right">Act Percepatan</th>
                <th className="p-3 text-center w-16">% Per</th>
                <th className="p-3 text-right">Grand Target</th>
                <th className="p-3 text-right">Grand Actual</th>
                <th className="p-3 text-center w-20">% Capai</th>
                <th className="p-3 text-right text-indigo-300">Actual Kasir</th>
                <th className="p-3 text-center w-20 text-emerald-400">% Kontribusi</th>
                <th className="p-3 text-right text-slate-400">Di Luar Menu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {outletSummaries.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">
                    Tidak ada outlet yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                outletSummaries.map((o, idx) => (
                  <tr
                    key={o.outletName}
                    onClick={() => onSelectOutlet?.(o.outletName)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="p-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                    <td className="p-3 font-black text-white hover:text-purple-300">
                      <div>{o.outletName}</div>
                      {o.daysCount > 0 && (
                        <div className="text-[9px] text-slate-500 font-normal">{o.daysCount} hari tercatat</div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-white/5 text-slate-400 uppercase">
                        {o.area}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">Rp {o.totalTgtPen.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono font-bold text-purple-300">Rp {o.totalActPen.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${o.pctPen >= 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-300'}`}>
                        {o.pctPen.toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">Rp {o.totalTgtPer.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-300">Rp {o.totalActPer.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${o.pctPer >= 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {o.pctPer.toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-amber-400/80">Rp {o.grandTgt.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono font-black text-white">Rp {o.grandAct.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border ${o.grandPct >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : o.grandPct >= 75 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                        {o.grandPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-indigo-300 font-bold">
                      Rp {o.totalKasirRev.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${o.menuContribPct >= 20 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                        {o.menuContribPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">
                      Rp {o.totalOutsideMenu.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))
              )}

              {/* TOTAL ROW */}
              <tr className="bg-slate-950 font-black text-xs text-white border-t-2 border-purple-500/40">
                <td colSpan={3} className="p-3.5 px-4 uppercase text-purple-300">TOTAL REGIONAL</td>
                <td className="p-3.5 text-right font-mono text-slate-300">Rp {grandTotals.totalTgtPen.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-right font-mono text-purple-300">Rp {grandTotals.totalActPen.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-center text-purple-300">{grandPctPen.toFixed(1)}%</td>
                <td className="p-3.5 text-right font-mono text-slate-300">Rp {grandTotals.totalTgtPer.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-right font-mono text-emerald-300">Rp {grandTotals.totalActPer.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-center text-emerald-300">{grandPctPer.toFixed(1)}%</td>
                <td className="p-3.5 text-right font-mono text-amber-400">Rp {grandTotals.grandTgt.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-right font-mono text-emerald-400">Rp {grandTotals.grandAct.toLocaleString('id-ID')}</td>
                <td className="p-3.5 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border ${grandPctAll >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                    {grandPctAll.toFixed(1)}%
                  </span>
                </td>
                <td className="p-3.5 text-right font-mono text-indigo-300 font-bold">
                  Rp {grandTotals.totalKasirRev.toLocaleString('id-ID')}
                </td>
                <td className="p-3.5 text-center text-emerald-400 font-bold">
                  {grandMenuContribPct.toFixed(1)}%
                </td>
                <td className="p-3.5 text-right font-mono text-slate-300">
                  Rp {grandTotals.totalOutsideMenu.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: REKAP PERFORMA MENU KATALOG STRATEGI */}
      <div className="bg-slate-950/40 rounded-2xl border border-white/10 overflow-hidden space-y-3 p-5">
        <div className="flex justify-between items-center px-1">
          <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
            <i className="fas fa-award text-amber-400"></i>
            Performa Penjualan Berdasarkan Katalog Menu Strategi
          </h4>
          <span className="text-[10px] text-slate-500 font-bold">{menuCatalogPerformance.length} Menu Terdaftar</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-white/10 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="p-3 text-center w-10">No</th>
                <th className="p-3">Nama Menu</th>
                <th className="p-3 text-center">Kategori</th>
                <th className="p-3 text-right">Harga Satuan</th>
                <th className="p-3 text-center">Qty Lunch</th>
                <th className="p-3 text-center">Qty Dinner</th>
                <th className="p-3 text-center font-bold text-white">Total Qty Terjual</th>
                <th className="p-3 text-right">Revenue Lunch</th>
                <th className="p-3 text-right">Revenue Dinner</th>
                <th className="p-3 text-right font-black text-amber-400">Total Revenue</th>
                <th className="p-3 text-center">Outlet Menjual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {menuCatalogPerformance.map((m, idx) => (
                <tr key={m.item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                  <td className="p-3 font-bold text-white">
                    <div>{m.item.name}</div>
                    <div className="text-[9px] text-slate-500 font-normal">Sesi: {m.item.session || 'BOTH'}</div>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${
                      m.item.category === 'PENYEIMBANG'
                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    }`}>
                      {m.item.category}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-300">
                    Rp {m.item.price.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3 text-center font-mono text-amber-300">{m.qtyLunch}</td>
                  <td className="p-3 text-center font-mono text-indigo-300">{m.qtyDinner}</td>
                  <td className="p-3 text-center font-mono font-black text-white">{m.totalQty}</td>
                  <td className="p-3 text-right font-mono text-slate-400">Rp {m.revLunch.toLocaleString('id-ID')}</td>
                  <td className="p-3 text-right font-mono text-slate-400">Rp {m.revDinner.toLocaleString('id-ID')}</td>
                  <td className="p-3 text-right font-mono font-black text-emerald-400">
                    Rp {m.totalRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/5 text-slate-300">
                      {m.outletsServing.size} Outlet
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default RegionalStrategiMenuRecapTable;
