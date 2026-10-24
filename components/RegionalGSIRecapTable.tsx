import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, INITIAL_GSI_STRUCTURE, getActiveOutletNames } from '../constants';
import { GSIRow } from '../types';
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

export interface CategoryStats {
  subject: string;
  shortLabel: string;
  responses: number;
  excellent: number;
  good: number;
  average: number;
  poor: number;
  abstain: number;
  percentage: number;
}

export interface RatingScoreRecap {
  excellent: number;
  good: number;
  average: number;
  poor: number;
  abstain: number;
  total: number;
  excellentPct: number;
  goodPct: number;
  averagePct: number;
  poorPct: number;
  abstainPct: number;
}

export interface OutletGsiRecap {
  outlet: string;
  area: string;
  categories: Record<string, CategoryStats>;
  ratings: RatingScoreRecap;
  totalResponsesAllCategories: number;
  avgResponsesPerCategory: number;
  averagePercentage: number;
  daysRecorded: number;
}

const GSI_SUBJECTS: { key: string; name: string; short: string; color: string }[] = [
  { key: 'qos', name: 'Quality of Service', short: 'QOS', color: 'indigo' },
  { key: 'qof', name: 'Quality of Food', short: 'QOF', color: 'amber' },
  { key: 'qob', name: 'Quality of Beverage', short: 'QOB', color: 'cyan' },
  { key: 'qoc', name: 'Quality of Cleanliness', short: 'QOC', color: 'emerald' },
  { key: 'aos', name: 'Attentiveness of Staff', short: 'AOS', color: 'purple' },
  { key: 'vfm', name: 'Value for Money', short: 'VFM', color: 'rose' },
];

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const RegionalGSIRecapTable: React.FC<Props> = ({
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
  const [viewMode, setViewMode] = useState<'SUBJECT_TABLE' | 'MATRIX' | 'FULL' | 'RATINGS' | 'SUMMARY' | 'WEEKLY' | 'MONTHLY' | 'YTD' | 'COMPARE_LAST_WEEK' | 'COMPARE_LAST_MONTH'>('SUBJECT_TABLE');
  const [subjectTableScope, setSubjectTableScope] = useState<'ALL' | 'JAKARTA' | 'TANGGERANG' | 'BEKASI & CIBUBUR' | 'COMPARE_AREAS' | 'OUTLET'>(selectedOutlet ? 'OUTLET' : 'ALL');
  const [selectedSubjectOutlet, setSelectedSubjectOutlet] = useState<string>(selectedOutlet || getActiveOutletNames()[0] || 'SH CIPETE');

  React.useEffect(() => {
    if (selectedArea) setActiveAreaFilter(selectedArea);
  }, [selectedArea]);

  React.useEffect(() => {
    if (selectedOutlet) {
      setSelectedSubjectOutlet(selectedOutlet);
      setSubjectTableScope('OUTLET');
    }
  }, [selectedOutlet]);

  const safeYear = (!selectedYear || isNaN(Number(selectedYear))) ? new Date().getFullYear() : Number(selectedYear);
  const safeMonth = (selectedMonth === undefined || selectedMonth === null || isNaN(Number(selectedMonth))) ? new Date().getMonth() : Math.max(0, Math.min(11, Number(selectedMonth)));

  const monthKey = `${safeYear}-${String(safeMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[safeMonth] || 'Bulan';

  // Match subject strings to our standard keys
  const getSubjectKey = (subjectStr: string): string => {
    const s = (subjectStr || '').toLowerCase();
    if (s.includes('service') && !s.includes('attentive')) return 'qos';
    if (s.includes('food')) return 'qof';
    if (s.includes('beverage') || s.includes('drink')) return 'qob';
    if (s.includes('cleanliness') || s.includes('clean')) return 'qoc';
    if (s.includes('attentive') || s.includes('staff')) return 'aos';
    if (s.includes('value') || s.includes('money') || s.includes('price')) return 'vfm';
    return 'qos';
  };

  // Compute GSI recap per outlet
  const outletRecaps = useMemo<OutletGsiRecap[]>(() => {
    const activeNames = getActiveOutletNames();
    return activeNames.map(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      const dailyGSI: Record<string, GSIRow[]> = {
        ...(outletMonths.dailyGSI || {}),
        ...(mData.dailyGSI || {})
      };

      const catAgg: Record<string, { exc: number; gd: number; avg: number; pr: number; abs: number }> = {
        qos: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
        qof: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
        qob: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
        qoc: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
        aos: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
        vfm: { exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 },
      };

      const datesFound = new Set<string>();
      let totalResponsesCount = 0;

      Object.entries(dailyGSI).forEach(([dateStr, rows]) => {
        const isMatch = (() => {
          if (dateStr.startsWith(monthKey)) return true;
          if (dateStr.startsWith(`${selectedYear}-${selectedMonth + 1}-`)) return true;
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime()) && dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear) return true;
          const dayNum = Number(dateStr);
          if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) return true;
          return false;
        })();

        if (isMatch && Array.isArray(rows) && rows.length > 0) {
          let dayMaxResp = 0;
          rows.forEach((r: any) => {
            const key = getSubjectKey(r.subject || r.label || '');
            const exc = Number(r.excellent) || 0;
            const gd = Number(r.good) || 0;
            const avg = Number(r.average) || 0;
            const pr = Number(r.poor) || 0;
            const abs = Number(r.abstain) || 0;
            const totResp = exc + gd + avg + pr + abs;
            if (totResp > dayMaxResp) dayMaxResp = totResp;

            if (catAgg[key]) {
              catAgg[key].exc += exc;
              catAgg[key].gd += gd;
              catAgg[key].avg += avg;
              catAgg[key].pr += pr;
              catAgg[key].abs += abs;
            }
          });

          if (dayMaxResp > 0) {
            datesFound.add(dateStr);
            totalResponsesCount += dayMaxResp;
          }
        }
      });

      // Build category stats: each subject calculated based on its own input values
      const categories: Record<string, CategoryStats> = {};
      let percentagesSum = 0;
      let validCatCount = 0;

      GSI_SUBJECTS.forEach(subDef => {
        const d = catAgg[subDef.key];
        const responses = d.exc + d.gd + d.avg + d.pr + d.abs;
        const totalExceptAbstain = d.exc + d.gd + d.avg + d.pr;
        const totalPoints = (d.exc * 4) + (d.gd * 3) + (d.avg * 2) + (d.pr * 1);
        const maxPoints = totalExceptAbstain * 4;
        const percentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

        categories[subDef.key] = {
          subject: subDef.name,
          shortLabel: subDef.short,
          responses,
          excellent: d.exc,
          good: d.gd,
          average: d.avg,
          poor: d.pr,
          abstain: d.abs,
          percentage
        };

        if (responses > 0) {
          percentagesSum += percentage;
          validCatCount++;
        }
      });

      // If daily count wasn't aggregated day-by-day, fallback to max subject responses
      if (totalResponsesCount === 0 && validCatCount > 0) {
        totalResponsesCount = Math.max(...Object.values(categories).map(c => c.responses), 0);
      }

      // Aggregate rating points (Excellent, Good, Average, Poor, Abstain) across all subjects for this outlet
      let outletExc = 0;
      let outletGd = 0;
      let outletAvg = 0;
      let outletPr = 0;
      let outletAbs = 0;

      GSI_SUBJECTS.forEach(subDef => {
        const d = catAgg[subDef.key];
        outletExc += d.exc;
        outletGd += d.gd;
        outletAvg += d.avg;
        outletPr += d.pr;
        outletAbs += d.abs;
      });
      const outletRatingsTotal = outletExc + outletGd + outletAvg + outletPr + outletAbs;

      const ratings: RatingScoreRecap = {
        excellent: outletExc,
        good: outletGd,
        average: outletAvg,
        poor: outletPr,
        abstain: outletAbs,
        total: outletRatingsTotal,
        excellentPct: outletRatingsTotal > 0 ? (outletExc / outletRatingsTotal) * 100 : 0,
        goodPct: outletRatingsTotal > 0 ? (outletGd / outletRatingsTotal) * 100 : 0,
        averagePct: outletRatingsTotal > 0 ? (outletAvg / outletRatingsTotal) * 100 : 0,
        poorPct: outletRatingsTotal > 0 ? (outletPr / outletRatingsTotal) * 100 : 0,
        abstainPct: outletRatingsTotal > 0 ? (outletAbs / outletRatingsTotal) * 100 : 0
      };

      const averagePercentage = validCatCount > 0 ? percentagesSum / validCatCount : 0;
      const avgResponsesPerCategory = totalResponsesCount;

      return {
        outlet: outletName,
        area: getAreaForOutlet(outletName),
        categories,
        ratings,
        totalResponsesAllCategories: totalResponsesCount,
        avgResponsesPerCategory,
        averagePercentage,
        daysRecorded: datesFound.size
      };
    });
  }, [allOutletsData, selectedMonth, selectedYear, monthKey]);

  // Filter items
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
    const groups: Record<string, OutletGsiRecap[]> = {
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
  const computeAggregate = (items: OutletGsiRecap[]) => {
    const catTotals: Record<string, { responses: number; exc: number; gd: number; avg: number; pr: number; abs: number }> = {};
    GSI_SUBJECTS.forEach(s => {
      catTotals[s.key] = { responses: 0, exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 };
    });

    let totalResponsesAll = 0;
    let daysRecordedTotal = 0;
    let totalExc = 0;
    let totalGd = 0;
    let totalAvg = 0;
    let totalPr = 0;
    let totalAbs = 0;

    items.forEach(it => {
      totalResponsesAll += it.totalResponsesAllCategories;
      daysRecordedTotal += it.daysRecorded;
      totalExc += it.ratings.excellent;
      totalGd += it.ratings.good;
      totalAvg += it.ratings.average;
      totalPr += it.ratings.poor;
      totalAbs += it.ratings.abstain;

      GSI_SUBJECTS.forEach(s => {
        const c = it.categories[s.key];
        if (c) {
          catTotals[s.key].responses += c.responses;
          catTotals[s.key].exc += c.excellent;
          catTotals[s.key].gd += c.good;
          catTotals[s.key].avg += c.average;
          catTotals[s.key].pr += c.poor;
          catTotals[s.key].abs += c.abstain;
        }
      });
    });

    const categoryStats: Record<string, { responses: number; percentage: number }> = {};
    let catPctSum = 0;
    let validCatCount = 0;

    GSI_SUBJECTS.forEach(s => {
      const d = catTotals[s.key];
      const totalExceptAbstain = d.exc + d.gd + d.avg + d.pr;
      const totalPoints = (d.exc * 4) + (d.gd * 3) + (d.avg * 2) + (d.pr * 1);
      const maxPoints = totalExceptAbstain * 4;
      const percentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;
      categoryStats[s.key] = { responses: d.responses, percentage };

      if (d.responses > 0) {
        catPctSum += percentage;
        validCatCount++;
      }
    });

    const avgOverallPct = validCatCount > 0 ? catPctSum / validCatCount : 0;
    const avgResponsesPerCat = Math.round(totalResponsesAll / GSI_SUBJECTS.length);
    const totalRatingsAll = totalExc + totalGd + totalAvg + totalPr + totalAbs;

    const ratingTotals: RatingScoreRecap = {
      excellent: totalExc,
      good: totalGd,
      average: totalAvg,
      poor: totalPr,
      abstain: totalAbs,
      total: totalRatingsAll,
      excellentPct: totalRatingsAll > 0 ? (totalExc / totalRatingsAll) * 100 : 0,
      goodPct: totalRatingsAll > 0 ? (totalGd / totalRatingsAll) * 100 : 0,
      averagePct: totalRatingsAll > 0 ? (totalAvg / totalRatingsAll) * 100 : 0,
      poorPct: totalRatingsAll > 0 ? (totalPr / totalRatingsAll) * 100 : 0,
      abstainPct: totalRatingsAll > 0 ? (totalAbs / totalRatingsAll) * 100 : 0
    };

    const totalResponsesSum = GSI_SUBJECTS.reduce((sum, s) => sum + catTotals[s.key].responses, 0);
    const avgResponsesAcrossSubjects = GSI_SUBJECTS.length > 0 ? Math.round(totalResponsesSum / GSI_SUBJECTS.length) : 0;

    return {
      totalResponsesAll,
      avgResponsesPerCat: avgResponsesAcrossSubjects,
      avgResponsesAcrossSubjects,
      totalResponsesSum,
      avgOverallPct,
      categoryStats,
      catTotals,
      ratingTotals,
      outletCount: items.length,
      daysRecordedTotal
    };
  };

  // Grand Regional Total
  const grandTotal = useMemo(() => computeAggregate(filteredRecaps), [filteredRecaps]);

  // Area Subtotals
  const areaSubtotals = useMemo(() => {
    return {
      'JAKARTA': computeAggregate(groupedByArea['JAKARTA'] || []),
      'TANGGERANG': computeAggregate(groupedByArea['TANGGERANG'] || []),
      'BEKASI & CIBUBUR': computeAggregate(groupedByArea['BEKASI & CIBUBUR'] || []),
    };
  }, [groupedByArea]);

  // Active Subject Aggregate based on subjectTableScope
  const activeSubjectAgg = useMemo(() => {
    if (subjectTableScope === 'JAKARTA') {
      return areaSubtotals['JAKARTA'] || computeAggregate([]);
    }
    if (subjectTableScope === 'TANGGERANG') {
      return areaSubtotals['TANGGERANG'] || computeAggregate([]);
    }
    if (subjectTableScope === 'BEKASI & CIBUBUR') {
      return areaSubtotals['BEKASI & CIBUBUR'] || computeAggregate([]);
    }
    if (subjectTableScope === 'OUTLET') {
      const match = filteredRecaps.filter(it => it.outlet === selectedSubjectOutlet);
      return computeAggregate(match);
    }
    return grandTotal;
  }, [subjectTableScope, selectedSubjectOutlet, areaSubtotals, grandTotal, filteredRecaps]);

  // Derived metrics for the active subject table:
  // "TOTAL RESPON ADALAH TOTAL DARI RATA RATA (SETIAP SUBJECT)"
  const activeSubjectMetrics = useMemo(() => {
    const agg = activeSubjectAgg;
    const catTotals = agg?.catTotals || {};
    const countSubjects = GSI_SUBJECTS.length;

    const sumResp = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.responses || 0), 0);
    const avgResp = countSubjects > 0 ? Math.round(sumResp / countSubjects) : 0;

    const sumExc = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.exc || 0), 0);
    const avgExc = countSubjects > 0 ? Math.round(sumExc / countSubjects) : 0;

    const sumGd = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.gd || 0), 0);
    const avgGd = countSubjects > 0 ? Math.round(sumGd / countSubjects) : 0;

    const sumAvg = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.avg || 0), 0);
    const avgAvg = countSubjects > 0 ? Math.round(sumAvg / countSubjects) : 0;

    const sumPr = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.pr || 0), 0);
    const avgPr = countSubjects > 0 ? Math.round(sumPr / countSubjects) : 0;

    const sumAbs = GSI_SUBJECTS.reduce((sum, s) => sum + (catTotals[s.key]?.abs || 0), 0);
    const avgAbs = countSubjects > 0 ? Math.round(sumAbs / countSubjects) : 0;

    const sumPoints = GSI_SUBJECTS.reduce((sum, s) => {
      const c = catTotals[s.key];
      if (!c) return sum;
      return sum + (c.exc * 4 + c.gd * 3 + c.avg * 2 + c.pr * 1);
    }, 0);
    const avgPoints = countSubjects > 0 ? Math.round(sumPoints / countSubjects) : 0;

    return {
      sumResp,
      avgResp,
      sumExc,
      avgExc,
      sumGd,
      avgGd,
      sumAvg,
      avgAvg,
      sumPr,
      avgPr,
      sumAbs,
      avgAbs,
      sumPoints,
      avgPoints,
    };
  }, [activeSubjectAgg]);

  const daysInMonth = useMemo(() => {
    const d = new Date(safeYear, safeMonth + 1, 0).getDate();
    return (isNaN(d) || d < 28) ? 30 : d;
  }, [safeYear, safeMonth]);

  // Daily GSI Matrix computation according to:
  // "METODE REKAP GSI ADALAH DARI KE 5 SUBJECT YANG DI ISI = TOTAL RESPON NYA = 1 DI BAGI PERSENTASE RATA+ SETIAP POINT SUBJECT"
  const dailyMatrix = useMemo(() => {
    const matrix: Record<string, Record<number, { responses: number; percentage: number; hasData: boolean }>> = {};

    OUTLETS.forEach(outletName => {
      const outletMonths = allOutletsData?.[outletName] || {};
      const mData = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || {};
      const dailyGSI: Record<string, any[]> = {
        ...(outletMonths.dailyGSI || {}),
        ...(mData.dailyGSI || {})
      };

      matrix[outletName] = {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        let rows: any[] | null = null;

        if (dailyGSI[dateStr] && Array.isArray(dailyGSI[dateStr])) {
          rows = dailyGSI[dateStr];
        } else if (dailyGSI[String(d)] && Array.isArray(dailyGSI[String(d)])) {
          rows = dailyGSI[String(d)];
        } else {
          for (const [k, val] of Object.entries(dailyGSI)) {
            if (!Array.isArray(val)) continue;
            if (k.endsWith(`-${String(d).padStart(2, '0')}`) || k === `${selectedYear}-${selectedMonth + 1}-${d}`) {
              rows = val;
              break;
            }
          }
        }

        if (!rows || rows.length === 0) {
          matrix[outletName][d] = { responses: 0, percentage: 0, hasData: false };
          continue;
        }

        // Rule: Total Respon = 1 questionnaire answered across the 5 subjects.
        // Questionnaire count = max responses among the subjects
        let maxResponses = 0;
        const validSubjectPcts: number[] = [];

        rows.forEach(r => {
          const exc = Number(r.excellent) || 0;
          const gd = Number(r.good) || 0;
          const avg = Number(r.average) || 0;
          const pr = Number(r.poor) || 0;
          const abs = Number(r.abstain) || 0;

          const totalValid = exc + gd + avg + pr;
          const totalWithAbs = totalValid + abs;
          if (totalWithAbs > maxResponses) {
            maxResponses = totalWithAbs;
          }

          if (totalValid > 0) {
            const points = (exc * 4) + (gd * 3) + (avg * 2) + (pr * 1);
            const maxPts = totalValid * 4;
            const pct = (points / maxPts) * 100;
            validSubjectPcts.push(pct);
          }
        });

        const dayGsiPct = validSubjectPcts.length > 0
          ? validSubjectPcts.reduce((sum, p) => sum + p, 0) / validSubjectPcts.length
          : 0;

        matrix[outletName][d] = {
          responses: maxResponses,
          percentage: dayGsiPct,
          hasData: maxResponses > 0
        };
      }
    });

    return matrix;
  }, [allOutletsData, selectedMonth, selectedYear, monthKey, daysInMonth]);

  // Regional daily totals
  const regionalDailyTotals = useMemo(() => {
    const totals: Record<number, { totalResponses: number; avgPercentage: number; outletsWithData: number }> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      let sumResp = 0;
      let sumPct = 0;
      let count = 0;

      filteredRecaps.forEach(rec => {
        const cell = dailyMatrix[rec.outlet]?.[d];
        if (cell && cell.hasData && cell.responses > 0) {
          sumResp += cell.responses;
          sumPct += cell.percentage;
          count++;
        }
      });

      totals[d] = {
        totalResponses: sumResp,
        avgPercentage: count > 0 ? sumPct / count : 0,
        outletsWithData: count
      };
    }

    return totals;
  }, [filteredRecaps, dailyMatrix, daysInMonth]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Rekap GSI ${monthName} ${selectedYear}`);
      sheet.views = [{ showGridLines: true }];

      // Title
      sheet.mergeCells('A1:P1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `REKAPAN GUEST SATISFACTION INDEX (GSI) REGIONAL - ${monthName.toUpperCase()} ${selectedYear}`;
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 36;

      // Header Row 1: Super headers
      const row2 = sheet.addRow([
        'NO', 'OUTLET', 'AREA', 'HARI INPUT',
        'QUALITY OF SERVICE', '',
        'QUALITY OF FOOD', '',
        'QUALITY OF BEVERAGE', '',
        'QUALITY OF CLEANLINESS', '',
        'ATTENTIVENESS OF STAFF', '',
        'VALUE FOR MONEY', '',
        'TOTAL GSI', ''
      ]);
      row2.height = 24;
      row2.eachCell(c => {
        c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Merge super headers
      sheet.mergeCells('A2:A3');
      sheet.mergeCells('B2:B3');
      sheet.mergeCells('C2:C3');
      sheet.mergeCells('D2:D3');
      sheet.mergeCells('E2:F2');
      sheet.mergeCells('G2:H2');
      sheet.mergeCells('I2:J2');
      sheet.mergeCells('K2:L2');
      sheet.mergeCells('M2:N2');
      sheet.mergeCells('O2:P2');
      sheet.mergeCells('Q2:R2');

      // Header Row 2: Sub-headers
      const row3 = sheet.addRow([
        '', '', '', '',
        'RESPON', 'SKOR %',
        'RESPON', 'SKOR %',
        'RESPON', 'SKOR %',
        'RESPON', 'SKOR %',
        'RESPON', 'SKOR %',
        'RESPON', 'SKOR %',
        'TOTAL RESPON', 'RATA-RATA %'
      ]);
      row3.height = 22;
      row3.eachCell(c => {
        c.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Data Rows grouped by area
      let rowNum = 1;
      (['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).forEach(areaKey => {
        const areaRows = groupedByArea[areaKey] || [];
        if (areaRows.length === 0) return;

        // Area Separator
        const areaHeader = sheet.addRow([
          '', `AREA ${areaKey} (${areaRows.length} OUTLET)`, '', '',
          '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]);
        areaHeader.height = 20;
        areaHeader.eachCell(c => {
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF6366F1' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        });

        areaRows.forEach(it => {
          const r = sheet.addRow([
            rowNum++,
            it.outlet,
            it.area,
            `${it.daysRecorded} Hari`,
            it.categories.qos?.responses || 0,
            `${(it.categories.qos?.percentage || 0).toFixed(1)}%`,
            it.categories.qof?.responses || 0,
            `${(it.categories.qof?.percentage || 0).toFixed(1)}%`,
            it.categories.qob?.responses || 0,
            `${(it.categories.qob?.percentage || 0).toFixed(1)}%`,
            it.categories.qoc?.responses || 0,
            `${(it.categories.qoc?.percentage || 0).toFixed(1)}%`,
            it.categories.aos?.responses || 0,
            `${(it.categories.aos?.percentage || 0).toFixed(1)}%`,
            it.categories.vfm?.responses || 0,
            `${(it.categories.vfm?.percentage || 0).toFixed(1)}%`,
            it.totalResponsesAllCategories,
            `${it.averagePercentage.toFixed(1)}%`
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
          sub.categoryStats.qos?.responses || 0,
          `${(sub.categoryStats.qos?.percentage || 0).toFixed(1)}%`,
          sub.categoryStats.qof?.responses || 0,
          `${(sub.categoryStats.qof?.percentage || 0).toFixed(1)}%`,
          sub.categoryStats.qob?.responses || 0,
          `${(sub.categoryStats.qob?.percentage || 0).toFixed(1)}%`,
          sub.categoryStats.qoc?.responses || 0,
          `${(sub.categoryStats.qoc?.percentage || 0).toFixed(1)}%`,
          sub.categoryStats.aos?.responses || 0,
          `${(sub.categoryStats.aos?.percentage || 0).toFixed(1)}%`,
          sub.categoryStats.vfm?.responses || 0,
          `${(sub.categoryStats.vfm?.percentage || 0).toFixed(1)}%`,
          sub.totalResponsesAll,
          `${sub.avgOverallPct.toFixed(1)}%`
        ]);
        subRow.height = 22;
        subRow.eachCell(c => {
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        });
      });

      // Grand Total Row
      const grandRow = sheet.addRow([
        '',
        'TOTAL REGIONAL',
        activeAreaFilter,
        '-',
        grandTotal.categoryStats.qos?.responses || 0,
        `${(grandTotal.categoryStats.qos?.percentage || 0).toFixed(1)}%`,
        grandTotal.categoryStats.qof?.responses || 0,
        `${(grandTotal.categoryStats.qof?.percentage || 0).toFixed(1)}%`,
        grandTotal.categoryStats.qob?.responses || 0,
        `${(grandTotal.categoryStats.qob?.percentage || 0).toFixed(1)}%`,
        grandTotal.categoryStats.qoc?.responses || 0,
        `${(grandTotal.categoryStats.qoc?.percentage || 0).toFixed(1)}%`,
        grandTotal.categoryStats.aos?.responses || 0,
        `${(grandTotal.categoryStats.aos?.percentage || 0).toFixed(1)}%`,
        grandTotal.categoryStats.vfm?.responses || 0,
        `${(grandTotal.categoryStats.vfm?.percentage || 0).toFixed(1)}%`,
        grandTotal.totalResponsesAll,
        `${grandTotal.avgOverallPct.toFixed(1)}%`
      ]);
      grandRow.height = 24;
      grandRow.eachCell(c => {
        c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
      });

      // Auto-fit widths for sheet 1
      sheet.columns.forEach(col => {
        col.width = 15;
      });
      sheet.getColumn(2).width = 24;

      // Add Worksheet 2: Rekap Nilai Rating GSI (Exc, Good, Avg, Poor, Abstain)
      const ratingSheet = workbook.addWorksheet(`Rekap Nilai ${monthName} ${selectedYear}`);
      ratingSheet.views = [{ showGridLines: true }];

      ratingSheet.mergeCells('A1:O1');
      const rTitle = ratingSheet.getCell('A1');
      rTitle.value = `REKAPAN TOTAL NILAI GSI (EXCELLENT, GOOD, AVERAGE, POOR, ABSTAIN) - ${monthName.toUpperCase()} ${selectedYear}`;
      rTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      rTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      rTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
      ratingSheet.getRow(1).height = 30;

      // Headers
      const rHeader = ratingSheet.addRow([
        'NO', 'OUTLET', 'AREA', 'HARI INPUT',
        'EXCELLENT (4)', '% EXC',
        'GOOD (3)', '% GOOD',
        'AVERAGE (2)', '% AVG',
        'POOR (1)', '% POOR',
        'ABSTAIN', '% ABS',
        'TOTAL RESPON'
      ]);
      rHeader.height = 24;
      rHeader.eachCell(c => {
        c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      let rIdx = 1;
      (['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).forEach(areaKey => {
        const areaRows = groupedByArea[areaKey] || [];
        if (areaRows.length === 0) return;
        const sub = computeAggregate(areaRows);

        areaRows.forEach(it => {
          const row = ratingSheet.addRow([
            rIdx++,
            it.outlet,
            it.area,
            it.daysRecorded,
            it.ratings.excellent,
            `${it.ratings.excellentPct.toFixed(1)}%`,
            it.ratings.good,
            `${it.ratings.goodPct.toFixed(1)}%`,
            it.ratings.average,
            `${it.ratings.averagePct.toFixed(1)}%`,
            it.ratings.poor,
            `${it.ratings.poorPct.toFixed(1)}%`,
            it.ratings.abstain,
            `${it.ratings.abstainPct.toFixed(1)}%`,
            it.ratings.total
          ]);
          row.height = 20;
        });

        // Area subtotal in ratingSheet
        const subRRow = ratingSheet.addRow([
          '',
          `SUBTOTAL ${areaKey}`,
          areaKey,
          '-',
          sub.ratingTotals.excellent,
          `${sub.ratingTotals.excellentPct.toFixed(1)}%`,
          sub.ratingTotals.good,
          `${sub.ratingTotals.goodPct.toFixed(1)}%`,
          sub.ratingTotals.average,
          `${sub.ratingTotals.averagePct.toFixed(1)}%`,
          sub.ratingTotals.poor,
          `${sub.ratingTotals.poorPct.toFixed(1)}%`,
          sub.ratingTotals.abstain,
          `${sub.ratingTotals.abstainPct.toFixed(1)}%`,
          sub.ratingTotals.total
        ]);
        subRRow.height = 22;
        subRRow.eachCell(c => {
          c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        });
      });

      // Grand total in ratingSheet
      const grandRRow = ratingSheet.addRow([
        '',
        'TOTAL REGIONAL',
        activeAreaFilter,
        '-',
        grandTotal.ratingTotals.excellent,
        `${grandTotal.ratingTotals.excellentPct.toFixed(1)}%`,
        grandTotal.ratingTotals.good,
        `${grandTotal.ratingTotals.goodPct.toFixed(1)}%`,
        grandTotal.ratingTotals.average,
        `${grandTotal.ratingTotals.averagePct.toFixed(1)}%`,
        grandTotal.ratingTotals.poor,
        `${grandTotal.ratingTotals.poorPct.toFixed(1)}%`,
        grandTotal.ratingTotals.abstain,
        `${grandTotal.ratingTotals.abstainPct.toFixed(1)}%`,
        grandTotal.ratingTotals.total
      ]);
      grandRRow.height = 24;
      grandRRow.eachCell(c => {
        c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
      });

      ratingSheet.columns.forEach(col => {
        col.width = 14;
      });
      ratingSheet.getColumn(2).width = 24;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Rekapan_GSI_Regional_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mengunduh Excel Rekapan GSI Regional', 'success');
    } catch (err: any) {
      console.error(err);
      showToast?.('Gagal mengunduh Excel GSI: ' + err.message, 'error');
    }
  };

  const getScoreBadge = (pct: number) => {
    if (pct === 0) return { label: 'No Data', cls: 'bg-slate-800 text-slate-500' };
    if (pct >= 85) return { label: 'Sangat Baik', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    if (pct >= 75) return { label: 'Baik', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    if (pct >= 60) return { label: 'Cukup', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return { label: 'Perlu Evaluasi', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-200">
      
      {/* HEADER & CONTROLS */}
      <div className="glass-card p-6 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black uppercase tracking-wider">
              Guest Satisfaction Index
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-xs font-bold text-slate-300">
              Periode: <strong className="text-white">{monthName} {selectedYear}</strong>
            </span>
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1 flex items-center gap-3">
            <i className="fas fa-poll text-blue-400"></i>
            Tabel Rekapan GSI Regional
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Konsolidasi total respon & rata-rata persentase per kategori subject sesuai input Admin Panel masing-masing outlet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-2xl border border-white/10 gap-1">
            <button
              onClick={() => setViewMode('SUBJECT_TABLE')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'SUBJECT_TABLE' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-list-check mr-1.5"></i>Tabel Rekapan Seluruh GSI
            </button>
            <button
              onClick={() => setViewMode('MATRIX')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'MATRIX' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-days mr-1.5"></i>Matriks Tanggal (1-{daysInMonth})
            </button>
            <button
              onClick={() => setViewMode('FULL')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'FULL' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table-columns mr-1.5"></i>Semua Kategori (6 Subject)
            </button>
            <button
              onClick={() => setViewMode('RATINGS')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'RATINGS' ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-star-half-stroke mr-1.5"></i>Rekap Nilai (Exc/Gd/Avg/Pr/Abs)
            </button>
            <button
              onClick={() => setViewMode('SUMMARY')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'SUMMARY' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-list-check mr-1.5"></i>Ringkasan
            </button>
            <button
              onClick={() => setViewMode('WEEKLY')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'WEEKLY' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar-week mr-1.5"></i>Rekapan Weekly (W1-W5)
            </button>
            <button
              onClick={() => setViewMode('MONTHLY')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'MONTHLY' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-calendar mr-1.5"></i>Rekapan Monthly (Jan-Des)
            </button>
            <button
              onClick={() => setViewMode('YTD')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'YTD' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-chart-line mr-1.5"></i>Rekapan YTD
            </button>
            <button
              onClick={() => setViewMode('COMPARE_LAST_WEEK')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'COMPARE_LAST_WEEK' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-arrow-trend-up mr-1.5"></i>Compare Last Week
            </button>
            <button
              onClick={() => setViewMode('COMPARE_LAST_MONTH')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'COMPARE_LAST_MONTH' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-arrows-split-up-and-left mr-1.5"></i>Compare Last Month
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

      {(viewMode === 'WEEKLY' || viewMode === 'MONTHLY' || viewMode === 'YTD' || viewMode === 'COMPARE_LAST_WEEK' || viewMode === 'COMPARE_LAST_MONTH') && (
        <RegionalMatrixReportTable
          title="Laporan Rekapitulasi GSI Regional"
          description="Laporan konsolidasi Guest Satisfaction Index (GSI): Matriks Tanggal Harian (1-31), Weekly (W1-W5), Bulanan (Jan-Des), YTD Kumulatif, Compare Last Week & Compare Last Month"
          moduleName="GSI (Respon)"
          valueUnit="QTY"
          allOutletsData={allOutletsData || {}}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedArea={activeAreaFilter}
          selectedOutlet={selectedOutlet}
          onSelectOutlet={onSelectOutlet}
          showToast={showToast}
          initialViewMode={viewMode === 'WEEKLY' ? 'WEEKLY' : viewMode === 'MONTHLY' ? 'MONTHLY' : viewMode === 'YTD' ? 'YTD' : viewMode === 'COMPARE_LAST_MONTH' ? 'COMPARE_MONTH' : 'COMPARE_WEEK'}
          extractDailyValue={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const dailyGSI = mData.dailyGSI || outletMonths.dailyGSI || {};
            const rows = dailyGSI[dateStr];
            if (Array.isArray(rows) && rows.length > 0) {
              let maxResp = 0;
              rows.forEach(r => {
                const total = (Number(r.excellent) || 0) + (Number(r.good) || 0) + (Number(r.average) || 0) + (Number(r.poor) || 0) + (Number(r.abstain) || 0);
                if (total > maxResp) maxResp = total;
              });
              return maxResp;
            }
            return 0;
          }}
          extractDailyTxCount={(outletMonths, dateStr) => {
            if (!outletMonths) return 0;
            const mIdx = parseInt(dateStr.split('-')[1], 10) - 1;
            const mData = outletMonths[String(mIdx)] || outletMonths[mIdx] || outletMonths.monthlyData?.[String(mIdx)] || outletMonths;
            const dailyGSI = mData.dailyGSI || outletMonths.dailyGSI || {};
            const rows = dailyGSI[dateStr];
            if (Array.isArray(rows) && rows.length > 0) {
              return rows.reduce((sum, r) => sum + (Number(r.excellent) || 0) + (Number(r.good) || 0), 0);
            }
            return 0;
          }}
        />
      )}

      {(viewMode === 'SUBJECT_TABLE' || viewMode === 'MATRIX' || viewMode === 'FULL' || viewMode === 'RATINGS' || viewMode === 'SUMMARY') && (
        <>
          {/* EXECUTIVE SUMMARY CHIPS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Overall Respon */}
        <div className="glass-card p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40">
          <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Respon Regional</span>
            <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">RATA-RATA SUBJECT</span>
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1 text-emerald-300">
            {grandTotal.avgResponsesAcrossSubjects.toLocaleString('id-ID')}
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
            Total dari Rata-Rata Subject (Akumulasi: {grandTotal.totalResponsesSum.toLocaleString('id-ID')} respon)
          </div>
        </div>

        {/* Skor Rata-rata Regional */}
        <div className="glass-card p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30">
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-wider">Rata-rata Skor GSI</div>
          <div className="text-2xl font-black text-indigo-300 font-mono mt-1">
            {grandTotal.avgOverallPct > 0 ? `${grandTotal.avgOverallPct.toFixed(1)}%` : '-'}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {getScoreBadge(grandTotal.avgOverallPct).label}
          </div>
        </div>

        {/* 6 Category Summary Cards */}
        {GSI_SUBJECTS.map(sub => {
          const cat = grandTotal.categoryStats[sub.key] || { responses: 0, percentage: 0 };
          return (
            <div key={sub.key} className="glass-card p-3.5 rounded-2xl bg-slate-900/60 border border-white/5">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate" title={sub.name}>
                {sub.short} - {sub.name}
              </div>
              <div className="text-lg font-black text-white font-mono mt-0.5">
                {cat.percentage > 0 ? `${cat.percentage.toFixed(1)}%` : '-'}
              </div>
              <div className="text-[8.5px] text-slate-400 font-mono mt-0.5">
                {cat.responses.toLocaleString('id-ID')} Respon
              </div>
            </div>
          );
        })}
      </div>

      {/* REKAPAN TOTAL MASING-MASING NILAI GSI (EXCELLENT, GOOD, AVERAGE, POOR, ABSTAIN) */}
      <div className="glass-card p-5 rounded-3xl bg-slate-900/90 border border-amber-500/30 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-chart-column text-amber-400"></i>
              Rekapan Total Nilai GSI Regional ({monthName} {selectedYear})
            </h3>
            <p className="text-[11px] text-slate-400">
              Total akumulasi respon kuisioner berdasarkan 5 skala penilaian: Excellent, Good, Average, Poor, dan Abstain
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Total Skor Nilai:</span>
            <span className="text-xs font-black font-mono text-emerald-400">
              {(grandTotal?.ratingTotals?.total ?? 0).toLocaleString('id-ID')} Respon Nilai
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* EXCELLENT */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 hover:border-emerald-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-star text-emerald-400"></i> EXCELLENT
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Skor 4
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {(grandTotal?.ratingTotals?.excellent ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-emerald-400 font-mono">
              <span>{(grandTotal?.ratingTotals?.excellentPct ?? 0).toFixed(1)}%</span>
              <span className="text-slate-400 text-[9px]">Sangat Baik</span>
            </div>
            <div className="w-full bg-slate-950/80 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, grandTotal?.ratingTotals?.excellentPct ?? 0)}%` }}
              ></div>
            </div>
          </div>

          {/* GOOD */}
          <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 hover:border-blue-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-thumbs-up text-blue-400"></i> GOOD
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Skor 3
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {(grandTotal?.ratingTotals?.good ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-blue-400 font-mono">
              <span>{(grandTotal?.ratingTotals?.goodPct ?? 0).toFixed(1)}%</span>
              <span className="text-slate-400 text-[9px]">Baik</span>
            </div>
            <div className="w-full bg-slate-950/80 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, grandTotal?.ratingTotals?.goodPct ?? 0)}%` }}
              ></div>
            </div>
          </div>

          {/* AVERAGE */}
          <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 hover:border-amber-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-circle-half-stroke text-amber-400"></i> AVERAGE
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Skor 2
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {(grandTotal?.ratingTotals?.average ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-amber-400 font-mono">
              <span>{(grandTotal?.ratingTotals?.averagePct ?? 0).toFixed(1)}%</span>
              <span className="text-slate-400 text-[9px]">Cukup</span>
            </div>
            <div className="w-full bg-slate-950/80 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, grandTotal?.ratingTotals?.averagePct ?? 0)}%` }}
              ></div>
            </div>
          </div>

          {/* POOR */}
          <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 hover:border-rose-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-face-frown text-rose-400"></i> POOR
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Skor 1
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {(grandTotal?.ratingTotals?.poor ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-rose-400 font-mono">
              <span>{(grandTotal?.ratingTotals?.poorPct ?? 0).toFixed(1)}%</span>
              <span className="text-slate-400 text-[9px]">Kurang</span>
            </div>
            <div className="w-full bg-slate-950/80 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, grandTotal?.ratingTotals?.poorPct ?? 0)}%` }}
              ></div>
            </div>
          </div>

          {/* ABSTAIN */}
          <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 hover:border-purple-500/60 transition-all col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-ban text-purple-400"></i> ABSTAIN
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                N/A
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {(grandTotal?.ratingTotals?.abstain ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-purple-400 font-mono">
              <span>{(grandTotal?.ratingTotals?.abstainPct ?? 0).toFixed(1)}%</span>
              <span className="text-slate-400 text-[9px]">Abstain</span>
            </div>
            <div className="w-full bg-slate-950/80 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, grandTotal?.ratingTotals?.abstainPct ?? 0)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* TABEL REKAPAN SELURUH GSI: SUBJECT MENGURUT KE BAWAH, SKALA NILAI MENGURUT KE KANAN */}
        <div className="mt-5 pt-5 border-t border-white/10 space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
                  Format Standar Rekapan GSI
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-[11px] font-black text-amber-400">
                  Total Respon = Total dari Rata-Rata (Setiap Subject)
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white uppercase italic tracking-tight mt-1 flex items-center gap-2.5">
                <i className="fas fa-table-list text-emerald-400"></i>
                Tabel Rekapan Seluruh GSI Regional ({monthName} {selectedYear})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daftar 6 Subjek GSI mengurut ke bawah, Skala Nilai (Excellent, Good, Average, Poor, Abstain) mengurut ke kanan. Total respon dihitung dari rata-rata respon setiap subjek.
              </p>
            </div>

            {/* Scope Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-white/10">
              <button
                onClick={() => setSubjectTableScope('ALL')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-globe mr-1"></i>Seluruh Regional
              </button>
              <button
                onClick={() => setSubjectTableScope('JAKARTA')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'JAKARTA'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-map-pin mr-1"></i>Jakarta
              </button>
              <button
                onClick={() => setSubjectTableScope('TANGGERANG')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'TANGGERANG'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-map-pin mr-1"></i>Tanggerang
              </button>
              <button
                onClick={() => setSubjectTableScope('BEKASI & CIBUBUR')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'BEKASI & CIBUBUR'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-map-pin mr-1"></i>Bekasi &amp; Cibubur
              </button>
              <button
                onClick={() => setSubjectTableScope('COMPARE_AREAS')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'COMPARE_AREAS'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-code-compare mr-1"></i>Bandingkan Area
              </button>
              <button
                onClick={() => setSubjectTableScope('OUTLET')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  subjectTableScope === 'OUTLET'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-store mr-1"></i>Per Outlet
              </button>
            </div>
          </div>

          {/* Outlet Selector when in OUTLET mode */}
          {subjectTableScope === 'OUTLET' && (
            <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-slate-300">Pilih Outlet:</span>
              <select
                value={selectedSubjectOutlet}
                onChange={(e) => setSelectedSubjectOutlet(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none cursor-pointer"
              >
                {filteredRecaps.map(it => (
                  <option key={it.outlet} value={it.outlet}>{it.outlet} ({it.area})</option>
                ))}
              </select>
            </div>
          )}

          {/* MAIN SUBJECT & SKALA NILAI TABLE (MENGURUT KE BAWAH & KE KANAN) */}
          {subjectTableScope !== 'COMPARE_AREAS' ? (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 shadow-inner">
              <table className="w-full text-left text-xs border-collapse min-w-[1050px]">
                <thead>
                  {/* Row 1: Super Headers */}
                  <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                    <th className="py-3 px-3 text-center w-12 border-r border-white/5" rowSpan={2}>
                      NO
                    </th>
                    <th className="py-3 px-4 border-r border-white/5 min-w-[240px]" rowSpan={2}>
                      SUBJECT GSI (MENGURUT KE BAWAH)
                    </th>
                    <th className="py-2.5 px-3 text-center border-b border-white/10 bg-emerald-950/50 text-emerald-300 border-r border-white/5" colSpan={2}>
                      <i className="fas fa-star text-emerald-400 mr-1.5"></i>EXCELLENT (4)
                    </th>
                    <th className="py-2.5 px-3 text-center border-b border-white/10 bg-blue-950/50 text-blue-300 border-r border-white/5" colSpan={2}>
                      <i className="fas fa-thumbs-up text-blue-400 mr-1.5"></i>GOOD (3)
                    </th>
                    <th className="py-2.5 px-3 text-center border-b border-white/10 bg-amber-950/50 text-amber-300 border-r border-white/5" colSpan={2}>
                      <i className="fas fa-circle-half-stroke text-amber-400 mr-1.5"></i>AVERAGE (2)
                    </th>
                    <th className="py-2.5 px-3 text-center border-b border-white/10 bg-rose-950/50 text-rose-300 border-r border-white/5" colSpan={2}>
                      <i className="fas fa-face-frown text-rose-400 mr-1.5"></i>POOR (1)
                    </th>
                    <th className="py-2.5 px-3 text-center border-b border-white/10 bg-purple-950/50 text-purple-300 border-r border-white/5" colSpan={2}>
                      <i className="fas fa-ban text-purple-400 mr-1.5"></i>ABSTAIN (0)
                    </th>
                    <th className="py-3 px-3 text-center border-r border-white/5 bg-indigo-950/40 text-indigo-300 min-w-[130px]" rowSpan={2}>
                      TOTAL RESPON
                    </th>
                    <th className="py-3 px-3 text-right border-r border-white/5 text-slate-300 min-w-[95px]" rowSpan={2}>
                      TOTAL POIN
                    </th>
                    <th className="py-3 px-3 text-center border-r border-white/5 bg-emerald-950/40 text-emerald-300 min-w-[115px]" rowSpan={2}>
                      SKOR GSI (%)
                    </th>
                    <th className="py-3 px-3 text-center min-w-[125px]" rowSpan={2}>
                      PREDIKAT
                    </th>
                  </tr>
                  {/* Row 2: Sub-headers (Qty / %) */}
                  <tr className="bg-slate-950/80 text-slate-400 font-black uppercase text-[9px] tracking-wider border-b border-white/10">
                    <th className="py-2 px-2 text-right bg-emerald-950/20 text-emerald-400">Qty</th>
                    <th className="py-2 px-2 text-right border-r border-white/5 bg-emerald-950/20 text-emerald-400">%</th>
                    <th className="py-2 px-2 text-right bg-blue-950/20 text-blue-400">Qty</th>
                    <th className="py-2 px-2 text-right border-r border-white/5 bg-blue-950/20 text-blue-400">%</th>
                    <th className="py-2 px-2 text-right bg-amber-950/20 text-amber-400">Qty</th>
                    <th className="py-2 px-2 text-right border-r border-white/5 bg-amber-950/20 text-amber-400">%</th>
                    <th className="py-2 px-2 text-right bg-rose-950/20 text-rose-400">Qty</th>
                    <th className="py-2 px-2 text-right border-r border-white/5 bg-rose-950/20 text-rose-400">%</th>
                    <th className="py-2 px-2 text-right bg-purple-950/20 text-purple-400">Qty</th>
                    <th className="py-2 px-2 text-right border-r border-white/5 bg-purple-950/20 text-purple-400">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
                  {GSI_SUBJECTS.map((sub, idx) => {
                    const d = activeSubjectAgg?.catTotals?.[sub.key] || { responses: 0, exc: 0, gd: 0, avg: 0, pr: 0, abs: 0 };
                    const totalExceptAbstain = d.exc + d.gd + d.avg + d.pr;
                    const totalPoints = (d.exc * 4) + (d.gd * 3) + (d.avg * 2) + (d.pr * 1);
                    const maxPoints = totalExceptAbstain * 4;
                    const percentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;
                    const resp = d.responses || 0;

                    const excPct = resp > 0 ? (d.exc / resp) * 100 : 0;
                    const gdPct = resp > 0 ? (d.gd / resp) * 100 : 0;
                    const avgPct = resp > 0 ? (d.avg / resp) * 100 : 0;
                    const prPct = resp > 0 ? (d.pr / resp) * 100 : 0;
                    const absPct = resp > 0 ? (d.abs / resp) * 100 : 0;

                    const badge = getScoreBadge(percentage);

                    return (
                      <tr key={sub.key} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-black text-white border-r border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                            <span>{sub.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                              {sub.short}
                            </span>
                          </div>
                        </td>
                        {/* EXCELLENT */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-emerald-300 bg-emerald-950/10">
                          {d.exc.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] text-emerald-400 bg-emerald-950/10 border-r border-white/5">
                          {excPct.toFixed(1)}%
                        </td>
                        {/* GOOD */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-blue-300 bg-blue-950/10">
                          {d.gd.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] text-blue-400 bg-blue-950/10 border-r border-white/5">
                          {gdPct.toFixed(1)}%
                        </td>
                        {/* AVERAGE */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                          {d.avg.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] text-amber-400 bg-amber-950/10 border-r border-white/5">
                          {avgPct.toFixed(1)}%
                        </td>
                        {/* POOR */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-rose-300 bg-rose-950/10">
                          {d.pr.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] text-rose-400 bg-rose-950/10 border-r border-white/5">
                          {prPct.toFixed(1)}%
                        </td>
                        {/* ABSTAIN */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-purple-300 bg-purple-950/10">
                          {d.abs.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] text-purple-400 bg-purple-950/10 border-r border-white/5">
                          {absPct.toFixed(1)}%
                        </td>
                        {/* TOTAL RESPON (SETIAP SUBJECT) */}
                        <td className="py-3 px-3 text-center font-mono font-black text-indigo-300 bg-indigo-950/20 border-r border-white/5">
                          {resp.toLocaleString('id-ID')}
                        </td>
                        {/* TOTAL POIN */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-300 border-r border-white/5">
                          {totalPoints.toLocaleString('id-ID')}
                        </td>
                        {/* SKOR GSI (%) */}
                        <td className="py-3 px-3 text-center font-mono font-black border-r border-white/5 bg-emerald-950/20 text-xs">
                          <span className={percentage >= 85 ? 'text-emerald-400 font-bold' : percentage >= 75 ? 'text-blue-400 font-bold' : percentage >= 60 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>
                            {percentage > 0 ? `${percentage.toFixed(2)}%` : '-'}
                          </span>
                        </td>
                        {/* PREDIKAT */}
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 font-black text-white text-xs border-t-2 border-emerald-500">
                    <td colSpan={2} className="py-4 px-4 uppercase tracking-wider text-emerald-400 border-r border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-sigma text-emerald-400"></i>
                          TOTAL / RATA-RATA {subjectTableScope === 'ALL' ? 'REGIONAL' : subjectTableScope === 'OUTLET' ? selectedSubjectOutlet : subjectTableScope}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono font-normal">
                          (6 Subjek GSI)
                        </span>
                      </div>
                    </td>
                    {/* EXCELLENT AVG & TOTAL */}
                    <td className="py-4 px-2 text-right font-mono font-black text-emerald-300 bg-emerald-950/30">
                      {activeSubjectMetrics.avgExc.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-2 text-right font-mono text-[10px] text-emerald-400 bg-emerald-950/30 border-r border-white/10">
                      {activeSubjectMetrics.sumResp > 0 ? ((activeSubjectMetrics.sumExc / activeSubjectMetrics.sumResp) * 100).toFixed(1) : 0}%
                    </td>
                    {/* GOOD AVG & TOTAL */}
                    <td className="py-4 px-2 text-right font-mono font-black text-blue-300 bg-blue-950/30">
                      {activeSubjectMetrics.avgGd.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-2 text-right font-mono text-[10px] text-blue-400 bg-blue-950/30 border-r border-white/10">
                      {activeSubjectMetrics.sumResp > 0 ? ((activeSubjectMetrics.sumGd / activeSubjectMetrics.sumResp) * 100).toFixed(1) : 0}%
                    </td>
                    {/* AVERAGE AVG & TOTAL */}
                    <td className="py-4 px-2 text-right font-mono font-black text-amber-300 bg-amber-950/30">
                      {activeSubjectMetrics.avgAvg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-2 text-right font-mono text-[10px] text-amber-400 bg-amber-950/30 border-r border-white/10">
                      {activeSubjectMetrics.sumResp > 0 ? ((activeSubjectMetrics.sumAvg / activeSubjectMetrics.sumResp) * 100).toFixed(1) : 0}%
                    </td>
                    {/* POOR AVG & TOTAL */}
                    <td className="py-4 px-2 text-right font-mono font-black text-rose-300 bg-rose-950/30">
                      {activeSubjectMetrics.avgPr.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-2 text-right font-mono text-[10px] text-rose-400 bg-rose-950/30 border-r border-white/10">
                      {activeSubjectMetrics.sumResp > 0 ? ((activeSubjectMetrics.sumPr / activeSubjectMetrics.sumResp) * 100).toFixed(1) : 0}%
                    </td>
                    {/* ABSTAIN AVG & TOTAL */}
                    <td className="py-4 px-2 text-right font-mono font-black text-purple-300 bg-purple-950/30">
                      {activeSubjectMetrics.avgAbs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-2 text-right font-mono text-[10px] text-purple-400 bg-purple-950/30 border-r border-white/10">
                      {activeSubjectMetrics.sumResp > 0 ? ((activeSubjectMetrics.sumAbs / activeSubjectMetrics.sumResp) * 100).toFixed(1) : 0}%
                    </td>
                    {/* TOTAL RESPON: TOTAL DARI RATA RATA (SETIAP SUBJECT) */}
                    <td className="py-4 px-3 text-center font-mono bg-indigo-950/50 border-r border-white/10">
                      <div className="text-base font-black text-emerald-300">
                        {activeSubjectMetrics.avgResp.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[8.5px] font-black uppercase tracking-wider text-emerald-400 leading-tight">
                        Rata-Rata Subject
                      </div>
                      <div className="text-[7.5px] text-slate-400 font-normal mt-0.5">
                        Akumulasi: {activeSubjectMetrics.sumResp.toLocaleString('id-ID')}
                      </div>
                    </td>
                    {/* TOTAL POIN */}
                    <td className="py-4 px-3 text-right font-mono text-slate-200 border-r border-white/10">
                      <div className="font-black text-white">{activeSubjectMetrics.avgPoints.toLocaleString('id-ID')}</div>
                      <div className="text-[8px] text-slate-400 font-normal">Rata-rata</div>
                    </td>
                    {/* SKOR GSI (%) */}
                    <td className="py-4 px-3 text-center font-mono font-black border-r border-white/10 bg-emerald-950/40">
                      <div className="text-sm font-black text-emerald-400">
                        {activeSubjectAgg?.avgOverallPct > 0 ? `${activeSubjectAgg.avgOverallPct.toFixed(2)}%` : '-'}
                      </div>
                      <div className="text-[8px] text-slate-400 font-normal">
                        Target ≥ 85.00%
                      </div>
                    </td>
                    {/* PREDIKAT */}
                    <td className="py-4 px-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${getScoreBadge(activeSubjectAgg?.avgOverallPct || 0).cls}`}>
                        {getScoreBadge(activeSubjectAgg?.avgOverallPct || 0).label}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            /* COMPARE AREAS MATRIX TABLE */
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 shadow-inner">
              <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                    <th className="py-3 px-3 text-center w-12 border-r border-white/5" rowSpan={2}>NO</th>
                    <th className="py-3 px-4 border-r border-white/5 min-w-[240px]" rowSpan={2}>SUBJECT GSI</th>
                    <th colSpan={2} className="py-2.5 px-3 text-center border-b border-white/10 bg-blue-950/50 text-blue-300 border-r border-white/5">
                      JAKARTA
                    </th>
                    <th colSpan={2} className="py-2.5 px-3 text-center border-b border-white/10 bg-indigo-950/50 text-indigo-300 border-r border-white/5">
                      TANGGERANG
                    </th>
                    <th colSpan={2} className="py-2.5 px-3 text-center border-b border-white/10 bg-amber-950/50 text-amber-300 border-r border-white/5">
                      BEKASI &amp; CIBUBUR
                    </th>
                    <th colSpan={2} className="py-2.5 px-3 text-center border-b border-white/10 bg-emerald-950/50 text-emerald-300">
                      REGIONAL KONSOLIDASI
                    </th>
                  </tr>
                  <tr className="bg-slate-950/80 text-slate-400 font-black uppercase text-[9px] tracking-wider border-b border-white/10">
                    <th className="py-2 px-3 text-center bg-blue-950/20 text-blue-400 border-r border-white/5">Respon</th>
                    <th className="py-2 px-3 text-center bg-blue-950/20 text-blue-400 border-r border-white/5">Skor %</th>
                    <th className="py-2 px-3 text-center bg-indigo-950/20 text-indigo-400 border-r border-white/5">Respon</th>
                    <th className="py-2 px-3 text-center bg-indigo-950/20 text-indigo-400 border-r border-white/5">Skor %</th>
                    <th className="py-2 px-3 text-center bg-amber-950/20 text-amber-400 border-r border-white/5">Respon</th>
                    <th className="py-2 px-3 text-center bg-amber-950/20 text-amber-400 border-r border-white/5">Skor %</th>
                    <th className="py-2 px-3 text-center bg-emerald-950/20 text-emerald-400 border-r border-white/5">Respon</th>
                    <th className="py-2 px-3 text-center bg-emerald-950/20 text-emerald-400">Skor %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-slate-300 text-[11px]">
                  {GSI_SUBJECTS.map((sub, idx) => {
                    const jkt = areaSubtotals['JAKARTA']?.categoryStats?.[sub.key];
                    const tgr = areaSubtotals['TANGGERANG']?.categoryStats?.[sub.key];
                    const bks = areaSubtotals['BEKASI & CIBUBUR']?.categoryStats?.[sub.key];
                    const reg = grandTotal?.categoryStats?.[sub.key];

                    return (
                      <tr key={sub.key} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold border-r border-white/5">{idx + 1}</td>
                        <td className="py-3 px-4 font-black text-white border-r border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                            <span>{sub.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                              {sub.short}
                            </span>
                          </div>
                        </td>
                        {/* JAKARTA */}
                        <td className="py-3 px-3 text-center font-mono text-slate-200 border-r border-white/5 bg-blue-950/10">
                          {jkt?.responses ? jkt.responses.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-blue-300 border-r border-white/5 bg-blue-950/10">
                          {jkt?.percentage ? `${jkt.percentage.toFixed(1)}%` : '-'}
                        </td>
                        {/* TANGGERANG */}
                        <td className="py-3 px-3 text-center font-mono text-slate-200 border-r border-white/5 bg-indigo-950/10">
                          {tgr?.responses ? tgr.responses.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-indigo-300 border-r border-white/5 bg-indigo-950/10">
                          {tgr?.percentage ? `${tgr.percentage.toFixed(1)}%` : '-'}
                        </td>
                        {/* BEKASI & CIBUBUR */}
                        <td className="py-3 px-3 text-center font-mono text-slate-200 border-r border-white/5 bg-amber-950/10">
                          {bks?.responses ? bks.responses.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-amber-300 border-r border-white/5 bg-amber-950/10">
                          {bks?.percentage ? `${bks.percentage.toFixed(1)}%` : '-'}
                        </td>
                        {/* REGIONAL */}
                        <td className="py-3 px-3 text-center font-mono font-black text-emerald-300 border-r border-white/5 bg-emerald-950/10">
                          {reg?.responses ? reg.responses.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-black text-emerald-400 bg-emerald-950/10">
                          {reg?.percentage ? `${reg.percentage.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 font-black text-white text-xs border-t-2 border-emerald-500">
                    <td colSpan={2} className="py-4 px-4 uppercase tracking-wider text-emerald-400 border-r border-white/10">
                      TOTAL RESPON (RATA-RATA SETIAP SUBJECT) &amp; SKOR GSI
                    </td>
                    {/* JAKARTA TOTAL */}
                    <td className="py-4 px-3 text-center font-mono font-black text-blue-300 bg-blue-950/30 border-r border-white/5">
                      <div>{(areaSubtotals['JAKARTA']?.avgResponsesAcrossSubjects ?? 0).toLocaleString('id-ID')}</div>
                      <div className="text-[7.5px] text-slate-400 font-normal">Rata-rata Subjek</div>
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-black text-blue-400 bg-blue-950/30 border-r border-white/5 text-sm">
                      {(areaSubtotals['JAKARTA']?.avgOverallPct ?? 0) > 0 ? `${areaSubtotals['JAKARTA'].avgOverallPct.toFixed(1)}%` : '-'}
                    </td>
                    {/* TANGGERANG TOTAL */}
                    <td className="py-4 px-3 text-center font-mono font-black text-indigo-300 bg-indigo-950/30 border-r border-white/5">
                      <div>{(areaSubtotals['TANGGERANG']?.avgResponsesAcrossSubjects ?? 0).toLocaleString('id-ID')}</div>
                      <div className="text-[7.5px] text-slate-400 font-normal">Rata-rata Subjek</div>
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-black text-indigo-400 bg-indigo-950/30 border-r border-white/5 text-sm">
                      {(areaSubtotals['TANGGERANG']?.avgOverallPct ?? 0) > 0 ? `${areaSubtotals['TANGGERANG'].avgOverallPct.toFixed(1)}%` : '-'}
                    </td>
                    {/* BEKASI TOTAL */}
                    <td className="py-4 px-3 text-center font-mono font-black text-amber-300 bg-amber-950/30 border-r border-white/5">
                      <div>{(areaSubtotals['BEKASI & CIBUBUR']?.avgResponsesAcrossSubjects ?? 0).toLocaleString('id-ID')}</div>
                      <div className="text-[7.5px] text-slate-400 font-normal">Rata-rata Subjek</div>
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-black text-amber-400 bg-amber-950/30 border-r border-white/5 text-sm">
                      {(areaSubtotals['BEKASI & CIBUBUR']?.avgOverallPct ?? 0) > 0 ? `${areaSubtotals['BEKASI & CIBUBUR'].avgOverallPct.toFixed(1)}%` : '-'}
                    </td>
                    {/* REGIONAL TOTAL */}
                    <td className="py-4 px-3 text-center font-mono font-black text-emerald-300 bg-emerald-950/40 border-r border-white/5">
                      <div className="text-sm font-black text-emerald-300">{grandTotal.avgResponsesAcrossSubjects.toLocaleString('id-ID')}</div>
                      <div className="text-[7.5px] text-emerald-400 font-normal">Rata-rata Subjek</div>
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-black text-emerald-400 bg-emerald-950/40 text-sm">
                      {grandTotal.avgOverallPct > 0 ? `${grandTotal.avgOverallPct.toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* TABLE OUTLET (HANYA DITAMPILKAN JIKA BUKAN MODE SUBJECT_TABLE) */}
      {viewMode !== 'SUBJECT_TABLE' && (
      <div className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
        <div className="overflow-x-auto custom-scrollbar max-h-[75vh]">
          <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider">
              {/* Row 1: Super Headers */}
              <tr className="border-b border-white/10">
                <th rowSpan={2} className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 w-12">
                  NO
                </th>
                <th rowSpan={2} className="p-3 border-r border-white/10 bg-slate-950 sticky left-12 z-40 min-w-[160px]">
                  OUTLET / STORE
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[90px]">
                  AREA
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-white/10 bg-slate-950 min-w-[85px]">
                  HARI INPUT
                </th>

                {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <th key={d} className="p-2 text-center border-r border-white/10 bg-slate-900 min-w-[65px]">
                    <span className="text-[10px] font-black text-amber-300">TGL {d}</span>
                  </th>
                ))}

                {viewMode === 'FULL' && GSI_SUBJECTS.map(s => (
                  <th key={s.key} colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-slate-900/90 text-white">
                    <span className="flex items-center justify-center gap-1">
                      <span className="font-mono text-indigo-400">[{s.short}]</span>
                      <span className="truncate">{s.name}</span>
                    </span>
                  </th>
                ))}

                {viewMode === 'SUMMARY' && GSI_SUBJECTS.map(s => (
                  <th key={s.key} className="p-2.5 text-center border-r border-white/10 bg-slate-900/90 text-white">
                    <span className="flex items-center justify-center gap-1">
                      <span className="font-mono text-indigo-400">[{s.short}]</span>
                      <span className="truncate">{s.name}</span>
                    </span>
                  </th>
                ))}

                {viewMode === 'RATINGS' && (
                  <>
                    <th colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-emerald-950/80 text-emerald-300">
                      <i className="fas fa-star mr-1"></i>EXCELLENT (4)
                    </th>
                    <th colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-blue-950/80 text-blue-300">
                      <i className="fas fa-thumbs-up mr-1"></i>GOOD (3)
                    </th>
                    <th colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-amber-950/80 text-amber-300">
                      <i className="fas fa-circle-half-stroke mr-1"></i>AVERAGE (2)
                    </th>
                    <th colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-rose-950/80 text-rose-300">
                      <i className="fas fa-face-frown mr-1"></i>POOR (1)
                    </th>
                    <th colSpan={2} className="p-2.5 text-center border-r border-white/10 bg-purple-950/80 text-purple-300">
                      <i className="fas fa-ban mr-1"></i>ABSTAIN
                    </th>
                  </>
                )}

                <th colSpan={3} className="p-2.5 text-center bg-blue-950 text-blue-300">
                  <i className="fas fa-chart-pie mr-1.5"></i>TOTAL REKAPAN GSI (MTD)
                </th>
              </tr>

              {/* Row 2: Sub Headers */}
              <tr className="border-b-2 border-blue-500/40 text-[9px]">
                {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <th key={d} className="p-1 text-center bg-slate-900/80 border-r border-white/5 text-[8px] text-slate-400 font-mono">
                    RESP / %
                  </th>
                ))}

                {viewMode === 'FULL' && GSI_SUBJECTS.map(s => (
                  <React.Fragment key={s.key}>
                    <th className="p-2 text-center bg-slate-900 border-r border-white/5 min-w-[65px]">
                      RESPON
                    </th>
                    <th className="p-2 text-center bg-slate-900 border-r border-white/10 min-w-[65px]">
                      SKOR %
                    </th>
                  </React.Fragment>
                ))}

                {viewMode === 'SUMMARY' && GSI_SUBJECTS.map(s => (
                  <th key={s.key} className="p-2 text-center bg-slate-900 border-r border-white/5 min-w-[75px] text-indigo-300">
                    RESPON
                  </th>
                ))}

                {viewMode === 'RATINGS' && (
                  <>
                    <th className="p-2 text-center bg-emerald-950/50 border-r border-white/5 min-w-[60px] text-emerald-300 font-bold">QTY</th>
                    <th className="p-2 text-center bg-emerald-950/50 border-r border-white/10 min-w-[55px] text-emerald-400 font-bold">%</th>
                    <th className="p-2 text-center bg-blue-950/50 border-r border-white/5 min-w-[60px] text-blue-300 font-bold">QTY</th>
                    <th className="p-2 text-center bg-blue-950/50 border-r border-white/10 min-w-[55px] text-blue-400 font-bold">%</th>
                    <th className="p-2 text-center bg-amber-950/50 border-r border-white/5 min-w-[60px] text-amber-300 font-bold">QTY</th>
                    <th className="p-2 text-center bg-amber-950/50 border-r border-white/10 min-w-[55px] text-amber-400 font-bold">%</th>
                    <th className="p-2 text-center bg-rose-950/50 border-r border-white/5 min-w-[60px] text-rose-300 font-bold">QTY</th>
                    <th className="p-2 text-center bg-rose-950/50 border-r border-white/10 min-w-[55px] text-rose-400 font-bold">%</th>
                    <th className="p-2 text-center bg-purple-950/50 border-r border-white/5 min-w-[60px] text-purple-300 font-bold">QTY</th>
                    <th className="p-2 text-center bg-purple-950/50 border-r border-white/10 min-w-[55px] text-purple-400 font-bold">%</th>
                  </>
                )}

                <th className="p-2 text-center bg-blue-950/60 border-r border-white/5 min-w-[90px]">
                  TOTAL RESPON
                </th>
                <th className="p-2 text-center bg-blue-950/60 border-r border-white/5 min-w-[95px]">
                  RATA-RATA %
                </th>
                <th className="p-2 text-center bg-blue-950/60 min-w-[100px]">
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
                    <tr className="bg-slate-950/90 font-black text-indigo-300 text-xs border-y border-white/10">
                      <td colSpan={3} className="p-2.5 pl-4 sticky left-0 z-20 bg-slate-950 border-r border-white/10">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-location-dot text-indigo-400"></i>
                          <span>AREA {areaKey}</span>
                          <span className="text-[10px] text-slate-500 font-normal">({areaRows.length} Outlet)</span>
                        </span>
                      </td>
                      <td colSpan={viewMode === 'MATRIX' ? ((daysInMonth && !isNaN(daysInMonth)) ? daysInMonth : 30) + 4 : viewMode === 'FULL' ? 15 : viewMode === 'RATINGS' ? 13 : 4} className="p-2 text-[10px] text-slate-400 italic">
                        Rekapan GSI Periode {monthName} {selectedYear}
                      </td>
                    </tr>

                    {/* Outlet Rows */}
                    {areaRows.map((it, idx) => {
                      const badge = getScoreBadge(it.averagePercentage);
                      return (
                        <tr
                          key={it.outlet}
                          onClick={() => onSelectOutlet && onSelectOutlet(it.outlet)}
                          className="hover:bg-blue-600/10 cursor-pointer transition-colors group"
                        >
                          <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800">
                            {idx + 1}
                          </td>
                          <td className="p-2.5 font-bold text-white border-r border-white/10 sticky left-12 z-20 bg-slate-900 group-hover:bg-slate-800 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span>{it.outlet}</span>
                              <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-blue-400 transition-colors"></i>
                            </div>
                          </td>
                          <td className="p-2.5 text-center border-r border-white/5 text-[10px] text-slate-400 font-bold">
                            {it.area}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 text-[10px]">
                            {it.daysRecorded > 0 ? `${it.daysRecorded} hari` : '-'}
                          </td>

                          {/* MATRIX Daily Columns: Total Respon & % GSI (1 customer = 1 response, average of 5 subjects) */}
                          {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                            const cell = dailyMatrix[it.outlet]?.[d];
                            return (
                              <td key={d} className="p-1.5 text-center border-r border-white/5">
                                {cell && cell.hasData && cell.responses > 0 ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    <span className="text-[10px] font-mono font-bold text-white whitespace-nowrap">
                                      {cell.responses} Resp
                                    </span>
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black font-mono border ${
                                      cell.percentage >= 95 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                      cell.percentage >= 85 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' :
                                      cell.percentage >= 75 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                      'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                    }`}>
                                      {cell.percentage.toFixed(1)}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 font-mono text-[10px]">-</span>
                                )}
                              </td>
                            );
                          })}

                          {/* 6 Category Columns */}
                          {viewMode === 'FULL' && GSI_SUBJECTS.map(s => {
                            const c = it.categories[s.key];
                            return (
                              <React.Fragment key={s.key}>
                                <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5">
                                  {c?.responses > 0 ? c.responses.toLocaleString('id-ID') : '-'}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold border-r border-white/10">
                                  {c?.percentage > 0 ? (
                                    <span className={c.percentage >= 85 ? 'text-emerald-400' : c.percentage >= 75 ? 'text-blue-400' : 'text-amber-400'}>
                                      {c.percentage.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}

                          {viewMode === 'SUMMARY' && GSI_SUBJECTS.map(s => {
                            const c = it.categories[s.key];
                            return (
                              <td key={s.key} className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 font-bold">
                                {c?.responses > 0 ? (
                                  <span className="text-white">{c.responses.toLocaleString('id-ID')}</span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                            );
                          })}

                          {viewMode === 'RATINGS' && (
                            <>
                              <td className="p-2.5 text-center font-mono font-bold text-emerald-300 border-r border-white/5 bg-emerald-950/10">
                                {it.ratings.excellent.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center font-mono text-emerald-400 border-r border-white/10 bg-emerald-950/10">
                                {it.ratings.excellentPct > 0 ? `${it.ratings.excellentPct.toFixed(1)}%` : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-blue-300 border-r border-white/5 bg-blue-950/10">
                                {it.ratings.good.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center font-mono text-blue-400 border-r border-white/10 bg-blue-950/10">
                                {it.ratings.goodPct > 0 ? `${it.ratings.goodPct.toFixed(1)}%` : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-amber-300 border-r border-white/5 bg-amber-950/10">
                                {it.ratings.average.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center font-mono text-amber-400 border-r border-white/10 bg-amber-950/10">
                                {it.ratings.averagePct > 0 ? `${it.ratings.averagePct.toFixed(1)}%` : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-rose-300 border-r border-white/5 bg-rose-950/10">
                                {it.ratings.poor.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center font-mono text-rose-400 border-r border-white/10 bg-rose-950/10">
                                {it.ratings.poorPct > 0 ? `${it.ratings.poorPct.toFixed(1)}%` : '-'}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-purple-300 border-r border-white/5 bg-purple-950/10">
                                {it.ratings.abstain.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center font-mono text-purple-400 border-r border-white/10 bg-purple-950/10">
                                {it.ratings.abstainPct > 0 ? `${it.ratings.abstainPct.toFixed(1)}%` : '-'}
                              </td>
                            </>
                          )}

                          {/* Total Respon & Rata-rata % Keseluruhan */}
                          <td className="p-2.5 text-center font-mono font-bold text-white border-r border-white/5 bg-blue-950/20">
                            {it.totalResponsesAllCategories > 0 ? it.totalResponsesAllCategories.toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-blue-300 border-r border-white/5 bg-blue-950/20 text-xs">
                            {it.averagePercentage > 0 ? `${it.averagePercentage.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center bg-blue-950/20">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Area Subtotal Row */}
                    <tr className="bg-slate-950/80 font-black text-xs border-y border-white/10 text-white">
                      <td colSpan={2} className="p-2.5 pl-4 sticky left-0 z-20 bg-slate-950 border-r border-white/10 text-indigo-300 uppercase">
                        SUBTOTAL {areaKey}
                      </td>
                      <td className="p-2.5 text-center border-r border-white/5 text-[10px] text-slate-400">
                        {areaRows.length} Outlet
                      </td>
                      <td className="p-2.5 text-center border-r border-white/5 text-slate-400 font-mono text-[10px]">
                        -
                      </td>

                      {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                        let sumResp = 0;
                        let sumPct = 0;
                        let count = 0;
                        areaRows.forEach(ar => {
                          const c = dailyMatrix[ar.outlet]?.[d];
                          if (c && c.hasData && c.responses > 0) {
                            sumResp += c.responses;
                            sumPct += c.percentage;
                            count++;
                          }
                        });
                        return (
                          <td key={d} className="p-1 text-center border-r border-white/5 bg-indigo-950/30">
                            {count > 0 ? (
                              <div className="flex flex-col items-center justify-center">
                                <span className="text-[9px] font-mono font-bold text-indigo-200">{sumResp} Resp</span>
                                <span className="text-[9px] font-mono font-black text-indigo-400">{(sumPct / count).toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono text-[9px]">-</span>
                            )}
                          </td>
                        );
                      })}

                      {viewMode === 'FULL' && GSI_SUBJECTS.map(s => {
                        const c = sub.categoryStats[s.key];
                        return (
                          <React.Fragment key={s.key}>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5">
                              {c?.responses > 0 ? c.responses.toLocaleString('id-ID') : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-indigo-300 border-r border-white/10">
                              {c?.percentage > 0 ? `${c.percentage.toFixed(1)}%` : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {viewMode === 'SUMMARY' && GSI_SUBJECTS.map(s => {
                        const c = sub.categoryStats[s.key];
                        return (
                          <td key={s.key} className="p-2.5 text-center font-mono font-bold text-indigo-300 border-r border-white/5">
                            {c?.responses > 0 ? c.responses.toLocaleString('id-ID') : '-'}
                          </td>
                        );
                      })}

                      {viewMode === 'RATINGS' && (
                        <>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-300 border-r border-white/5 bg-emerald-950/30">
                            {sub.ratingTotals.excellent.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-400 border-r border-white/10 bg-emerald-950/30">
                            {sub.ratingTotals.excellentPct > 0 ? `${sub.ratingTotals.excellentPct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-blue-300 border-r border-white/5 bg-blue-950/30">
                            {sub.ratingTotals.good.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-blue-400 border-r border-white/10 bg-blue-950/30">
                            {sub.ratingTotals.goodPct > 0 ? `${sub.ratingTotals.goodPct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-300 border-r border-white/5 bg-amber-950/30">
                            {sub.ratingTotals.average.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-400 border-r border-white/10 bg-amber-950/30">
                            {sub.ratingTotals.averagePct > 0 ? `${sub.ratingTotals.averagePct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-rose-300 border-r border-white/5 bg-rose-950/30">
                            {sub.ratingTotals.poor.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-rose-400 border-r border-white/10 bg-rose-950/30">
                            {sub.ratingTotals.poorPct > 0 ? `${sub.ratingTotals.poorPct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-purple-300 border-r border-white/5 bg-purple-950/30">
                            {sub.ratingTotals.abstain.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-purple-400 border-r border-white/10 bg-purple-950/30">
                            {sub.ratingTotals.abstainPct > 0 ? `${sub.ratingTotals.abstainPct.toFixed(1)}%` : '-'}
                          </td>
                        </>
                      )}

                      <td className="p-2.5 text-center font-mono font-black text-white border-r border-white/5 bg-indigo-950/40">
                        {sub.totalResponsesAll.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-indigo-300 border-r border-white/5 bg-indigo-950/40 text-xs">
                        {sub.avgOverallPct > 0 ? `${sub.avgOverallPct.toFixed(1)}%` : '-'}
                      </td>
                      <td className="p-2.5 text-center bg-indigo-950/40">
                        <span className="text-[9px] font-bold text-indigo-300 uppercase">
                          Area Avg
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* GRAND TOTAL REGIONAL FOOTER */}
            <tfoot className="sticky bottom-0 z-30 bg-slate-950 text-white font-black text-xs border-t-2 border-blue-500">
              <tr>
                <td colSpan={2} className="p-3 pl-4 sticky left-0 z-40 bg-slate-950 border-r border-white/10 uppercase text-blue-400">
                  TOTAL REGIONAL ({grandTotal.outletCount} OUTLET)
                </td>
                <td className="p-3 text-center border-r border-white/5 text-[10px] text-slate-400">
                  {activeAreaFilter}
                </td>
                <td className="p-3 text-center border-r border-white/5 font-mono text-slate-400 text-[10px]">
                  -
                </td>

                {viewMode === 'MATRIX' && Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                  const tot = regionalDailyTotals[d];
                  return (
                    <td key={d} className="p-1.5 text-center border-r border-white/5 bg-blue-950/80">
                      {tot && tot.outletsWithData > 0 ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-[9px] font-mono font-black text-emerald-400 whitespace-nowrap">{tot.totalResponses} Resp</span>
                          <span className="text-[9px] font-mono font-black text-blue-300">{tot.avgPercentage.toFixed(1)}%</span>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[9px]">-</span>
                      )}
                    </td>
                  );
                })}

                {viewMode === 'FULL' && GSI_SUBJECTS.map(s => {
                  const c = grandTotal.categoryStats[s.key];
                  return (
                    <React.Fragment key={s.key}>
                      <td className="p-3 text-center font-mono text-slate-200 border-r border-white/5">
                        {c?.responses > 0 ? c.responses.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-blue-300 border-r border-white/10">
                        {c?.percentage > 0 ? `${c.percentage.toFixed(1)}%` : '-'}
                      </td>
                    </React.Fragment>
                  );
                })}

                {viewMode === 'SUMMARY' && GSI_SUBJECTS.map(s => {
                  const c = grandTotal.categoryStats[s.key];
                  return (
                    <td key={s.key} className="p-3 text-center font-mono font-black text-indigo-300 border-r border-white/5">
                      {c?.responses > 0 ? c.responses.toLocaleString('id-ID') : '-'}
                    </td>
                  );
                })}

                {viewMode === 'RATINGS' && (
                  <>
                    <td className="p-3 text-center font-mono font-black text-emerald-300 border-r border-white/5 bg-emerald-950/60">
                      {grandTotal.ratingTotals.excellent.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-emerald-400 border-r border-white/10 bg-emerald-950/60">
                      {grandTotal.ratingTotals.excellentPct > 0 ? `${grandTotal.ratingTotals.excellentPct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-blue-300 border-r border-white/5 bg-blue-950/60">
                      {grandTotal.ratingTotals.good.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-blue-400 border-r border-white/10 bg-blue-950/60">
                      {grandTotal.ratingTotals.goodPct > 0 ? `${grandTotal.ratingTotals.goodPct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-amber-300 border-r border-white/5 bg-amber-950/60">
                      {grandTotal.ratingTotals.average.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-amber-400 border-r border-white/10 bg-amber-950/60">
                      {grandTotal.ratingTotals.averagePct > 0 ? `${grandTotal.ratingTotals.averagePct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-rose-300 border-r border-white/5 bg-rose-950/60">
                      {grandTotal.ratingTotals.poor.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-rose-400 border-r border-white/10 bg-rose-950/60">
                      {grandTotal.ratingTotals.poorPct > 0 ? `${grandTotal.ratingTotals.poorPct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-purple-300 border-r border-white/5 bg-purple-950/60">
                      {grandTotal.ratingTotals.abstain.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-purple-400 border-r border-white/10 bg-purple-950/60">
                      {grandTotal.ratingTotals.abstainPct > 0 ? `${grandTotal.ratingTotals.abstainPct.toFixed(1)}%` : '-'}
                    </td>
                  </>
                )}

                <td className="p-3 text-center font-mono font-black text-emerald-400 border-r border-white/5 bg-blue-950/60 text-sm">
                  {grandTotal.totalResponsesAll.toLocaleString('id-ID')}
                </td>
                <td className="p-3 text-center font-mono font-black text-blue-300 border-r border-white/5 bg-blue-950/60 text-sm">
                  {grandTotal.avgOverallPct > 0 ? `${grandTotal.avgOverallPct.toFixed(1)}%` : '-'}
                </td>
                <td className="p-3 text-center bg-blue-950/60">
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${getScoreBadge(grandTotal.avgOverallPct).cls}`}>
                    {getScoreBadge(grandTotal.avgOverallPct).label}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      )}
      </>
      )}
    </div>
  );
};

export default RegionalGSIRecapTable;
