import React, { useState } from 'react';

interface Props {
  featureName: string;
  onSync?: () => Promise<void> | void;
  subtext?: string;
  className?: string;
}

export const FeatureSubmitSyncButton: React.FC<Props> = ({
  featureName,
  onSync,
  subtext = 'Sinkronkan data ke server & update semua pengguna secara realtime seperti spreadsheet',
  className = ''
}) => {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success'>('idle');

  const handleClick = async () => {
    if (status === 'syncing') return;
    setStatus('syncing');
    try {
      if (onSync) {
        await onSync();
      }
      // Broadcast immediate priority sync event across app
      window.dispatchEvent(
        new CustomEvent('appSubmitSyncFeature', {
          detail: { featureName, timestamp: Date.now() }
        })
      );
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
      }, 3500);
    } catch (err) {
      console.error(`[SubmitSync] Error submitting ${featureName}:`, err);
      setStatus('idle');
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:p-5 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-950 to-indigo-950/40 border border-indigo-500/30 shadow-2xl ${className}`}>
      <div className="flex items-center gap-3 text-left w-full sm:w-auto">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
          <i className="fas fa-satellite-dish animate-pulse"></i>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Selesai Input {featureName}?
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Live Sync Spreadsheet
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
            {subtext}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'syncing'}
        className={`w-full sm:w-auto px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2.5 shadow-xl active:scale-95 cursor-pointer shrink-0 ${
          status === 'syncing'
            ? 'bg-indigo-700 text-white cursor-wait opacity-90'
            : status === 'success'
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400 animate-pulse'
            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/40 hover:shadow-emerald-500/25 border border-emerald-400/40'
        }`}
      >
        {status === 'syncing' ? (
          <>
            <i className="fas fa-spinner fa-spin text-sm"></i>
            <span>Menyinkronkan Data...</span>
          </>
        ) : status === 'success' ? (
          <>
            <i className="fas fa-check-double text-sm text-white"></i>
            <span>Tersimpan & Tersinkron!</span>
          </>
        ) : (
          <>
            <i className="fas fa-cloud-arrow-up text-sm"></i>
            <span>Submit & Sync Data</span>
          </>
        )}
      </button>
    </div>
  );
};

export default FeatureSubmitSyncButton;
