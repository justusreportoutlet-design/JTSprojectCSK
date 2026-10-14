import React, { useState, useMemo } from 'react';
import { AppState, OutletManpowerData } from '../types';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, getActiveOutletNames, getActiveRegionalAreas } from '../constants';
import { createDefaultManpowerData, calculateManpowerSummary, extractOutletManpowerMap, resolveOutletManpowerData } from '../lib/manpowerUtils';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Props {
  allOutletsData: Record<string, any>;
  globalData?: AppState;
  selectedMonth: number; // 0..11
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const RegionalManpowerRecapTable: React.FC<Props> = ({
  allOutletsData,
  globalData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>(selectedArea || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [divisionFilter, setDivisionFilter] = useState<'ALL' | 'SERVICE' | 'BAR' | 'KITCHEN'>('ALL');
  const [selectedOutletForSlotsModal, setSelectedOutletForSlotsModal] = useState<{ outlet: string; data: OutletManpowerData } | null>(null);

  React.useEffect(() => {
    if (selectedArea) setActiveAreaFilter(selectedArea);
  }, [selectedArea]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  // Target Outlets
  const targetOutlets = useMemo(() => {
    const activeNames = getActiveOutletNames();
    const activeAreas = getActiveRegionalAreas(activeNames);
    let list = [...activeNames];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      list = list.filter(o => o === selectedOutlet);
    } else if (activeAreaFilter !== 'ALL' && activeAreas[activeAreaFilter]) {
      list = activeAreas[activeAreaFilter];
    }
    return list;
  }, [selectedOutlet, activeAreaFilter]);

  // Aggregate Manpower Data for all outlets
  const outletManpowerList = useMemo(() => {
    return targetOutlets.map(outlet => {
      const area = getAreaForOutlet(outlet) || 'JAKARTA';
      const outletRawData = allOutletsData?.[outlet] || {};
      const allManpower = extractOutletManpowerMap(outletRawData, globalData?.manpowerData);
      const mpData: OutletManpowerData = resolveOutletManpowerData(allManpower, outlet, monthKey);
      const summary = calculateManpowerSummary(mpData);

      const fulfillmentPct = summary.grandTotalBudget > 0 
        ? (summary.grandTotalActual / summary.grandTotalBudget) * 100 
        : 0;

      return {
        outlet,
        area,
        mpData,
        summary,
        fulfillmentPct
      };
    });
  }, [targetOutlets, allOutletsData, globalData, selectedMonth, monthKey]);

  // Group outlets by area
  const areaGroups = useMemo(() => {
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (activeAreaFilter !== 'ALL' && REGIONAL_AREAS[activeAreaFilter]) {
      return [{ areaName: activeAreaFilter, rows: outletManpowerList.filter(r => r.area === activeAreaFilter) }];
    }
    return areas.map(a => ({
      areaName: a,
      rows: outletManpowerList.filter(r => r.area === a)
    })).filter(g => g.rows.length > 0);
  }, [outletManpowerList, activeAreaFilter]);

  // Regional Totals
  const regionalSummary = useMemo(() => {
    let budgetInhouse = 0;
    let actualInhouse = 0;
    let budgetService = 0;
    let actualService = 0;
    let budgetBar = 0;
    let actualBar = 0;
    let budgetKitchen = 0;
    let actualKitchen = 0;
    let budgetExternal = 0;
    let actualExternal = 0;
    let vacantOpen = 0;
    let vacantHold = 0;

    outletManpowerList.forEach(r => {
      const s = r.summary;
      budgetInhouse += s.totalInhouseBudget;
      actualInhouse += s.totalInhouseActual;
      budgetService += s.serviceBudget;
      actualService += s.serviceActual;
      budgetBar += s.barBudget;
      actualBar += s.barActual;
      budgetKitchen += s.kitchenBudget;
      actualKitchen += s.kitchenActual;
      budgetExternal += s.externalBudget;
      actualExternal += s.externalActual;
      vacantOpen += s.totalVacantOpen;
      vacantHold += s.totalVacantHold;
    });

    const grandBudget = budgetInhouse + budgetExternal;
    const grandActual = actualInhouse + actualExternal;
    const totalVariance = grandActual - grandBudget;
    const fulfillmentRate = grandBudget > 0 ? (grandActual / grandBudget) * 100 : 0;

    return {
      budgetInhouse,
      actualInhouse,
      budgetService,
      actualService,
      budgetBar,
      actualBar,
      budgetKitchen,
      actualKitchen,
      budgetExternal,
      actualExternal,
      vacantOpen,
      vacantHold,
      grandBudget,
      grandActual,
      totalVariance,
      fulfillmentRate,
      outletCount: outletManpowerList.length
    };
  }, [outletManpowerList]);

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Report Manpower Regional');

    // Title
    ws.mergeCells('A1:R1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `REPORT MAN POWER REGIONAL RESTORAN`;
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Subtitle
    ws.mergeCells('A2:R2');
    const subCell = ws.getCell('A2');
    subCell.value = `Periode: ${monthName} ${selectedYear} | Rekap Sesuai Inputan Tabel Manpower Setiap Outlet`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.addRow([]);
    const headerRow1 = ws.addRow([
      'NO', 'AREA', 'OUTLET',
      'SERVICE', '', '',
      'BAR', '', '',
      'KITCHEN (INC STEWARD/SK)', '', '',
      'TOTAL IN-HOUSE', '', '',
      'EXTERNAL (DW)', 'VACANT OPEN', 'FULFILLMENT'
    ]);

    ws.mergeCells('D4:F4');
    ws.mergeCells('G4:I4');
    ws.mergeCells('J4:L4');
    ws.mergeCells('M4:O4');

    const headerRow2 = ws.addRow([
      '', '', '',
      'BUDGET', 'ACTUAL', 'VAR',
      'BUDGET', 'ACTUAL', 'VAR',
      'BUDGET', 'ACTUAL', 'VAR',
      'BUDGET', 'ACTUAL', 'VAR',
      'ACTUAL', 'SLOT', '%'
    ]);

    [headerRow1, headerRow2].forEach(row => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      row.alignment = { horizontal: 'center', vertical: 'middle' };
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    let rowIdx = 1;
    outletManpowerList.forEach(r => {
      const s = r.summary;
      ws.addRow([
        rowIdx++,
        r.area,
        r.outlet,
        s.serviceBudget,
        s.serviceActual,
        s.serviceVariance,
        s.barBudget,
        s.barActual,
        s.barVariance,
        s.kitchenBudget,
        s.kitchenActual,
        s.kitchenVariance,
        s.totalInhouseBudget,
        s.totalInhouseActual,
        s.totalInhouseVariance,
        s.externalActual,
        s.totalVacantOpen,
        `${r.fulfillmentPct.toFixed(0)}%`
      ]);
    });

    // Grand total
    const gtRow = ws.addRow([
      '', 'GRAND TOTAL REGIONAL', '',
      regionalSummary.budgetService,
      regionalSummary.actualService,
      regionalSummary.actualService - regionalSummary.budgetService,
      regionalSummary.budgetBar,
      regionalSummary.actualBar,
      regionalSummary.actualBar - regionalSummary.budgetBar,
      regionalSummary.budgetKitchen,
      regionalSummary.actualKitchen,
      regionalSummary.actualKitchen - regionalSummary.budgetKitchen,
      regionalSummary.budgetInhouse,
      regionalSummary.actualInhouse,
      regionalSummary.actualInhouse - regionalSummary.budgetInhouse,
      regionalSummary.actualExternal,
      regionalSummary.vacantOpen,
      `${regionalSummary.fulfillmentRate.toFixed(0)}%`
    ]);
    gtRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    gtRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Report_Manpower_Regional_${monthKey}.xlsx`);
    if (showToast) showToast('Export Excel Report Manpower berhasil diunduh!', 'success');
  };

  // WhatsApp share handler
  const handleCopyWhatsApp = () => {
    let text = `*👥 REPORT MAN POWER REGIONAL RESTORAN*\n`;
    text += `*Periode:* ${monthName} ${selectedYear}\n\n`;

    text += `*📊 RINGKASAN REGIONAL:*\n`;
    text += `• Total Manpower: *${regionalSummary.grandActual}* / ${regionalSummary.grandBudget} Orang (${regionalSummary.fulfillmentRate.toFixed(0)}%)\n`;
    text += `• Divisi Service: *${regionalSummary.actualService}* (Budget ${regionalSummary.budgetService})\n`;
    text += `• Divisi Bar: *${regionalSummary.actualBar}* (Budget ${regionalSummary.budgetBar})\n`;
    text += `• Divisi Kitchen: *${regionalSummary.actualKitchen}* (Budget ${regionalSummary.budgetKitchen})\n`;
    text += `• External / DW: *${regionalSummary.actualExternal}* Orang\n`;
    text += `• Total Vacant Open: *${regionalSummary.vacantOpen}* Posisi\n\n`;

    text += `*REKAPITULASI OUTLET:*\n`;
    outletManpowerList.forEach((r, idx) => {
      const s = r.summary;
      text += `${idx + 1}. *${r.outlet}* (${r.area})\n`;
      text += `   Actual: *${s.grandTotalActual}* / Budget: ${s.grandTotalBudget} (Var: ${s.grandTotalActual - s.grandTotalBudget}) | Vacant: ${s.totalVacantOpen}\n`;
      text += `   Svc: ${s.serviceActual} | Bar: ${s.barActual} | Kit: ${s.kitchenActual} | DW: ${s.externalActual}\n`;
    });

    navigator.clipboard.writeText(text);
    if (showToast) showToast('Teks laporan Manpower WhatsApp berhasil disalin!', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* HEADER SECTION WITH FILTERS */}
      <div className="bg-slate-900/95 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-users-cog"></i> Man Power Analytics
              </span>
              <span className="text-xs text-slate-400 font-bold">{monthName} {selectedYear}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tight">
              Report Man Power Regional (Sesuai Inputan Setiap Outlet)
            </h2>
            <p className="text-xs text-slate-400">
              Monitoring alokasi personil in-house & external, budget vs actual per divisi (Service, Bar, Kitchen), serta status vacant slot di seluruh outlet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyWhatsApp}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <i className="fab fa-whatsapp text-sm"></i>
              <span>Copy WA</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-indigo-950/40 cursor-pointer"
            >
              <i className="fas fa-file-excel text-sm"></i>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* CONTROLS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Filter Area:
            </label>
            <select
              value={activeAreaFilter}
              onChange={e => setActiveAreaFilter(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-amber-300 outline-none focus:border-emerald-500"
            >
              <option value="ALL">🌐 SEMUA AREA</option>
              <option value="JAKARTA">📍 JAKARTA</option>
              <option value="TANGGERANG">📍 TANGGERANG</option>
              <option value="BEKASI & CIBUBUR">📍 BEKASI & CIBUBUR</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Fokus Divisi:
            </label>
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-center">
              {(['ALL', 'SERVICE', 'BAR', 'KITCHEN'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDivisionFilter(d)}
                  className={`py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    divisionFilter === d
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Cari Outlet:
            </label>
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-2.5 text-slate-500 text-xs"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari nama outlet..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* EXECUTIVE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL REGIONAL MANPOWER */}
        <div className="bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 p-5 rounded-3xl border border-emerald-500/30 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Total Manpower Regional</span>
            <i className="fas fa-users text-emerald-400"></i>
          </div>
          <div className="text-3xl font-black text-white mt-2">
            {regionalSummary.grandActual} <span className="text-sm font-bold text-slate-400">/ {regionalSummary.grandBudget} Org</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-300">{regionalSummary.fulfillmentRate.toFixed(1)}% Terisi</span>
            <span className={`px-2 py-0.5 rounded font-black text-[10px] ${regionalSummary.totalVariance <= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
              Var: {regionalSummary.totalVariance > 0 ? `+${regionalSummary.totalVariance}` : regionalSummary.totalVariance}
            </span>
          </div>
        </div>

        {/* DIVISI SERVICE */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-blue-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Service (Inc PA)</span>
            <i className="fas fa-concierge-bell text-blue-400"></i>
          </div>
          <div className="text-3xl font-black text-blue-300 mt-2">
            {regionalSummary.actualService} <span className="text-sm font-bold text-slate-400">/ {regionalSummary.budgetService}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Variance: <span className={`font-bold ${regionalSummary.actualService >= regionalSummary.budgetService ? 'text-emerald-400' : 'text-amber-400'}`}>
              {regionalSummary.actualService - regionalSummary.budgetService} Orang
            </span>
          </p>
        </div>

        {/* DIVISI BAR */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-amber-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Bar</span>
            <i className="fas fa-wine-glass-alt text-amber-400"></i>
          </div>
          <div className="text-3xl font-black text-amber-300 mt-2">
            {regionalSummary.actualBar} <span className="text-sm font-bold text-slate-400">/ {regionalSummary.budgetBar}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Variance: <span className={`font-bold ${regionalSummary.actualBar >= regionalSummary.budgetBar ? 'text-emerald-400' : 'text-amber-400'}`}>
              {regionalSummary.actualBar - regionalSummary.budgetBar} Orang
            </span>
          </p>
        </div>

        {/* DIVISI KITCHEN */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-rose-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Kitchen (Inc Steward/SK)</span>
            <i className="fas fa-utensils text-rose-400"></i>
          </div>
          <div className="text-3xl font-black text-rose-300 mt-2">
            {regionalSummary.actualKitchen} <span className="text-sm font-bold text-slate-400">/ {regionalSummary.budgetKitchen}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-[10px] text-slate-400">
              Vacant Open: <span className="font-bold text-amber-400">{regionalSummary.vacantOpen} Posisi</span>
            </span>
          </div>
        </div>
      </div>

      {/* MANPOWER RECAP TABLE */}
      <div className="bg-slate-900/90 rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <i className="fas fa-sitemap text-emerald-400"></i>
              Tabel Rekapitulasi Man Power Seluruh Outlet
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Alokasi staff, budget vs actual per divisi, dan status slot karyawan
            </p>
          </div>
          <div className="text-xs text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            {monthName} {selectedYear}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-300 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                <th className="py-3 px-3 w-10 text-center" rowSpan={2}>#</th>
                <th className="py-3 px-4 min-w-[170px]" rowSpan={2}>Nama Outlet</th>
                <th className="py-3 px-3 text-center" rowSpan={2}>Area</th>

                {/* SERVICE DIVISION */}
                {(divisionFilter === 'ALL' || divisionFilter === 'SERVICE') && (
                  <th colSpan={3} className="py-2 px-3 text-center bg-blue-950/40 border-l border-white/10 text-blue-300">
                    SERVICE (Inc PA)
                  </th>
                )}

                {/* BAR DIVISION */}
                {(divisionFilter === 'ALL' || divisionFilter === 'BAR') && (
                  <th colSpan={3} className="py-2 px-3 text-center bg-amber-950/40 border-l border-white/10 text-amber-300">
                    BAR
                  </th>
                )}

                {/* KITCHEN DIVISION */}
                {(divisionFilter === 'ALL' || divisionFilter === 'KITCHEN') && (
                  <th colSpan={3} className="py-2 px-3 text-center bg-rose-950/40 border-l border-white/10 text-rose-300">
                    KITCHEN (Inc Stew/SK)
                  </th>
                )}

                {/* IN-HOUSE TOTAL */}
                <th colSpan={3} className="py-2 px-3 text-center bg-emerald-950/40 border-l border-white/10 text-emerald-300">
                  TOTAL IN-HOUSE
                </th>

                <th className="py-3 px-3 text-center border-l border-white/10" rowSpan={2}>DW / Ext</th>
                <th className="py-3 px-3 text-center border-l border-white/10" rowSpan={2}>Vacant</th>
                <th className="py-3 px-3 text-center border-l border-white/10" rowSpan={2}>Fulfillment</th>
                <th className="py-3 px-3 text-center w-20 border-l border-white/10" rowSpan={2}>Detail</th>
              </tr>

              <tr className="bg-slate-950/90 text-slate-400 font-bold text-[9px] border-b border-white/10">
                {(divisionFilter === 'ALL' || divisionFilter === 'SERVICE') && (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5">Bdg</th>
                    <th className="py-2 px-2 text-right">Act</th>
                    <th className="py-2 px-2 text-right">Var</th>
                  </>
                )}
                {(divisionFilter === 'ALL' || divisionFilter === 'BAR') && (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5">Bdg</th>
                    <th className="py-2 px-2 text-right">Act</th>
                    <th className="py-2 px-2 text-right">Var</th>
                  </>
                )}
                {(divisionFilter === 'ALL' || divisionFilter === 'KITCHEN') && (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5">Bdg</th>
                    <th className="py-2 px-2 text-right">Act</th>
                    <th className="py-2 px-2 text-right">Var</th>
                  </>
                )}
                <th className="py-2 px-2 text-right border-l border-white/5 font-black text-emerald-400">Bdg</th>
                <th className="py-2 px-2 text-right font-black text-emerald-300">Act</th>
                <th className="py-2 px-2 text-right font-black text-white">Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {areaGroups.map(group => {
                const filteredRows = group.rows.filter(r =>
                  !searchQuery || r.outlet.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (filteredRows.length === 0) return null;

                // Subtotals
                let subSvcB = 0, subSvcA = 0;
                let subBarB = 0, subBarA = 0;
                let subKitB = 0, subKitA = 0;
                let subInhB = 0, subInhA = 0;
                let subExt = 0, subVac = 0;

                filteredRows.forEach(r => {
                  const s = r.summary;
                  subSvcB += s.serviceBudget;
                  subSvcA += s.serviceActual;
                  subBarB += s.barBudget;
                  subBarA += s.barActual;
                  subKitB += s.kitchenBudget;
                  subKitA += s.kitchenActual;
                  subInhB += s.totalInhouseBudget;
                  subInhA += s.totalInhouseActual;
                  subExt += s.externalActual;
                  subVac += s.totalVacantOpen;
                });

                return (
                  <React.Fragment key={group.areaName}>
                    {/* Area Group Header */}
                    <tr className="bg-slate-950/90 text-amber-400 font-black text-[11px] border-y border-amber-500/20">
                      <td colSpan={18} className="py-2 px-4 uppercase tracking-widest flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-map-marker-alt"></i> AREA {group.areaName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {filteredRows.length} Outlet
                        </span>
                      </td>
                    </tr>

                    {filteredRows.map((r, idx) => {
                      const s = r.summary;
                      return (
                        <tr key={r.outlet} className="hover:bg-white/5 transition-colors border-b border-white/5">
                          <td className="py-3 px-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-black text-white text-xs uppercase">
                            {r.outlet}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-400 text-[10px]">{r.area}</td>

                          {/* SERVICE */}
                          {(divisionFilter === 'ALL' || divisionFilter === 'SERVICE') && (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-slate-400 border-l border-white/5">{s.serviceBudget}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-blue-300">{s.serviceActual}</td>
                              <td className={`py-3 px-2 text-right font-mono font-bold ${s.serviceVariance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {s.serviceVariance > 0 ? `+${s.serviceVariance}` : s.serviceVariance}
                              </td>
                            </>
                          )}

                          {/* BAR */}
                          {(divisionFilter === 'ALL' || divisionFilter === 'BAR') && (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-slate-400 border-l border-white/5">{s.barBudget}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-amber-300">{s.barActual}</td>
                              <td className={`py-3 px-2 text-right font-mono font-bold ${s.barVariance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {s.barVariance > 0 ? `+${s.barVariance}` : s.barVariance}
                              </td>
                            </>
                          )}

                          {/* KITCHEN */}
                          {(divisionFilter === 'ALL' || divisionFilter === 'KITCHEN') && (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-slate-400 border-l border-white/5">{s.kitchenBudget}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-rose-300">{s.kitchenActual}</td>
                              <td className={`py-3 px-2 text-right font-mono font-bold ${s.kitchenVariance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {s.kitchenVariance > 0 ? `+${s.kitchenVariance}` : s.kitchenVariance}
                              </td>
                            </>
                          )}

                          {/* IN-HOUSE TOTAL */}
                          <td className="py-3 px-2 text-right font-mono text-emerald-400/80 border-l border-white/5">{s.totalInhouseBudget}</td>
                          <td className="py-3 px-2 text-right font-mono font-black text-emerald-300">{s.totalInhouseActual}</td>
                          <td className={`py-3 px-2 text-right font-mono font-bold ${s.totalInhouseVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.totalInhouseVariance > 0 ? `+${s.totalInhouseVariance}` : s.totalInhouseVariance}
                          </td>

                          {/* EXTERNAL DW */}
                          <td className="py-3 px-3 text-center font-mono text-slate-300 border-l border-white/10">
                            {s.externalActual > 0 ? `${s.externalActual} Org` : '-'}
                          </td>

                          {/* VACANT */}
                          <td className="py-3 px-3 text-center border-l border-white/10">
                            {s.totalVacantOpen > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold font-mono text-[10px]">
                                {s.totalVacantOpen} Open
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono">-</span>
                            )}
                          </td>

                          {/* FULFILLMENT */}
                          <td className="py-3 px-3 text-center font-mono font-black text-emerald-300 border-l border-white/10">
                            {r.fulfillmentPct.toFixed(0)}%
                          </td>

                          {/* ACTION DETAIL */}
                          <td className="py-3 px-3 text-center border-l border-white/10">
                            <button
                              onClick={() => setSelectedOutletForSlotsModal({ outlet: r.outlet, data: r.mpData })}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-[10px] font-bold transition-all cursor-pointer"
                              title="Lihat Daftar Roster Slot"
                            >
                              <i className="fas fa-list-check"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Row */}
                    <tr className="bg-slate-950/70 font-black text-xs text-white border-t border-white/10">
                      <td colSpan={3} className="py-2.5 px-4 uppercase text-amber-400">
                        Subtotal Area {group.areaName}
                      </td>
                      {(divisionFilter === 'ALL' || divisionFilter === 'SERVICE') && (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-400">{subSvcB}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-blue-300">{subSvcA}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-white">{subSvcA - subSvcB}</td>
                        </>
                      )}
                      {(divisionFilter === 'ALL' || divisionFilter === 'BAR') && (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-400">{subBarB}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-amber-300">{subBarA}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-white">{subBarA - subBarB}</td>
                        </>
                      )}
                      {(divisionFilter === 'ALL' || divisionFilter === 'KITCHEN') && (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-400">{subKitB}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-rose-300">{subKitA}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-white">{subKitA - subKitB}</td>
                        </>
                      )}
                      <td className="py-2.5 px-2 text-right font-mono text-emerald-400 bg-emerald-950/30">{subInhB}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-emerald-300 bg-emerald-950/30">{subInhA}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-white bg-emerald-950/30">{subInhA - subInhB}</td>
                      <td className="py-2.5 px-3 text-center font-mono">{subExt}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-amber-300">{subVac}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-300">
                        {subInhB > 0 ? `${((subInhA / subInhB) * 100).toFixed(0)}%` : '-'}
                      </td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* GRAND TOTAL ROW */}
              <tr className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/90 text-white font-black text-xs border-t-2 border-emerald-500">
                <td colSpan={3} className="py-3.5 px-4 uppercase tracking-widest text-emerald-300 flex items-center gap-2">
                  🏆 GRAND TOTAL REGIONAL
                </td>
                {(divisionFilter === 'ALL' || divisionFilter === 'SERVICE') && (
                  <>
                    <td className="py-3.5 px-2 text-right font-mono text-slate-300">{regionalSummary.budgetService}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-blue-300 text-sm">{regionalSummary.actualService}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-white">{regionalSummary.actualService - regionalSummary.budgetService}</td>
                  </>
                )}
                {(divisionFilter === 'ALL' || divisionFilter === 'BAR') && (
                  <>
                    <td className="py-3.5 px-2 text-right font-mono text-slate-300">{regionalSummary.budgetBar}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-amber-300 text-sm">{regionalSummary.actualBar}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-white">{regionalSummary.actualBar - regionalSummary.budgetBar}</td>
                  </>
                )}
                {(divisionFilter === 'ALL' || divisionFilter === 'KITCHEN') && (
                  <>
                    <td className="py-3.5 px-2 text-right font-mono text-slate-300">{regionalSummary.budgetKitchen}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-rose-300 text-sm">{regionalSummary.actualKitchen}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-white">{regionalSummary.actualKitchen - regionalSummary.budgetKitchen}</td>
                  </>
                )}
                <td className="py-3.5 px-2 text-right font-mono text-emerald-400 bg-emerald-900/40 text-sm">{regionalSummary.budgetInhouse}</td>
                <td className="py-3.5 px-2 text-right font-mono text-emerald-200 bg-emerald-900/40 text-base">{regionalSummary.actualInhouse}</td>
                <td className="py-3.5 px-2 text-right font-mono text-white bg-emerald-900/40">{regionalSummary.actualInhouse - regionalSummary.budgetInhouse}</td>
                <td className="py-3.5 px-3 text-center font-mono text-sm">{regionalSummary.actualExternal}</td>
                <td className="py-3.5 px-3 text-center font-mono text-amber-300 text-sm">{regionalSummary.vacantOpen}</td>
                <td className="py-3.5 px-3 text-center font-mono text-emerald-300 text-sm">
                  {regionalSummary.fulfillmentRate.toFixed(0)}%
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL ROSTER SLOTS MODAL */}
      {selectedOutletForSlotsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">
                  Detail Roster Manpower Slot
                </span>
                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2">
                  <i className="fas fa-users-gear text-emerald-400"></i>
                  {selectedOutletForSlotsModal.outlet}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOutletForSlotsModal(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              {(selectedOutletForSlotsModal.data.sections || []).map(sec => {
                const filled = sec.slots.filter(s => s.status === 'FILLED').length;
                const vOpen = sec.slots.filter(s => s.status === 'VACANT_OPEN').length;
                return (
                  <div key={sec.id} className="bg-slate-950/70 p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          sec.division === 'BAR' ? 'bg-amber-500/20 text-amber-300' :
                          sec.division === 'KITCHEN' ? 'bg-rose-500/20 text-rose-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>
                          {sec.division}
                        </span>
                        <h4 className="text-sm font-black text-white uppercase">{sec.name}</h4>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Budget: <strong className="text-white">{sec.budget}</strong></span>
                        <span className="text-emerald-400">Filled: <strong>{filled}</strong></span>
                        {vOpen > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                            {vOpen} Vacant
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {sec.slots.map(slot => (
                        <div
                          key={slot.id}
                          className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                            slot.status === 'FILLED'
                              ? 'bg-emerald-950/20 border-emerald-500/30 text-white'
                              : slot.status === 'VACANT_OPEN'
                              ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                              : 'bg-slate-950 border-white/5 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-slate-400">Slot #{slot.slotNumber}</span>
                            <span className={`font-black ${
                              slot.status === 'FILLED' ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {slot.status}
                            </span>
                          </div>
                          <div className="font-bold uppercase text-[11px] truncate">{slot.position}</div>
                          {slot.remark && (
                            <div className="text-[10px] text-slate-400 italic truncate">{slot.remark}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedOutletForSlotsModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
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

export default RegionalManpowerRecapTable;
