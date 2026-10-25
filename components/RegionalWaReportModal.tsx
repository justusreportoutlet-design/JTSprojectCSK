import React, { useState, useMemo } from 'react';
import { AppState, Outlet } from '../types';
import { 
  getActiveOutletNames, 
  MONTHS, 
  getActiveRegionalAreas,
  getAreaForOutlet
} from '../constants';
import { 
  buildSingleOutletWaReport, 
  buildAreaWaReport, 
  buildAllOutletsWaReport, 
  WaReportPeriod, 
  WaReportScope 
} from '../lib/regionalWaReport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allOutletsData: Record<string, any>;
  globalData?: AppState;
  selectedMonth: number;
  selectedYear: number;
  initialScope?: WaReportScope;
  initialSelectedOutlet?: string;
  initialSelectedArea?: string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RegionalWaReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  allOutletsData,
  globalData,
  selectedMonth,
  selectedYear,
  initialScope = 'SELECTED',
  initialSelectedOutlet = 'SH CIPETE',
  initialSelectedArea = 'JAKARTA',
  showToast
}) => {
  const [reportScope, setReportScope] = useState<WaReportScope>(initialScope || 'SELECTED');
  const [reportPeriod, setReportPeriod] = useState<WaReportPeriod>('MTD');
  const [selectedOutlet, setSelectedOutlet] = useState<string>(initialSelectedOutlet || 'SH CIPETE');
  const [selectedArea, setSelectedArea] = useState<string>(initialSelectedArea || 'JAKARTA');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  React.useEffect(() => {
    if (initialScope) {
      setReportScope(initialScope);
    }
  }, [initialScope, isOpen]);

  const activeRegionalAreas = useMemo(() => getActiveRegionalAreas(), []);

  const activeOutlets = useMemo(() => {
    const fromConfig = getActiveOutletNames();
    const fromData = Object.keys(allOutletsData || {});
    const combined = Array.from(new Set([...fromConfig, ...fromData]));
    return combined.filter(name => {
      const d = allOutletsData?.[name];
      return !d || !d.isDeleted;
    });
  }, [allOutletsData]);

  React.useEffect(() => {
    if (initialSelectedOutlet && activeOutlets.includes(initialSelectedOutlet)) {
      setSelectedOutlet(initialSelectedOutlet);
    } else if (activeOutlets.length > 0 && !activeOutlets.includes(selectedOutlet)) {
      setSelectedOutlet(activeOutlets[0]);
    }
  }, [initialSelectedOutlet, activeOutlets]);

  React.useEffect(() => {
    if (initialSelectedArea) {
      setSelectedArea(initialSelectedArea);
    }
  }, [initialSelectedArea]);

  // Generate full text based on scope and period
  const generatedReportText = useMemo(() => {
    if (reportScope === 'SELECTED') {
      const outlet = selectedOutlet || activeOutlets[0] || 'SH CIPETE';
      const area = getAreaForOutlet(outlet) || selectedArea || 'JAKARTA';
      return buildSingleOutletWaReport(
        outlet,
        selectedMonth,
        selectedYear,
        allOutletsData,
        globalData,
        1,
        reportPeriod,
        area
      );
    } else if (reportScope === 'AREA') {
      const area = selectedArea || 'JAKARTA';
      return buildAreaWaReport(
        area,
        selectedMonth,
        selectedYear,
        allOutletsData,
        globalData,
        reportPeriod
      );
    } else {
      return buildAllOutletsWaReport(
        selectedMonth,
        selectedYear,
        allOutletsData,
        globalData,
        activeOutlets,
        reportPeriod
      );
    }
  }, [reportScope, reportPeriod, selectedOutlet, selectedArea, selectedMonth, selectedYear, allOutletsData, globalData, activeOutlets]);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedReportText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = generatedReportText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
      showToast?.('Template WA Report berhasil disalin! Siap dikirim ke WhatsApp.', 'success');
    } catch (err) {
      showToast?.('Gagal menyalin teks otomatis. Silakan salin manual dari kotak teks.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-white/10 rounded-[2rem] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl shadow-lg shadow-emerald-950/50">
              <i className="fab fa-whatsapp"></i>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight flex items-center gap-2">
                <span>Template WA Report Regional</span>
                <span className="text-[10px] font-black not-italic bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {MONTHS[selectedMonth]} {selectedYear}
                </span>
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Rekapitulasi Outlet, Area & Seluruh Regional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/10 cursor-pointer"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Filter Controls: Scope & Period */}
        <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-white/5 space-y-3">
          
          {/* Row 1: Scope Selection (Outlet, Area, All) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cakupan:</span>
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setReportScope('SELECTED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    reportScope === 'SELECTED'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fas fa-store text-[10px]"></i>
                  <span>Outlet Terpilih</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportScope('AREA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    reportScope === 'AREA'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fas fa-map-marker-alt text-[10px]"></i>
                  <span>Area</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportScope('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    reportScope === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <i className="fas fa-layer-group text-[10px]"></i>
                  <span>Seluruh Outlet</span>
                </button>
              </div>
            </div>

            {/* Target Selectors */}
            {reportScope === 'SELECTED' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Outlet:</span>
                <select
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                  className="bg-slate-900 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-emerald-300 font-black text-xs outline-none uppercase cursor-pointer"
                >
                  {activeOutlets.map(oName => (
                    <option key={oName} value={oName} className="bg-slate-900 text-white">
                      {oName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reportScope === 'AREA' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pilih Area:</span>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-1.5 text-amber-300 font-black text-xs outline-none uppercase cursor-pointer"
                >
                  {Object.keys(activeRegionalAreas).map(aName => (
                    <option key={aName} value={aName} className="bg-slate-900 text-white">
                      {aName} ({activeRegionalAreas[aName]?.length || 0} Outlet)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Row 2: Period Selection (Week 1..4 & MTD) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Periode:</span>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
                {(['MTD', 'WEEK_1', 'WEEK_2', 'WEEK_3', 'WEEK_4'] as WaReportPeriod[]).map((p) => {
                  const labelMap: Record<WaReportPeriod, string> = {
                    'MTD': 'MTD',
                    'WEEK_1': 'Week 1',
                    'WEEK_2': 'Week 2',
                    'WEEK_3': 'Week 3',
                    'WEEK_4': 'Week 4'
                  };
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setReportPeriod(p)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        reportPeriod === p
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {labelMap[p]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes chip */}
            <div className="text-[9px] font-bold text-slate-400 flex items-center gap-2 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-white/5">
              <i className="fas fa-info-circle text-amber-400"></i>
              <span>Overtime dihitung Cut Off <strong>26 - 25</strong> | Laporan lain sesuai periode</span>
            </div>
          </div>
        </div>

        {/* Text Preview Box */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto max-h-[50vh] bg-slate-950/60 custom-scrollbar">
          <pre className="font-mono text-xs sm:text-sm text-emerald-100 whitespace-pre-wrap select-all bg-slate-950 border border-white/10 rounded-2xl p-4 sm:p-5 leading-relaxed selection:bg-emerald-500/30 selection:text-white">
            {generatedReportText}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-slate-950/90 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-bold text-slate-400">
            {reportScope === 'ALL' && (
              <span>Menampilkan rekapitulasi untuk <strong className="text-emerald-400">{activeOutlets.length} outlet</strong> ({reportPeriod})</span>
            )}
            {reportScope === 'AREA' && (
              <span>Menampilkan area <strong className="text-amber-400">{selectedArea}</strong> ({reportPeriod})</span>
            )}
            {reportScope === 'SELECTED' && (
              <span>Laporan outlet: <strong className="text-emerald-400">{selectedOutlet}</strong> ({reportPeriod})</span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleCopy}
              type="button"
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-xl cursor-pointer ${
                isCopied
                  ? 'bg-emerald-500 text-slate-950 border border-emerald-400'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 shadow-emerald-950/50 active:scale-95'
              }`}
            >
              <i className={`fas ${isCopied ? 'fa-check' : 'fa-copy'}`}></i>
              <span>{isCopied ? 'Tersalin ke Clipboard!' : 'Salin Teks WhatsApp'}</span>
            </button>

            <a
              href={`https://web.whatsapp.com/send?text=${encodeURIComponent(generatedReportText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white border border-white/10 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <i className="fab fa-whatsapp text-emerald-400"></i>
              <span>Buka WA Web</span>
            </a>

            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/10 font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default RegionalWaReportModal;
