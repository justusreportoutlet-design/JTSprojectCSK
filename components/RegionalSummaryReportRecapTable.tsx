import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { getAreaForOutlet } from '../constants';

/**
 * Resolves the Patty Cash Budget for an outlet and month
 */
export const resolvePattyCashBudget = (
  st: any,
  monthKey: string,
  mtdRevenue: number,
  outletName?: string
): number => {
  if (!st) {
    return mtdRevenue > 0 ? Math.round(0.003 * mtdRevenue) : 3000000;
  }

  const monthlyCat = st.monthlyPattyCashCategoryBudgets?.[monthKey];
  if (monthlyCat && typeof monthlyCat === 'object') {
    const sumNominal = (Object.values(monthlyCat) as any[]).reduce(
      (acc: number, v: any) => acc + (Number(v) || 0),
      0
    );
    if (sumNominal > 0) return sumNominal;
  }

  const monthlyNominal = st.monthlyPattyCashBudgetNominal?.[monthKey];
  if (typeof monthlyNominal === 'number' && monthlyNominal > 0) {
    return monthlyNominal;
  }

  if (st.pattyCashCategoryBudgets && typeof st.pattyCashCategoryBudgets === 'object') {
    const sumNominal = (Object.values(st.pattyCashCategoryBudgets) as any[]).reduce(
      (acc: number, v: any) => acc + (Number(v) || 0),
      0
    );
    if (sumNominal > 0) return sumNominal;
  }

  if (typeof st.pattyCashBudgetNominal === 'number' && st.pattyCashBudgetNominal > 0) {
    return st.pattyCashBudgetNominal;
  }

  const monthlyPctObj = st.monthlyPattyCashCategoryBudgetPct?.[monthKey] || st.pattyCashCategoryBudgetPct;
  if (monthlyPctObj && typeof monthlyPctObj === 'object' && mtdRevenue > 0) {
    const sumPct = (Object.values(monthlyPctObj) as any[]).reduce(
      (acc: number, v: any) => acc + (Number(v) || 0),
      0
    );
    if (sumPct > 0) {
      return Math.round((sumPct / 100) * mtdRevenue);
    }
  }

  const monthlyTotalPct = st.monthlyPattyCashBudgetPercent?.[monthKey] ?? st.pattyCashBudgetPercentage;
  if (typeof monthlyTotalPct === 'number' && monthlyTotalPct > 0 && mtdRevenue > 0) {
    return Math.round((monthlyTotalPct / 100) * mtdRevenue);
  }

  const expenseCat = st.monthlyExpenseCategoryBudgets?.[monthKey] || st.expenseCategoryBudgets;
  if (expenseCat && typeof expenseCat === 'object') {
    const sum =
      (Number(expenseCat.commodity) || 0) +
      (Number(expenseCat.nonCommodity) || 0) +
      (Number(expenseCat.maintenance) || 0) +
      (Number(expenseCat.atk) || 0) +
      (Number(expenseCat.asset) || 0) +
      (Number(expenseCat.casual) || 0);
    if (sum > 0) return sum;
  }

  if (typeof st.pattyCashBudget === 'number' && st.pattyCashBudget > 0) {
    return st.pattyCashBudget;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToTry = [
        outletName ? `PATTY_CASH_CAT_BUDGET_NOMINAL_${outletName}_${monthKey}` : null,
        `PATTY_CASH_CAT_BUDGET_NOMINAL_${monthKey}`,
        `PATTY_CASH_CAT_BUDGET_NOMINAL`,
        `EXPENSE_CATEGORY_BUDGETS_${monthKey}`,
        `EXPENSE_CATEGORY_BUDGETS`
      ].filter(Boolean) as string[];

      for (const k of keysToTry) {
        const item = localStorage.getItem(k);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && typeof parsed === 'object') {
            const s = (Object.values(parsed) as any[]).reduce(
              (acc: number, v: any) => acc + (Number(v) || 0),
              0
            );
            if (s > 0) return s;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (mtdRevenue > 0) {
    return Math.round(0.003 * mtdRevenue);
  }

  return 3000000;
};

export interface OutletSummaryRecapItem {
  no: number;
  outlet: string;
  area: string;

  // 1. REVENUE
  targetRevenue: number;
  actualRevenue: number;
  revenuePercent: number;
  revenueVariance: number;

  // 2. FOOD COST
  fcMk: number;
  fcMs: number;
  fcSupplier: number;
  fcTotal: number;
  fcPercent: number;

  // 3. OPEX (Hanya meliputi 6 Kategori: Non Commodity, Commodity, ATK, Maintenance, Asset, Casual)
  opexNonCommodity: number;
  opexCommodity: number;
  opexAtk: number;
  opexMaintenance: number;
  opexAsset: number;
  opexCasual: number;
  opexTotal: number;
  opexPercent: number;

  // 4. CHEMICAL, STATIONARY & MARKETING (Dipisah dari OPEX)
  chemicalTotal: number;
  stationaryTotal: number;
  marketingTotal: number;
  totalChemStatMkt: number;
  chemStatMktRatio: number;

  // 5. OVERTIME
  otService: number;
  otBar: number;
  otKitchen: number;
  otTotal: number;
  otStaffCount: number;
  otAverage: number;

  // 6. GSI
  gsiQos: number;
  gsiQof: number;
  gsiQob: number;
  gsiAos: number;
  gsiVfm: number;
  gsiTotalResponses: number;
  gsiScorePercent: number;

  // 7. GOOGLE REVIEW
  grRating: number;
  grTotalReviews: number;

  // 8. CPA
  cpaFood: number;
  cpaBeverage: number;
  cpaService: number;
  cpaTotal: number;

  // 9. OVERTIME EXTENDED
  otTotalPay?: number;
  otBudgetPay?: number;
  otUtilization?: number;

  // 10. REKAP MAN POWER
  mpBudget?: number;
  mpActual?: number;
  mpVariance?: number;
  mpVacant?: number;
  mpService?: number;
  mpBar?: number;
  mpKitchen?: number;
  mpFulfillment?: number;

  // 11. REKAP QUALITY ASSURANCE (3 BULAN)
  qaQuarterAvg?: number;
  qaBarAvg?: number;
  qaKitchenAvg?: number;
  qaServiceAvg?: number;
  qaStatus?: 'EXCELLENT' | 'SATISFACTORY' | 'TO IMPROVE' | '-';

  // 12. ENERGY COST & LEDGERS
  energyElectricity?: number;
  energyWater?: number;
  energyGas?: number;
  energyTotal?: number;
  energyRatio?: number;
  thirdPartyTotal?: number;
  gasLedgerTotal?: number;
  complimentaryTotal?: number;
  cityLedgerTotal?: number;

  // Compatibility aliases
  opexPattyCash?: number;
  opexChemical?: number;
  opexStationery?: number;
  opexMarketing?: number;
  mtdRevenue?: number;
  budgetRevenue?: number;
  revAchievement?: number;
  revVariance?: number;
  supplierBelanja?: number;
  mainKitchenBelanja?: number;
  mainStoreBelanja?: number;
  cashRetailFoodBelanja?: number;
  totalBelanjaOperasional?: number;
  costBelanjaPercent?: number;
  actualPattyCash?: number;
  budgetPattyCash?: number;
  pattyCashVariance?: number;
  pattyCashAchPercent?: number;
  isPattyCashOver?: boolean;
}

interface Props {
  items: OutletSummaryRecapItem[];
  monthName: string;
  selectedYear: number;
  selectedMonth: number;
  selectedArea?: string;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RegionalSummaryReportRecapTable: React.FC<Props> = ({
  items,
  monthName,
  selectedYear,
  selectedMonth,
  selectedArea,
  selectedOutlet,
  onSelectOutlet,
  showToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>(selectedArea || 'ALL');
  const [columnSection, setColumnSection] = useState<'ALL' | 'REV_FOOD' | 'OPEX' | 'CHEM_MKT' | 'OVERTIME' | 'MANPOWER' | 'QA_3MONTH' | 'ENERGY_LEDGER' | 'OT_GSI_CPA'>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  React.useEffect(() => {
    if (selectedArea) setSelectedAreaFilter(selectedArea);
  }, [selectedArea]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (selectedOutlet && selectedOutlet !== 'ALL' && it.outlet !== selectedOutlet) return false;
      const matchSearch = !searchQuery || it.outlet.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          it.area.toLowerCase().includes(searchQuery.toLowerCase());
      const matchArea = selectedAreaFilter === 'ALL' || it.area.toUpperCase() === selectedAreaFilter.toUpperCase();
      return matchSearch && matchArea;
    });
  }, [items, searchQuery, selectedAreaFilter, selectedOutlet]);

  // Group items by Area
  const groupedItems = useMemo(() => {
    const areas: { [areaName: string]: OutletSummaryRecapItem[] } = {
      'JAKARTA': [],
      'TANGGERANG': [],
      'BEKASI & CIBUBUR': []
    };

    filteredItems.forEach(it => {
      const a = (it.area || 'JAKARTA').toUpperCase();
      if (a.includes('TANGGERANG') || a.includes('ALSUT')) {
        areas['TANGGERANG'].push(it);
      } else if (a.includes('BEKASI') || a.includes('CIBUBUR')) {
        areas['BEKASI & CIBUBUR'].push(it);
      } else {
        areas['JAKARTA'].push(it);
      }
    });

    return areas;
  }, [filteredItems]);

  // Compute Subtotals for an array of items
  const computeSubtotal = (rows: OutletSummaryRecapItem[]) => {
    const s = {
      targetRevenue: 0,
      actualRevenue: 0,
      revenueVariance: 0,
      fcMk: 0,
      fcMs: 0,
      fcSupplier: 0,
      fcTotal: 0,
      // OPEX (6 Kategori: Non Commodity, Commodity, ATK, Maintenance, Asset, Casual)
      opexNonCommodity: 0,
      opexCommodity: 0,
      opexAtk: 0,
      opexMaintenance: 0,
      opexAsset: 0,
      opexCasual: 0,
      opexTotal: 0,
      // CHEMICAL, STATIONARY & MARKETING (Dipisah dari OPEX)
      chemicalTotal: 0,
      stationaryTotal: 0,
      marketingTotal: 0,
      totalChemStatMkt: 0,
      // OVERTIME
      otService: 0,
      otBar: 0,
      otKitchen: 0,
      otTotal: 0,
      otStaffCount: 0,
      otTotalPay: 0,
      otBudgetPay: 0,
      // MAN POWER
      mpBudget: 0,
      mpActual: 0,
      mpVariance: 0,
      mpVacant: 0,
      mpService: 0,
      mpBar: 0,
      mpKitchen: 0,
      // QA 3-MONTH
      qaQuarterAvg: 0,
      qaBarAvg: 0,
      qaKitchenAvg: 0,
      qaServiceAvg: 0,
      validQaCount: 0,
      // ENERGY & LEDGERS
      energyElectricity: 0,
      energyWater: 0,
      energyGas: 0,
      energyTotal: 0,
      thirdPartyTotal: 0,
      gasLedgerTotal: 0,
      complimentaryTotal: 0,
      cityLedgerTotal: 0,
      // GSI
      gsiQos: 0,
      gsiQof: 0,
      gsiQob: 0,
      gsiAos: 0,
      gsiVfm: 0,
      gsiTotalResponses: 0,
      gsiScorePercent: 0,
      // GOOGLE REVIEW
      grRating: 0,
      grTotalReviews: 0,
      // CPA
      cpaFood: 0,
      cpaBeverage: 0,
      cpaService: 0,
      cpaTotal: 0,
      validGsiCount: 0,
      validGrCount: 0,
      // Compatibility aliases
      opexPattyCash: 0,
      opexChemical: 0,
      opexStationery: 0,
      opexMarketing: 0,
    };

    rows.forEach(r => {
      s.targetRevenue += r.targetRevenue;
      s.actualRevenue += r.actualRevenue;
      s.revenueVariance += r.revenueVariance;

      s.fcMk += r.fcMk;
      s.fcMs += r.fcMs;
      s.fcSupplier += r.fcSupplier;
      s.fcTotal += r.fcTotal;

      // OPEX 6 categories
      s.opexNonCommodity += (r.opexNonCommodity || 0);
      s.opexCommodity += (r.opexCommodity || 0);
      s.opexAtk += (r.opexAtk || 0);
      s.opexMaintenance += (r.opexMaintenance || 0);
      s.opexAsset += (r.opexAsset || 0);
      s.opexCasual += (r.opexCasual || 0);
      s.opexTotal += (r.opexTotal || (
        (r.opexNonCommodity || 0) + (r.opexCommodity || 0) + (r.opexAtk || 0) +
        (r.opexMaintenance || 0) + (r.opexAsset || 0) + (r.opexCasual || 0)
      ));

      // Chemical, Stationary & Marketing (Dipisah dari OPEX)
      const cTot = r.chemicalTotal ?? r.opexChemical ?? 0;
      const sTot = r.stationaryTotal ?? r.opexStationery ?? 0;
      const mTot = r.marketingTotal ?? r.opexMarketing ?? 0;
      s.chemicalTotal += cTot;
      s.stationaryTotal += sTot;
      s.marketingTotal += mTot;
      s.totalChemStatMkt += (r.totalChemStatMkt ?? (cTot + sTot + mTot));

      // Legacy aliases
      s.opexPattyCash += (r.opexTotal || 0);
      s.opexChemical += cTot;
      s.opexStationery += sTot;
      s.opexMarketing += mTot;

      s.otService += r.otService;
      s.otBar += r.otBar;
      s.otKitchen += r.otKitchen;
      s.otTotal += r.otTotal;
      s.otStaffCount += r.otStaffCount;
      s.otTotalPay += (r.otTotalPay || 0);
      s.otBudgetPay += (r.otBudgetPay || 0);

      // Man Power
      s.mpBudget += (r.mpBudget || 0);
      s.mpActual += (r.mpActual || 0);
      s.mpVariance += (r.mpVariance || 0);
      s.mpVacant += (r.mpVacant || 0);
      s.mpService += (r.mpService || 0);
      s.mpBar += (r.mpBar || 0);
      s.mpKitchen += (r.mpKitchen || 0);

      // QA 3-Month
      if (r.qaQuarterAvg && r.qaQuarterAvg > 0) {
        s.qaQuarterAvg += r.qaQuarterAvg;
        s.qaBarAvg += (r.qaBarAvg || 0);
        s.qaKitchenAvg += (r.qaKitchenAvg || 0);
        s.qaServiceAvg += (r.qaServiceAvg || 0);
        s.validQaCount++;
      }

      // Energy & Ledgers
      s.energyElectricity += (r.energyElectricity || 0);
      s.energyWater += (r.energyWater || 0);
      s.energyGas += (r.energyGas || 0);
      s.energyTotal += (r.energyTotal || 0);
      s.thirdPartyTotal += (r.thirdPartyTotal || 0);
      s.gasLedgerTotal += (r.gasLedgerTotal || 0);
      s.complimentaryTotal += (r.complimentaryTotal || 0);
      s.cityLedgerTotal += (r.cityLedgerTotal || 0);

      if (r.gsiScorePercent > 0) {
        s.gsiQos += r.gsiQos;
        s.gsiQof += r.gsiQof;
        s.gsiQob += r.gsiQob;
        s.gsiAos += r.gsiAos;
        s.gsiVfm += r.gsiVfm;
        s.gsiScorePercent += r.gsiScorePercent;
        s.validGsiCount++;
      }
      s.gsiTotalResponses += r.gsiTotalResponses;

      if (r.grRating > 0) {
        s.grRating += r.grRating;
        s.validGrCount++;
      }
      s.grTotalReviews += r.grTotalReviews;

      s.cpaFood += r.cpaFood;
      s.cpaBeverage += r.cpaBeverage;
      s.cpaService += r.cpaService;
      s.cpaTotal += r.cpaTotal;
    });

    const revenuePercent = s.targetRevenue > 0 ? (s.actualRevenue / s.targetRevenue) * 100 : 0;
    const fcPercent = s.actualRevenue > 0 ? (s.fcTotal / s.actualRevenue) * 100 : 0;
    const opexPercent = s.actualRevenue > 0 ? (s.opexTotal / s.actualRevenue) * 100 : 0;
    const chemStatMktRatio = s.actualRevenue > 0 ? (s.totalChemStatMkt / s.actualRevenue) * 100 : 0;
    const otAverage = s.otStaffCount > 0 ? s.otTotal / s.otStaffCount : 0;
    const otUtilization = s.otBudgetPay > 0 ? (s.otTotalPay / s.otBudgetPay) * 100 : 0;
    const mpFulfillment = s.mpBudget > 0 ? (s.mpActual / s.mpBudget) * 100 : 0;
    const avgQaQuarter = s.validQaCount > 0 ? Number((s.qaQuarterAvg / s.validQaCount).toFixed(2)) : 0;
    const avgQaBar = s.validQaCount > 0 ? Number((s.qaBarAvg / s.validQaCount).toFixed(2)) : 0;
    const avgQaKitchen = s.validQaCount > 0 ? Number((s.qaKitchenAvg / s.validQaCount).toFixed(2)) : 0;
    const avgQaService = s.validQaCount > 0 ? Number((s.qaServiceAvg / s.validQaCount).toFixed(2)) : 0;
    const energyRatio = s.actualRevenue > 0 ? (s.energyTotal / s.actualRevenue) * 100 : 0;

    const avgQos = s.validGsiCount > 0 ? s.gsiQos / s.validGsiCount : 0;
    const avgQof = s.validGsiCount > 0 ? s.gsiQof / s.validGsiCount : 0;
    const avgQob = s.validGsiCount > 0 ? s.gsiQob / s.validGsiCount : 0;
    const avgAos = s.validGsiCount > 0 ? s.gsiAos / s.validGsiCount : 0;
    const avgVfm = s.validGsiCount > 0 ? s.gsiVfm / s.validGsiCount : 0;
    const avgScore = s.validGsiCount > 0 ? s.gsiScorePercent / s.validGsiCount : 0;
    const avgGrRating = s.validGrCount > 0 ? s.grRating / s.validGrCount : 0;

    return {
      ...s,
      revenuePercent,
      fcPercent,
      opexPercent,
      chemStatMktRatio,
      otAverage,
      otUtilization,
      mpFulfillment,
      avgQaQuarter,
      avgQaBar,
      avgQaKitchen,
      avgQaService,
      energyRatio,
      avgQos,
      avgQof,
      avgQob,
      avgAos,
      avgVfm,
      avgScore,
      avgGrRating,
    };
  };

  // Grand Total Regional
  const regionalTotals = useMemo(() => computeSubtotal(filteredItems), [filteredItems]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('SUMMARY_REPORT_REGIONAL');

      // Title
      sheet.addRow(['REGIONAL SUMMARY REPORT - PERFORMANCE OVERVIEW']);
      sheet.addRow([`Periode: ${monthName} ${selectedYear} | Filter Area: ${selectedAreaFilter}`]);
      sheet.addRow([]);

      // Multi-tier header (Row 1)
      const r1 = sheet.addRow([
        'NO', 'STORE', 'AREA',
        // REVENUE (4 cols)
        'REVENUE', '', '', '',
        // FOOD COST (5 cols)
        'FOOD COST', '', '', '', '',
        // OPEX (8 cols)
        'OPEX (6 KATEGORI)', '', '', '', '', '', '', '',
        // CHEMICAL, STATIONARY & MARKETING (5 cols)
        'CHEM, STAT & MKT (TERPISAH)', '', '', '', '',
        // OVERTIME (5 cols)
        'OVERTIME', '', '', '', '',
        // GSI (7 cols)
        'GSI', '', '', '', '', '', '',
        // GOOGLE REVIEW (2 cols)
        'GOOGLE REVIEW', '',
        // CPA (4 cols)
        'CPA', '', '', ''
      ]);

      // Sub-header (Row 2)
      const r2 = sheet.addRow([
        '', '', '',
        // REVENUE
        'TARGET', 'ACTUAL', '%', 'VARIANCE',
        // FOOD COST
        'MK', 'MS', 'SUPPLIER', 'TOTAL', '%',
        // OPEX (6 KATEGORI)
        'NON COMMODITY', 'COMMODITY', 'ATK', 'MAINTENANCE', 'ASSET', 'CASUAL', 'TOTAL OPEX', '%',
        // CHEM, STAT & MKT
        'CHEMICAL', 'STATIONERY', 'MARKETING', 'TOTAL', '%',
        // OVERTIME
        'SERVICE (H)', 'BAR (H)', 'KITCHEN (H)', 'TOTAL (H)', 'AVG/STAFF',
        // GSI
        'QOS %', 'QOF %', 'QOB %', 'AOS %', 'VFM %', 'TOTAL RESP', 'SCORE %',
        // GOOGLE REVIEW
        'RATING', 'REVIEWS',
        // CPA
        'FOOD', 'BEV', 'SERVICE', 'TOTAL CPA'
      ]);

      // Style header
      [r1, r2].forEach(r => {
        r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        r.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Data Rows grouped by area
      let rowNum = 1;
      (['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).forEach(areaKey => {
        const areaRows = groupedItems[areaKey] || [];
        if (areaRows.length === 0) return;

        // Area banner row
        const areaRow = sheet.addRow([`AREA: ${areaKey}`, '', '']);
        areaRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

        areaRows.forEach(it => {
          sheet.addRow([
            rowNum++,
            it.outlet,
            it.area,
            it.targetRevenue,
            it.actualRevenue,
            `${it.revenuePercent.toFixed(1)}%`,
            it.revenueVariance,
            it.fcMk,
            it.fcMs,
            it.fcSupplier,
            it.fcTotal,
            `${it.fcPercent.toFixed(1)}%`,
            // OPEX (6 KATEGORI)
            it.opexNonCommodity,
            it.opexCommodity,
            it.opexAtk,
            it.opexMaintenance,
            it.opexAsset,
            it.opexCasual,
            it.opexTotal,
            `${it.opexPercent.toFixed(1)}%`,
            // CHEMICAL, STATIONARY & MARKETING (TERPISAH)
            it.chemicalTotal,
            it.stationaryTotal,
            it.marketingTotal,
            it.totalChemStatMkt,
            `${it.chemStatMktRatio.toFixed(1)}%`,
            // OVERTIME
            it.otService,
            it.otBar,
            it.otKitchen,
            it.otTotal,
            it.otAverage.toFixed(1),
            `${it.gsiQos.toFixed(1)}%`,
            `${it.gsiQof.toFixed(1)}%`,
            `${it.gsiQob.toFixed(1)}%`,
            `${it.gsiAos.toFixed(1)}%`,
            `${it.gsiVfm.toFixed(1)}%`,
            it.gsiTotalResponses,
            `${it.gsiScorePercent.toFixed(1)}%`,
            it.grRating > 0 ? it.grRating.toFixed(1) : '-',
            it.grTotalReviews,
            it.cpaFood,
            it.cpaBeverage,
            it.cpaService,
            it.cpaTotal
          ]);
        });

        // Area Subtotal Row
        const sub = computeSubtotal(areaRows);
        sheet.addRow([
          '',
          `SUBTOTAL ${areaKey}`,
          '',
          sub.targetRevenue,
          sub.actualRevenue,
          `${sub.revenuePercent.toFixed(1)}%`,
          sub.revenueVariance,
          sub.fcMk,
          sub.fcMs,
          sub.fcSupplier,
          sub.fcTotal,
          `${sub.fcPercent.toFixed(1)}%`,
          // OPEX
          sub.opexNonCommodity,
          sub.opexCommodity,
          sub.opexAtk,
          sub.opexMaintenance,
          sub.opexAsset,
          sub.opexCasual,
          sub.opexTotal,
          `${sub.opexPercent.toFixed(1)}%`,
          // CHEM, STAT & MKT
          sub.chemicalTotal,
          sub.stationaryTotal,
          sub.marketingTotal,
          sub.totalChemStatMkt,
          `${sub.chemStatMktRatio.toFixed(1)}%`,
          // OVERTIME
          sub.otService,
          sub.otBar,
          sub.otKitchen,
          sub.otTotal,
          sub.otAverage.toFixed(1),
          `${sub.avgQos.toFixed(1)}%`,
          `${sub.avgQof.toFixed(1)}%`,
          `${sub.avgQob.toFixed(1)}%`,
          `${sub.avgAos.toFixed(1)}%`,
          `${sub.avgVfm.toFixed(1)}%`,
          sub.gsiTotalResponses,
          `${sub.avgScore.toFixed(1)}%`,
          sub.avgGrRating > 0 ? sub.avgGrRating.toFixed(1) : '-',
          sub.grTotalReviews,
          sub.cpaFood,
          sub.cpaBeverage,
          sub.cpaService,
          sub.cpaTotal
        ]);
      });

      // Grand Total Row
      sheet.addRow([]);
      sheet.addRow([
        '',
        'TOTAL REGIONAL',
        selectedAreaFilter,
        regionalTotals.targetRevenue,
        regionalTotals.actualRevenue,
        `${regionalTotals.revenuePercent.toFixed(1)}%`,
        regionalTotals.revenueVariance,
        regionalTotals.fcMk,
        regionalTotals.fcMs,
        regionalTotals.fcSupplier,
        regionalTotals.fcTotal,
        `${regionalTotals.fcPercent.toFixed(1)}%`,
        // OPEX
        regionalTotals.opexNonCommodity,
        regionalTotals.opexCommodity,
        regionalTotals.opexAtk,
        regionalTotals.opexMaintenance,
        regionalTotals.opexAsset,
        regionalTotals.opexCasual,
        regionalTotals.opexTotal,
        `${regionalTotals.opexPercent.toFixed(1)}%`,
        // CHEM, STAT & MKT
        regionalTotals.chemicalTotal,
        regionalTotals.stationaryTotal,
        regionalTotals.marketingTotal,
        regionalTotals.totalChemStatMkt,
        `${regionalTotals.chemStatMktRatio.toFixed(1)}%`,
        // OVERTIME
        regionalTotals.otService,
        regionalTotals.otBar,
        regionalTotals.otKitchen,
        regionalTotals.otTotal,
        regionalTotals.otAverage.toFixed(1),
        `${regionalTotals.avgQos.toFixed(1)}%`,
        `${regionalTotals.avgQof.toFixed(1)}%`,
        `${regionalTotals.avgQob.toFixed(1)}%`,
        `${regionalTotals.avgAos.toFixed(1)}%`,
        `${regionalTotals.avgVfm.toFixed(1)}%`,
        regionalTotals.gsiTotalResponses,
        `${regionalTotals.avgScore.toFixed(1)}%`,
        regionalTotals.avgGrRating > 0 ? regionalTotals.avgGrRating.toFixed(1) : '-',
        regionalTotals.grTotalReviews,
        regionalTotals.cpaFood,
        regionalTotals.cpaBeverage,
        regionalTotals.cpaService,
        regionalTotals.cpaTotal
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `SUMMARY_REPORT_REGIONAL_${monthName}_${selectedYear}.xlsx`);
      if (showToast) showToast('File Excel Summary Report Regional berhasil diunduh!', 'success');
    } catch (e: any) {
      console.error('Excel Export Error:', e);
      if (showToast) showToast(`Gagal export Excel: ${e.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // WhatsApp broadcast text generator
  const handleCopyWhatsApp = () => {
    let msg = `*📊 SUMMARY REPORT REGIONAL - THE BARN*\n`;
    msg += `*Periode:* ${monthName} ${selectedYear}\n`;
    msg += `*Area Filter:* ${selectedAreaFilter}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `*💰 1. REVENUE REGIONAL*\n`;
    msg += `• Target: Rp ${regionalTotals.targetRevenue.toLocaleString('id-ID')}\n`;
    msg += `• Actual: Rp ${regionalTotals.actualRevenue.toLocaleString('id-ID')}\n`;
    msg += `• Ach: *${regionalTotals.revenuePercent.toFixed(1)}%* | Var: Rp ${regionalTotals.revenueVariance.toLocaleString('id-ID')}\n\n`;

    msg += `*🥩 2. FOOD COST (BELANJA)*\n`;
    msg += `• Total: Rp ${regionalTotals.fcTotal.toLocaleString('id-ID')} (*${regionalTotals.fcPercent.toFixed(1)}%*)\n`;
    msg += `• MK: Rp ${regionalTotals.fcMk.toLocaleString('id-ID')} | MS: Rp ${regionalTotals.fcMs.toLocaleString('id-ID')} | Supplier: Rp ${regionalTotals.fcSupplier.toLocaleString('id-ID')}\n\n`;

    msg += `*⚙️ 3. OPEX (6 KATEGORI: Non Comm, Comm, ATK, Maint, Asset, Casual)*\n`;
    msg += `• Total Opex: Rp ${regionalTotals.opexTotal.toLocaleString('id-ID')} (*${regionalTotals.opexPercent.toFixed(1)}%*)\n`;
    msg += `• Non Commodity: Rp ${regionalTotals.opexNonCommodity.toLocaleString('id-ID')} | Commodity: Rp ${regionalTotals.opexCommodity.toLocaleString('id-ID')}\n`;
    msg += `• ATK: Rp ${regionalTotals.opexAtk.toLocaleString('id-ID')} | Maintenance: Rp ${regionalTotals.opexMaintenance.toLocaleString('id-ID')}\n`;
    msg += `• Asset: Rp ${regionalTotals.opexAsset.toLocaleString('id-ID')} | Casual: Rp ${regionalTotals.opexCasual.toLocaleString('id-ID')}\n\n`;

    msg += `*🧪 4. CHEMICAL, STATIONARY & MARKETING (DIPISAH)*\n`;
    msg += `• Total: Rp ${regionalTotals.totalChemStatMkt.toLocaleString('id-ID')} (*${regionalTotals.chemStatMktRatio.toFixed(1)}%*)\n`;
    msg += `• Chemical: Rp ${regionalTotals.chemicalTotal.toLocaleString('id-ID')} | Stationery: Rp ${regionalTotals.stationaryTotal.toLocaleString('id-ID')} | Marketing: Rp ${regionalTotals.marketingTotal.toLocaleString('id-ID')}\n\n`;

    msg += `*⏱️ 5. OVERTIME*\n`;
    msg += `• Total OT: *${regionalTotals.otTotal.toLocaleString('id-ID')} Jam* (Avg: ${regionalTotals.otAverage.toFixed(1)} Jam/Staff)\n`;
    msg += `• Svc: ${regionalTotals.otService}h | Bar: ${regionalTotals.otBar}h | Kitchen: ${regionalTotals.otKitchen}h\n\n`;

    msg += `*⭐ 6. GSI & GOOGLE REVIEW*\n`;
    msg += `• GSI Score: *${regionalTotals.avgScore.toFixed(1)}%* (${regionalTotals.gsiTotalResponses} Responden)\n`;
    msg += `• QOS: ${regionalTotals.avgQos.toFixed(1)}% | QOF: ${regionalTotals.avgQof.toFixed(1)}% | QOB: ${regionalTotals.avgQob.toFixed(1)}%\n`;
    msg += `• Google Review: *${regionalTotals.avgGrRating.toFixed(1)}* (${regionalTotals.grTotalReviews} Reviews)\n\n`;

    msg += `*⚠️ 7. CPA (COMPLAINTS)*\n`;
    msg += `• Total CPA: *${regionalTotals.cpaTotal} Kasus* (Food: ${regionalTotals.cpaFood}, Bev: ${regionalTotals.cpaBeverage}, Svc: ${regionalTotals.cpaService})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Generated live from The Barn Regional Operations Dashboard_`;

    navigator.clipboard.writeText(msg);
    if (showToast) showToast('Format WhatsApp berhasil disalin ke clipboard!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Navigation Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900/90 p-5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <i className="fas fa-table-list text-lg"></i>
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              Summary Report Regional
              <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                {monthName} {selectedYear}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Format Konsolidasi Terpadu: Revenue, Food Cost, Opex, Chemical & Marketing, Overtime, GSI, Google Review & CPA
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          {/* Section Column Toggles */}
          <div className="flex flex-wrap items-center bg-slate-950/60 p-1 rounded-xl border border-white/5 text-[10px] font-bold gap-0.5">
            <button
              onClick={() => setColumnSection('ALL')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Semua Kolom
            </button>
            <button
              onClick={() => setColumnSection('REV_FOOD')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'REV_FOOD' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Rev & Food
            </button>
            <button
              onClick={() => setColumnSection('OPEX')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'OPEX' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Opex (6 Kat)
            </button>
            <button
              onClick={() => setColumnSection('CHEM_MKT')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'CHEM_MKT' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Chem & Mkt
            </button>
            <button
              onClick={() => setColumnSection('OVERTIME')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'OVERTIME' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Overtime
            </button>
            <button
              onClick={() => setColumnSection('MANPOWER')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'MANPOWER' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Man Power
            </button>
            <button
              onClick={() => setColumnSection('QA_3MONTH')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'QA_3MONTH' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              QA 3 Bulan
            </button>
            <button
              onClick={() => setColumnSection('ENERGY_LEDGER')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'ENERGY_LEDGER' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Energy & Ledgers
            </button>
            <button
              onClick={() => setColumnSection('OT_GSI_CPA')}
              className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${columnSection === 'OT_GSI_CPA' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              GSI & CPA
            </button>
          </div>

          {/* Area Filter Tabs */}
          <div className="flex items-center bg-slate-950/60 p-1 rounded-xl border border-white/5 text-[10px] font-bold">
            {(['ALL', 'JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).map(a => (
              <button
                key={a}
                onClick={() => setSelectedAreaFilter(a)}
                className={`px-2.5 py-1.5 rounded-lg transition-all uppercase ${selectedAreaFilter === a ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {a === 'ALL' ? 'Semua Area' : a}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-44">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* WhatsApp Button */}
          <button
            onClick={handleCopyWhatsApp}
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-emerald-500/30 flex items-center gap-1.5 active:scale-95"
            title="Salin ringkasan ke format WhatsApp"
          >
            <i className="fab fa-whatsapp"></i>
            <span>Copy WA</span>
          </button>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-900/30 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            title="Unduh tabel format Excel"
          >
            <i className={`fas ${isExporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
            <span>{isExporting ? 'Exporting...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI Highlight Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="glass-card p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
          <div className="text-[10px] uppercase font-bold text-emerald-400">Total Revenue</div>
          <div className="text-base font-black text-white font-mono mt-0.5">
            Rp {(regionalTotals.actualRevenue / 1e6).toFixed(1)}M
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Target: Rp {(regionalTotals.targetRevenue / 1e6).toFixed(1)}M ({regionalTotals.revenuePercent.toFixed(1)}%)
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-amber-500/20 bg-amber-950/20">
          <div className="text-[10px] uppercase font-bold text-amber-400">Food Cost Ratio</div>
          <div className="text-base font-black text-amber-300 font-mono mt-0.5">
            {regionalTotals.fcPercent.toFixed(1)}%
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Total: Rp {(regionalTotals.fcTotal / 1e6).toFixed(1)}M
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-purple-500/20 bg-purple-950/20">
          <div className="text-[10px] uppercase font-bold text-purple-400">Opex Ratio (6 Kat)</div>
          <div className="text-base font-black text-purple-300 font-mono mt-0.5">
            {regionalTotals.opexPercent.toFixed(1)}%
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Total: Rp {(regionalTotals.opexTotal / 1e6).toFixed(1)}M
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-teal-500/20 bg-teal-950/20">
          <div className="text-[10px] uppercase font-bold text-teal-400">Chem, Stat & Mkt</div>
          <div className="text-base font-black text-teal-300 font-mono mt-0.5">
            {regionalTotals.chemStatMktRatio.toFixed(1)}%
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Total: Rp {(regionalTotals.totalChemStatMkt / 1e6).toFixed(1)}M
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-950/20">
          <div className="text-[10px] uppercase font-bold text-indigo-400">Total Overtime</div>
          <div className="text-base font-black text-indigo-300 font-mono mt-0.5">
            {regionalTotals.otTotal.toLocaleString('id-ID')} Jam
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Biaya: Rp {(regionalTotals.otTotalPay / 1e6).toFixed(1)}M | Util: {regionalTotals.otUtilization.toFixed(0)}%
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
          <div className="text-[10px] uppercase font-bold text-emerald-400">Man Power Regional</div>
          <div className="text-base font-black text-emerald-300 font-mono mt-0.5">
            {regionalTotals.mpActual} <span className="text-xs text-slate-400 font-normal">/ {regionalTotals.mpBudget} Org</span>
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            {regionalTotals.mpFulfillment.toFixed(0)}% Terisi | Vacant: {regionalTotals.mpVacant}
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-amber-500/20 bg-amber-950/20">
          <div className="text-[10px] uppercase font-bold text-amber-400">QA (3 Bulan)</div>
          <div className="text-base font-black text-amber-300 font-mono mt-0.5">
            {regionalTotals.avgQaQuarter > 0 ? `${regionalTotals.avgQaQuarter}%` : '-'}
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Tier: <span className="font-bold text-amber-300">{regionalTotals.avgQaQuarter >= 91 ? 'EXCELLENT' : regionalTotals.avgQaQuarter >= 85 ? 'SATISFACTORY' : 'TO IMPROVE'}</span>
          </div>
        </div>

        <div className="glass-card p-3.5 rounded-xl border border-blue-500/20 bg-blue-950/20">
          <div className="text-[10px] uppercase font-bold text-blue-400">GSI & CPA</div>
          <div className="text-base font-black text-blue-300 font-mono mt-0.5">
            {regionalTotals.avgScore > 0 ? `${regionalTotals.avgScore.toFixed(1)}%` : '-'}
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            ★ {regionalTotals.avgGrRating > 0 ? regionalTotals.avgGrRating.toFixed(1) : '-'} | CPA: {regionalTotals.cpaTotal}
          </div>
        </div>
      </div>

      {/* Main Consolidated Table */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900/90">
        <div className="overflow-x-auto custom-scrollbar max-h-[75vh]">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            {/* Table Header 2-Tier */}
            <thead className="sticky top-0 z-30 bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider">
              {/* Row 1: Section Super Headers */}
              <tr className="border-b border-white/10">
                <th rowSpan={2} className="p-3 text-center border-r border-white/10 bg-slate-950 sticky left-0 z-40 min-w-[45px]">
                  NO
                </th>
                <th rowSpan={2} className="p-3 border-r border-white/10 bg-slate-950 sticky left-[45px] z-40 min-w-[170px]">
                  STORE / OUTLET
                </th>

                {/* 1. REVENUE (Emerald) */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <th colSpan={4} className="p-2.5 text-center bg-emerald-950/80 text-emerald-300 border-r border-white/10">
                    <i className="fas fa-cash-register mr-1.5"></i>REVENUE
                  </th>
                )}

                {/* 2. FOOD COST (Amber) */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <th colSpan={5} className="p-2.5 text-center bg-amber-950/80 text-amber-300 border-r border-white/10">
                    <i className="fas fa-utensils mr-1.5"></i>FOOD COST (BELANJA)
                  </th>
                )}

                {/* 3. OPEX (6 KATEGORI) */}
                {(columnSection === 'ALL' || columnSection === 'OPEX') && (
                  <th colSpan={8} className="p-2.5 text-center bg-purple-950/80 text-purple-300 border-r border-white/10">
                    <i className="fas fa-wallet mr-1.5"></i>OPEX (6 KATEGORI)
                  </th>
                )}

                {/* 4. CHEMICAL, STATIONARY & MARKETING (TERPISAH) */}
                {(columnSection === 'ALL' || columnSection === 'CHEM_MKT') && (
                  <th colSpan={5} className="p-2.5 text-center bg-teal-950/80 text-teal-300 border-r border-white/10">
                    <i className="fas fa-boxes-stacked mr-1.5"></i>CHEM, STAT & MKT (TERPISAH)
                  </th>
                )}

                {/* 5. OVERTIME (Indigo) */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <th colSpan={5} className="p-2.5 text-center bg-indigo-950/80 text-indigo-300 border-r border-white/10">
                    <i className="fas fa-business-time mr-1.5"></i>OVERTIME (CUT-OFF 26 - 25)
                  </th>
                )}

                {/* 6. GSI (Blue) */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <th colSpan={7} className="p-2.5 text-center bg-blue-950/80 text-blue-300 border-r border-white/10">
                    <i className="fas fa-poll mr-1.5"></i>GSI (GUEST SATISFACTION INDEX)
                  </th>
                )}

                {/* 7. GOOGLE REVIEW (Yellow) */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <th colSpan={2} className="p-2.5 text-center bg-yellow-950/80 text-yellow-300 border-r border-white/10">
                    <i className="fab fa-google mr-1.5"></i>GOOGLE REVIEW
                  </th>
                )}

                {/* 8. CPA (Rose) */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <th colSpan={4} className="p-2.5 text-center bg-rose-950/80 text-rose-300">
                    <i className="fas fa-triangle-exclamation mr-1.5"></i>CPA (COMPLAINTS)
                  </th>
                )}
              </tr>

              {/* Row 2: Sub-Headers */}
              <tr className="border-b-2 border-indigo-500/40 text-[9px]">
                {/* REVENUE Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <>
                    <th className="p-2 text-right bg-emerald-950/40 border-r border-white/5 min-w-[105px]">TARGET</th>
                    <th className="p-2 text-right bg-emerald-950/40 border-r border-white/5 min-w-[105px]">ACTUAL</th>
                    <th className="p-2 text-center bg-emerald-950/40 border-r border-white/5 min-w-[65px]">% ACH</th>
                    <th className="p-2 text-right bg-emerald-950/40 border-r border-white/10 min-w-[105px]">VARIANCE</th>
                  </>
                )}

                {/* FOOD COST Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <>
                    <th className="p-2 text-right bg-amber-950/40 border-r border-white/5 min-w-[95px]">MK</th>
                    <th className="p-2 text-right bg-amber-950/40 border-r border-white/5 min-w-[95px]">MS</th>
                    <th className="p-2 text-right bg-amber-950/40 border-r border-white/5 min-w-[95px]">SUPPLIER</th>
                    <th className="p-2 text-right bg-amber-950/40 border-r border-white/5 min-w-[105px]">TOTAL</th>
                    <th className="p-2 text-center bg-amber-950/40 border-r border-white/10 min-w-[65px]">%</th>
                  </>
                )}

                {/* OPEX Sub-headers (6 KATEGORI) */}
                {(columnSection === 'ALL' || columnSection === 'OPEX') && (
                  <>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[95px]">NON COMM</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[95px]">COMMODITY</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[80px]">ATK</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[85px]">MAINT</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[80px]">ASSET</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[80px]">CASUAL</th>
                    <th className="p-2 text-right bg-purple-950/40 border-r border-white/5 min-w-[95px]">TOTAL OPEX</th>
                    <th className="p-2 text-center bg-purple-950/40 border-r border-white/10 min-w-[65px]">%</th>
                  </>
                )}

                {/* CHEMICAL, STATIONARY & MARKETING Sub-headers (TERPISAH) */}
                {(columnSection === 'ALL' || columnSection === 'CHEM_MKT') && (
                  <>
                    <th className="p-2 text-right bg-teal-950/40 border-r border-white/5 min-w-[85px]">CHEMICAL</th>
                    <th className="p-2 text-right bg-teal-950/40 border-r border-white/5 min-w-[85px]">STATIONERY</th>
                    <th className="p-2 text-right bg-teal-950/40 border-r border-white/5 min-w-[85px]">MARKETING</th>
                    <th className="p-2 text-right bg-teal-950/40 border-r border-white/5 min-w-[95px]">TOTAL</th>
                    <th className="p-2 text-center bg-teal-950/40 border-r border-white/10 min-w-[65px]">%</th>
                  </>
                )}

                {/* OVERTIME Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <th className="p-2 text-right bg-indigo-950/40 border-r border-white/5 min-w-[70px]">SERVICE</th>
                    <th className="p-2 text-right bg-indigo-950/40 border-r border-white/5 min-w-[70px]">BAR</th>
                    <th className="p-2 text-right bg-indigo-950/40 border-r border-white/5 min-w-[70px]">KITCHEN</th>
                    <th className="p-2 text-right bg-indigo-950/40 border-r border-white/5 min-w-[80px]">TOTAL</th>
                    <th className="p-2 text-center bg-indigo-950/40 border-r border-white/10 min-w-[75px]">AVG/STAFF</th>
                  </>
                )}

                {/* GSI Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[60px]">QOS</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[60px]">QOF</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[60px]">QOB</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[60px]">AOS</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[60px]">VFM</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/5 min-w-[75px]">RESP</th>
                    <th className="p-2 text-center bg-blue-950/40 border-r border-white/10 min-w-[65px]">SCORE %</th>
                  </>
                )}

                {/* GOOGLE REVIEW Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <th className="p-2 text-center bg-yellow-950/40 border-r border-white/5 min-w-[65px]">RATING</th>
                    <th className="p-2 text-center bg-yellow-950/40 border-r border-white/10 min-w-[75px]">REVIEWS</th>
                  </>
                )}

                {/* CPA Sub-headers */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <th className="p-2 text-center bg-rose-950/40 border-r border-white/5 min-w-[55px]">FOOD</th>
                    <th className="p-2 text-center bg-rose-950/40 border-r border-white/5 min-w-[55px]">BEV</th>
                    <th className="p-2 text-center bg-rose-950/40 border-r border-white/5 min-w-[55px]">SVC</th>
                    <th className="p-2 text-center bg-rose-950/40 min-w-[65px]">TOTAL</th>
                  </>
                )}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-white/5 text-[11px]">
              {(['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'] as const).map(areaKey => {
                const areaRows = groupedItems[areaKey] || [];
                if (areaRows.length === 0) return null;
                const sub = computeSubtotal(areaRows);

                return (
                  <React.Fragment key={areaKey}>
                    {/* Area Separator Header */}
                    <tr className="bg-slate-950/80 font-black text-indigo-300 text-xs border-y border-white/10">
                      <td colSpan={2} className="p-2.5 pl-4 sticky left-0 z-20 bg-slate-950/90 border-r border-white/10">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-location-dot text-indigo-400"></i>
                          <span>AREA {areaKey}</span>
                          <span className="text-[10px] text-slate-500 font-normal">({areaRows.length} Outlets)</span>
                        </span>
                      </td>
                      <td colSpan={30} className="p-2 text-[10px] text-slate-400 italic">
                        Realisasi Operasional Periode {monthName} {selectedYear}
                      </td>
                    </tr>

                    {/* Outlet Rows for this Area */}
                    {areaRows.map((it, idx) => (
                      <tr
                        key={it.outlet}
                        onClick={() => onSelectOutlet && onSelectOutlet(it.outlet)}
                        className="hover:bg-indigo-600/10 cursor-pointer transition-colors group"
                      >
                        {/* No */}
                        <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800">
                          {idx + 1}
                        </td>

                        {/* Outlet Name */}
                        <td className="p-2.5 font-bold text-white border-r border-white/10 sticky left-[45px] z-20 bg-slate-900 group-hover:bg-slate-800">
                          <div className="flex items-center justify-between">
                            <span>{it.outlet}</span>
                            <i className="fas fa-chevron-right text-[9px] text-slate-600 group-hover:text-indigo-400 transition-colors"></i>
                          </div>
                        </td>

                        {/* 1. REVENUE */}
                        {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                          <>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-emerald-950/5">
                              Rp {it.targetRevenue.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-400 border-r border-white/5 bg-emerald-950/5">
                              Rp {it.actualRevenue.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-center font-mono border-r border-white/5 bg-emerald-950/5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.revenuePercent >= 100 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                {it.revenuePercent.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`p-2.5 text-right font-mono border-r border-white/10 bg-emerald-950/5 ${it.revenueVariance >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}`}>
                              {it.revenueVariance >= 0 ? '+' : ''}Rp {it.revenueVariance.toLocaleString('id-ID')}
                            </td>
                          </>
                        )}

                        {/* 2. FOOD COST */}
                        {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                          <>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-amber-950/5">
                              Rp {it.fcMk.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-amber-950/5">
                              Rp {it.fcMs.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-amber-950/5">
                              Rp {it.fcSupplier.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-amber-300 border-r border-white/5 bg-amber-950/5">
                              Rp {it.fcTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-center font-mono border-r border-white/10 bg-amber-950/5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.fcPercent <= 43 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                {it.fcPercent.toFixed(1)}%
                              </span>
                            </td>
                          </>
                        )}

                        {/* 3. OPEX (6 KATEGORI) */}
                        {(columnSection === 'ALL' || columnSection === 'OPEX') && (
                          <>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexNonCommodity.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexCommodity.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexAtk.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexMaintenance.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexAsset.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexCasual.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-purple-300 border-r border-white/5 bg-purple-950/5">
                              Rp {it.opexTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-center font-mono border-r border-white/10 bg-purple-950/5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.opexPercent <= 3.5 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                {it.opexPercent.toFixed(1)}%
                              </span>
                            </td>
                          </>
                        )}

                        {/* 4. CHEMICAL, STATIONARY & MARKETING (TERPISAH) */}
                        {(columnSection === 'ALL' || columnSection === 'CHEM_MKT') && (
                          <>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-teal-950/5">
                              Rp {it.chemicalTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-teal-950/5">
                              Rp {it.stationaryTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-teal-950/5">
                              Rp {it.marketingTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-teal-300 border-r border-white/5 bg-teal-950/5">
                              Rp {it.totalChemStatMkt.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-center font-mono border-r border-white/10 bg-teal-950/5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300">
                                {it.chemStatMktRatio.toFixed(1)}%
                              </span>
                            </td>
                          </>
                        )}

                        {/* 5. OVERTIME */}
                        {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                          <>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-indigo-950/5">
                              {it.otService}h
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-indigo-950/5">
                              {it.otBar}h
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5 bg-indigo-950/5">
                              {it.otKitchen}h
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-indigo-300 border-r border-white/5 bg-indigo-950/5">
                              {it.otTotal}h
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/10 bg-indigo-950/5">
                              {it.otAverage.toFixed(1)}h
                            </td>
                          </>
                        )}

                        {/* 6. GSI */}
                        {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                          <>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 bg-blue-950/5">
                              {it.gsiQos > 0 ? `${it.gsiQos.toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 bg-blue-950/5">
                              {it.gsiQof > 0 ? `${it.gsiQof.toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 bg-blue-950/5">
                              {it.gsiQob > 0 ? `${it.gsiQob.toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 bg-blue-950/5">
                              {it.gsiAos > 0 ? `${it.gsiAos.toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-300 border-r border-white/5 bg-blue-950/5">
                              {it.gsiVfm > 0 ? `${it.gsiVfm.toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 bg-blue-950/5">
                              {it.gsiTotalResponses}
                            </td>
                            <td className="p-2.5 text-center font-mono border-r border-white/10 bg-blue-950/5">
                              {it.gsiScorePercent > 0 ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.gsiScorePercent >= 85 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                  {it.gsiScorePercent.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* 7. GOOGLE REVIEW */}
                        {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                          <>
                            <td className="p-2.5 text-center font-mono font-bold text-yellow-300 border-r border-white/5 bg-yellow-950/5">
                              {it.grRating > 0 ? `★ ${it.grRating.toFixed(1)}` : '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/10 bg-yellow-950/5">
                              {it.grTotalReviews > 0 ? it.grTotalReviews : '-'}
                            </td>
                          </>
                        )}

                        {/* 8. CPA */}
                        {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                          <>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 bg-rose-950/5">
                              {it.cpaFood}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 bg-rose-950/5">
                              {it.cpaBeverage}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-white/5 bg-rose-950/5">
                              {it.cpaService}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-rose-300 bg-rose-950/5">
                              {it.cpaTotal}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}

                    {/* Subtotal Row for this Area */}
                    <tr className="bg-slate-950 font-black text-[10px] border-t border-b-2 border-white/10 text-white">
                      <td colSpan={2} className="p-2.5 text-center uppercase tracking-wider text-indigo-300 border-r border-white/10 sticky left-0 z-20 bg-slate-950">
                        SUBTOTAL {areaKey}
                      </td>

                      {/* Revenue Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                        <>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-emerald-950/20 text-slate-300">
                            Rp {sub.targetRevenue.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-emerald-950/20 text-emerald-400">
                            Rp {sub.actualRevenue.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-emerald-950/20 text-emerald-300">
                            {sub.revenuePercent.toFixed(1)}%
                          </td>
                          <td className={`p-2.5 text-right font-mono border-r border-white/10 bg-emerald-950/20 ${sub.revenueVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {sub.revenueVariance >= 0 ? '+' : ''}Rp {sub.revenueVariance.toLocaleString('id-ID')}
                          </td>
                        </>
                      )}

                      {/* Food Cost Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                        <>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-amber-950/20 text-slate-300">
                            Rp {sub.fcMk.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-amber-950/20 text-slate-300">
                            Rp {sub.fcMs.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-amber-950/20 text-slate-300">
                            Rp {sub.fcSupplier.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-amber-950/20 text-amber-300">
                            Rp {sub.fcTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-amber-950/20 text-amber-300">
                            {sub.fcPercent.toFixed(1)}%
                          </td>
                        </>
                      )}

                      {/* Opex Subtotal (6 KATEGORI) */}
                      {(columnSection === 'ALL' || columnSection === 'OPEX') && (
                        <>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexNonCommodity.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexCommodity.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexAtk.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexMaintenance.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexAsset.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-slate-300">
                            Rp {sub.opexCasual.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-purple-950/20 text-purple-300">
                            Rp {sub.opexTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-purple-950/20 text-purple-300">
                            {sub.opexPercent.toFixed(1)}%
                          </td>
                        </>
                      )}

                      {/* Chemical, Stationary & Marketing Subtotal (TERPISAH) */}
                      {(columnSection === 'ALL' || columnSection === 'CHEM_MKT') && (
                        <>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-teal-950/20 text-slate-300">
                            Rp {sub.chemicalTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-teal-950/20 text-slate-300">
                            Rp {sub.stationaryTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-teal-950/20 text-slate-300">
                            Rp {sub.marketingTotal.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-teal-950/20 text-teal-300">
                            Rp {sub.totalChemStatMkt.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-teal-950/20 text-teal-300">
                            {sub.chemStatMktRatio.toFixed(1)}%
                          </td>
                        </>
                      )}

                      {/* Overtime Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                        <>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-indigo-950/20 text-slate-300">
                            {sub.otService}h
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-indigo-950/20 text-slate-300">
                            {sub.otBar}h
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-indigo-950/20 text-slate-300">
                            {sub.otKitchen}h
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-white/5 bg-indigo-950/20 text-indigo-300">
                            {sub.otTotal}h
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-indigo-950/20 text-indigo-300">
                            {sub.otAverage.toFixed(1)}h
                          </td>
                        </>
                      )}

                      {/* GSI Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                        <>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.avgQos > 0 ? `${sub.avgQos.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.avgQof > 0 ? `${sub.avgQof.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.avgQob > 0 ? `${sub.avgQob.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.avgAos > 0 ? `${sub.avgAos.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.avgVfm > 0 ? `${sub.avgVfm.toFixed(1)}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-blue-950/20 text-slate-300">
                            {sub.gsiTotalResponses}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-blue-950/20 text-blue-300">
                            {sub.avgScore > 0 ? `${sub.avgScore.toFixed(1)}%` : '-'}
                          </td>
                        </>
                      )}

                      {/* Google Review Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                        <>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-yellow-950/20 text-yellow-300">
                            {sub.avgGrRating > 0 ? `★ ${sub.avgGrRating.toFixed(1)}` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/10 bg-yellow-950/20 text-slate-300">
                            {sub.grTotalReviews}
                          </td>
                        </>
                      )}

                      {/* CPA Subtotal */}
                      {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                        <>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-rose-950/20 text-slate-300">
                            {sub.cpaFood}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-rose-950/20 text-slate-300">
                            {sub.cpaBeverage}
                          </td>
                          <td className="p-2.5 text-center font-mono border-r border-white/5 bg-rose-950/20 text-slate-300">
                            {sub.cpaService}
                          </td>
                          <td className="p-2.5 text-center font-mono bg-rose-950/20 text-rose-300">
                            {sub.cpaTotal}
                          </td>
                        </>
                      )}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* GRAND TOTAL REGIONAL FOOTER */}
            <tfoot className="sticky bottom-0 z-30 bg-slate-950 font-black text-xs border-t-2 border-indigo-500 text-white shadow-2xl">
              <tr>
                <td colSpan={2} className="p-3 text-center uppercase tracking-widest text-indigo-300 border-r border-white/10 sticky left-0 z-40 bg-slate-950">
                  TOTAL REGIONAL ({filteredItems.length} OUTLET)
                </td>

                {/* Revenue Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-emerald-950/30 text-slate-300">
                      Rp {regionalTotals.targetRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-emerald-950/30 text-emerald-400">
                      Rp {regionalTotals.actualRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-emerald-950/30 text-emerald-300">
                      {regionalTotals.revenuePercent.toFixed(1)}%
                    </td>
                    <td className={`p-3 text-right font-mono border-r border-white/10 bg-emerald-950/30 ${regionalTotals.revenueVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {regionalTotals.revenueVariance >= 0 ? '+' : ''}Rp {regionalTotals.revenueVariance.toLocaleString('id-ID')}
                    </td>
                  </>
                )}

                {/* Food Cost Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'REV_FOOD') && (
                  <>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-amber-950/30 text-slate-300">
                      Rp {regionalTotals.fcMk.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-amber-950/30 text-slate-300">
                      Rp {regionalTotals.fcMs.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-amber-950/30 text-slate-300">
                      Rp {regionalTotals.fcSupplier.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-amber-950/30 text-amber-300">
                      Rp {regionalTotals.fcTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-amber-950/30 text-amber-300">
                      {regionalTotals.fcPercent.toFixed(1)}%
                    </td>
                  </>
                )}

                {/* Opex Grand Total (6 KATEGORI) */}
                {(columnSection === 'ALL' || columnSection === 'OPEX') && (
                  <>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexNonCommodity.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexCommodity.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexAtk.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexMaintenance.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexAsset.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-slate-300">
                      Rp {regionalTotals.opexCasual.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-purple-950/30 text-purple-300">
                      Rp {regionalTotals.opexTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-purple-950/30 text-purple-300">
                      {regionalTotals.opexPercent.toFixed(1)}%
                    </td>
                  </>
                )}

                {/* Chemical, Stationary & Marketing Grand Total (TERPISAH) */}
                {(columnSection === 'ALL' || columnSection === 'CHEM_MKT') && (
                  <>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-teal-950/30 text-slate-300">
                      Rp {regionalTotals.chemicalTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-teal-950/30 text-slate-300">
                      Rp {regionalTotals.stationaryTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-teal-950/30 text-slate-300">
                      Rp {regionalTotals.marketingTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-teal-950/30 text-teal-300">
                      Rp {regionalTotals.totalChemStatMkt.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-teal-950/30 text-teal-300">
                      {regionalTotals.chemStatMktRatio.toFixed(1)}%
                    </td>
                  </>
                )}

                {/* Overtime Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-indigo-950/30 text-slate-300">
                      {regionalTotals.otService}h
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-indigo-950/30 text-slate-300">
                      {regionalTotals.otBar}h
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-indigo-950/30 text-slate-300">
                      {regionalTotals.otKitchen}h
                    </td>
                    <td className="p-3 text-right font-mono border-r border-white/10 bg-indigo-950/30 text-indigo-300">
                      {regionalTotals.otTotal}h
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-indigo-950/30 text-indigo-300">
                      {regionalTotals.otAverage.toFixed(1)}h
                    </td>
                  </>
                )}

                {/* GSI Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.avgQos > 0 ? `${regionalTotals.avgQos.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.avgQof > 0 ? `${regionalTotals.avgQof.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.avgQob > 0 ? `${regionalTotals.avgQob.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.avgAos > 0 ? `${regionalTotals.avgAos.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.avgVfm > 0 ? `${regionalTotals.avgVfm.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-slate-300">
                      {regionalTotals.gsiTotalResponses}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-blue-950/30 text-blue-300">
                      {regionalTotals.avgScore > 0 ? `${regionalTotals.avgScore.toFixed(1)}%` : '-'}
                    </td>
                  </>
                )}

                {/* Google Review Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-yellow-950/30 text-yellow-300">
                      {regionalTotals.avgGrRating > 0 ? `★ ${regionalTotals.avgGrRating.toFixed(1)}` : '-'}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-yellow-950/30 text-slate-300">
                      {regionalTotals.grTotalReviews}
                    </td>
                  </>
                )}

                {/* CPA Grand Total */}
                {(columnSection === 'ALL' || columnSection === 'OT_GSI_CPA') && (
                  <>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-rose-950/30 text-slate-300">
                      {regionalTotals.cpaFood}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-rose-950/30 text-slate-300">
                      {regionalTotals.cpaBeverage}
                    </td>
                    <td className="p-3 text-center font-mono border-r border-white/10 bg-rose-950/30 text-slate-300">
                      {regionalTotals.cpaService}
                    </td>
                    <td className="p-3 text-center font-mono bg-rose-950/30 text-rose-300">
                      {regionalTotals.cpaTotal}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RegionalSummaryReportRecapTable;
