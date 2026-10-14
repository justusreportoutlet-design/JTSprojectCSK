import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, getActiveOutletNames } from '../constants';
import { RegionalMatrixReportTable } from './RegionalMatrixReportTable';

interface Props {
  allOutletsData: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export interface OutletGoogleReviewRecap {
  outlet: string;
  area: string;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  totalReviewMtd: number;
  totalPointsMtd: number;
  ratingMtd: number;
  targetRating: number;
  variance: number;
  cumulativeTotal: number;
  cumulativeRating: number;
  daysRecorded: number;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const RegionalGoogleReviewRecapTable: React.FC<Props> = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = '',
  onSelectOutlet,
  showToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeAreaFilter, setActiveAreaFilter] = useState(selectedArea || 'ALL');
  const [viewMode, setViewMode] = useState<'MATRIX' | 'STARS' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_LAST_WEEK'>('MATRIX');

  React.useEffect(() => {
    if (selectedArea) setActiveAreaFilter(selectedArea);
  }, [selectedArea]);

  const safeYear = (!selectedYear || isNaN(Number(selectedYear))) ? new Date().getFullYear() : Number(selectedYear);
  const safeMonth = (selectedMonth === undefined || selectedMonth === null || isNaN(Number(selectedMonth))) ? new Date().getMonth() : Math.max(0, Math.min(11, Number(selectedMonth)));

  const monthKey = `${safeYear}-${String(safeMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[safeMonth] || 'Bulan';

  // Process Google Review data per outlet
  const outletRecaps = useMemo<OutletGoogleReviewRecap[]>(() => {
    const activeNames = getActiveOutletNames();
    return activeNames.map(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      const dailyGR: Record<string, any> = {
        ...(outletMonths.dailyGoogleReview || {}),
        ...(mData.dailyGoogleReview || {})
      };

      let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
      const datesFound = new Set<string>();

      Object.entries(dailyGR).forEach(([dateStr, d]: [string, any]) => {
        const isMatch = (() => {
          if (dateStr.startsWith(monthKey)) return true;
          if (dateStr.startsWith(`${selectedYear}-${selectedMonth + 1}-`)) return true;
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime()) && dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear) return true;
          const dayNum = Number(dateStr);
          if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) return true;
          return false;
        })();

        if (isMatch && d) {
          datesFound.add(dateStr);
          s1 += Number(d.stars1) || 0;
          s2 += Number(d.stars2) || 0;
          s3 += Number(d.stars3) || 0;
          s4 += Number(d.stars4) || 0;
          s5 += Number(d.stars5) || 0;
        }
      });

      let totalReviewMtd = s1 + s2 + s3 + s4 + s5;
      let totalPointsMtd = (s1 * 1) + (s2 * 2) + (s3 * 3) + (s4 * 4) + (s5 * 5);
      let ratingMtd = totalReviewMtd > 0 ? Number((totalPointsMtd / totalReviewMtd).toFixed(2)) : 0;

      // Fallback to outlet's direct googleReview state if daily entries are 0
      const directGr = mData.googleReview || {};
      const fallbackTarget = Number(directGr.targetRating) || 5.0;

      if (totalReviewMtd === 0 && (Number(directGr.totalReview) > 0 || Number(directGr.currentRating) > 0)) {
        totalReviewMtd = Number(directGr.totalReview) || 0;
        ratingMtd = Number(directGr.currentRating) || 0;
        totalPointsMtd = Math.round(totalReviewMtd * ratingMtd);
      }

      // Check cumulative across all months up to selected month
      let cumS1 = 0, cumS2 = 0, cumS3 = 0, cumS4 = 0, cumS5 = 0;
      for (let m = 0; m <= selectedMonth; m++) {
        const monData = outletMonths[String(m)] || outletMonths[m];
        if (monData?.dailyGoogleReview) {
          Object.values(monData.dailyGoogleReview).forEach((d: any) => {
            cumS1 += Number(d.stars1) || 0;
            cumS2 += Number(d.stars2) || 0;
            cumS3 += Number(d.stars3) || 0;
            cumS4 += Number(d.stars4) || 0;
            cumS5 += Number(d.stars5) || 0;
          });
        }
      }
      const cumulativeTotal = cumS1 + cumS2 + cumS3 + cumS4 + cumS5 || totalReviewMtd;
      const cumPoints = (cumS1 * 1) + (cumS2 * 2) + (cumS3 * 3) + (cumS4 * 4) + (cumS5 * 5);
      const cumulativeRating = cumulativeTotal > 0 ? Number((cumPoints / cumulativeTotal).toFixed(2)) : ratingMtd;

      const targetRating = fallbackTarget;
      const variance = ratingMtd > 0 ? Number((ratingMtd - targetRating).toFixed(2)) : 0;

      return {
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        s1, s2, s3, s4, s5,
        totalReviewMtd,
        totalPointsMtd,
        ratingMtd,
        targetRating,
        variance,
        cumulativeTotal,
        cumulativeRating,
        daysRecorded: datesFound.size
      };
    });
  }, [allOutletsData, selectedMonth, selectedYear, monthKey]);

  // Filter recaps
  const filteredRecaps = useMemo(() => {
    return outletRecaps.filter(item => {
      if (activeAreaFilter !== 'ALL' && item.area !== activeAreaFilter) return false;
      if (selectedOutlet && selectedOutlet !== 'ALL' && item.outlet !== selectedOutlet) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return item.outlet.toLowerCase().includes(q) || item.area.toLowerCase().includes(q);
      }
      return true;
    });
  }, [outletRecaps, activeAreaFilter, selectedOutlet, searchTerm]);

  // Group by Area
  const groupedByArea = useMemo(() => {
    const groups: Record<string, OutletGoogleReviewRecap[]> = {
      'JAKARTA': [],
      'TANGGERANG': [],
      'BEKASI & CIBUBUR': []
    };
    filteredRecaps.forEach(item => {
      if (groups[item.area]) {
        groups[item.area].push(item);
      } else {
        groups['JAKARTA'].push(item);
      }
    });
    return groups;
  }, [filteredRecaps]);

  // Helper to compute subtotal or total
  const computeAggregate = (items: OutletGoogleReviewRecap[]) => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
    let totalReviewMtd = 0;
    let totalPointsMtd = 0;
    let cumTotal = 0;
    let daysTotal = 0;
    let targetRatingSum = 0;

    items.forEach(it => {
      s1 += it.s1;
      s2 += it.s2;
      s3 += it.s3;
      s4 += it.s4;
      s5 += it.s5;
      totalReviewMtd += it.totalReviewMtd;
      totalPointsMtd += it.totalPointsMtd;
      cumTotal += it.cumulativeTotal;
      daysTotal += it.daysRecorded;
      targetRatingSum += it.targetRating;
    });

    const ratingMtd = totalReviewMtd > 0 ? Number((totalPointsMtd / totalReviewMtd).toFixed(2)) : 0;
    const avgTarget = items.length > 0 ? Number((targetRatingSum / items.length).toFixed(2)) : 5.0;
    const variance = ratingMtd > 0 ? Number((ratingMtd - avgTarget).toFixed(2)) : 0;

    return {
      s1, s2, s3, s4, s5,
      totalReviewMtd,
      totalPointsMtd,
      ratingMtd,
      targetRating: avgTarget,
      variance,
      cumulativeTotal: cumTotal,
      daysTotal,
      outletCount: items.length
    };
  };

  const grandTotal = useMemo(() => computeAggregate(filteredRecaps), [filteredRecaps]);

  const daysInMonth = useMemo(() => {
    const d = new Date(safeYear, safeMonth + 1, 0).getDate();
    return (isNaN(d) || d < 28) ? 30 : d;
  }, [safeYear, safeMonth]);

  const dailyMatrix = useMemo(() => {
    const matrix: Record<string, Record<number, { count: number; rating: number; achievement: number; hasData: boolean }>> = {};

    OUTLETS.forEach(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      const dailyGR: Record<string, any> = {
        ...(outletMonths.dailyGoogleReview || {}),
        ...(mData.dailyGoogleReview || {})
      };

      matrix[outletName] = {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        let entry: any = null;

        if (dailyGR[dateStr]) {
          entry = dailyGR[dateStr];
        } else if (dailyGR[String(d)]) {
          entry = dailyGR[String(d)];
        } else {
          for (const [k, val] of Object.entries(dailyGR)) {
            if (k.endsWith(`-${String(d).padStart(2, '0')}`) || k === `${selectedYear}-${selectedMonth + 1}-${d}`) {
              entry = val;
              break;
            }
          }
        }

        if (!entry) {
          matrix[outletName][d] = { count: 0, rating: 0, achievement: 0, hasData: false };
          continue;
        }

        const s1 = Number(entry.stars1) || 0;
        const s2 = Number(entry.stars2) || 0;
        const s3 = Number(entry.stars3) || 0;
        const s4 = Number(entry.stars4) || 0;
        const s5 = Number(entry.stars5) || 0;
        const total = s1 + s2 + s3 + s4 + s5;

        if (total > 0) {
          const pts = (s1 * 1) + (s2 * 2) + (s3 * 3) + (s4 * 4) + (s5 * 5);
          const rating = Number((pts / total).toFixed(2));
          const target = 5.0;
          const ach = (rating / target) * 100;
          matrix[outletName][d] = { count: total, rating, achievement: ach, hasData: true };
        } else if (Number(entry.reviews) > 0 || Number(entry.rating) > 0) {
          const c = Number(entry.reviews) || 0;
          const r = Number(entry.rating) || 0;
          const ach = (r / 5.0) * 100;
          matrix[outletName][d] = { count: c, rating: r, achievement: ach, hasData: true };
        } else {
          matrix[outletName][d] = { count: 0, rating: 0, achievement: 0, hasData: false };
        }
      }
    });

    return matrix;
  }, [allOutletsData, selectedMonth, selectedYear, monthKey, daysInMonth]);

  const regionalDailyTotals = useMemo(() => {
    const totals: Record<number, { totalReviews: number; avgRating: number; avgAchievement: number; outletsWithData: number }> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      let sumCount = 0;
      let sumRating = 0;
      let sumAch = 0;
      let count = 0;

      filteredRecaps.forEach(rec => {
        const cell = dailyMatrix[rec.outlet]?.[d];
        if (cell && cell.hasData && (cell.count > 0 || cell.rating > 0)) {
          sumCount += cell.count;
          sumRating += cell.rating;
          sumAch += cell.achievement;
          count++;
        }
      });

      totals[d] = {
        totalReviews: sumCount,
        avgRating: count > 0 ? sumRating / count : 0,
        avgAchievement: count > 0 ? sumAch / count : 0,
        outletsWithData: count
      };
    }

    return totals;
  }, [filteredRecaps, dailyMatrix, daysInMonth]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Google Review ${monthName} ${selectedYear}`);
      sheet.views = [{ showGridLines: true }];

      // Title
      sheet.mergeCells('A1:L1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `REKAPAN GOOGLE REVIEW REGIONAL - ${monthName.toUpperCase()} ${selectedYear}`;
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 36;

      // Header Row
      const headerRow = sheet.addRow([
        'NO', 'OUTLET', 'AREA', 'HARI INPUT',
        '5 ★', '4 ★', '3 ★', '2 ★', '1 ★',
        'TOTAL REVIEW', 'RATING (MTD)', 'TARGET', 'VARIANCE'
      ]);
      headerRow.height = 26;
      headerRow.eachCell(c => {
        c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      let rowNum = 1;
      (['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).forEach(areaKey => {
        const areaRows = groupedByArea[areaKey] || [];
        if (areaRows.length === 0) return;

        // Area Header
        const aHeader = sheet.addRow([
          '', `AREA ${areaKey} (${areaRows.length} OUTLET)`, '', '', '', '', '', '', '', '', '', '', ''
        ]);
        aHeader.height = 20;
        aHeader.eachCell(c => {
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF6366F1' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        });

        areaRows.forEach(it => {
          const r = sheet.addRow([
            rowNum++,
            it.outlet,
            it.area,
            `${it.daysRecorded} Hari`,
            it.s5,
            it.s4,
            it.s3,
            it.s2,
            it.s1,
            it.totalReviewMtd,
            it.ratingMtd > 0 ? it.ratingMtd.toFixed(2) : '-',
            it.targetRating.toFixed(1),
            it.ratingMtd > 0 ? (it.variance >= 0 ? `+${it.variance.toFixed(2)}` : it.variance.toFixed(2)) : '-'
          ]);
          r.height = 20;
        });

        // Area Subtotal
        const sub = computeAggregate(areaRows);
        const subRow = sheet.addRow([
          '',
          `SUBTOTAL ${areaKey}`,
          '',
          '-',
          sub.s5,
          sub.s4,
          sub.s3,
          sub.s2,
          sub.s1,
          sub.totalReviewMtd,
          sub.ratingMtd > 0 ? sub.ratingMtd.toFixed(2) : '-',
          sub.targetRating.toFixed(1),
          sub.ratingMtd > 0 ? (sub.variance >= 0 ? `+${sub.variance.toFixed(2)}` : sub.variance.toFixed(2)) : '-'
        ]);
        subRow.height = 22;
        subRow.eachCell(c => {
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        });
      });

      // Grand Total
      const grandRow = sheet.addRow([
        '',
        'TOTAL REGIONAL',
        activeAreaFilter,
        '-',
        grandTotal.s5,
        grandTotal.s4,
        grandTotal.s3,
        grandTotal.s2,
        grandTotal.s1,
        grandTotal.totalReviewMtd,
        grandTotal.ratingMtd > 0 ? grandTotal.ratingMtd.toFixed(2) : '-',
        grandTotal.targetRating.toFixed(1),
        grandTotal.ratingMtd > 0 ? (grandTotal.variance >= 0 ? `+${grandTotal.variance.toFixed(2)}` : grandTotal.variance.toFixed(2)) : '-'
      ]);
      grandRow.height = 24;
      grandRow.eachCell(c => {
        c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
      });

      sheet.columns.forEach(col => {
        col.width = 14;
      });
      sheet.getColumn(2).width = 24;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Rekapan_Google_Review_Regional_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mengunduh Excel Rekapan Google Review Regional', 'success');
    } catch (err: any) {
      console.error(err);
      showToast?.('Gagal mengunduh Excel Google Review: ' + err.message, 'error');
    }
  };

  const getRatingBadge = (rating: number, target: number) => {
    if (rating === 0) return { label: 'No Data', cls: 'bg-slate-800 text-slate-500' };
    if (rating >= target) return { label: 'Target Tercapai', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    if (rating >= 4.5) return { label: 'Sangat Baik', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    if (rating >= 4.0) return { label: 'Baik', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return { label: 'Perlu Perhatian', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
  };

  // Find top rated outlet
  const topRatedOutlet = useMemo(() => {
    const withReviews = filteredRecaps.filter(i => i.totalReviewMtd > 0);
    if (withReviews.length === 0) return null;
    return [...withReviews].sort((a, b) => b.ratingMtd - a.ratingMtd || b.totalReviewMtd - a.totalReviewMtd)[0];
  }, [filteredRecaps]);

  return (
    <div className="space-y-6 animate-fade-in text-slate-200">
      
      {/* HEADER & CONTROLS */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider">
              Google Customer Reviews
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-xs font-bold text-slate-300">
              Periode: <strong className="text-white">{monthName} {selectedYear}</strong>
            </span>
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1 flex items-center gap-3">
            <i className="fas fa-star text-amber-400"></i>
            Tabel Rekapan Google Review Regional
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Konsolidasi Total Review, Rating MTD, Bintang 1-5, dan Capaian Target sesuai input Admin Panel masing-masing outlet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-xl border border-white/10 gap-1">
            <button
              onClick={() => setViewMode('MATRIX')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'MATRIX'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-days text-[11px]"></i>
              <span>Matriks Tanggal (1-{daysInMonth})</span>
            </button>
            <button
              onClick={() => setViewMode('STARS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'STARS'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-star text-[11px]"></i>
              <span>Detail Bintang (1★ - 5★)</span>
            </button>
            <button
              onClick={() => setViewMode('WEEKLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'WEEKLY'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-week text-[11px]"></i>
              <span>Rekapan Weekly (W1-W5)</span>
            </button>
            <button
              onClick={() => setViewMode('MONTHLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'MONTHLY'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar text-[11px]"></i>
              <span>Rekapan Monthly (Jan-Des)</span>
            </button>
            <button
              onClick={() => setViewMode('YTD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'YTD'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-chart-line text-[11px]"></i>
              <span>Rekapan YTD</span>
            </button>
            <button
              onClick={() => setViewMode('COMPARE_LAST_WEEK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'COMPARE_LAST_WEEK'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-arrow-trend-up text-[11px]"></i>
              <span>Compare Last Week</span>
            </button>
          </div>

          {/* Area Filter */}
          <select
            value={activeAreaFilter}
            onChange={(e) => setActiveAreaFilter(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
          >
            <option value="ALL">Semua Area</option>
            <option value="JAKARTA">JAKARTA</option>
            <option value="TANGGERANG">TANGGERANG</option>
            <option value="BEKASI & CIBUBUR">BEKASI & CIBUBUR</option>
          </select>

          {/* Search */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white outline-none w-36 focus:w-48 transition-all"
            />
          </div>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/20 cursor-pointer"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>

      {(viewMode === 'WEEKLY' || viewMode === 'MONTHLY' || viewMode === 'YTD' || viewMode === 'COMPARE_LAST_WEEK') && (
        <RegionalMatrixReportTable
          title="Laporan Rekapitulasi Google Review Regional"
          description="Laporan konsolidasi Google Review: Matriks Tanggal Harian (1-31), Weekly (W1-W5), Bulanan (Jan-Des), YTD Kumulatif, dan Compare Last Week"
          moduleName="Google Review (Jumlah Ulasan)"
          valueUnit="QTY"
          allOutletsData={allOutletsData || {}}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={activeAreaFilter}
          selectedOutlet={selectedOutlet}
          onSelectOutlet={onSelectOutlet}
          showToast={showToast}
          initialViewMode={viewMode === 'WEEKLY' ? 'WEEKLY' : viewMode === 'MONTHLY' ? 'MONTHLY' : viewMode === 'YTD' ? 'YTD' : 'COMPARE_LAST_WEEK'}
          extractDailyValue={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const d = mData.dailyGoogleReview?.[dateStr] || outletMonths.dailyGoogleReview?.[dateStr];
            if (d) {
              return (Number(d.stars1) || 0) + (Number(d.stars2) || 0) + (Number(d.stars3) || 0) + (Number(d.stars4) || 0) + (Number(d.stars5) || 0);
            }
            return 0;
          }}
          extractDailyTxCount={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const d = mData.dailyGoogleReview?.[dateStr] || outletMonths.dailyGoogleReview?.[dateStr];
            if (d) {
              return Number(d.stars5) || 0;
            }
            return 0;
          }}
        />
      )}

      {(viewMode === 'MATRIX' || viewMode === 'STARS') && (
        <>
          {/* EXECUTIVE KPI CHIPS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Total Reviews MTD */}
        <div className="glass-card p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30">
          <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Total Review Regional</div>
          <div className="text-2xl font-black text-white font-mono mt-1">
            {grandTotal.totalReviewMtd.toLocaleString('id-ID')}
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
            Ulasan Masuk Bulan {monthName}
          </div>
        </div>

        {/* Rating Rata-rata Regional */}
        <div className="glass-card p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30">
          <div className="text-[10px] font-black text-blue-400 uppercase tracking-wider">Rata-rata Rating Regional</div>
          <div className="text-2xl font-black text-blue-300 font-mono mt-1 flex items-center gap-1.5">
            <span>{grandTotal.ratingMtd > 0 ? grandTotal.ratingMtd.toFixed(2) : '-'}</span>
            <i className="fas fa-star text-amber-400 text-sm"></i>
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            Target Regional: {grandTotal.targetRating.toFixed(1)} ★
          </div>
        </div>

        {/* 5-Star Reviews Count */}
        <div className="glass-card p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
          <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Total Bintang 5 (5 ★)</div>
          <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
            {grandTotal.s5.toLocaleString('id-ID')}
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
            {grandTotal.totalReviewMtd > 0 ? `${((grandTotal.s5 / grandTotal.totalReviewMtd) * 100).toFixed(1)}% dari Total` : '-'}
          </div>
        </div>

        {/* Top Rated Outlet */}
        <div className="glass-card p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30">
          <div className="text-[10px] font-black text-purple-400 uppercase tracking-wider">Top Outlet Review</div>
          <div className="text-lg font-black text-white truncate mt-1">
            {topRatedOutlet ? topRatedOutlet.outlet : '-'}
          </div>
          <div className="text-[9px] text-purple-300 font-mono mt-0.5 flex items-center gap-1">
            {topRatedOutlet && topRatedOutlet.ratingMtd > 0 ? (
              <>
                <span>★ {topRatedOutlet.ratingMtd.toFixed(2)}</span>
                <span className="text-slate-500">({topRatedOutlet.totalReviewMtd} review)</span>
              </>
            ) : 'Belum ada data'}
          </div>
        </div>

        {/* Status Capaian */}
        <div className="glass-card p-4 rounded-2xl bg-slate-900/60 border border-white/10 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status Capaian Target</div>
          <div className="text-lg font-black text-white mt-1">
            {getRatingBadge(grandTotal.ratingMtd, grandTotal.targetRating).label}
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
            Variance: {grandTotal.ratingMtd > 0 ? (grandTotal.variance >= 0 ? `+${grandTotal.variance.toFixed(2)}` : grandTotal.variance.toFixed(2)) : '-'}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
        <div className="overflow-x-auto custom-scrollbar max-h-[75vh]">
          <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider border-b-2 border-amber-500/40">
              <tr>
                <th className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                  NO
                </th>
                <th className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[170px]">
                  OUTLET / STORE
                </th>
                <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[90px]">
                  AREA
                </th>
                <th className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[85px]">
                  HARI INPUT
                </th>

                {/* MATRIX View: Daily columns 1 to daysInMonth */}
                {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <th key={d} className="p-2 text-center border-r border-white/10 bg-slate-900 min-w-[70px]">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black text-amber-300">TGL {d}</span>
                      <span className="text-[7.5px] text-slate-400 font-mono font-normal">REV / ★ / ACH</span>
                    </div>
                  </th>
                ))}

                {/* Stars breakdown */}
                {viewMode === 'STARS' && (
                  <>
                    <th className="p-2.5 text-center border-r border-white/10 bg-slate-900 text-emerald-400 min-w-[55px]">
                      5 ★
                    </th>
                    <th className="p-2.5 text-center border-r border-white/10 bg-slate-900 text-blue-400 min-w-[55px]">
                      4 ★
                    </th>
                    <th className="p-2.5 text-center border-r border-white/10 bg-slate-900 text-yellow-400 min-w-[55px]">
                      3 ★
                    </th>
                    <th className="p-2.5 text-center border-r border-white/10 bg-slate-900 text-orange-400 min-w-[55px]">
                      2 ★
                    </th>
                    <th className="p-2.5 text-center border-r border-white/10 bg-slate-900 text-red-400 min-w-[55px]">
                      1 ★
                    </th>
                  </>
                )}

                {/* Summaries */}
                <th className="p-2.5 text-center border-r border-white/10 bg-amber-950/60 text-amber-300 min-w-[100px]">
                  TOTAL REVIEW (MTD)
                </th>
                <th className="p-2.5 text-center border-r border-white/10 bg-amber-950/60 text-amber-300 min-w-[95px]">
                  RATING (MTD)
                </th>
                <th className="p-2.5 text-center border-r border-white/10 bg-amber-950/60 text-amber-300 min-w-[80px]">
                  TARGET
                </th>
                <th className="p-2.5 text-center border-r border-white/10 bg-amber-950/60 text-amber-300 min-w-[85px]">
                  SELISIH
                </th>
                <th className="p-2.5 text-center bg-amber-950 text-amber-300 min-w-[110px]">
                  STATUS
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 text-[11px]">
              {(['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).map(areaKey => {
                const areaRows = groupedByArea[areaKey] || [];
                if (areaRows.length === 0) return null;
                const sub = computeAggregate(areaRows);

                return (
                  <React.Fragment key={areaKey}>
                    {/* Area Separator */}
                    <tr className="bg-slate-950/90 font-black text-amber-400 text-xs border-y border-white/10">
                      <td colSpan={3} className="p-2.5 pl-4 sticky left-0 z-20 bg-slate-950 border-r border-white/10">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-location-dot text-amber-400"></i>
                          <span>AREA {areaKey}</span>
                          <span className="text-[10px] text-slate-500 font-normal">({areaRows.length} Outlet)</span>
                        </span>
                      </td>
                      <td colSpan={viewMode === 'MATRIX' ? ((daysInMonth && !isNaN(daysInMonth)) ? daysInMonth : 30) + 6 : 11} className="p-2 text-[10px] text-slate-400 italic">
                        Rekapan Google Review Periode {monthName} {selectedYear}
                      </td>
                    </tr>

                    {/* Outlet Rows */}
                    {areaRows.map((it, idx) => {
                      const badge = getRatingBadge(it.ratingMtd, it.targetRating);
                      return (
                        <tr
                          key={it.outlet}
                          onClick={() => onSelectOutlet && onSelectOutlet(it.outlet)}
                          className="hover:bg-amber-600/10 cursor-pointer transition-colors group"
                        >
                          <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800">
                            {idx + 1}
                          </td>
                          <td className="p-2.5 font-bold text-white border-r border-white/10 sticky left-12 z-20 bg-slate-900 group-hover:bg-slate-800 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span>{it.outlet}</span>
                              <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-amber-400 transition-colors"></i>
                            </div>
                          </td>
                          <td className="p-2.5 text-center border-r border-white/5 text-[10px] text-slate-400 font-bold">
                            {it.area}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 text-[10px]">
                            {it.daysRecorded > 0 ? `${it.daysRecorded} hari` : '-'}
                          </td>

                          {/* MATRIX: Daily review count, rating, achievement */}
                          {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                            const cell = dailyMatrix[it.outlet]?.[d];
                            return (
                              <td key={d} className="p-1.5 text-center border-r border-white/5">
                                {cell && cell.hasData && (cell.count > 0 || cell.rating > 0) ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    <span className="text-[10px] font-mono font-bold text-white whitespace-nowrap">
                                      {cell.count} Rev
                                    </span>
                                    <span className="text-[9.5px] font-mono font-black text-amber-300 flex items-center gap-0.5">
                                      <span>★ {cell.rating.toFixed(2)}</span>
                                    </span>
                                    <span className={`px-1 py-0.2 rounded text-[8.5px] font-black font-mono border ${
                                      cell.achievement >= 100 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                      cell.achievement >= 90 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' :
                                      cell.achievement >= 80 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                      'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                    }`}>
                                      {cell.achievement.toFixed(0)}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 font-mono text-[10px]">-</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Stars breakdown */}
                          {viewMode === 'STARS' && (
                            <>
                              <td className="p-2.5 text-center font-mono text-emerald-400 border-r border-white/5">
                                {it.s5 > 0 ? it.s5 : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono text-blue-400 border-r border-white/5">
                                {it.s4 > 0 ? it.s4 : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono text-yellow-400 border-r border-white/5">
                                {it.s3 > 0 ? it.s3 : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono text-orange-400 border-r border-white/5">
                                {it.s2 > 0 ? it.s2 : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono text-red-400 border-r border-white/5">
                                {it.s1 > 0 ? it.s1 : '-'}
                              </td>
                            </>
                          )}

                          {/* Total Review MTD */}
                          <td className="p-2.5 text-center font-mono font-bold text-white border-r border-white/5 bg-amber-950/10">
                            {it.totalReviewMtd > 0 ? it.totalReviewMtd.toLocaleString('id-ID') : '-'}
                          </td>

                          {/* Rating MTD */}
                          <td className="p-2.5 text-center font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/10 text-xs">
                            {it.ratingMtd > 0 ? (
                              <span className="flex items-center justify-center gap-1">
                                <span>{it.ratingMtd.toFixed(2)}</span>
                                <i className="fas fa-star text-[10px] text-amber-400"></i>
                              </span>
                            ) : '-'}
                          </td>

                          {/* Target */}
                          <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5">
                            {it.targetRating.toFixed(1)}
                          </td>

                          {/* Variance */}
                          <td className="p-2.5 text-center font-mono font-bold border-r border-white/5">
                            {it.ratingMtd > 0 ? (
                              <span className={it.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {it.variance >= 0 ? `+${it.variance.toFixed(2)}` : it.variance.toFixed(2)}
                              </span>
                            ) : '-'}
                          </td>

                          {/* Badge */}
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Area Subtotal */}
                    <tr className="bg-slate-950/80 font-black text-xs border-y border-white/10 text-white">
                      <td colSpan={2} className="p-2.5 pl-4 sticky left-0 z-20 bg-slate-950 border-r border-white/10 text-amber-300 uppercase">
                        SUBTOTAL {areaKey}
                      </td>
                      <td className="p-2.5 text-center border-r border-white/5 text-[10px] text-slate-400">
                        {areaRows.length} Outlet
                      </td>
                      <td className="p-2.5 text-center border-r border-white/5 text-slate-400 font-mono text-[10px]">
                        -
                      </td>

                      {/* Area Daily Subtotals */}
                      {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                        let sumCount = 0;
                        let sumRating = 0;
                        let count = 0;
                        areaRows.forEach(ar => {
                          const c = dailyMatrix[ar.outlet]?.[d];
                          if (c && c.hasData && (c.count > 0 || c.rating > 0)) {
                            sumCount += c.count;
                            sumRating += c.rating;
                            count++;
                          }
                        });
                        return (
                          <td key={d} className="p-1 text-center border-r border-white/5 bg-amber-950/30">
                            {count > 0 ? (
                              <div className="flex flex-col items-center justify-center">
                                <span className="text-[9px] font-mono font-bold text-amber-200">{sumCount} Rev</span>
                                <span className="text-[9px] font-mono font-black text-amber-400">★ {(sumRating / count).toFixed(2)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono text-[9px]">-</span>
                            )}
                          </td>
                        );
                      })}

                      {viewMode === 'STARS' && (
                        <>
                          <td className="p-2.5 text-center font-mono text-emerald-400 border-r border-white/5">
                            {sub.s5 > 0 ? sub.s5 : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-blue-400 border-r border-white/5">
                            {sub.s4 > 0 ? sub.s4 : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-yellow-400 border-r border-white/5">
                            {sub.s3 > 0 ? sub.s3 : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-orange-400 border-r border-white/5">
                            {sub.s2 > 0 ? sub.s2 : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-red-400 border-r border-white/5">
                            {sub.s1 > 0 ? sub.s1 : '-'}
                          </td>
                        </>
                      )}

                      <td className="p-2.5 text-center font-mono font-black text-white border-r border-white/5 bg-amber-950/30">
                        {sub.totalReviewMtd.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/30 text-xs">
                        {sub.ratingMtd > 0 ? `${sub.ratingMtd.toFixed(2)} ★` : '-'}
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5">
                        {sub.targetRating.toFixed(1)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold border-r border-white/5">
                        {sub.ratingMtd > 0 ? (
                          <span className={sub.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {sub.variance >= 0 ? `+${sub.variance.toFixed(2)}` : sub.variance.toFixed(2)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2.5 text-center bg-amber-950/30">
                        <span className="text-[9px] font-bold text-amber-300 uppercase">
                          Area Avg
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* GRAND TOTAL REGIONAL FOOTER */}
            <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-amber-500">
              <tr>
                <td colSpan={2} className="p-3 pl-4 sticky left-0 z-40 bg-slate-950 border-r border-white/10 uppercase text-amber-400">
                  TOTAL REGIONAL ({grandTotal.outletCount} OUTLET)
                </td>
                <td className="p-3 text-center border-r border-white/5 text-[10px] text-slate-400">
                  {activeAreaFilter}
                </td>
                <td className="p-3 text-center border-r border-white/5 font-mono text-slate-400 text-[10px]">
                  -
                </td>

                {/* Regional Daily Grand Totals */}
                {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                  const tot = regionalDailyTotals[d];
                  return (
                    <td key={d} className="p-1.5 text-center border-r border-white/5 bg-amber-950/70">
                      {tot && tot.outletsWithData > 0 ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-[9px] font-mono font-black text-white whitespace-nowrap">{tot.totalReviews} Rev</span>
                          <span className="text-[9px] font-mono font-black text-amber-300">★ {tot.avgRating.toFixed(2)}</span>
                          <span className="text-[8px] font-mono font-bold text-emerald-400">{tot.avgAchievement.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[9px]">-</span>
                      )}
                    </td>
                  );
                })}

                {viewMode === 'STARS' && (
                  <>
                    <td className="p-3 text-center font-mono text-emerald-400 border-r border-white/5">
                      {grandTotal.s5 > 0 ? grandTotal.s5.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-blue-400 border-r border-white/5">
                      {grandTotal.s4 > 0 ? grandTotal.s4.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-yellow-400 border-r border-white/5">
                      {grandTotal.s3 > 0 ? grandTotal.s3.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-orange-400 border-r border-white/5">
                      {grandTotal.s2 > 0 ? grandTotal.s2.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-red-400 border-r border-white/5">
                      {grandTotal.s1 > 0 ? grandTotal.s1.toLocaleString('id-ID') : '-'}
                    </td>
                  </>
                )}

                <td className="p-3 text-center font-mono font-black text-white border-r border-white/5 bg-amber-950/60 text-sm">
                  {grandTotal.totalReviewMtd.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/60 text-sm">
                  {grandTotal.ratingMtd > 0 ? `${grandTotal.ratingMtd.toFixed(2)} ★` : '-'}
                </td>
                <td className="p-3 text-center font-mono text-slate-400 border-r border-white/5">
                  {grandTotal.targetRating.toFixed(1)}
                </td>
                <td className="p-3 text-center font-mono font-bold border-r border-white/5">
                  {grandTotal.ratingMtd > 0 ? (
                    <span className={grandTotal.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {grandTotal.variance >= 0 ? `+${grandTotal.variance.toFixed(2)}` : grandTotal.variance.toFixed(2)}
                    </span>
                  ) : '-'}
                </td>
                <td className="p-3 text-center bg-amber-950/60">
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${getRatingBadge(grandTotal.ratingMtd, grandTotal.targetRating).cls}`}>
                    {getRatingBadge(grandTotal.ratingMtd, grandTotal.targetRating).label}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default RegionalGoogleReviewRecapTable;
