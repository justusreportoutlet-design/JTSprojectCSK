
import React, { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportToExcelWithImages } from '../lib/excelExport';
import { AppState, Outlet, QAData, GoogleReviewData, GSIRow, GuestComplaint } from '../types';
import PattyCashOpexRekapanModule from './PattyCashOpexRekapanModule';
import ThirdPartyGasModule from './ThirdPartyGasModule';
import LogisticsModule from './LogisticsModule';
import ReceivingSheetModule from './ReceivingSheetModule';
import { CogsModule } from './CogsModule';
import OutletPerformanceModule from './OutletPerformanceModule';
import WeeklyPerformanceModule from './WeeklyPerformanceModule';
import SummaryReportModule from './SummaryReportModule';
import PattyCashExpenseModule from './PattyCashExpenseModule';
import MainStoreKitchenModule from './MainStoreKitchenModule';
import CityLedgerModule from './CityLedgerModule';
import GuestSatisfactionModule from './GuestSatisfactionModule';
import ComplimentaryModule from './ComplimentaryModule';
import EnergyCostModule from './EnergyCostModule';
import RegionalSummaryDashboard from './RegionalSummaryDashboard';
import RegionalDailyRevenueTable from './RegionalDailyRevenueTable';
import RegionalWeeklyRevenueRecapTable from './RegionalWeeklyRevenueRecapTable';
import { RegionalRevenueContributionTable } from './RegionalRevenueContributionTable';
import { RegionalWeekdayWeekendRevenueTable } from './RegionalWeekdayWeekendRevenueTable';
import RegionalWeeklyOvertimeRecapTable from './RegionalWeeklyOvertimeRecapTable';
import RegionalQARecapTable from './RegionalQARecapTable';
import RegionalManpowerRecapTable from './RegionalManpowerRecapTable';
import RegionalGSIRecapTable from './RegionalGSIRecapTable';
import RegionalGoogleReviewRecapTable from './RegionalGoogleReviewRecapTable';
import { RegionalCommodityRecapTable } from './RegionalCommodityRecapTable';
import { RegionalPromoRecapTable } from './RegionalPromoRecapTable';
import { RegionalStrategiMenuRecapTable } from './RegionalStrategiMenuRecapTable';
import { RegionalCogsRecapTable } from './RegionalCogsRecapTable';
import RegionalVoidBillRecapTable from './RegionalVoidBillRecapTable';
import { buildAggregatedGlobalData } from '../lib/aggregators';
import { OutletConfig } from '../types';
import { OUTLETS, REGIONAL_AREAS, getAreaForOutlet, QA_PASSING_SCORES, OT_RATE, INITIAL_STATE, ORDER_SCHEDULES_BY_AREA, getOrderScheduleForOutlet, getStoredOtBudgetSettings, getActiveOutletNames, getActiveRegionalAreas, getActiveOutletConfigs } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import ShareActions from './ShareActions';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';

interface TabProps {
  data: Record<string, any>;
  selectedMonth: number;
  selectedYear: number;
  globalData: AppState;
  isPreviewMode?: boolean;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate?: (key: keyof AppState, value: any) => void;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
  selectedArea?: string;
  onSelectArea?: (area: string) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const getGoogleRatingAtMonth = (data: Record<string, any>, outletId: string, monthIdx: number, selectedYear: number) => {
  const outletData = data[outletId] || {};
  const mData = outletData[String(monthIdx)];
  
  const emptyStars = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
  if (!mData || !mData.dailyGoogleReview) return { rating: 0, count: 0, stars: emptyStars };

  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
  
  Object.values(mData.dailyGoogleReview).forEach((review: any) => {
    s1 += review.stars1 || 0;
    s2 += review.stars2 || 0;
    s3 += review.stars3 || 0;
    s4 += review.stars4 || 0;
    s5 += review.stars5 || 0;
  });

  const total = s1 + s2 + s3 + s4 + s5;
  const rating = total === 0 ? 0 : ((s1 * 1) + (s2 * 2) + (s3 * 3) + (s4 * 4) + (s5 * 5)) / total;
  return { rating, count: total, stars: { s1, s2, s3, s4, s5 } };
};

const ConsolidatedOverviewTab: React.FC<TabProps> = (props) => {
  return <RegionalSummaryDashboard {...props} />;
};

const RevenueTab: React.FC<TabProps> = ({ data, selectedMonth, selectedYear, isPreviewMode, showToast, selectedOutlet, selectedArea }) => {
  const [revenueSubTab, setRevenueSubTab] = useState<'MATRIX' | 'SUMMARY' | 'ALL'>('MATRIX');

  const displayedOutlets = useMemo(() => {
    const activeNames = Array.from(new Set([...getActiveOutletNames(), ...Object.keys(data || {})])).filter(o => !data?.[o]?.isDeleted);
    const activeAreas = getActiveRegionalAreas(activeNames);
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return activeNames.filter(o => o === selectedOutlet);
    }
    if (selectedArea && selectedArea !== 'ALL' && activeAreas[selectedArea]) {
      return activeAreas[selectedArea];
    }
    return activeNames;
  }, [selectedOutlet, selectedArea, data]);

  const areaGroups = useMemo(() => {
    const activeNames = Array.from(new Set([...getActiveOutletNames(), ...Object.keys(data || {})])).filter(o => !data?.[o]?.isDeleted);
    const activeAreas = getActiveRegionalAreas(activeNames);
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      const area = getAreaForOutlet(selectedOutlet);
      return [{ areaName: area, outlets: [selectedOutlet] }];
    }
    if (selectedArea && selectedArea !== 'ALL') {
      const list = activeAreas[selectedArea] || [];
      return [{ areaName: selectedArea, outlets: list }];
    }
    return areas.map(a => ({
      areaName: a,
      outlets: activeAreas[a] || []
    })).filter(g => g.outlets.length > 0);
  }, [selectedOutlet, selectedArea, data]);

  const revenueAggregation = useMemo(() => {
    const stats: Record<string, any> = {};
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(selectedYear, selectedMonth - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    displayedOutlets.forEach(outlet => {
      const outletMonths = (data && (data as any)[outlet]) || {};
      const currentMonth = outletMonths[String(selectedMonth)] || outletMonths[selectedMonth] || outletMonths.monthlyData?.[String(selectedMonth)] || {};
      const sales = currentMonth.sales || outletMonths.sales || currentMonth || { dailyRecording: {} };
      const dailyRec = sales.dailyRecording || currentMonth.dailyRecording || outletMonths.dailyRecording || {};
      const budget = (sales.monthlyBudgets || {})[monthStr] || sales.budgetRevenue || 0;
      
      let mtdRevenue = 0;
      Object.entries(dailyRec || {}).forEach(([date, d]: [string, any]) => {
        if (date.startsWith(monthStr)) {
          mtdRevenue += Number(d?.revenue) || 0;
        }
      });

      let lastMonthRevenue = 0;
      const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const lastMonthData = outletMonths[String(lastMonthIdx)] || {};
      const lastMonthSales = lastMonthData.lastMonthSales || lastMonthData.sales || { dailyRecording: {} };
      
      Object.entries(lastMonthSales.dailyRecording || {}).forEach(([date, d]: [string, any]) => {
        if (date.startsWith(lastMonthStr)) {
          lastMonthRevenue += d?.revenue || 0;
        }
      });

      const variance = mtdRevenue - budget;
      const lmVariance = mtdRevenue - lastMonthRevenue;

      // Staff Count
      const staffList = (data && (data as any)[outlet])?.staffList || [];
      const noOfEmployee = Array.isArray(staffList) ? staffList.filter((s: any) => s && (s.status === 'ACTIVE' || !s.status)).length : 0;

      stats[outlet] = {
        revenue: mtdRevenue,
        budget,
        variance,
        noOfEmployee,
        perfPercent: budget > 0 ? (mtdRevenue / budget) * 100 : 0,
        variancePercent: budget > 0 ? (variance / budget) * 100 : 0,
        lastMonthRevenue,
        lmVariance,
        lmVariancePercent: lastMonthRevenue > 0 ? (lmVariance / lastMonthRevenue) * 100 : 0,
        lastUpdated: (data && (data as any)[outlet])?._lastUpdated,
        googleReview: getGoogleRatingAtMonth(data, outlet, selectedMonth, selectedYear),
        qaScore: (() => {
          const outletMonths = (data && (data as any)[outlet]) || {};
          const mData = outletMonths[String(selectedMonth)] || {};
          const dailyQA = mData.dailyQA || {};
          let total = 0, count = 0;
          Object.entries(dailyQA).forEach(([date, qa]: [string, any]) => {
            if (date.startsWith(monthStr) && qa?.service) {
              const fields = [Number(qa.service.product), Number(qa.service.cleanliness), Number(qa.service.grooming)].filter(v => v > 0);
              const s = fields.length > 0 ? fields.reduce((a, b) => a + b, 0) / fields.length : 0;
              if (s > 0) {
                total += s;
                count++;
              }
            }
          });
          
          if (count > 0) return total / count;
          
          // Fallback to most recent previous month
          for (let m = selectedMonth - 1; m >= 0; m--) {
            const prevMData = outletMonths[String(m)] || {};
            const prevDailyQA = prevMData.dailyQA || {};
            let prevTotal = 0, prevCount = 0;
            const pmStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
            Object.entries(prevDailyQA).forEach(([date, qa]: [string, any]) => {
              if (date.startsWith(pmStr) && qa?.service) {
                const fields = [Number(qa.service.product), Number(qa.service.cleanliness), Number(qa.service.grooming)].filter(v => v > 0);
                const s = fields.length > 0 ? fields.reduce((a, b) => a + b, 0) / fields.length : 0;
                if (s > 0) {
                  prevTotal += s;
                  prevCount++;
                }
              }
            });
            if (prevCount > 0) return prevTotal / prevCount;
          }
          return 0;
        })(),
        lastMonthQAScore: (() => {
          const outletMonths = (data && (data as any)[outlet]) || {};
          const lastMonthDate = new Date(selectedYear, selectedMonth - 1, 1);
          const lmStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
          const lmIdx = lastMonthDate.getMonth();
          const lmData = outletMonths[String(lmIdx)] || {};
          const dailyQA = lmData.dailyQA || {};
          let total = 0, count = 0;
          Object.entries(dailyQA).forEach(([date, qa]: [string, any]) => {
            if (date.startsWith(lmStr) && qa?.service) {
              const fields = [Number(qa.service.product), Number(qa.service.cleanliness), Number(qa.service.grooming)].filter(v => v > 0);
              const s = fields.length > 0 ? fields.reduce((a, b) => a + b, 0) / fields.length : 0;
              if (s > 0) {
                total += s;
                count++;
              }
            }
          });
          return count > 0 ? total / count : 0;
        })(),
        gsiScore: (() => {
          const outletMonths = (data && (data as any)[outlet]) || {};
          const mData = outletMonths[String(selectedMonth)] || {};
          const dailyGSI: Record<string, GSIRow[]> = mData.dailyGSI || {};
          let totalPoints = 0;
          let maxPoints = 0;
          Object.entries(dailyGSI).forEach(([date, rows]) => {
            if (date.startsWith(monthStr) && Array.isArray(rows)) {
              rows.forEach(r => {
                const excellent = r?.excellent || 0;
                const good = r?.good || 0;
                const average = r?.average || 0;
                const poor = r?.poor || 0;
                const tot = excellent + good + average + poor;
                if (tot > 0) {
                  totalPoints += (excellent * 4) + (good * 3) + (average * 2) + (poor * 1);
                  maxPoints += tot * 4;
                }
              });
            }
          });
          return maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;
        })()
      };
    });
    return stats;
  }, [data, selectedMonth, selectedYear]);

  const excelData = useMemo(() => {
    return displayedOutlets.map((outlet, idx) => {
      const r = revenueAggregation[outlet] || {
        noOfEmployee: 0,
        revenue: 0,
        budget: 0,
        perfPercent: 0,
        variance: 0,
        variancePercent: 0,
        qaScore: 0,
        lastMonthRevenue: 0,
        lmVariance: 0,
        lmVariancePercent: 0,
        lastMonthQAScore: 0
      };
      return {
        'No': idx + 1,
        'Outlet Name': outlet,
        'No of Employee': r.noOfEmployee || 0,
        'MTD Revenue': r.revenue || 0,
        'Budget': r.budget || 0,
        'Perf%': (r.perfPercent || 0).toFixed(1) + '%',
        'Variance': r.variance || 0,
        'Variance%': (r.variancePercent || 0).toFixed(1) + '%',
        'QA Score': (r.qaScore || 0).toFixed(2) + '%',
        'Last Month Revenue': r.lastMonthRevenue || 0,
        'LM Variance': r.lmVariance || 0,
        'LM Variance%': (r.lmVariancePercent || 0).toFixed(1) + '%',
        'LM QA Score': (r.lastMonthQAScore || 0).toFixed(2) + '%'
      };
    });
  }, [revenueAggregation, displayedOutlets]);

  const reportId = `revenue-report-${selectedMonth}-${selectedYear}`;

  const chartData = useMemo(() => {
    return displayedOutlets.map(outlet => {
      const r = revenueAggregation[outlet] || { revenue: 0, budget: 0, googleReview: { rating: 0 } };
      return {
        name: outlet.split(' ')[1] || outlet,
        revenue: (r.revenue || 0) / 1000000,
        budget: (r.budget || 0) / 1000000,
        rating: r.googleReview || { rating: 0 }
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [revenueAggregation, displayedOutlets]);

  const monthlyGRTrend = useMemo(() => {
    return MONTHS.map((m, i) => {
      let sum = 0;
      let count = 0;
      displayedOutlets.forEach(outlet => {
        const result = getGoogleRatingAtMonth(data, outlet, i, selectedYear);
        if (result && result.rating > 0) {
          sum += result.rating;
          count++;
        }
      });
      return { 
        name: m.substring(0, 3), 
        avgRating: count > 0 ? sum / count : 0 
      };
    });
  }, [data, selectedYear, displayedOutlets]);

  const handleCopyRevenueWA = () => {
    const monthName = MONTHS[selectedMonth];
    let template = `*REGIONAL REVENUE REPORT - ${monthName} ${selectedYear}*\n\n`;
    
    let totalMTD = 0;
    let totalBudget = 0;

    areaGroups.forEach(group => {
      template += `📍 *AREA: ${group.areaName}*\n`;
      let areaMTD = 0;
      let areaBud = 0;

      group.outlets.forEach(outlet => {
        const r = revenueAggregation[outlet] || { revenue: 0, budget: 0, perfPercent: 0 };
        template += `*${outlet}*\n`;
        template += `- MTD Revenue: Rp ${(r.revenue || 0).toLocaleString('de-DE')}\n`;
        template += `- Budget: Rp ${(r.budget || 0).toLocaleString('de-DE')}\n`;
        template += `- Perf: ${(r.perfPercent || 0).toFixed(1)}%\n\n`;
        
        areaMTD += r.revenue || 0;
        areaBud += r.budget || 0;
        totalMTD += r.revenue || 0;
        totalBudget += r.budget || 0;
      });

      const areaPerf = areaBud > 0 ? (areaMTD / areaBud) * 100 : 0;
      template += `*SUBTOTAL AREA ${group.areaName}*: Rp ${areaMTD.toLocaleString('de-DE')} (Perf: ${areaPerf.toFixed(1)}%)\n`;
      template += `------------------------------------\n\n`;
    });

    const totalPerf = totalBudget > 0 ? (totalMTD / totalBudget) * 100 : 0;
    template += `🏆 *GRAND TOTAL REGIONAL*\n`;
    template += `* Revenue: Rp ${totalMTD.toLocaleString('de-DE')}\n`;
    template += `* Budget: Rp ${totalBudget.toLocaleString('de-DE')}\n`;
    template += `* Perf: ${totalPerf.toFixed(1)}%\n\n`;
    template += `*Best Regards & Thank you*`;

    navigator.clipboard.writeText(template).then(() => {
      showToast?.(`Regional Revenue Report berhasil disalin!`, 'success');
    });
  };

  return (
    <section className="space-y-6">
      {/* Top View Mode Switcher & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2.5 rounded-2xl border border-white/10 no-print shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setRevenueSubTab('MATRIX')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              revenueSubTab === 'MATRIX'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/40'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <i className="fas fa-table text-xs"></i>
            <span>Matriks Daily Revenue (Lunch / Dinner / Total)</span>
          </button>

          <button
            onClick={() => setRevenueSubTab('SUMMARY')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              revenueSubTab === 'SUMMARY'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/40'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <i className="fas fa-chart-line text-xs"></i>
            <span>Ringkasan Kinerja MTD & Target</span>
          </button>

          <button
            onClick={() => setRevenueSubTab('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              revenueSubTab === 'ALL'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 border border-amber-400/40'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <i className="fas fa-columns text-xs"></i>
            <span>Semua Tampilan</span>
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <ShareActions 
            targetId={reportId} 
            title={`Revenue Performance Report - ${MONTHS[selectedMonth]} ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
          <button 
            onClick={handleCopyRevenueWA}
            className="px-4 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-md cursor-pointer border border-emerald-500/30"
          >
            <i className="fab fa-whatsapp"></i> Copy Summary
          </button>
        </div>
      </div>

      {/* SECTION 1: MATRIKS DAILY REVENUE (LUNCH / DINNER / TOTAL) */}
      {(revenueSubTab === 'MATRIX' || revenueSubTab === 'ALL') && (
        <RegionalDailyRevenueTable
          data={data}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          displayedOutlets={displayedOutlets}
          showToast={showToast}
          isPreviewMode={isPreviewMode}
          selectedArea={selectedArea}
          selectedOutlet={selectedOutlet}
        />
      )}

      {/* SECTION 2: CHARTS & MTD SUMMARY TABLE */}
      {(revenueSubTab === 'SUMMARY' || revenueSubTab === 'ALL') && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card bg-slate-950/40 p-6 border-white/5">
          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Revenue vs Budget (M IDR)</h5>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" fontSize={8} stroke="#64748b" />
                <YAxis fontSize={8} stroke="#64748b" tickFormatter={(v) => `${v}M`} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-slate-900, #0f172a)', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="budget" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card bg-slate-950/40 p-6 border-white/5">
          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Regional Google Review Trend (Rating)</h5>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyGRTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" fontSize={8} stroke="#64748b" />
                <YAxis domain={[3, 5]} fontSize={8} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                <Line 
                  type="monotone" 
                  dataKey="avgRating" 
                  stroke="#fbbf24" 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#fbbf24', strokeWidth: 2, stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div id={reportId} className="space-y-0">
        <div className="bg-slate-900 p-4 border-x border-t border-slate-800 rounded-t-3xl flex justify-between items-center">
         <h4 className="text-xs font-black text-white uppercase tracking-[0.3em]">
           REGIONAL REPORT - REVENUE REPORT
         </h4>
         <div className="flex gap-2">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Achieved</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-red-500"></div>
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Below Budget</span>
           </div>
         </div>
      </div>
      <div className="overflow-x-auto glass-card bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
        <table className={`w-full text-left border-collapse ${isPreviewMode ? 'min-w-[800px]' : 'min-w-[1100px]'}`}>
              <thead>
                <tr className="bg-slate-950 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                  <th className="p-2 border-r border-white/10" colSpan={3}>OUTLET INFO</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/20" colSpan={7}>{MONTHS[selectedMonth]?.toUpperCase()} (CURRENT)</th>
                  <th className="p-2 border-r border-white/10 text-center bg-slate-800/20" colSpan={5}>{MONTHS[selectedMonth === 0 ? 11 : selectedMonth - 1]?.toUpperCase()} (LAST MONTH)</th>
                </tr>
                <tr className="bg-slate-900 text-[9px] font-black text-white uppercase tracking-tight border-b border-white/10">
                  <th className="p-2 border-r border-white/10 text-center w-8">NO</th>
                  <th className="p-2 border-r border-white/10 min-w-[110px]">OUTLET NAME</th>
                  <th className="p-2 border-r border-white/10 text-center text-emerald-400">EMPLOYEE</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">MTD REVENUE</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">BUDGET</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">PERF%</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">VAR</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">%</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">GR</th>
                  <th className="p-2 border-r border-white/10 text-center bg-blue-900/40">QA</th>
                  <th className="p-2 border-r border-white/10 text-center bg-slate-800/40">REV</th>
                  <th className="p-2 border-r border-white/10 text-center bg-slate-800/40">VAR</th>
                  <th className="p-2 border-r border-white/10 text-center bg-slate-800/40">%</th>
                  <th className="p-2 border-r border-white/10 text-center bg-slate-800/40">L.QA</th>
                  <th className="p-2 text-center bg-slate-800/40">L.PERF</th>
                </tr>
              </thead>
          <tbody className="divide-y divide-white/5">
            {areaGroups.map((group, groupIdx) => {
              // Calculate Area Subtotals
              const areaRevenueTotal = group.outlets.reduce((sum, o) => sum + (revenueAggregation[o]?.revenue || 0), 0);
              const areaBudgetTotal = group.outlets.reduce((sum, o) => sum + (revenueAggregation[o]?.budget || 0), 0);
              const areaVarianceTotal = areaRevenueTotal - areaBudgetTotal;
              const areaLMRevenueTotal = group.outlets.reduce((sum, o) => sum + (revenueAggregation[o]?.lastMonthRevenue || 0), 0);
              const areaLMVarTotal = areaRevenueTotal - areaLMRevenueTotal;
              const areaStaffTotal = group.outlets.reduce((sum, o) => sum + (revenueAggregation[o]?.noOfEmployee || 0), 0);
              const areaPerfPercent = areaBudgetTotal > 0 ? (areaRevenueTotal / areaBudgetTotal) * 100 : 0;
              const areaVarPercent = areaBudgetTotal > 0 ? (areaVarianceTotal / areaBudgetTotal) * 100 : 0;
              const areaLMVarPercent = areaLMRevenueTotal > 0 ? (areaLMVarTotal / areaLMRevenueTotal) * 100 : 0;

              const areaRatings = group.outlets.map(o => revenueAggregation[o]?.googleReview?.rating || 0).filter(v => v > 0);
              const areaGRAvg = areaRatings.length > 0 ? areaRatings.reduce((a, b) => a + b, 0) / areaRatings.length : 0;

              const areaQAScores = group.outlets.map(o => revenueAggregation[o]?.qaScore || 0).filter(v => v > 0);
              const areaQAAvg = areaQAScores.length > 0 ? areaQAScores.reduce((a, b) => a + b, 0) / areaQAScores.length : 0;

              return (
                <React.Fragment key={group.areaName}>
                  {/* AREA GROUP HEADER */}
                  <tr className="bg-slate-950/90 border-t-2 border-indigo-500/30 border-b border-white/10">
                    <td colSpan={15} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                          <span className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">
                            AREA: {group.areaName}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-white/5">
                            {group.outlets.length} Outlets
                          </span>
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                          SUBTOTAL {group.areaName}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* OUTLET ROWS IN AREA */}
                  {group.outlets.map((outlet, idx) => {
                    const r = revenueAggregation[outlet] || {
                      revenue: 0,
                      budget: 0,
                      variance: 0,
                      noOfEmployee: 0,
                      perfPercent: 0,
                      variancePercent: 0,
                      lastMonthRevenue: 0,
                      lmVariance: 0,
                      lmVariancePercent: 0,
                      lastUpdated: null,
                      googleReview: { rating: 0 },
                      qaScore: 0,
                      lastMonthQAScore: 0
                    };
                    const isEven = idx % 2 === 0;
                    return (
                      <tr key={outlet} className={`transition-colors ${isEven ? 'bg-slate-900/50' : 'bg-slate-800/30'} hover:bg-indigo-600/10 ${isPreviewMode ? 'text-[9px]' : 'text-[11px]'} font-bold`}>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-slate-500`}>{idx + 1}</td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 font-bold uppercase text-white`}>
                          <div className="flex flex-col">
                            <span className={`text-white ${isPreviewMode ? 'text-[8px]' : 'text-[10px]'}`}>{outlet.split(' ')[0]}</span>
                            <span className={`text-indigo-400 font-black ${isPreviewMode ? 'text-[6px]' : 'text-[8px]'}`}>{outlet.split(' ').slice(1).join(' ')}</span>
                            {r.lastUpdated ? (
                              <span className={`font-black text-slate-500 tracking-tighter mt-1 ${isPreviewMode ? 'text-[5px]' : 'text-[7px]'}`}>
                                 SYNC: {new Date(r.lastUpdated).toLocaleDateString([], { month: '2-digit', day: '2-digit' })} {new Date(r.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className={`font-black text-rose-500/50 tracking-tighter mt-1 ${isPreviewMode ? 'text-[5px]' : 'text-[7px]'}`}>NO SYNC</span>
                            )}
                          </div>
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-emerald-400 tracking-widest`}>{r.noOfEmployee}</td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-right bg-blue-900/20 font-black text-blue-400`}>Rp {r.revenue.toLocaleString('id-ID')}</td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-right font-bold text-slate-500 italic`}>Rp {r.budget.toLocaleString('id-ID')}</td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-white ${r.perfPercent >= 100 ? 'bg-emerald-600/80' : 'bg-rose-600/80'}`}>
                          <div className={`flex items-center justify-center gap-1 ${isPreviewMode ? 'text-[9px]' : 'text-xs'}`}>
                            <i className={`fas ${r.perfPercent >= 100 ? 'fa-caret-up' : 'fa-caret-down'}`}></i>
                            {r.perfPercent.toFixed(1)}%
                          </div>
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-right font-black ${r.variance >= 0 ? 'text-emerald-400 bg-emerald-900/10' : 'text-rose-400 bg-rose-900/10'}`}>
                          {Math.round(r.variance).toLocaleString('id-ID')}
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black ${r.variancePercent >= 0 ? 'text-emerald-400 bg-emerald-900/10' : 'text-rose-400 bg-rose-900/10'}`}>
                          {r.variancePercent.toFixed(1)}%
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-yellow-500 bg-yellow-500/5`}>
                          {r.googleReview.rating > 0 ? r.googleReview.rating.toFixed(2).replace('.', ',') : '-'}
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-indigo-400 bg-indigo-500/5`}>
                          {r.qaScore > 0 ? r.qaScore.toFixed(1) + '%' : '-'}
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-right bg-slate-800/40 font-black text-slate-400`}>Rp {r.lastMonthRevenue.toLocaleString('id-ID')}</td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-right font-black ${r.lmVariance >= 0 ? 'text-emerald-400 bg-slate-800/20' : 'text-rose-400 bg-slate-800/20'}`}>
                          {Math.round(r.lmVariance).toLocaleString('id-ID')}
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black ${r.lmVariancePercent >= 0 ? 'text-emerald-400 bg-slate-800/20' : 'text-rose-400 bg-slate-800/20'}`}>
                          {r.lmVariancePercent.toFixed(1)}%
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center font-black text-slate-500 bg-slate-800/20`}>
                          {r.lastMonthQAScore > 0 ? r.lastMonthQAScore.toFixed(1) + '%' : '-'}
                        </td>
                        <td className={`${isPreviewMode ? 'p-1' : 'p-2'} text-center font-black ${r.perfPercent >= 100 ? 'bg-emerald-900/20 text-emerald-400' : 'bg-rose-900/20 text-rose-400'}`}>
                          {r.perfPercent.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}

                  {/* AREA SUBTOTAL ROW */}
                  <tr className="bg-indigo-950/40 text-indigo-200 text-[10px] font-black border-b-2 border-white/10">
                    <td className="p-2 border-r border-white/10 text-center font-black text-indigo-400">Σ</td>
                    <td className="p-2 border-r border-white/10 uppercase tracking-wider text-indigo-300">TOTAL AREA {group.areaName}</td>
                    <td className="p-2 border-r border-white/10 text-center text-emerald-400">{areaStaffTotal}</td>
                    <td className="p-2 border-r border-white/10 text-right text-emerald-400 tabular-nums">Rp {areaRevenueTotal.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-right text-slate-400 tabular-nums">Rp {areaBudgetTotal.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-center text-white bg-indigo-600/30">
                      {areaPerfPercent.toFixed(1)}%
                    </td>
                    <td className="p-2 border-r border-white/10 text-right tabular-nums text-emerald-400">
                      {Math.round(areaVarianceTotal).toLocaleString('id-ID')}
                    </td>
                    <td className="p-2 border-r border-white/10 text-center font-black">
                      {areaVarPercent.toFixed(1)}%
                    </td>
                    <td className="p-2 border-r border-white/10 text-center text-yellow-500">
                      {areaGRAvg > 0 ? areaGRAvg.toFixed(2) : '-'}
                    </td>
                    <td className="p-2 border-r border-white/10 text-center text-indigo-400">
                      {areaQAAvg > 0 ? areaQAAvg.toFixed(1) + '%' : '-'}
                    </td>
                    <td className="p-2 border-r border-white/10 text-right text-slate-400 tabular-nums">Rp {areaLMRevenueTotal.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-right text-slate-400 tabular-nums">{Math.round(areaLMVarTotal).toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-center font-black">
                      {areaLMVarPercent.toFixed(1)}%
                    </td>
                    <td className="p-2 border-r border-white/10 text-center text-slate-500">-</td>
                    <td className="p-2 text-center text-indigo-400">
                      {areaPerfPercent.toFixed(1)}%
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-white/20">
            <tr className="bg-slate-950 font-black text-white text-[10px] uppercase">
              <td className="p-3 border-r border-white/10 text-center">Σ</td>
              <td className="p-3 border-r border-white/10">GRAND TOTAL REGIONAL</td>
              <td className="p-3 border-r border-white/10 text-center text-emerald-400">{(Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.noOfEmployee || 0), 0)}</td>
              <td className="p-3 border-r border-white/10 text-right text-emerald-400 tabular-nums">Rp {(Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.revenue || 0), 0).toLocaleString('id-ID')}</td>
              <td className="p-3 border-r border-white/10 text-right text-slate-400 tabular-nums">Rp {(Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.budget || 0), 0).toLocaleString('id-ID')}</td>
              <td className="p-3 border-r border-white/10 text-center text-white bg-indigo-600/20">
                {(() => {
                  const totRev = (Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.revenue || 0), 0);
                  const totBud = (Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.budget || 0), 0);
                  return totBud > 0 ? (totRev / totBud * 100).toFixed(1) : '0';
                })()}%
              </td>
              <td className="p-3 border-r border-white/10 text-right tabular-nums">
                {Math.round((Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.variance || 0), 0)).toLocaleString('id-ID')}
              </td>
              <td className="p-3 border-r border-white/10 text-center font-black">
                {Math.round((Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.variancePercent || 0), 0) / (Object.values(revenueAggregation).length || 1)).toFixed(1)}%
              </td>
              <td className="p-3 border-r border-white/10 text-center font-black text-yellow-500">
                {(() => {
                  const ratings = (Object.values(revenueAggregation) as any[]).map(r => r.googleReview.rating).filter(v => v > 0);
                  return ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : '-';
                })()}
              </td>
              <td className="p-3 border-r border-white/10 text-center font-black text-indigo-400">
                {(() => {
                  const scores = (Object.values(revenueAggregation) as any[]).map(r => r.qaScore).filter(v => v > 0);
                  return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) + '%' : '-';
                })()}
              </td>
              <td className="p-3 border-r border-white/10 text-right text-slate-400 tabular-nums">Rp {(Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.lastMonthRevenue || 0), 0).toLocaleString('id-ID')}</td>
              <td className="p-3 border-r border-white/10 text-right tabular-nums">
                {Math.round((Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.lmVariance || 0), 0)).toLocaleString('id-ID')}
              </td>
              <td className="p-3 border-r border-white/10 text-center font-black">
                {Math.round((Object.values(revenueAggregation) as any[]).reduce((acc: number, r: any) => acc + (r.lmVariancePercent || 0), 0) / (Object.values(revenueAggregation).length || 1)).toFixed(1)}%
              </td>
              <td className="p-3 border-r border-white/10 text-center font-black text-slate-500">
                {(() => {
                  const scores = (Object.values(revenueAggregation) as any[]).map(r => r.lastMonthQAScore).filter(v => v > 0);
                  return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) + '%' : '-';
                })()}
              </td>
              <td className="p-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
     </div>
        </div>
      )}
    </section>
  );
};

const YTDReportTab: React.FC<TabProps> = ({ data, selectedYear, isPreviewMode, showToast, selectedOutlet }) => {
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const ytdData = useMemo(() => {
    return displayedOutlets.map(outlet => {
      const outletMonths = data[outlet] || {};
      const monthlyStats = MONTHS.map((_, i) => {
        const monthData = outletMonths[String(i)] || {};
        const sales = monthData.sales || { dailyRecording: {} };
        const monthPrefix = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
        let revenue = 0;
        Object.entries(sales.dailyRecording || {}).forEach(([date, d]: [string, any]) => {
          if (date.startsWith(monthPrefix)) {
            revenue += d.revenue || 0;
          }
        });
        return revenue;
      });
      return { outlet, monthlyStats, total: monthlyStats.reduce((a, b) => a + b, 0) };
    });
  }, [data, selectedYear, displayedOutlets]);
  const excelData = useMemo(() => {
    return ytdData.map(d => {
      const row: any = { 'Outlet': d.outlet };
      MONTHS.forEach((m, i) => {
        row[m] = d.monthlyStats[i];
      });
      row['Annual Total'] = d.total;
      return row;
    });
  }, [ytdData]);

  const reportId = `ytd-report-${selectedYear}`;

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center no-print">
        <ShareActions 
          targetId={reportId} 
          title={`YTD Revenue Summary - ${selectedYear}`}
          excelData={excelData}
          showToast={showToast}
        />
      </div>

      <div id={reportId} className="space-y-4">
        <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
          <i className="fas fa-calendar-alt text-blue-500"></i> YTD Revenue Summary ({selectedYear})
        </h4>
        <div className="overflow-x-auto glass-card bg-slate-950 border border-white/10 rounded-3xl shadow-2xl">
          <table className={`w-full text-left border-collapse ${isPreviewMode ? '' : 'min-w-[1200px]'}`}>
            <thead>
              <tr className="bg-slate-900 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                <th className="p-4 sticky left-0 bg-slate-900 z-10 min-w-[140px] border-r border-white/10">Outlet</th>
                {MONTHS.map(m => <th key={m} className="p-4 text-center border-r border-white/10">{m.substring(0, 3)}</th>)}
                <th className="p-4 text-right">Annual Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ytdData.map(d => (
                <tr key={d.outlet} className={`${isPreviewMode ? 'text-[8px]' : 'text-[10px]'} font-black hover:bg-white/5 transition-all text-slate-300`}>
                  <td className={`${isPreviewMode ? 'p-2' : 'p-4'} text-white uppercase sticky left-0 bg-slate-950/95 z-10 border-r border-white/10 uppercase`}>
                    <div className="flex flex-col">
                      <span className={`text-white ${isPreviewMode ? 'text-[8px]' : 'text-[10px]'}`}>{d.outlet.split(' ')[0]}</span>
                      <span className={`text-blue-400 font-black ${isPreviewMode ? 'text-[6px]' : 'text-[8px]'}`}>{d.outlet.split(' ').slice(1).join(' ')}</span>
                    </div>
                  </td>
                  {d.monthlyStats.map((rev, i) => (
                    <td key={i} className={`${isPreviewMode ? 'p-2' : 'p-4'} text-center border-r border-white/10 text-slate-400`}>
                      {rev > 0 ? `Rp ${rev.toLocaleString('id-ID')}` : '-'}
                    </td>
                  ))}
                  <td className={`${isPreviewMode ? 'p-2' : 'p-4'} text-right text-emerald-400 font-black bg-emerald-900/10`}>Rp {d.total.toLocaleString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const QAAuditTab: React.FC<TabProps> = ({ data, selectedYear, isPreviewMode, showToast, selectedOutlet }) => {
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const qaStatsTrend = useMemo(() => {
    return displayedOutlets.map(outlet => {
      const outletMonths = data[outlet] || {};
      const monthlyScores = MONTHS.map((_, mIdx) => {
        const mData = outletMonths[String(mIdx)] || {};
        const dailyQA: Record<string, any> = mData.dailyQA || {};
        const monthPrefix = `${selectedYear}-${String(mIdx + 1).padStart(2, '0')}`;
        let total = 0;
        let count = 0;

        Object.entries(dailyQA).forEach(([date, qa]: [string, any]) => {
          if (date.startsWith(monthPrefix) && qa?.service) {
            const fields = [Number(qa.service.product), Number(qa.service.cleanliness), Number(qa.service.grooming)].filter(v => v > 0);
            const s = fields.length > 0 ? fields.reduce((a, b) => a + b, 0) / fields.length : 0;
            if (s > 0) {
              total += s;
              count++;
            }
          }
        });
        return count > 0 ? total / count : 0;
      });

      const today = new Date();
      const currentMonthIdx = today.getMonth();
      const mtdResult = monthlyScores[currentMonthIdx] || 0;
      const lastMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
      const lastMonthResult = monthlyScores[lastMonthIdx] || 0;
      
      const target = 95.00; // Service target 95%
      const variance = mtdResult > 0 ? mtdResult - target : 0;
      const lmVariance = (mtdResult > 0 && lastMonthResult > 0) ? mtdResult - lastMonthResult : 0;

      return {
        outlet,
        monthlyScores,
        mtdResult,
        lastMonthResult,
        target,
        variance,
        lmVariance
      };
    });
  }, [data, selectedYear, displayedOutlets]);

  const excelData = useMemo(() => {
    return qaStatsTrend.map((s, idx) => {
      const row: any = {
        'No': idx + 1,
        'Outlet': s.outlet,
        'Target': s.target.toFixed(2) + '%',
        'This Month (MTD)': s.mtdResult > 0 ? s.mtdResult.toFixed(2) + '%' : '-',
        'Last Month': s.lastMonthResult > 0 ? s.lastMonthResult.toFixed(2) + '%' : '-',
      };
      MONTHS.forEach((m, i) => {
        row[m] = s.monthlyScores[i] > 0 ? s.monthlyScores[i].toFixed(2) + '%' : '-';
      });
      return row;
    });
  }, [qaStatsTrend]);

  const reportId = `qa-audit-regional-service-${selectedYear}`;

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center no-print">
        <div className="flex gap-2">
          <ShareActions 
            targetId={reportId} 
            title={`QA Audit Regional Service Summary - ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
        </div>
      </div>

      <div id={reportId} className="space-y-4">
        <div className="bg-slate-900 p-6 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <i className="fas fa-check-double text-lg"></i>
            </div>
            <div>
              <h4 className="text-xl font-black text-white uppercase italic tracking-tighter">QA Audit Regional Service</h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Yearly Performance Trend ({selectedYear})</p>
            </div>
            <div className="ml-auto flex items-center gap-4">
               <div className="text-right">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Division Target</p>
                 <p className="text-lg font-black text-indigo-400 tracking-tighter">95.00%</p>
               </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1500px]">
              <thead>
                <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 italic">
                  <th className="p-3 border-r border-white/10 text-center w-8">NO</th>
                  <th className="p-3 border-r border-white/10 min-w-[150px] sticky left-0 bg-slate-950 z-20">OUTLET</th>
                  <th className="p-3 border-r border-white/10 text-center text-indigo-400 bg-indigo-500/5">TARGET</th>
                  <th className="p-3 border-r border-white/10 text-center bg-indigo-600/10 text-white">THIS MONTH</th>
                  <th className="p-3 border-r border-white/10 text-center bg-indigo-600/10 text-white">LAST MONTH</th>
                  {MONTHS.map(m => (
                    <th key={m} className="p-3 border-r border-white/10 text-center">{m.substring(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {qaStatsTrend.map((s, idx) => (
                  <tr key={s.outlet} className="text-xs font-bold text-slate-300 hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 border-r border-white/10 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-3 border-r border-white/10 font-black uppercase text-white sticky left-0 bg-slate-900/95 z-10">
                      <div className="flex flex-col">
                        <span className="text-[10px]">{s.outlet.split(' ')[0]}</span>
                        <span className="text-indigo-400 text-[8px]">{s.outlet.split(' ').slice(1).join(' ')}</span>
                      </div>
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-black text-indigo-400 bg-indigo-500/5">{s.target.toFixed(2)}%</td>
                    <td className="p-3 border-r border-white/10 text-center font-black bg-indigo-600/5">
                      {s.mtdResult > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-white text-[11px]">{s.mtdResult.toFixed(2)}%</span>
                          <span className={`text-[8px] ${s.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.variance >= 0 ? '+' : ''}{s.variance.toFixed(2)}% vs Target
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-black bg-indigo-600/5">
                      {s.lastMonthResult > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-[10px]">{s.lastMonthResult.toFixed(2)}%</span>
                          {s.mtdResult > 0 && (
                            <span className={`text-[8px] ${s.lmVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {s.lmVariance >= 0 ? '+' : ''}{s.lmVariance.toFixed(2)}% MoM
                            </span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    {s.monthlyScores.map((score, mIdx) => (
                      <td key={mIdx} className={`p-3 border-r border-white/10 text-center ${score > 0 ? 'text-slate-200' : 'text-slate-700 opacity-30 italic'}`}>
                        {score > 0 ? score.toFixed(2) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

const AuditServiceTab: React.FC<TabProps> = ({ globalData, selectedMonth, selectedYear, selectedOutlet }) => {
  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const auditData = useMemo(() => {
    const allAudits: any[] = [];
    Object.values(globalData.dailyExternalAudit || {}).forEach((list: any) => {
      list.forEach((item: any) => {
        if (item.department === 'SERVICE' && item.date.startsWith(monthStr)) {
          if (!selectedOutlet || selectedOutlet === 'ALL' || item.outlet === selectedOutlet) {
            allAudits.push(item);
          }
        }
      });
    });
    return allAudits.sort((a, b) => b.date.localeCompare(a.date));
  }, [globalData.dailyExternalAudit, monthStr, selectedOutlet]);

  const handleExportExcel = async () => {
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'Findings', key: 'findings', width: 40 },
      { header: 'Taken Action', key: 'takenAction', width: 40 },
      { header: 'PIC', key: 'pic', width: 15 },
      { header: 'Dokumentasi', key: 'documentationUrls', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    const data = auditData.map((a, idx) => ({
      no: idx + 1,
      date: a.date,
      outlet: a.outlet,
      findings: a.findings,
      takenAction: a.takenAction,
      pic: a.pic,
      documentationUrls: a.documentationUrls || [],
      status: a.status
    }));

    await exportToExcelWithImages(
      `EXTERNAL AUDIT SERVICE - ${MONTHS[selectedMonth]} ${selectedYear}`,
      columns,
      data,
      [{ columnKey: 'documentationUrls', type: 'urls' }]
    );
  };

  return (
    <div className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h4 className="text-xl font-black text-white uppercase italic">External Audit - Service</h4>
          <button 
            onClick={handleExportExcel}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
        <div className="px-4 py-1.5 bg-teal-500/10 rounded-full border border-teal-500/20 text-[10px] font-black text-teal-400 uppercase tracking-widest">
          {auditData.length} Audits Found
        </div>
      </div>
      <div className="overflow-x-auto p-6">
        <table className="w-full text-left border-collapse min-w-[1200px]">
           <thead>
             <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 italic">
               <th className="p-4 border-r border-white/10 text-center align-middle w-16">NO</th>
               <th className="p-4 border-r border-white/10 text-center align-middle w-32 whitespace-nowrap">DATE</th>
               <th className="p-4 border-r border-white/10 text-center align-middle w-48">OUTLET</th>
               <th className="p-4 border-r border-white/10 text-center align-middle w-[25%]">EXTERNAL AUDIT findings</th>
               <th className="p-4 border-r border-white/10 text-center align-middle w-[25%]">TAKEN ACTION</th>
               <th className="p-4 border-r border-white/10 text-center align-middle">PIC</th>
               <th className="p-4 border-r border-white/10 text-center align-middle">DOKUMENTASI</th>
               <th className="p-4 text-center align-middle">STATUS</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-white/5">
             {displayedOutlets.map(outlet => {
               const outletAudits = auditData.filter(a => a.outlet === outlet);
               if (outletAudits.length === 0) return null;
               return (
                 <React.Fragment key={outlet}>
                   <tr className="bg-slate-950/80">
                     <td colSpan={8} className="p-3 text-center">
                        <div className="flex items-center justify-center gap-4">
                           <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-teal-500/50"></div>
                           <span className="text-[11px] font-black text-teal-400 uppercase tracking-[0.4em] italic">{outlet}</span>
                           <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-teal-500/50"></div>
                        </div>
                     </td>
                   </tr>
                   {outletAudits.map((audit, idx) => (
               <tr key={audit.id} className="text-xs text-slate-300 hover:bg-slate-800/50 group transition-colors">
                 <td className="p-4 border-r border-white/10 text-center align-middle text-slate-500 font-bold">{idx + 1}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle whitespace-nowrap font-bold text-slate-400">{audit.date}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle font-black uppercase text-indigo-400 tracking-widest">{audit.outlet}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle text-xs text-slate-400 leading-relaxed font-medium">{audit.findings}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle text-xs text-slate-500 leading-relaxed italic">{audit.takenAction}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle font-black text-blue-400 tracking-widest uppercase">{audit.pic}</td>
                 <td className="p-4 border-r border-white/10 text-center align-middle">
                    <div className="flex flex-wrap justify-center gap-2 max-w-[200px] mx-auto">
                      {audit.documentationUrls && audit.documentationUrls.map((url: string, i: number) => (
                        <div key={i} className="w-10 h-12 bg-slate-800 rounded border border-white/10 overflow-hidden shadow-md">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {(!audit.documentationUrls || audit.documentationUrls.length === 0) && (
                        <span className="text-[8px] text-slate-700 italic font-black uppercase">No Data</span>
                      )}
                    </div>
                 </td>
                 <td className="p-4 text-center align-middle">
                   <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${audit.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                     {audit.status}
                   </span>
                 </td>
               </tr>
                    ))}
                  </React.Fragment>
                );
              })}
             {auditData.length === 0 && (
               <tr>
                 <td colSpan={8} className="p-12 text-center text-slate-600 font-black uppercase tracking-widest">
                   No Service Audit Records Found
                 </td>
               </tr>
             )}
           </tbody>
        </table>
      </div>
    </div>
  );
};

const CpaServiceTab: React.FC<TabProps> = ({ globalData, selectedMonth, selectedYear, showToast, selectedOutlet }) => {
  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const cpaData = useMemo(() => {
    const allCpas: any[] = [];
    Object.values(globalData.dailyCPA || {}).forEach((list: any) => {
      list.forEach((item: any) => {
        if (item.division === 'SERVICE' && item.date.startsWith(monthStr)) {
          if (!selectedOutlet || selectedOutlet === 'ALL' || item.outlet === selectedOutlet) {
            allCpas.push(item);
          }
        }
      });
    });
    return allCpas.sort((a, b) => b.date.localeCompare(a.date));
  }, [globalData.dailyCPA, monthStr, selectedOutlet]);

  const handleExportExcel = async () => {
    const columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Problem Photo', key: 'problemPhotoUrl', width: 30 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'Finding Problem', key: 'findingProblem', width: 40 },
      { header: 'Preventive', key: 'preventive', width: 40 },
      { header: 'Action', key: 'action', width: 40 },
      { header: 'PIC', key: 'pic', width: 15 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Action Photo', key: 'actionPhotoUrl', width: 30 },
    ];

    const data = cpaData.map(c => ({
      date: c.date,
      problemPhotoUrl: c.problemPhotoUrl || '',
      outlet: c.outlet,
      findingProblem: c.findingProblem,
      preventive: c.preventive,
      action: c.action,
      pic: c.pic,
      dueDate: c.dueDate,
      status: c.status,
      actionPhotoUrl: c.actionPhotoUrl || ''
    }));

    await exportToExcelWithImages(
      `CPA QA SERVICE - ${MONTHS[selectedMonth]} ${selectedYear}`,
      columns,
      data,
      [
        { columnKey: 'problemPhotoUrl', type: 'url' },
        { columnKey: 'actionPhotoUrl', type: 'url' }
      ]
    );
  };

  return (
    <div id="regional-service-cpa" className="glass-card bg-slate-900 border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 border-b border-white/5 flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <h4 className="text-xl font-black text-white uppercase italic">CPA QA - Service</h4>
          <ShareActions 
            targetId="regional-service-cpa" 
            title={`CPA QA Service Report - ${MONTHS[selectedMonth]} ${selectedYear}`}
            showToast={showToast}
          />
          <button 
            onClick={handleExportExcel}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> convert to excel
          </button>
        </div>
        <div className="px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
          {cpaData.length} Records Found
        </div>
      </div>
      <div className="overflow-x-auto p-6">
        <table className="w-full text-left border-collapse min-w-[1500px]">
          <thead>
            <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 italic">
              <th className="p-3 border-r border-white/10 text-center align-middle whitespace-nowrap">DATE</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">PROBLEM PHOTO</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">OUTLET</th>
              <th className="p-3 border-r border-white/10 text-center align-middle min-w-[200px]">FINDING PROBLEM</th>
              <th className="p-3 border-r border-white/10 text-center align-middle min-w-[200px]">PREVENTIVE</th>
              <th className="p-3 border-r border-white/10 text-center align-middle min-w-[200px]">ACTION</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">PIC</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">DUE DATE</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">STATUS</th>
              <th className="p-3 border-r border-white/10 text-center align-middle">ACTION PHOTO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {displayedOutlets.map(outlet => {
              const outletCpas = cpaData.filter(c => c.outlet === outlet);
              if (outletCpas.length === 0) return null;
              return (
                <React.Fragment key={outlet}>
                  <tr className="bg-slate-950/80">
                    <td colSpan={10} className="p-3 text-center">
                       <div className="flex items-center justify-center gap-4">
                          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-indigo-500/50"></div>
                          <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.4em] italic">{outlet}</span>
                          <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-indigo-500/50"></div>
                       </div>
                    </td>
                  </tr>
                  {outletCpas.map((cpa) => (
                    <tr key={cpa.id} className="text-xs font-bold text-slate-300 hover:bg-slate-800/50 transition-colors group">
                      <td className="p-3 border-r border-white/10 text-[10px] whitespace-nowrap text-slate-400 text-center align-middle">{cpa.date}</td>
                      <td className="p-3 border-r border-white/10 w-[150px] text-center align-middle">
                        {cpa.problemPhotoUrl ? (
                          <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 shadow-lg">
                            <img src={cpa.problemPhotoUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full aspect-video bg-black/20 rounded-lg flex items-center justify-center border border-dashed border-white/5">
                            <span className="text-[7px] text-slate-700 font-black uppercase">No Photo</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 border-r border-white/10 uppercase tracking-widest text-indigo-400 font-black text-center align-middle">{cpa.outlet}</td>
                      <td className="p-3 border-r border-white/10 italic text-[11px] text-slate-300 leading-relaxed text-center align-middle">"{cpa.findingProblem}"</td>
                      <td className="p-3 border-r border-white/10 text-[11px] text-slate-400 leading-relaxed text-center align-middle">{cpa.preventive}</td>
                      <td className="p-3 border-r border-white/10 text-[11px] text-slate-200 leading-relaxed font-medium text-center align-middle">{cpa.action}</td>
                      <td className="p-3 border-r border-white/10 text-center text-blue-400 font-black uppercase italic text-[10px] whitespace-nowrap align-middle">{cpa.pic}</td>
                      <td className="p-3 border-r border-white/10 text-center text-rose-400 font-black uppercase text-[10px] whitespace-nowrap align-middle">{cpa.dueDate}</td>
                      <td className="p-3 border-r border-white/10 text-center align-middle">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${cpa.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                          {cpa.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="p-3 border-r border-white/10 w-[150px] text-center align-middle">
                        {cpa.actionPhotoUrl ? (
                          <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 shadow-lg">
                            <img src={cpa.actionPhotoUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full aspect-video bg-black/20 rounded-lg flex items-center justify-center border border-dashed border-white/5">
                            <span className="text-[7px] text-slate-700 font-black uppercase">No Photo</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {cpaData.length === 0 && (
              <tr>
                <td colSpan={10} className="p-12 text-center text-slate-600 font-black uppercase tracking-widest">
                  No Service CPA Records Found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ComplaintServiceTab: React.FC<TabProps> = ({ globalData, selectedMonth, selectedYear, onUpdate, showToast, selectedOutlet }) => {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const managerName = "REGIONAL SERVICE";
  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const filteredComplaints = useMemo(() => {
    let comps = (globalData.guestComplaints || []).filter(c => 
      c.complaintType === 'SERVICE QUALITY' && c.date.startsWith(monthStr)
    );
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      comps = comps.filter(c => c.outlet === selectedOutlet);
    }
    if (selectedWeek !== null) {
      comps = comps.filter(c => {
        const day = parseInt(c.date.split("-")[2]);
        if (selectedWeek === 1) return day <= 7;
        if (selectedWeek === 2) return day > 7 && day <= 15;
        if (selectedWeek === 3) return day > 15 && day <= 23;
        if (selectedWeek === 4) return day > 23;
        return true;
      });
    }
    return comps;
  }, [globalData.guestComplaints, monthStr, selectedWeek, selectedOutlet]);

  const updateComplaintStatus = (compId: string) => {
    if (!onUpdate) return;
    const newComplaints = [...(globalData.guestComplaints || [])];
    const idx = newComplaints.findIndex(c => c.id === compId);
    if (idx >= 0) {
      newComplaints[idx] = {
        ...newComplaints[idx],
        followUpBy: managerName,
        selectedRegionalRM: managerName,
        status: 'RESOLVED',
        followUpAction: `Followed up by Regional Manager ${managerName}`
      };
      onUpdate('guestComplaints', newComplaints);
      showToast?.('Complaint updated successfully!', 'success');
    }
  };

  const handleExportExcel = async () => {
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'Asal Keluhan', key: 'source', width: 15 },
      { header: 'Report By', key: 'reportedBy', width: 15 },
      { header: 'Nama Tamu', key: 'guestName', width: 15 },
      { header: 'No Telp', key: 'phoneNumber', width: 15 },
      { header: 'Waktu Kejadian', key: 'incidentTime', width: 15 },
      { header: 'Deskripsi Keluhan', key: 'complaintDescription', width: 40 },
      { header: 'Follow Up By', key: 'followUpBy', width: 15 },
      { header: 'Corective Action', key: 'correctiveActionPlan', width: 30 },
      { header: 'Analisa', key: 'analysis', width: 30 },
      { header: 'Status Tamu', key: 'guestStatusLeaving', width: 15 },
      { header: 'PIC', key: 'picLeaders', width: 15 },
      { header: 'Preventive', key: 'preventive', width: 30 },
      { header: 'Dokumentasi Issue', key: 'issuePhoto', width: 25 },
      { header: 'Dokumentasi Follow Up', key: 'followUpPhoto', width: 25 },
      { header: 'Nama Regional', key: 'selectedRegionalRM', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    const data = filteredComplaints.map((c, idx) => ({
      no: idx + 1,
      date: c.date,
      outlet: c.outlet,
      source: c.source,
      reportedBy: c.reportedBy,
      guestName: c.guestName,
      phoneNumber: c.phoneNumber,
      incidentTime: c.incidentTime,
      complaintDescription: c.complaintDescription,
      followUpBy: c.followUpBy,
      correctiveActionPlan: c.correctiveActionPlan || '-',
      analysis: c.analysis || '-',
      guestStatusLeaving: c.guestStatusLeaving || '-',
      picLeaders: c.picLeaders || '-',
      preventive: c.preventive || '-',
      issuePhoto: c.documentationUrl || (c.issuePhotos && c.issuePhotos.length > 0 ? c.issuePhotos[0] : ''),
      followUpPhoto: c.documentationFollowUpUrl || (c.followUpPhotos && c.followUpPhotos.length > 0 ? c.followUpPhotos[0] : ''),
      selectedRegionalRM: c.selectedRegionalRM || '-',
      status: c.status
    }));

    await exportToExcelWithImages(
      `GUEST COMPLAINT SERVICE - ${MONTHS[selectedMonth]} ${selectedYear}`,
      columns,
      data,
      [
        { columnKey: 'issuePhoto', type: 'url' },
        { columnKey: 'followUpPhoto', type: 'url' }
      ]
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center no-print">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setSelectedWeek(null)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedWeek === null ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 text-slate-500 border-white/5 hover:border-white/20'}`}>All Weeks</button>
          <button onClick={() => setSelectedWeek(1)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedWeek === 1 ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 text-slate-500 border-white/5 hover:border-white/20'}`}>Week 1</button>
          <button onClick={() => setSelectedWeek(2)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedWeek === 2 ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 text-slate-500 border-white/5 hover:border-white/20'}`}>Week 2</button>
          <button onClick={() => setSelectedWeek(3)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedWeek === 3 ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 text-slate-500 border-white/5 hover:border-white/20'}`}>Week 3</button>
          <button onClick={() => setSelectedWeek(4)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedWeek === 4 ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 text-slate-500 border-white/5 hover:border-white/20'}`}>Week 4</button>
        </div>
        <div className="flex items-center gap-3">
          <ShareActions 
            targetId="regional-service-complaint" 
            title={`Guest Complaints Service - ${MONTHS[selectedMonth]} ${selectedYear}`}
            showToast={showToast}
          />
          <button 
            onClick={handleExportExcel}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> convert to excel
          </button>
        </div>
      </div>

      <div id="regional-service-complaint" className="glass-card bg-slate-900 border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[2500px]">
            <thead>
              <tr className="bg-[#1e3a5f]">
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[50px]">NO</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">DATE</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">OUTLET</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">ASAL KELUHAN</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">REPORT BY</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">NAMA TAMU</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">NO TELP</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">WAKTU KEJADIAN</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[200px]">DESKRIPSI KELUHAN TAMU</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[150px]">ACTION</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">FOLLOW UP BY</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[200px]">CORECTIVE ACTION</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[150px]">ANALISA</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">STATUS TAMU</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[150px]">PIC</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[150px]">PREVENTIVE</th>
                <th colSpan={2} className="px-3 py-2 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle">DOCUMENTASI</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[120px]">NAMA REGIONAL</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">STATUS</th>
                <th rowSpan={2} className="px-3 py-4 border border-slate-700 text-[9px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[100px]">ACTION</th>
              </tr>
              <tr className="bg-[#1e3a5f]">
                <th className="px-3 py-2 border border-slate-700 text-[8px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[80px]">ISSUE</th>
                <th className="px-3 py-2 border border-slate-700 text-[8px] font-black text-white uppercase tracking-tight text-center align-middle min-w-[80px]">FOLLOW UP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-900/40">
              {displayedOutlets.map(outlet => {
                const outletComplaints = filteredComplaints.filter(c => c.outlet === outlet);
                if (outletComplaints.length === 0) return null;
                return (
                  <React.Fragment key={outlet}>
                    <tr className="bg-slate-950/80">
                      <td colSpan={21} className="p-3 text-center">
                         <div className="flex items-center justify-center gap-4">
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-indigo-500/50"></div>
                            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.4em] italic">{outlet}</span>
                            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-indigo-500/50"></div>
                         </div>
                      </td>
                    </tr>
                    {outletComplaints.map((comp, idx) => (
                      <tr key={comp.id} className="text-xs font-bold text-slate-300 hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 border border-slate-700 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-3 border border-slate-700 text-[10px] whitespace-nowrap">{comp.date}</td>
                        <td className="p-3 border border-slate-700 uppercase tracking-widest text-indigo-400 font-black">{comp.outlet}</td>
                        <td className="p-3 border border-slate-700 whitespace-nowrap">{comp.source}</td>
                        <td className="p-3 border border-slate-700 whitespace-nowrap">{comp.reportedBy}</td>
                        <td className="p-3 border border-slate-700">{comp.guestName}</td>
                        <td className="p-3 border border-slate-700">{comp.phoneNumber}</td>
                        <td className="p-3 border border-slate-700 text-center">{comp.incidentTime}</td>
                        <td className="p-3 border border-slate-700 italic text-[11px] text-slate-400 leading-relaxed font-medium">"{comp.complaintDescription}"</td>
                        <td className="p-3 border border-slate-700">
                          {comp.status !== 'RESOLVED' ? (
                            <button
                              onClick={() => updateComplaintStatus(comp.id)}
                              className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg"
                            >
                              Done Follow Up
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-400 italic font-black uppercase tracking-widest block text-center">Followed up</span>
                          )}
                        </td>
                        <td className="p-3 border border-slate-700 font-bold text-center">{comp.followUpBy || '-'}</td>
                        <td className="p-3 border border-slate-700 text-slate-400">{comp.correctiveActionPlan || '-'}</td>
                        <td className="p-3 border border-slate-700 text-slate-400">{comp.analysis || '-'}</td>
                        <td className="p-3 border border-slate-700 text-center uppercase tracking-tighter">{comp.guestStatusLeaving || '-'}</td>
                        <td className="p-3 border border-slate-700 text-center text-blue-400">{comp.picLeaders || '-'}</td>
                        <td className="p-3 border border-slate-700 text-slate-400">{comp.preventive || '-'}</td>
                        <td className="p-3 border border-slate-700">
                          {comp.documentationUrl || (comp.issuePhotos && comp.issuePhotos.length > 0) ? (
                            <div className="w-12 h-16 bg-slate-800 rounded border border-white/10 overflow-hidden mx-auto shadow-xl">
                              <img src={comp.documentationUrl || comp.issuePhotos?.[0]} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <span className="text-[8px] text-slate-700 italic block text-center uppercase font-black">No Pic</span>
                          )}
                        </td>
                        <td className="p-3 border border-slate-700">
                          {comp.documentationFollowUpUrl || (comp.followUpPhotos && comp.followUpPhotos.length > 0) ? (
                            <div className="w-12 h-16 bg-slate-800 rounded border border-white/10 overflow-hidden mx-auto shadow-xl">
                              <img src={comp.documentationFollowUpUrl || comp.followUpPhotos?.[0]} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <span className="text-[8px] text-slate-700 italic block text-center uppercase font-black">No Pic</span>
                          )}
                        </td>
                        <td className="p-3 border border-slate-700 text-center text-indigo-300 uppercase italic text-[10px] tracking-widest">
                          {comp.selectedRegionalRM || '-'}
                        </td>
                        <td className="p-3 border border-slate-700 text-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all ${comp.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                            {comp.status || 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {filteredComplaints.length === 0 && (
                <tr>
                  <td colSpan={21} className="p-12 text-center text-slate-600 font-black uppercase tracking-widest italic text-lg opacity-40">
                    Zero Service Complaints this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const GoogleReviewTab: React.FC<TabProps> = ({ data, selectedMonth, selectedYear, isPreviewMode, showToast, selectedOutlet }) => {
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const tableData = useMemo(() => {
    return displayedOutlets.map((outlet, idx) => {
      const monthlyResults = MONTHS.map((_, i) => getGoogleRatingAtMonth(data, outlet, i, selectedYear));
      
      // Individual month columns should show CUMULATIVE rating at end of that month (sum of all monthly records so far)
      const monthCumulativeResults = MONTHS.map((_, i) => {
        let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
        // Sum all recorded monthly result totals from the beginning of the year up to month i
        monthlyResults.slice(0, i + 1).forEach(m => {
          if (m.stars) {
            s1 += m.stars.s1; s2 += m.stars.s2; s3 += m.stars.s3; s4 += m.stars.s4; s5 += m.stars.s5;
          }
        });
        const total = s1 + s2 + s3 + s4 + s5;
        const rating = total === 0 ? 0 : ((s1*1)+(s2*2)+(s3*3)+(s4*4)+(s5*5)) / total;
        return { rating, count: total };
      });

      const currentCumulative = monthCumulativeResults[selectedMonth];
      const lastMonthCumulative = selectedMonth > 0 ? monthCumulativeResults[selectedMonth - 1] : { rating: 0, count: 0 };

      return {
        no: idx + 1,
        outlet,
        rank: currentCumulative.rating,
        count: currentCumulative.count,
        lastMonthRating: lastMonthCumulative.rating,
        lastMonthCount: lastMonthCumulative.count,
        mtdRating: monthlyResults[selectedMonth].rating,
        mtdCount: monthlyResults[selectedMonth].count,
        months: monthlyResults,
        finalCum: monthCumulativeResults[11]
      };
    });
  }, [data, selectedMonth, selectedYear, displayedOutlets]);

  const excelData = useMemo(() => {
    return tableData.map(d => {
      const row: any = {
        'No': d.no,
        'Outlet': d.outlet,
        'Actual Rank': d.rank.toFixed(2),
        'Total Review': d.count
      };
      MONTHS.forEach((m, i) => {
        row[m] = d.months[i].rating > 0 ? `${d.months[i].rating.toFixed(2)} (${d.months[i].count})` : '-';
      });
      row['AVG RATING JAN-DEC'] = d.finalCum?.rating > 0 ? d.finalCum.rating.toFixed(2) : '-';
      return row;
    });
  }, [tableData]);

  const handleExportGoogleReviewExcel = async () => {
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'Actual Rank', key: 'rank', width: 12 },
      { header: 'Total Review', key: 'count', width: 12 },
      ...MONTHS.map(m => ({ header: m, key: m, width: 15 })),
      { header: 'AVG RATING JAN-DEC', key: 'finalAvg', width: 20 }
    ];

    const data = tableData.map(d => {
      const row: any = {
        no: d.no,
        outlet: d.outlet,
        rank: d.rank.toFixed(2),
        count: d.count,
        finalAvg: d.finalCum?.rating > 0 ? d.finalCum.rating.toFixed(2) : '-'
      };
      MONTHS.forEach((m, i) => {
        row[m] = d.months[i].rating > 0 ? `${d.months[i].rating.toFixed(2)} (${d.months[i].count})` : '-';
      });
      return row;
    });

    await exportToExcelWithImages(
      `GOOGLE REVIEW RATING SUMMARY ${selectedYear}`,
      columns,
      data
    );
  };

  const reportId = `google-review-report-${selectedYear}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center no-print px-2">
        <div className="flex gap-2">
          <ShareActions 
            targetId={reportId} 
            title={`Google Review Rating Summary - ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
          <button 
            onClick={handleExportGoogleReviewExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>
      <div id={reportId} className="overflow-x-auto glass-card bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
        <table className={`w-full text-left border-collapse ${isPreviewMode ? 'min-w-[800px]' : 'min-w-[1200px]'}`}>
        <thead>
          <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
            <th className="p-2 border-r border-white/10 text-center w-8">NO</th>
            <th className="p-2 border-r border-white/10 min-w-[110px] text-center uppercase tracking-widest">OUTLET</th>
            <th className="p-2 border-r border-white/10 text-center uppercase tracking-widest bg-emerald-500/5">ACCUM. RATING</th>
            <th className="p-2 border-r border-white/10 text-center uppercase tracking-widest bg-emerald-500/5">TOTAL ACCUM.</th>
            {MONTHS.map(m => (
              <th key={m} className="p-2 border-r border-white/10 text-center uppercase tracking-tighter">{m.substring(0, 3)}</th>
            ))}
            <th className="p-2 border-r border-white/10 text-center uppercase tracking-widest bg-amber-500/10 text-amber-500 font-bold">AVG RATING<br/>JAN-DEC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {tableData.map(d => (
            <tr key={d.outlet} className={`${isPreviewMode ? 'text-[8px]' : 'text-[10px]'} font-black text-slate-300 hover:bg-slate-800/50 transition-colors`}>
              <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center text-slate-500`}>{d.no}</td>
              <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 font-black uppercase text-white`}>
                <div className="flex flex-col">
                  <span className={`text-white ${isPreviewMode ? 'text-[8px]' : 'text-[10px]'}`}>{d.outlet.split(' ')[0]}</span>
                  <span className={`text-yellow-500 font-black ${isPreviewMode ? 'text-[6px]' : 'text-[8px]'}`}>{d.outlet.split(' ').slice(1).join(' ')}</span>
                </div>
              </td>
              <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center text-emerald-400 bg-emerald-500/5 font-black`}>{d.rank.toFixed(2).replace('.', ',')}</td>
              <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center text-white font-bold bg-emerald-500/5`}>{d.count}</td>
              {d.months.map((m, i) => (
                <td key={i} className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center ${i === selectedMonth ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400'}`}>
                  {m.rating > 0 ? (
                    <div className="flex flex-col items-center">
                      <span>{m.rating.toFixed(2).replace('.', ',')}</span>
                      <span className="text-[8px] opacity-60">({m.count} rev)</span>
                    </div>
                  ) : '-'}
                </td>
              ))}
              <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center text-amber-500 bg-amber-500/10 font-black`}>
                {d.finalCum?.rating > 0 ? d.finalCum.rating.toFixed(2).replace('.', ',') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
     </div>
  );
};

const GSIIndexTab: React.FC<TabProps> = ({ data, selectedYear, isPreviewMode, showToast, selectedOutlet }) => {
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const gsiData = useMemo(() => {
    const stats = displayedOutlets.map((outlet, idx) => {
      const outletMonths = data[outlet] || {};
      const monthlyStats = MONTHS.map((_, i) => {
        const mData = outletMonths[String(i)] || {};
        const dailyGSI: Record<string, GSIRow[]> = mData.dailyGSI || {};
        const monthPrefix = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
        let totalPoints = 0;
        let maxPoints = 0;
        let totalMonthCards = 0;
        
        Object.entries(dailyGSI).forEach(([date, rows]) => {
          if (date.startsWith(monthPrefix) && rows.length > 0) {
            let dayMaxCards = 0;
            rows.forEach(r => {
              const excellent = r.excellent || 0;
              const good = r.good || 0;
              const average = r.average || 0;
              const poor = r.poor || 0;
              const totalExceptAbstain = excellent + good + average + poor;
              
              if (totalExceptAbstain > 0) {
                totalPoints += (excellent * 4) + (good * 3) + (average * 2) + (poor * 1);
                maxPoints += totalExceptAbstain * 4;
                if (totalExceptAbstain > dayMaxCards) dayMaxCards = totalExceptAbstain;
              }
            });
            totalMonthCards += dayMaxCards;
          }
        });
        return {
          percentage: maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0,
          totalCards: totalMonthCards
        };
      });
      return { 
        no: idx + 1, 
        outlet, 
        months: monthlyStats.map(m => m.percentage),
        totalResponses: monthlyStats.map(m => m.totalCards)
      };
    });

    const monthlyAverages = MONTHS.map((_, i) => {
      const scores = stats.map(s => s.months[i]).filter(v => v > 0);
      const respCounts = stats.map(s => s.totalResponses[i]).filter(v => v > 0);
      return {
        percentage: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        averageTotalResponses: respCounts.length > 0 ? respCounts.reduce((a, b) => a + b, 0) / respCounts.length : 0
      };
    });

    return { stats, averages: monthlyAverages };
  }, [data, selectedYear, displayedOutlets]);
  const excelData = useMemo(() => {
    return gsiData.stats.map(d => {
      const row: any = {
        'No': d.no,
        'Outlet': d.outlet
      };
      MONTHS.forEach((m, i) => {
        row[m] = d.months[i] > 0 ? `${d.months[i].toFixed(2)}% (${Math.round(d.totalResponses[i])} Resp)` : '-';
      });
      return row;
    });
  }, [gsiData]);

  const handleExportGsiExcel = async () => {
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      ...MONTHS.map(m => ({ header: m, key: m, width: 10 }))
    ];

    const data = gsiData.stats.map(d => {
      const row: any = {
        no: d.no,
        outlet: d.outlet
      };
      MONTHS.forEach((m, i) => {
        row[m] = d.months[i] > 0 ? d.months[i].toFixed(2) + '%' : '-';
      });
      return row;
    });

    await exportToExcelWithImages(
      `GUEST SERVICE INDEX ${selectedYear}`,
      columns,
      data
    );
  };

  const reportId = `gsi-index-report-${selectedYear}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center no-print px-2">
        <div className="flex gap-2">
          <ShareActions 
            targetId={reportId} 
            title={`Guest Service Index - ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
          <button 
            onClick={handleExportGsiExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>
      <div id={reportId} className="space-y-0">
        <div className="bg-yellow-400 p-4 text-center border-t border-x border-slate-400">
          <h4 className="text-xl font-black text-black uppercase italic tracking-tighter">
            GUEST SERVICE INDEX - <span className="font-bold italic opacity-80">by Guest Comment card</span>
          </h4>
        </div>
        <div className="overflow-x-auto glass-card bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
          <table className={`w-full text-left border-collapse ${isPreviewMode ? 'min-w-[800px]' : 'min-w-[1100px]'}`}>
          <thead>
            <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
              <th className="p-2 border-r border-white/10 text-center w-8 uppercase tracking-widest">NO</th>
              <th className="p-2 border-r border-white/10 min-w-[110px] text-center uppercase tracking-widest">OUTLET</th>
              {MONTHS.map(m => (
                <th key={m} className="p-2 border-r border-white/10 text-center uppercase tracking-widest">{m.substring(0, 3)} %</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {gsiData.stats.map(d => (
              <tr key={d.outlet} className={`${isPreviewMode ? 'text-[8px]' : 'text-[10px]'} font-black text-slate-300 hover:bg-slate-800/50 transition-colors`}>
                <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center text-slate-500`}>{d.no}</td>
                <td className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 uppercase text-white sticky left-0 bg-slate-900/95 z-10`}>
                   <div className="flex flex-col">
                     <span className={`text-white ${isPreviewMode ? 'text-[8px]' : 'text-[10px]'}`}>{d.outlet.split(' ')[0]}</span>
                     <span className={`text-yellow-500 font-black ${isPreviewMode ? 'text-[6px]' : 'text-[8px]'}`}>{d.outlet.split(' ').slice(1).join(' ')}</span>
                   </div>
                </td>
                {d.months.map((m, i) => (
                  <td key={i} className={`${isPreviewMode ? 'p-1' : 'p-2'} border-r border-white/10 text-center`}>
                    {m > 0 ? (
                      <div className="flex flex-col">
                        <span className="text-indigo-400">{m.toFixed(2)}%</span>
                        <span className="text-[8px] text-slate-500 opacity-80 font-black italic">({Math.round(d.totalResponses[i])} Cards)</span>
                      </div>
                    ) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-950 text-[9px] font-black text-white">
              <td className="p-2 border-r border-white/10 text-center uppercase tracking-widest" colSpan={2}>AVERAGE</td>
              {gsiData.averages.map((avg, i) => (
                <td key={i} className="p-2 border-r border-white/10 text-center bg-indigo-900/20 text-indigo-400 font-black">
                  {avg.percentage > 0 ? (
                    <div className="flex flex-col">
                      <span>{avg.percentage.toFixed(2)}%</span>
                      <span className="text-[8px] text-slate-500 opacity-80 italic font-black">({Math.round(avg.averageTotalResponses)} Cards Avg)</span>
                    </div>
                  ) : '-'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
     </div>
    </div>
  );
};

const LedgerAuditTab: React.FC<TabProps & { type: 'SATISFACTION' | 'COMPLIMENTARY' | 'CITY_LEDGER' }> = ({ data, selectedMonth, selectedYear, type, isPreviewMode, showToast, selectedOutlet }) => {
  const displayedOutlets = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return OUTLETS.filter(o => o === selectedOutlet);
    }
    return OUTLETS;
  }, [selectedOutlet]);

  const ledgerAggregation = useMemo(() => {
    return displayedOutlets.map(outlet => {
      const currentMonth = (data[outlet] || {})[String(selectedMonth)] || {};
      let items: any[] = [];
      
      const ledgerKey = type === 'SATISFACTION' ? 'dailyCustomerSat' : 
                        type === 'COMPLIMENTARY' ? 'dailyComplimentary' : 'dailyCityLedger';
      
      const ledgerData = currentMonth[ledgerKey] || {};
      Object.values(ledgerData).forEach((dailyItems: any) => {
        items = [...items, ...(dailyItems || [])];
      });

      return {
        outlet,
        totalAmount: items.reduce((a, b) => a + (Number(b.price) * Number(b.qty) || 0), 0),
        count: items.length,
        items: items.slice(0, 5) // Preview 5 items
      };
    });
  }, [data, selectedMonth, selectedYear, type, displayedOutlets]);
  const excelData = useMemo(() => {
    return ledgerAggregation.map(l => ({
      'Outlet': l.outlet,
      'Total Amount': l.totalAmount,
      'Item Count': l.count
    }));
  }, [ledgerAggregation]);

  const handleCopyOutletWA = (outlet: string, items: any[], total: number) => {
    const monthName = MONTHS[selectedMonth];
    const header = type === 'SATISFACTION' ? 'CUSTOMER SATISFACTION' : 
                   type === 'COMPLIMENTARY' ? 'COMPLIMENTARY' : 'CITY LEDGER';
    
    let template = `*${header} - REVENUE REPORT*\n\n`;
    template += `*OUTLET* : ${outlet}\n`;
    template += `*DATE / MONTH* : ${monthName} ${selectedYear}\n\n`;
    template += `*TOTAL VALUATION* : Rp ${total.toLocaleString('de-DE')}\n\n`;
    template += `*ITEM LIST* :\n`;
    
    // We need to fetch ALL items for the template, not just the slice(0,5)
    const currentMonth = (data[outlet] || {})[String(selectedMonth)] || {};
    let allItems: any[] = [];
    const ledgerKey = type === 'SATISFACTION' ? 'dailyCustomerSat' : 
                      type === 'COMPLIMENTARY' ? 'dailyComplimentary' : 'dailyCityLedger';
    const ledgerData = currentMonth[ledgerKey] || {};
    Object.values(ledgerData).forEach((dailyItems: any) => {
      allItems = [...allItems, ...(dailyItems || [])];
    });

    if (allItems.length === 0) {
      template += `- No data available\n`;
    } else {
      allItems.forEach((item, idx) => {
        template += `${idx + 1}. ${item.name} (${item.qty} pcs) - Rp ${(item.price).toLocaleString('de-DE')}\n`;
        if (item.reason) template += `   Note: ${item.reason}\n`;
      });
    }
    template += `\n*Best Regards & Thank you*`;

    navigator.clipboard.writeText(template).then(() => {
      showToast?.(`Template ${header} untuk ${outlet} berhasil disalin!`, 'success');
    });
  };

  const handleCopySummaryWA = () => {
    const monthName = MONTHS[selectedMonth];
    const header = type === 'SATISFACTION' ? 'CUSTOMER SATISFACTION' : 
                   type === 'COMPLIMENTARY' ? 'COMPLIMENTARY' : 'CITY LEDGER';
    const totalRegional = ledgerAggregation.reduce((acc, curr) => acc + curr.totalAmount, 0);

    let template = `*CONSOLIDATED ${header} RECAP*\n`;
    template += `*PERIODE* : ${monthName} ${selectedYear}\n\n`;
    template += `*GRAND TOTAL REGIONAL* : Rp ${totalRegional.toLocaleString('de-DE')}\n\n`;
    template += `*OUTLET BREAKDOWN* :\n\n`;

    ledgerAggregation.forEach((l, idx) => {
      if (l.totalAmount > 0) {
        template += `${idx + 1}. *${l.outlet}*\n`;
        template += `   Total: Rp ${l.totalAmount.toLocaleString('de-DE')}\n`;
        template += `   Items: ${l.count} records\n\n`;
      }
    });

    template += `*Best Regards & Thank you*`;

    navigator.clipboard.writeText(template).then(() => {
      showToast?.(`Rekapan Konsolidasi ${header} berhasil disalin!`, 'success');
    });
  };

  const config = {
    SATISFACTION: { icon: 'fa-face-smile', color: 'text-emerald-500', label: 'Guest Satisfaction Requests' },
    COMPLIMENTARY: { icon: 'fa-gift', iconColor: 'text-pink-500', label: 'Complimentary & Treat Audit' },
   CITY_LEDGER: { icon: 'fa-building', iconColor: 'text-blue-500', label: 'City Ledger Consolidations' }
  };

  const reportId = `ledger-${type.toLowerCase()}-report-${selectedMonth}-${selectedYear}`;

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center no-print">
        <div className="flex gap-2">
          <ShareActions 
            targetId={reportId} 
            title={`${config[type].label} - ${MONTHS[selectedMonth]} ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
          <button 
            onClick={handleCopySummaryWA}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
          >
            <i className="fab fa-whatsapp"></i> Copy Consolidated
          </button>
        </div>
      </div>

      <div id={reportId} className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-xs font-black text-white uppercase tracking-[0.3em] flex items-center gap-3">
            <i className={`fas ${config[type].icon} ${config[type].color || (config[type] as any).iconColor}`}></i> {config[type].label}
          </h4>
          <div className="text-[10px] font-black text-slate-500 uppercase">Valuation Phase</div>
        </div>
        <div className={`grid gap-4 ${isPreviewMode ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
          {ledgerAggregation.map(l => (
            <div key={l.outlet} className={`glass-card ${isPreviewMode ? 'p-2' : 'p-4'} bg-slate-950 border-white/10 hover:border-indigo-500/40 transition-all group rounded-3xl shadow-xl`}>
              <div className={`flex justify-between items-center ${isPreviewMode ? 'mb-1.5 pb-1' : 'mb-3 pb-2'} border-b border-white/5`}>
                <span className={`${isPreviewMode ? 'text-[8px]' : 'text-[10px]'} font-black text-white uppercase tracking-widest`}>
                  <span className="text-white">{l.outlet.split(' ')[0]}</span>{' '}
                  <span className={config[type].color || (config[type] as any).iconColor}>{l.outlet.split(' ').slice(1).join(' ')}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className={`${isPreviewMode ? 'text-[9px]' : 'text-xs'} font-black text-indigo-400`}>Rp {l.totalAmount.toLocaleString('id-ID')}</span>
                  {!isPreviewMode && (
                    <button 
                      onClick={() => handleCopyOutletWA(l.outlet, l.items, l.totalAmount)}
                      className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all"
                      title="Copy to WhatsApp"
                    >
                      <i className="fab fa-whatsapp text-[10px]"></i>
                    </button>
                  )}
                </div>
              </div>
              <div className={`${isPreviewMode ? 'space-y-0.5' : 'space-y-1.5'}`}>
                 {l.items.map((item, idx) => (
                    <div key={idx} className={`flex justify-between ${isPreviewMode ? 'text-[7px]' : 'text-[8px]'} font-bold text-slate-300 uppercase italic`}>
                      <span className="truncate max-w-[80px]">{item.name}</span>
                      <span className="text-indigo-500/80">x{item.qty}</span>
                   </div>
                 ))}
                 {l.count > 5 && <div className={`${isPreviewMode ? 'text-[6px]' : 'text-[7px]'} text-slate-500 font-black italic mt-1 uppercase`}>+{l.count - 5} MORE...</div>}
                 {l.count === 0 && <div className={`${isPreviewMode ? 'text-[8px] py-2' : 'text-[10px] py-4'} text-slate-600 font-black text-center border border-dashed border-white/10 rounded-xl uppercase tracking-widest`}>Empty</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
const colorMap: Record<string, { text: string; bg: string; border: string; bgMuted: string; bgHeader: string; hoverBg: string }> = {
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500',
    border: 'border-emerald-500/20',
    bgMuted: 'bg-emerald-950/25',
    bgHeader: 'bg-emerald-900/20 text-emerald-400',
    hoverBg: 'hover:bg-emerald-600',
  },
  blue: {
    text: 'text-blue-400',
    bg: 'bg-blue-500',
    border: 'border-blue-500/20',
    bgMuted: 'bg-blue-950/25',
    bgHeader: 'bg-blue-900/20 text-blue-400',
    hoverBg: 'hover:bg-blue-600',
  },
  purple: {
    text: 'text-purple-400',
    bg: 'bg-purple-500',
    border: 'border-purple-500/20',
    bgMuted: 'bg-purple-950/25',
    bgHeader: 'bg-purple-900/20 text-purple-400',
    hoverBg: 'hover:bg-purple-600',
  }
};

const ConsolidatedLedgerTab: React.FC<TabProps & { type: 'SATISFACTION' | 'CITY_LEDGER' | 'COMPLIMENTARY' }> = ({ data, selectedMonth, selectedYear, isPreviewMode, showToast, type, selectedOutlet: propSelectedOutlet }) => {
  const [selectedOutlet, setSelectedOutlet] = useState<string>(propSelectedOutlet || 'ALL');

  useEffect(() => {
    if (propSelectedOutlet) {
      setSelectedOutlet(propSelectedOutlet);
    }
  }, [propSelectedOutlet]);

  const allItems = useMemo(() => {
    let consolidated: any[] = [];
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const ledgerKey = type === 'SATISFACTION' ? 'dailyCustomerSat' : 
                      type === 'COMPLIMENTARY' ? 'dailyComplimentary' : 'dailyCityLedger';

    OUTLETS.forEach(outlet => {
      const monthData = (data[outlet] || {})[String(selectedMonth)] || {};
      const ledgerData = monthData[ledgerKey] || {};
      
      Object.entries(ledgerData).forEach(([date, items]: [string, any]) => {
        if (date.startsWith(monthStr)) {
          const itemsWithMeta = (items || []).map((item: any) => ({
            ...item,
            date,
            outlet
          }));
          consolidated = [...consolidated, ...itemsWithMeta];
        }
      });
    });

    return consolidated.sort((a, b) => b.date.localeCompare(a.date));
  }, [data, selectedMonth, selectedYear, type]);

  const totalRegional = allItems.reduce((acc, curr) => acc + (Number(curr.price) * Number(curr.qty) || 0), 0);

  const excelData = useMemo(() => {
    return allItems.map(item => ({
      'Date': item.date,
      'Outlet': item.outlet,
      'Item Name': item.name,
      'Price': item.price,
      'Qty': item.qty,
      'PIC': item.pic,
      'Catatan': item.reason,
      'Total Price': item.price * item.qty
    }));
  }, [allItems]);

  const config = {
    SATISFACTION: { label: 'Guest Satisfaction', icon: 'fa-face-smile', color: 'emerald' },
    CITY_LEDGER: { label: 'Bill City Ledger', icon: 'fa-building', color: 'blue' },
    COMPLIMENTARY: { label: 'Bill Complimentary', icon: 'fa-gift', color: 'purple' }
  };

  const scheme = colorMap[config[type].color] || colorMap.emerald;
  const reportId = `${type.toLowerCase()}-ledger-${selectedMonth}-${selectedYear}`;

  const outletsToRender = useMemo(() => {
    if (selectedOutlet === 'ALL' || !selectedOutlet) {
      return OUTLETS;
    }
    return [selectedOutlet];
  }, [selectedOutlet]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-6 md:flex-row md:justify-between md:items-center no-print bg-slate-900/50 p-6 rounded-[2rem] border border-white/5">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl ${scheme.bg} bg-opacity-10 flex items-center justify-center border ${scheme.border}`}>
             <i className={`fas ${config[type].icon} ${scheme.text} text-xl`}></i>
          </div>
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1">{config[type].label} Summary</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consolidated Ledger Report</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Grand Total Regional</p>
              <h3 className="text-lg font-black text-white italic tracking-tighter">Rp {totalRegional.toLocaleString('id-ID')}</h3>
           </div>
           <ShareActions 
            targetId={reportId} 
            title={`${config[type].label} Ledger - ${MONTHS[selectedMonth]} ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
        </div>
      </div>

      {/* OUTLET SELECTOR PILLS */}
      <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2.5 rounded-2xl border border-white/5 no-print">
        <button
          onClick={() => setSelectedOutlet('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            selectedOutlet === 'ALL' || !selectedOutlet
              ? `${scheme.bg} text-white shadow-lg shadow-indigo-500/10`
              : 'hover:bg-white/5 text-slate-400 hover:text-white'
          }`}
        >
          Semua Outlet
        </button>
        {OUTLETS.map(outlet => {
          const hasData = allItems.some(item => item.outlet === outlet);
          return (
            <button
              key={outlet}
              onClick={() => setSelectedOutlet(outlet)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative ${
                selectedOutlet === outlet
                  ? `${scheme.bg} text-white shadow-lg shadow-indigo-500/10`
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {outlet}
              {hasData && (
                <span className={`absolute -top-1 -right-1 w-2.25 h-2.25 rounded-full ${scheme.bg} ring-2 ring-slate-950`} />
              )}
            </button>
          );
        })}
      </div>

      <div id={reportId} className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
        {outletsToRender.map(outlet => {
          const outletItems = allItems.filter(item => item.outlet === outlet);
          const outletTotal = outletItems.reduce((acc, curr) => acc + (Number(curr.price) * Number(curr.qty) || 0), 0);

          if (outletItems.length === 0) {
            // If the user selected a specific outlet but it has no data
            if (selectedOutlet !== 'ALL' && selectedOutlet) {
              return (
                <div key={outlet} className="glass-card bg-slate-950 border border-white/10 rounded-[2.5rem] p-16 text-center shadow-xl">
                  <div className="flex flex-col items-center gap-4 opacity-25">
                    <i className="fas fa-folder-open text-5xl text-slate-600"></i>
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Belum ada laporan {config[type].label} untuk {outlet}</span>
                  </div>
                </div>
              );
            }
            return null;
          }

          return (
            <div key={outlet} className="space-y-4 bg-slate-900/20 p-6 rounded-[2.5rem] border border-white/5">
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center px-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${scheme.bg} bg-opacity-10 flex items-center justify-center border ${scheme.border}`}>
                    <i className="fas fa-store text-xs text-white opacity-80"></i>
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase tracking-wider">{outlet}</h5>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{config[type].label} Laporan Outlet</p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Outlet Total</p>
                  <span className={`text-md font-black ${scheme.text} italic tracking-tighter`}>Rp {outletTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="overflow-x-auto glass-card bg-slate-950 border border-white/10 rounded-[2rem] shadow-2xl">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-900/80 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                      <th className="p-5 border-r border-white/5 text-center w-32">DATE</th>
                      <th className="p-5 border-r border-white/5">ITEM NAME</th>
                      <th className="p-5 border-r border-white/5 text-right w-40">PRICE</th>
                      <th className="p-5 border-r border-white/5 text-center w-32">PIC</th>
                      <th className="p-5 border-r border-white/5">CATATAN</th>
                      <th className={`p-5 text-right ${scheme.bgHeader} w-48`}>TOTAL PRICE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {outletItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-indigo-600/5 transition-colors font-bold text-slate-300">
                        <td className="p-5 border-r border-white/5 text-center text-[10px] tabular-nums whitespace-nowrap text-slate-400 tracking-tighter font-black">
                          {new Date(item.date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                        </td>
                        <td className="p-5 border-r border-white/5">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white tracking-tight uppercase leading-tight">{item.name}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Qty: {item.qty} Pcs</span>
                          </div>
                        </td>
                        <td className="p-5 border-r border-white/5 text-right text-xs tabular-nums text-slate-400 font-black">Rp {item.price.toLocaleString('id-ID')}</td>
                        <td className="p-5 border-r border-white/5 text-center">
                          <span className="px-3 py-1 bg-slate-800 rounded-lg text-[9px] font-black text-slate-300 uppercase tracking-widest border border-white/5 shadow-sm">
                            {item.pic || '-'}
                          </span>
                        </td>
                        <td className="p-5 border-r border-white/5 text-[10px] italic text-slate-400 max-w-[300px] leading-relaxed">
                          {item.reason || '-'}
                        </td>
                        <td className={`p-5 text-right text-sm font-black ${scheme.text} ${scheme.bgMuted} tabular-nums italic tracking-tighter`}>
                          Rp {(item.price * item.qty).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-white/10">
                    <tr className="bg-slate-950/40 font-black text-white uppercase">
                      <td colSpan={5} className="p-5 text-right text-[10px] tracking-[0.2em]">{outlet} TOTAL</td>
                      <td className={`p-5 text-right text-sm ${scheme.text} ${scheme.bgHeader} italic tracking-tighter`}>Rp {outletTotal.toLocaleString('id-ID')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}

        {allItems.length === 0 && (
          <div className="glass-card bg-slate-950 border border-white/10 rounded-[2.5rem] p-32 text-center shadow-2xl">
            <div className="flex flex-col items-center gap-4 opacity-20">
              <i className="fas fa-folder-open text-6xl text-slate-600"></i>
              <span className="text-xl font-black uppercase tracking-[0.5em] text-slate-600">No Records Found</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const OvertimeMTDTab: React.FC<TabProps> = ({ data, selectedMonth, selectedYear, globalData, isPreviewMode, showToast, selectedOutlet, selectedArea }) => {
  const displayedOutlets = useMemo(() => {
    const activeNames = Array.from(new Set([...getActiveOutletNames(), ...Object.keys(data || {})])).filter(o => !(data as any)?.[o]?.isDeleted);
    const activeAreas = getActiveRegionalAreas(activeNames);
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      return activeNames.filter(o => o === selectedOutlet);
    }
    if (selectedArea && selectedArea !== 'ALL' && activeAreas[selectedArea]) {
      return activeAreas[selectedArea];
    }
    return activeNames;
  }, [selectedOutlet, selectedArea, data]);

  const areaGroups = useMemo(() => {
    const activeNames = Array.from(new Set([...getActiveOutletNames(), ...Object.keys(data || {})])).filter(o => !(data as any)?.[o]?.isDeleted);
    const activeAreas = getActiveRegionalAreas(activeNames);
    const areas = ['JAKARTA', 'TANGGERANG', 'BEKASI & CIBUBUR'];
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      const area = getAreaForOutlet(selectedOutlet);
      return [{ areaName: area, outlets: [selectedOutlet] }];
    }
    if (selectedArea && selectedArea !== 'ALL') {
      const list = activeAreas[selectedArea] || [];
      return [{ areaName: selectedArea, outlets: list }];
    }
    return areas.map(a => ({
      areaName: a,
      outlets: activeAreas[a] || []
    })).filter(g => g.outlets.length > 0);
  }, [selectedOutlet, selectedArea, data]);

  const otData = useMemo(() => {
    // 1. Define Period (26th Prev - 25th Current) as string list to match AttendanceModule
    const getPeriodDays = (month: number, year: number) => {
      const startDate = new Date(year, month - 1, 26);
      const endDate = new Date(year, month, 25, 23, 59, 59);
      
      const days: string[] = [];
      let curr = new Date(startDate);
      while (curr <= endDate) {
        const y = curr.getFullYear();
        const m = (curr.getMonth() + 1).toString().padStart(2, '0');
        const d = curr.getDate().toString().padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        curr.setDate(curr.getDate() + 1);
      }
      return days;
    };

    const currentPeriodDays = getPeriodDays(selectedMonth, selectedYear);
    const lastMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const lastMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const lastPeriodDays = getPeriodDays(lastMonthIdx, lastMonthYear);

    const staffList = (globalData && globalData.staffList) || [];
    const staffDivMap = new Map();
    staffList.forEach(s => s && staffDivMap.set(s.staffId, s.division));

    return displayedOutlets.map((outlet, idx) => {
      // Staff Count - Home Outlet Context
      const assignedStaff = staffList.filter(s => 
        s &&
        s.outlet === outlet && 
        (s.status === 'ACTIVE' || !s.status) &&
        s.division === 'SERVICE'
      );
      const noOfEmployee = assignedStaff.length;
      
      const calculateStats = (days: string[]) => {
        let hours = 0;
        let pay = 0;
        days.forEach(date => {
          const attendance = (globalData.dailyAttendance || {})[date] || [];
          const dailyStatus: Record<string, string> = {};
          attendance.forEach((a: any) => {
            dailyStatus[a.staffId] = a.status;
          });

          const otEntries = (globalData.dailyOvertime || {})[date] || [];
          (otEntries as any[]).forEach(e => {
            // Key Fix: Attribute overtime to the OUTLET where it was worked
            // Filter by the division of the staff member (regardless of home outlet)
            if (e.outlet === outlet && staffDivMap.get(e.staffId) === 'SERVICE') {
              const status = dailyStatus[e.staffId];
              // Only count if they were present (HADIR/PH) on that day
              if (status === 'HADIR' || status === 'PH') {
                hours += (e.overtimeHours || 0);
                pay += (e.overtimePay || 0);
              }
            }
          });
        });
        return { hours, pay };
      };

      const currentStats = calculateStats(currentPeriodDays);
      const lastStats = calculateStats(lastPeriodDays);

      // Budget Overtime per Staff (from settings, default 35 jam x Rp 15.000)
      const otConfig = getStoredOtBudgetSettings();
      const budgetHours = noOfEmployee * otConfig.budgetHours;
      const budget = budgetHours * otConfig.ratePerHour;
      const varPct = budget > 0 ? (currentStats.pay / budget) * 100 : 0;

      return {
        no: idx + 1,
        outlet,
        noOfEmployee,
        totalHours: currentStats.hours,
        totalPay: currentStats.pay,
        lmHours: lastStats.hours,
        lmPay: lastStats.pay,
        budget,
        varPct,
        budgetHours
      };
    });
  }, [globalData.staffList, globalData.dailyOvertime, globalData.dailyAttendance, selectedMonth, selectedYear, displayedOutlets]);

  const handleCopyOvertimeWA = () => {
    const monthName = MONTHS[selectedMonth];
    let template = `*REGIONAL SERVICE OVERTIME REPORT - ${monthName} ${selectedYear}*\n\n`;
    
    let totalHoursAll = 0;
    let totalPayAll = 0;
    let totalStaffAll = 0;

    areaGroups.forEach(group => {
      template += `📍 *AREA: ${group.areaName}*\n`;
      let areaHours = 0;
      let areaPay = 0;
      let areaStaff = 0;
      let areaBudget = 0;

      group.outlets.forEach(outlet => {
        const d = otData.find(item => item.outlet === outlet);
        if (d && (d.totalPay > 0 || d.noOfEmployee > 0)) {
          template += `*${d.outlet}*\n`;
          template += `- Service Staff: ${d.noOfEmployee}\n`;
          template += `- OT Hours: ${d.totalHours.toFixed(1)} HRS\n`;
          template += `- OT Pay: Rp ${d.totalPay.toLocaleString('de-DE')}\n`;
          template += `- Budget (40h/staff): Rp ${d.budget.toLocaleString('de-DE')}\n`;
          template += `- Utilization: ${d.varPct.toFixed(1)}%\n\n`;
          
          areaHours += d.totalHours;
          areaPay += d.totalPay;
          areaStaff += d.noOfEmployee;
          areaBudget += d.budget;
          totalHoursAll += d.totalHours;
          totalPayAll += d.totalPay;
          totalStaffAll += d.noOfEmployee;
        }
      });

      const areaUtil = areaBudget > 0 ? (areaPay / areaBudget) * 100 : 0;
      template += `*SUBTOTAL AREA ${group.areaName}*: ${areaHours.toFixed(1)} HRS | Rp ${areaPay.toLocaleString('de-DE')} (Util: ${areaUtil.toFixed(1)}%)\n`;
      template += `------------------------------------\n\n`;
    });

    const totalBudgetRegional = otData.reduce((acc, curr) => acc + curr.budget, 0);
    const avgUtil = totalBudgetRegional > 0 ? (totalPayAll / totalBudgetRegional) * 100 : 0;
    template += `🏆 *TOTAL REGIONAL SERVICE OVERTIME*\n`;
    template += `* Total Service Staff: ${totalStaffAll}\n`;
    template += `* Total OT Hours: ${totalHoursAll.toFixed(1)} HRS\n`;
    template += `* Total OT Pay: Rp ${totalPayAll.toLocaleString('de-DE')}\n`;
    template += `* Avg Utilization: ${avgUtil.toFixed(1)}%\n\n`;
    template += `*Best Regards & Thank you*`;

    navigator.clipboard.writeText(template).then(() => {
      showToast?.(`Regional Overtime Report berhasil disalin!`, 'success');
    });
  };

  const excelData = useMemo(() => {
    return otData.map(d => ({
      'No': d.no,
      'Outlet': d.outlet,
      'Total Service Staff': d.noOfEmployee,
      'Total OT Hours': d.totalHours.toFixed(2),
      'Total OT Pay': d.totalPay,
      'Budget (40h/staff)': d.budget,
      'Perf %': d.varPct.toFixed(2) + '%'
    }));
  }, [otData]);

  const handleExportOvertimeExcel = async () => {
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Outlet', key: 'outlet', width: 20 },
      { header: 'No of Employee', key: 'noOfEmployee', width: 15 },
      { header: 'Total OT Hours', key: 'totalHours', width: 15 },
      { header: 'Total OT Pay', key: 'totalPay', width: 15 },
      { header: 'LM Hours', key: 'lmHours', width: 15 },
      { header: 'LM Pay', key: 'lmPay', width: 15 },
      { header: 'Budget Hours', key: 'budgetHours', width: 15 },
      { header: 'Budget Pay', key: 'budget', width: 15 },
      { header: 'Utilization %', key: 'varPct', width: 15 },
    ];

    const data = otData.map(d => ({
      no: d.no,
      outlet: d.outlet,
      noOfEmployee: d.noOfEmployee,
      totalHours: d.totalHours,
      totalPay: d.totalPay,
      lmHours: d.lmHours,
      lmPay: d.lmPay,
      budgetHours: d.budgetHours,
      budget: d.budget,
      varPct: d.varPct.toFixed(2) + '%'
    }));

    await exportToExcelWithImages(
      `REGIONAL SERVICE OVERTIME REPORT ${MONTHS[selectedMonth]} ${selectedYear}`,
      columns,
      data
    );
  };

  const reportId = `overtime-report-${selectedMonth}-${selectedYear}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center no-print px-2">
        <div className="flex gap-2">
          <ShareActions 
            targetId={reportId} 
            title={`Regional Overtime Report - ${MONTHS[selectedMonth]} ${selectedYear}`}
            excelData={excelData}
            showToast={showToast}
          />
          <button 
            onClick={handleExportOvertimeExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-file-excel"></i> Export Excel
          </button>
          <button 
            onClick={handleCopyOvertimeWA}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
          >
            <i className="fab fa-whatsapp"></i> Copy Summary
          </button>
        </div>
      </div>
      <div id={reportId} className="overflow-x-auto glass-card bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
        <table className={`w-full text-left border-collapse ${isPreviewMode ? 'min-w-[900px]' : 'min-w-[1200px]'}`}>
          <thead>
            <tr className="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
              <th className="p-2 border-r border-white/10 text-center w-8">NO</th>
              <th className="p-2 border-r border-white/10 min-w-[110px] text-center">OUTLET</th>
              <th className="p-2 border-r border-white/10 text-center">JUMLAH STAFF SERVICE</th>
              <th className="p-2 border-r border-white/10 text-center bg-indigo-500/5">MTD HOURS</th>
              <th className="p-2 border-r border-white/10 text-center bg-indigo-500/5">MTD PAY</th>
              <th className="p-2 border-r border-white/10 text-center opacity-50 uppercase tracking-tighter">LM HOURS</th>
              <th className="p-2 border-r border-white/10 text-center opacity-50 uppercase tracking-tighter">LM PAY</th>
              <th className="p-2 border-r border-white/10 text-center">BUDGET 40H/STAFF</th>
              <th className="p-2 text-center text-indigo-400">PERF %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {areaGroups.map((group) => {
              const areaItems = group.outlets.map(o => otData.find(d => d.outlet === o)).filter(Boolean) as typeof otData;
              const areaStaff = areaItems.reduce((acc, curr) => acc + curr.noOfEmployee, 0);
              const areaHours = areaItems.reduce((acc, curr) => acc + curr.totalHours, 0);
              const areaPay = areaItems.reduce((acc, curr) => acc + curr.totalPay, 0);
              const areaLMHours = areaItems.reduce((acc, curr) => acc + curr.lmHours, 0);
              const areaLMPay = areaItems.reduce((acc, curr) => acc + curr.lmPay, 0);
              const areaBudget = areaItems.reduce((acc, curr) => acc + curr.budget, 0);
              const areaPerf = areaBudget > 0 ? (areaPay / areaBudget) * 100 : 0;

              return (
                <React.Fragment key={group.areaName}>
                  {/* AREA HEADER */}
                  <tr className="bg-slate-950/90 border-t-2 border-indigo-500/30 border-b border-white/10">
                    <td colSpan={9} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                          <span className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">
                            AREA: {group.areaName}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-white/5">
                            {group.outlets.length} Outlets
                          </span>
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                          SUBTOTAL {group.areaName}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* OUTLET ROWS */}
                  {areaItems.map((d, idx) => (
                    <tr key={d.outlet} className={`${isPreviewMode ? 'text-[8px]' : 'text-[10px]'} font-black text-slate-300 hover:bg-slate-800/50 transition-colors`}>
                      <td className="p-2 border-r border-white/10 text-center text-slate-500">{idx + 1}</td>
                      <td className="p-2 border-r border-white/10 font-black uppercase text-white">
                        <div className="flex flex-col">
                          <span className="text-white">{d.outlet.split(' ')[0]}</span>
                          <span className="text-indigo-400 font-black text-[8px]">{d.outlet.split(' ').slice(1).join(' ')}</span>
                        </div>
                      </td>
                      <td className="p-2 border-r border-white/10 text-center text-emerald-400 font-black tracking-widest">{d.noOfEmployee}</td>
                      <td className="p-2 border-r border-white/10 text-center text-indigo-400 bg-indigo-500/5">{d.totalHours.toFixed(1)} <span className="text-[7px]">HRS</span></td>
                      <td className="p-2 border-r border-white/10 text-center text-yellow-500 bg-yellow-500/5">Rp {d.totalPay.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-white/10 text-center text-slate-600 font-normal italic uppercase">{d.lmHours.toFixed(1)}</td>
                      <td className="p-2 border-r border-white/10 text-center text-slate-600 font-normal italic uppercase">Rp {d.lmPay.toLocaleString('id-ID')}</td>
                      <td className="p-2 border-r border-white/10 text-center text-slate-500">{d.budget > 0 ? `Rp ${d.budget.toLocaleString('id-ID')}` : '-'}</td>
                      <td className={`p-2 text-center font-black ${d.varPct > 100 ? 'text-rose-400 bg-rose-500/5' : 'text-emerald-400 bg-emerald-500/5'}`}>
                        {d.varPct > 0 ? `${d.varPct.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  ))}

                  {/* AREA SUBTOTAL */}
                  <tr className="bg-indigo-950/40 text-indigo-200 text-[10px] font-black border-b-2 border-white/10">
                    <td className="p-2 border-r border-white/10 text-center font-black text-indigo-400">Σ</td>
                    <td className="p-2 border-r border-white/10 uppercase tracking-wider text-indigo-300">TOTAL AREA {group.areaName}</td>
                    <td className="p-2 border-r border-white/10 text-center text-emerald-400">{areaStaff}</td>
                    <td className="p-2 border-r border-white/10 text-center text-indigo-300 bg-indigo-900/20">{areaHours.toFixed(1)} HRS</td>
                    <td className="p-2 border-r border-white/10 text-center text-yellow-400 bg-yellow-900/10 font-black">Rp {areaPay.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-center text-slate-400">{areaLMHours.toFixed(1)}</td>
                    <td className="p-2 border-r border-white/10 text-center text-slate-400">Rp {areaLMPay.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-r border-white/10 text-center text-slate-400">Rp {areaBudget.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-center font-black text-indigo-300">
                      {areaBudget > 0 ? `${areaPerf.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-950/80 text-[10px] font-black text-white border-t border-white/10">
              <td colSpan={2} className="p-3 text-right uppercase tracking-widest">Global Aggregate</td>
              <td className="p-3 text-center text-emerald-400">{otData.reduce((a, b) => a + b.noOfEmployee, 0)}</td>
              <td className="p-3 text-center text-indigo-400 bg-indigo-900/10 border-r border-white/10">{otData.reduce((a, b) => a + b.totalHours, 0).toFixed(1)} HRS</td>
              <td className="p-3 text-center text-yellow-500 bg-indigo-900/10 border-r border-white/10 font-black">Rp {otData.reduce((a, b) => a + b.totalPay, 0).toLocaleString('id-ID')}</td>
              <td className="p-3 text-center text-slate-600 border-r border-white/10">{otData.reduce((a, b) => a + b.lmHours, 0).toFixed(1)}</td>
              <td className="p-3 text-center text-slate-600 border-r border-white/10">Rp {otData.reduce((a, b) => a + b.lmPay, 0).toLocaleString('id-ID')}</td>
              <td className="p-3 text-center text-slate-500 border-r border-white/10">Rp {otData.reduce((a, b) => a + b.budget, 0).toLocaleString('id-ID')}</td>
              <td className="p-3 text-center font-black text-indigo-400">
                {(() => {
                  const totalPay = otData.reduce((a, b) => a + b.totalPay, 0);
                  const totalBudget = otData.reduce((a, b) => a + b.budget, 0);
                  return totalBudget > 0 ? `${((totalPay / totalBudget) * 100).toFixed(1)}%` : '-';
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// --- MAIN MODULE ---
interface RMProps {
  data: AppState;
  allOutletsData: Record<string, any>;
  isLoading: boolean;
  selectedMonth: number;
  selectedYear: number;
  onPeriodChange: (month: number, year: number) => void;
  initialTab?: 'OVERVIEW' | 'REVENUE_MTD' | 'OVERTIME_MTD' | 'QA' | 'COMPLAINT_SERVICE' | 'CPA_SERVICE' | 'AUDIT_SERVICE' | 'REVIEWS' | 'GSI' | 'SATISFACTION' | 'COMPLIMENTARY' | 'CITY_LEDGER' | 'YTD' | 'LEAVE_CREW' | 'ATTENDANCE_CREW' | 'STAFF_RESIGN' | 'REKAPAN_PATTY_CASH' | 'REKAPAN_OVERTIME' | 'REKAPAN_DISCOUNT' | 'THIRD_PARTY_GAS' | 'REKAPAN_LOGISTIK';
  restrictTabs?: boolean;
  onRefresh?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | "info") => void;
  onUpdate?: (key: keyof AppState, value: any) => void;
  moduleType?: string;
  selectedOutlet?: string;
}

const RegionalManagerModule: React.FC<RMProps> = ({ 
  data: globalData, 
  allOutletsData, 
  isLoading, 
  selectedMonth: rawSelectedMonth,
  selectedYear: rawSelectedYear,
  onPeriodChange,
  initialTab = 'OVERVIEW', 
  restrictTabs = true,
  onRefresh,
  showToast,
  onUpdate,
  selectedOutlet: initialSelectedOutlet
}) => {
  const safeSelectedMonth = (rawSelectedMonth !== undefined && rawSelectedMonth !== null && !isNaN(Number(rawSelectedMonth))) 
    ? Math.max(0, Math.min(11, Number(rawSelectedMonth))) 
    : new Date().getMonth();

  const safeSelectedYear = (rawSelectedYear && !isNaN(Number(rawSelectedYear))) 
    ? Number(rawSelectedYear) 
    : new Date().getFullYear();

  const selectedMonth = safeSelectedMonth;
  const selectedYear = safeSelectedYear;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<string>(initialSelectedOutlet || '');
  const [selectedArea, setSelectedArea] = useState<string>('ALL');

  React.useEffect(() => {
    if (initialSelectedOutlet) {
      setSelectedOutlet(initialSelectedOutlet);
    }
  }, [initialSelectedOutlet]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [activeOutletConfigs, setActiveOutletConfigs] = useState<OutletConfig[]>(() => getActiveOutletConfigs());

  useEffect(() => {
    const handleOutletConfigChange = () => {
      setActiveOutletConfigs(getActiveOutletConfigs());
    };
    window.addEventListener('appOutletConfigsChanged', handleOutletConfigChange);
    window.addEventListener('appOutletDeleted', handleOutletConfigChange);
    return () => {
      window.removeEventListener('appOutletConfigsChanged', handleOutletConfigChange);
      window.removeEventListener('appOutletDeleted', handleOutletConfigChange);
    };
  }, []);

  const availableOutlets = useMemo(() => {
    const activeNames = getActiveOutletNames(activeOutletConfigs);
    const set = new Set<string>();
    activeNames.forEach(name => {
      const d = allOutletsData?.[name];
      if (!d || !d.isDeleted) {
        set.add(name);
      }
    });
    // Also include any outlet that is currently in allOutletsData from database
    Object.entries(allOutletsData || {}).forEach(([name, d]: [string, any]) => {
      if (!d || !d.isDeleted) {
        set.add(name);
      }
    });
    return Array.from(set).filter(Boolean);
  }, [allOutletsData, activeOutletConfigs]);

  const activeRegionalAreas = useMemo(() => {
    return getActiveRegionalAreas(availableOutlets);
  }, [availableOutlets]);

  useEffect(() => {
    if (selectedOutlet && !availableOutlets.includes(selectedOutlet)) {
      setSelectedOutlet('');
    }
  }, [availableOutlets, selectedOutlet]);

  const aggregatedGlobalData = useMemo(() => buildAggregatedGlobalData(allOutletsData, globalData), [allOutletsData, globalData]);

  const activeData = useMemo(() => {
    if (selectedOutlet && selectedOutlet !== 'ALL') {
      const outletData = allOutletsData[selectedOutlet] || {};
      const monthData = outletData[String(selectedMonth)] || outletData[selectedMonth] || {};
      
      const outletStaffList = (outletData.staffList && outletData.staffList.length > 0)
        ? outletData.staffList
        : (monthData.staffList && monthData.staffList.length > 0)
        ? monthData.staffList
        : (aggregatedGlobalData.staffList || []).filter((s: any) => s && s.outlet === selectedOutlet);
      
      const activeStaffIds = new Set(outletStaffList.map((s: any) => s.staffId));
      
      const outletLeaveRecords = (outletData.leaveRecords && outletData.leaveRecords.length > 0)
        ? outletData.leaveRecords
        : (monthData.leaveRecords && monthData.leaveRecords.length > 0)
        ? monthData.leaveRecords
        : (aggregatedGlobalData.leaveRecords || []).filter((r: any) => r && (r.outlet === selectedOutlet || activeStaffIds.has(r.staffId)));

      const outletAttendance: Record<string, any[]> = {};
      const sourceAttendance = monthData.dailyAttendance || outletData.dailyAttendance || aggregatedGlobalData.dailyAttendance || {};
      Object.entries(sourceAttendance).forEach(([d, arr]: [string, any]) => {
        if (Array.isArray(arr)) {
          const filtered = arr.filter((a: any) => a && (a.outlet === selectedOutlet || activeStaffIds.has(a.staffId)));
          if (filtered.length > 0) outletAttendance[d] = filtered;
        }
      });

      const outletOvertime: Record<string, any[]> = {};
      const sourceOvertime = monthData.dailyOvertime || outletData.dailyOvertime || aggregatedGlobalData.dailyOvertime || {};
      Object.entries(sourceOvertime).forEach(([d, arr]: [string, any]) => {
        if (Array.isArray(arr)) {
          const filtered = arr.filter((o: any) => o && (o.outlet === selectedOutlet || activeStaffIds.has(o.staffId)));
          if (filtered.length > 0) outletOvertime[d] = filtered;
        }
      });

      const outletComplaints = (monthData.guestComplaints && monthData.guestComplaints.length > 0)
        ? monthData.guestComplaints
        : (outletData.guestComplaints && outletData.guestComplaints.length > 0)
        ? outletData.guestComplaints
        : (aggregatedGlobalData.guestComplaints || []).filter((c: any) => c && c.outlet === selectedOutlet);

      const isCurrentSessionOutlet = globalData && (globalData as any).outlet === selectedOutlet;

      const salesData = monthData.sales || outletData.sales || (isCurrentSessionOutlet ? globalData.sales : INITIAL_STATE.sales);

      return {
        ...INITIAL_STATE,
        ...(isCurrentSessionOutlet ? globalData : {}),
        ...outletData,
        ...monthData,
        outlet: selectedOutlet,
        sales: salesData,
        staffList: outletStaffList,
        leaveRecords: outletLeaveRecords,
        dailyAttendance: outletAttendance,
        dailyOvertime: outletOvertime,
        guestComplaints: outletComplaints,
      };
    }
    return aggregatedGlobalData;
  }, [selectedOutlet, allOutletsData, aggregatedGlobalData, selectedMonth, globalData]);

  const tabProps = { 
    data: allOutletsData, 
    selectedOutlet, 
    selectedArea,
    onSelectArea: setSelectedArea,
    selectedMonth, 
    selectedYear, 
    globalData: activeData, 
    isPreviewMode, 
    showToast, 
    onUpdate 
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const TABS = [
    { id: 'OVERVIEW', label: 'Summary', icon: 'fa-tachometer-alt', sub: 'Regional Performance & 1Y Report' },
    { id: 'REVENUE_MTD', label: 'Daily Revenue', icon: 'fa-chart-line', sub: 'Revenue Report' },
    { id: 'REVENUE_CONTRIBUTION', label: 'Kontribusi L/D', icon: 'fa-pie-chart', sub: '% Lunch/Dinner vs Target Today' },
    { id: 'WEEKDAY_WEEKEND_AVG', label: 'Weekday & Weekend', icon: 'fa-arrows-split-up-and-left', sub: 'Rata2 Revenue Per Weekly' },
    { id: 'WEEKLY_REVENUE', label: 'Rekapan Weekly', icon: 'fa-calendar-week', sub: 'Target Lunch & Dinner MTD' },
    { id: 'WEEKLY_OVERTIME', label: 'Rekap Overtime', icon: 'fa-business-time', sub: 'Lembur Per Divisi' },
    { id: 'MANPOWER_REGIONAL', label: 'Report Man Power', icon: 'fa-users-cog', sub: 'Rekap Manpower Sesuai Outlet' },
    { id: 'QA_REPORT_REGIONAL', label: 'QA 3 Bulan', icon: 'fa-award', sub: 'Report QA 3 Divisi & Passing Score' },
    { id: 'RECEIVING_SHEET', label: 'Receiving Sheet', icon: 'fa-file-invoice-dollar', sub: 'Belanja Supplier' },
    { id: 'COGS', label: 'COGS & Forecast', icon: 'fa-calculator', sub: 'HPP & Forecast Rev' },
    { id: 'SUMMARY_REPORT', label: 'Summary Report', icon: 'fa-file-invoice', sub: 'COGS, OPEX & Ratios' },
    { id: 'ENERGY_COST', label: 'Energy Cost', icon: 'fa-bolt', sub: 'Listrik, Gas & Air' },
    { id: 'PATTY_CASH_EXPENSE', label: 'Patty Cash Expense', icon: 'fa-wallet', sub: 'Patty Cash & Matrix' },
    { id: 'COMMODITY_KITCHEN_BAR', label: 'Belanja Commodity', icon: 'fa-utensils', sub: 'Rekapan Kitchen & Bar' },
    { id: 'THIRD_PARTY_GAS', label: 'Third Party & Gas', icon: 'fa-gas-pump', sub: 'Third Party & Gas' },
    { id: 'REKAPAN_LOGISTIK', label: 'Rekapan Logistik', icon: 'fa-boxes', sub: 'Inventory & Logistik' },
    { id: 'MAIN_STORE_KITCHEN', label: 'Main Store & Kitchen', icon: 'fa-warehouse', sub: 'MS/MK Requisition' },
    { id: 'CITY_LEDGER', label: 'City Ledger', icon: 'fa-building', sub: 'Account Receivables' },
    { id: 'SATISFACTION', label: 'Guest Satisfaction', icon: 'fa-face-smile', sub: 'Customer & Matrix' },
    { id: 'GSI_REGIONAL', label: 'Rekapan GSI', icon: 'fa-poll', sub: 'Total Respon & % Subject' },
    { id: 'GOOGLE_REVIEW_REGIONAL', label: 'Google Review', icon: 'fa-star', sub: 'Total Review & Rating' },
    { id: 'COMPLIMENTARY', label: 'Complimentary', icon: 'fa-gift', sub: 'Promo & Matrix' },
    { id: 'BANKING_PROMO_REGIONAL', label: 'Rekapan Promo Bank', icon: 'fa-tags', sub: 'Promo Aktif & History Promo' },
    { id: 'STRATEGI_MENU_REGIONAL', label: 'Menu Strategi', icon: 'fa-bullseye', sub: 'Penyeimbang & Percepatan' },
    { id: 'VOID_BILL_REGIONAL', label: 'Rekapan Void Bill', icon: 'fa-ban', sub: 'Akumulasi Kesalahan Staff' },
  ];

  const visibleTabs = useMemo(() => {
    if (!restrictTabs) return TABS;
    return TABS; 
  }, [restrictTabs]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Aggregating Regional Analytics...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col animate-fade-in pb-20 ${isPreviewMode ? 'fixed inset-0 z-[100] bg-slate-950 p-4 md:p-6 overflow-y-auto gap-4' : 'gap-8'}`}>

      {/* PREVIEW MODE HEADER */}
      {isPreviewMode && (
        <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-[1.5rem] border border-white/10 sticky top-0 z-50">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                <i className="fas fa-expand text-white"></i>
             </div>
             <div>
                <h2 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">Full Preview</h2>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Regional Analytics Suite</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/10">
                <i className="fas fa-map-marker-alt text-amber-400 text-xs"></i>
                <select
                  value={selectedArea}
                  onChange={(e) => {
                    setSelectedArea(e.target.value);
                    if (e.target.value !== 'ALL' && selectedOutlet && getAreaForOutlet(selectedOutlet) !== e.target.value) {
                      setSelectedOutlet('');
                    }
                  }}
                  className="bg-transparent text-amber-200 font-black text-xs outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">Semua Area</option>
                  <option value="JAKARTA" className="bg-slate-900 text-white">JAKARTA</option>
                  <option value="TANGGERANG" className="bg-slate-900 text-white">TANGGERANG</option>
                  <option value="BEKASI & CIBUBUR" className="bg-slate-900 text-white">BEKASI & CIBUBUR</option>
                </select>
             </div>
             <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/10">
                <i className="fas fa-store text-indigo-400 text-xs"></i>
                 <select
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                  className="bg-transparent text-indigo-200 font-black text-xs outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-900 text-white">Semua Outlet (Combined)</option>
                  {Object.entries(activeRegionalAreas).map(([areaName, oList]: [string, string[]]) => (
                    oList.length > 0 ? (
                      <optgroup key={areaName} label={areaName} className="bg-slate-900 text-amber-400 font-black">
                        {oList.map(o => (
                          <option key={o} value={o} className="bg-slate-900 text-white font-normal">{o}</option>
                        ))}
                      </optgroup>
                    ) : null
                  ))}
                </select>
             </div>
             <div className="text-xs font-black text-white px-4 py-2 bg-slate-800 rounded-xl border border-white/5 uppercase">
                {MONTHS[selectedMonth]} {selectedYear}
             </div>
             <button 
               onClick={() => setIsPreviewMode(false)}
               className="p-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-xl transition-all active:scale-95 flex items-center gap-2 text-xs font-black uppercase"
             >
               <i className="fas fa-times"></i> Exit Preview
             </button>
          </div>
        </div>
      )}

      {/* HORIZONTAL HEADER NAVIGATION */}
      {!isPreviewMode && (
        <header className="glass-card bg-slate-900 border-white/5 overflow-hidden rounded-[2.5rem]">
          <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-white/5">
            {/* Brand & Period & Outlet Selector */}
            <div className="p-6 xl:w-80 space-y-4 bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
                  <i className="fas fa-chart-network text-white"></i>
                </div>
                <div>
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">Regional</h2>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Analytics Suite</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedArea}
                    onChange={(e) => {
                      setSelectedArea(e.target.value);
                      if (e.target.value !== 'ALL' && selectedOutlet && getAreaForOutlet(selectedOutlet) !== e.target.value) {
                        setSelectedOutlet('');
                      }
                    }}
                    className="bg-slate-950 border border-amber-500/40 rounded-xl px-2.5 py-2 text-amber-300 font-black text-[10px] outline-none tracking-wider uppercase focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">🌐 SEMUA AREA</option>
                    <option value="JAKARTA">📍 JAKARTA</option>
                    <option value="TANGGERANG">📍 TANGGERANG</option>
                    <option value="BEKASI & CIBUBUR">📍 BEKASI & CIBUBUR</option>
                  </select>

                  <select
                    value={selectedOutlet}
                    onChange={(e) => setSelectedOutlet(e.target.value)}
                    className="bg-slate-950 border border-indigo-500/30 rounded-xl px-2.5 py-2 text-white font-black text-[10px] outline-none tracking-wider uppercase focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- ALL OUTLETS --</option>
                    {Object.entries(activeRegionalAreas).map(([areaName, oList]: [string, string[]]) => (
                      oList.length > 0 ? (
                        <optgroup key={areaName} label={areaName} className="bg-slate-900 text-amber-400 font-black">
                          {oList.map(o => (
                            <option key={o} value={o} className="bg-slate-900 text-white font-normal">{o}</option>
                          ))}
                        </optgroup>
                      ) : null
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedOutlet('');
                      setSelectedArea('ALL');
                    }}
                    className={`w-full py-2 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                      !selectedOutlet && selectedArea === 'ALL'
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/40 shadow-lg shadow-indigo-950/40'
                        : 'bg-slate-950 text-slate-400 hover:text-white border-white/10'
                    }`}
                  >
                    <i className="fas fa-layer-group text-xs"></i>
                    <span>BUTTON ALL OUTLET (REGIONAL)</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <select 
                    value={selectedMonth} 
                    onChange={(e) => onPeriodChange(Number(e.target.value), selectedYear)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-black text-[10px] outline-none"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select 
                    value={selectedYear} 
                    onChange={(e) => onPeriodChange(selectedMonth, Number(e.target.value))}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-black text-[10px] outline-none"
                  >
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button 
                    onClick={onRefresh}
                    className="bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl px-3 py-2 text-white font-black text-[10px] outline-none flex items-center justify-center gap-2"
                    title="Sync All Data"
                  >
                    <i className="fas fa-sync"></i>
                  </button>
                  <button 
                    onClick={() => setIsPreviewMode(!isPreviewMode)}
                    className={`${isPreviewMode ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'} border border-white/10 rounded-xl px-3 py-2 text-white font-black text-[10px] outline-none flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20`}
                  >
                    <i className={`fas ${isPreviewMode ? 'fa-compress' : 'fa-expand'}`}></i> {isPreviewMode ? 'Exit' : 'Full'}
                  </button>
                </div>

                {/* AREA ORDER SCHEDULE INFO CHIP */}
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-1 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase tracking-wider text-slate-400 text-[9px] flex items-center gap-1">
                      <i className="fas fa-truck-fast text-indigo-400"></i> Hari Order
                    </span>
                    <span className="font-black text-amber-300 font-mono text-[10px]">
                      {selectedOutlet ? getOrderScheduleForOutlet(selectedOutlet).label : (selectedArea && ORDER_SCHEDULES_BY_AREA[selectedArea] ? ORDER_SCHEDULES_BY_AREA[selectedArea].label : 'Selasa, Kamis & Sabtu')}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400">
                    Jakarta (Cipete, Kemang, Lebak Bulus) & SMB Bekasi + Cibubur: <span className="text-amber-400 font-bold">Selasa, Kamis & Sabtu</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs - Horizontal "Mengurai ke Samping" */}
            <div className="flex-1 flex items-center relative gap-2 px-2 group/nav overflow-hidden bg-slate-900/50">
               <button 
                 onClick={() => scrollTabs('left')}
                 className="flex-none w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-all border border-white/5 active:scale-90"
               >
                 <i className="fas fa-chevron-left text-xs"></i>
               </button>
               
               <nav 
                 ref={scrollRef}
                 className="flex-1 flex overflow-x-auto no-scrollbar scroll-smooth gap-1 py-4"
               >
                 {visibleTabs.map(tab => (
                   <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as any)}
                     className={`flex-none w-[160px] flex flex-col items-center justify-center p-4 transition-all relative group rounded-2xl border ${
                       activeTab === tab.id 
                         ? 'bg-indigo-600 border-indigo-400/50 shadow-lg shadow-indigo-900/40' 
                         : 'bg-slate-800/40 border-white/5 hover:bg-white/5 hover:border-white/10'
                     }`}
                   >
                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all ${
                       activeTab === tab.id ? 'bg-white text-indigo-600' : 'bg-slate-800 text-slate-500'
                     }`}>
                       <i className={`fas ${tab.icon} text-xs`}></i>
                     </div>
                     <div className="text-center">
                       <div className={`text-[10px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`}>
                         {tab.label}
                       </div>
                       <div className={`text-[7px] font-bold uppercase ${activeTab === tab.id ? 'text-indigo-200' : 'text-slate-600'}`}>
                         {tab.sub}
                       </div>
                     </div>
                   </button>
                 ))}
               </nav>

               <button 
                 onClick={() => scrollTabs('right')}
                 className="flex-none w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-all border border-white/5 active:scale-90"
               >
                 <i className="fas fa-chevron-right text-xs"></i>
               </button>
            </div>
          </div>
        </header>
      )}

      {/* CONTENT AREA */}
      <main className="space-y-6 relative">
        {isLoading && (
          <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center rounded-[3rem] animate-in fade-in duration-300">
            <div className="bg-slate-950/80 p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 shadow-2xl">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Loading Regional Data...</p>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="mb-6 flex justify-between items-end px-2">
               <div className="flex items-center gap-4">
                  {isPreviewMode && (
                    <button 
                      onClick={() => setIsPreviewMode(false)}
                      className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition-all border border-white/10"
                    >
                      <i className="fas fa-times text-xl"></i>
                    </button>
                  )}
                  <div>                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                      {activeTab === 'OVERVIEW' && 'Regional Performance Overview & 1-Year Summary'}
                      {activeTab === 'REVENUE_MTD' && 'Regional Report - Daily Revenue'}
                      {activeTab === 'REVENUE_CONTRIBUTION' && 'Rekapan % Kontribusi Revenue Lunch & Dinner Terhadap Target Today'}
                      {activeTab === 'WEEKDAY_WEEKEND_AVG' && 'Rekapan Rata-Rata Revenue Weekday (Senin-Jumat) & Weekend (Sabtu-Minggu) Per Weekly'}
                      {activeTab === 'WEEKLY_REVENUE' && 'Regional Weekly Revenue & Daypart Performance (Target Kontribusi Sesuai MTD Outlet)'}
                      {activeTab === 'WEEKLY_OVERTIME' && 'Regional Rekapitulasi Weekly Overtime (Lembur Per Divisi)'}
                      {activeTab === 'MANPOWER_REGIONAL' && 'Regional Report Man Power (Sesuai Inputan Setiap Outlet)'}
                      {activeTab === 'QA_REPORT_REGIONAL' && 'Regional Report Quality Assurance (3 Bulan) & Passing Score'}
                      {activeTab === 'COGS' && 'Regional COGS & Forecast Revenue Control'}
                      {activeTab === 'RECEIVING_SHEET' && 'Regional Receiving Sheet (Belanja & Supplier Cost)'}
                      {activeTab === 'OUTLET_PERFORMANCE' && 'Regional Outlet Performance & OPEX Ratio'}
                      {activeTab === 'REKAPAN_PATTY_CASH' && 'Regional Rekapan Patty Cash (OPEX)'}
                      {(activeTab === 'THIRD_PARTY_GAS' || activeTab === 'REKAPAN_DISCOUNT') && 'Regional Belanja Third Party & Gas'}
                      {activeTab === 'REKAPAN_LOGISTIK' && 'Regional Rekapan Logistik'}
                      {activeTab === 'WEEKLY_REPORT' && 'Regional Weekly Performance'}
                      {activeTab === 'SATISFACTION' && 'Ledger: Guest Satisfaction'}
                      {activeTab === 'COMPLIMENTARY' && 'Ledger: Complimentary'}
                      {activeTab === 'CITY_LEDGER' && 'Ledger: City Ledger'}
                      {activeTab === 'ENERGY_COST' && 'Regional Energy Cost (Listrik, Gas & Air)'}
                      {activeTab === 'PATTY_CASH_EXPENSE' && 'Regional Rekapan Patty Cash (OPEX)'}
                      {activeTab === 'MAIN_STORE_KITCHEN' && 'Regional Main Store & Kitchen Requisition'}
                      {activeTab === 'STRATEGI_MENU_REGIONAL' && 'Regional Rekapan Menu Strategi (Penyeimbang & Percepatan Lunch & Dinner)'}
                    </h3>
                    {selectedOutlet && (
                      <span className="inline-block mt-1 px-3 py-1 bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider">
                        Filter Outlet: {selectedOutlet}
                      </span>
                    )}
                    <div className="h-1 w-20 bg-indigo-600 mt-2 rounded-full"></div>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  {!isPreviewMode && (
                    <button
                      onClick={() => setIsPreviewMode(true)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/40 transition-all font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-900/10"
                    >
                      <i className="fas fa-expand"></i> Preview Full
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                      {isPreviewMode ? 'SYNC STATUS' : 'Reporting Period'}
                    </p>
                    <div className="flex flex-col items-end">
                      <p className="text-xs font-black text-white uppercase">{MONTHS[selectedMonth]} {selectedYear}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                          Live Connected
                        </p>
                      </div>
                      {(() => {
                        const lastUpdates = Object.values(allOutletsData)
                          .map((d: any) => d._lastUpdated)
                          .filter(Boolean)
                          .sort()
                          .reverse();
                        if (lastUpdates.length > 0) {
                          const lastDate = new Date(lastUpdates[0]);
                          return (
                            <p className="text-[7px] font-black text-slate-600 uppercase tracking-tighter mt-0.5">
                              Last Data Entry: {lastDate.toLocaleDateString()} {lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
               </div>
            </div>

            <div className={`glass-card ${isPreviewMode ? 'p-1 md:p-2' : 'p-8'} bg-slate-900 border-white/5 rounded-[3rem]`}>
              {activeTab === 'OVERVIEW' && <ConsolidatedOverviewTab {...tabProps} />}
              {activeTab === 'REVENUE_MTD' && <RevenueTab {...tabProps} />}
              {activeTab === 'REVENUE_CONTRIBUTION' && (
                <RegionalRevenueContributionTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'WEEKDAY_WEEKEND_AVG' && (
                <RegionalWeekdayWeekendRevenueTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'WEEKLY_REVENUE' && (
                <RegionalWeeklyRevenueRecapTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'WEEKLY_OVERTIME' && (
                <RegionalWeeklyOvertimeRecapTable
                  allOutletsData={allOutletsData}
                  globalData={activeData || globalData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'MANPOWER_REGIONAL' && (
                <RegionalManpowerRecapTable
                  allOutletsData={allOutletsData}
                  globalData={activeData || globalData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'QA_REPORT_REGIONAL' && (
                <RegionalQARecapTable
                  allOutletsData={allOutletsData}
                  globalData={activeData || globalData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'COGS' && (
                <RegionalCogsRecapTable
                  allOutletsData={allOutletsData}
                  data={activeData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'RECEIVING_SHEET' && (
                <ReceivingSheetModule 
                  data={activeData} 
                  onUpdate={onUpdate} 
                  showToast={showToast} 
                  selectedOutlet={selectedOutlet || 'ALL'}
                  allMonthlyData={allOutletsData}
                  filters={{ month: String(selectedMonth), year: String(selectedYear), startDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`, endDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-28` }}
                />
              )}
              {activeTab === 'OUTLET_PERFORMANCE' && (
                <OutletPerformanceModule 
                  data={activeData} 
                  onUpdate={(k, v) => onUpdate && onUpdate(k, v)}
                  filters={{ month: String(selectedMonth), year: String(selectedYear), startDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`, endDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-28` }}
                  showToast={showToast}
                />
              )}
              {activeTab === 'REKAPAN_PATTY_CASH' && (
                <PattyCashOpexRekapanModule 
                  data={activeData} 
                  allMonthlyData={selectedOutlet && allOutletsData[selectedOutlet] ? allOutletsData[selectedOutlet] : allOutletsData}
                  filters={{ month: String(selectedMonth), year: String(selectedYear), outlet: selectedOutlet || 'ALL' }}
                  selectedOutlet={selectedOutlet || 'ALL'}
                  onUpdate={onUpdate}
                  showToast={showToast}
                />
              )}
              {(activeTab === 'THIRD_PARTY_GAS' || activeTab === 'REKAPAN_DISCOUNT') && (
                <ThirdPartyGasModule 
                  data={activeData} 
                  allMonthlyData={allOutletsData}
                  filters={{ month: String(selectedMonth), year: String(selectedYear), outlet: selectedOutlet || 'ALL', startDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`, endDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-28` }}
                  selectedOutlet={selectedOutlet || 'ALL'}
                  isRegionalView={true}
                  onUpdate={(updater) => {
                    if (onUpdate) {
                      const updated = typeof updater === 'function' ? (updater as any)(activeData) : updater;
                      if (updated.dailyThirdPartyLedger) onUpdate('dailyThirdPartyLedger', updated.dailyThirdPartyLedger);
                      if (updated.dailyGasLedger) onUpdate('dailyGasLedger', updated.dailyGasLedger);
                    }
                  }}
                  showToast={showToast}
                />
              )}
              {activeTab === 'REKAPAN_LOGISTIK' && (
                <LogisticsModule 
                  data={activeData} 
                  onUpdate={(updates) => {
                    if (onUpdate) {
                      Object.entries(updates).forEach(([k, v]) => onUpdate(k as keyof AppState, v));
                    }
                  }} 
                  selectedDate={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`}
                  selectedOutlet={selectedOutlet}
                  showToast={showToast || (() => {})}
                  filterMonth={String(selectedMonth)}
                  filterYear={String(selectedYear)}
                />
              )}
              {(activeTab === 'SUMMARY_REPORT' || activeTab === 'GSI') && (
                <SummaryReportModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear), startDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`, endDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-28` }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'PATTY_CASH_EXPENSE' && (
                <PattyCashExpenseModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  selectedArea={selectedArea}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'COMMODITY_KITCHEN_BAR' && (
                <RegionalCommodityRecapTable
                  allOutletsData={allOutletsData}
                  data={activeData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'MAIN_STORE_KITCHEN' && (
                <MainStoreKitchenModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'SATISFACTION' && (
                <GuestSatisfactionModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'GSI_REGIONAL' && (
                <RegionalGSIRecapTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'GOOGLE_REVIEW_REGIONAL' && (
                <RegionalGoogleReviewRecapTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'COMPLIMENTARY' && (
                <ComplimentaryModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'BANKING_PROMO_REGIONAL' && (
                <RegionalPromoRecapTable
                  allOutletsData={allOutletsData}
                  data={activeData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'STRATEGI_MENU_REGIONAL' && (
                <RegionalStrategiMenuRecapTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
              {activeTab === 'CITY_LEDGER' && (
                <CityLedgerModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                />
              )}
              {activeTab === 'ENERGY_COST' && (
                <EnergyCostModule
                  data={activeData}
                  allMonthlyData={allOutletsData}
                  selectedOutlet={selectedOutlet}
                  filters={{ month: String(selectedMonth), year: String(selectedYear) }}
                  showToast={showToast}
                  isRegionalView={true}
                  onUpdate={(updater) => {
                    if (onUpdate) {
                      const updated = updater(activeData);
                      onUpdate('energyCost' as any, updated.energyCost);
                    }
                  }}
                />
              )}
              {activeTab === 'VOID_BILL_REGIONAL' && (
                <RegionalVoidBillRecapTable
                  allOutletsData={allOutletsData}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  selectedArea={selectedArea}
                  selectedOutlet={selectedOutlet}
                  onSelectOutlet={setSelectedOutlet}
                  showToast={showToast}
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default RegionalManagerModule;
