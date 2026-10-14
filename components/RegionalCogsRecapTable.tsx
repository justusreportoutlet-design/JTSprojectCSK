import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { getAreaForOutlet, getActiveOutletNames } from '../constants';
import { AppState } from '../types';

interface Props {
  allOutletsData: Record<string, any>;
  data?: AppState;
  selectedMonth: number;
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

export interface OutletCogsRowData {
  outlet: string;
  area: string;
  cutoffDay: number;
  mtdBudgetRevenue: number;
  actualRevenue: number;
  forecastSisaHari: number;
  totalProjectedFullMonth: number;
  openingInventory: number;
  closingInventory: number;
  closingInvPercent: number;
  totalBelanja: number;
  percentFoodCost: number;
  targetBudgetPercent: number;
  budgetBelanja: number;
  sisaBudgetBelanja: number;
  effectiveCogs: number;
  percentCogsActual: number;
  effectiveProjectedCogs: number;
  projectedCogsPercent: number;
}

const formatIDR = (val: number): string => {
  return (Math.round(val) || 0).toLocaleString('id-ID');
};

const formatPct = (val: number): string => {
  if (isNaN(val) || !isFinite(val)) return '0.00%';
  return `${val.toFixed(2)}%`;
};

export const RegionalCogsRecapTable: React.FC<Props> = ({
  allOutletsData,
  selectedMonth,
  selectedYear,
  selectedArea = 'ALL',
  selectedOutlet = 'ALL',
  onSelectOutlet,
  showToast
}) => {
  const [activeArea, setActiveArea] = useState<string>(selectedArea || 'ALL');
  const [activeOutlet, setActiveOutlet] = useState<string>(selectedOutlet || 'ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  React.useEffect(() => {
    setActiveArea(selectedArea || 'ALL');
  }, [selectedArea]);

  React.useEffect(() => {
    setActiveOutlet(selectedOutlet || 'ALL');
  }, [selectedOutlet]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];

  // List of all active outlets
  const activeOutletsList = useMemo(() => {
    const fromConfig = getActiveOutletNames();
    const fromData = Object.keys(allOutletsData || {});
    const combined = Array.from(new Set([...fromConfig, ...fromData]));
    return combined.filter(name => {
      const d = allOutletsData?.[name];
      return !d || !d.isDeleted;
    });
  }, [allOutletsData]);

  // Compute 12 metrics per outlet
  const outletsDataList: OutletCogsRowData[] = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const currentDateNum = new Date().getDate();

    return activeOutletsList.map(outletName => {
      const outletDoc = (allOutletsData && allOutletsData[outletName]) || {};
      const monthDoc = outletDoc[String(selectedMonth)] || outletDoc[selectedMonth] || outletDoc.monthlyData?.[String(selectedMonth)] || {};
      const cogsData = monthDoc.monthlyCogsData?.[monthKey] || outletDoc.monthlyCogsData?.[monthKey] || {};
      const sales = monthDoc.sales || outletDoc.sales || {};
      const dailyRec = sales.dailyRecording || monthDoc.dailyRecording || outletDoc.dailyRecording || {};
      const area = getAreaForOutlet(outletName);

      // 1. MTD Budget Revenue
      let mtdBudgetRevenue = 0;
      if (sales.monthlyBudgets && sales.monthlyBudgets[monthKey] !== undefined) {
        mtdBudgetRevenue = Number(sales.monthlyBudgets[monthKey]) || 0;
      } else if (sales.budgetRevenue !== undefined && Number(sales.budgetRevenue) > 0) {
        mtdBudgetRevenue = Number(sales.budgetRevenue) || 0;
      } else if (cogsData.strategyTargetRevenue !== undefined && Number(cogsData.strategyTargetRevenue) > 0) {
        mtdBudgetRevenue = Number(cogsData.strategyTargetRevenue) || 0;
      } else if (monthDoc.budgetRevenue !== undefined && Number(monthDoc.budgetRevenue) > 0) {
        mtdBudgetRevenue = Number(monthDoc.budgetRevenue) || 0;
      }

      // Cutoff Day
      const cutoffDay = cogsData.manualCutoffDay !== undefined
        ? Math.min(daysInMonth, Math.max(1, Number(cogsData.manualCutoffDay)))
        : (selectedYear === currentYear && selectedMonth === currentMonth
            ? Math.min(daysInMonth, currentDateNum)
            : Math.min(19, daysInMonth));

      // Calculate Daily Revenue & Daily Belanja up to cutoff
      let actualRevenueMTD = 0;
      let pastWeekdayRevSum = 0;
      let pastWeekdayCount = 0;
      let pastWeekendRevSum = 0;
      let pastWeekendCount = 0;
      let remainingWeekdayCount = 0;
      let remainingWeekendCount = 0;
      let actualBelanjaMTD = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dObj = new Date(selectedYear, selectedMonth, d);
        const dayOfWeek = dObj.getDay(); // 0 = Sun, 1..5 = Mon..Fri, 6 = Sat
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        // Revenue on dateStr
        let dayRev = 0;
        let isRecorded = false;
        const rec = dailyRec[dateStr];
        if (rec) {
          if (rec.revenue !== undefined && Number(rec.revenue) > 0) {
            dayRev = Number(rec.revenue);
            isRecorded = true;
          } else {
            const sumBreakdown = (Number(rec.dineInRevenue) || 0) + (Number(rec.takeAwayRevenue) || 0) +
                                 (Number(rec.goFoodRevenue) || 0) + (Number(rec.grabFoodRevenue) || 0);
            if (sumBreakdown > 0) {
              dayRev = sumBreakdown;
              isRecorded = true;
            }
          }
        }

        // Belanja on dateStr from all supplier ledgers
        let dayBelanja = 0;

        // 1. Main Store (minus chemical / stationary / marketing deductions)
        let storeSum = 0;
        const storeList = monthDoc.dailyMainStoreLedger?.[dateStr] || outletDoc.dailyMainStoreLedger?.[dateStr];
        if (Array.isArray(storeList) && storeList.length > 0) {
          storeSum = storeList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }
        let dayDeductions = 0;
        const chemList = monthDoc.dailyChemicalLedger?.[dateStr] || outletDoc.dailyChemicalLedger?.[dateStr];
        if (Array.isArray(chemList) && chemList.length > 0) {
          dayDeductions += chemList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }
        dayBelanja += Math.max(0, storeSum - dayDeductions);

        // 2. Main Kitchen
        const mkList = monthDoc.dailyMainKitchenLedger?.[dateStr] || outletDoc.dailyMainKitchenLedger?.[dateStr];
        if (Array.isArray(mkList) && mkList.length > 0) {
          dayBelanja += mkList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }

        // 3. Cash & Commodity
        const cashList = monthDoc.dailyCashLedger?.[dateStr] || outletDoc.dailyCashLedger?.[dateStr];
        if (Array.isArray(cashList) && cashList.length > 0) {
          dayBelanja += cashList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }
        const commList = monthDoc.dailyCommodityLedger?.[dateStr] || outletDoc.dailyCommodityLedger?.[dateStr];
        if (Array.isArray(commList) && commList.length > 0) {
          dayBelanja += commList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
        }

        // 4. Partner suppliers
        const supKeys = [
          'dailySaungKubilLedger', 'dailyTgifLedger', 'dailyPanfilaLedger', 
          'dailyEverestLedger', 'dailySukandaLedger', 'dailyIkigaiLedger', 'dailyKebunkuLedger'
        ];
        supKeys.forEach(k => {
          const supList = monthDoc[k]?.[dateStr] || outletDoc[k]?.[dateStr];
          if (Array.isArray(supList) && supList.length > 0) {
            dayBelanja += supList.reduce((acc: number, it: any) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
          }
        });

        // 5. Fallback to expenses if ledgers are empty
        if (dayBelanja === 0) {
          const exp = monthDoc.expenses?.[dateStr] || outletDoc.expenses?.[dateStr];
          if (exp) {
            dayBelanja = (Number(exp.mainKitchen) || 0) + (Number(exp.mainStore) || 0) + 
                         (Number(exp.cash) || 0) + (Number(exp.commodity) || 0) + 
                         (Number(exp.saungKubil) || 0) + (Number(exp.tgif) || 0) + 
                         (Number(exp.panfila) || 0) + (Number(exp.everest) || 0) + 
                         (Number(exp.sukanda) || 0) + (Number(exp.ikigai) || 0) + 
                         (Number(exp.kebunku) || 0);
          }
        }

        if (d <= cutoffDay) {
          actualRevenueMTD += dayRev;
          actualBelanjaMTD += dayBelanja;
          if (dayRev > 0 || isRecorded) {
            if (isWeekday) {
              pastWeekdayRevSum += dayRev;
              pastWeekdayCount++;
            } else {
              pastWeekendRevSum += dayRev;
              pastWeekendCount++;
            }
          }
        } else {
          if (isWeekday) remainingWeekdayCount++;
          else remainingWeekendCount++;
        }
      }

      // Check manual override for Belanja if enabled by outlet
      if (cogsData.useManualMtdBelanja && cogsData.manualMtdBelanja !== undefined && Number(cogsData.manualMtdBelanja) > 0) {
        actualBelanjaMTD = Number(cogsData.manualMtdBelanja);
      }

      // 4. Forecast Sisa Hari
      const avgWeekdaySales = pastWeekdayCount > 0
        ? Math.round(pastWeekdayRevSum / pastWeekdayCount)
        : (cogsData.manualWeekdayAvgSales ? Number(cogsData.manualWeekdayAvgSales) : 0);

      const avgWeekendSales = pastWeekendCount > 0
        ? Math.round(pastWeekendRevSum / pastWeekendCount)
        : (cogsData.manualWeekendAvgSales ? Number(cogsData.manualWeekendAvgSales) : 0);

      const forecastSisaHari = Math.round((remainingWeekdayCount * avgWeekdaySales) + (remainingWeekendCount * avgWeekendSales));

      // 5. Total Projected Full Month
      const totalProjectedFullMonth = actualRevenueMTD + forecastSisaHari;

      // 6. Opening Inventory
      const openingInventory = Number(cogsData.beginningInventory) || 0;

      // 7. Closing Inventory
      const closingInvPercent = cogsData.closingInventoryPercent !== undefined 
        ? Number(cogsData.closingInventoryPercent) 
        : 10.0;
      const closingInventory = cogsData.endingInventory !== undefined && Number(cogsData.endingInventory) > 0
        ? Number(cogsData.endingInventory)
        : Math.round(totalProjectedFullMonth * (closingInvPercent / 100));

      // 8. Total Belanja
      const totalBelanja = actualBelanjaMTD;

      // 9. % Food Cost
      const percentFoodCost = actualRevenueMTD > 0
        ? (totalBelanja / actualRevenueMTD) * 100
        : (totalProjectedFullMonth > 0 ? (totalBelanja / totalProjectedFullMonth) * 100 : 0);

      // 10. Budget Belanja
      const targetBudgetPercent = cogsData.targetBudgetPercent !== undefined 
        ? Number(cogsData.targetBudgetPercent) 
        : 43.0;
      const baseRevForBudget = totalProjectedFullMonth > 0 ? totalProjectedFullMonth : mtdBudgetRevenue;
      const budgetBelanja = Math.round(baseRevForBudget * (targetBudgetPercent / 100));

      // 11. Sisa Budget Belanja
      const sisaBudgetBelanja = budgetBelanja - totalBelanja;

      // 12. % COGS Actual
      const effectiveCogs = Math.max(0, openingInventory + totalBelanja - closingInventory);
      const percentCogsActual = actualRevenueMTD > 0
        ? (effectiveCogs / actualRevenueMTD) * 100
        : (totalProjectedFullMonth > 0 ? (effectiveCogs / totalProjectedFullMonth) * 100 : 0);

      // Projected COGS for reference
      const effectiveProjectedCogs = Math.max(0, openingInventory + budgetBelanja - closingInventory);
      const projectedCogsPercent = totalProjectedFullMonth > 0
        ? (effectiveProjectedCogs / totalProjectedFullMonth) * 100
        : 0;

      return {
        outlet: outletName,
        area,
        cutoffDay,
        mtdBudgetRevenue,
        actualRevenue: actualRevenueMTD,
        forecastSisaHari,
        totalProjectedFullMonth,
        openingInventory,
        closingInventory,
        closingInvPercent,
        totalBelanja,
        percentFoodCost,
        targetBudgetPercent,
        budgetBelanja,
        sisaBudgetBelanja,
        effectiveCogs,
        percentCogsActual,
        effectiveProjectedCogs,
        projectedCogsPercent
      };
    });
  }, [activeOutletsList, allOutletsData, selectedMonth, selectedYear, daysInMonth, monthKey]);

  // Filtered rows based on Area, Outlet & Search
  const filteredRows = useMemo(() => {
    return outletsDataList.filter(row => {
      if (activeArea !== 'ALL' && row.area.toUpperCase() !== activeArea.toUpperCase()) return false;
      if (activeOutlet !== 'ALL' && row.outlet !== activeOutlet) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        if (!row.outlet.toLowerCase().includes(q) && !row.area.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [outletsDataList, activeArea, activeOutlet, searchTerm]);

  // Group by Area
  const areaGroups = useMemo(() => {
    const areas: Record<string, OutletCogsRowData[]> = {
      'JAKARTA': [],
      'TANGGERANG': [],
      'BEKASI & CIBUBUR': []
    };

    filteredRows.forEach(row => {
      const a = (row.area || 'JAKARTA').toUpperCase();
      if (a.includes('TANGGERANG') || a.includes('ALSUT')) {
        areas['TANGGERANG'].push(row);
      } else if (a.includes('BEKASI') || a.includes('CIBUBUR')) {
        areas['BEKASI & CIBUBUR'].push(row);
      } else {
        areas['JAKARTA'].push(row);
      }
    });

    return Object.entries(areas).filter(([_, rows]) => rows.length > 0);
  }, [filteredRows]);

  // Compute Subtotal / Grand Total helper
  const computeTotals = (rows: OutletCogsRowData[]) => {
    const totals = rows.reduce((acc, r) => {
      acc.mtdBudgetRevenue += r.mtdBudgetRevenue;
      acc.actualRevenue += r.actualRevenue;
      acc.forecastSisaHari += r.forecastSisaHari;
      acc.totalProjectedFullMonth += r.totalProjectedFullMonth;
      acc.openingInventory += r.openingInventory;
      acc.closingInventory += r.closingInventory;
      acc.totalBelanja += r.totalBelanja;
      acc.budgetBelanja += r.budgetBelanja;
      acc.sisaBudgetBelanja += r.sisaBudgetBelanja;
      acc.effectiveCogs += r.effectiveCogs;
      return acc;
    }, {
      mtdBudgetRevenue: 0,
      actualRevenue: 0,
      forecastSisaHari: 0,
      totalProjectedFullMonth: 0,
      openingInventory: 0,
      closingInventory: 0,
      totalBelanja: 0,
      budgetBelanja: 0,
      sisaBudgetBelanja: 0,
      effectiveCogs: 0
    });

    const percentFoodCost = totals.actualRevenue > 0
      ? (totals.totalBelanja / totals.actualRevenue) * 100
      : (totals.totalProjectedFullMonth > 0 ? (totals.totalBelanja / totals.totalProjectedFullMonth) * 100 : 0);

    const percentCogsActual = totals.actualRevenue > 0
      ? (totals.effectiveCogs / totals.actualRevenue) * 100
      : (totals.totalProjectedFullMonth > 0 ? (totals.effectiveCogs / totals.totalProjectedFullMonth) * 100 : 0);

    return {
      ...totals,
      percentFoodCost,
      percentCogsActual
    };
  };

  const grandTotals = useMemo(() => computeTotals(filteredRows), [filteredRows]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('COGS & Forecast Control');

      // Title
      worksheet.mergeCells('A1:L1');
      worksheet.getCell('A1').value = `LAPORAN REGIONAL COGS & FORECAST REVENUE CONTROL - ${monthName.toUpperCase()} ${selectedYear}`;
      worksheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      // Table Headers
      const headers = [
        'NAMA OUTLET',
        'MTD BUDGET REVENUE',
        'ACTUAL REVENUE',
        'FORECAST SISA HARI',
        'TOTAL PROJECTED FULL MONTH',
        'OPENING INVENTORY',
        'CLOSING INVENTORY',
        'TOTAL BELANJA',
        '%FOOD COST',
        'BUDGET BELANJA',
        'SISA BUDGET BELANJA',
        '% COGS ACTUAL'
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF334155' } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'thin', color: { argb: 'FF334155' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });

      // Rows by area
      areaGroups.forEach(([areaName, rows]) => {
        // Area Header
        const areaHeaderRow = worksheet.addRow([`AREA: ${areaName}`, '', '', '', '', '', '', '', '', '', '', '']);
        worksheet.mergeCells(`A${areaHeaderRow.number}:L${areaHeaderRow.number}`);
        areaHeaderRow.getCell(1).font = { bold: true, color: { argb: 'FF818CF8' }, size: 10 };
        areaHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        areaHeaderRow.height = 22;

        rows.forEach(r => {
          const row = worksheet.addRow([
            r.outlet,
            r.mtdBudgetRevenue,
            r.actualRevenue,
            r.forecastSisaHari,
            r.totalProjectedFullMonth,
            r.openingInventory,
            r.closingInventory,
            r.totalBelanja,
            r.percentFoodCost / 100,
            r.budgetBelanja,
            r.sisaBudgetBelanja,
            r.percentCogsActual / 100
          ]);

          row.height = 20;
          row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
          for (let col = 2; col <= 8; col++) {
            row.getCell(col).numFmt = '#,##0';
            row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
          }
          row.getCell(9).numFmt = '0.00%';
          row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell(10).numFmt = '#,##0';
          row.getCell(10).alignment = { vertical: 'middle', horizontal: 'right' };
          row.getCell(11).numFmt = '#,##0';
          row.getCell(11).alignment = { vertical: 'middle', horizontal: 'right' };
          row.getCell(12).numFmt = '0.00%';
          row.getCell(12).alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Area Subtotal
        const sub = computeTotals(rows);
        const subRow = worksheet.addRow([
          `SUBTOTAL ${areaName}`,
          sub.mtdBudgetRevenue,
          sub.actualRevenue,
          sub.forecastSisaHari,
          sub.totalProjectedFullMonth,
          sub.openingInventory,
          sub.closingInventory,
          sub.totalBelanja,
          sub.percentFoodCost / 100,
          sub.budgetBelanja,
          sub.sisaBudgetBelanja,
          sub.percentCogsActual / 100
        ]);

        subRow.height = 22;
        subRow.eachCell((cell, colNum) => {
          cell.font = { bold: true, color: { argb: 'FFC7D2FE' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
          if (colNum >= 2 && colNum !== 9 && colNum !== 12) {
            cell.numFmt = '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (colNum === 9 || colNum === 12) {
            cell.numFmt = '0.00%';
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Grand Total
      const grandRow = worksheet.addRow([
        'GRAND TOTAL REGIONAL',
        grandTotals.mtdBudgetRevenue,
        grandTotals.actualRevenue,
        grandTotals.forecastSisaHari,
        grandTotals.totalProjectedFullMonth,
        grandTotals.openingInventory,
        grandTotals.closingInventory,
        grandTotals.totalBelanja,
        grandTotals.percentFoodCost / 100,
        grandTotals.budgetBelanja,
        grandTotals.sisaBudgetBelanja,
        grandTotals.percentCogsActual / 100
      ]);

      grandRow.height = 26;
      grandRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF020617' } };
        if (colNum >= 2 && colNum !== 9 && colNum !== 12) {
          cell.numFmt = '#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colNum === 9 || colNum === 12) {
          cell.numFmt = '0.00%';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });

      // Column widths
      worksheet.getColumn(1).width = 24;
      worksheet.getColumn(2).width = 20;
      worksheet.getColumn(3).width = 18;
      worksheet.getColumn(4).width = 18;
      worksheet.getColumn(5).width = 22;
      worksheet.getColumn(6).width = 18;
      worksheet.getColumn(7).width = 18;
      worksheet.getColumn(8).width = 18;
      worksheet.getColumn(9).width = 14;
      worksheet.getColumn(10).width = 18;
      worksheet.getColumn(11).width = 18;
      worksheet.getColumn(12).width = 14;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `REGIONAL_COGS_FORECAST_CONTROL_${monthName}_${selectedYear}.xlsx`);
      showToast?.('Berhasil mengekspor Laporan COGS Regional ke Excel!', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast?.('Gagal mengekspor data ke Excel', 'error');
    }
  };

  // Copy WhatsApp Summary
  const handleCopyWA = () => {
    let msg = `*📊 REGIONAL COGS & FORECAST REVENUE CONTROL*\n`;
    msg += `*Periode:* ${monthName} ${selectedYear}\n\n`;

    areaGroups.forEach(([areaName, rows]) => {
      msg += `📍 *AREA: ${areaName}*\n`;
      rows.forEach(r => {
        msg += `• *${r.outlet}*\n`;
        msg += `  - Budget Rev: Rp ${formatIDR(r.mtdBudgetRevenue)}\n`;
        msg += `  - Actual Rev: Rp ${formatIDR(r.actualRevenue)}\n`;
        msg += `  - Forecast Sisa Hari: Rp ${formatIDR(r.forecastSisaHari)}\n`;
        msg += `  - Projected Full Month: Rp ${formatIDR(r.totalProjectedFullMonth)}\n`;
        msg += `  - Belanja MTD: Rp ${formatIDR(r.totalBelanja)} (${formatPct(r.percentFoodCost)})\n`;
        msg += `  - Budget Belanja: Rp ${formatIDR(r.budgetBelanja)} (Sisa: Rp ${formatIDR(r.sisaBudgetBelanja)})\n`;
        msg += `  - % COGS Actual: ${formatPct(r.percentCogsActual)}\n\n`;
      });

      const sub = computeTotals(rows);
      msg += `*SUBTOTAL ${areaName}:*\n`;
      msg += `  - Actual Rev: Rp ${formatIDR(sub.actualRevenue)} / Projected: Rp ${formatIDR(sub.totalProjectedFullMonth)}\n`;
      msg += `  - Belanja: Rp ${formatIDR(sub.totalBelanja)} (${formatPct(sub.percentFoodCost)})\n`;
      msg += `  - Budget Belanja: Rp ${formatIDR(sub.budgetBelanja)} (Sisa: Rp ${formatIDR(sub.sisaBudgetBelanja)})\n`;
      msg += `  - % COGS Actual: ${formatPct(sub.percentCogsActual)}\n`;
      msg += `------------------------------------\n\n`;
    });

    msg += `🏆 *GRAND TOTAL REGIONAL:*\n`;
    msg += `• MTD Budget Rev: Rp ${formatIDR(grandTotals.mtdBudgetRevenue)}\n`;
    msg += `• Actual Rev: Rp ${formatIDR(grandTotals.actualRevenue)}\n`;
    msg += `• Forecast Sisa Hari: Rp ${formatIDR(grandTotals.forecastSisaHari)}\n`;
    msg += `• Projected Full Month: Rp ${formatIDR(grandTotals.totalProjectedFullMonth)}\n`;
    msg += `• Total Belanja: Rp ${formatIDR(grandTotals.totalBelanja)}\n`;
    msg += `• % Food Cost: ${formatPct(grandTotals.percentFoodCost)}\n`;
    msg += `• Budget Belanja: Rp ${formatIDR(grandTotals.budgetBelanja)}\n`;
    msg += `• Sisa Budget Belanja: Rp ${formatIDR(grandTotals.sisaBudgetBelanja)}\n`;
    msg += `• % COGS Actual: ${formatPct(grandTotals.percentCogsActual)}\n\n`;
    msg += `_Generated from Regional Performance Management_`;

    navigator.clipboard.writeText(msg).then(() => {
      showToast?.('Summary COGS & Forecast berhasil disalin ke WhatsApp!', 'success');
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Action Buttons & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Area Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/10">
            {['ALL', 'JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'].map(a => (
              <button
                key={a}
                onClick={() => setActiveArea(a)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeArea === a
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {a === 'ALL' ? 'Semua Area' : a}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              placeholder="Cari outlet..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[36px]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons: Export Excel & WhatsApp */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer border border-emerald-400/30"
          >
            <i className="fas fa-file-excel"></i>
            <span>Export Excel</span>
          </button>
          <button
            onClick={handleCopyWA}
            className="px-4 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer border border-emerald-400/30"
          >
            <i className="fab fa-whatsapp"></i>
            <span>Copy WA</span>
          </button>
        </div>
      </div>

      {/* Top Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">MTD Budget Rev</span>
          <p className="text-sm lg:text-base font-black text-amber-400 mt-1 truncate">
            Rp {formatIDR(grandTotals.mtdBudgetRevenue)}
          </p>
          <span className="text-[8px] text-slate-500 mt-0.5">Target Bulan Ini</span>
        </div>

        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Actual Revenue</span>
          <p className="text-sm lg:text-base font-black text-emerald-400 mt-1 truncate">
            Rp {formatIDR(grandTotals.actualRevenue)}
          </p>
          <span className="text-[8px] text-emerald-500 font-bold mt-0.5">
            {grandTotals.mtdBudgetRevenue > 0 ? `${((grandTotals.actualRevenue / grandTotals.mtdBudgetRevenue) * 100).toFixed(1)}% Achieved` : '0%'}
          </span>
        </div>

        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Projected Rev</span>
          <p className="text-sm lg:text-base font-black text-indigo-400 mt-1 truncate">
            Rp {formatIDR(grandTotals.totalProjectedFullMonth)}
          </p>
          <span className="text-[8px] text-slate-500 mt-0.5">Actual + Forecast Sisa</span>
        </div>

        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Belanja MTD</span>
          <p className="text-sm lg:text-base font-black text-orange-400 mt-1 truncate">
            Rp {formatIDR(grandTotals.totalBelanja)}
          </p>
          <span className="text-[8px] text-orange-400 font-bold mt-0.5">
            FC: {formatPct(grandTotals.percentFoodCost)}
          </span>
        </div>

        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Budget Belanja</span>
          <p className="text-sm lg:text-base font-black text-cyan-400 mt-1 truncate">
            Rp {formatIDR(grandTotals.budgetBelanja)}
          </p>
          <span className={`text-[8px] font-bold mt-0.5 ${grandTotals.sisaBudgetBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            Sisa: Rp {formatIDR(grandTotals.sisaBudgetBelanja)}
          </span>
        </div>

        <div className="glass-card bg-slate-950/60 p-3.5 border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">% COGS Actual</span>
          <p className={`text-sm lg:text-base font-black mt-1 ${grandTotals.percentCogsActual <= 43 ? 'text-emerald-400' : grandTotals.percentCogsActual <= 45 ? 'text-amber-400' : 'text-rose-400'}`}>
            {formatPct(grandTotals.percentCogsActual)}
          </p>
          <span className="text-[8px] text-slate-500 mt-0.5">HPP Realisasi Regional</span>
        </div>
      </div>

      {/* Main Single Consolidated Table */}
      <div className="overflow-x-auto glass-card bg-slate-950/80 border border-white/10 rounded-2xl shadow-2xl">
        <table className="w-full text-left border-collapse min-w-[1300px]">
          <thead>
            <tr className="bg-slate-900/95 text-[10px] font-black uppercase tracking-widest border-b border-white/10 text-slate-300 sticky top-0 z-10 backdrop-blur-md">
              <th className="p-3 border-r border-white/10 text-left w-56 sticky left-0 bg-slate-900/95 z-20">
                1. NAMA OUTLET
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-amber-950/20 text-amber-300">
                2. MTD BUDGET REVENUE
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-emerald-950/20 text-emerald-300">
                3. ACTUAL REVENUE
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-indigo-950/20 text-indigo-300">
                4. FORECAST SISA HARI
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-blue-950/30 text-blue-200">
                5. TOTAL PROJECTED FULL MONTH
              </th>
              <th className="p-3 border-r border-white/10 text-right text-slate-400">
                6. OPENING INVENTORY
              </th>
              <th className="p-3 border-r border-white/10 text-right text-slate-400">
                7. CLOSING INVENTORY
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-orange-950/20 text-orange-300">
                8. TOTAL BELANJA
              </th>
              <th className="p-3 border-r border-white/10 text-center bg-orange-950/30 text-orange-300 w-28">
                9. %FOOD COST
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-indigo-950/20 text-indigo-300">
                10. BUDGET BELANJA
              </th>
              <th className="p-3 border-r border-white/10 text-right bg-emerald-950/20 text-emerald-300">
                11. SISA BUDGET BELANJA
              </th>
              <th className="p-3 text-center bg-purple-950/30 text-purple-200 w-32">
                12. % COGS ACTUAL
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs font-semibold">
            {areaGroups.map(([areaName, rows]) => {
              const subtotal = computeTotals(rows);

              return (
                <React.Fragment key={areaName}>
                  {/* Area Group Header */}
                  <tr className="bg-slate-900/90 border-t-2 border-indigo-500/40 border-b border-white/10">
                    <td colSpan={12} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                          <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                            AREA: {areaName}
                          </span>
                          <span className="text-[9px] font-black text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-white/5">
                            {rows.length} Outlets
                          </span>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {monthName} {selectedYear}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Individual Outlet Rows */}
                  {rows.map((row) => {
                    const fcStatusColor = row.percentFoodCost <= 43 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : row.percentFoodCost <= 45 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                    const cogsStatusColor = row.percentCogsActual <= 43 
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                      : row.percentCogsActual <= 45 
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30';

                    return (
                      <tr
                        key={row.outlet}
                        onClick={() => onSelectOutlet && onSelectOutlet(row.outlet)}
                        className="hover:bg-slate-800/60 transition-colors group cursor-pointer"
                      >
                        {/* 1. NAMA OUTLET */}
                        <td className="p-3 border-r border-white/10 font-bold text-white sticky left-0 bg-slate-950/95 group-hover:bg-slate-850 z-10">
                          <div className="flex flex-col">
                            <span className="font-black text-white group-hover:text-indigo-300 transition-colors">
                              {row.outlet}
                            </span>
                            <span className="text-[9px] text-slate-500 font-medium">
                              Cutoff Tgl {row.cutoffDay}
                            </span>
                          </div>
                        </td>

                        {/* 2. MTD BUDGET REVENUE */}
                        <td className="p-3 border-r border-white/10 text-right font-medium text-amber-300/90 bg-amber-950/5">
                          Rp {formatIDR(row.mtdBudgetRevenue)}
                        </td>

                        {/* 3. ACTUAL REVENUE */}
                        <td className="p-3 border-r border-white/10 text-right font-black text-emerald-400 bg-emerald-950/5">
                          Rp {formatIDR(row.actualRevenue)}
                        </td>

                        {/* 4. FORECAST SISA HARI */}
                        <td className="p-3 border-r border-white/10 text-right font-medium text-indigo-300 bg-indigo-950/5">
                          Rp {formatIDR(row.forecastSisaHari)}
                        </td>

                        {/* 5. TOTAL PROJECTED FULL MONTH */}
                        <td className="p-3 border-r border-white/10 text-right font-black text-blue-200 bg-blue-950/10">
                          Rp {formatIDR(row.totalProjectedFullMonth)}
                        </td>

                        {/* 6. OPENING INVENTORY */}
                        <td className="p-3 border-r border-white/10 text-right text-slate-400 font-mono text-[11px]">
                          Rp {formatIDR(row.openingInventory)}
                        </td>

                        {/* 7. CLOSING INVENTORY */}
                        <td className="p-3 border-r border-white/10 text-right text-slate-400 font-mono text-[11px]">
                          <div className="flex flex-col items-end">
                            <span>Rp {formatIDR(row.closingInventory)}</span>
                            <span className="text-[8px] text-slate-500 font-normal">
                              ({row.closingInvPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </td>

                        {/* 8. TOTAL BELANJA */}
                        <td className="p-3 border-r border-white/10 text-right font-black text-orange-400 bg-orange-950/5">
                          Rp {formatIDR(row.totalBelanja)}
                        </td>

                        {/* 9. %FOOD COST */}
                        <td className="p-3 border-r border-white/10 text-center bg-orange-950/10">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black border ${fcStatusColor}`}>
                            {formatPct(row.percentFoodCost)}
                          </span>
                        </td>

                        {/* 10. BUDGET BELANJA */}
                        <td className="p-3 border-r border-white/10 text-right font-medium text-indigo-300 bg-indigo-950/5">
                          <div className="flex flex-col items-end">
                            <span>Rp {formatIDR(row.budgetBelanja)}</span>
                            <span className="text-[8px] text-slate-500 font-normal">
                              ({row.targetBudgetPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </td>

                        {/* 11. SISA BUDGET BELANJA */}
                        <td className="p-3 border-r border-white/10 text-right font-black bg-emerald-950/5">
                          <span className={row.sisaBudgetBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            Rp {formatIDR(row.sisaBudgetBelanja)}
                          </span>
                        </td>

                        {/* 12. % COGS ACTUAL */}
                        <td className="p-3 text-center bg-purple-950/10">
                          <div className="flex flex-col items-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black border ${cogsStatusColor}`}>
                              {formatPct(row.percentCogsActual)}
                            </span>
                            {row.projectedCogsPercent > 0 && Math.abs(row.projectedCogsPercent - row.percentCogsActual) > 0.05 && (
                              <span className="text-[8px] text-slate-500 mt-0.5">
                                Proj: {formatPct(row.projectedCogsPercent)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Area Subtotal Row */}
                  <tr className="bg-indigo-950/50 text-indigo-200 text-xs font-black border-t border-b border-indigo-500/30">
                    <td className="p-3 border-r border-white/10 font-black uppercase tracking-wider sticky left-0 bg-indigo-950/90 z-10 text-indigo-300">
                      SUBTOTAL {areaName}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-amber-300">
                      Rp {formatIDR(subtotal.mtdBudgetRevenue)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-emerald-400 font-black">
                      Rp {formatIDR(subtotal.actualRevenue)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-indigo-300">
                      Rp {formatIDR(subtotal.forecastSisaHari)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-blue-200 font-black">
                      Rp {formatIDR(subtotal.totalProjectedFullMonth)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-slate-300 font-mono text-[11px]">
                      Rp {formatIDR(subtotal.openingInventory)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-slate-300 font-mono text-[11px]">
                      Rp {formatIDR(subtotal.closingInventory)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-orange-400 font-black">
                      Rp {formatIDR(subtotal.totalBelanja)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-black">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-200 border border-indigo-400/30">
                        {formatPct(subtotal.percentFoodCost)}
                      </span>
                    </td>
                    <td className="p-3 border-r border-white/10 text-right text-indigo-300">
                      Rp {formatIDR(subtotal.budgetBelanja)}
                    </td>
                    <td className="p-3 border-r border-white/10 text-right font-black">
                      <span className={subtotal.sisaBudgetBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        Rp {formatIDR(subtotal.sisaBudgetBelanja)}
                      </span>
                    </td>
                    <td className="p-3 text-center font-black">
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-400/30">
                        {formatPct(subtotal.percentCogsActual)}
                      </span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>

          {/* Grand Total Regional Footer */}
          <tfoot>
            <tr className="bg-slate-950 text-xs font-black text-white border-t-2 border-indigo-500/50 shadow-inner">
              <td className="p-3.5 border-r border-white/10 uppercase tracking-widest sticky left-0 bg-slate-950 z-20 text-white font-black">
                🏆 GRAND TOTAL REGIONAL
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-amber-400 font-black">
                Rp {formatIDR(grandTotals.mtdBudgetRevenue)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-emerald-400 font-black">
                Rp {formatIDR(grandTotals.actualRevenue)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-indigo-300 font-black">
                Rp {formatIDR(grandTotals.forecastSisaHari)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-blue-200 font-black">
                Rp {formatIDR(grandTotals.totalProjectedFullMonth)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-slate-300 font-mono text-[11px]">
                Rp {formatIDR(grandTotals.openingInventory)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-slate-300 font-mono text-[11px]">
                Rp {formatIDR(grandTotals.closingInventory)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-orange-400 font-black">
                Rp {formatIDR(grandTotals.totalBelanja)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-center font-black">
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black">
                  {formatPct(grandTotals.percentFoodCost)}
                </span>
              </td>
              <td className="p-3.5 border-r border-white/10 text-right text-cyan-300 font-black">
                Rp {formatIDR(grandTotals.budgetBelanja)}
              </td>
              <td className="p-3.5 border-r border-white/10 text-right font-black">
                <span className={grandTotals.sisaBudgetBelanja >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  Rp {formatIDR(grandTotals.sisaBudgetBelanja)}
                </span>
              </td>
              <td className="p-3.5 text-center font-black">
                <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-black">
                  {formatPct(grandTotals.percentCogsActual)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {filteredRows.length === 0 && (
        <div className="p-12 text-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/40 rounded-2xl border border-white/5">
          Tidak ada data outlet yang ditemukan
        </div>
      )}
    </div>
  );
};
