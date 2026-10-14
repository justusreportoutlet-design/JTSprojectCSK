import React, { useState, useMemo } from 'react';
import { AppState, LedgerItem } from '../types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface RecapColumnDef {
  id: string;
  label: string;
  shortLabel?: string;
  colorClass?: string;
  getValue: (st: AppState, dateStr: string) => number;
}

export interface DayDetailItem {
  id: string;
  outlet?: string;
  category: string;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  reason?: string;
  pic?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
  themeColor?: 'amber' | 'emerald' | 'blue' | 'indigo' | 'rose' | 'cyan' | 'purple' | 'teal';
  selectedMonth: number; // 0..11
  selectedYear: number;
  selectedOutlet?: string;
  isRegionalView?: boolean;
  monthlyStates: AppState[];
  columns: RecapColumnDef[];
  getDetailItemsForDay?: (dateStr: string, states: AppState[]) => DayDetailItem[];
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const BelanjaFullTanggalRecapTable: React.FC<Props> = ({
  title,
  subtitle,
  icon = 'fa-calendar-days',
  themeColor = 'amber',
  selectedMonth,
  selectedYear,
  selectedOutlet,
  isRegionalView = false,
  monthlyStates,
  columns,
  getDetailItemsForDay
}) => {
  const [viewingDate, setViewingDate] = useState<{ day: number; dateStr: string; dayName: string; revenue: number; totalCost: number; pct: number } | null>(null);
  const [filterZeroDays, setFilterZeroDays] = useState(false);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const monthStr = String(selectedMonth + 1).padStart(2, '0');

  // Compute daily rows
  const dailyRows = useMemo(() => {
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;
      const dObj = new Date(selectedYear, selectedMonth, day);
      const dayName = DAY_NAMES_ID[dObj.getDay()];

      // Revenue across monthly states
      let dayRevenue = 0;
      for (const st of monthlyStates) {
        if (st.sales?.dailyRecording?.[dateStr]?.revenue) {
          dayRevenue += Number(st.sales.dailyRecording[dateStr].revenue) || 0;
        }
      }

      // Column values
      const colValues: Record<string, number> = {};
      let dayTotalCost = 0;

      columns.forEach(col => {
        let colSum = 0;
        for (const st of monthlyStates) {
          colSum += col.getValue(st, dateStr) || 0;
        }
        colValues[col.id] = colSum;
        dayTotalCost += colSum;
      });

      const pct = dayRevenue > 0 ? (dayTotalCost / dayRevenue) * 100 : 0;

      rows.push({
        day,
        dayStr,
        dateStr,
        dayName,
        isWeekend: dObj.getDay() === 0 || dObj.getDay() === 6,
        revenue: dayRevenue,
        totalCost: dayTotalCost,
        pct,
        colValues
      });
    }
    return rows;
  }, [selectedYear, selectedMonth, daysInMonth, monthStr, monthlyStates, columns]);

  // Compute monthly totals
  const totals = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    const colTotals: Record<string, number> = {};
    columns.forEach(c => { colTotals[c.id] = 0; });

    dailyRows.forEach(row => {
      totalRevenue += row.revenue;
      totalCost += row.totalCost;
      columns.forEach(c => {
        colTotals[c.id] += row.colValues[c.id] || 0;
      });
    });

    const overallPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      overallPct,
      colTotals
    };
  }, [dailyRows, columns]);

  // Filtered rows
  const displayedRows = useMemo(() => {
    if (!filterZeroDays) return dailyRows;
    return dailyRows.filter(r => r.totalCost > 0 || r.revenue > 0);
  }, [dailyRows, filterZeroDays]);

  // Details for selected modal day
  const activeDayDetails = useMemo(() => {
    if (!viewingDate) return [];
    if (getDetailItemsForDay) {
      return getDetailItemsForDay(viewingDate.dateStr, monthlyStates);
    }
    return [];
  }, [viewingDate, getDetailItemsForDay, monthlyStates]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheetName = `${MONTH_NAMES[selectedMonth].substring(0, 3)} ${selectedYear}`;
      const worksheet = workbook.addWorksheet(sheetName);

      // Title rows
      worksheet.addRow([title.toUpperCase()]);
      worksheet.addRow([`Periode: ${MONTH_NAMES[selectedMonth]} ${selectedYear} | Outlet: ${selectedOutlet || 'SEMUA OUTLET (REGIONAL)'}`]);
      worksheet.addRow([]);

      // Headers
      const headers = ['TANGGAL', 'HARI', 'REVENUE (RP)', '% RATIO', 'TOTAL BELANJA (RP)', ...columns.map(c => c.label.toUpperCase())];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };

      // Data rows
      dailyRows.forEach(row => {
        const rData = [
          row.day,
          row.dayName,
          row.revenue,
          `${row.pct.toFixed(2)}%`,
          row.totalCost,
          ...columns.map(c => row.colValues[c.id] || 0)
        ];
        worksheet.addRow(rData);
      });

      // Total row
      const totalRowData = [
        'TOTAL MTD',
        '-',
        totals.totalRevenue,
        `${totals.overallPct.toFixed(2)}%`,
        totals.totalCost,
        ...columns.map(c => totals.colTotals[c.id] || 0)
      ];
      const totalRow = worksheet.addRow(totalRowData);
      totalRow.font = { bold: true, color: { argb: 'FF000000' } };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF59E0B' }
      };

      // Number formatting
      worksheet.columns.forEach((col, idx) => {
        if (idx === 2 || idx >= 4) {
          col.numFmt = '#,##0';
        }
        col.width = idx === 0 ? 10 : idx === 1 ? 8 : 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Rekapan_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${MONTH_NAMES[selectedMonth]}_${selectedYear}.xlsx`);
    } catch (err) {
      console.error('Failed to export excel:', err);
    }
  };

  const themeClasses = {
    amber: {
      accent: 'text-amber-400',
      badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      headerBg: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
      totalBg: 'bg-amber-500 text-slate-950',
      highlight: 'text-amber-400 font-black'
    },
    emerald: {
      accent: 'text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      headerBg: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
      totalBg: 'bg-emerald-500 text-slate-950',
      highlight: 'text-emerald-400 font-black'
    },
    blue: {
      accent: 'text-blue-400',
      badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
      headerBg: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
      totalBg: 'bg-blue-500 text-slate-950',
      highlight: 'text-blue-400 font-black'
    },
    indigo: {
      accent: 'text-indigo-400',
      badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
      headerBg: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30',
      totalBg: 'bg-indigo-500 text-slate-950',
      highlight: 'text-indigo-400 font-black'
    },
    rose: {
      accent: 'text-rose-400',
      badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      headerBg: 'bg-rose-500/20 text-rose-200 border-rose-500/30',
      totalBg: 'bg-rose-500 text-slate-950',
      highlight: 'text-rose-400 font-black'
    },
    cyan: {
      accent: 'text-cyan-400',
      badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      headerBg: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
      totalBg: 'bg-cyan-500 text-slate-950',
      highlight: 'text-cyan-400 font-black'
    },
    purple: {
      accent: 'text-purple-400',
      badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
      headerBg: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
      totalBg: 'bg-purple-500 text-slate-950',
      highlight: 'text-purple-400 font-black'
    },
    teal: {
      accent: 'text-teal-400',
      badge: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      headerBg: 'bg-teal-500/20 text-teal-200 border-teal-500/30',
      totalBg: 'bg-teal-500 text-slate-950',
      highlight: 'text-teal-400 font-black'
    }
  }[themeColor];

  return (
    <div className="glass-card bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shadow-inner">
              <i className={`fas ${icon} ${themeClasses.accent}`}></i>
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                {title}
              </h3>
              <p className="text-xs text-slate-400">
                {subtitle || `Rekapan harian lengkap tanggal 1 sampai ${daysInMonth} (${MONTH_NAMES[selectedMonth]} ${selectedYear})`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setFilterZeroDays(!filterZeroDays)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              filterZeroDays
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fas fa-filter mr-1.5"></i>
            {filterZeroDays ? 'Semua Hari (1-31)' : 'Hari Beraktivitas'}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <i className="fas fa-file-excel"></i>
            Export Excel
          </button>
        </div>
      </div>

      {/* Quick Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Revenue MTD</span>
          <div className="text-sm md:text-base font-mono font-black text-white">
            Rp {totals.totalRevenue.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Belanja MTD</span>
          <div className={`text-sm md:text-base font-mono font-black ${themeClasses.accent}`}>
            Rp {totals.totalCost.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rasio Belanja / Rev</span>
          <div className="text-sm md:text-base font-mono font-black text-amber-300">
            {totals.overallPct.toFixed(2)}%
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rata-rata Harian</span>
          <div className="text-sm md:text-base font-mono font-black text-slate-200">
            Rp {Math.round(totals.totalCost / (daysInMonth || 1)).toLocaleString('id-ID')}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto custom-scrollbar border border-white/10 rounded-2xl bg-slate-950/50">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/90 text-slate-300 text-[10px] font-black uppercase tracking-wider select-none">
              <th className="p-3 text-center w-12 border-r border-white/5">TGL</th>
              <th className="p-3 text-center w-12 border-r border-white/5">HARI</th>
              <th className="p-3 text-right border-r border-white/5 min-w-[120px]">REVENUE</th>
              <th className="p-3 text-center border-r border-white/5 w-16">% COST</th>
              <th className={`p-3 text-right border-r border-white/10 min-w-[130px] font-black ${themeClasses.accent} bg-white/[0.02]`}>
                TOTAL BELANJA
              </th>
              {columns.map(col => (
                <th key={col.id} className="p-3 text-right border-r border-white/5 min-w-[110px] text-slate-300 font-black">
                  {col.shortLabel || col.label}
                </th>
              ))}
              <th className="p-3 text-center w-16">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {displayedRows.map(row => (
              <tr
                key={row.day}
                onClick={() => setViewingDate(row)}
                className={`transition-colors cursor-pointer group ${
                  row.isWeekend ? 'bg-white/[0.015]' : ''
                } hover:bg-white/[0.06]`}
                title="Klik untuk melihat rincian item belanja hari ini"
              >
                {/* Tanggal */}
                <td className="p-2.5 text-center font-mono font-black text-amber-400 border-r border-white/5 group-hover:text-amber-300">
                  {row.day}
                </td>

                {/* Hari */}
                <td className={`p-2.5 text-center font-bold text-[10px] border-r border-white/5 ${
                  row.isWeekend ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {row.dayName}
                </td>

                {/* Revenue */}
                <td className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5">
                  {row.revenue > 0 ? `Rp ${row.revenue.toLocaleString('id-ID')}` : '-'}
                </td>

                {/* % Cost */}
                <td className="p-2.5 text-center font-mono border-r border-white/5">
                  {row.revenue > 0 && row.totalCost > 0 ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      row.pct > 10 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {row.pct.toFixed(1)}%
                    </span>
                  ) : '-'}
                </td>

                {/* Total Belanja */}
                <td className={`p-2.5 text-right font-mono font-black border-r border-white/10 ${
                  row.totalCost > 0 ? themeClasses.accent : 'text-slate-500'
                } bg-white/[0.01]`}>
                  {row.totalCost > 0 ? `Rp ${row.totalCost.toLocaleString('id-ID')}` : '-'}
                </td>

                {/* Breakdown Columns */}
                {columns.map(col => {
                  const val = row.colValues[col.id] || 0;
                  return (
                    <td key={col.id} className="p-2.5 text-right font-mono text-slate-300 border-r border-white/5">
                      {val > 0 ? `Rp ${val.toLocaleString('id-ID')}` : '-'}
                    </td>
                  );
                })}

                {/* Aksi Button */}
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingDate(row);
                    }}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-amber-500/20 hover:text-amber-300 text-slate-400 flex items-center justify-center transition-all mx-auto"
                    title="Buka rincian"
                  >
                    <i className="fas fa-eye text-xs"></i>
                  </button>
                </td>
              </tr>
            ))}

            {/* Total Footer Row */}
            <tr className={`border-t-2 border-white/20 font-black text-xs ${themeClasses.totalBg}`}>
              <td className="p-3 text-center uppercase tracking-wider font-black">
                MTD
              </td>
              <td className="p-3 text-center uppercase tracking-wider font-black">
                ALL
              </td>
              <td className="p-3 text-right font-mono font-black">
                Rp {totals.totalRevenue.toLocaleString('id-ID')}
              </td>
              <td className="p-3 text-center font-mono font-black">
                {totals.overallPct.toFixed(2)}%
              </td>
              <td className="p-3 text-right font-mono font-black border-r border-black/20">
                Rp {totals.totalCost.toLocaleString('id-ID')}
              </td>
              {columns.map(col => (
                <td key={col.id} className="p-3 text-right font-mono font-black">
                  Rp {(totals.colTotals[col.id] || 0).toLocaleString('id-ID')}
                </td>
              ))}
              <td className="p-3 text-center">
                <i className="fas fa-check-double text-xs"></i>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Rincian Belanja Modal */}
      {viewingDate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <i className="fas fa-receipt text-amber-400"></i>
                  Rincian Transaksi: {viewingDate.day} {MONTH_NAMES[selectedMonth]} {selectedYear} ({viewingDate.dayName})
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Revenue: <span className="font-mono text-white font-bold">Rp {viewingDate.revenue.toLocaleString('id-ID')}</span> | 
                  Total Belanja: <span className="font-mono text-amber-400 font-bold">Rp {viewingDate.totalCost.toLocaleString('id-ID')}</span> ({viewingDate.pct.toFixed(2)}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingDate(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Content Items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              {activeDayDetails.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <i className="fas fa-inbox text-3xl opacity-50"></i>
                  <p className="text-xs italic">Tidak ada item belanja individual tercatat pada tanggal ini.</p>
                  {viewingDate.totalCost > 0 && (
                    <p className="text-[11px] text-amber-400/80">
                      (Total Rp {viewingDate.totalCost.toLocaleString('id-ID')} terakumulasi dari nilai expense harian)
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-white/5 rounded-2xl bg-slate-950/60">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 text-[10px] font-black uppercase">
                        <th className="p-3 w-10 text-center">No</th>
                        {isRegionalView && <th className="p-3">Outlet</th>}
                        <th className="p-3">Kategori</th>
                        <th className="p-3">Nama Item</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Harga</th>
                        <th className="p-3 text-right">Subtotal</th>
                        <th className="p-3">Keterangan</th>
                        <th className="p-3">PIC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {activeDayDetails.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-white/5">
                          <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                          {isRegionalView && (
                            <td className="p-3 font-bold text-cyan-300">{it.outlet || selectedOutlet || '-'}</td>
                          )}
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md bg-white/5 text-amber-300 text-[10px] font-bold border border-white/5">
                              {it.category}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-white">{it.name}</td>
                          <td className="p-3 text-center font-mono">{it.qty}</td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            Rp {Number(it.price || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-amber-400">
                            Rp {Number(it.subtotal || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-slate-400 text-[11px] max-w-[180px] truncate" title={it.reason}>
                            {it.reason || '-'}
                          </td>
                          <td className="p-3 text-slate-400 text-[11px]">{it.pic || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-slate-900 text-xs font-black text-white">
                        <td colSpan={isRegionalView ? 6 : 5} className="p-3 text-right uppercase tracking-wider">
                          Total Item Rincian:
                        </td>
                        <td className="p-3 text-right font-mono text-amber-400">
                          Rp {activeDayDetails.reduce((a, b) => a + (Number(b.subtotal) || 0), 0).toLocaleString('id-ID')}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setViewingDate(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs uppercase hover:bg-slate-700 transition-all cursor-pointer"
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

export default BelanjaFullTanggalRecapTable;
