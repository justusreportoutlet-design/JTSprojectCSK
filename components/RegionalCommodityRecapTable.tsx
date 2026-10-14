import React, { useState, useMemo } from 'react';
import { AppState, Outlet, LedgerItem } from '../types';
import { OUTLETS, REGIONAL_AREAS, MONTHS, getAreaForOutlet, getActiveOutletNames } from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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

interface CommodityOutletRow {
  outlet: Outlet;
  area: string;
  kitchenSpend: number;
  barSpend: number;
  totalCommoditySpend: number;
  kitchenQty: number;
  barQty: number;
  kitchenTxCount: number;
  barTxCount: number;
  kitchenPct: number;
  barPct: number;
  mtdRevenue: number;
  ratioToRevenue: number;
  topKitchenItem: string;
  topBarItem: string;
  dailyKitchen: Record<number, number>;
  dailyBar: Record<number, number>;
  items: Array<{
    date: string;
    division: 'KITCHEN' | 'BAR';
    name: string;
    qty: number;
    price: number;
    subtotal: number;
    pic: string;
    reason: string;
  }>;
}

export const RegionalCommodityRecapTable: React.FC<Props> = ({
  allOutletsData,
  data,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [localArea, setLocalArea] = useState<string>(selectedArea || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'DAILY_MATRIX' | 'ITEM_RANKING' | 'DETAIL_ITEMS'>('SUMMARY');
  const [matrixDivision, setMatrixDivision] = useState<'ALL' | 'KITCHEN' | 'BAR'>('ALL');
  const [selectedOutletDetail, setSelectedOutletDetail] = useState<CommodityOutletRow | null>(null);

  React.useEffect(() => {
    if (selectedArea) setLocalArea(selectedArea);
  }, [selectedArea]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Compile commodity data for each outlet
  const outletRows: CommodityOutletRow[] = useMemo(() => {
    const activeNames = getActiveOutletNames();
    return activeNames.map(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      const fromData = (outletName === data?.outlet || outletName === selectedOutlet) ? (data?.dailyCommodityLedger || {}) : {};
      const commodityLedger: Record<string, LedgerItem[]> = {
        ...(outletMonths.dailyCommodityLedger || {}),
        ...(mData.dailyCommodityLedger || {}),
        ...fromData
      };

      // Also check dailyPettyCash if any items were tagged as commodity
      const pettyCashLedger: Record<string, any[]> = {
        ...(outletMonths.dailyPettyCash || {}),
        ...(mData.dailyPettyCash || {}),
        ...((outletName === data?.outlet || outletName === selectedOutlet) ? (data?.dailyPettyCash || {}) : {})
      };

      Object.entries(pettyCashLedger).forEach(([dKey, pItems]) => {
        if (Array.isArray(pItems)) {
          pItems.forEach(pItem => {
            const cat = String(pItem?.category || '').toLowerCase();
            if (cat.includes('commodity')) {
              if (!commodityLedger[dKey]) commodityLedger[dKey] = [];
              const exists = commodityLedger[dKey].some(existing => existing.id === pItem.id || (existing.name === pItem.name && existing.price === pItem.price));
              if (!exists) {
                commodityLedger[dKey].push({
                  id: pItem.id || `pc-${dKey}-${Math.random()}`,
                  name: pItem.name || pItem.description || 'Commodity Item',
                  qty: Number(pItem.qty) || 1,
                  price: Number(pItem.price || pItem.amount) || 0,
                  pic: pItem.pic || '-',
                  reason: pItem.reason || 'Petty Cash Commodity',
                  division: (String(pItem.division || '').toUpperCase().includes('BAR') ? 'BAR' : 'KITCHEN')
                });
              }
            }
          });
        }
      });

      // MTD Revenue
      const sales = mData.sales || outletMonths.sales || {};
      let mtdRev = 0;
      if (typeof sales === 'object') {
        Object.entries(sales).forEach(([dKey, val]: [string, any]) => {
          if (dKey.startsWith(monthKey) || dKey.startsWith(`${selectedYear}-${selectedMonth + 1}-`)) {
            mtdRev += Number(val?.totalRevenue || val?.revenue || 0);
          }
        });
      }

      let kitchenSpend = 0;
      let barSpend = 0;
      let kitchenQty = 0;
      let barQty = 0;
      let kitchenTxCount = 0;
      let barTxCount = 0;

      const dailyKitchen: Record<number, number> = {};
      const dailyBar: Record<number, number> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        dailyKitchen[d] = 0;
        dailyBar[d] = 0;
      }

      const kitchenItemMap: Record<string, number> = {};
      const barItemMap: Record<string, number> = {};
      const allItems: CommodityOutletRow['items'] = [];

      Object.entries(commodityLedger).forEach(([dateStr, items]) => {
        const isMatch = (() => {
          if (dateStr.startsWith(monthKey)) return true;
          if (dateStr.startsWith(`${selectedYear}-${selectedMonth + 1}-`)) return true;
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime()) && dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear) return true;
          const dayNum = Number(dateStr);
          if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) return true;
          return false;
        })();

        if (!isMatch || !Array.isArray(items)) return;

        // Parse day number
        let dayNum = 1;
        const parts = dateStr.split('-');
        if (parts.length === 3) dayNum = parseInt(parts[2], 10) || 1;
        else {
          const parsed = parseInt(dateStr, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) dayNum = parsed;
        }

        items.forEach(it => {
          if (!it) return;
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          const subtotal = qty * price;
          const divisionUpper = String(it.division || '').toUpperCase();
          const isBar = divisionUpper.includes('BAR');
          const finalDiv: 'KITCHEN' | 'BAR' = isBar ? 'BAR' : 'KITCHEN';

          if (isBar) {
            barSpend += subtotal;
            barQty += qty;
            barTxCount++;
            dailyBar[dayNum] = (dailyBar[dayNum] || 0) + subtotal;
            barItemMap[it.name] = (barItemMap[it.name] || 0) + subtotal;
          } else {
            kitchenSpend += subtotal;
            kitchenQty += qty;
            kitchenTxCount++;
            dailyKitchen[dayNum] = (dailyKitchen[dayNum] || 0) + subtotal;
            kitchenItemMap[it.name] = (kitchenItemMap[it.name] || 0) + subtotal;
          }

          allItems.push({
            date: dateStr,
            division: finalDiv,
            name: it.name || 'Item Commodity',
            qty,
            price,
            subtotal,
            pic: it.pic || '-',
            reason: it.reason || '-'
          });
        });
      });

      const totalCommoditySpend = kitchenSpend + barSpend;
      const kitchenPct = totalCommoditySpend > 0 ? (kitchenSpend / totalCommoditySpend) * 100 : 0;
      const barPct = totalCommoditySpend > 0 ? (barSpend / totalCommoditySpend) * 100 : 0;
      const ratioToRevenue = mtdRev > 0 ? (totalCommoditySpend / mtdRev) * 100 : 0;

      // Top items
      const topKitchenItem = Object.entries(kitchenItemMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      const topBarItem = Object.entries(barItemMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

      return {
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        kitchenSpend,
        barSpend,
        totalCommoditySpend,
        kitchenQty,
        barQty,
        kitchenTxCount,
        barTxCount,
        kitchenPct,
        barPct,
        mtdRevenue: mtdRev,
        ratioToRevenue,
        topKitchenItem,
        topBarItem,
        dailyKitchen,
        dailyBar,
        items: allItems.sort((a, b) => b.subtotal - a.subtotal)
      };
    });
  }, [allOutletsData, selectedMonth, selectedYear, monthKey, daysInMonth]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return outletRows.filter(row => {
      if (localArea !== 'ALL' && row.area !== localArea) return false;
      if (selectedOutlet && selectedOutlet !== 'ALL' && row.outlet !== selectedOutlet) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOutlet = row.outlet.toLowerCase().includes(q);
        const matchArea = row.area.toLowerCase().includes(q);
        const matchItems = row.items.some(i => i.name.toLowerCase().includes(q));
        return matchOutlet || matchArea || matchItems;
      }
      return true;
    });
  }, [outletRows, localArea, selectedOutlet, searchQuery]);

  // Overall Totals
  const grandTotal = useMemo(() => {
    let sumKitchen = 0;
    let sumBar = 0;
    let sumTotal = 0;
    let sumKitchenQty = 0;
    let sumBarQty = 0;
    let sumRevenue = 0;
    let sumKitchenTx = 0;
    let sumBarTx = 0;

    filteredRows.forEach(r => {
      sumKitchen += r.kitchenSpend;
      sumBar += r.barSpend;
      sumTotal += r.totalCommoditySpend;
      sumKitchenQty += r.kitchenQty;
      sumBarQty += r.barQty;
      sumRevenue += r.mtdRevenue;
      sumKitchenTx += r.kitchenTxCount;
      sumBarTx += r.barTxCount;
    });

    const kitchenShare = sumTotal > 0 ? (sumKitchen / sumTotal) * 100 : 0;
    const barShare = sumTotal > 0 ? (sumBar / sumTotal) * 100 : 0;
    const ratioToRev = sumRevenue > 0 ? (sumTotal / sumRevenue) * 100 : 0;

    return {
      sumKitchen,
      sumBar,
      sumTotal,
      sumKitchenQty,
      sumBarQty,
      sumRevenue,
      sumKitchenTx,
      sumBarTx,
      kitchenShare,
      barShare,
      ratioToRev
    };
  }, [filteredRows]);

  // Top Items Ranking Across Region
  const rankingData = useMemo(() => {
    const kMap: Record<string, { name: string; totalSpend: number; totalQty: number; outlets: Set<string> }> = {};
    const bMap: Record<string, { name: string; totalSpend: number; totalQty: number; outlets: Set<string> }> = {};

    filteredRows.forEach(r => {
      r.items.forEach(it => {
        const target = it.division === 'BAR' ? bMap : kMap;
        if (!target[it.name]) {
          target[it.name] = { name: it.name, totalSpend: 0, totalQty: 0, outlets: new Set() };
        }
        target[it.name].totalSpend += it.subtotal;
        target[it.name].totalQty += it.qty;
        target[it.name].outlets.add(r.outlet);
      });
    });

    const topKitchen = Object.values(kMap).sort((a, b) => b.totalSpend - a.totalSpend);
    const topBar = Object.values(bMap).sort((a, b) => b.totalSpend - a.totalSpend);

    return { topKitchen, topBar };
  }, [filteredRows]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Regional Justus Group';
      workbook.created = new Date();

      // Sheet 1: Rekap Kitchen & Bar
      const sheet = workbook.addWorksheet('Rekap Commodity Kitchen & Bar');
      sheet.views = [{ showGridLines: true }];

      // Title
      sheet.mergeCells('A1:L1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `REKAPAN BELANJA COMMODITY KITCHEN & BAR - REGIONAL`;
      titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getRow(1).height = 30;

      // Subtitle
      sheet.mergeCells('A2:L2');
      const subCell = sheet.getCell('A2');
      subCell.value = `Periode: ${MONTHS[selectedMonth]} ${selectedYear} | Area: ${localArea}`;
      subCell.font = { size: 10, italic: true, color: { argb: 'FF94A3B8' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getRow(2).height = 20;

      // Header Rows
      const headers = [
        'NO', 'OUTLET', 'AREA', 'BELANJA KITCHEN (RP)', 'BELANJA BAR (RP)',
        'TOTAL COMMODITY (RP)', '% SHARE KITCHEN', '% SHARE BAR',
        'QTY KITCHEN', 'QTY BAR', 'TOP ITEM KITCHEN', 'TOP ITEM BAR'
      ];
      const headerRow = sheet.addRow(headers);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF64748B' } },
          left: { style: 'thin', color: { argb: 'FF64748B' } },
          bottom: { style: 'thin', color: { argb: 'FF64748B' } },
          right: { style: 'thin', color: { argb: 'FF64748B' } }
        };
      });

      // Data Rows
      filteredRows.forEach((r, idx) => {
        const row = sheet.addRow([
          idx + 1,
          r.outlet,
          r.area,
          r.kitchenSpend,
          r.barSpend,
          r.totalCommoditySpend,
          Number((r.kitchenPct / 100).toFixed(4)),
          Number((r.barPct / 100).toFixed(4)),
          r.kitchenQty,
          r.barQty,
          r.topKitchenItem,
          r.topBarItem
        ]);

        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '0.0%';
        row.getCell(8).numFmt = '0.0%';
        row.getCell(9).numFmt = '#,##0';
        row.getCell(10).numFmt = '#,##0';
      });

      // Total Row
      const totalRow = sheet.addRow([
        'TOTAL',
        'REGIONAL SUMMARY',
        localArea,
        grandTotal.sumKitchen,
        grandTotal.sumBar,
        grandTotal.sumTotal,
        Number((grandTotal.kitchenShare / 100).toFixed(4)),
        Number((grandTotal.barShare / 100).toFixed(4)),
        grandTotal.sumKitchenQty,
        grandTotal.sumBarQty,
        '-',
        '-'
      ]);
      totalRow.height = 22;
      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      });
      totalRow.getCell(4).numFmt = '#,##0';
      totalRow.getCell(5).numFmt = '#,##0';
      totalRow.getCell(6).numFmt = '#,##0';
      totalRow.getCell(7).numFmt = '0.0%';
      totalRow.getCell(8).numFmt = '0.0%';
      totalRow.getCell(9).numFmt = '#,##0';
      totalRow.getCell(10).numFmt = '#,##0';

      // Auto width
      sheet.columns.forEach(col => {
        col.width = 18;
      });
      sheet.getColumn(1).width = 6;
      sheet.getColumn(2).width = 25;
      sheet.getColumn(11).width = 24;
      sheet.getColumn(12).width = 24;

      // Save file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekapan_Commodity_Kitchen_Bar_${MONTHS[selectedMonth]}_${selectedYear}.xlsx`);
      if (showToast) showToast('Rekapan Commodity berhasil diunduh (Excel)', 'success');
    } catch (e: any) {
      console.error(e);
      if (showToast) showToast('Gagal mengekspor Excel: ' + (e.message || ''), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-3xl border border-white/10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
              <i className="fas fa-utensils"></i>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                Rekapan Belanja Commodity Kitchen & Bar
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  Regional
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Breakdown belanja Commodity harian divisi Kitchen dan Bar seluruh outlet • {MONTHS[selectedMonth]} {selectedYear}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tab Navigation */}
          <div className="bg-slate-950 p-1 rounded-2xl border border-white/10 flex items-center">
            {[
              { id: 'SUMMARY', label: 'Ringkasan Outlet', icon: 'fa-table' },
              { id: 'DAILY_MATRIX', label: 'Daily Matrix', icon: 'fa-calendar-alt' },
              { id: 'ITEM_RANKING', label: 'Top Item', icon: 'fa-trophy' },
              { id: 'DETAIL_ITEMS', label: 'Log Transaksi', icon: 'fa-list' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className={`fas ${tab.icon}`}></i> {tab.label}
              </button>
            ))}
          </div>

          {/* Area Filter */}
          <select
            value={localArea}
            onChange={e => setLocalArea(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="ALL">Semua Area</option>
            {Object.keys(REGIONAL_AREAS).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet atau item..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white outline-none w-44 focus:w-56 transition-all"
            />
          </div>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>

      {/* KPI EXECUTIVE CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Belanja Commodity */}
        <div className="glass-card p-4 rounded-2xl bg-gradient-to-br from-amber-950/30 to-slate-900 border border-amber-500/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-amber-400 tracking-wider">
            <span>Total Belanja Commodity</span>
            <i className="fas fa-wallet text-amber-500"></i>
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1">
            Rp {grandTotal.sumTotal.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>{filteredRows.length} Outlet</span>
            <span className="text-amber-300 font-bold">{grandTotal.sumKitchenTx + grandTotal.sumBarTx} Transaksi</span>
          </div>
        </div>

        {/* Belanja Kitchen */}
        <div className="glass-card p-4 rounded-2xl bg-gradient-to-br from-orange-950/30 to-slate-900 border border-orange-500/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-orange-400 tracking-wider">
            <span>Commodity Kitchen</span>
            <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold">
              {grandTotal.kitchenShare.toFixed(1)}% Share
            </span>
          </div>
          <div className="text-2xl font-black text-orange-300 font-mono mt-1">
            Rp {grandTotal.sumKitchen.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>Qty: {grandTotal.sumKitchenQty.toLocaleString('id-ID')} unit</span>
            <span className="text-orange-300 font-bold">{grandTotal.sumKitchenTx} Transaksi</span>
          </div>
        </div>

        {/* Belanja Bar */}
        <div className="glass-card p-4 rounded-2xl bg-gradient-to-br from-cyan-950/30 to-slate-900 border border-cyan-500/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-cyan-400 tracking-wider">
            <span>Commodity Bar</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold">
              {grandTotal.barShare.toFixed(1)}% Share
            </span>
          </div>
          <div className="text-2xl font-black text-cyan-300 font-mono mt-1">
            Rp {grandTotal.sumBar.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>Qty: {grandTotal.sumBarQty.toLocaleString('id-ID')} unit</span>
            <span className="text-cyan-300 font-bold">{grandTotal.sumBarTx} Transaksi</span>
          </div>
        </div>

        {/* Rasio Belanja thd Sales */}
        <div className="glass-card p-4 rounded-2xl bg-gradient-to-br from-indigo-950/30 to-slate-900 border border-indigo-500/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-indigo-400 tracking-wider">
            <span>Proporsi Kitchen vs Bar</span>
            <i className="fas fa-balance-scale text-indigo-400"></i>
          </div>
          <div className="text-sm font-black text-white mt-1">
            Kitchen {grandTotal.kitchenShare.toFixed(0)}% : Bar {grandTotal.barShare.toFixed(0)}%
          </div>
          {/* Visual Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden flex">
            <div className="bg-orange-500 h-full" style={{ width: `${grandTotal.kitchenShare}%` }} title={`Kitchen: ${grandTotal.kitchenShare.toFixed(1)}%`}></div>
            <div className="bg-cyan-500 h-full" style={{ width: `${grandTotal.barShare}%` }} title={`Bar: ${grandTotal.barShare.toFixed(1)}%`}></div>
          </div>
          <div className="text-[9px] text-slate-400 mt-1.5 flex justify-between font-mono">
            <span className="text-orange-400">Kitchen</span>
            <span className="text-cyan-400">Bar</span>
          </div>
        </div>
      </div>

      {/* VIEW 1: SUMMARY TABLE */}
      {viewMode === 'SUMMARY' && (
        <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
          <div className="overflow-x-auto custom-scrollbar max-h-[70vh]">
            <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider">
                <tr className="border-b border-white/10">
                  <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">NO</th>
                  <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[170px]">OUTLET</th>
                  <th className="p-3 text-center border-r border-white/10 min-w-[90px]">AREA</th>
                  <th className="p-3 text-right border-r border-white/10 bg-orange-950/40 text-orange-300 min-w-[130px]">
                    <i className="fas fa-utensils mr-1"></i> KITCHEN (RP)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-cyan-950/40 text-cyan-300 min-w-[130px]">
                    <i className="fas fa-glass-martini-alt mr-1"></i> BAR (RP)
                  </th>
                  <th className="p-3 text-right border-r border-white/10 bg-amber-950/40 text-amber-300 min-w-[140px]">
                    TOTAL COMMODITY (RP)
                  </th>
                  <th className="p-3 text-center border-r border-white/10 min-w-[110px]">% KITCHEN / BAR</th>
                  <th className="p-3 text-center border-r border-white/10 min-w-[85px]">TOTAL QTY</th>
                  <th className="p-3 border-r border-white/10 min-w-[150px]">TOP ITEM KITCHEN</th>
                  <th className="p-3 border-r border-white/10 min-w-[150px]">TOP ITEM BAR</th>
                  <th className="p-3 text-center min-w-[90px]">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px]">
                {filteredRows.map((r, idx) => (
                  <tr key={r.outlet} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-center border-r border-white/5 bg-slate-950/60 sticky left-0 font-mono text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-black text-white border-r border-white/5 bg-slate-950/60 sticky left-12 truncate">
                      {r.outlet}
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                        {r.area}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-orange-400 border-r border-white/5 bg-orange-950/10">
                      Rp {r.kitchenSpend.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-cyan-400 border-r border-white/5 bg-cyan-950/10">
                      Rp {r.barSpend.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/10">
                      Rp {r.totalCommoditySpend.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center border-r border-white/5">
                      {r.totalCommoditySpend > 0 ? (
                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono">
                          <span className="text-orange-400 font-bold">{r.kitchenPct.toFixed(0)}%</span>
                          <span className="text-slate-600">/</span>
                          <span className="text-cyan-400 font-bold">{r.barPct.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/5">
                      <span className="text-slate-300 font-bold">{(r.kitchenQty + r.barQty).toLocaleString('id-ID')}</span>
                      <span className="text-[9px] text-slate-500 block">({r.items.length} tx)</span>
                    </td>
                    <td className="p-3 border-r border-white/5 truncate max-w-[150px] text-slate-400" title={r.topKitchenItem}>
                      {r.topKitchenItem !== '-' ? (
                        <span className="text-orange-300 font-bold">{r.topKitchenItem}</span>
                      ) : (
                        <span className="text-slate-600 italic">Tidak ada</span>
                      )}
                    </td>
                    <td className="p-3 border-r border-white/5 truncate max-w-[150px] text-slate-400" title={r.topBarItem}>
                      {r.topBarItem !== '-' ? (
                        <span className="text-cyan-300 font-bold">{r.topBarItem}</span>
                      ) : (
                        <span className="text-slate-600 italic">Tidak ada</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedOutletDetail(r)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold uppercase transition-all cursor-pointer"
                      >
                        Detail ({r.items.length})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-slate-950 font-black text-white border-t-2 border-amber-500/40 text-[11px]">
                <tr>
                  <td colSpan={3} className="p-3 text-center uppercase tracking-wider bg-slate-950">
                    TOTAL REGIONAL ({filteredRows.length} OUTLET)
                  </td>
                  <td className="p-3 text-right font-mono text-orange-400 bg-orange-950/30">
                    Rp {grandTotal.sumKitchen.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3 text-right font-mono text-cyan-400 bg-cyan-950/30">
                    Rp {grandTotal.sumBar.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3 text-right font-mono text-amber-300 bg-amber-950/30">
                    Rp {grandTotal.sumTotal.toLocaleString('id-ID')}
                  </td>
                  <td className="p-3 text-center font-mono">
                    <span className="text-orange-400">{grandTotal.kitchenShare.toFixed(0)}%</span> / <span className="text-cyan-400">{grandTotal.barShare.toFixed(0)}%</span>
                  </td>
                  <td className="p-3 text-center font-mono">
                    {(grandTotal.sumKitchenQty + grandTotal.sumBarQty).toLocaleString('id-ID')} unit
                  </td>
                  <td colSpan={3} className="p-3 text-right text-[10px] text-slate-400 italic">
                    Kitchen: {grandTotal.sumKitchenTx} tx | Bar: {grandTotal.sumBarTx} tx
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: DAILY MATRIX (TANGGAL 1 - 31) */}
      {viewMode === 'DAILY_MATRIX' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              Menampilkan matriks belanja harian untuk periode <span className="text-amber-400 font-bold">{MONTHS[selectedMonth]} {selectedYear}</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-[10px] font-bold">
              {[
                { id: 'ALL', label: 'Total Commodity' },
                { id: 'KITCHEN', label: 'Kitchen Only' },
                { id: 'BAR', label: 'Bar Only' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setMatrixDivision(m.id as any)}
                  className={`px-2.5 py-1 rounded-lg uppercase cursor-pointer transition-all ${
                    matrixDivision === m.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
            <div className="overflow-x-auto custom-scrollbar max-h-[70vh]">
              <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1400px]">
                <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider">
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">NO</th>
                    <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[160px]">OUTLET</th>
                    <th className="p-3 text-right border-r border-white/10 bg-amber-950/60 text-amber-300 min-w-[120px]">
                      TOTAL MTD
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                      <th key={d} className="p-2 text-center border-r border-white/10 min-w-[70px] bg-slate-900">
                        TGL {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[10px]">
                  {filteredRows.map((r, idx) => {
                    const rowTotal = matrixDivision === 'KITCHEN' ? r.kitchenSpend : matrixDivision === 'BAR' ? r.barSpend : r.totalCommoditySpend;

                    return (
                      <tr key={r.outlet} className="hover:bg-white/5">
                        <td className="p-2 text-center border-r border-white/5 bg-slate-950 sticky left-0 text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="p-2 font-bold text-white border-r border-white/5 bg-slate-950 sticky left-12 truncate">
                          {r.outlet}
                        </td>
                        <td className="p-2 text-right font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/10">
                          Rp {rowTotal.toLocaleString('id-ID')}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                          const kVal = r.dailyKitchen[d] || 0;
                          const bVal = r.dailyBar[d] || 0;
                          const val = matrixDivision === 'KITCHEN' ? kVal : matrixDivision === 'BAR' ? bVal : kVal + bVal;

                          return (
                            <td key={d} className="p-1 text-center font-mono border-r border-white/5">
                              {val > 0 ? (
                                <span className={`font-bold ${matrixDivision === 'KITCHEN' ? 'text-orange-400' : matrixDivision === 'BAR' ? 'text-cyan-400' : 'text-amber-300'}`}>
                                  {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${Math.round(val / 1000)}k`}
                                </span>
                              ) : (
                                <span className="text-slate-700">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: TOP ITEM RANKING */}
      {viewMode === 'ITEM_RANKING' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Kitchen Items */}
          <div className="glass-card p-5 rounded-3xl bg-slate-900/90 border border-orange-500/20 space-y-4">
            <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3">
              <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                <i className="fas fa-utensils"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase">Top Belanja Commodity Kitchen</h3>
                <p className="text-[10px] text-slate-400">Peringkat item commodity kitchen berdasarkan total pengeluaran regional</p>
              </div>
            </div>

            <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {rankingData.topKitchen.slice(0, 15).map((it, idx) => (
                <div key={it.name} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 font-mono font-black text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block">{it.name}</span>
                      <span className="text-[9px] text-slate-400">
                        {it.totalQty} unit • {it.outlets.size} outlet
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-black text-orange-400 block">
                      Rp {it.totalSpend.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      ~Rp {Math.round(it.totalSpend / (it.totalQty || 1)).toLocaleString('id-ID')}/unit
                    </span>
                  </div>
                </div>
              ))}
              {rankingData.topKitchen.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs italic">
                  Belum ada data belanja commodity kitchen pada periode ini
                </div>
              )}
            </div>
          </div>

          {/* Top Bar Items */}
          <div className="glass-card p-5 rounded-3xl bg-slate-900/90 border border-cyan-500/20 space-y-4">
            <div className="flex items-center gap-3 border-b border-cyan-500/20 pb-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <i className="fas fa-glass-martini-alt"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase">Top Belanja Commodity Bar</h3>
                <p className="text-[10px] text-slate-400">Peringkat item commodity bar berdasarkan total pengeluaran regional</p>
              </div>
            </div>

            <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {rankingData.topBar.slice(0, 15).map((it, idx) => (
                <div key={it.name} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 font-mono font-black text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block">{it.name}</span>
                      <span className="text-[9px] text-slate-400">
                        {it.totalQty} unit • {it.outlets.size} outlet
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-black text-cyan-400 block">
                      Rp {it.totalSpend.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      ~Rp {Math.round(it.totalSpend / (it.totalQty || 1)).toLocaleString('id-ID')}/unit
                    </span>
                  </div>
                </div>
              ))}
              {rankingData.topBar.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs italic">
                  Belum ada data belanja commodity bar pada periode ini
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: DETAIL ALL ITEMS LOG */}
      {viewMode === 'DETAIL_ITEMS' && (
        <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90 p-4">
          <div className="mb-3 flex justify-between items-center text-xs text-slate-400">
            <span>Log Transaksi Belanja Commodity Seluruh Outlet ({filteredRows.reduce((a, b) => a + b.items.length, 0)} item)</span>
          </div>
          <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="sticky top-0 bg-slate-950 text-white font-black text-[10px] uppercase">
                <tr className="border-b border-white/10">
                  <th className="p-2.5">TANGGAL</th>
                  <th className="p-2.5">OUTLET</th>
                  <th className="p-2.5">DIVISI</th>
                  <th className="p-2.5">NAMA ITEM</th>
                  <th className="p-2.5 text-center">QTY</th>
                  <th className="p-2.5 text-right">HARGA (RP)</th>
                  <th className="p-2.5 text-right">SUBTOTAL (RP)</th>
                  <th className="p-2.5">PIC</th>
                  <th className="p-2.5">ALASAN / KEPERLUAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px]">
                {filteredRows.flatMap(r => r.items.map(it => ({ ...it, outlet: r.outlet }))).map((it, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="p-2.5 font-mono text-slate-400">{it.date}</td>
                    <td className="p-2.5 font-bold text-white">{it.outlet}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        it.division === 'BAR' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-orange-500/20 text-orange-300'
                      }`}>
                        {it.division}
                      </span>
                    </td>
                    <td className="p-2.5 font-bold text-slate-200">{it.name}</td>
                    <td className="p-2.5 text-center font-mono">{it.qty}</td>
                    <td className="p-2.5 text-right font-mono">Rp {it.price.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-amber-300">Rp {it.subtotal.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-slate-400">{it.pic}</td>
                    <td className="p-2.5 text-slate-400 truncate max-w-xs">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POPUP MODAL DETAIL PER OUTLET */}
      {selectedOutletDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-slate-950">
              <div>
                <h3 className="text-base font-black text-white uppercase">{selectedOutletDetail.outlet}</h3>
                <p className="text-xs text-slate-400">
                  Kitchen: <span className="text-orange-400 font-bold">Rp {selectedOutletDetail.kitchenSpend.toLocaleString('id-ID')}</span> • 
                  Bar: <span className="text-cyan-400 font-bold">Rp {selectedOutletDetail.barSpend.toLocaleString('id-ID')}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedOutletDetail(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 divide-y divide-white/5">
              {selectedOutletDetail.items.map((it, idx) => (
                <div key={idx} className="py-2.5 flex justify-between items-center text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        it.division === 'BAR' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-orange-500/20 text-orange-300'
                      }`}>
                        {it.division}
                      </span>
                      <span className="font-bold text-white">{it.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Tgl: {it.date} • PIC: {it.pic} • Keperluan: {it.reason}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-amber-300 block">Rp {it.subtotal.toLocaleString('id-ID')}</span>
                    <span className="text-[10px] text-slate-500">{it.qty} x Rp {it.price.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
              {selectedOutletDetail.items.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs italic">
                  Tidak ada data transaksi commodity untuk outlet ini
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedOutletDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase cursor-pointer"
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
