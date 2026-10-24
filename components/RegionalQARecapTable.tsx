import React, { useState, useMemo } from 'react';
import { AppState, QAData } from '../types';
import { 
  OUTLETS, 
  REGIONAL_AREAS, 
  getAreaForOutlet, 
  QA_PASSING_TIERS, 
  getQaScoreTier,
  getActiveOutletNames,
  getActiveRegionalAreas
} from '../constants';
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

type QuarterType = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ROLLING';

interface OutletMonthlyQAResult {
  monthIdx: number;
  monthName: string;
  kitchenAvg: number;
  barAvg: number;
  serviceAvg: number;
  overallAvg: number;
  auditCount: number;
  audits: { date: string; kitchen: number; bar: number; service: number; overall: number; data?: QAData }[];
}

export interface OutletQuarterlyQARow {
  outlet: string;
  area: string;
  months: OutletMonthlyQAResult[];
  kitchen3MonthAvg: number;
  bar3MonthAvg: number;
  service3MonthAvg: number;
  finalPointAchievement: number;
  tierInfo: ReturnType<typeof getQaScoreTier>;
  totalAuditsCount: number;
}

export const RegionalQARecapTable: React.FC<Props> = ({
  allOutletsData,
  globalData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  // Period settings
  const [qaYear, setQaYear] = useState<number>(selectedYear);
  const [qaQuarter, setQaQuarter] = useState<QuarterType>(() => {
    if (selectedMonth <= 2) return 'Q1';
    if (selectedMonth <= 5) return 'Q2';
    if (selectedMonth <= 8) return 'Q3';
    return 'Q4';
  });

  const [activeAreaFilter, setActiveAreaFilter] = useState<string>(selectedArea || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDivView, setActiveDivView] = useState<'ALL' | 'BAR' | 'KITCHEN' | 'SERVICE'>('ALL');
  const [selectedOutletForAuditModal, setSelectedOutletForAuditModal] = useState<OutletQuarterlyQARow | null>(null);

  // Sync if props change
  React.useEffect(() => {
    if (selectedArea) setActiveAreaFilter(selectedArea);
  }, [selectedArea]);

  // Determine the 3 month indices
  const quarterMonthIndices = useMemo(() => {
    if (qaQuarter === 'Q1') return [0, 1, 2];
    if (qaQuarter === 'Q2') return [3, 4, 5];
    if (qaQuarter === 'Q3') return [6, 7, 8];
    if (qaQuarter === 'Q4') return [9, 10, 11];
    // ROLLING: 3 consecutive months ending in selectedMonth
    const cur = selectedMonth;
    const m1 = (cur - 2 + 12) % 12;
    const m2 = (cur - 1 + 12) % 12;
    const m3 = cur;
    return [m1, m2, m3];
  }, [qaQuarter, selectedMonth]);

  const quarterLabel = useMemo(() => {
    if (qaQuarter === 'Q1') return `Kuartal 1 (Jan - Mar ${qaYear})`;
    if (qaQuarter === 'Q2') return `Kuartal 2 (Apr - Jun ${qaYear})`;
    if (qaQuarter === 'Q3') return `Kuartal 3 (Jul - Sep ${qaYear})`;
    if (qaQuarter === 'Q4') return `Kuartal 4 (Okt - Des ${qaYear})`;
    return `Rolling 3 Bulan (${MONTH_NAMES[quarterMonthIndices[0]]} - ${MONTH_NAMES[quarterMonthIndices[2]]} ${qaYear})`;
  }, [qaQuarter, qaYear, quarterMonthIndices]);

  // Target outlets list
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

  // Compute QA data for every outlet
  const outletQARecords = useMemo<OutletQuarterlyQARow[]>(() => {
    return targetOutlets.map(outletName => {
      const area = getAreaForOutlet(outletName) || 'JAKARTA';
      const outletRawData = allOutletsData?.[outletName] || {};

      const monthsResult: OutletMonthlyQAResult[] = quarterMonthIndices.map(mIdx => {
        const monthPrefix = `${qaYear}-${String(mIdx + 1).padStart(2, '0')}`;
        const auditsMap: Record<string, QAData> = {};

        // 1. From allOutletsData[outletName]
        const mData = outletRawData[String(mIdx)] || outletRawData[mIdx] || {};
        if (mData?.dailyQA) {
          Object.entries(mData.dailyQA).forEach(([d, q]) => {
            if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
          });
        }
        if (outletRawData.dailyQA) {
          Object.entries(outletRawData.dailyQA).forEach(([d, q]) => {
            if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
          });
        }

        // 2. If this is the active outlet in globalData
        if (globalData && (globalData.outlet === outletName || !selectedOutlet)) {
          if (globalData.dailyQA) {
            Object.entries(globalData.dailyQA).forEach(([d, q]) => {
              if (d.startsWith(monthPrefix) && q) auditsMap[d] = q as QAData;
            });
          }
        }

        const auditList: { date: string; kitchen: number; bar: number; service: number; overall: number; data?: QAData }[] = [];

        Object.entries(auditsMap).forEach(([date, qa]) => {
          const getSec = (sec?: any) => {
            if (!sec) return 0;
            const vals = [Number(sec.product) || 0, Number(sec.cleanliness) || 0, Number(sec.grooming) || 0].filter(v => v > 0);
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          };
          const k = getSec(qa.kitchen);
          const b = getSec(qa.bar);
          const s = getSec(qa.service);
          if (k > 0 || b > 0 || s > 0) {
            const overall = (k + b + s) / 3;
            auditList.push({
              date,
              kitchen: Number(k.toFixed(2)),
              bar: Number(b.toFixed(2)),
              service: Number(s.toFixed(2)),
              overall: Number(overall.toFixed(2)),
              data: qa
            });
          }
        });

        auditList.sort((a, b) => a.date.localeCompare(b.date));

        const kList = auditList.filter(a => a.kitchen > 0);
        const bList = auditList.filter(a => a.bar > 0);
        const sList = auditList.filter(a => a.service > 0);

        const kitchenAvg = kList.length > 0
          ? Number((kList.reduce((acc, a) => acc + a.kitchen, 0) / kList.length).toFixed(2))
          : 0;
        const barAvg = bList.length > 0
          ? Number((bList.reduce((acc, a) => acc + a.bar, 0) / bList.length).toFixed(2))
          : 0;
        const serviceAvg = sList.length > 0
          ? Number((sList.reduce((acc, a) => acc + a.service, 0) / sList.length).toFixed(2))
          : 0;

        const activeDivCount = (kitchenAvg > 0 ? 1 : 0) + (barAvg > 0 ? 1 : 0) + (serviceAvg > 0 ? 1 : 0);
        const overallAvg = activeDivCount > 0
          ? Number(((kitchenAvg + barAvg + serviceAvg) / 3).toFixed(2))
          : 0;

        return {
          monthIdx: mIdx,
          monthName: MONTH_NAMES[mIdx],
          kitchenAvg,
          barAvg,
          serviceAvg,
          overallAvg,
          auditCount: auditList.length,
          audits: auditList
        };
      });

      // 3-Month Averages across the 3 months
      const validKitchenMonths = monthsResult.filter(m => m.kitchenAvg > 0);
      const kitchen3MonthAvg = validKitchenMonths.length > 0
        ? Number((validKitchenMonths.reduce((acc, m) => acc + m.kitchenAvg, 0) / validKitchenMonths.length).toFixed(2))
        : 0;

      const validBarMonths = monthsResult.filter(m => m.barAvg > 0);
      const bar3MonthAvg = validBarMonths.length > 0
        ? Number((validBarMonths.reduce((acc, m) => acc + m.barAvg, 0) / validBarMonths.length).toFixed(2))
        : 0;

      const validServiceMonths = monthsResult.filter(m => m.serviceAvg > 0);
      const service3MonthAvg = validServiceMonths.length > 0
        ? Number((validServiceMonths.reduce((acc, m) => acc + m.serviceAvg, 0) / validServiceMonths.length).toFixed(2))
        : 0;

      // Final Point Achievement = Average of the 3 divisions over the 3-month period
      const finalPointAchievement = (kitchen3MonthAvg > 0 || bar3MonthAvg > 0 || service3MonthAvg > 0)
        ? Number(((kitchen3MonthAvg + bar3MonthAvg + service3MonthAvg) / 3).toFixed(2))
        : 0;

      const tierInfo = getQaScoreTier(finalPointAchievement);
      const totalAuditsCount = monthsResult.reduce((acc, m) => acc + m.auditCount, 0);

      return {
        outlet: outletName,
        area,
        months: monthsResult,
        kitchen3MonthAvg,
        bar3MonthAvg,
        service3MonthAvg,
        finalPointAchievement,
        tierInfo,
        totalAuditsCount
      };
    });
  }, [targetOutlets, allOutletsData, globalData, quarterMonthIndices, qaYear, selectedOutlet]);

  // Group outlets by area
  const areaGroups = useMemo(() => {
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (activeAreaFilter !== 'ALL' && REGIONAL_AREAS[activeAreaFilter]) {
      return [{ areaName: activeAreaFilter, rows: outletQARecords.filter(r => r.area === activeAreaFilter) }];
    }
    return areas.map(a => ({
      areaName: a,
      rows: outletQARecords.filter(r => r.area === a)
    })).filter(g => g.rows.length > 0);
  }, [outletQARecords, activeAreaFilter]);

  // Overall Regional Summary KPI
  const regionalSummary = useMemo(() => {
    const validRows = outletQARecords.filter(r => r.finalPointAchievement > 0);
    const count = validRows.length || 1;

    const avgKitchen = Number((validRows.reduce((a, b) => a + b.kitchen3MonthAvg, 0) / count).toFixed(2));
    const avgBar = Number((validRows.reduce((a, b) => a + b.bar3MonthAvg, 0) / count).toFixed(2));
    const avgService = Number((validRows.reduce((a, b) => a + b.service3MonthAvg, 0) / count).toFixed(2));
    const finalRegionalPoint = Number(((avgKitchen + avgBar + avgService) / 3).toFixed(2));

    const excellentCount = outletQARecords.filter(r => r.tierInfo.tier === 'EXCELLENT').length;
    const satisfactoryCount = outletQARecords.filter(r => r.tierInfo.tier === 'SATISFACTORY').length;
    const toImproveCount = outletQARecords.filter(r => r.tierInfo.tier === 'TO IMPROVE').length;

    return {
      avgKitchen,
      avgBar,
      avgService,
      finalRegionalPoint,
      regionalTier: getQaScoreTier(finalRegionalPoint),
      excellentCount,
      satisfactoryCount,
      toImproveCount,
      totalOutlets: outletQARecords.length,
      auditedOutlets: validRows.length
    };
  }, [outletQARecords]);

  // Export to Excel handler
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Report QA 3 Bulan');

    // Title
    ws.mergeCells('A1:P1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `REPORT QUALITY ASSURANCE 3 BULAN - REGIONAL RESTORAN`;
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Subtitle
    ws.mergeCells('A2:P2');
    const subCell = ws.getCell('A2');
    subCell.value = `Periode: ${quarterLabel} | Passing Score: EXCELLENT (91-100%) | SATISFACTORY (85-90%) | TO IMPROVE (45-84%)`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Header Rows
    const mNames = quarterMonthIndices.map(i => MONTH_NAMES[i]);
    ws.addRow([]);
    const headerRow1 = ws.addRow([
      'NO', 'AREA', 'OUTLET',
      mNames[0], '', '', '',
      mNames[1], '', '', '',
      mNames[2], '', '', '',
      'HASIL AKHIR RATA-RATA 3 BULAN', '', '', '', 'STATUS PASSING SCORE'
    ]);

    ws.mergeCells(`D4:G4`);
    ws.mergeCells(`H4:K4`);
    ws.mergeCells(`L4:O4`);
    ws.mergeCells(`P4:S4`);

    const headerRow2 = ws.addRow([
      '', '', '',
      'BAR', 'KITCHEN', 'SERVICE', 'RATA-RATA',
      'BAR', 'KITCHEN', 'SERVICE', 'RATA-RATA',
      'BAR', 'KITCHEN', 'SERVICE', 'RATA-RATA',
      'BAR 3M', 'KITCHEN 3M', 'SERVICE 3M', 'POINT AKHIR',
      'STATUS'
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
    outletQARecords.forEach(r => {
      const row = ws.addRow([
        rowIdx++,
        r.area,
        r.outlet,
        `${r.months[0]?.barAvg || 0}%`,
        `${r.months[0]?.kitchenAvg || 0}%`,
        `${r.months[0]?.serviceAvg || 0}%`,
        `${r.months[0]?.overallAvg || 0}%`,
        `${r.months[1]?.barAvg || 0}%`,
        `${r.months[1]?.kitchenAvg || 0}%`,
        `${r.months[1]?.serviceAvg || 0}%`,
        `${r.months[1]?.overallAvg || 0}%`,
        `${r.months[2]?.barAvg || 0}%`,
        `${r.months[2]?.kitchenAvg || 0}%`,
        `${r.months[2]?.serviceAvg || 0}%`,
        `${r.months[2]?.overallAvg || 0}%`,
        `${r.bar3MonthAvg}%`,
        `${r.kitchen3MonthAvg}%`,
        `${r.service3MonthAvg}%`,
        `${r.finalPointAchievement}%`,
        r.tierInfo.label
      ]);

      const isExc = r.tierInfo.tier === 'EXCELLENT';
      const isSat = r.tierInfo.tier === 'SATISFACTORY';
      const statusCell = row.getCell(20);
      statusCell.font = { bold: true, color: { argb: isExc ? 'FF065F46' : isSat ? 'FF1E40AF' : 'FF92400E' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isExc ? 'FFD1FAE5' : isSat ? 'FFDBEAFE' : 'FFFEF3C7' } };
    });

    // Grand Total
    const gtRow = ws.addRow([
      '', 'GRAND TOTAL REGIONAL', '',
      '', '', '', '',
      '', '', '', '',
      '', '', '', '',
      `${regionalSummary.avgBar}%`,
      `${regionalSummary.avgKitchen}%`,
      `${regionalSummary.avgService}%`,
      `${regionalSummary.finalRegionalPoint}%`,
      regionalSummary.regionalTier.label
    ]);
    gtRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    gtRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF78350F' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Report_QA_3_Bulan_Regional_${qaYear}_${qaQuarter}.xlsx`);
    if (showToast) showToast('Export Excel Report QA 3 Bulan berhasil diunduh!', 'success');
  };

  // WhatsApp share handler
  const handleCopyWhatsApp = () => {
    let text = `*📊 REPORT QUALITY ASSURANCE 3 BULAN REGIONAL*\n`;
    text += `*Periode:* ${quarterLabel}\n`;
    text += `*Standar Passing Score:* \n`;
    text += `• EXCELLENT (91.00% - 100%)\n`;
    text += `• SATISFACTORY (85.00% - 90.00%)\n`;
    text += `• TO IMPROVE (45.00% - 84.00%)\n\n`;

    text += `*🏆 RATA-RATA REGIONAL:* *${regionalSummary.finalRegionalPoint}%* [${regionalSummary.regionalTier.label}]\n`;
    text += `• Rata-rata Bar: *${regionalSummary.avgBar}%*\n`;
    text += `• Rata-rata Kitchen: *${regionalSummary.avgKitchen}%*\n`;
    text += `• Rata-rata Service: *${regionalSummary.avgService}%*\n\n`;

    text += `*REKAPAN PER OUTLET:*\n`;
    outletQARecords.forEach((r, idx) => {
      text += `${idx + 1}. *${r.outlet}* (${r.area})\n`;
      text += `   - Bar: ${r.bar3MonthAvg}% | Kitchen: ${r.kitchen3MonthAvg}% | Service: ${r.service3MonthAvg}%\n`;
      text += `   - Point Akhir 3 Bulan: *${r.finalPointAchievement}%* ➔ *${r.tierInfo.label}*\n`;
    });

    navigator.clipboard.writeText(text);
    if (showToast) showToast('Teks laporan QA WhatsApp berhasil disalin!', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* HEADER SECTION WITH FILTERS */}
      <div className="bg-slate-900/95 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-award"></i> Quality Assurance Module
              </span>
              <span className="text-xs text-slate-400 font-bold">Triwulan / Per 3 Bulan</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tight">
              Tabel Report Quality Assurance (3 Bulan) & Passing Score
            </h2>
            <p className="text-xs text-slate-400">
              Evaluasi persentase audit 3 divisi (Bar, Kitchen, Service) selama periode 3 bulan beserta hasil akhir point rata-rata achievement.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Pilihan Kuartal / Periode 3 Bulan:
            </label>
            <div className="grid grid-cols-5 gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-center">
              {(['Q1', 'Q2', 'Q3', 'Q4', 'ROLLING'] as QuarterType[]).map(q => (
                <button
                  key={q}
                  onClick={() => setQaQuarter(q)}
                  className={`py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    qaQuarter === q
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {q === 'ROLLING' ? '3 Bln' : q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Tahun:
            </label>
            <select
              value={qaYear}
              onChange={e => setQaYear(Number(e.target.value))}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Filter Area:
            </label>
            <select
              value={activeAreaFilter}
              onChange={e => setActiveAreaFilter(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-amber-300 outline-none focus:border-amber-500"
            >
              <option value="ALL">🌐 SEMUA AREA</option>
              <option value="JAKARTA">📍 JAKARTA</option>
              <option value="TANGGERANG">📍 TANGGERANG</option>
              <option value="BEKASI & CIBUBUR">📍 BEKASI & CIBUBUR</option>
            </select>
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
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* STANDAR PASSING SCORE BADGES BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 rounded-2xl border border-white/5 text-xs">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold">
            <i className="fas fa-shield-halved text-amber-400"></i>
            <span>Standar Passing Score 3 Divisi:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <i className="fas fa-award text-emerald-400"></i>
              <span className="font-black text-emerald-300">EXCELLENT</span>
              <span className="text-[10px] text-slate-400">(91.00% - 100%)</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <i className="fas fa-check-circle text-blue-400"></i>
              <span className="font-black text-blue-300">SATISFACTORY</span>
              <span className="text-[10px] text-slate-400">(85.00% - 90.00%)</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <i className="fas fa-triangle-exclamation text-amber-400"></i>
              <span className="font-black text-amber-300">TO IMPROVE</span>
              <span className="text-[10px] text-slate-400">(45.00% - 84.00%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* EXECUTIVE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GRAND POINT REGIONAL */}
        <div className="bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-950 p-5 rounded-3xl border border-indigo-500/30 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Rata-Rata Regional 3 Bulan</span>
            <i className="fas fa-trophy text-amber-400"></i>
          </div>
          <div className="text-3xl font-black text-white mt-2">
            {regionalSummary.finalRegionalPoint}%
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${regionalSummary.regionalTier.badgeClass}`}>
              {regionalSummary.regionalTier.label}
            </span>
            <span className="text-[10px] text-slate-400">3 Divisi</span>
          </div>
        </div>

        {/* BAR 3 MONTHS */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-amber-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Bar (3 Bulan)</span>
            <i className="fas fa-wine-glass-alt text-amber-400"></i>
          </div>
          <div className="text-3xl font-black text-amber-300 mt-2">
            {regionalSummary.avgBar}%
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Passing Tier: <span className="font-bold text-white">{getQaScoreTier(regionalSummary.avgBar).label}</span>
          </p>
        </div>

        {/* KITCHEN 3 MONTHS */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-rose-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Kitchen (3 Bulan)</span>
            <i className="fas fa-utensils text-rose-400"></i>
          </div>
          <div className="text-3xl font-black text-rose-300 mt-2">
            {regionalSummary.avgKitchen}%
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Passing Tier: <span className="font-bold text-white">{getQaScoreTier(regionalSummary.avgKitchen).label}</span>
          </p>
        </div>

        {/* SERVICE 3 MONTHS */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-blue-500/20 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Divisi Service (3 Bulan)</span>
            <i className="fas fa-concierge-bell text-blue-400"></i>
          </div>
          <div className="text-3xl font-black text-blue-300 mt-2">
            {regionalSummary.avgService}%
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Passing Tier: <span className="font-bold text-white">{getQaScoreTier(regionalSummary.avgService).label}</span>
          </p>
        </div>
      </div>

      {/* DIVISION FILTER TOGGLE */}
      <div className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-bold px-2">Fokus Kolom Divisi:</span>
          {(['ALL', 'BAR', 'KITCHEN', 'SERVICE'] as const).map(div => (
            <button
              key={div}
              onClick={() => setActiveDivView(div)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeDivView === div
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {div === 'ALL' ? 'Semua Divisi' : div}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 px-3">
          Menampilkan <span className="font-bold text-white">{outletQARecords.length}</span> Outlet
        </div>
      </div>

      {/* MAIN TABLE: REPORT QUALITY ASSURANCE 3 BULAN */}
      <div className="bg-slate-900/90 rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-950/60 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <i className="fas fa-table-cells text-amber-400"></i>
              Matriks Evaluasi Nilai QA 3 Divisi Selama 3 Bulan
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Rincian audit bulanan berjalan dan hasil akhir rata-rata point achievement triwulan
            </p>
          </div>
          <div className="text-xs text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
            {quarterLabel}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* PRIMARY GROUP HEADER */}
              <tr className="bg-slate-950 text-slate-300 uppercase tracking-wider font-black text-[10px] border-b border-white/10">
                <th className="py-3 px-3 w-10 text-center" rowSpan={2}>#</th>
                <th className="py-3 px-4 min-w-[170px]" rowSpan={2}>Nama Outlet</th>
                <th className="py-3 px-3 text-center" rowSpan={2}>Area</th>

                {/* BULAN 1 */}
                <th colSpan={activeDivView === 'ALL' ? 4 : 2} className="py-2 px-3 text-center bg-indigo-950/40 border-l border-white/10 text-indigo-300">
                  {MONTH_NAMES[quarterMonthIndices[0]]} {qaYear}
                </th>

                {/* BULAN 2 */}
                <th colSpan={activeDivView === 'ALL' ? 4 : 2} className="py-2 px-3 text-center bg-purple-950/40 border-l border-white/10 text-purple-300">
                  {MONTH_NAMES[quarterMonthIndices[1]]} {qaYear}
                </th>

                {/* BULAN 3 */}
                <th colSpan={activeDivView === 'ALL' ? 4 : 2} className="py-2 px-3 text-center bg-cyan-950/40 border-l border-white/10 text-cyan-300">
                  {MONTH_NAMES[quarterMonthIndices[2]]} {qaYear}
                </th>

                {/* HASIL AKHIR POINT RATA-RATA 3 BULAN */}
                <th colSpan={activeDivView === 'ALL' ? 4 : 2} className="py-2 px-3 text-center bg-amber-950/60 border-l border-amber-500/40 text-amber-300">
                  HASIL AKHIR RATA-RATA (3 BULAN)
                </th>

                <th className="py-3 px-4 text-center min-w-[130px] border-l border-white/10" rowSpan={2}>
                  Passing Score
                </th>
                <th className="py-3 px-3 text-center w-20 border-l border-white/10" rowSpan={2}>
                  Detail
                </th>
              </tr>

              {/* SECONDARY DIVISION SUB-HEADERS */}
              <tr className="bg-slate-950/90 text-slate-400 font-bold text-[9px] border-b border-white/10">
                {/* Month 1 Subheaders */}
                {activeDivView === 'ALL' ? (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">Bar</th>
                    <th className="py-2 px-2 text-right text-rose-300">Kitchen</th>
                    <th className="py-2 px-2 text-right text-blue-300">Service</th>
                    <th className="py-2 px-2 text-right bg-indigo-900/30 text-white font-black">Rata2</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">{activeDivView}</th>
                    <th className="py-2 px-2 text-right bg-indigo-900/30 text-white font-black">Total Bln</th>
                  </>
                )}

                {/* Month 2 Subheaders */}
                {activeDivView === 'ALL' ? (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">Bar</th>
                    <th className="py-2 px-2 text-right text-rose-300">Kitchen</th>
                    <th className="py-2 px-2 text-right text-blue-300">Service</th>
                    <th className="py-2 px-2 text-right bg-purple-900/30 text-white font-black">Rata2</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">{activeDivView}</th>
                    <th className="py-2 px-2 text-right bg-purple-900/30 text-white font-black">Total Bln</th>
                  </>
                )}

                {/* Month 3 Subheaders */}
                {activeDivView === 'ALL' ? (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">Bar</th>
                    <th className="py-2 px-2 text-right text-rose-300">Kitchen</th>
                    <th className="py-2 px-2 text-right text-blue-300">Service</th>
                    <th className="py-2 px-2 text-right bg-cyan-900/30 text-white font-black">Rata2</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-2 text-right border-l border-white/5 text-amber-300">{activeDivView}</th>
                    <th className="py-2 px-2 text-right bg-cyan-900/30 text-white font-black">Total Bln</th>
                  </>
                )}

                {/* Hasil Akhir 3 Bulan Subheaders */}
                {activeDivView === 'ALL' ? (
                  <>
                    <th className="py-2 px-2 text-right border-l border-amber-500/30 text-amber-400">Bar 3M</th>
                    <th className="py-2 px-2 text-right text-rose-400">Kit 3M</th>
                    <th className="py-2 px-2 text-right text-blue-400">Svc 3M</th>
                    <th className="py-2 px-3 text-right bg-amber-500/20 text-amber-300 font-black">POINT AKHIR</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-2 text-right border-l border-amber-500/30 text-amber-400">{activeDivView} 3M</th>
                    <th className="py-2 px-3 text-right bg-amber-500/20 text-amber-300 font-black">POINT AKHIR</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {areaGroups.map(group => {
                const filteredRows = group.rows.filter(r =>
                  !searchQuery || r.outlet.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (filteredRows.length === 0) return null;

                // Group subtotals
                const count = filteredRows.filter(r => r.finalPointAchievement > 0).length || 1;
                const subKitchen = Number((filteredRows.reduce((a, b) => a + b.kitchen3MonthAvg, 0) / count).toFixed(2));
                const subBar = Number((filteredRows.reduce((a, b) => a + b.bar3MonthAvg, 0) / count).toFixed(2));
                const subService = Number((filteredRows.reduce((a, b) => a + b.service3MonthAvg, 0) / count).toFixed(2));
                const subFinal = Number(((subKitchen + subBar + subService) / 3).toFixed(2));

                return (
                  <React.Fragment key={group.areaName}>
                    {/* Area Header Row */}
                    <tr className="bg-slate-950/90 text-amber-400 font-black text-[11px] border-y border-amber-500/20">
                      <td colSpan={22} className="py-2 px-4 uppercase tracking-widest flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-map-marker-alt"></i> AREA {group.areaName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {filteredRows.length} Outlet
                        </span>
                      </td>
                    </tr>

                    {filteredRows.map((r, rIdx) => {
                      const m1 = r.months[0] || { barAvg: 0, kitchenAvg: 0, serviceAvg: 0, overallAvg: 0 };
                      const m2 = r.months[1] || { barAvg: 0, kitchenAvg: 0, serviceAvg: 0, overallAvg: 0 };
                      const m3 = r.months[2] || { barAvg: 0, kitchenAvg: 0, serviceAvg: 0, overallAvg: 0 };

                      return (
                        <tr
                          key={r.outlet}
                          className="hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                          <td className="py-3 px-3 text-center text-slate-500 font-bold">{rIdx + 1}</td>
                          <td className="py-3 px-4 font-black text-white text-xs uppercase">
                            <div className="flex items-center gap-2">
                              <span>{r.outlet}</span>
                              {r.totalAuditsCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                  {r.totalAuditsCount} Audit
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-400 text-[10px]">{r.area}</td>

                          {/* Bulan 1 Values */}
                          {activeDivView === 'ALL' ? (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">{m1.barAvg > 0 ? `${m1.barAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-rose-300/90">{m1.kitchenAvg > 0 ? `${m1.kitchenAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-blue-300/90">{m1.serviceAvg > 0 ? `${m1.serviceAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-indigo-950/20 text-white">{m1.overallAvg > 0 ? `${m1.overallAvg}%` : '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">
                                {activeDivView === 'BAR' ? (m1.barAvg > 0 ? `${m1.barAvg}%` : '-') :
                                 activeDivView === 'KITCHEN' ? (m1.kitchenAvg > 0 ? `${m1.kitchenAvg}%` : '-') :
                                 (m1.serviceAvg > 0 ? `${m1.serviceAvg}%` : '-')}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-indigo-950/20 text-white">{m1.overallAvg > 0 ? `${m1.overallAvg}%` : '-'}</td>
                            </>
                          )}

                          {/* Bulan 2 Values */}
                          {activeDivView === 'ALL' ? (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">{m2.barAvg > 0 ? `${m2.barAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-rose-300/90">{m2.kitchenAvg > 0 ? `${m2.kitchenAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-blue-300/90">{m2.serviceAvg > 0 ? `${m2.serviceAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-purple-950/20 text-white">{m2.overallAvg > 0 ? `${m2.overallAvg}%` : '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">
                                {activeDivView === 'BAR' ? (m2.barAvg > 0 ? `${m2.barAvg}%` : '-') :
                                 activeDivView === 'KITCHEN' ? (m2.kitchenAvg > 0 ? `${m2.kitchenAvg}%` : '-') :
                                 (m2.serviceAvg > 0 ? `${m2.serviceAvg}%` : '-')}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-purple-950/20 text-white">{m2.overallAvg > 0 ? `${m2.overallAvg}%` : '-'}</td>
                            </>
                          )}

                          {/* Bulan 3 Values */}
                          {activeDivView === 'ALL' ? (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">{m3.barAvg > 0 ? `${m3.barAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-rose-300/90">{m3.kitchenAvg > 0 ? `${m3.kitchenAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono text-blue-300/90">{m3.serviceAvg > 0 ? `${m3.serviceAvg}%` : '-'}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-cyan-950/20 text-white">{m3.overallAvg > 0 ? `${m3.overallAvg}%` : '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-2 text-right font-mono text-amber-300/90 border-l border-white/5">
                                {activeDivView === 'BAR' ? (m3.barAvg > 0 ? `${m3.barAvg}%` : '-') :
                                 activeDivView === 'KITCHEN' ? (m3.kitchenAvg > 0 ? `${m3.kitchenAvg}%` : '-') :
                                 (m3.serviceAvg > 0 ? `${m3.serviceAvg}%` : '-')}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-bold bg-cyan-950/20 text-white">{m3.overallAvg > 0 ? `${m3.overallAvg}%` : '-'}</td>
                            </>
                          )}

                          {/* HASIL AKHIR POINT RATA-RATA (3 BULAN) */}
                          {activeDivView === 'ALL' ? (
                            <>
                              <td className="py-3 px-2 text-right font-mono font-bold text-amber-400 border-l border-amber-500/30 bg-amber-950/10">
                                {r.bar3MonthAvg > 0 ? `${r.bar3MonthAvg}%` : '-'}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-rose-400 bg-amber-950/10">
                                {r.kitchen3MonthAvg > 0 ? `${r.kitchen3MonthAvg}%` : '-'}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-blue-400 bg-amber-950/10">
                                {r.service3MonthAvg > 0 ? `${r.service3MonthAvg}%` : '-'}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-black text-amber-300 bg-amber-500/20 text-sm">
                                {r.finalPointAchievement > 0 ? `${r.finalPointAchievement}%` : '-'}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-2 text-right font-mono font-bold text-amber-400 border-l border-amber-500/30 bg-amber-950/10">
                                {activeDivView === 'BAR' ? (r.bar3MonthAvg > 0 ? `${r.bar3MonthAvg}%` : '-') :
                                 activeDivView === 'KITCHEN' ? (r.kitchen3MonthAvg > 0 ? `${r.kitchen3MonthAvg}%` : '-') :
                                 (r.service3MonthAvg > 0 ? `${r.service3MonthAvg}%` : '-')}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-black text-amber-300 bg-amber-500/20 text-sm">
                                {r.finalPointAchievement > 0 ? `${r.finalPointAchievement}%` : '-'}
                              </td>
                            </>
                          )}

                          {/* PASSING SCORE BADGE */}
                          <td className="py-3 px-4 text-center border-l border-white/10">
                            {r.finalPointAchievement > 0 ? (
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${r.tierInfo.badgeClass}`}>
                                <i className={`fas ${r.tierInfo.icon}`}></i>
                                {r.tierInfo.label}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Belum Ada Audit</span>
                            )}
                          </td>

                          {/* ACTION: AUDIT DETAIL */}
                          <td className="py-3 px-3 text-center border-l border-white/10">
                            <button
                              onClick={() => setSelectedOutletForAuditModal(r)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-[10px] font-bold transition-all cursor-pointer"
                              title="Lihat Rincian Log Audit"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Row per Area */}
                    <tr className="bg-slate-950/70 font-black text-xs text-white border-t border-white/10">
                      <td colSpan={3} className="py-2.5 px-4 uppercase text-amber-400">
                        Subtotal Area {group.areaName}
                      </td>
                      <td colSpan={activeDivView === 'ALL' ? 12 : 6} className="text-center text-slate-500 text-[10px]">
                        Rata-rata 3 Divisi Area:
                      </td>
                      {activeDivView === 'ALL' ? (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono text-amber-400 bg-amber-950/30">{subBar}%</td>
                          <td className="py-2.5 px-2 text-right font-mono text-rose-400 bg-amber-950/30">{subKitchen}%</td>
                          <td className="py-2.5 px-2 text-right font-mono text-blue-400 bg-amber-950/30">{subService}%</td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-300 bg-amber-500/30">{subFinal}%</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono text-amber-400 bg-amber-950/30">
                            {activeDivView === 'BAR' ? `${subBar}%` : activeDivView === 'KITCHEN' ? `${subKitchen}%` : `${subService}%`}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-300 bg-amber-500/30">{subFinal}%</td>
                        </>
                      )}
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${getQaScoreTier(subFinal).badgeClass}`}>
                          {getQaScoreTier(subFinal).label}
                        </span>
                      </td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* GRAND TOTAL REGIONAL ROW */}
              <tr className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 text-white font-black text-xs border-t-2 border-amber-500">
                <td colSpan={3} className="py-3.5 px-4 uppercase tracking-widest text-amber-300 flex items-center gap-2">
                  🏆 GRAND TOTAL REGIONAL (SELURUH OUTLET)
                </td>
                <td colSpan={activeDivView === 'ALL' ? 12 : 6} className="text-center text-slate-400 text-xs">
                  Rata-rata Gabungan 3 Divisi Se-Regional ({quarterLabel})
                </td>
                {activeDivView === 'ALL' ? (
                  <>
                    <td className="py-3.5 px-2 text-right font-mono text-amber-300 bg-amber-900/40 text-sm">{regionalSummary.avgBar}%</td>
                    <td className="py-3.5 px-2 text-right font-mono text-rose-300 bg-amber-900/40 text-sm">{regionalSummary.avgKitchen}%</td>
                    <td className="py-3.5 px-2 text-right font-mono text-blue-300 bg-amber-900/40 text-sm">{regionalSummary.avgService}%</td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-amber-400 bg-amber-500/40 text-base">
                      {regionalSummary.finalRegionalPoint}%
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3.5 px-2 text-right font-mono text-amber-300 bg-amber-900/40 text-sm">
                      {activeDivView === 'BAR' ? `${regionalSummary.avgBar}%` : activeDivView === 'KITCHEN' ? `${regionalSummary.avgKitchen}%` : `${regionalSummary.avgService}%`}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-amber-400 bg-amber-500/40 text-base">
                      {regionalSummary.finalRegionalPoint}%
                    </td>
                  </>
                )}
                <td className="py-3.5 px-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${regionalSummary.regionalTier.badgeClass}`}>
                    {regionalSummary.regionalTier.label}
                  </span>
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL AUDIT MODAL */}
      {selectedOutletForAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                  Log Audit QA 3 Bulan
                </span>
                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2">
                  <i className="fas fa-clipboard-check text-indigo-400"></i>
                  {selectedOutletForAuditModal.outlet}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOutletForAuditModal(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 bg-slate-950 p-4 rounded-2xl border border-white/5 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block">Rata-rata Bar</span>
                <span className="text-lg font-black text-amber-300">{selectedOutletForAuditModal.bar3MonthAvg}%</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Rata-rata Kitchen</span>
                <span className="text-lg font-black text-rose-300">{selectedOutletForAuditModal.kitchen3MonthAvg}%</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Rata-rata Service</span>
                <span className="text-lg font-black text-blue-300">{selectedOutletForAuditModal.service3MonthAvg}%</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Point Akhir</span>
                <span className="text-lg font-black text-emerald-400">{selectedOutletForAuditModal.finalPointAchievement}%</span>
              </div>
            </div>

            <div className="space-y-4">
              {selectedOutletForAuditModal.months.map(m => (
                <div key={m.monthIdx} className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-white uppercase">{m.monthName} {qaYear}</h4>
                    <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                      Rata2: {m.overallAvg}% ({m.auditCount} Audit)
                    </span>
                  </div>
                  {m.audits.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">Tidak ada log audit di bulan ini.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] text-slate-400 border-b border-white/5 uppercase">
                            <th className="py-1.5 px-2">Tanggal</th>
                            <th className="py-1.5 px-2 text-right text-amber-300">Bar</th>
                            <th className="py-1.5 px-2 text-right text-rose-300">Kitchen</th>
                            <th className="py-1.5 px-2 text-right text-blue-300">Service</th>
                            <th className="py-1.5 px-2 text-right font-black text-white">Overall</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {m.audits.map((a, idx) => (
                            <tr key={idx} className="hover:bg-white/5">
                              <td className="py-1.5 px-2 text-slate-300">{a.date}</td>
                              <td className="py-1.5 px-2 text-right text-amber-300">{a.bar}%</td>
                              <td className="py-1.5 px-2 text-right text-rose-300">{a.kitchen}%</td>
                              <td className="py-1.5 px-2 text-right text-blue-300">{a.service}%</td>
                              <td className="py-1.5 px-2 text-right font-black text-white">{a.overall}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedOutletForAuditModal(null)}
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

export default RegionalQARecapTable;
