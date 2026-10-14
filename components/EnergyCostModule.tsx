import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, Outlet } from '../types';
import { OUTLETS } from '../constants';
import { toLocalDateStr } from '../lib/dateUtils';
import { safeClipboard } from '../lib/safeStorage';
import ShareActions from './ShareActions';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface Props {
  data: AppState;
  allMonthlyData?: Record<string, AppState> | Record<string, Record<string, AppState>> | any;
  selectedOutlet?: string;
  isRegionalView?: boolean;
  filters?: {
    month?: string;
    year?: string;
    startDate?: string;
    endDate?: string;
  };
  onUpdate?: (updater: (prev: AppState) => AppState) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Official Utility Tariffs
const KWH_RATE = 1499.7;
const WATER_RATE = 21250;
const M3_GAS_RATE = 22000;
const PPJU_RATE = 0.037; // 3.70%
const MAINT_RATE = 0.07; // 7%

export const EnergyCostModule: React.FC<Props> = ({
  data,
  allMonthlyData,
  selectedOutlet: propSelectedOutlet,
  isRegionalView = false,
  filters,
  onUpdate,
  showToast
}) => {
  const currentDate = new Date();
  const currentMonthIdx = filters?.month ? Number(filters.month) : currentDate.getMonth();
  const currentYear = filters?.year ? Number(filters.year) : currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const defaultOutlet = isRegionalView 
    ? (propSelectedOutlet || 'ALL')
    : (propSelectedOutlet || 'SH THE BARN');

  const [activeOutlet, setActiveOutlet] = useState<string>(defaultOutlet);
  const [activeTab, setActiveTab] = useState<'INPUT_HARIAN' | 'MATRIX_BULANAN' | 'OUTLET_COMPARISON'>('INPUT_HARIAN');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateStr(new Date()));

  React.useEffect(() => {
    if (!isRegionalView && propSelectedOutlet) {
      setActiveOutlet(propSelectedOutlet);
    } else if (isRegionalView) {
      setActiveOutlet(propSelectedOutlet || 'ALL');
    }
  }, [propSelectedOutlet, isRegionalView]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[selectedMonth];
  const reportId = `energy-cost-${activeOutlet}-${monthPrefix}`;

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Helper to resolve state for specific outlet & month
  const resolveOutletState = (outletName: string, mIdx: number, yr: number): AppState | null => {
    if (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet && mIdx === currentMonthIdx && yr === currentYear) {
      return data;
    }
    if (!allMonthlyData) {
      return (propSelectedOutlet && propSelectedOutlet !== 'ALL' && outletName === propSelectedOutlet) ? data : null;
    }

    if (allMonthlyData[outletName]) {
      const outletBucket = allMonthlyData[outletName];
      if (outletBucket[String(mIdx)]) return outletBucket[String(mIdx)];
      if (outletBucket[mIdx]) return outletBucket[mIdx];
      const ymKey = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
      if (outletBucket[ymKey]) return outletBucket[ymKey];
    }
    if (!isRegionalView && propSelectedOutlet && outletName === propSelectedOutlet) {
      if (allMonthlyData[String(mIdx)]) return allMonthlyData[String(mIdx)];
      if (allMonthlyData[mIdx]) return allMonthlyData[mIdx];
      return data;
    }
    return null;
  };

  // Local state for Daily Energy Input
  const [energyMode, setEnergyMode] = useState<'METER' | 'DIRECT'>('METER');
  const [energyInputs, setEnergyInputs] = useState({
    lwbpOpen: '0',
    lwbpClose: '0',
    wbpOpen: '0',
    wbpClose: '0',
    waterOpen: '0',
    waterClose: '0',
    gasOpen: '0',
    gasClose: '0',
    directElectricity: '0',
    directWater: '0',
    directGas: '0',
  });

  const monthlyOverviewStats = useMemo(() => {
    const stats: Record<number, { totalSpend: number; totalKwh: number; daysCount: number }> = {};
    for (let m = 0; m < 12; m++) {
      stats[m] = { totalSpend: 0, totalKwh: 0, daysCount: 0 };
    }

    const targetOutlet = (!isRegionalView && propSelectedOutlet) ? propSelectedOutlet : (activeOutlet === 'ALL' ? (propSelectedOutlet || 'SH THE BARN') : activeOutlet);

    for (let m = 0; m < 12; m++) {
      const st = resolveOutletState(targetOutlet, m, selectedYear);
      if (st && st.expenses) {
        const daysInM = new Date(selectedYear, m + 1, 0).getDate();
        for (let d = 1; d <= daysInM; d++) {
          const dateStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const exp = st.expenses[dateStr];
          if (exp) {
            const elec = exp.electricity || 0;
            const water = exp.water || 0;
            const gas = exp.gas || 0;
            const tot = elec + water + gas;
            if (tot > 0) {
              stats[m].totalSpend += tot;
              stats[m].daysCount += 1;
            }
            const lwbp = Math.max(0, (exp.elecLwbpClose || 0) - (exp.elecLwbpOpen || 0));
            const wbp = Math.max(0, (exp.elecwbpClose || 0) - (exp.elecwbpOpen || 0));
            stats[m].totalKwh += (lwbp + wbp);
          }
        }
      }
    }
    return stats;
  }, [activeOutlet, propSelectedOutlet, selectedYear, data, allMonthlyData, isRegionalView]);

  // Sync inputs when selectedDate changes
  useEffect(() => {
    const currentExp = data.expenses && data.expenses[selectedDate];
    if (currentExp && (currentExp.elecLwbpOpen !== undefined || currentExp.elecLwbpClose !== undefined || currentExp.waterOpen !== undefined || currentExp.gasOpen !== undefined)) {
      setEnergyInputs({
        lwbpOpen: currentExp.elecLwbpOpen !== undefined ? String(currentExp.elecLwbpOpen) : '0',
        lwbpClose: currentExp.elecLwbpClose !== undefined ? String(currentExp.elecLwbpClose) : '0',
        wbpOpen: currentExp.elecwbpOpen !== undefined ? String(currentExp.elecwbpOpen) : '0',
        wbpClose: currentExp.elecwbpClose !== undefined ? String(currentExp.elecwbpClose) : '0',
        waterOpen: currentExp.waterOpen !== undefined ? String(currentExp.waterOpen) : '0',
        waterClose: currentExp.waterClose !== undefined ? String(currentExp.waterClose) : '0',
        gasOpen: currentExp.gasOpen !== undefined ? String(currentExp.gasOpen) : '0',
        gasClose: currentExp.gasClose !== undefined ? String(currentExp.gasClose) : '0',
        directElectricity: String(currentExp.electricity ?? 0),
        directWater: String(currentExp.water ?? 0),
        directGas: String(currentExp.gas ?? 0),
      });
      if ((currentExp.electricity > 0 || currentExp.water > 0 || currentExp.gas > 0) &&
          (!currentExp.elecLwbpClose && !currentExp.elecwbpClose && !currentExp.waterClose && !currentExp.gasClose)) {
        setEnergyMode('DIRECT');
      } else {
        setEnergyMode('METER');
      }
    } else if (currentExp && (currentExp.electricity > 0 || currentExp.water > 0 || currentExp.gas > 0)) {
      setEnergyMode('DIRECT');
      setEnergyInputs(prev => ({
        ...prev,
        directElectricity: String(currentExp.electricity ?? 0),
        directWater: String(currentExp.water ?? 0),
        directGas: String(currentExp.gas ?? 0),
      }));
    } else {
      // Find latest previous date to auto-populate Open meter
      const sortedDates = Object.keys(data.expenses || {})
        .filter(d => d < selectedDate)
        .sort((a, b) => b.localeCompare(a));
      const latestPrevDate = sortedDates[0];
      const prevData = latestPrevDate ? data.expenses[latestPrevDate] : null;

      setEnergyInputs({
        lwbpOpen: String(prevData?.elecLwbpClose ?? 0),
        lwbpClose: '0',
        wbpOpen: String(prevData?.elecwbpClose ?? 0),
        wbpClose: '0',
        waterOpen: String(prevData?.waterClose ?? 0),
        waterClose: '0',
        gasOpen: String(prevData?.gasClose ?? 0),
        gasClose: '0',
        directElectricity: '0',
        directWater: '0',
        directGas: '0',
      });
      setEnergyMode('METER');
    }
  }, [selectedDate, data.expenses]);

  // Calculations for current input
  const parsedEnergy = useMemo(() => {
    const lwbpOpen = parseFloat(energyInputs.lwbpOpen) || 0;
    const lwbpClose = parseFloat(energyInputs.lwbpClose) || 0;
    const wbpOpen = parseFloat(energyInputs.wbpOpen) || 0;
    const wbpClose = parseFloat(energyInputs.wbpClose) || 0;
    const waterOpen = parseFloat(energyInputs.waterOpen) || 0;
    const waterClose = parseFloat(energyInputs.waterClose) || 0;
    const gasOpen = parseFloat(energyInputs.gasOpen) || 0;
    const gasClose = parseFloat(energyInputs.gasClose) || 0;

    const lwbpUsage = Math.max(0, lwbpClose - lwbpOpen);
    const wbpUsage = Math.max(0, wbpClose - wbpOpen);
    const totalKwhUsage = lwbpUsage + wbpUsage;
    const waterUsage = Math.max(0, waterClose - waterOpen);
    const gasUsage = Math.max(0, gasClose - gasOpen);

    const isLwbpInvalid = lwbpClose > 0 && lwbpClose < lwbpOpen;
    const isWbpInvalid = wbpClose > 0 && wbpClose < wbpOpen;
    const isWaterInvalid = waterClose > 0 && waterClose < waterOpen;
    const isGasInvalid = gasClose > 0 && gasClose < gasOpen;

    if (energyMode === 'DIRECT') {
      const electricityCost = Math.round(parseFloat(energyInputs.directElectricity) || 0);
      const waterCost = Math.round(parseFloat(energyInputs.directWater) || 0);
      const gasCost = Math.round(parseFloat(energyInputs.directGas) || 0);
      return {
        lwbpOpen, lwbpClose, wbpOpen, wbpClose, waterOpen, waterClose, gasOpen, gasClose,
        lwbpUsage, wbpUsage, totalKwhUsage, waterUsage, gasUsage,
        isLwbpInvalid, isWbpInvalid, isWaterInvalid, isGasInvalid,
        electricityCost, waterCost, gasCost,
        totalCost: electricityCost + waterCost + gasCost
      };
    }

    const kwhBase = totalKwhUsage * KWH_RATE;
    const kwhPpju = kwhBase * PPJU_RATE;
    const kwhMaint = kwhBase * MAINT_RATE;
    const electricityCost = Math.round(kwhBase + kwhPpju + kwhMaint);
    const waterCost = Math.round(waterUsage * WATER_RATE);
    const gasCost = Math.round(gasUsage * M3_GAS_RATE);

    return {
      lwbpOpen, lwbpClose, wbpOpen, wbpClose, waterOpen, waterClose, gasOpen, gasClose,
      lwbpUsage, wbpUsage, totalKwhUsage, waterUsage, gasUsage,
      isLwbpInvalid, isWbpInvalid, isWaterInvalid, isGasInvalid,
      electricityCost, waterCost, gasCost,
      totalCost: electricityCost + waterCost + gasCost
    };
  }, [energyInputs, energyMode]);

  const handleSaveEnergy = () => {
    if (!onUpdate) {
      showToast?.("Mode tampilan hanya baca (read-only).", "error");
      return;
    }

    onUpdate((prev: AppState) => {
      const curExp = (prev.expenses && prev.expenses[selectedDate]) || {};
      return {
        ...prev,
        expenses: {
          ...prev.expenses,
          [selectedDate]: {
            ...curExp,
            electricity: parsedEnergy.electricityCost,
            water: parsedEnergy.waterCost,
            gas: parsedEnergy.gasCost,
            elecLwbpOpen: parsedEnergy.lwbpOpen,
            elecLwbpClose: parsedEnergy.lwbpClose,
            elecwbpOpen: parsedEnergy.wbpOpen,
            elecwbpClose: parsedEnergy.wbpClose,
            waterOpen: parsedEnergy.waterOpen,
            waterClose: parsedEnergy.waterClose,
            gasOpen: parsedEnergy.gasOpen,
            gasClose: parsedEnergy.gasClose,
          }
        }
      };
    });

    showToast?.(`Biaya & Meteran Energi tanggal ${selectedDate} berhasil disimpan & disinkronkan!`, "success");
    window.dispatchEvent(
      new CustomEvent('appSubmitSyncFeature', {
        detail: { featureName: 'Energy Cost', timestamp: Date.now() }
      })
    );
  };

  const handleAutofillYesterday = () => {
    const sortedDates = Object.keys(data.expenses || {})
      .filter(d => d < selectedDate)
      .sort((a, b) => b.localeCompare(a));
    const latestPrevDate = sortedDates[0];
    const prevData = latestPrevDate ? data.expenses[latestPrevDate] : null;

    if (prevData) {
      setEnergyInputs(prev => ({
        ...prev,
        lwbpOpen: String(prevData.elecLwbpClose ?? prev.lwbpOpen),
        wbpOpen: String(prevData.elecwbpClose ?? prev.wbpOpen),
        waterOpen: String(prevData.waterClose ?? prev.waterOpen),
        gasOpen: String(prevData.gasClose ?? prev.gasOpen),
      }));
      showToast?.(`Meter Open berhasil diisi dari data kemarin (${latestPrevDate})`, "success");
    } else {
      showToast?.("Tidak ditemukan catatan meteran hari sebelumnya.", "error");
    }
  };

  const handleCopyEnergyWhatsApp = () => {
    const summary = `⚡ *ENERGY REPORT - ${selectedDate}*\n` +
      `Outlet: *${propSelectedOutlet || 'SH THE BARN'}*\n` +
      `------------------------------------\n` +
      (energyMode === 'METER' ? (
        `💡 *ELECTRICITY (PLN):*\n` +
        `• LWBP: ${parsedEnergy.lwbpOpen} ➔ ${parsedEnergy.lwbpClose} (${parsedEnergy.lwbpUsage.toFixed(2)} kWh)\n` +
        `• WBP: ${parsedEnergy.wbpOpen} ➔ ${parsedEnergy.wbpClose} (${parsedEnergy.wbpUsage.toFixed(2)} kWh)\n` +
        `• Total Listrik: ${parsedEnergy.totalKwhUsage.toFixed(2)} kWh\n` +
        `• Biaya Listrik: Rp ${parsedEnergy.electricityCost.toLocaleString('id-ID')}\n\n` +
        `💧 *WATER (PDAM):*\n` +
        `• Meter: ${parsedEnergy.waterOpen} ➔ ${parsedEnergy.waterClose} (${parsedEnergy.waterUsage.toFixed(3)} m³)\n` +
        `• Biaya Air: Rp ${parsedEnergy.waterCost.toLocaleString('id-ID')}\n\n` +
        `🔥 *GAS (M3):*\n` +
        `• Meter: ${parsedEnergy.gasOpen} ➔ ${parsedEnergy.gasClose} (${parsedEnergy.gasUsage.toFixed(3)} m³)\n` +
        `• Biaya Gas: Rp ${parsedEnergy.gasCost.toLocaleString('id-ID')}\n`
      ) : (
        `💡 *Listrik:* Rp ${parsedEnergy.electricityCost.toLocaleString('id-ID')}\n` +
        `💧 *Air PDAM:* Rp ${parsedEnergy.waterCost.toLocaleString('id-ID')}\n` +
        `🔥 *Gas:* Rp ${parsedEnergy.gasCost.toLocaleString('id-ID')}\n`
      )) +
      `------------------------------------\n` +
      `💰 *TOTAL ENERGY COST: Rp ${parsedEnergy.totalCost.toLocaleString('id-ID')}*\n` +
      `_Status: Terverifikasi Sistem Internal_`;

    safeClipboard.writeText(summary).then(ok => {
      if (ok) showToast?.("Rekapan WhatsApp Energy berhasil disalin!", "success");
      else showToast?.("Gagal menyalin rekapan.", "error");
    });
  };

  const shiftDate = (dir: 'PREV' | 'NEXT') => {
    const d = new Date(selectedDate);
    if (dir === 'PREV') d.setDate(d.getDate() - 1);
    else d.setDate(d.getDate() + 1);
    setSelectedDate(toLocalDateStr(d));
  };

  // Compile monthly breakdown data for all days 1..daysInMonth
  const monthlyData = useMemo(() => {
    const targetOutlets = activeOutlet === 'ALL' ? OUTLETS : [activeOutlet];
    const dailyRows: Array<{
      date: string;
      day: number;
      elecKwh: number;
      elecCost: number;
      waterM3: number;
      waterCost: number;
      gasM3: number;
      gasCost: number;
      totalCost: number;
      elecLwbpOpen?: number;
      elecLwbpClose?: number;
      elecwbpOpen?: number;
      elecwbpClose?: number;
      waterOpen?: number;
      waterClose?: number;
      gasOpen?: number;
      gasClose?: number;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      let dayElecKwh = 0;
      let dayElecCost = 0;
      let dayWaterM3 = 0;
      let dayWaterCost = 0;
      let dayGasM3 = 0;
      let dayGasCost = 0;
      let dLwbpOpen = 0, dLwbpClose = 0, dWbpOpen = 0, dWbpClose = 0;
      let dWaterOpen = 0, dWaterClose = 0, dGasOpen = 0, dGasClose = 0;

      targetOutlets.forEach(out => {
        const state = resolveOutletState(out, selectedMonth, selectedYear);
        const exp = state?.expenses?.[dateStr];
        if (exp) {
          const lOpen = exp.elecLwbpOpen || 0;
          const lClose = exp.elecLwbpClose || 0;
          const wOpen = exp.elecwbpOpen || 0;
          const wClose = exp.elecwbpClose || 0;
          const wtOpen = exp.waterOpen || 0;
          const wtClose = exp.waterClose || 0;
          const gOpen = exp.gasOpen || 0;
          const gClose = exp.gasClose || 0;

          const lUsage = Math.max(0, lClose - lOpen);
          const wUsage = Math.max(0, wClose - wOpen);
          const wtUsage = Math.max(0, wtClose - wtOpen);
          const gUsage = Math.max(0, gClose - gOpen);

          dayElecKwh += (lUsage + wUsage);
          dayWaterM3 += wtUsage;
          dayGasM3 += gUsage;

          dayElecCost += (exp.electricity || 0);
          dayWaterCost += (exp.water || 0);
          dayGasCost += (exp.gas || 0);

          dLwbpOpen = lOpen;
          dLwbpClose = lClose;
          dWbpOpen = wOpen;
          dWbpClose = wClose;
          dWaterOpen = wtOpen;
          dWaterClose = wtClose;
          dGasOpen = gOpen;
          dGasClose = gClose;
        }
      });

      dailyRows.push({
        date: dateStr,
        day,
        elecKwh: dayElecKwh,
        elecCost: dayElecCost,
        waterM3: dayWaterM3,
        waterCost: dayWaterCost,
        gasM3: dayGasM3,
        gasCost: dayGasCost,
        totalCost: dayElecCost + dayWaterCost + dayGasCost,
        elecLwbpOpen: dLwbpOpen,
        elecLwbpClose: dLwbpClose,
        elecwbpOpen: dWbpOpen,
        elecwbpClose: dWbpClose,
        waterOpen: dWaterOpen,
        waterClose: dWaterClose,
        gasOpen: dGasOpen,
        gasClose: dGasClose
      });
    }

    const totalElecCost = dailyRows.reduce((a, b) => a + b.elecCost, 0);
    const totalElecKwh = dailyRows.reduce((a, b) => a + b.elecKwh, 0);
    const totalWaterCost = dailyRows.reduce((a, b) => a + b.waterCost, 0);
    const totalWaterM3 = dailyRows.reduce((a, b) => a + b.waterM3, 0);
    const totalGasCost = dailyRows.reduce((a, b) => a + b.gasCost, 0);
    const totalGasM3 = dailyRows.reduce((a, b) => a + b.gasM3, 0);
    const grandTotal = totalElecCost + totalWaterCost + totalGasCost;
    const activeDays = dailyRows.filter(r => r.totalCost > 0).length || 1;
    const avgDaily = grandTotal / activeDays;

    return {
      dailyRows,
      totalElecCost,
      totalElecKwh,
      totalWaterCost,
      totalWaterM3,
      totalGasCost,
      totalGasM3,
      grandTotal,
      activeDays,
      avgDaily
    };
  }, [activeOutlet, selectedMonth, selectedYear, daysInMonth, monthPrefix, data, allMonthlyData]);

  // Outlet comparison data for selected month
  const outletComparisonData = useMemo(() => {
    return OUTLETS.map(outlet => {
      const state = resolveOutletState(outlet, selectedMonth, selectedYear);
      let elec = 0, water = 0, gas = 0;
      let elecKwh = 0, waterM3 = 0, gasM3 = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        const exp = state?.expenses?.[dateStr];
        if (exp) {
          elec += (exp.electricity || 0);
          water += (exp.water || 0);
          gas += (exp.gas || 0);

          const lUsage = Math.max(0, (exp.elecLwbpClose || 0) - (exp.elecLwbpOpen || 0));
          const wUsage = Math.max(0, (exp.elecwbpClose || 0) - (exp.elecwbpOpen || 0));
          elecKwh += (lUsage + wUsage);
          waterM3 += Math.max(0, (exp.waterClose || 0) - (exp.waterOpen || 0));
          gasM3 += Math.max(0, (exp.gasClose || 0) - (exp.gasOpen || 0));
        }
      }

      const total = elec + water + gas;
      return {
        outlet,
        elecCost: elec,
        elecKwh,
        waterCost: water,
        waterM3,
        gasCost: gas,
        gasM3,
        totalCost: total
      };
    });
  }, [selectedMonth, selectedYear, daysInMonth, monthPrefix, data, allMonthlyData]);

  // Donut chart distribution
  const pieData = useMemo(() => {
    return [
      { name: 'Listrik (PLN)', value: monthlyData.totalElecCost, color: '#06b6d4' },
      { name: 'Air (PDAM)', value: monthlyData.totalWaterCost, color: '#3b82f6' },
      { name: 'Gas', value: monthlyData.totalGasCost, color: '#f59e0b' }
    ].filter(item => item.value > 0);
  }, [monthlyData]);

  // Export to Excel handler
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Energy Cost Report');

      // Title header
      worksheet.mergeCells('A1:J1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `ENERGY COST REPORT - ${activeOutlet} (${monthName.toUpperCase()} ${selectedYear})`;
      titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 30;

      // KPI Summary Row
      worksheet.addRow([]);
      worksheet.addRow(['Total Listrik (Rp)', monthlyData.totalElecCost, 'Total Listrik (kWh)', monthlyData.totalElecKwh]);
      worksheet.addRow(['Total Air (Rp)', monthlyData.totalWaterCost, 'Total Air (m³)', monthlyData.totalWaterM3]);
      worksheet.addRow(['Total Gas (Rp)', monthlyData.totalGasCost, 'Total Gas (m³)', monthlyData.totalGasM3]);
      worksheet.addRow(['GRAND TOTAL ENERGY', monthlyData.grandTotal, 'Rata-rata / Hari', monthlyData.avgDaily]);
      worksheet.addRow([]);

      // Table Header
      const headerRow = worksheet.addRow([
        'Tanggal', 'Listrik (kWh)', 'Biaya Listrik (Rp)',
        'Air (m³)', 'Biaya Air (Rp)',
        'Gas (m³)', 'Biaya Gas (Rp)',
        'Total Biaya (Rp)'
      ]);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Rows
      monthlyData.dailyRows.forEach(row => {
        const r = worksheet.addRow([
          row.date,
          Number(row.elecKwh.toFixed(2)),
          row.elecCost,
          Number(row.waterM3.toFixed(3)),
          row.waterCost,
          Number(row.gasM3.toFixed(3)),
          row.gasCost,
          row.totalCost
        ]);
        r.eachCell(cell => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });
      });

      // Total Row
      const totRow = worksheet.addRow([
        'GRAND TOTAL',
        Number(monthlyData.totalElecKwh.toFixed(2)),
        monthlyData.totalElecCost,
        Number(monthlyData.totalWaterM3.toFixed(3)),
        monthlyData.totalWaterCost,
        Number(monthlyData.totalGasM3.toFixed(3)),
        monthlyData.totalGasCost,
        monthlyData.grandTotal
      ]);
      totRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      totRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      });

      // Auto fit columns
      worksheet.columns.forEach(col => {
        col.width = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Energy_Cost_${activeOutlet.replace(/\s+/g, '_')}_${monthPrefix}.xlsx`);
      showToast?.("File Excel Energy Cost berhasil diunduh!", "success");
    } catch (err) {
      console.error(err);
      showToast?.("Gagal mengekspor file Excel.", "error");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in no-blur" id={reportId}>
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
              <i className="fas fa-bolt text-lg"></i>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                ENERGY COST & UTILITIES
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  PLN • PDAM • GAS
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-bold">
                Monitoring Penggunaan KWh Listrik, Meteran Air PDAM, Gas & Rasio Biaya Utilitas
              </p>
            </div>
          </div>
        </div>

        {/* FILTERS & CONTROLS */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Outlet Selector / Badge */}
          {isRegionalView ? (
            <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 shadow-lg">
              <span className="text-[9px] font-black uppercase text-slate-400 pl-2">Outlet:</span>
              <select
                value={activeOutlet}
                onChange={e => setActiveOutlet(e.target.value)}
                className="bg-slate-950 border border-white/10 text-white font-bold text-xs rounded-xl px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="ALL">ALL OUTLETS</option>
                {OUTLETS.map(out => (
                  <option key={out} value={out}>{out}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 shadow-sm">
              <i className="fas fa-store text-amber-400 text-xs"></i>
              <div>
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider leading-none">Outlet Terpilih</span>
                <span className="text-xs font-black text-white uppercase tracking-tight leading-none mt-1 block">{propSelectedOutlet || activeOutlet}</span>
              </div>
            </div>
          )}

          {/* Month & Year Selectors */}
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 shadow-lg">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-slate-950 border border-white/10 text-white font-bold text-xs rounded-xl px-3 py-1.5 outline-none cursor-pointer"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>{name}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-slate-950 border border-white/10 text-white font-bold text-xs rounded-xl px-3 py-1.5 outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center gap-2 border border-white/10"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
          <ShareActions targetId={reportId} title={`Energy Cost Report - ${monthName} ${selectedYear}`} />
        </div>
      </div>

      {/* MAIN LAYOUT WITH MONTHLY SIDEBAR */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* MONTHLY DATA SIDEBAR */}
        <div className="w-full lg:w-64 shrink-0 bg-slate-900/90 border border-white/10 rounded-3xl p-4 space-y-3 shadow-xl lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <i className="fas fa-calendar-alt text-amber-400 text-sm"></i>
              <span className="text-xs font-black uppercase text-white tracking-wider">Rekap Bulanan</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">{selectedYear}</span>
          </div>

          {/* List of 12 Months */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
            {MONTH_NAMES.map((name, idx) => {
              const stats = monthlyOverviewStats[idx] || { totalSpend: 0, totalKwh: 0, daysCount: 0 };
              const isActive = selectedMonth === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(idx);
                    const targetDate = `${selectedYear}-${String(idx + 1).padStart(2, '0')}-01`;
                    setSelectedDate(targetDate);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all border flex items-center justify-between gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50 text-white shadow-md'
                      : 'bg-slate-950/40 hover:bg-white/5 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-amber-400' : (stats.totalSpend > 0 ? 'bg-emerald-400' : 'bg-slate-600')}`}></span>
                      <span className="text-xs font-bold truncate">{name}</span>
                    </div>
                    <span className="text-[10px] font-mono block mt-0.5 text-amber-400 font-bold truncate">
                      {stats.totalSpend > 0 ? `Rp ${Math.round(stats.totalSpend).toLocaleString('id-ID')}` : '-'}
                    </span>
                  </div>
                  {stats.daysCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[9px] font-mono text-slate-300 shrink-0">
                      {stats.daysCount} hr
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {/* TOP NAVIGATION TABS */}
          <div className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-2xl border border-white/10 w-fit">
            <button
              onClick={() => setActiveTab('INPUT_HARIAN')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'INPUT_HARIAN'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-edit"></i> Input & Monitoring Harian
            </button>
            <button
              onClick={() => setActiveTab('MATRIX_BULANAN')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'MATRIX_BULANAN'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-table"></i> Matrix Rekapan Bulanan
            </button>
            <button
              onClick={() => setActiveTab('OUTLET_COMPARISON')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'OUTLET_COMPARISON'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fas fa-chart-pie"></i> Komparasi Outlet & Benchmark
            </button>
          </div>

      {/* TAB 1: INPUT & MONITORING HARIAN */}
      {activeTab === 'INPUT_HARIAN' && (
        <div className="space-y-8">
          {/* DATE SELECTOR & ACTIONS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/90 p-4 rounded-3xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => shiftDate('PREV')}
                  className="w-8 h-8 rounded-lg bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <i className="fas fa-chevron-left text-xs"></i>
                </button>
                <button
                  onClick={() => shiftDate('NEXT')}
                  className="w-8 h-8 rounded-lg bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <i className="fas fa-chevron-right text-xs"></i>
                </button>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Pilih Tanggal Input:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white outline-none focus:ring-2 ring-amber-500"
                />
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setEnergyMode('METER')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  energyMode === 'METER' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-calculator"></i> Hitung Meteran
              </button>
              <button
                type="button"
                onClick={() => setEnergyMode('DIRECT')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  energyMode === 'DIRECT' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <i className="fas fa-money-bill-wave"></i> Nominal Langsung (Rp)
              </button>
            </div>

            {/* Autofill from yesterday & WA actions */}
            <div className="flex items-center gap-2">
              {energyMode === 'METER' && (
                <button
                  type="button"
                  onClick={handleAutofillYesterday}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <i className="fas fa-sync-alt text-xs"></i> Ambil Open Kemarin
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyEnergyWhatsApp}
                className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <i className="fab fa-whatsapp text-sm"></i> Salin WA
              </button>
            </div>
          </div>

          {/* INPUT FORMS */}
          {energyMode === 'METER' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LISTRIK KWH */}
              <div className="bg-slate-900/90 rounded-3xl border border-cyan-500/30 p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-black uppercase text-cyan-400 flex items-center gap-2 tracking-wider">
                      <i className="fas fa-bolt"></i> Listrik PLN (KWh)
                    </h3>
                    <span className="text-[9px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                      Rp 1.499,70/kWh + PPJU + Maint
                    </span>
                  </div>

                  {/* LWBP Inputs */}
                  <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-cyan-400 tracking-wider">LWBP (Siang)</span>
                      {parsedEnergy.isLwbpInvalid && (
                        <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">Close &lt; Open</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Open</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.lwbpOpen}
                          onChange={e => setEnergyInputs({ ...energyInputs, lwbpOpen: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-cyan-500 text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Close</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.lwbpClose}
                          onChange={e => setEnergyInputs({ ...energyInputs, lwbpClose: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-cyan-500 text-center"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1">
                      <span className="text-slate-400">Pemakaian:</span>
                      <span className="font-mono font-bold text-white">{parsedEnergy.lwbpUsage.toFixed(2)} kWh</span>
                    </div>
                  </div>

                  {/* WBP Inputs */}
                  <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">WBP (Malam)</span>
                      {parsedEnergy.isWbpInvalid && (
                        <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">Close &lt; Open</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Open</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.wbpOpen}
                          onChange={e => setEnergyInputs({ ...energyInputs, wbpOpen: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-amber-500 text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Close</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.wbpClose}
                          onChange={e => setEnergyInputs({ ...energyInputs, wbpClose: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-amber-500 text-center"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1">
                      <span className="text-slate-400">Pemakaian:</span>
                      <span className="font-mono font-bold text-white">{parsedEnergy.wbpUsage.toFixed(2)} kWh</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Biaya Listrik</span>
                  <span className="font-mono font-black text-cyan-400 text-base">
                    Rp {parsedEnergy.electricityCost.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* AIR PDAM */}
              <div className="bg-slate-900/90 rounded-3xl border border-blue-500/30 p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-black uppercase text-blue-400 flex items-center gap-2 tracking-wider">
                      <i className="fas fa-tint"></i> Air PDAM (m³)
                    </h3>
                    <span className="text-[9px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                      Rp 21.250 / m³
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Meteran Air</span>
                      {parsedEnergy.isWaterInvalid && (
                        <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">Close &lt; Open</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Open</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.waterOpen}
                          onChange={e => setEnergyInputs({ ...energyInputs, waterOpen: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2.5 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-blue-500 text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Close</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.waterClose}
                          onChange={e => setEnergyInputs({ ...energyInputs, waterClose: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2.5 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-blue-500 text-center"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1">
                      <span className="text-slate-400">Total Pemakaian Air:</span>
                      <span className="font-mono font-bold text-white">{parsedEnergy.waterUsage.toFixed(3)} m³</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Biaya Air PDAM</span>
                  <span className="font-mono font-black text-blue-400 text-base">
                    Rp {parsedEnergy.waterCost.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* GAS */}
              <div className="bg-slate-900/90 rounded-3xl border border-amber-500/30 p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-black uppercase text-amber-400 flex items-center gap-2 tracking-wider">
                      <i className="fas fa-fire"></i> Gas Meteran (m³)
                    </h3>
                    <span className="text-[9px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                      Rp 22.000 / m³
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Meteran Gas</span>
                      {parsedEnergy.isGasInvalid && (
                        <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">Close &lt; Open</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Open</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.gasOpen}
                          onChange={e => setEnergyInputs({ ...energyInputs, gasOpen: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2.5 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-amber-500 text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase font-black block mb-1">Close</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={energyInputs.gasClose}
                          onChange={e => setEnergyInputs({ ...energyInputs, gasClose: e.target.value })}
                          className="w-full bg-slate-900 border border-white/10 p-2.5 rounded-xl text-xs font-black text-white outline-none focus:ring-2 ring-amber-500 text-center"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1">
                      <span className="text-slate-400">Total Pemakaian Gas:</span>
                      <span className="font-mono font-bold text-white">{parsedEnergy.gasUsage.toFixed(3)} m³</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Biaya Gas</span>
                  <span className="font-mono font-black text-amber-400 text-base">
                    Rp {parsedEnergy.gasCost.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* DIRECT NOMINAL INPUT */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/90 rounded-3xl border border-cyan-500/30 p-6 shadow-2xl space-y-4">
                <span className="text-xs font-black uppercase text-cyan-400 flex items-center gap-2">
                  <i className="fas fa-bolt"></i> Biaya Listrik Langsung (Rp)
                </span>
                <input
                  type="number"
                  placeholder="0"
                  value={energyInputs.directElectricity}
                  onChange={e => setEnergyInputs({ ...energyInputs, directElectricity: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 p-3 rounded-2xl text-base font-black text-white outline-none focus:ring-2 ring-cyan-500"
                />
              </div>
              <div className="bg-slate-900/90 rounded-3xl border border-blue-500/30 p-6 shadow-2xl space-y-4">
                <span className="text-xs font-black uppercase text-blue-400 flex items-center gap-2">
                  <i className="fas fa-tint"></i> Biaya Air PDAM Langsung (Rp)
                </span>
                <input
                  type="number"
                  placeholder="0"
                  value={energyInputs.directWater}
                  onChange={e => setEnergyInputs({ ...energyInputs, directWater: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 p-3 rounded-2xl text-base font-black text-white outline-none focus:ring-2 ring-blue-500"
                />
              </div>
              <div className="bg-slate-900/90 rounded-3xl border border-amber-500/30 p-6 shadow-2xl space-y-4">
                <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-2">
                  <i className="fas fa-fire"></i> Biaya Gas Langsung (Rp)
                </span>
                <input
                  type="number"
                  placeholder="0"
                  value={energyInputs.directGas}
                  onChange={e => setEnergyInputs({ ...energyInputs, directGas: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 p-3 rounded-2xl text-base font-black text-white outline-none focus:ring-2 ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* TOTAL & SUBMIT BAR */}
          <div className="bg-slate-950/90 p-6 rounded-3xl border border-amber-500/30 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Biaya Energi ({selectedDate}):</span>
              <div className="text-2xl md:text-3xl font-black text-emerald-400 font-mono mt-1">
                Rp {parsedEnergy.totalCost.toLocaleString('id-ID')}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveEnergy}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-950/40 transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-emerald-300/40 cursor-pointer"
            >
              <i className="fas fa-cloud-arrow-up text-sm"></i> SUBMIT & SYNC ENERGI ({selectedDate})
            </button>
          </div>

          <FeatureSubmitSyncButton
            featureName="Energy Cost"
            subtext={`Sinkronkan meteran listrik, air, dan gas tanggal ${selectedDate} langsung ke server & semua user.`}
          />
        </div>
      )}

      {/* TAB 2: MATRIX REKAPAN BULANAN */}
      {activeTab === 'MATRIX_BULANAN' && (
        <div className="space-y-8">
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-xl space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Biaya Listrik</span>
              <div className="text-xl font-black font-mono text-cyan-400">Rp {monthlyData.totalElecCost.toLocaleString('id-ID')}</div>
              <span className="text-[10px] text-slate-500 font-bold block">{monthlyData.totalElecKwh.toFixed(1)} kWh total pemakaian</span>
            </div>
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-xl space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Biaya Air PDAM</span>
              <div className="text-xl font-black font-mono text-blue-400">Rp {monthlyData.totalWaterCost.toLocaleString('id-ID')}</div>
              <span className="text-[10px] text-slate-500 font-bold block">{monthlyData.totalWaterM3.toFixed(2)} m³ total pemakaian</span>
            </div>
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-xl space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Biaya Gas</span>
              <div className="text-xl font-black font-mono text-amber-400">Rp {monthlyData.totalGasCost.toLocaleString('id-ID')}</div>
              <span className="text-[10px] text-slate-500 font-bold block">{monthlyData.totalGasM3.toFixed(2)} m³ total pemakaian</span>
            </div>
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-emerald-500/30 shadow-xl space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">GRAND TOTAL ENERGY</span>
              <div className="text-xl font-black font-mono text-emerald-400">Rp {monthlyData.grandTotal.toLocaleString('id-ID')}</div>
              <span className="text-[10px] text-slate-500 font-bold block">Avg: Rp {Math.round(monthlyData.avgDaily).toLocaleString('id-ID')} / hari</span>
            </div>
          </div>

          {/* CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/90 rounded-3xl border border-white/10 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs font-black uppercase text-white flex items-center gap-2">
                  <i className="fas fa-chart-bar text-amber-400"></i> Tren Biaya Energi Harian (Rp)
                </span>
                <span className="text-[10px] font-bold text-slate-400 font-mono">{monthName} {selectedYear}</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData.dailyRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="day" stroke="#64748b" textAnchor="middle" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={v => `Rp ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(val: any) => [`Rp ${Number(val).toLocaleString('id-ID')}`, 'Total']}
                    />
                    <Bar dataKey="totalCost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-6 shadow-2xl space-y-4 flex flex-col justify-between">
              <div className="border-b border-white/10 pb-3">
                <span className="text-xs font-black uppercase text-white flex items-center gap-2">
                  <i className="fas fa-chart-pie text-cyan-400"></i> Komposisi Biaya Energi
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={5}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(val: any) => [`Rp ${Number(val).toLocaleString('id-ID')}`, 'Biaya']}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center text-[10px] text-slate-500 font-bold">
                Proporsi pengeluaran energi bulan {monthName}
              </div>
            </div>
          </div>

          {/* DAILY CONSUMPTION TABLE */}
          <div className="bg-slate-950/90 rounded-3xl border border-white/10 p-6 shadow-2xl space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-black uppercase text-white flex items-center gap-2">
                <i className="fas fa-table-cells text-amber-400"></i> Tabel Penggunaan & Biaya Utilitas Harian
              </span>
              <span className="text-[10px] font-mono text-slate-400 font-bold">
                {daysInMonth} Hari
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-900/90 border-b border-white/10">
                    <th className="p-3 sticky left-0 bg-slate-900 z-10">Tanggal</th>
                    <th className="p-3 text-right text-cyan-400">Listrik (kWh)</th>
                    <th className="p-3 text-right text-cyan-400">Biaya Listrik</th>
                    <th className="p-3 text-right text-blue-400">Air (m³)</th>
                    <th className="p-3 text-right text-blue-400">Biaya Air</th>
                    <th className="p-3 text-right text-amber-400">Gas (m³)</th>
                    <th className="p-3 text-right text-amber-400">Biaya Gas</th>
                    <th className="p-3 text-right text-emerald-400 bg-indigo-950/40">Total Biaya (Rp)</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-mono">
                  {monthlyData.dailyRows.map(row => (
                    <tr key={row.date} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-black text-white sticky left-0 bg-slate-950 z-10 border-r border-white/5">
                        {row.date}
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {row.elecKwh > 0 ? row.elecKwh.toFixed(2) : '-'}
                      </td>
                      <td className="p-3 text-right text-cyan-300 font-bold">
                        {row.elecCost > 0 ? `Rp ${row.elecCost.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {row.waterM3 > 0 ? row.waterM3.toFixed(3) : '-'}
                      </td>
                      <td className="p-3 text-right text-blue-300 font-bold">
                        {row.waterCost > 0 ? `Rp ${row.waterCost.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {row.gasM3 > 0 ? row.gasM3.toFixed(3) : '-'}
                      </td>
                      <td className="p-3 text-right text-amber-300 font-bold">
                        {row.gasCost > 0 ? `Rp ${row.gasCost.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-3 text-right text-emerald-400 font-black bg-indigo-950/20">
                        Rp {row.totalCost.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedDate(row.date);
                            setActiveTab('INPUT_HARIAN');
                          }}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-[10px] font-sans font-bold uppercase transition-all"
                        >
                          <i className="fas fa-edit"></i> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900/90 text-xs font-black uppercase border-t-2 border-amber-500/40">
                    <td className="p-3 text-white sticky left-0 bg-slate-900">GRAND TOTAL</td>
                    <td className="p-3 text-right font-mono text-cyan-400">{monthlyData.totalElecKwh.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-cyan-400">Rp {monthlyData.totalElecCost.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono text-blue-400">{monthlyData.totalWaterM3.toFixed(3)}</td>
                    <td className="p-3 text-right font-mono text-blue-400">Rp {monthlyData.totalWaterCost.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono text-amber-400">{monthlyData.totalGasM3.toFixed(3)}</td>
                    <td className="p-3 text-right font-mono text-amber-400">Rp {monthlyData.totalGasCost.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right font-mono text-emerald-400 text-sm bg-indigo-950/50">
                      Rp {monthlyData.grandTotal.toLocaleString('id-ID')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OUTLET COMPARISON & BENCHMARK */}
      {activeTab === 'OUTLET_COMPARISON' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {outletComparisonData.map(out => {
              const share = monthlyData.grandTotal > 0 ? (out.totalCost / monthlyData.grandTotal) * 100 : 0;
              return (
                <div key={out.outlet} className="bg-slate-900/90 rounded-3xl border border-white/10 p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-sm font-black uppercase text-white flex items-center gap-2">
                      <i className="fas fa-store text-amber-400"></i> {out.outlet}
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      {share.toFixed(1)}% Share
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-slate-400">Listrik PLN</span>
                      <span className="font-mono font-bold text-cyan-300">Rp {out.elecCost.toLocaleString('id-ID')} ({out.elecKwh.toFixed(1)} kWh)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-slate-400">Air PDAM</span>
                      <span className="font-mono font-bold text-blue-300">Rp {out.waterCost.toLocaleString('id-ID')} ({out.waterM3.toFixed(2)} m³)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-slate-400">Gas</span>
                      <span className="font-mono font-bold text-amber-300">Rp {out.gasCost.toLocaleString('id-ID')} ({out.gasM3.toFixed(2)} m³)</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-slate-400">Total Biaya Energi</span>
                    <span className="font-mono font-black text-emerald-400 text-base">
                      Rp {out.totalCost.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default EnergyCostModule;
