import React, { useState, useMemo } from 'react';
import { AppState, Outlet } from '../types';
import { OUTLETS, REGIONAL_AREAS, MONTHS, INITIAL_STATE } from '../constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { RegionalMatrixReportTable } from './RegionalMatrixReportTable';
import { RegionalCommodityRecapTable } from './RegionalCommodityRecapTable';

interface Props {
  allOutletsData: Record<string, any>;
  data?: AppState;
  selectedMonth: number; // 0..11
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  filterStartDay?: number;
  filterEndDay?: number;
}

interface OutletPattyCashRow {
  outlet: Outlet;
  area: string;
  nonCommodity: number;
  commodity: number;
  maintenance: number;
  asset: number;
  casual: number;
  atk: number;
  cash: number;
  totalSpend: number;
  budget: number;
  remaining: number;
  realizationPct: number;
  txCount: number;
  items: Array<{
    date: string;
    category: string;
    name: string;
    qty: number;
    unit: string;
    price: number;
    subtotal: number;
    pic: string;
    reason: string;
  }>;
}

export const RegionalPattyCashRecapTable: React.FC<Props> = ({
  allOutletsData,
  data,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast,
  filterStartDay = 1,
  filterEndDay
}) => {
  const [localArea, setLocalArea] = useState<string>(selectedArea || 'ALL');
  const [localOutlet, setLocalOutlet] = useState<string>(selectedOutlet || '');
  const [startDay, setStartDay] = useState<number>(filterStartDay || 1);
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const [endDay, setEndDay] = useState<number>(filterEndDay || daysInMonth);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutletForModal, setSelectedOutletForModal] = useState<OutletPattyCashRow | null>(null);
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>('ALL');
  const [activeReportTab, setActiveReportTab] = useState<'CATEGORY_RECAP' | 'COMMODITY_BREAKDOWN' | 'MATRIX_HARIAN' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_LAST_WEEK' | 'COMPARE_LAST_MONTH'>('CATEGORY_RECAP');

  React.useEffect(() => {
    if (selectedArea) setLocalArea(selectedArea);
  }, [selectedArea]);

  React.useEffect(() => {
    if (selectedOutlet !== undefined) setLocalOutlet(selectedOutlet);
  }, [selectedOutlet]);

  React.useEffect(() => {
    if (filterEndDay) setEndDay(filterEndDay);
    else setEndDay(daysInMonth);
  }, [filterEndDay, daysInMonth]);

  const monthName = MONTHS[selectedMonth];
  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // Helper to safely get month state for an outlet
  const getOutletState = (outletName: string): AppState => {
    if (outletName === data?.outlet && data) {
      return data;
    }
    if (allOutletsData) {
      let outData = allOutletsData[outletName];
      if (!outData) {
        const found = Object.keys(allOutletsData).find(
          k => k.toLowerCase() === outletName.toLowerCase() ||
               k.replace(/^SH\s+/i, '').toLowerCase() === outletName.replace(/^SH\s+/i, '').toLowerCase()
        );
        if (found) outData = allOutletsData[found];
      }

      if (outData) {
        const mKey = String(selectedMonth);
        const mData = outData[mKey] || outData[selectedMonth] || outData.monthlyData?.[mKey] || outData.monthlyData?.[selectedMonth];
        if (mData) {
          return {
            ...INITIAL_STATE,
            ...outData,
            ...mData,
            outlet: outletName,
            dailyNonCommodityLedger: mData.dailyNonCommodityLedger || outData.dailyNonCommodityLedger || {},
            dailyCommodityLedger: mData.dailyCommodityLedger || outData.dailyCommodityLedger || {},
            dailyMaintenanceLedger: mData.dailyMaintenanceLedger || outData.dailyMaintenanceLedger || {},
            dailyAssetLedger: mData.dailyAssetLedger || outData.dailyAssetLedger || {},
            dailyCasualLedger: mData.dailyCasualLedger || outData.dailyCasualLedger || {},
            dailyAtkLedger: mData.dailyAtkLedger || outData.dailyAtkLedger || {},
            dailyCashLedger: mData.dailyCashLedger || outData.dailyCashLedger || {},
            expenses: mData.expenses || outData.expenses || {}
          };
        }
        if (outData.expenses || outData.dailyCommodityLedger || outData.dailyNonCommodityLedger) {
          return {
            ...INITIAL_STATE,
            ...outData,
            outlet: outletName
          };
        }
      }
    }
    return {
      ...INITIAL_STATE,
      outlet: outletName,
      expenses: {},
      dailyNonCommodityLedger: {},
      dailyCommodityLedger: {},
      dailyMaintenanceLedger: {},
      dailyAssetLedger: {},
      dailyCasualLedger: {},
      dailyAtkLedger: {},
      dailyCashLedger: {}
    };
  };

  // Determine list of displayed outlets
  const displayedOutlets = useMemo(() => {
    let list: Outlet[] = [...OUTLETS];
    if (localArea !== 'ALL' && REGIONAL_AREAS[localArea]) {
      list = REGIONAL_AREAS[localArea];
    }
    if (localOutlet && localOutlet !== 'ALL') {
      list = list.filter(o => o === localOutlet);
    }
    return list;
  }, [localArea, localOutlet]);

  // Aggregate rows per outlet
  const rows: OutletPattyCashRow[] = useMemo(() => {
    return displayedOutlets.map(outlet => {
      const st = getOutletState(outlet);
      const area = REGIONAL_AREAS['JAKARTA'].includes(outlet) ? 'JAKARTA' :
                   REGIONAL_AREAS['TANGGERANG'].includes(outlet) ? 'TANGGERANG' : 'BEKASI & CIBUBUR';

      let nonCommodity = 0;
      let commodity = 0;
      let maintenance = 0;
      let asset = 0;
      let casual = 0;
      let atk = 0;
      let cash = 0;
      let txCount = 0;
      const itemsList: OutletPattyCashRow['items'] = [];

      const categories = [
        { key: 'nonCommodity', label: 'Non-Commodity', ledgerKey: 'dailyNonCommodityLedger', expKey: 'nonCommodity' },
        { key: 'commodity', label: 'Commodity', ledgerKey: 'dailyCommodityLedger', expKey: 'commodity' },
        { key: 'maintenance', label: 'Maintenance', ledgerKey: 'dailyMaintenanceLedger', expKey: 'maintenance' },
        { key: 'asset', label: 'Asset & Equip', ledgerKey: 'dailyAssetLedger', expKey: 'asset' },
        { key: 'casual', label: 'Casual Staff', ledgerKey: 'dailyCasualLedger', expKey: 'casual' },
        { key: 'atk', label: 'ATK & Print', ledgerKey: 'dailyAtkLedger', expKey: 'atk' },
        { key: 'cash', label: 'Cash Lainnya', ledgerKey: 'dailyCashLedger', expKey: 'cash' },
      ];

      for (let d = startDay; d <= endDay; d++) {
        const dStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;

        categories.forEach(cat => {
          const ledger = (st as any)[cat.ledgerKey]?.[dStr];
          let catDaySpend = 0;

          if (Array.isArray(ledger) && ledger.length > 0) {
            ledger.forEach((it: any) => {
              if (!it) return;
              const q = Number(it.qty) || 1;
              const p = Number(it.price) || 0;
              const sub = q * p;
              catDaySpend += sub;
              txCount++;
              itemsList.push({
                date: dStr,
                category: cat.label,
                name: it.name || it.item || 'Item',
                qty: q,
                unit: it.unit || 'pcs',
                price: p,
                subtotal: sub,
                pic: it.pic || it.reason || '-',
                reason: it.reason || '-'
              });
            });
          } else if (st.expenses && st.expenses[dStr]) {
            const fb = Number((st.expenses[dStr] as any)[cat.expKey]) || 0;
            if (fb > 0) {
              catDaySpend += fb;
              txCount++;
              itemsList.push({
                date: dStr,
                category: cat.label,
                name: `Biaya ${cat.label}`,
                qty: 1,
                unit: 'trx',
                price: fb,
                subtotal: fb,
                pic: 'Outlet Expense Input',
                reason: `Input Biaya ${cat.label}`
              });
            }
          }

          if (cat.key === 'nonCommodity') nonCommodity += catDaySpend;
          else if (cat.key === 'commodity') commodity += catDaySpend;
          else if (cat.key === 'maintenance') maintenance += catDaySpend;
          else if (cat.key === 'asset') asset += catDaySpend;
          else if (cat.key === 'casual') casual += catDaySpend;
          else if (cat.key === 'atk') atk += catDaySpend;
          else if (cat.key === 'cash') cash += catDaySpend;
        });
      }

      const totalSpend = nonCommodity + commodity + maintenance + asset + casual + atk + cash;
      const anySt = st as any;
      let budget = Number(anySt.pattyCashBudget) || 0;
      if (!budget && anySt.monthlyPattyCashCategoryBudgets) {
        const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        const mBudgets = anySt.monthlyPattyCashCategoryBudgets[monthPrefix] || anySt.monthlyPattyCashCategoryBudgets[String(selectedMonth)];
        if (mBudgets) {
          budget = (Object.values(mBudgets) as any[]).reduce<number>((acc: number, v: any): number => acc + (Number(v) || 0), 0);
        }
      }
      if (!budget && anySt.pattyCashCategoryBudgets) {
        budget = (Object.values(anySt.pattyCashCategoryBudgets) as any[]).reduce<number>((acc: number, v: any): number => acc + (Number(v) || 0), 0);
      }
      if (!budget) budget = 15000000;

      const remaining = budget - totalSpend;
      const realizationPct = budget > 0 ? (totalSpend / budget) * 100 : 0;

      return {
        outlet,
        area,
        nonCommodity,
        commodity,
        maintenance,
        asset,
        casual,
        atk,
        cash,
        totalSpend,
        budget,
        remaining,
        realizationPct,
        txCount,
        items: itemsList.sort((a, b) => b.date.localeCompare(a.date))
      };
    });
  }, [displayedOutlets, allOutletsData, data, selectedMonth, selectedYear, monthPrefix, startDay, endDay]);

  // Group rows by Area
  const areaGroups = useMemo(() => {
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (localArea !== 'ALL' && REGIONAL_AREAS[localArea]) {
      return [{
        areaName: localArea,
        rows: rows.filter(r => (REGIONAL_AREAS[localArea] || []).includes(r.outlet))
      }];
    }
    return areas.map(a => ({
      areaName: a,
      rows: rows.filter(r => (REGIONAL_AREAS[a] || []).includes(r.outlet))
    })).filter(g => g.rows.length > 0);
  }, [localArea, rows]);

  // Grand Total Regional
  const grandTotal = useMemo(() => {
    return rows.reduce((acc, r) => ({
      nonCommodity: acc.nonCommodity + r.nonCommodity,
      commodity: acc.commodity + r.commodity,
      maintenance: acc.maintenance + r.maintenance,
      asset: acc.asset + r.asset,
      casual: acc.casual + r.casual,
      atk: acc.atk + r.atk,
      cash: acc.cash + r.cash,
      totalSpend: acc.totalSpend + r.totalSpend,
      budget: acc.budget + r.budget,
      remaining: acc.remaining + r.remaining,
      txCount: acc.txCount + r.txCount
    }), {
      nonCommodity: 0,
      commodity: 0,
      maintenance: 0,
      asset: 0,
      casual: 0,
      atk: 0,
      cash: 0,
      totalSpend: 0,
      budget: 0,
      remaining: 0,
      txCount: 0
    });
  }, [rows]);

  const grandRealizationPct = grandTotal.budget > 0 ? (grandTotal.totalSpend / grandTotal.budget) * 100 : 0;

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Shabu Hachi Regional Analytics';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('REKAP_REGIONAL_PATTY_CASH');
      ws.addRow(['LAPORAN REKAPITULASI PATTY CASH REGIONAL PER OUTLET']);
      ws.addRow([`Periode: ${monthName} ${selectedYear} (Tanggal ${startDay} - ${endDay})`]);
      ws.addRow([`Filter Area: ${localArea} | Total Outlet: ${rows.length}`]);
      ws.addRow([]);

      const headers = [
        'No',
        'Area',
        'Nama Outlet',
        'Non-Commodity (Rp)',
        'Commodity (Rp)',
        'Maintenance (Rp)',
        'Asset & Equip (Rp)',
        'Casual Staff (Rp)',
        'ATK & Print (Rp)',
        'Cash Lainnya (Rp)',
        'Total Belanja (Rp)',
        'Budget Plafond (Rp)',
        'Sisa Budget (Rp)',
        'Realisasi (%)',
        'Status'
      ];
      const hRow = ws.addRow(headers);
      hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };

      let rowNo = 1;
      areaGroups.forEach(grp => {
        const gRow = ws.addRow([`AREA: ${grp.areaName}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        gRow.font = { bold: true, color: { argb: 'FFF59E0B' } };
        gRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' }
        };

        let subNon = 0, subCom = 0, subMnt = 0, subAst = 0, subCas = 0, subAtk = 0, subCsh = 0, subTot = 0, subBdg = 0;

        grp.rows.forEach(r => {
          subNon += r.nonCommodity;
          subCom += r.commodity;
          subMnt += r.maintenance;
          subAst += r.asset;
          subCas += r.casual;
          subAtk += r.atk;
          subCsh += r.cash;
          subTot += r.totalSpend;
          subBdg += r.budget;

          const status = r.realizationPct > 100 ? 'OVER BUDGET' : r.realizationPct >= 80 ? 'WASPADA' : 'AMAN';
          ws.addRow([
            rowNo++,
            grp.areaName,
            r.outlet,
            r.nonCommodity,
            r.commodity,
            r.maintenance,
            r.asset,
            r.casual,
            r.atk,
            r.cash,
            r.totalSpend,
            r.budget,
            r.remaining,
            `${r.realizationPct.toFixed(1)}%`,
            status
          ]);
        });

        // Area Subtotal
        const subRem = subBdg - subTot;
        const subPct = subBdg > 0 ? (subTot / subBdg) * 100 : 0;
        const sRow = ws.addRow([
          '',
          `SUBTOTAL ${grp.areaName}`,
          '',
          subNon,
          subCom,
          subMnt,
          subAst,
          subCas,
          subAtk,
          subCsh,
          subTot,
          subBdg,
          subRem,
          `${subPct.toFixed(1)}%`,
          subPct > 100 ? 'OVER BUDGET' : 'NORMAL'
        ]);
        sRow.font = { bold: true };
        sRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
      });

      // Grand Total
      const gtRow = ws.addRow([
        '',
        'GRAND TOTAL REGIONAL',
        '',
        grandTotal.nonCommodity,
        grandTotal.commodity,
        grandTotal.maintenance,
        grandTotal.asset,
        grandTotal.casual,
        grandTotal.atk,
        grandTotal.cash,
        grandTotal.totalSpend,
        grandTotal.budget,
        grandTotal.remaining,
        `${grandRealizationPct.toFixed(1)}%`,
        grandRealizationPct > 100 ? 'OVER BUDGET' : 'AMAN'
      ]);
      gtRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      gtRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' }
      };

      ws.columns.forEach(col => {
        col.width = 16;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekap_Patty_Cash_Regional_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mendownload Excel Rekap Patty Cash Regional!', 'success');
    } catch (e) {
      console.error(e);
      showToast?.('Gagal export Excel.', 'error');
    }
  };

  // Copy WhatsApp
  const handleCopyWhatsApp = () => {
    let text = `*💼 REKAPITULASI PATTY CASH REGIONAL SHABU HACHI*\n`;
    text += `*Periode:* ${monthName} ${selectedYear} (Tgl ${startDay} - ${endDay})\n`;
    text += `*Area:* ${localArea}\n`;
    text += `------------------------------------\n\n`;

    text += `*📊 RINGKASAN REGIONAL:*\n`;
    text += `• Total Realisasi: *Rp ${grandTotal.totalSpend.toLocaleString('id-ID')}*\n`;
    text += `• Total Plafond Budget: *Rp ${grandTotal.budget.toLocaleString('id-ID')}*\n`;
    text += `• Sisa Budget: *Rp ${grandTotal.remaining.toLocaleString('id-ID')}*\n`;
    text += `• Realisasi Budget: *${grandRealizationPct.toFixed(1)}%*\n\n`;

    text += `*🏷️ BREAKDOWN KATEGORI:*\n`;
    text += `• Non-Commodity: Rp ${grandTotal.nonCommodity.toLocaleString('id-ID')}\n`;
    text += `• Commodity: Rp ${grandTotal.commodity.toLocaleString('id-ID')}\n`;
    text += `• Maintenance: Rp ${grandTotal.maintenance.toLocaleString('id-ID')}\n`;
    text += `• Asset & Equip: Rp ${grandTotal.asset.toLocaleString('id-ID')}\n`;
    text += `• Casual Staff: Rp ${grandTotal.casual.toLocaleString('id-ID')}\n`;
    text += `• ATK & Print: Rp ${grandTotal.atk.toLocaleString('id-ID')}\n`;
    text += `• Cash Lainnya: Rp ${grandTotal.cash.toLocaleString('id-ID')}\n\n`;

    areaGroups.forEach(grp => {
      text += `📍 *AREA ${grp.areaName}*\n`;
      let aTot = 0;
      let aBdg = 0;

      grp.rows.forEach(r => {
        text += `• *${r.outlet}*: Rp ${r.totalSpend.toLocaleString('id-ID')} (${r.realizationPct.toFixed(0)}%)\n`;
        aTot += r.totalSpend;
        aBdg += r.budget;
      });
      const aPct = aBdg > 0 ? (aTot / aBdg) * 100 : 0;
      text += `👉 *Subtotal ${grp.areaName}:* Rp ${aTot.toLocaleString('id-ID')} / Rp ${aBdg.toLocaleString('id-ID')} (${aPct.toFixed(0)}%)\n`;
      text += `------------------------------------\n\n`;
    });

    text += `_Generated via Shabu Hachi Regional Management Suite_`;

    navigator.clipboard.writeText(text);
    showToast?.('Laporan Patty Cash Regional disalin ke WhatsApp!', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER BANNER WITH EXECUTIVE KPIS */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 p-6 rounded-3xl border border-amber-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <i className="fas fa-wallet text-lg"></i>
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                  Laporan Rekapitulasi Patty Cash Regional per Outlet
                </h2>
                <p className="text-xs text-slate-400 font-bold mt-0.5">
                  Periode: {monthName} {selectedYear} (Tanggal {startDay} - {endDay}) • Sesuai Data Input Outlet
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <i className="fas fa-file-excel"></i>
              Export Excel
            </button>
            <button
              onClick={handleCopyWhatsApp}
              className="px-4 py-2.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-700/20 transition-all cursor-pointer"
            >
              <i className="fab fa-whatsapp"></i>
              Salin WA Rekap
            </button>
          </div>
        </div>

        {/* 4 KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Total Belanja Regional</span>
              <i className="fas fa-receipt text-amber-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">
              Rp {(grandTotal.totalSpend / 1000000).toFixed(1)} <span className="text-xs font-bold">JT</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Rp {grandTotal.totalSpend.toLocaleString('id-ID')} ({grandTotal.txCount} item/trx)
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Plafond Budget Regional</span>
              <i className="fas fa-money-bill-wave text-emerald-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              Rp {(grandTotal.budget / 1000000).toFixed(0)} <span className="text-xs font-bold">JT</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Rp {grandTotal.budget.toLocaleString('id-ID')}
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>Sisa Budget Regional</span>
              <i className="fas fa-piggy-bank text-indigo-400"></i>
            </div>
            <div className={`text-2xl sm:text-3xl font-black mt-1 ${grandTotal.remaining >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
              Rp {(grandTotal.remaining / 1000000).toFixed(1)} <span className="text-xs font-bold">JT</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Rp {grandTotal.remaining.toLocaleString('id-ID')}
            </p>
          </div>

          <div className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <span>% Realisasi Regional</span>
              <i className="fas fa-chart-pie text-cyan-400"></i>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-cyan-300 mt-1">
              {grandRealizationPct.toFixed(1)}%
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Status: {grandRealizationPct > 100 ? 'Over Budget' : grandRealizationPct >= 80 ? 'Waspada' : 'Aman'}
            </p>
          </div>
        </div>

        {/* Category Breakdown bar */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Breakdown Pengeluaran:</span>
          <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-xl text-blue-300 text-xs font-bold">
            Non-Comm: Rp {(grandTotal.nonCommodity / 1000000).toFixed(1)}M
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl text-amber-300 text-xs font-bold">
            Commodity: Rp {(grandTotal.commodity / 1000000).toFixed(1)}M
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl text-emerald-300 text-xs font-bold">
            Maintenance: Rp {(grandTotal.maintenance / 1000000).toFixed(1)}M
          </div>
          <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 rounded-xl text-purple-300 text-xs font-bold">
            Asset: Rp {(grandTotal.asset / 1000000).toFixed(1)}M
          </div>
          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-xl text-rose-300 text-xs font-bold">
            Casual: Rp {(grandTotal.casual / 1000000).toFixed(1)}M
          </div>
          <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-xl text-cyan-300 text-xs font-bold">
            ATK: Rp {(grandTotal.atk / 1000000).toFixed(1)}M
          </div>
          {grandTotal.cash > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 rounded-xl text-orange-300 text-xs font-bold">
              Cash: Rp {(grandTotal.cash / 1000000).toFixed(1)}M
            </div>
          )}
        </div>
      </div>

      {/* VIEW TABS BAR */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-2 rounded-2xl border border-white/10 no-print">
        <button
          onClick={() => setActiveReportTab('CATEGORY_RECAP')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'CATEGORY_RECAP'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-table-cells"></i> Rekap Kategori
        </button>
        <button
          onClick={() => setActiveReportTab('COMMODITY_BREAKDOWN')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'COMMODITY_BREAKDOWN'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : 'text-emerald-400 hover:text-white hover:bg-emerald-500/10'
          }`}
        >
          <i className="fas fa-utensils"></i> Belanja Commodity (Bar & Kitchen)
        </button>
        <button
          onClick={() => setActiveReportTab('MATRIX_HARIAN')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'MATRIX_HARIAN'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-calendar-days"></i> Matriks Harian (1-{daysInMonth})
        </button>
        <button
          onClick={() => setActiveReportTab('WEEKLY')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'WEEKLY'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-calendar-week"></i> Rekap Weekly (W1-W5)
        </button>
        <button
          onClick={() => setActiveReportTab('MONTHLY')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'MONTHLY'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-calendar"></i> Rekap Monthly (Jan-Des)
        </button>
        <button
          onClick={() => setActiveReportTab('YTD')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'YTD'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-chart-line"></i> Rekap YTD Kumulatif
        </button>
        <button
          onClick={() => setActiveReportTab('COMPARE_LAST_WEEK')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'COMPARE_LAST_WEEK'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-arrow-trend-up"></i> Compare Last Week
        </button>
        <button
          onClick={() => setActiveReportTab('COMPARE_LAST_MONTH')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'COMPARE_LAST_MONTH'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <i className="fas fa-arrows-split-up-and-left"></i> Compare Last Month
        </button>
      </div>

      {activeReportTab === 'COMMODITY_BREAKDOWN' && (
        <div className="mt-4">
          <RegionalCommodityRecapTable
            allOutletsData={allOutletsData || {}}
            data={data}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            selectedArea={localArea}
            selectedOutlet={localOutlet}
            onSelectOutlet={onSelectOutlet || setLocalOutlet}
            showToast={showToast}
          />
        </div>
      )}

      {activeReportTab !== 'CATEGORY_RECAP' && activeReportTab !== 'COMMODITY_BREAKDOWN' && (
        <RegionalMatrixReportTable
          title="Laporan Rekapitulasi Patty Cash Regional"
          subtitle="Laporan konsolidasi Patty Cash: Matriks Tanggal Harian (1-31), Weekly (W1-W5), Bulanan (Jan-Des), YTD Kumulatif, Compare Last Week & Compare Last Month"
          badgeLabel="Regional Patty Cash"
          icon="fa-receipt"
          themeColor="amber"
          allOutletsData={allOutletsData || {}}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={localArea}
          selectedOutlet={localOutlet}
          onSelectOutlet={onSelectOutlet || setLocalOutlet}
          showToast={showToast}
          initialViewMode={
            activeReportTab === 'MATRIX_HARIAN'
              ? 'HARIAN'
              : activeReportTab === 'WEEKLY'
              ? 'WEEKLY'
              : activeReportTab === 'MONTHLY'
              ? 'MONTHLY'
              : activeReportTab === 'YTD'
              ? 'YTD'
              : activeReportTab === 'COMPARE_LAST_MONTH'
              ? 'COMPARE_MONTH'
              : 'COMPARE_WEEK'
          }
          extractDailyValue={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const LEDGER_KEYS = [
              'dailyNonCommodityLedger',
              'dailyCommodityLedger',
              'dailyMaintenanceLedger',
              'dailyAssetLedger',
              'dailyCasualLedger',
              'dailyAtkLedger',
              'dailyCashLedger'
            ];
            let sum = 0;
            LEDGER_KEYS.forEach(lk => {
              let list = mData[lk]?.[dateStr] || outletMonths[lk]?.[dateStr];
              if (!list) {
                for (const k of Object.keys(outletMonths)) {
                  if (outletMonths[k]?.[lk]?.[dateStr]) {
                    list = outletMonths[k][lk][dateStr];
                    break;
                  }
                }
              }
              if (Array.isArray(list)) {
                sum += list.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
              }
            });
            return sum;
          }}
          extractDailyTxCount={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const LEDGER_KEYS = [
              'dailyNonCommodityLedger',
              'dailyCommodityLedger',
              'dailyMaintenanceLedger',
              'dailyAssetLedger',
              'dailyCasualLedger',
              'dailyAtkLedger',
              'dailyCashLedger'
            ];
            let count = 0;
            LEDGER_KEYS.forEach(lk => {
              let list = mData[lk]?.[dateStr] || outletMonths[lk]?.[dateStr];
              if (!list) {
                for (const k of Object.keys(outletMonths)) {
                  if (outletMonths[k]?.[lk]?.[dateStr]) {
                    list = outletMonths[k][lk][dateStr];
                    break;
                  }
                }
              }
              if (Array.isArray(list)) {
                count += list.length;
              }
            });
            return count;
          }}
        />
      )}

      {activeReportTab === 'CATEGORY_RECAP' && (
        <>
          {/* FILTER & DATE CONTROLS */}
      <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filter Area:</span>
          {['ALL', 'JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'].map(area => (
            <button
              key={area}
              onClick={() => {
                setLocalArea(area);
                if (area !== 'ALL' && localOutlet && !REGIONAL_AREAS[area]?.includes(localOutlet as Outlet)) {
                  setLocalOutlet('');
                }
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                localArea === area
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {area === 'ALL' ? '🌐 Semua Area' : `📍 ${area}`}
            </button>
          ))}
        </div>

        {/* Date Range quick buttons */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Range Tanggal:</span>
          <button
            onClick={() => { setStartDay(1); setEndDay(25); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              startDay === 1 && endDay === 25
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-950 text-slate-400 hover:text-white'
            }`}
          >
            Tgl 1 - 25 (Cut-Off)
          </button>
          <button
            onClick={() => { setStartDay(1); setEndDay(daysInMonth); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              startDay === 1 && endDay === daysInMonth
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-950 text-slate-400 hover:text-white'
            }`}
          >
            Tgl 1 - {daysInMonth} (Full Bulan)
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[200px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Cari outlet..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* REGIONAL TABLE */}
      <div className="bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <i className="fas fa-table text-amber-400"></i>
              Tabel Rekapitulasi Realisasi Belanja Patty Cash per Outlet
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Data dihitung real-time dari input transaksi belanja masing-masing outlet
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-4 min-w-[170px]">Nama Outlet</th>
                <th className="py-3 px-3 text-right">Non-Comm</th>
                <th className="py-3 px-3 text-right">Commodity</th>
                <th className="py-3 px-3 text-right">Maint.</th>
                <th className="py-3 px-3 text-right">Asset</th>
                <th className="py-3 px-3 text-right">Casual</th>
                <th className="py-3 px-3 text-right">ATK</th>
                <th className="py-3 px-3 text-right">Cash</th>
                <th className="py-3 px-4 text-right bg-amber-950/30 text-amber-400 min-w-[130px]">Total Belanja</th>
                <th className="py-3 px-3 text-right text-slate-400 min-w-[110px]">Budget</th>
                <th className="py-3 px-3 text-right min-w-[110px]">Sisa Budget</th>
                <th className="py-3 px-3 text-center min-w-[90px]">Realisasi</th>
                <th className="py-3 px-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {areaGroups.map(group => {
                const filteredRows = group.rows.filter(r =>
                  !searchQuery || r.outlet.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (filteredRows.length === 0) return null;

                let subNon = 0, subCom = 0, subMnt = 0, subAst = 0, subCas = 0, subAtk = 0, subCsh = 0, subTot = 0, subBdg = 0;

                return (
                  <React.Fragment key={group.areaName}>
                    {/* Area Header Row */}
                    <tr className="bg-slate-950/90 text-amber-400 font-black text-[11px] border-y border-amber-500/20">
                      <td colSpan={14} className="py-2.5 px-4 uppercase tracking-widest flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-map-marker-alt"></i> AREA {group.areaName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {filteredRows.length} Outlet
                        </span>
                      </td>
                    </tr>

                    {filteredRows.map((r, rIdx) => {
                      subNon += r.nonCommodity;
                      subCom += r.commodity;
                      subMnt += r.maintenance;
                      subAst += r.asset;
                      subCas += r.casual;
                      subAtk += r.atk;
                      subCsh += r.cash;
                      subTot += r.totalSpend;
                      subBdg += r.budget;

                      const isOverBudget = r.realizationPct > 100;
                      const isWarning = r.realizationPct >= 80 && !isOverBudget;

                      return (
                        <tr key={r.outlet} className="hover:bg-white/5 transition-colors group">
                          <td className="py-3 px-3 text-center text-slate-500 font-bold">{rIdx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-black text-white text-xs uppercase tracking-tight flex items-center gap-2">
                              {r.outlet}
                              {r.txCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                                  {r.txCount} trx
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              Area {r.area}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.nonCommodity > 0 ? `Rp ${(r.nonCommodity / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.commodity > 0 ? `Rp ${(r.commodity / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.maintenance > 0 ? `Rp ${(r.maintenance / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.asset > 0 ? `Rp ${(r.asset / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.casual > 0 ? `Rp ${(r.casual / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.atk > 0 ? `Rp ${(r.atk / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {r.cash > 0 ? `Rp ${(r.cash / 1000).toLocaleString('id-ID')}k` : '-'}
                          </td>
                          <td className="py-3 px-4 text-right bg-amber-950/20 font-mono font-black text-amber-300 text-xs">
                            Rp {r.totalSpend.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400 text-xs">
                            Rp {r.budget.toLocaleString('id-ID')}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono text-xs ${r.remaining >= 0 ? 'text-slate-300' : 'text-rose-400 font-bold'}`}>
                            Rp {r.remaining.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isOverBudget
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : isWarning
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {r.realizationPct.toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => setSelectedOutletForModal(r)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                              title="Lihat detail item belanja"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Area Subtotal Row */}
                    {(() => {
                      const subRem = subBdg - subTot;
                      const subPct = subBdg > 0 ? (subTot / subBdg) * 100 : 0;
                      return (
                        <tr className="bg-slate-950/60 font-black text-xs text-slate-300 border-b border-white/10">
                          <td colSpan={2} className="py-2.5 px-4 uppercase text-amber-400">
                            Subtotal {group.areaName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subNon / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subCom / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subMnt / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subAst / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subCas / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subAtk / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-3 text-right font-mono">Rp {(subCsh / 1000).toLocaleString('id-ID')}k</td>
                          <td className="py-2.5 px-4 text-right font-mono font-black text-amber-400 bg-amber-950/40">
                            Rp {subTot.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            Rp {subBdg.toLocaleString('id-ID')}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${subRem >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                            Rp {subRem.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="font-bold text-[10px] text-amber-300">
                              {subPct.toFixed(0)}%
                            </span>
                          </td>
                          <td></td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}

              {/* GRAND TOTAL REGIONAL ROW */}
              <tr className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 text-white font-black text-xs border-t-2 border-amber-500">
                <td colSpan={2} className="py-3.5 px-4 uppercase tracking-widest text-amber-300">
                  🏆 GRAND TOTAL REGIONAL
                </td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.nonCommodity / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.commodity / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.maintenance / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.asset / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.casual / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.atk / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">Rp {(grandTotal.cash / 1000).toLocaleString('id-ID')}k</td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-amber-400 text-sm bg-amber-900/40">
                  Rp {grandTotal.totalSpend.toLocaleString('id-ID')}
                </td>
                <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                  Rp {grandTotal.budget.toLocaleString('id-ID')}
                </td>
                <td className={`py-3.5 px-3 text-right font-mono font-bold ${grandTotal.remaining >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                  Rp {grandTotal.remaining.toLocaleString('id-ID')}
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="px-2 py-1 rounded-md bg-amber-500 text-slate-950 font-black text-[11px]">
                    {grandRealizationPct.toFixed(0)}%
                  </span>
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* OUTLET DETAIL MODAL */}
      {selectedOutletForModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
            <div className="p-6 bg-slate-950 border-b border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                  Detail Item Belanja Patty Cash • Area {selectedOutletForModal.area}
                </span>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mt-0.5">
                  {selectedOutletForModal.outlet}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOutletForModal(null)}
                className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Belanja</span>
                  <div className="text-xl font-black text-amber-400 mt-1">Rp {selectedOutletForModal.totalSpend.toLocaleString('id-ID')}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Budget Plafond</span>
                  <div className="text-xl font-black text-white mt-1">Rp {selectedOutletForModal.budget.toLocaleString('id-ID')}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Sisa Budget</span>
                  <div className={`text-xl font-black mt-1 ${selectedOutletForModal.remaining >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
                    Rp {selectedOutletForModal.remaining.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">% Realisasi</span>
                  <div className="text-xl font-black text-cyan-300 mt-1">{selectedOutletForModal.realizationPct.toFixed(1)}%</div>
                </div>
              </div>

              {/* Category filter pills in modal */}
              <div className="flex flex-wrap gap-2">
                {['ALL', 'Non-Commodity', 'Commodity', 'Maintenance', 'Asset & Equip', 'Casual Staff', 'ATK & Print', 'Cash Lainnya'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setModalCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      modalCategoryFilter === cat
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-white/10 font-bold">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-4">Nama Item Belanja</th>
                      <th className="py-2.5 px-2 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Harga</th>
                      <th className="py-2.5 px-4 text-right text-amber-400">Subtotal</th>
                      <th className="py-2.5 px-3">PIC / Keperluan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(() => {
                      const filteredItems = selectedOutletForModal.items.filter(it => {
                        if (modalCategoryFilter === 'ALL') return true;
                        return it.category.toLowerCase().includes(modalCategoryFilter.toLowerCase());
                      });

                      if (filteredItems.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500 font-bold">
                              Tidak ada rincian item belanja untuk filter ini.
                            </td>
                          </tr>
                        );
                      }

                      return filteredItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="py-2 px-3 text-slate-500 font-bold">{idx + 1}</td>
                          <td className="py-2 px-3 text-slate-300 font-mono text-[11px]">{it.date}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-amber-300">
                              {it.category}
                            </span>
                          </td>
                          <td className="py-2 px-4 font-black text-white text-xs">{it.name}</td>
                          <td className="py-2 px-2 text-right text-slate-300">{it.qty} {it.unit}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-400">Rp {it.price.toLocaleString('id-ID')}</td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-amber-400">Rp {it.subtotal.toLocaleString('id-ID')}</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">{it.pic}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedOutletForModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
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

export default RegionalPattyCashRecapTable;
