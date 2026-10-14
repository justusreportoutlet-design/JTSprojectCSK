import React, { useMemo, useState, useRef } from 'react';
import { AppState } from '../types';
import ShareActions from './ShareActions';
import { safeWindow } from '../lib/safeStorage';
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend
} from 'recharts';

interface Props {
  data: AppState;
  filters: { month: string; startDate: string; endDate: string };
  selectedOutlet?: string;
}

interface DayEntry {
  dateStr: string;
  dayNum: number;
  dayName: string;
  weekdayIdx: number; // 0 (Sen) - 6 (Min)
  revenue: number;
  covers: number;
  avgCheck: number;
  target: number;
  achievement: number;
  isWeekend: boolean; 
  isHoliday: boolean; 
  isRedDate: boolean; 
  lunchRevenue: number;
  dinnerRevenue: number;
  lunchDiscount: number;
  dinnerDiscount: number;
  discLunchInvestor: number;
  discLunchPakYudi: number;
  discLunchBankMega: number;
  discLunchMember: number;
  discDinnerInvestor: number;
  discDinnerPakYudi: number;
  discDinnerBankMega: number;
  discDinnerMember: number;
}

interface WeekSplit {
  revenue: number;
  covers: number;
  avgCheck: number;
}

interface WeekData {
  id: number;
  label: string;
  range: string;
  revenue: number;
  covers: number;
  target: number;
  achievement: number;
  avgCheck: number;
  days: DayEntry[];
  weekdayStats: WeekSplit;
  weekendStats: WeekSplit;
  lunchTotal: number;
  dinnerTotal: number;
  lunchDiscountTotal: number;
  dinnerDiscountTotal: number;
}

const WeeklyPerformanceModule: React.FC<Props> = ({ data, filters, selectedOutlet }) => {
  const [hoveredDay, setHoveredDay] = useState<DayEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  
  const formatOutlet = (name: string) => {
    if (!name || typeof name !== 'string') return "DASHBOARD";
    if (name.startsWith('SH ')) {
      const rest = name.slice(3).toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `SH ${rest}`;
    }
    return name;
  };
  
  const outletDisplay = formatOutlet(selectedOutlet || '');

  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const weekdaysShort = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const currentMonthName = months[parseInt(filters.month)];
  const currentYear = new Date().getFullYear();

  const { heatmapSlots, summaryWeeks, mtdTotalRev } = useMemo(() => {
    const dailyRec = data.sales.dailyRecording || {};
    const targets = data.dailyTargets || {};
    const holidays = data.holidays || [];
    const monthIdx = parseInt(filters.month);

    const firstDayDate = new Date(currentYear, monthIdx, 1);
    let startDayIdx = firstDayDate.getDay() - 1; // 0=Sen, 6=Min
    if (startDayIdx === -1) startDayIdx = 6; 

    const daysInMonth = new Date(currentYear, monthIdx + 1, 0).getDate();
    const allDays: DayEntry[] = [];
    let totalRev = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = (monthIdx + 1).toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      const dateKey = `${currentYear}-${monthStr}-${dayStr}`;
      
      const record = dailyRec[dateKey] || { revenue: 0, covers: 0 };
      const dayTarget = targets[dateKey] || 0;
      const dateObj = new Date(currentYear, monthIdx, day);
      const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(dateObj);
      
      let weekdayIdx = dateObj.getDay() - 1;
      if (weekdayIdx === -1) weekdayIdx = 6; 

      const isWeekendOnly = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
      const isHolidayOnly = holidays.includes(dateKey);
      const isRedDate = isWeekendOnly || isHolidayOnly;

      const rev = Number(record.revenue) || 0;
      const cov = Number(record.covers) || 0;
      const lRev = Number(record.lunchRevenue) || 0;
      const dRev = Number(record.dinnerRevenue) || 0;
      const lDisc = Number(record.discountLunch) || 0;
      const dDisc = Number(record.discountDinner) || 0;
      const lInv = Number(record.discLunchInvestor) || 0;
      const lPy = Number(record.discLunchPakYudi) || 0;
      const lBm = Number(record.discLunchBankMega) || 0;
      const lMb = Number(record.discLunchMember) || 0;
      const dInv = Number(record.discDinnerInvestor) || 0;
      const dPy = Number(record.discDinnerPakYudi) || 0;
      const dBm = Number(record.discDinnerBankMega) || 0;
      const dMb = Number(record.discDinnerMember) || 0;

      const avg = cov > 0 ? Math.round(rev / cov) : 0;
      const ach = dayTarget > 0 ? (rev / dayTarget * 100) : 0;

      totalRev += rev;

      allDays.push({
        dateStr: dateKey,
        dayNum: day,
        dayName: dayName,
        weekdayIdx: weekdayIdx,
        revenue: rev,
        covers: cov,
        avgCheck: avg,
        target: dayTarget,
        achievement: ach,
        isWeekend: isWeekendOnly,
        isHoliday: isHolidayOnly,
        isRedDate: isRedDate,
        lunchRevenue: lRev,
        dinnerRevenue: dRev,
        lunchDiscount: lDisc,
        dinnerDiscount: dDisc,
        discLunchInvestor: lInv,
        discLunchPakYudi: lPy,
        discLunchBankMega: lBm,
        discLunchMember: lMb,
        discDinnerInvestor: dInv,
        discDinnerPakYudi: dPy,
        discDinnerBankMega: dBm,
        discDinnerMember: dMb
      });
    }

    const hSlots: (DayEntry | null)[] = Array(startDayIdx).fill(null);
    allDays.forEach(d => hSlots.push(d));

    const ranges = [
      { start: 1, end: 7 },
      { start: 8, end: 15 },
      { start: 16, end: 23 },
      { start: 24, end: daysInMonth }
    ];

    const weeks: WeekData[] = ranges.map((range, idx) => {
      const weekNum = idx + 1;
      const validDays = allDays.filter(d => d.dayNum >= range.start && d.dayNum <= range.end);
      
      const weekRevenue = validDays.reduce((a, b) => a + b.revenue, 0);
      const weekCovers = validDays.reduce((a, b) => a + b.covers, 0);
      const weekTarget = validDays.reduce((a, b) => a + b.target, 0);
      
      const weekdayDays = validDays.filter(d => !d.isWeekend);
      const weekendDays = validDays.filter(d => d.isWeekend);

      const wdRev = weekdayDays.reduce((a, b) => a + b.revenue, 0);
      const wdCov = weekdayDays.reduce((a, b) => a + b.covers, 0);
      const weRev = weekendDays.reduce((a, b) => a + b.revenue, 0);
      const weCov = weekendDays.reduce((a, b) => a + b.covers, 0);

      const weekLunch = validDays.reduce((a, b) => a + (b.lunchRevenue || 0), 0);
      const weekDinner = validDays.reduce((a, b) => a + (b.dinnerRevenue || 0), 0);
      const weekLunchDisc = validDays.reduce((a, b) => a + (b.lunchDiscount || 0), 0);
      const weekDinnerDisc = validDays.reduce((a, b) => a + (b.dinnerDiscount || 0), 0);

      return {
        id: weekNum,
        label: `WEEK ${weekNum}`,
        range: `Tanggal ${range.start} - ${range.end}`,
        revenue: weekRevenue,
        covers: weekCovers,
        target: weekTarget,
        achievement: weekTarget > 0 ? (weekRevenue / weekTarget * 100) : 0,
        avgCheck: weekCovers > 0 ? Math.round(weekRevenue / weekCovers) : 0,
        days: validDays,
        weekdayStats: {
          revenue: wdRev,
          covers: wdCov,
          avgCheck: wdCov > 0 ? Math.round(wdRev / wdCov) : 0
        },
        weekendStats: {
          revenue: weRev,
          covers: weCov,
          avgCheck: weCov > 0 ? Math.round(weRev / weCov) : 0
        },
        lunchTotal: weekLunch,
        dinnerTotal: weekDinner,
        lunchDiscountTotal: weekLunchDisc,
        dinnerDiscountTotal: weekDinnerDisc
      };
    });

    return { heatmapSlots: hSlots, summaryWeeks: weeks, mtdTotalRev: totalRev };
  }, [data.sales.dailyRecording, data.dailyTargets, data.holidays, filters.month]);

  const mtdGrowthData = useMemo(() => {
    return summaryWeeks.map(week => ({
      name: week.label,
      lunch: week.lunchTotal,
      dinner: week.dinnerTotal,
      total: week.revenue
    }));
  }, [summaryWeeks]);

  const handleDownloadPDF = () => {
    if (!reportRef.current) return;
    setIsProcessing(true);
    // @ts-ignore
    const html2pdf = safeWindow.obj()?.html2pdf;
    if (html2pdf) {
      const element = reportRef.current;
      const filename = `Weekly_Report_${currentMonthName}_${currentYear}_${outletDisplay.replace(/\s+/g, '_')}.pdf`;

      const originalOverflow = element.style.overflow;
      element.style.overflow = 'visible';

      html2pdf().from(element).set({
        margin: 5,
        filename: filename,
        image: { type: 'jpeg', quality: 0.6 },
        html2canvas: { 
          scale: 1, 
          useCORS: true, 
          logging: false,
          onclone: (clonedDoc: any) => {
            try {
              const styleTags = clonedDoc.querySelectorAll('style');
              styleTags.forEach((st: any) => {
                if (st.textContent) {
                  st.textContent = st.textContent.replace(/oklab\([^)]+\)/gi, '#0f172a').replace(/oklch\([^)]+\)/gi, '#0f172a').replace(/light-dark\([^)]+\)/gi, '#0f172a');
                }
              });
            } catch (e) {}
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              * {
                box-shadow: none !important;
                text-shadow: none !important;
                color: #000 !important;
                border-color: #ccc !important;
                background-image: none !important;
              }
              body, div, section, article, main, aside, header, nav {
                background-color: #fff !important;
              }
              th, th * {
                background-color: #1e3a8a !important; 
                color: #fff !important;
              }
              td {
                background-color: #fff !important;
              }
              tr:nth-child(even) td {
                background-color: #f9fafb !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        },
        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' }
      }).save().then(() => {
        element.style.overflow = originalOverflow;
        const waMessage = encodeURIComponent(`Halo, berikut laporan Weekly Performance PDF.`);
        safeWindow.open(`https://wa.me/?text=${waMessage}`, '_blank');
        setIsProcessing(false);
      });
    } else {
      console.error('html2pdf not found');
      setIsProcessing(false);
    }
  };

  const handleWhatsAppShare = () => {
    handleDownloadPDF();
    const message = `*WEEKLY PERFORMANCE REPORT (PDF) - ${outletDisplay}*\n` +
      `------------------------------------------\n` +
      `💰 *MTD Gross:* Rp ${mtdTotalRev.toLocaleString('id-ID')}\n` +
      `📅 *Periode:* ${currentMonthName} ${currentYear}\n\n` +
      `_Laporan lengkap dalam format PDF telah diunduh. Silakan lampirkan ke dalam chat ini._\n` +
      `_Automated via Performance Suite_`;
    const encoded = encodeURIComponent(message);
    safeWindow.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const getCellColor = (ach: number, revenue: number, isRedDate: boolean) => {
    if (revenue === 0) return isRedDate ? 'bg-red-500/5 border-red-500/20 opacity-60' : 'bg-slate-800/10 border-white/5 opacity-30';
    if (ach >= 110) return 'bg-emerald-500/80 border-emerald-400 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]';
    if (ach >= 100) return 'bg-emerald-500/40 border-emerald-500/50';
    if (ach >= 80) return 'bg-amber-500/40 border-amber-500/50';
    return 'bg-red-500/40 border-red-500/50';
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10" ref={reportRef} id="weekly-performance-container">
      <ShareActions targetId="weekly-performance-container" title={`Weekly Performance Report - ${currentMonthName}`} />
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900 p-4 rounded-3xl border border-white/10 shadow-xl mb-4 no-print">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <i className="fas fa-calendar-alt text-white"></i>
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight">Weekly Performance Review</h3>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Period: {currentMonthName} {new Date().getFullYear()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleDownloadPDF} disabled={isProcessing} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 active:scale-95 shadow-lg flex items-center gap-2">
             <i className={`fas ${isProcessing ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i> Share WA by PDF
          </button>
        </div>
      </div>

      {/* CALENDAR MATRIX HEATMAP */}
      <div className="glass-card p-8 bg-slate-900/40 border-t-2 border-indigo-500 shadow-2xl relative">
        <div className="flex items-center justify-between mb-10">
           <h3 className="text-xs font-black uppercase text-white flex items-center gap-3">
              <i className="fas fa-th-large text-indigo-400"></i> {currentMonthName.toUpperCase()} Performance Grid
           </h3>
           <div className="flex items-center gap-4 flex-wrap justify-end">
              <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
                 <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Weekend / Holiday</span>
              </div>
              <div className="h-4 w-px bg-white/10 mx-2"></div>
              <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60"></div>
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Achv OK</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-sm bg-red-500/60"></div>
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Below Target</span>
              </div>
           </div>
        </div>

        <div className="relative">
          {/* Weekdays Header */}
          <div className="grid grid-cols-7 gap-4 mb-4">
            {weekdaysShort.map(day => (
              <div key={day} className={`text-center text-[10px] font-black uppercase tracking-[0.3em] py-2 border-b border-white/5 ${day === 'Sab' || day === 'Min' ? 'text-red-500' : 'text-slate-500'}`}>
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid Rows */}
          <div className="grid grid-cols-7 gap-4">
            {heatmapSlots.map((day, idx) => (
              <div 
                key={idx} 
                onMouseEnter={() => day && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                className={`relative h-24 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center cursor-help group/cell overflow-hidden ${
                  day ? getCellColor(day.achievement, day.revenue, day.isRedDate) : 'bg-transparent border-none opacity-0'
                } ${day?.isRedDate ? 'after:content-[""] after:absolute after:inset-0 after:bg-[repeating-linear-gradient(45deg,transparent,transparent_12px,rgba(255,255,255,0.01)_12px,rgba(255,255,255,0.01)_13px)]' : ''} ${hoveredDay?.dateStr === day?.dateStr ? 'scale-105 ring-2 ring-indigo-500 z-10' : ''}`}
              >
                {day && (
                  <>
                    <span className={`text-2xl font-black group-hover/cell:scale-110 transition-transform relative z-10 ${day.isRedDate ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'text-white'}`}>
                      {day.dayNum}
                    </span>
                    <span className="text-[7px] font-black text-white/50 uppercase tracking-tighter mt-1 relative z-10">{day.revenue > 0 ? `${(day.achievement || 0).toFixed(0)}%` : '-'}</span>
                    
                    {day.revenue > 0 && (
                      <div className="absolute top-2 right-2 z-10">
                        <div className={`w-1.5 h-1.5 rounded-full ${day.achievement >= 100 ? 'bg-white shadow-[0_0_5px_white] animate-pulse' : 'bg-white/20'}`}></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* POP UP INFO */}
          {hoveredDay && (
            <div className="absolute top-0 right-0 translate-x-4 -translate-y-4 z-50 animate-fade-in pointer-events-none">
              <div className="bg-[#020617] border border-white/10 p-5 rounded-2xl shadow-[0_40px_80px_rgba(0,0,0,0.9)] min-w-[240px] backdrop-blur-3xl">
                <div className="flex justify-between items-start mb-2">
                   <div className={`text-[9px] font-black uppercase tracking-widest ${hoveredDay.isRedDate ? 'text-red-500' : 'text-indigo-400'}`}>{hoveredDay.dayName}</div>
                   {hoveredDay.isHoliday && (
                     <div className="bg-red-500/10 text-red-500 text-[7px] px-2 py-0.5 rounded border border-red-500/20 font-black uppercase">Libur Nasional</div>
                   )}
                   {hoveredDay.isWeekend && !hoveredDay.isHoliday && (
                     <div className="bg-slate-800 text-slate-400 text-[7px] px-2 py-0.5 rounded border border-white/5 font-black uppercase">Weekend</div>
                   )}
                </div>
                <div className="text-2xl font-black text-white mb-5 leading-none tracking-tighter uppercase">Tanggal {hoveredDay.dayNum}</div>
                
                <div className="space-y-2.5 border-t border-white/5 pt-5">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
                    <span>Revenue</span>
                    <span className="text-white font-black">Rp {hoveredDay.revenue.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
                    <span>Target</span>
                    <span className="text-slate-500">Rp {hoveredDay.target.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
                    <span>Pax</span>
                    <span className="text-indigo-300 font-black">{hoveredDay.covers} Pax</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
                    <span>Total Discount</span>
                    <span className="text-rose-400 font-black">Rp {(hoveredDay.lunchDiscount + hoveredDay.dinnerDiscount).toLocaleString('id-ID')}</span>
                  </div>
                  
                  {/* Detailed Discount Breakdown */}
                  {(hoveredDay.discLunchInvestor + hoveredDay.discLunchPakYudi + hoveredDay.discLunchBankMega + hoveredDay.discLunchMember + hoveredDay.discDinnerInvestor + hoveredDay.discDinnerPakYudi + hoveredDay.discDinnerBankMega + hoveredDay.discDinnerMember) > 0 && (
                    <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-white/5">
                      {['Investor', 'Pak Yudi', 'Bank Mega', 'Member'].map(type => {
                        const lunchKey = `discLunch${type.replace(' ', '')}` as keyof DayEntry;
                        const dinnerKey = `discDinner${type.replace(' ', '')}` as keyof DayEntry;
                        const total = (Number(hoveredDay[lunchKey]) || 0) + (Number(hoveredDay[dinnerKey]) || 0);
                        if (total === 0) return null;
                        return (
                          <div key={type} className="flex justify-between items-center text-[7px] font-black uppercase text-slate-600">
                            <span>{type}</span>
                            <span className="text-slate-400">Rp {total.toLocaleString('id-ID')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 mt-2 border-t border-white/5">
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Achv Rate</span>
                    <span className={`text-base font-black ${hoveredDay.achievement >= 100 ? 'text-emerald-400' : 'text-orange-400'}`}>
                       {(hoveredDay.achievement || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MTD GROWTH TREND CHART */}
      <div className="glass-card p-8 bg-slate-900/40 border-t-2 border-purple-500 shadow-2xl relative">
        <div className="flex items-center justify-between mb-8">
           <h3 className="text-xs font-black uppercase text-white flex items-center gap-3">
              <i className="fas fa-chart-line text-purple-400"></i> MTD Growth Trend (W1 - W4)
           </h3>
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                 <div className="w-3 h-0.5 bg-[#FCD34D]"></div>
                 <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Lunch Growth</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-3 h-0.5 bg-[#8B5CF6]"></div>
                 <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Dinner Growth</span>
              </div>
           </div>
        </div>

        <div className="h-[300px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mtdGrowthData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: '900' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: '900' }}
                tickFormatter={(value) => {
                  if (value === 1000000000) return "Rp 1 M";
                  if (value === 250000000) return "Rp 250 JUTA";
                  if (value >= 1000000) return `Rp ${value / 1000000} JT`;
                  return value.toString();
                }}
                ticks={[250000000, 500000000, 750000000, 1000000000]}
                domain={[0, Math.max(1000000000, ...mtdGrowthData.map(d => d.total)) * 1.1]}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#020617] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-xl">
                        <p className="text-[10px] font-black uppercase text-slate-500 mb-2 border-b border-white/5 pb-2">{payload[0].payload.name}</p>
                        <div className="space-y-1">
                          <p className="text-xs font-black text-[#FCD34D] flex justify-between gap-8">
                            <span>LUNCH:</span>
                            <span>Rp {payload[0].value?.toLocaleString('id-ID')}</span>
                          </p>
                          <p className="text-xs font-black text-[#8B5CF6] flex justify-between gap-8">
                            <span>DINNER:</span>
                            <span>Rp {payload[1].value?.toLocaleString('id-ID')}</span>
                          </p>
                          <p className="text-xs font-black text-white flex justify-between gap-8 pt-1 border-t border-white/5 mt-1">
                            <span>TOTAL:</span>
                            <span>Rp {payload[2].value?.toLocaleString('id-ID')}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                iconType="circle"
                content={() => null} // We use our custom legend in header
              />
              <Line 
                type="monotone" 
                dataKey="lunch" 
                stroke="#FCD34D" 
                strokeWidth={4} 
                dot={{ fill: '#FCD34D', strokeWidth: 2, r: 6, stroke: '#020617' }}
                activeDot={{ r: 8, strokeWidth: 3, stroke: '#FCD34D', fill: '#020617' }}
                animationDuration={2000}
              />
              <Line 
                type="monotone" 
                dataKey="dinner" 
                stroke="#8B5CF6" 
                strokeWidth={4} 
                dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 6, stroke: '#020617' }}
                activeDot={{ r: 8, strokeWidth: 3, stroke: '#8B5CF6', fill: '#020617' }}
                animationDuration={2000}
              />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke="rgba(255,255,255,0.1)" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* WEEKLY BREAKDOWN CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
        {summaryWeeks.map((week) => {
          if (week.days.length === 0) return null;
          const weekdayPct = week.revenue > 0 ? (week.weekdayStats.revenue / week.revenue) * 100 : 0;
          const weekendPct = week.revenue > 0 ? (week.weekendStats.revenue / week.revenue) * 100 : 0;

          const chartData = [
            { name: 'Lunch', revenue: week.lunchTotal, color: '#FCD34D' },
            { name: 'Dinner', revenue: week.dinnerTotal, color: '#8B5CF6' }
          ];

          return (
            <div key={week.id} className="glass-card group hover:border-purple-500/40 transition-all duration-300 overflow-hidden bg-slate-900/40 flex flex-col min-h-[1100px] shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-slate-950/40">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform">
                    <span className="text-xl font-black">{week.id}</span>
                </div>
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none mb-1">{week.label}</h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">{week.range}</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="p-6 bg-slate-950/20 border-b border-white/5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Weekly Gross Revenue</div>
                  <div className="text-2xl font-black text-white mb-4">Rp {week.revenue.toLocaleString('id-ID')}</div>
                  
                  <div className="flex items-center gap-4 mb-4">
                     <div className="flex flex-col">
                        <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter">Weekday Revenue</span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-[11px] font-black text-slate-300">Rp {week.weekdayStats.revenue.toLocaleString('id-ID')}</span>
                           <span className="text-[7px] font-bold text-indigo-500">({(weekdayPct || 0).toFixed(0)}%)</span>
                        </div>
                     </div>
                     <div className="w-px h-6 bg-white/5"></div>
                     <div className="flex flex-col">
                        <span className="text-[7px] font-black text-red-500 uppercase tracking-tighter">Weekend Revenue</span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-[11px] font-black text-slate-300">Rp {week.weekendStats.revenue.toLocaleString('id-ID')}</span>
                           <span className="text-[7px] font-bold text-red-500">({(weekendPct || 0).toFixed(0)}%)</span>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-4 mb-6 pt-3 border-t border-white/5">
                     <div className="flex flex-col">
                        <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter">Weekday Avg Check</span>
                        <div className="flex items-center gap-2">
                           <i className="fas fa-utensils text-[8px] text-indigo-500"></i>
                           <span className="text-[11px] font-black text-white">Rp {week.weekdayStats.avgCheck.toLocaleString('id-ID')}</span>
                        </div>
                     </div>
                     <div className="w-px h-6 bg-white/5"></div>
                     <div className="flex flex-col">
                        <span className="text-[7px] font-black text-red-500 uppercase tracking-tighter">Weekend Avg Check</span>
                        <div className="flex items-center gap-2">
                           <i className="fas fa-utensils text-[8px] text-red-500"></i>
                           <span className="text-[11px] font-black text-white">Rp {week.weekendStats.avgCheck.toLocaleString('id-ID')}</span>
                        </div>
                     </div>
                  </div>

                  <div className="h-1 w-full bg-slate-950 rounded-full flex overflow-hidden mb-6 border border-white/5">
                     <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${weekdayPct}%` }}></div>
                     <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${weekendPct}%` }}></div>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Target Achievement</span>
                    <span className={`text-xs font-black ${week.achievement >= 100 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {(week.achievement || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                    <div className={`h-full transition-all duration-1000 ${week.achievement >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-purple-500'}`} 
                          style={{ width: `${Math.min(100, week.achievement)}%` }}></div>
                  </div>

                  {/* LUNCH & DINNER CHART */}
                  <div className="mt-8 pt-6 border-t border-white/5">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <i className="fas fa-chart-bar text-purple-400"></i> Lunch vs Dinner Analysis
                    </div>
                    <div className="h-48 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 10, fontWeight: '900' }} 
                          />
                          <Tooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-slate-950 border border-white/10 p-2 rounded-lg shadow-xl">
                                    <p className="text-[9px] font-black uppercase text-slate-500">{payload[0].payload.name}</p>
                                    <p className="text-xs font-black text-white">Rp {payload[0].value?.toLocaleString('id-ID')}</p>
                                    <p className="text-[8px] font-bold text-rose-400 uppercase mt-1">
                                      Disc: Rp {payload[0].payload.name === 'Lunch' ? week.lunchDiscountTotal.toLocaleString('id-ID') : week.dinnerDiscountTotal.toLocaleString('id-ID')}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] pb-2 border-b border-white/5 px-2 flex items-center gap-2">
                      <i className="fas fa-balance-scale text-indigo-400"></i> Detailed Performance Split
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                      <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl shadow-inner">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                              <i className="fas fa-briefcase text-[10px]"></i>
                            </div>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Weekday (S-J)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Rev</div>
                              <div className="text-[10px] font-black text-white truncate">Rp {week.weekdayStats.revenue.toLocaleString('id-ID')}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Pax</div>
                              <div className="text-[10px] font-black text-indigo-300">{week.weekdayStats.covers}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Avg</div>
                              <div className="text-[10px] font-black text-white">Rp {week.weekdayStats.avgCheck.toLocaleString('id-ID')}</div>
                            </div>
                        </div>
                      </div>

                      <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl shadow-inner">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg">
                              <i className="fas fa-umbrella-beach text-[10px]"></i>
                            </div>
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Weekend (S-M)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Rev</div>
                              <div className="text-[10px] font-black text-white truncate">Rp {week.weekendStats.revenue.toLocaleString('id-ID')}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Pax</div>
                              <div className="text-[10px] font-black text-red-300">{week.weekendStats.covers}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[7px] font-black text-slate-500 uppercase mb-1">Avg</div>
                              <div className="text-[10px] font-black text-white">Rp {week.weekendStats.avgCheck.toLocaleString('id-ID')}</div>
                            </div>
                        </div>
                      </div>
                  </div>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto max-h-[400px] custom-scrollbar">
                  <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] pb-2 border-b border-white/5 px-2">Daily Breakdown</div>
                  {week.days.map((day) => (
                    <div key={day.dateStr} className="flex flex-col group/day p-4 bg-slate-950/40 hover:bg-white/5 rounded-2xl transition-all border border-white/5 hover:border-purple-500/20 shadow-lg">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-[10px] font-black border border-white/5 transition-all shadow-md ${day.isRedDate ? 'text-red-500 border-red-500/30' : 'text-slate-400 group-hover/day:text-white group-hover/day:bg-indigo-600'}`}>
                            {day.dayNum}
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-[11px] font-black uppercase leading-none ${day.isRedDate ? 'text-red-500' : 'text-white'}`}>{day.dayName}</span>
                            <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mt-1">
                              {day.isHoliday ? 'Libur Nasional' : (day.isWeekend ? 'Weekend' : 'Hari Kerja')}
                            </span>
                          </div>
                        </div>
                        {day.revenue > 0 ? (
                          <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${day.achievement >= 100 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-500 bg-slate-900/40'}`}>
                            {(day.achievement || 0).toFixed(0)}%
                          </div>
                        ) : (
                          <span className="text-[12px] font-black text-slate-800">-</span>
                        )}
                      </div>
                      
                      {day.revenue > 0 ? (
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5">
                          <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Revenue</span>
                            <span className="text-[10px] font-black text-white leading-none">Rp {day.revenue.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Pax</span>
                            <span className="text-[10px] font-black text-slate-300 leading-none">{day.covers}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Check</span>
                            <span className="text-[10px] font-black text-indigo-400 leading-none">Rp {day.avgCheck.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-2 text-center opacity-10">
                          <i className="fas fa-ellipsis-h text-xs"></i>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-slate-950/50 border-t border-white/5 mt-auto">
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-2xl bg-slate-900/60 border border-white/5 shadow-inner group-hover:bg-slate-900 transition-colors">
                      <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Pax</div>
                      <div className="text-sm font-black text-white">{week.covers.toLocaleString('id-ID')}</div>
                    </div>
                    <div className="text-center p-3 rounded-2xl bg-slate-900/60 border border-white/5 shadow-inner group-hover:bg-slate-900 transition-colors">
                      <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Week Avg</div>
                      <div className="text-sm font-black text-indigo-400">Rp {week.avgCheck.toLocaleString('id-ID')}</div>
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6 bg-slate-950/40 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 no-print">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-lg">
               <i className="fas fa-info-circle text-purple-500"></i>
            </div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
               Modul ini menunjukkan performa dalam 4 rentang kustom: <span className="text-white font-black">W1(1-7), W2(8-15), W3(16-23), W4(24-End)</span>. <br/>
               Gunakan tombol di atas untuk mengekspor laporan PDF resmi atau berbagi via WhatsApp.
            </p>
         </div>
      </div>
    </div>
  );
};

export default WeeklyPerformanceModule;