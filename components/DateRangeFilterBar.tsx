import React from 'react';

interface DateRangeFilterBarProps {
  startDay: number;
  endDay: number;
  maxDays: number;
  monthName: string;
  year: number;
  onRangeChange: (start: number, end: number) => void;
  title?: string;
  accentColor?: 'cyan' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple';
  onCopyWhatsApp?: () => void;
  whatsAppButtonLabel?: string;
}

export const DateRangeFilterBar: React.FC<DateRangeFilterBarProps> = ({
  startDay,
  endDay,
  maxDays,
  monthName,
  year,
  onRangeChange,
  title = 'Filter Rentang Tanggal',
  accentColor = 'cyan',
  onCopyWhatsApp,
  whatsAppButtonLabel = 'Salin WA Sesuai Filter'
}) => {
  const isFullMonth = startDay === 1 && endDay === maxDays;

  const presets = [
    { label: '1 - 10', start: 1, end: Math.min(10, maxDays) },
    { label: '1 - 15', start: 1, end: Math.min(15, maxDays) },
    { label: '1 - 20', start: 1, end: Math.min(20, maxDays) },
    { label: '1 - 25', start: 1, end: Math.min(25, maxDays) },
    { label: `1 - ${maxDays} (Full)`, start: 1, end: maxDays },
  ];

  const colorStyles = {
    cyan: {
      bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
      activeBtn: 'bg-cyan-500 text-slate-950 shadow-cyan-500/30',
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      ring: 'focus:border-cyan-400 focus:ring-cyan-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    indigo: {
      bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
      activeBtn: 'bg-indigo-500 text-white shadow-indigo-500/30',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      ring: 'focus:border-indigo-400 focus:ring-indigo-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    emerald: {
      bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      activeBtn: 'bg-emerald-500 text-slate-950 shadow-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      ring: 'focus:border-emerald-400 focus:ring-emerald-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    amber: {
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      activeBtn: 'bg-amber-500 text-slate-950 shadow-amber-500/30',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      ring: 'focus:border-amber-400 focus:ring-amber-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    rose: {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      activeBtn: 'bg-rose-500 text-white shadow-rose-500/30',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      ring: 'focus:border-rose-400 focus:ring-rose-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    blue: {
      bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      activeBtn: 'bg-blue-500 text-white shadow-blue-500/30',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      ring: 'focus:border-blue-400 focus:ring-blue-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    },
    purple: {
      bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
      activeBtn: 'bg-purple-500 text-white shadow-purple-500/30',
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      ring: 'focus:border-purple-400 focus:ring-purple-500/30',
      waBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
    }
  }[accentColor];

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    const clamped = Math.max(1, Math.min(val, endDay));
    onRangeChange(clamped, endDay);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    const clamped = Math.max(startDay, Math.min(val, maxDays));
    onRangeChange(startDay, clamped);
  };

  return (
    <div className="p-4 bg-slate-900/90 border border-white/10 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      {/* Label and Active Range Indicator */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorStyles.bg}`}>
          <i className="fas fa-calendar-range text-sm"></i>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-white uppercase tracking-wider">{title}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${colorStyles.badge}`}>
              {isFullMonth ? 'Bulan Penuh (1 - ' + maxDays + ')' : `Tgl ${startDay} - ${endDay}`}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Periode: <strong className="text-slate-200">Tgl {startDay} s/d {endDay} {monthName} {year}</strong>
          </p>
        </div>
      </div>

      {/* Controls & Quick Presets */}
      <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
        {/* Quick Presets */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10">
          {presets.map((p, idx) => {
            const isActive = startDay === p.start && endDay === p.end;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onRangeChange(p.start, p.end)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  isActive
                    ? `${colorStyles.activeBtn} shadow-md`
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Custom Day Range Inputs */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-white/10 text-xs">
          <span className="text-slate-400 text-[10px] font-bold uppercase">Tgl</span>
          <input
            type="number"
            min={1}
            max={endDay}
            value={startDay}
            onChange={handleStartChange}
            className={`w-10 bg-slate-900 text-white font-bold text-center py-0.5 rounded border border-white/10 ${colorStyles.ring} focus:outline-none`}
            title="Tanggal Mulai"
          />
          <span className="text-slate-500 font-bold">-</span>
          <input
            type="number"
            min={startDay}
            max={maxDays}
            value={endDay}
            onChange={handleEndChange}
            className={`w-10 bg-slate-900 text-white font-bold text-center py-0.5 rounded border border-white/10 ${colorStyles.ring} focus:outline-none`}
            title="Tanggal Akhir"
          />
          <span className="text-slate-400 text-[10px] font-bold">{monthName.slice(0, 3)}</span>
        </div>

        {/* Reset button if not full month */}
        {!isFullMonth && (
          <button
            type="button"
            onClick={() => onRangeChange(1, maxDays)}
            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5"
            title="Reset ke Bulan Penuh"
          >
            <i className="fas fa-undo text-[10px]"></i> Reset
          </button>
        )}

        {/* WhatsApp Export Button */}
        {onCopyWhatsApp && (
          <button
            type="button"
            onClick={onCopyWhatsApp}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 ${colorStyles.waBtn}`}
          >
            <i className="fab fa-whatsapp text-sm"></i>
            <span>{whatsAppButtonLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default DateRangeFilterBar;
