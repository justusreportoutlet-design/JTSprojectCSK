import React, { useRef, useState, useMemo, useEffect } from 'react';
import { AppState, DailySalesData, ExpenseData, LedgerItem, Outlet, GSIRow, GoogleReviewData } from '../types';
import { OT_RATE, INITIAL_GSI_STRUCTURE, getStoredBankPromos } from '../constants';
import ShareActions from './ShareActions';
import { safeWindow } from '../lib/safeStorage';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Text } from 'recharts';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Props {
  data: AppState;
  filters: { month: string; startDate: string; endDate: string };
  selectedOutlet: Outlet;
  allMonthlyData?: Record<string, Partial<AppState>>;
}

const ReportingModule: React.FC<Props> = ({ data, filters, selectedOutlet, allMonthlyData }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [promoConfigVersion, setPromoConfigVersion] = useState<number>(0);

  useEffect(() => {
    const handlePromoChange = () => setPromoConfigVersion(v => v + 1);
    window.addEventListener('appPromoSettingsChanged', handlePromoChange);
    return () => window.removeEventListener('appPromoSettingsChanged', handlePromoChange);
  }, []);

  const safeStartDate = useMemo(() => {
    if (filters?.startDate) return filters.startDate;
    const year = filters?.year || new Date().getFullYear();
    const monthNum = Number(filters?.month ?? 0) + 1;
    return `${year}-${String(monthNum).padStart(2, '0')}-01`;
  }, [filters?.startDate, filters?.year, filters?.month]);

  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentMonthName = months[parseInt(filters?.month || '0')] || "Januari";

  const isMTD = (dateStr: string) => {
    if (!dateStr) return false;
    const monthPrefix = safeStartDate.substring(0, 7);
    return dateStr.startsWith(monthPrefix) && dateStr <= safeStartDate;
  };

  const mergedDailyRecordings = useMemo(() => {
    const map: Record<string, DailySalesData> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.sales?.dailyRecording) {
          Object.assign(map, mState.sales.dailyRecording);
        }
        if (mState?.dailyRecording) {
          Object.assign(map, mState.dailyRecording);
        }
      });
    }
    if (data?.sales?.dailyRecording) {
      Object.assign(map, data.sales.dailyRecording);
    }
    if (data?.dailyRecording) {
      Object.assign(map, data.dailyRecording);
    }
    return map;
  }, [data?.sales?.dailyRecording, data?.dailyRecording, allMonthlyData]);

  // Patty Cash & Third Party Merged Ledgers
  const mergedDailyNonCommodityLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyNonCommodityLedger) Object.assign(map, mState.dailyNonCommodityLedger);
      });
    }
    if (data?.dailyNonCommodityLedger) Object.assign(map, data.dailyNonCommodityLedger);
    return map;
  }, [data?.dailyNonCommodityLedger, allMonthlyData]);

  const mergedDailyCommodityLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyCommodityLedger) Object.assign(map, mState.dailyCommodityLedger);
      });
    }
    if (data?.dailyCommodityLedger) Object.assign(map, data.dailyCommodityLedger);
    return map;
  }, [data?.dailyCommodityLedger, allMonthlyData]);

  const mergedDailyMaintenanceLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyMaintenanceLedger) Object.assign(map, mState.dailyMaintenanceLedger);
      });
    }
    if (data?.dailyMaintenanceLedger) Object.assign(map, data.dailyMaintenanceLedger);
    return map;
  }, [data?.dailyMaintenanceLedger, allMonthlyData]);

  const mergedDailyAssetLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyAssetLedger) Object.assign(map, mState.dailyAssetLedger);
      });
    }
    if (data?.dailyAssetLedger) Object.assign(map, data.dailyAssetLedger);
    return map;
  }, [data?.dailyAssetLedger, allMonthlyData]);

  const mergedDailyCasualLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyCasualLedger) Object.assign(map, mState.dailyCasualLedger);
      });
    }
    if (data?.dailyCasualLedger) Object.assign(map, data.dailyCasualLedger);
    return map;
  }, [data?.dailyCasualLedger, allMonthlyData]);

  const mergedDailyAtkLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyAtkLedger) Object.assign(map, mState.dailyAtkLedger);
      });
    }
    if (data?.dailyAtkLedger) Object.assign(map, data.dailyAtkLedger);
    return map;
  }, [data?.dailyAtkLedger, allMonthlyData]);

  const mergedDailyCashLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyCashLedger) Object.assign(map, mState.dailyCashLedger);
      });
    }
    if (data?.dailyCashLedger) Object.assign(map, data.dailyCashLedger);
    return map;
  }, [data?.dailyCashLedger, allMonthlyData]);

  const mergedDailyThirdPartyLedger = useMemo(() => {
    const map: Record<string, LedgerItem[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyThirdPartyLedger) Object.assign(map, mState.dailyThirdPartyLedger);
      });
    }
    if (data?.dailyThirdPartyLedger) Object.assign(map, data.dailyThirdPartyLedger);
    return map;
  }, [data?.dailyThirdPartyLedger, allMonthlyData]);

  const mergedExpenses = useMemo(() => {
    const map: Record<string, ExpenseData> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.expenses) {
          Object.assign(map, mState.expenses);
        }
      });
    }
    if (data?.expenses) {
      Object.assign(map, data.expenses);
    }

    const calcSum = (ledgerMap: Record<string, LedgerItem[]>, dateStr: string) => {
      const items = ledgerMap[dateStr];
      if (!Array.isArray(items) || items.length === 0) return 0;
      return items.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
    };

    // Gather all dates from ledgers as well to sync completely
    const allDates = new Set<string>(Object.keys(map));
    [
      mergedDailyNonCommodityLedger,
      mergedDailyCommodityLedger,
      mergedDailyMaintenanceLedger,
      mergedDailyAssetLedger,
      mergedDailyCasualLedger,
      mergedDailyAtkLedger,
      mergedDailyCashLedger,
      mergedDailyThirdPartyLedger
    ].forEach(led => {
      Object.keys(led).forEach(d => allDates.add(d));
    });

    allDates.forEach(dateStr => {
      const existing: any = map[dateStr] || { date: dateStr };
      const nonComm = calcSum(mergedDailyNonCommodityLedger, dateStr);
      const comm = calcSum(mergedDailyCommodityLedger, dateStr);
      const maint = calcSum(mergedDailyMaintenanceLedger, dateStr);
      const asset = calcSum(mergedDailyAssetLedger, dateStr);
      const casual = calcSum(mergedDailyCasualLedger, dateStr);
      const atk = calcSum(mergedDailyAtkLedger, dateStr);
      const cash = calcSum(mergedDailyCashLedger, dateStr);
      const thirdParty = calcSum(mergedDailyThirdPartyLedger, dateStr);

      map[dateStr] = {
        ...existing,
        nonCommodity: nonComm > 0 ? nonComm : (Number(existing.nonCommodity) || 0),
        commodity: comm > 0 ? comm : (Number(existing.commodity) || 0),
        maintenance: maint > 0 ? maint : (Number(existing.maintenance) || 0),
        asset: asset > 0 ? asset : (Number(existing.asset) || 0),
        casual: casual > 0 ? casual : (Number(existing.casual) || 0),
        atk: atk > 0 ? atk : (Number(existing.atk) || 0),
        cash: cash > 0 ? cash : (Number(existing.cash) || 0),
        thirdParty: thirdParty > 0 ? thirdParty : (Number(existing.thirdParty) || 0),
      } as ExpenseData;
    });

    return map;
  }, [
    data?.expenses, 
    allMonthlyData,
    mergedDailyNonCommodityLedger,
    mergedDailyCommodityLedger,
    mergedDailyMaintenanceLedger,
    mergedDailyAssetLedger,
    mergedDailyCasualLedger,
    mergedDailyAtkLedger,
    mergedDailyCashLedger,
    mergedDailyThirdPartyLedger
  ]);

  const mergedDailyTargets = useMemo(() => {
    const map: Record<string, number> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyTargets) {
          Object.assign(map, mState.dailyTargets);
        }
        if (mState?.sales?.dailyTargets) {
          Object.assign(map, mState.sales.dailyTargets);
        }
      });
    }
    if (data?.dailyTargets) {
      Object.assign(map, data.dailyTargets);
    }
    if (data?.sales?.dailyTargets) {
      Object.assign(map, data.sales.dailyTargets);
    }
    return map;
  }, [data?.dailyTargets, data?.sales?.dailyTargets, allMonthlyData]);

  const mergedDailyGSI = useMemo(() => {
    const map: Record<string, GSIRow[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyGSI) {
          Object.assign(map, mState.dailyGSI);
        }
      });
    }
    if (data?.dailyGSI) {
      Object.assign(map, data.dailyGSI);
    }
    return map;
  }, [data?.dailyGSI, allMonthlyData]);

  const mergedDailyOvertime = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyOvertime) {
          Object.assign(map, mState.dailyOvertime);
        }
      });
    }
    if (data?.dailyOvertime) {
      Object.assign(map, data.dailyOvertime);
    }
    return map;
  }, [data?.dailyOvertime, allMonthlyData]);

  const mergedMainKitchenLedger = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyMainKitchenLedger) {
          Object.assign(map, mState.dailyMainKitchenLedger);
        }
      });
    }
    if (data?.dailyMainKitchenLedger) {
      Object.assign(map, data.dailyMainKitchenLedger);
    }
    return map;
  }, [data?.dailyMainKitchenLedger, allMonthlyData]);

  const mergedMainStoreLedger = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyMainStoreLedger) {
          Object.assign(map, mState.dailyMainStoreLedger);
        }
      });
    }
    if (data?.dailyMainStoreLedger) {
      Object.assign(map, data.dailyMainStoreLedger);
    }
    return map;
  }, [data?.dailyMainStoreLedger, allMonthlyData]);

  const mergedChemicalLedger = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyChemicalLedger) {
          Object.assign(map, mState.dailyChemicalLedger);
        }
      });
    }
    if (data?.dailyChemicalLedger) {
      Object.assign(map, data.dailyChemicalLedger);
    }
    return map;
  }, [data?.dailyChemicalLedger, allMonthlyData]);

  const mergedGuestSuppliesLedger = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyGuestSuppliesLedger) {
          Object.assign(map, mState.dailyGuestSuppliesLedger);
        }
      });
    }
    if (data?.dailyGuestSuppliesLedger) {
      Object.assign(map, data.dailyGuestSuppliesLedger);
    }
    return map;
  }, [data?.dailyGuestSuppliesLedger, allMonthlyData]);

  const mergedDailyTips = useMemo(() => {
    const map: Record<string, any> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyTips) {
          Object.assign(map, mState.dailyTips);
        }
      });
    }
    if (data?.dailyTips) {
      Object.assign(map, data.dailyTips);
    }
    return map;
  }, [data?.dailyTips, allMonthlyData]);

  const mergedDailyCityLedger = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyCityLedger) {
          Object.assign(map, mState.dailyCityLedger);
        }
      });
    }
    if (data?.dailyCityLedger) {
      Object.assign(map, data.dailyCityLedger);
    }
    return map;
  }, [data?.dailyCityLedger, allMonthlyData]);

  const mergedDailyCustomerSat = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyCustomerSat) {
          Object.assign(map, mState.dailyCustomerSat);
        }
      });
    }
    if (data?.dailyCustomerSat) {
      Object.assign(map, data.dailyCustomerSat);
    }
    return map;
  }, [data?.dailyCustomerSat, allMonthlyData]);

  const mergedDailyComplimentary = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyComplimentary) {
          Object.assign(map, mState.dailyComplimentary);
        }
      });
    }
    if (data?.dailyComplimentary) {
      Object.assign(map, data.dailyComplimentary);
    }
    return map;
  }, [data?.dailyComplimentary, allMonthlyData]);

  const mergedDailyGoogleReview = useMemo(() => {
    const map: Record<string, any> = {};
    if (allMonthlyData) {
      (Object.values(allMonthlyData) as any[]).forEach(mState => {
        if (mState?.dailyGoogleReview) {
          Object.assign(map, mState.dailyGoogleReview);
        }
      });
    }
    if (data?.dailyGoogleReview) {
      Object.assign(map, data.dailyGoogleReview);
    }
    return map;
  }, [data?.dailyGoogleReview, allMonthlyData]);

  const dailyRecordings = mergedDailyRecordings;
  
  const monthlyNames = useMemo(() => {
    const monthPrefix = safeStartDate.substring(0, 7);
    const configuredNames = data.monthlyDiscountNames?.[monthPrefix] || {};
    
    let names = {
      investorName: configuredNames.investorName || "INVESTOR 1",
      investorName2: configuredNames.investorName2 || "INVESTOR 2",
      investorName3: configuredNames.investorName3 || "INVESTOR 3",
      cadanganName1: configuredNames.cadanganName1 || "CADANGAN 1",
      cadanganName2: configuredNames.cadanganName2 || "CADANGAN 2",
      cadanganName3: configuredNames.cadanganName3 || "CADANGAN 3",
    };
    
    const isDefault = (name: string) => {
      return !name || 
             name === "INVESTOR 1" || 
             name === "INVESTOR 2" || 
             name === "INVESTOR 3" || 
             name === "CADANGAN 1" || 
             name === "CADANGAN 2" || 
             name === "CADANGAN 3";
    };

    if (Object.values(names).some(isDefault)) {
      const records = Object.entries(dailyRecordings)
        .filter(([date]) => date.startsWith(monthPrefix))
        .sort(([a], [b]) => b.localeCompare(a));
        
      for (const [, rec] of records) {
        const r = rec as any;
        if (isDefault(names.investorName) && r.investorName && !isDefault(r.investorName)) names.investorName = r.investorName;
        if (isDefault(names.investorName2) && r.investorName2 && !isDefault(r.investorName2)) names.investorName2 = r.investorName2;
        if (isDefault(names.investorName3) && r.investorName3 && !isDefault(r.investorName3)) names.investorName3 = r.investorName3;
        if (isDefault(names.cadanganName1) && r.cadanganName1 && !isDefault(r.cadanganName1)) names.cadanganName1 = r.cadanganName1;
        if (isDefault(names.cadanganName2) && r.cadanganName2 && !isDefault(r.cadanganName2)) names.cadanganName2 = r.cadanganName2;
        if (isDefault(names.cadanganName3) && r.cadanganName3 && !isDefault(r.cadanganName3)) names.cadanganName3 = r.cadanganName3;
      }
    }
    
    return names;
  }, [dailyRecordings, safeStartDate, data.monthlyDiscountNames]);

  const todayRec = dailyRecordings[safeStartDate] || { 
    revenue: 0, 
    covers: 0, 
    lunchRevenue: 0, 
    lunchCovers: 0, 
    dinnerRevenue: 0, 
    dinnerCovers: 0,
    discLunchInvestor: 0,
    discLunchInvestor2: 0,
    discLunchInvestor3: 0,
    discLunchPakYudi: 0,
    discLunchCadangan1: 0,
    discLunchCadangan2: 0,
    discLunchCadangan3: 0,
    discDinnerInvestor: 0,
    discDinnerInvestor2: 0,
    discDinnerInvestor3: 0,
    discDinnerPakYudi: 0,
    discDinnerCadangan1: 0,
    discDinnerCadangan2: 0,
    discDinnerCadangan3: 0,
    investorName: "INVESTOR 1",
    investorName2: "INVESTOR 2",
    investorName3: "INVESTOR 3",
    cadanganName1: "CADANGAN 1",
    cadanganName2: "CADANGAN 2",
    cadanganName3: "CADANGAN 3",
    membershipRevenueLunch: 0,
    membershipRevenueDinner: 0,
    bankMegaRevenueLunch: 0,
    bankMegaRevenueDinner: 0,
    digibankRevenueLunch: 0,
    digibankRevenueDinner: 0,
    digibankDiscount: 0,
    customerSatRevenue: 0,
    discManagementRevenue: 0,
  };

  const todayLunchRevenue = Number(todayRec.lunchRevenue) || 0;
  const todayDinnerRevenue = Number(todayRec.dinnerRevenue) || 0;
  const todayRevenue = Number(todayRec.revenue) || (todayLunchRevenue + todayDinnerRevenue);

  const todayLunchCovers = Number(todayRec.lunchCovers) || 0;
  const todayDinnerCovers = Number(todayRec.dinnerCovers) || 0;
  const todayCovers = Number(todayRec.covers) || (todayLunchCovers + todayDinnerCovers);
  
  const additionalPromoDefinitions = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    try {
      const stored = getStoredBankPromos();
      stored.forEach(p => {
        if (p.id !== 'digibank' && p.id !== 'bank_mega' && !seen.has(p.id)) {
          seen.add(p.id);
          list.push({ id: p.id, name: p.name });
        }
      });
    } catch (e) {}

    // Check data.bankingPromos or data.promoSettings?.customBankPromos
    const dataBankPromos = (data as any)?.bankingPromos || (data as any)?.promoSettings?.customBankPromos;
    if (Array.isArray(dataBankPromos)) {
      dataBankPromos.forEach((p: any) => {
        if (p?.id && p.id !== 'digibank' && p.id !== 'bank_mega' && !seen.has(p.id)) {
          seen.add(p.id);
          list.push({ id: p.id, name: p.name });
        }
      });
    }

    const monthPrefix = safeStartDate.substring(0, 7);
    Object.entries(dailyRecordings).forEach(([date, rec]: [string, any]) => {
      if (date.startsWith(monthPrefix) && rec?.promoBankEntries) {
        Object.entries(rec.promoBankEntries).forEach(([pId, entry]: [string, any]) => {
          if (pId !== 'digibank' && pId !== 'bank_mega' && !seen.has(pId)) {
            seen.add(pId);
            list.push({ id: pId, name: entry?.name || pId.replace(/_/g, ' ').toUpperCase() });
          }
        });
      }
    });

    return list;
  }, [dailyRecordings, safeStartDate, data, promoConfigVersion]);

  const discountBreakdown = useMemo(() => {
    const rec = todayRec as DailySalesData;
    const list = [
      { name: 'PAK YUDI (CEO)', total: (rec.discLunchPakYudi || 0) + (rec.discDinnerPakYudi || 0) },
      { name: monthlyNames.investorName, total: (rec.discLunchInvestor || 0) + (rec.discDinnerInvestor || 0) },
      { name: monthlyNames.investorName2, total: (rec.discLunchInvestor2 || 0) + (rec.discDinnerInvestor2 || 0) },
      { name: monthlyNames.investorName3, total: (rec.discLunchInvestor3 || 0) + (rec.discDinnerInvestor3 || 0) },
      { name: 'MEMBER JUSTUS', total: (rec.membershipRevenueLunch || 0) + (rec.membershipRevenueDinner || 0) },
      { name: 'BANK MEGA', total: (rec.bankMegaRevenueLunch || 0) + (rec.bankMegaRevenueDinner || 0) },
      { name: 'DIGIBANK', total: (rec.digibankRevenueLunch || 0) + (rec.digibankRevenueDinner || 0) + (rec.digibankDiscount || 0) },
      { name: monthlyNames.cadanganName1, total: (rec.discLunchCadangan1 || 0) + (rec.discDinnerCadangan1 || 0) },
      { name: monthlyNames.cadanganName2, total: (rec.discLunchCadangan2 || 0) + (rec.discDinnerCadangan2 || 0) },
      { name: monthlyNames.cadanganName3, total: (rec.discLunchCadangan3 || 0) + (rec.discDinnerCadangan3 || 0) },
      { name: 'CUST SATISFACTION', total: rec.customerSatRevenue || 0 },
      { name: 'MANAGEMENT', total: rec.discManagementRevenue || 0 },
    ];

    // Tambahan promo bank discount
    if (rec.promoBankEntries) {
      Object.entries(rec.promoBankEntries).forEach(([pId, pVal]: [string, any]) => {
        if (pId !== 'digibank' && pId !== 'bank_mega') {
          const rLunch = Number(pVal?.revLunch) || 0;
          const rClose = Number(pVal?.rev) || 0;
          const rDinner = pVal?.revDinner !== undefined ? Number(pVal.revDinner) : Math.max(0, rClose - rLunch);
          const disc = Number(pVal?.disc ?? pVal?.discount) || 0;
          const totalVal = rLunch + rDinner + disc;
          if (totalVal > 0) {
            const pName = pVal?.name || additionalPromoDefinitions.find(a => a.id === pId)?.name || pId.replace(/_/g, ' ').toUpperCase();
            list.push({ name: `PROMO: ${pName.toUpperCase()}`, total: totalVal });
          }
        }
      });
    }

    return list.filter(d => d.total > 0);
  }, [todayRec, monthlyNames, additionalPromoDefinitions]);
  
  const mtdRev: number = Object.entries(dailyRecordings).reduce((acc: number, [date, curr]: [string, any]) => {
    if (isMTD(date)) {
      const lunch = Number(curr.lunchRevenue) || 0;
      const dinner = Number(curr.dinnerRevenue) || 0;
      const sumSessions = lunch + dinner;
      const dayRev = sumSessions > 0 ? sumSessions : (Number(curr.revenue) || 0);
      return acc + dayRev;
    }
    return acc;
  }, 0);

  const mtdCovers: number = Object.entries(dailyRecordings).reduce((acc: number, [date, curr]: [string, any]) => {
    if (isMTD(date)) {
      const lunch = Number(curr.lunchCovers) || 0;
      const dinner = Number(curr.dinnerCovers) || 0;
      const sumSessions = lunch + dinner;
      const dayCov = sumSessions > 0 ? sumSessions : (Number(curr.covers) || 0);
      return acc + dayCov;
    }
    return acc;
  }, 0);

  const mtdTotalDiscount: number = Object.entries(dailyRecordings).reduce((acc: number, [date, rec]: [string, any]) => {
    if (isMTD(date)) {
      let promoExtra = 0;
      if (rec.promoBankEntries) {
        Object.entries(rec.promoBankEntries).forEach(([pId, pVal]: [string, any]) => {
          if (pId !== 'digibank' && pId !== 'bank_mega') {
            const rLunch = Number(pVal?.revLunch) || 0;
            const rClose = Number(pVal?.rev) || 0;
            const rDinner = pVal?.revDinner !== undefined ? Number(pVal.revDinner) : Math.max(0, rClose - rLunch);
            const disc = Number(pVal?.disc ?? pVal?.discount) || 0;
            promoExtra += rLunch + rDinner + disc;
          }
        });
      }

      const disc = (Number(rec.discLunchPakYudi) || 0) + (Number(rec.discDinnerPakYudi) || 0) +
        (Number(rec.discLunchInvestor) || 0) + (Number(rec.discDinnerInvestor) || 0) +
        (Number(rec.discLunchInvestor2) || 0) + (Number(rec.discDinnerInvestor2) || 0) +
        (Number(rec.discLunchInvestor3) || 0) + (Number(rec.discDinnerInvestor3) || 0) +
        (Number(rec.membershipRevenueLunch) || 0) + (Number(rec.membershipRevenueDinner) || 0) +
        (Number(rec.bankMegaRevenueLunch) || 0) + (Number(rec.bankMegaRevenueDinner) || 0) +
        (Number(rec.digibankRevenueLunch) || 0) + (Number(rec.digibankRevenueDinner) || 0) + (Number(rec.digibankDiscount) || 0) +
        (Number(rec.discLunchCadangan1) || 0) + (Number(rec.discLunchCadangan2) || 0) + (Number(rec.discLunchCadangan3) || 0) +
        (Number(rec.discDinnerCadangan1) || 0) + (Number(rec.discDinnerCadangan2) || 0) + (Number(rec.discDinnerCadangan3) || 0) +
        (Number(rec.customerSatRevenue) || 0) + (Number(rec.discManagementRevenue) || 0) + promoExtra;
      return acc + disc;
    }
    return acc;
  }, 0);
  
  const mtdNetRevenue = mtdRev - mtdTotalDiscount;
  const monthKey = safeStartDate.substring(0, 7);
  const mtdBudget = data.sales.monthlyBudgets?.[monthKey] || data.sales.budgetRevenue || (data as any)?.budgetRevenue || 0;
  const mtdAchv = mtdBudget > 0 ? (mtdRev / mtdBudget * 100).toFixed(2) : "0.00";
  const mtdVariance = mtdRev - mtdBudget;
  const mtdAvgCheck = mtdCovers > 0 ? Math.round(mtdRev / mtdCovers) : 0;

  const otMTD = (() => {
    const daily = mergedDailyOvertime;
    let total = 0;
    const staffMap = (data.staffList || []).reduce((acc, s) => {
      acc[s.staffId] = s;
      return acc;
    }, {} as Record<string, any>);

    Object.entries(daily).forEach(([date, entries]) => {
      if (isMTD(date)) {
        (entries as any[]).forEach(entry => {
          const staff = staffMap[entry.staffId];
          if (staff && staff.outlet === selectedOutlet) {
            total += (entry.overtimePay || 0);
          }
        });
      }
    });
    return total;
  })();

  const mtdExpenseRatio = (() => {
    const allExpenses = (Object.entries(mergedExpenses).filter(([date]) => isMTD(date)).map(([_, exp]) => exp) as ExpenseData[]);
    
    const ratioNumerator: number = allExpenses.reduce((acc: number, exp: any) => {
      return acc + 
             (exp.commodity || 0) + // Expense Cash (Commodity)
             (exp.ikigai || 0) + (exp.panfila || 0) + (exp.everest || 0) + (exp.saungKubil || 0) + (exp.tgif || 0) + (exp.sukanda || 0) + (exp.kebunku || 0) + // All Supplier
             (exp.mainKitchen || 0) + (exp.mainStore || 0) + (exp.guestSupplies || 0); // Floor Order (excluding chemical)
    }, 0);

    return mtdRev > 0 ? ((ratioNumerator / mtdRev) * 100).toFixed(1) : "0.0";
  })();
  
  const todayTarget = mergedDailyTargets[safeStartDate] ?? (data.dailyTargets?.[safeStartDate] ?? (data.sales?.dailyTargets?.[safeStartDate] ?? (data.sales?.dailyTarget || 0)));
  const todayTotalDiscount = discountBreakdown.reduce((acc, curr) => acc + curr.total, 0);
  const todayNetRevenue = todayRevenue - todayTotalDiscount;
  const todayPerformance = todayTarget > 0 ? ((todayRevenue / todayTarget) * 100).toFixed(2) : "0.00";
  const todayVariance = todayRevenue - todayTarget;

  // -- FORECAST REVENUE CALCULATIONS --
  const forecastMetrics = useMemo(() => {
    const selectedDateObj = new Date(safeStartDate);
    const year = selectedDateObj.getFullYear();
    const month = selectedDateObj.getMonth();
    const currentDate = selectedDateObj.getDate();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    let totalWeekdays = 0;
    let totalWeekends = 0;
    let weekdaysPassed = 0;
    let weekendsPassed = 0;
    let weekdaysRemaining = 0;
    let weekendsRemaining = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const d = new Date(year, month, day);
      const dayOfWeek = d.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      if (isWeekend) {
        totalWeekends++;
        if (day <= currentDate) {
          weekendsPassed++;
        } else {
          weekendsRemaining++;
        }
      } else {
        totalWeekdays++;
        if (day <= currentDate) {
          weekdaysPassed++;
        } else {
          weekdaysRemaining++;
        }
      }
    }

    const dayRemaining = Math.max(0, totalDaysInMonth - currentDate);

    let actualRevenueWeekday = 0;
    let actualRevenueWeekend = 0;

    const monthPrefix = safeStartDate.substring(0, 7);
    
    Object.entries(dailyRecordings).forEach(([dateStr, rec]: [string, any]) => {
      if (dateStr.startsWith(monthPrefix) && dateStr <= safeStartDate) {
        const [y, m, dNum] = dateStr.split('-').map(Number);
        const d = new Date(y, m - 1, dNum);
        const dayOfWeek = d.getDay();
        const revenue = Number(rec.revenue) || 0;
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          actualRevenueWeekend += revenue;
        } else {
          actualRevenueWeekday += revenue;
        }
      }
    });

    const avgWeekdayRevenue = weekdaysPassed > 0 ? actualRevenueWeekday / weekdaysPassed : 0;
    const avgWeekendRevenue = weekendsPassed > 0 ? actualRevenueWeekend / weekendsPassed : 0;
    const forecastRemaining = (weekdaysRemaining * avgWeekdayRevenue) + (weekendsRemaining * avgWeekendRevenue);
    const projectedRevenueTotal = mtdRev + forecastRemaining;

    return {
      totalWeekdays,
      totalWeekends,
      dayRemaining,
      actualRevenueWeekday,
      actualRevenueWeekend,
      projectedRevenueTotal: Math.round(projectedRevenueTotal)
    };
  }, [safeStartDate, dailyRecordings, mtdRev]);

  // -- ADAPTIVE CUMULATIVE LOGIC (NO BASELINE) --
  const dailyGoogleReview = (mergedDailyGoogleReview[safeStartDate] || { 
    stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0, 
    totalReview: 0, currentRating: 0, targetRating: 0 
  }) as GoogleReviewData;
  const dailyTotalVotes = dailyGoogleReview.stars1 + dailyGoogleReview.stars2 + dailyGoogleReview.stars3 + dailyGoogleReview.stars4 + dailyGoogleReview.stars5;

  const cumulativePastMonthsReview = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
    if (!filters.month || !allMonthlyData) return { stars1: s1, stars2: s2, stars3: s3, stars4: s4, stars5: s5 };

    const currentMonthIdx = parseInt(filters.month);
    
    // Sum daily from the beginning of recorded data strictly up to currentMonthIdx - 1
    for (let m = 0; m < currentMonthIdx; m++) {
      const monthData = allMonthlyData[m.toString()];
      if (monthData && monthData.dailyGoogleReview) {
        Object.values(monthData.dailyGoogleReview).forEach((day: any) => {
          s1 += (day.stars1 || 0);
          s2 += (day.stars2 || 0);
          s3 += (day.stars3 || 0);
          s4 += (day.stars4 || 0);
          s5 += (day.stars5 || 0);
        });
      }
    }
    return { stars1: s1, stars2: s2, stars3: s3, stars4: s4, stars5: s5 };
  }, [allMonthlyData, safeStartDate]);

  const lastMonthGoogleReview = cumulativePastMonthsReview;

  // MTD CURRENT MONTH ONLY (from monthly data)
  const mtdGoogleReview = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
    if (!mergedDailyGoogleReview) return { stars1: s1, stars2: s2, stars3: s3, stars4: s4, stars5: s5 };
    
    Object.values(mergedDailyGoogleReview).forEach((review: any) => {
      s1 += (review.stars1 || 0);
      s2 += (review.stars2 || 0);
      s3 += (review.stars3 || 0);
      s4 += (review.stars4 || 0);
      s5 += (review.stars5 || 0);
    });
    return { stars1: s1, stars2: s2, stars3: s3, stars4: s4, stars5: s5 };
  }, [mergedDailyGoogleReview]);

  const mtdTotalVotes = mtdGoogleReview.stars1 + mtdGoogleReview.stars2 + mtdGoogleReview.stars3 + mtdGoogleReview.stars4 + mtdGoogleReview.stars5;
  const mtdTotalPoints = mtdGoogleReview.stars1 * 1 + mtdGoogleReview.stars2 * 2 + mtdGoogleReview.stars3 * 3 + mtdGoogleReview.stars4 * 4 + mtdGoogleReview.stars5 * 5;
  const mtdRating = mtdTotalVotes === 0 ? 0 : Number((mtdTotalPoints / mtdTotalVotes).toFixed(2));

  const lastMonthTotalVotes = lastMonthGoogleReview.stars1 + lastMonthGoogleReview.stars2 + lastMonthGoogleReview.stars3 + lastMonthGoogleReview.stars4 + lastMonthGoogleReview.stars5;
  const lastMonthTotalPoints = lastMonthGoogleReview.stars1 * 1 + lastMonthGoogleReview.stars2 * 2 + lastMonthGoogleReview.stars3 * 3 + lastMonthGoogleReview.stars4 * 4 + lastMonthGoogleReview.stars5 * 5;
  const lastMonthRating = lastMonthTotalVotes === 0 ? 0 : Number((lastMonthTotalPoints / lastMonthTotalVotes).toFixed(2));

  // GLOBAL = Last Month Cumulative + MTD Current Month (Excluding Baseline)
  const globalStars = {
    s1: lastMonthGoogleReview.stars1 + mtdGoogleReview.stars1,
    s2: lastMonthGoogleReview.stars2 + mtdGoogleReview.stars2,
    s3: lastMonthGoogleReview.stars3 + mtdGoogleReview.stars3,
    s4: lastMonthGoogleReview.stars4 + mtdGoogleReview.stars4,
    s5: lastMonthGoogleReview.stars5 + mtdGoogleReview.stars5,
  };

  const totalVotesGlobal = globalStars.s1 + globalStars.s2 + globalStars.s3 + globalStars.s4 + globalStars.s5;
  const totalPointsGlobal = (globalStars.s1 * 1) + (globalStars.s2 * 2) + (globalStars.s3 * 3) + (globalStars.s4 * 4) + (globalStars.s5 * 5);
  const currentAvgGlobal = totalVotesGlobal === 0 ? 0 : Number((totalPointsGlobal / totalVotesGlobal).toFixed(2));
  
  // -- AUTO TARGET LOGIC --
  let activeTarget = 4.8;
  if (currentAvgGlobal >= 4.8) {
    activeTarget = 4.9;
  }
  if (currentAvgGlobal >= 4.9) {
    activeTarget = 5.0;
  }

  // -- KEKURANGAN REVIEW (Needed 5-star reviews to reach target) --
  let reviewsNeeded = 0;
  if (currentAvgGlobal < activeTarget && activeTarget < 5) {
    reviewsNeeded = Math.ceil((activeTarget * totalVotesGlobal - totalPointsGlobal) / (5 - activeTarget));
  }

  const reviewVariance = currentAvgGlobal - activeTarget;

  const calcSessionAvg = (rev: number, cov: number) => cov > 0 ? Math.round(rev / cov) : 0;

  const gsiStats = useMemo(() => {
    if (!safeStartDate) return { daily: { score: 0, responses: 0 }, mtd: { score: 0, responses: 0 }, lastMonth: { score: 0, responses: 0 } };
    
    const lastMonthPrefix = (() => {
      if (!safeStartDate) return "";
      const [year, month] = safeStartDate.split('-');
      let pYear = parseInt(year);
      let pMonth = parseInt(month) - 1;
      if (pMonth === 0) {
        pMonth = 12;
        pYear--;
      }
      return `${pYear}-${pMonth.toString().padStart(2, '0')}`;
    })();

    // Daily
    const dailyData = mergedDailyGSI[safeStartDate] || [];
    
    // MTD
    const mtdResults = INITIAL_GSI_STRUCTURE.map(base => ({ ...base, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 }));
    (Object.entries(mergedDailyGSI) as [string, GSIRow[]][]).forEach(([dateStr, rows]) => {
      if (isMTD(dateStr)) {
        rows.forEach(row => {
          const target = mtdResults.find(r => r.subject === row.subject);
          if (target) {
            target.excellent += (row.excellent || 0);
            target.good += (row.good || 0);
            target.average += (row.average || 0);
            target.poor += (row.poor || 0);
            target.abstain += (row.abstain || 0);
          }
        });
      }
    });

    // Last Month MTD
    const lastMonthResults = INITIAL_GSI_STRUCTURE.map(base => ({ ...base, excellent: 0, good: 0, average: 0, poor: 0, abstain: 0 }));
    
    let pMonthIdx = parseInt(filters.month) - 1;
    if (pMonthIdx < 0) {
      pMonthIdx = 11;
    }
    const lastMonthDataStr = pMonthIdx.toString();
    const lastMonthDailyGSI = allMonthlyData?.[lastMonthDataStr]?.dailyGSI || {};

    (Object.entries(lastMonthDailyGSI) as [string, GSIRow[]][]).forEach(([dateStr, rows]) => {
      if (dateStr.startsWith(lastMonthPrefix)) {
        rows.forEach(row => {
          const target = lastMonthResults.find(r => r.subject === row.subject);
          if (target) {
            target.excellent += (row.excellent || 0);
            target.good += (row.good || 0);
            target.average += (row.average || 0);
            target.poor += (row.poor || 0);
            target.abstain += (row.abstain || 0);
          }
        });
      }
    });

    const calculateGSI = (rows: any[]) => {
      let sumPct = 0;
      let totalResponses = 0;
      rows.forEach(row => {
        const rowResponses = (row.excellent || 0) + (row.good || 0) + (row.average || 0) + (row.poor || 0) + (row.abstain || 0);
        const totalExceptAbstain = (row.excellent || 0) + (row.good || 0) + (row.average || 0) + (row.poor || 0);
        const totalPoints = ((row.excellent || 0) * 4) + ((row.good || 0) * 3) + ((row.average || 0) * 2) + ((row.poor || 0) * 1);
        const maxPoints = totalExceptAbstain * 4;
        const pct = maxPoints === 0 ? 0 : (totalPoints / maxPoints) * 100;
        sumPct += pct;
        totalResponses += rowResponses;
      });
      return {
        score: rows.length > 0 ? (sumPct / rows.length) : 0,
        responses: rows.length > 0 ? Math.round(totalResponses / rows.length) : 0
      };
    };

    return {
      daily: calculateGSI(dailyData),
      mtd: calculateGSI(mtdResults),
      lastMonth: calculateGSI(lastMonthResults)
    };
  }, [mergedDailyGSI, safeStartDate, allMonthlyData, filters.month]);

  // Weekly OPEX Logic (MOVED TO REPORTING MODULE)
  const weeks = [
    { label: 'WEEK 1', start: 1, end: 7 },
    { label: 'WEEK 2', start: 8, end: 14 },
    { label: 'WEEK 3', start: 15, end: 21 },
    { label: 'WEEK 4', start: 22, end: 31 },
  ];

  const currentMonth = parseInt(filters.month);
  const currentYear = parseInt(filters.year || safeStartDate.split('-')[0]);

  const weeklyOpex = weeks.map(w => {
    // Filter expenses by date range in the current month
    const filtered = Object.entries(mergedExpenses).filter(([dateStr]) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return (m - 1) === currentMonth && 
             y === currentYear && 
             d >= w.start && d <= w.end;
    }).map(([_, exp]) => exp);

    const stats = filtered.reduce((acc: any, curr: any) => {
      acc.commodity += (curr.commodity || 0);
      acc.nonCommodity += (curr.nonCommodity || 0);
      acc.maintenance += (curr.maintenance || 0);
      acc.atk += (curr.atk || 0);
      acc.asset += (curr.asset || 0);
      acc.casual += (curr.casual || 0);
      acc.cash += (curr.cash || 0);
      acc.thirdParty += (curr.thirdParty || 0);
      return acc;
    }, { commodity: 0, nonCommodity: 0, maintenance: 0, atk: 0, asset: 0, casual: 0, cash: 0, thirdParty: 0 });

    const rowTotal = Object.values(stats).reduce((a: any, b: any) => a + (Number(b) || 0), 0) as number;
    return { ...w, stats, rowTotal };
  });

  const grandOpexTotals = weeklyOpex.reduce((acc: any, curr: any) => {
    acc.commodity += curr.stats.commodity;
    acc.nonCommodity += curr.stats.nonCommodity;
    acc.maintenance += curr.stats.maintenance;
    acc.atk += curr.stats.atk;
    acc.asset += curr.stats.asset;
    acc.casual += curr.stats.casual;
    acc.cash += curr.stats.cash;
    acc.thirdParty += curr.stats.thirdParty;
    acc.total += curr.rowTotal;
    return acc;
  }, { commodity: 0, nonCommodity: 0, maintenance: 0, atk: 0, asset: 0, casual: 0, cash: 0, thirdParty: 0, total: 0 });

  // View mode for OPEX section: 'weekly' or 'daily'
  const [opexViewMode, setOpexViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [showPattyCashItemModal, setShowPattyCashItemModal] = useState<boolean>(false);
  const [selectedPattyCashDetailDate, setSelectedPattyCashDetailDate] = useState<string | null>(null);

  // Full Month Daily Breakdown for Patty Cash & OPEX
  const dailyOpexHistory = useMemo(() => {
    const monthPrefix = safeStartDate.substring(0, 7);
    const [y, m] = monthPrefix.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const rows = [];
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const exp = mergedExpenses[dateStr] || ({} as ExpenseData);
      const commodity = Number(exp.commodity) || 0;
      const nonCommodity = Number(exp.nonCommodity) || 0;
      const maintenance = Number(exp.maintenance) || 0;
      const atk = Number(exp.atk) || 0;
      const asset = Number(exp.asset) || 0;
      const casual = Number(exp.casual) || 0;
      const cash = Number(exp.cash) || 0;
      const thirdParty = Number(exp.thirdParty) || 0;
      const total = commodity + nonCommodity + maintenance + atk + asset + casual + cash + thirdParty;
      
      const dayDate = new Date(y, m - 1, day);
      const dayName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][dayDate.getDay()];
      
      rows.push({
        date: dateStr,
        day,
        dayName,
        commodity,
        nonCommodity,
        maintenance,
        atk,
        asset,
        casual,
        cash,
        thirdParty,
        total
      });
    }
    return rows;
  }, [safeStartDate, mergedExpenses]);

  const grandDailyOpexTotals = useMemo(() => {
    return dailyOpexHistory.reduce((acc, curr) => {
      acc.commodity += curr.commodity;
      acc.nonCommodity += curr.nonCommodity;
      acc.maintenance += curr.maintenance;
      acc.atk += curr.atk;
      acc.asset += curr.asset;
      acc.casual += curr.casual;
      acc.cash += curr.cash;
      acc.thirdParty += curr.thirdParty;
      acc.total += curr.total;
      return acc;
    }, { commodity: 0, nonCommodity: 0, maintenance: 0, atk: 0, asset: 0, casual: 0, cash: 0, thirdParty: 0, total: 0 });
  }, [dailyOpexHistory]);

  // Helper to extract Patty Cash ledger items for any given date
  const getPattyCashItemsForDate = (dateStr: string) => {
    const list: { category: string; item: LedgerItem }[] = [];
    const addItems = (category: string, ledger: Record<string, LedgerItem[]>) => {
      const arr = ledger[dateStr] || [];
      arr.forEach(it => list.push({ category, item: it }));
    };
    addItems('Non-Commodity', mergedDailyNonCommodityLedger);
    addItems('Commodity', mergedDailyCommodityLedger);
    addItems('Maintenance', mergedDailyMaintenanceLedger);
    addItems('Asset & Equipment', mergedDailyAssetLedger);
    addItems('Casual / DW', mergedDailyCasualLedger);
    addItems('ATK & Printing', mergedDailyAtkLedger);
    addItems('Petty Cash Lainnya', mergedDailyCashLedger);
    addItems('Third Party', mergedDailyThirdPartyLedger);
    return list;
  };

  const todayPattyCashItems = useMemo(() => {
    return getPattyCashItemsForDate(safeStartDate);
  }, [
    safeStartDate,
    mergedDailyNonCommodityLedger,
    mergedDailyCommodityLedger,
    mergedDailyMaintenanceLedger,
    mergedDailyAssetLedger,
    mergedDailyCasualLedger,
    mergedDailyAtkLedger,
    mergedDailyCashLedger,
    mergedDailyThirdPartyLedger
  ]);

  // Sales Performance history logic
  const salesHistory = useMemo(() => {
    const monthPrefix = safeStartDate.substring(0, 7);
    return Object.entries(dailyRecordings)
      .filter(([date]) => date.startsWith(monthPrefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rec]: [string, any]) => {
        const lunchRev = Number(rec.lunchRevenue) || 0;
        const lunchCov = Number(rec.lunchCovers) || 0;
        const lunchDisc = 
          (Number(rec.discLunchPakYudi) || 0) +
          (Number(rec.discLunchInvestor) || 0) +
          (Number(rec.discLunchInvestor2) || 0) +
          (Number(rec.discLunchInvestor3) || 0) +
          (Number(rec.membershipRevenueLunch) || 0) +
          (Number(rec.bankMegaRevenueLunch) || 0) +
          (Number(rec.digibankRevenueLunch) || 0) +
          (Number(rec.discLunchCadangan1) || 0) +
          (Number(rec.discLunchCadangan2) || 0) +
          (Number(rec.discLunchCadangan3) || 0);

        const lunchAvg = lunchCov > 0 ? Math.round(lunchRev / lunchCov) : 0;

        const dinnerRev = Number(rec.dinnerRevenue) || 0;
        const dinnerCov = Number(rec.dinnerCovers) || 0;
        const dinnerDisc = 
          (Number(rec.discDinnerPakYudi) || 0) +
          (Number(rec.discDinnerInvestor) || 0) +
          (Number(rec.discDinnerInvestor2) || 0) +
          (Number(rec.discDinnerInvestor3) || 0) +
          (Number(rec.membershipRevenueDinner) || 0) +
          (Number(rec.bankMegaRevenueDinner) || 0) +
          (Number(rec.digibankRevenueDinner) || 0) +
          (Number(rec.digibankDiscount) || 0) +
          (Number(rec.discDinnerCadangan1) || 0) +
          (Number(rec.discDinnerCadangan2) || 0) +
          (Number(rec.discDinnerCadangan3) || 0) +
          (Number(rec.customerSatRevenue) || 0) +
          (Number(rec.discManagementRevenue) || 0);

        const dinnerAvg = dinnerCov > 0 ? Math.round(dinnerRev / dinnerCov) : 0;

        let promoExtra = 0;
        if (rec.promoBankEntries) {
          Object.entries(rec.promoBankEntries).forEach(([pId, pVal]: [string, any]) => {
            if (pId !== 'digibank' && pId !== 'bank_mega') {
              promoExtra += Number(pVal?.disc ?? pVal?.discount) || 0;
            }
          });
        }

        const totalRev = lunchRev + dinnerRev;
        const totalCov = lunchCov + dinnerCov;
        const totalDisc = lunchDisc + dinnerDisc + promoExtra;
        const totalAvg = totalCov > 0 ? Math.round(totalRev / totalCov) : 0;

        const goFoodLunch = Number(rec.goFoodLunch) || 0;
        const goFoodDinner = Number(rec.goFoodDinner) || 0;
        const goFoodTotal = Number(rec.goFoodRevenue) || (goFoodLunch + goFoodDinner);

        const grabFoodLunch = Number(rec.grabFoodLunch) || 0;
        const grabFoodDinner = Number(rec.grabFoodDinner) || 0;
        const grabFoodTotal = Number(rec.grabFoodRevenue) || (grabFoodLunch + grabFoodDinner);

        const takeAwayLunch = Number(rec.takeAwayLunch) || 0;
        const takeAwayDinner = Number(rec.takeAwayDinner) || 0;
        const takeAwayTotal = Number(rec.takeAwayRevenue) || (takeAwayLunch + takeAwayDinner);

        return {
          date,
          lunch: { rev: lunchRev, cov: lunchCov, avg: lunchAvg, disc: lunchDisc },
          dinner: { rev: dinnerRev, cov: dinnerCov, avg: dinnerAvg, disc: dinnerDisc },
          today: { rev: totalRev, cov: totalCov, avg: totalAvg, disc: totalDisc },
          goFood: { lunch: goFoodLunch, dinner: goFoodDinner, total: goFoodTotal },
          grabFood: { lunch: grabFoodLunch, dinner: grabFoodDinner, total: grabFoodTotal },
          takeAway: { lunch: takeAwayLunch, dinner: takeAwayDinner, total: takeAwayTotal }
        };
      });
  }, [dailyRecordings, filters.startDate]);

  const salesHistoryTotals = useMemo(() => {
    return salesHistory.reduce((acc, curr) => {
      acc.lunchRev += curr.lunch.rev;
      acc.lunchCov += curr.lunch.cov;
      acc.lunchDisc += curr.lunch.disc;
      acc.dinnerRev += curr.dinner.rev;
      acc.dinnerCov += curr.dinner.cov;
      acc.dinnerDisc += curr.dinner.disc;
      acc.todayRev += curr.today.rev;
      acc.todayCov += curr.today.cov;
      acc.todayDisc += curr.today.disc;
      return acc;
    }, { 
      lunchRev: 0, lunchCov: 0, lunchDisc: 0, 
      dinnerRev: 0, dinnerCov: 0, dinnerDisc: 0, 
      todayRev: 0, todayCov: 0, todayDisc: 0 
    });
  }, [salesHistory]);

  const salesHistoryAvg = {
    lunch: salesHistoryTotals.lunchCov > 0 ? Math.round(salesHistoryTotals.lunchRev / salesHistoryTotals.lunchCov) : 0,
    dinner: salesHistoryTotals.dinnerCov > 0 ? Math.round(salesHistoryTotals.dinnerRev / salesHistoryTotals.dinnerCov) : 0,
    today: salesHistoryTotals.todayCov > 0 ? Math.round(salesHistoryTotals.todayRev / salesHistoryTotals.todayCov) : 0,
  };

  const daysInMtd = salesHistory.length;
  const mtdDailyAvgRev = {
    lunch: daysInMtd > 0 ? Math.round(salesHistoryTotals.lunchRev / daysInMtd) : 0,
    dinner: daysInMtd > 0 ? Math.round(salesHistoryTotals.dinnerRev / daysInMtd) : 0,
    today: daysInMtd > 0 ? Math.round(salesHistoryTotals.todayRev / daysInMtd) : 0,
  };

  const deliveryHistoryTotals = useMemo(() => {
    return salesHistory.reduce((acc, curr) => {
      acc.goFoodLunch += curr.goFood.lunch;
      acc.goFoodDinner += curr.goFood.dinner;
      acc.goFoodTotal += curr.goFood.total;

      acc.grabFoodLunch += curr.grabFood.lunch;
      acc.grabFoodDinner += curr.grabFood.dinner;
      acc.grabFoodTotal += curr.grabFood.total;

      acc.takeAwayLunch += curr.takeAway.lunch;
      acc.takeAwayDinner += curr.takeAway.dinner;
      acc.takeAwayTotal += curr.takeAway.total;

      acc.combinedLunch += curr.goFood.lunch + curr.grabFood.lunch + curr.takeAway.lunch;
      acc.combinedDinner += curr.goFood.dinner + curr.grabFood.dinner + curr.takeAway.dinner;
      acc.combinedTotal += curr.goFood.total + curr.grabFood.total + curr.takeAway.total;

      return acc;
    }, {
      goFoodLunch: 0, goFoodDinner: 0, goFoodTotal: 0,
      grabFoodLunch: 0, grabFoodDinner: 0, grabFoodTotal: 0,
      takeAwayLunch: 0, takeAwayDinner: 0, takeAwayTotal: 0,
      combinedLunch: 0, combinedDinner: 0, combinedTotal: 0
    });
  }, [salesHistory]);

  const daysInMtdVal = daysInMtd || 1;
  const deliveryDailyAvg = {
    goFoodLunch: Math.floor(deliveryHistoryTotals.goFoodLunch / daysInMtdVal),
    goFoodDinner: Math.floor(deliveryHistoryTotals.goFoodDinner / daysInMtdVal),
    goFoodTotal: Math.floor(deliveryHistoryTotals.goFoodTotal / daysInMtdVal),
    grabFoodLunch: Math.floor(deliveryHistoryTotals.grabFoodLunch / daysInMtdVal),
    grabFoodDinner: Math.floor(deliveryHistoryTotals.grabFoodDinner / daysInMtdVal),
    grabFoodTotal: Math.floor(deliveryHistoryTotals.grabFoodTotal / daysInMtdVal),
    takeAwayLunch: Math.floor(deliveryHistoryTotals.takeAwayLunch / daysInMtdVal),
    takeAwayDinner: Math.floor(deliveryHistoryTotals.takeAwayDinner / daysInMtdVal),
    takeAwayTotal: Math.floor(deliveryHistoryTotals.takeAwayTotal / daysInMtdVal),
    combinedLunch: Math.floor(deliveryHistoryTotals.combinedLunch / daysInMtdVal),
    combinedDinner: Math.floor(deliveryHistoryTotals.combinedDinner / daysInMtdVal),
    combinedTotal: Math.floor(deliveryHistoryTotals.combinedTotal / daysInMtdVal)
  };

  // Weekly Sales Performance logic (MTD Growth Trend)
  const weeklySales = weeks.map(w => {
    const filtered = Object.entries(dailyRecordings).filter(([dateStr]) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return (m - 1) === currentMonth && 
             y === currentYear && 
             d >= w.start && d <= w.end;
    }).map(([_, rec]: [string, any]) => rec);

    const stats = filtered.reduce((acc: any, curr: any) => {
      acc.lunchRevenue += (Number(curr.lunchRevenue) || 0);
      acc.dinnerRevenue += (Number(curr.dinnerRevenue) || 0);
      return acc;
    }, { lunchRevenue: 0, dinnerRevenue: 0 });

    return {
      name: w.label,
      Lunch: stats.lunchRevenue,
      Dinner: stats.dinnerRevenue,
    };
  });

  // Tips History Logic
  const tipsHistory = useMemo(() => {
    let runningBalance = 0;
    const history: any[] = [];
    
    // Sort dates to ensure running balance is correct
    const allDates = Object.keys(mergedDailyTips).sort((a, b) => a.localeCompare(b));
    
    allDates.forEach(date => {
      if (isMTD(date)) {
        const tipsData = mergedDailyTips[date] || { incoming: [], loans: [], repayments: [] };
        
        const dayIncoming = Array.isArray(tipsData.incoming) 
          ? tipsData.incoming.reduce((sum, i) => sum + (i.nominal || 0), 0)
          : (typeof tipsData.incomingNominal === 'number' ? tipsData.incomingNominal : 0);
          
        const dayLoans = Array.isArray(tipsData.loans)
          ? tipsData.loans.reduce((sum, l) => sum + (l.nominal || 0), 0)
          : 0;
          
        const dayRepayments = Array.isArray(tipsData.repayments)
          ? tipsData.repayments.reduce((sum, r) => sum + (r.nominal || 0), 0)
          : 0;

        const startBalance = runningBalance;
        const endBalance = startBalance + dayIncoming + dayRepayments - dayLoans;
        
        history.push({
          date,
          incomingCards: Array.isArray(tipsData.incoming) ? tipsData.incoming : [],
          incomingTotal: dayIncoming,
          loans: Array.isArray(tipsData.loans) ? tipsData.loans : [],
          loansTotal: dayLoans,
          repayments: Array.isArray(tipsData.repayments) ? tipsData.repayments : [],
          repaymentsTotal: dayRepayments,
          startBalance,
          endBalance
        });
        
        runningBalance = endBalance;
      }
    });

    return history;
  }, [mergedDailyTips, safeStartDate]);

  const tipsHistoryTotals = useMemo(() => {
    return tipsHistory.reduce((acc, curr) => {
      acc.incoming += curr.incomingTotal;
      acc.loans += curr.loansTotal;
      acc.repayments += curr.repaymentsTotal;
      return acc;
    }, { incoming: 0, loans: 0, repayments: 0 });
  }, [tipsHistory]);

  // Combined Logistics/Sales Logs
  const combinedLogistics = useMemo(() => {
    const allDates = Array.from(new Set([
      ...Object.keys(mergedDailyCityLedger),
      ...Object.keys(mergedDailyCustomerSat),
      ...Object.keys(mergedDailyComplimentary)
    ])).filter(d => isMTD(d)).sort((a, b) => a.localeCompare(b));

    return allDates.map(date => ({
      date,
      cityLedger: mergedDailyCityLedger[date] || [],
      customerSat: mergedDailyCustomerSat[date] || [],
      complimentary: mergedDailyComplimentary[date] || []
    }));
  }, [mergedDailyCityLedger, mergedDailyCustomerSat, mergedDailyComplimentary, safeStartDate]);

  const combinedLogisticsTotals = useMemo(() => {
    const totals = {
      cityQty: 0, cityNom: 0,
      satQty: 0, satNom: 0,
      compQty: 0, compNom: 0
    };

    combinedLogistics.forEach(row => {
      row.cityLedger.forEach((item: any) => { totals.cityQty += (item.qty || 0); totals.cityNom += (item.price || 0); });
      row.customerSat.forEach((item: any) => { totals.satQty += (item.qty || 0); totals.satNom += (item.price || 0); });
      row.complimentary.forEach((item: any) => { totals.compQty += (item.qty || 0); totals.compNom += (item.price || 0); });
    });

    return totals;
  }, [combinedLogistics]);

  const discountMonthlyLog = useMemo(() => {
    return Object.entries(dailyRecordings)
      .filter(([date]) => isMTD(date))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rec]: [string, any]) => {
        const pakYudi = (rec.discLunchPakYudi || 0) + (rec.discDinnerPakYudi || 0);
        const inv1 = (rec.discLunchInvestor || 0) + (rec.discDinnerInvestor || 0);
        const inv2 = (rec.discLunchInvestor2 || 0) + (rec.discDinnerInvestor2 || 0);
        const inv3 = (rec.discLunchInvestor3 || 0) + (rec.discDinnerInvestor3 || 0);
        const management = rec.discManagementRevenue || 0;
        const bankMega = (rec.bankMegaRevenueLunch || 0) + (rec.bankMegaRevenueDinner || 0);
        const digibank = (rec.digibankRevenueLunch || 0) + (rec.digibankRevenueDinner || 0) + (rec.digibankDiscount || 0);
        const membership = (rec.membershipRevenueLunch || 0) + (rec.membershipRevenueDinner || 0);
        const custSat = rec.customerSatRevenue || 0;
        const cad1 = (rec.discLunchCadangan1 || 0) + (rec.discDinnerCadangan1 || 0);
        const cad2 = (rec.discLunchCadangan2 || 0) + (rec.discDinnerCadangan2 || 0);
        const cad3 = (rec.discLunchCadangan3 || 0) + (rec.discDinnerCadangan3 || 0);
        
        const promoDiscounts: Record<string, number> = {};
        let promoTotal = 0;
        additionalPromoDefinitions.forEach(p => {
          const entry = rec?.promoBankEntries?.[p.id];
          const rLunch = Number(entry?.revLunch) || 0;
          const rClose = Number(entry?.rev) || 0;
          const rDinner = entry?.revDinner !== undefined ? Number(entry?.revDinner) : Math.max(0, rClose - rLunch);
          const disc = Number(entry?.disc ?? entry?.discount) || 0;
          const val = rLunch + rDinner + disc;
          promoDiscounts[p.id] = val;
          promoTotal += val;
        });

        if (rec?.promoBankEntries) {
          Object.entries(rec.promoBankEntries).forEach(([pId, entry]: [string, any]) => {
            if (pId !== 'digibank' && pId !== 'bank_mega' && promoDiscounts[pId] === undefined) {
              const rLunch = Number(entry?.revLunch) || 0;
              const rClose = Number(entry?.rev) || 0;
              const rDinner = entry?.revDinner !== undefined ? Number(entry?.revDinner) : Math.max(0, rClose - rLunch);
              const disc = Number(entry?.disc ?? entry?.discount) || 0;
              const val = rLunch + rDinner + disc;
              promoTotal += val;
            }
          });
        }

        const total = pakYudi + inv1 + inv2 + inv3 + management + bankMega + digibank + membership + custSat + cad1 + cad2 + cad3 + promoTotal;

        return {
          date,
          pakYudi, inv1, inv2, inv3, management, bankMega, digibank, membership, custSat, cad1, cad2, cad3,
          promoDiscounts,
          promoTotal,
          total
        };
      });
  }, [dailyRecordings, safeStartDate, additionalPromoDefinitions]);

  const discountMonthlyTotals = useMemo(() => {
    const initPromoTotals: Record<string, number> = {};
    additionalPromoDefinitions.forEach(p => {
      initPromoTotals[p.id] = 0;
    });

    return discountMonthlyLog.reduce((acc, curr) => {
      acc.pakYudi += curr.pakYudi;
      acc.inv1 += curr.inv1;
      acc.inv2 += curr.inv2;
      acc.inv3 += curr.inv3;
      acc.management += curr.management;
      acc.bankMega += curr.bankMega;
      acc.digibank += curr.digibank;
      acc.membership += curr.membership;
      acc.custSat += curr.custSat;
      acc.cad1 += curr.cad1;
      acc.cad2 += curr.cad2;
      acc.cad3 += curr.cad3;
      additionalPromoDefinitions.forEach(p => {
        acc.promoDiscounts[p.id] = (acc.promoDiscounts[p.id] || 0) + (curr.promoDiscounts[p.id] || 0);
      });
      acc.promoTotal += curr.promoTotal;
      acc.total += curr.total;
      return acc;
    }, { 
      pakYudi: 0, inv1: 0, inv2: 0, inv3: 0, management: 0, 
      bankMega: 0, digibank: 0, membership: 0, custSat: 0, 
      cad1: 0, cad2: 0, cad3: 0,
      promoDiscounts: initPromoTotals,
      promoTotal: 0,
      total: 0 
    });
  }, [discountMonthlyLog, additionalPromoDefinitions]);

  const handleDownloadPDF = () => {
    if (!reportRef.current) return;
    setIsProcessingPDF(true);
    // @ts-ignore
    const html2pdf = safeWindow.obj()?.html2pdf;
    if (html2pdf) {
      const element = reportRef.current;
      const originalOverflow = element.style.overflow;
      element.style.overflow = 'visible';

      html2pdf().from(element).set({
        margin: 10,
        filename: `Daily_Report_${filters.startDate}.pdf`,
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
        const waMessage = encodeURIComponent(`Halo, berikut laporan Daily Report PDF.`);
        safeWindow.open(`https://wa.me/?text=${waMessage}`, '_blank');
        setIsProcessingPDF(false);
      });
    } else {
      console.error('html2pdf not found');
      setIsProcessingPDF(false);
    }
  };

  const exportToExcel = async (reportName: string, headers: string[][], rows: any[][], footers?: any[][], headerColor = 'FF4F46E5') => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportName);

    // Freeze headers
    worksheet.views = [{ state: 'frozen', ySplit: headers.length }];

    // Add Headers
    headers.forEach((headerRow) => {
      const row = worksheet.addRow(headerRow);
      row.height = 25;
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: headerColor },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF000000' } },
          left: { style: 'medium', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'medium', color: { argb: 'FF000000' } },
        };
      });
    });

    // Add Rows
    rows.forEach((rowData) => {
      const row = worksheet.addRow(rowData);
      row.height = 20;
      row.eachCell((cell) => {
        cell.font = { size: 9, name: 'Arial' };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
        
        // Alignment adjustments based on content type
        if (typeof cell.value === 'number') {
           cell.alignment = { vertical: 'middle', horizontal: 'right' };
           cell.numFmt = '#,##0';
        } else if (typeof cell.value === 'string' && cell.value.length > 20) {
           cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      });
    });

    // Add Footers
    if (footers && footers.length > 0) {
      footers.forEach((footerRow) => {
        const row = worksheet.addRow(footerRow);
        row.height = 22;
        row.eachCell((cell) => {
          cell.font = { bold: true, size: 9, name: 'Arial' };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE2E8F0' }, // slate-200
          };
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'medium', color: { argb: 'FF000000' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'medium', color: { argb: 'FF000000' } },
          };
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0';
          }
        });
      });
    }

    // Auto-fit columns with limits
    worksheet.columns.forEach((column) => {
      let maxColumnLength = 0;
      column.eachCell!({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxColumnLength) {
          maxColumnLength = columnLength;
        }
      });
      column.width = Math.min(Math.max(12, maxColumnLength + 2), 40);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${reportName.replace(/\s+/g, '_')}_${filters.startDate}.xlsx`);
  };

  const handleExportDiscountLog = () => {
    const promoHeaders = additionalPromoDefinitions.map(p => `${p.name} (Promo)`);
    const headers = [[
      'DATE', 'Pak Yudi', monthlyNames.investorName, monthlyNames.investorName2, monthlyNames.investorName3, 
      'Mgmt', 'Bank Mega', 'Digibank', 'Memb', 'Cust Sat', 
      monthlyNames.cadanganName1, monthlyNames.cadanganName2, monthlyNames.cadanganName3,
      ...promoHeaders,
      'TOTAL'
    ]];
    const rows = discountMonthlyLog.map(r => [
      r.date, r.pakYudi, r.inv1, r.inv2, r.inv3, r.management, r.bankMega, r.digibank, r.membership, r.custSat, r.cad1, r.cad2, r.cad3,
      ...additionalPromoDefinitions.map(p => r.promoDiscounts[p.id] || 0),
      r.total
    ]);
    const footers = [[
      'TOTAL',
      discountMonthlyLog.reduce((acc, c) => acc + c.pakYudi, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.inv1, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.inv2, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.inv3, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.management, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.bankMega, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.digibank, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.membership, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.custSat, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.cad1, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.cad2, 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.cad3, 0),
      ...additionalPromoDefinitions.map(p => discountMonthlyTotals.promoDiscounts[p.id] || 0),
      discountMonthlyLog.reduce((acc, c) => acc + c.total, 0)
    ]];
    exportToExcel('Log Rekap Discount', headers, rows, footers, 'FF10B981'); // Emerald-500
  };

  const handleExportSalesPerformance = () => {
    const headers = [
      ['Date', 'LUNCH REVENUE', 'LUNCH COVER', 'LUNCH AVG CHECK', 'LUNCH DISCOUNT', 'DINNER REVENUE', 'DINNER COVER', 'DINNER AVG CHECK', 'DINNER DISCOUNT', 'TODAY REVENUE', 'TODAY COVER', 'TODAY AVG CHECK', 'TODAY DISCOUNT']
    ];
    const rows = salesHistory.map(r => [
      r.date, r.lunch.rev, r.lunch.cov, r.lunch.avg, r.lunch.disc, r.dinner.rev, r.dinner.cov, r.dinner.avg, r.dinner.disc, r.today.rev, r.today.cov, r.today.avg, r.today.disc
    ]);
    const footers = [[
      'TOTAL MTD',
      salesHistoryTotals.lunchRev, salesHistoryTotals.lunchCov, salesHistoryAvg.lunch, salesHistoryTotals.lunchDisc,
      salesHistoryTotals.dinnerRev, salesHistoryTotals.dinnerCov, salesHistoryAvg.dinner, salesHistoryTotals.dinnerDisc,
      salesHistoryTotals.todayRev, salesHistoryTotals.todayCov, salesHistoryAvg.today, salesHistoryTotals.todayDisc
    ]];
    exportToExcel('Daily Sales Performance Logs', headers, rows, footers, 'FF3B82F6'); // Blue-500
  };

  const handleExportDeliveryPerformance = () => {
    const headers = [
      ['Date', 'GOFOOD LUNCH', 'GOFOOD DINNER', 'GOFOOD TOTAL', 'GRABFOOD LUNCH', 'GRABFOOD DINNER', 'GRABFOOD TOTAL', 'TAKEAWAY LUNCH', 'TAKEAWAY DINNER', 'TAKEAWAY TOTAL', 'COMBINED LUNCH', 'COMBINED DINNER', 'COMBINED TOTAL']
    ];
    const rows = salesHistory.map(r => [
      r.date, 
      r.goFood.lunch, r.goFood.dinner, r.goFood.total,
      r.grabFood.lunch, r.grabFood.dinner, r.grabFood.total,
      r.takeAway.lunch, r.takeAway.dinner, r.takeAway.total,
      r.goFood.lunch + r.grabFood.lunch + r.takeAway.lunch,
      r.goFood.dinner + r.grabFood.dinner + r.takeAway.dinner,
      r.goFood.total + r.grabFood.total + r.takeAway.total
    ]);
    const footers = [
      [
        'TOTAL MTD',
        deliveryHistoryTotals.goFoodLunch, deliveryHistoryTotals.goFoodDinner, deliveryHistoryTotals.goFoodTotal,
        deliveryHistoryTotals.grabFoodLunch, deliveryHistoryTotals.grabFoodDinner, deliveryHistoryTotals.grabFoodTotal,
        deliveryHistoryTotals.takeAwayLunch, deliveryHistoryTotals.takeAwayDinner, deliveryHistoryTotals.takeAwayTotal,
        deliveryHistoryTotals.combinedLunch, deliveryHistoryTotals.combinedDinner, deliveryHistoryTotals.combinedTotal
      ],
      [
        'DAILY AVG',
        deliveryDailyAvg.goFoodLunch, deliveryDailyAvg.goFoodDinner, deliveryDailyAvg.goFoodTotal,
        deliveryDailyAvg.grabFoodLunch, deliveryDailyAvg.grabFoodDinner, deliveryDailyAvg.grabFoodTotal,
        deliveryDailyAvg.takeAwayLunch, deliveryDailyAvg.takeAwayDinner, deliveryDailyAvg.takeAwayTotal,
        deliveryDailyAvg.combinedLunch, deliveryDailyAvg.combinedDinner, deliveryDailyAvg.combinedTotal
      ]
    ];
    exportToExcel('Digital and Take Away History Logs', headers, rows, footers, 'FF10B981'); // Emerald-500
  };

  const handleExportWeeklyOpex = () => {
     const headers = [
       ['PERIODE', 'COMMODITY', 'NON COMMODITY', 'MAINTENANCE', 'ATK', 'ASSET EXPENSE', 'CASUAL EXPENSE', 'PETTY CASH LAINNYA', 'THIRD PARTY', 'GRAND TOTAL']
     ];
     const rows = weeklyOpex.map((r: any) => [
       r.label, 
       r.stats.commodity, 
       r.stats.nonCommodity, 
       r.stats.maintenance, 
       r.stats.atk, 
       r.stats.asset, 
       r.stats.casual,
       r.stats.cash,
       r.stats.thirdParty,
       r.rowTotal
     ]);
     const footers = [[
       'TOTAL MTD',
       grandOpexTotals.commodity,
       grandOpexTotals.nonCommodity,
       grandOpexTotals.maintenance,
       grandOpexTotals.atk,
       grandOpexTotals.asset,
       grandOpexTotals.casual,
       grandOpexTotals.cash,
       grandOpexTotals.thirdParty,
       grandOpexTotals.total
     ]];
     exportToExcel('Opex Expense Weekly Breakdown', headers, rows, footers, 'FFB91D1D'); // red-700 approx
  };

  const handleExportDailyOpex = () => {
    const headers = [
      ['TANGGAL', 'HARI', 'COMMODITY', 'NON COMMODITY', 'MAINTENANCE', 'ATK', 'ASSET EXPENSE', 'CASUAL EXPENSE', 'PETTY CASH LAINNYA', 'THIRD PARTY', 'GRAND TOTAL']
    ];
    const rows = dailyOpexHistory.map(r => [
      r.date,
      r.dayName,
      r.commodity,
      r.nonCommodity,
      r.maintenance,
      r.atk,
      r.asset,
      r.casual,
      r.cash,
      r.thirdParty,
      r.total
    ]);
    const footers = [[
      'TOTAL MTD',
      '',
      grandDailyOpexTotals.commodity,
      grandDailyOpexTotals.nonCommodity,
      grandDailyOpexTotals.maintenance,
      grandDailyOpexTotals.atk,
      grandDailyOpexTotals.asset,
      grandDailyOpexTotals.casual,
      grandDailyOpexTotals.cash,
      grandDailyOpexTotals.thirdParty,
      grandDailyOpexTotals.total
    ]];
    exportToExcel(`Rekapan Harian Patty Cash ${safeStartDate.substring(0, 7)}`, headers, rows, footers, 'FFB91D1D');
  };

  const handleExportLogistics = () => {
    const headers = [
      ['Date', 'City Ledger Item', 'Qty', 'Nominal', 'Reason', 'Cust Sat Item', 'Qty', 'Nominal', 'Reason', 'Comp Item', 'Qty', 'Nominal', 'Reason']
    ];
    const rows: any[][] = [];
    combinedLogistics.forEach(row => {
      const maxRows = Math.max(row.cityLedger.length, row.customerSat.length, row.complimentary.length, 1);
      for(let i=0; i<maxRows; i++) {
        rows.push([
          i === 0 ? row.date : '',
          row.cityLedger[i]?.name || '',
          row.cityLedger[i]?.qty || '',
          row.cityLedger[i]?.price || '',
          row.cityLedger[i]?.reason || '',
          row.customerSat[i]?.name || '',
          row.customerSat[i]?.qty || '',
          row.customerSat[i]?.price || '',
          row.customerSat[i]?.reason || '',
          row.complimentary[i]?.name || '',
          row.complimentary[i]?.qty || '',
          row.complimentary[i]?.price || '',
          row.complimentary[i]?.reason || ''
        ]);
      }
    });

    const footers = [[
      'TOTAL',
      '', combinedLogisticsTotals.cityQty || '', combinedLogisticsTotals.cityNom || '', '',
      '', combinedLogisticsTotals.satQty || '', combinedLogisticsTotals.satNom || '', '',
      '', combinedLogisticsTotals.compQty || '', combinedLogisticsTotals.compNom || '', ''
    ]];
    exportToExcel('City Ledger Customer Sat Complimentary', headers, rows, footers, 'FF8B5CF6'); // Violet-500
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20 print:p-0 print:m-0" ref={reportRef} id="reporting-module-container">
      <ShareActions targetId="reporting-module-container" title={`Daily Report Summary - ${filters.startDate}`} />
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900 p-4 rounded-3xl border border-white/10 shadow-xl mb-4 no-print">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <i className="fas fa-file-invoice text-white"></i>
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight">Daily Performance Sumarry</h3>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Report Date: {filters.startDate}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleDownloadPDF} disabled={isProcessingPDF} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 active:scale-95 shadow-lg flex items-center gap-2">
             <i className={`fas ${isProcessingPDF ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i> Share WA by PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* SESSION BREAKDOWN SECTION */}
          <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-indigo-500 shadow-2xl">
            <h3 className="text-xs font-black uppercase text-indigo-400 mb-8 flex items-center gap-3">
               <i className="fas fa-layer-group"></i> Performance Rekap Sesi (Lunch vs Dinner)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-950/40">
                  <tr>
                    <th className="p-4 border-b border-white/5">Session</th>
                    <th className="p-4 border-b border-white/5 text-right">Revenue Actual</th>
                    <th className="p-4 border-b border-white/5 text-center">Covers</th>
                    <th className="p-4 border-b border-white/5 text-right">Avg Check</th>
                    <th className="p-4 border-b border-white/5 text-right">Cont (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5">
                    <td className="p-4 text-[10px] font-black text-blue-400 flex items-center gap-2"><i className="fas fa-sun"></i> LUNCH SESSION</td>
                    <td className="p-4 text-xs font-black text-white text-right">Rp {todayLunchRevenue.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-xs font-bold text-slate-400 text-center">{todayLunchCovers}</td>
                    <td className="p-4 text-xs font-black text-blue-300 text-right">Rp {calcSessionAvg(todayLunchRevenue, todayLunchCovers).toLocaleString('id-ID')}</td>
                    <td className="p-4 text-[9px] font-black text-slate-500 text-right">{todayRevenue > 0 ? (((todayLunchRevenue) / todayRevenue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                  <tr className="hover:bg-white/5">
                    <td className="p-4 text-[10px] font-black text-orange-400 flex items-center gap-2"><i className="fas fa-moon"></i> DINNER SESSION</td>
                    <td className="p-4 text-xs font-black text-white text-right">Rp {todayDinnerRevenue.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-xs font-bold text-slate-400 text-center">{todayDinnerCovers}</td>
                    <td className="p-4 text-xs font-black text-orange-300 text-right">Rp {calcSessionAvg(todayDinnerRevenue, todayDinnerCovers).toLocaleString('id-ID')}</td>
                    <td className="p-4 text-[9px] font-black text-slate-500 text-right">{todayRevenue > 0 ? (((todayDinnerRevenue) / todayRevenue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-950/60">
                  <tr className="font-black">
                    <td className="p-4 text-[10px] text-white">TOTAL DAILY</td>
                    <td className="p-4 text-sm text-emerald-400 text-right">Rp {todayRevenue.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-xs text-white text-center">{todayCovers}</td>
                    <td className="p-4 text-xs text-amber-400 text-right">Rp {calcSessionAvg(todayRevenue, todayCovers).toLocaleString('id-ID')}</td>
                    <td className="p-4 text-[9px] text-white text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>


          <section className="glass-card p-8 bg-slate-900/40 border-t-2 border-indigo-500 shadow-2xl">
            <h3 className="text-xs font-black uppercase text-white mb-8 flex items-center gap-3">
              <i className="fas fa-chart-line text-indigo-400"></i> Revenue Analysis Overview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="space-y-4 bg-slate-950/20 p-6 rounded-3xl border border-white/5">
                  <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] border-b border-white/5 pb-3 mb-4">Today Performance</h4>
                  <div className="space-y-3">
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Today Revenue</span>
                        <span className="font-black text-white">Rp {todayRevenue.toLocaleString('id-ID')}</span>
                     </div>
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Cover</span>
                        <span className="font-black text-indigo-300">{todayCovers} Pax</span>
                     </div>
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Average Check</span>
                        <span className="font-black text-amber-400">Rp {calcSessionAvg(todayRevenue, todayCovers).toLocaleString('id-ID')}</span>
                     </div>
                     <div className="pt-2 mt-2 border-t border-white/5 space-y-3">
                        <div className="flex justify-between items-center text-xs text-white">
                           <span className="text-slate-500 uppercase font-bold">Target Today</span>
                           <span className="font-bold">Rp {todayTarget.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500 uppercase font-bold">Variance</span>
                           <span className={`font-black ${todayVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {todayVariance >= 0 ? '+' : ''}Rp {todayVariance.toLocaleString('id-ID')}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500 uppercase font-bold">Performance</span>
                           <span className={`font-black px-2 py-0.5 rounded ${Number(todayPerformance) >= 100 ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                              {todayPerformance}%
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="space-y-4 bg-slate-950/20 p-6 rounded-3xl border border-white/5">
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] border-b border-white/5 pb-3 mb-4">Mtd Performance</h4>
                  <div className="space-y-3">
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Mtd Fb Revenue</span>
                        <span className="font-black text-white">Rp {mtdRev.toLocaleString('id-ID')}</span>
                     </div>
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Mtd Cover</span>
                        <span className="font-black text-indigo-300">{mtdCovers} Pax</span>
                     </div>
                     <div className="flex justify-between items-center text-xs text-white">
                        <span className="text-slate-500 uppercase font-bold">Average Check</span>
                        <span className="font-black text-amber-400">Rp {mtdAvgCheck.toLocaleString('id-ID')}</span>
                     </div>
                     <div className="pt-2 mt-2 border-t border-white/5 space-y-3">
                        <div className="flex justify-between items-center text-xs text-white">
                           <span className="text-slate-500 uppercase font-bold">Mtd Budget</span>
                           <span className="font-bold">Rp {mtdBudget.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500 uppercase font-bold">Variance</span>
                           <span className={`font-black ${mtdVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {mtdVariance >= 0 ? '+' : ''}Rp {mtdVariance.toLocaleString('id-ID')}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500 uppercase font-bold">Mtd Performance</span>
                           <span className={`font-black px-2 py-0.5 rounded ${Number(mtdAchv) >= 100 ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                              {mtdAchv}%
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5 mt-1">
                           <span className="text-slate-500 uppercase font-bold">Mtd Expense Ratio</span>
                           <span className={`font-black ${Number(mtdExpenseRatio) > 35 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {mtdExpenseRatio}%
                           </span>
                        </div>
                     </div>
                  </div>
               </div>


            </div>
          </section>

          {/* FORECAST REVENUE SECTION */}
          <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-amber-500 shadow-2xl">
             <h3 className="text-xs font-black uppercase text-amber-400 mb-8 flex items-center gap-3">
                <i className="fas fa-calculator"></i> Forecast Revenue Analysis
             </h3>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Day Counting card */}
                <div className="bg-slate-950/40 p-6 rounded-3xl border border-white/5 space-y-4">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Day Counting</h4>
                   <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center text-white">
                         <span className="text-slate-500 uppercase font-bold">TOTAL WEEKDAY</span>
                         <span className="font-bold text-white">{forecastMetrics.totalWeekdays} HARI <span className="text-[9px] text-slate-400 font-normal">(SENIN - JUMAT)</span></span>
                      </div>
                      <div className="flex justify-between items-center text-white">
                         <span className="text-slate-500 uppercase font-bold">TOTAL WEEKEND</span>
                         <span className="font-bold text-white">{forecastMetrics.totalWeekends} HARI <span className="text-[9px] text-slate-400 font-normal">(SABTU & MINGGU)</span></span>
                      </div>
                      <div className="flex justify-between items-center text-white pt-2 border-t border-white/5">
                         <span className="text-slate-500 uppercase font-bold">DAY REMAINING</span>
                         <span className="font-black text-indigo-300">{forecastMetrics.dayRemaining} HARI</span>
                      </div>
                   </div>
                </div>

                {/* Actual Revenue Segment card */}
                <div className="bg-slate-950/40 p-6 rounded-3xl border border-white/5 space-y-4">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Revenue Segment Status</h4>
                   <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center text-white">
                         <span className="text-slate-500 uppercase font-bold">ACTUAL REVENUE : WEEKDAY</span>
                         <span className="font-black text-white">Rp {forecastMetrics.actualRevenueWeekday.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between items-center text-white">
                         <span className="text-slate-500 uppercase font-bold">ACTUAL REVENUE : WEEKEND</span>
                         <span className="font-black text-white">Rp {forecastMetrics.actualRevenueWeekend.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5 mt-1">
                         <span className="text-slate-500 uppercase font-bold text-[10px]">VARIANCE REVENUE VS MTD BUDGET</span>
                         <span className={`font-black ${mtdVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {mtdVariance >= 0 ? '+' : ''}Rp {mtdVariance.toLocaleString('id-ID')}
                         </span>
                      </div>
                   </div>
                </div>

                {/* Projected Month End card */}
                <div className="bg-gradient-to-br from-amber-500/10 to-indigo-500/10 p-6 rounded-3xl border border-amber-500/20 flex flex-col justify-between">
                   <div>
                      <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Projected Month End</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed">Estimasi total pendapatan di akhir bulan berjalan berdasarkan run rate rata-rata harian.</p>
                   </div>
                   <div className="mt-4 bg-slate-950/60 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                      <span className="text-[8px] font-black text-slate-500 uppercase">Projected Total</span>
                      <span className="font-black text-amber-300 text-base">
                         Rp {forecastMetrics.projectedRevenueTotal.toLocaleString('id-ID')}
                      </span>
                   </div>
                </div>
             </div>
          </section>
        </div>

        <div className="space-y-8">
           <div className="glass-card p-6 bg-indigo-600 flex flex-col items-center justify-center text-center shadow-2xl border-none">
              <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2">Overall Today Performance</div>
              <div className="text-4xl font-black text-white mb-4">Rp {todayRevenue.toLocaleString('id-ID')}</div>
              <div className="grid grid-cols-2 w-full gap-4 border-t border-white/10 pt-4">
                 <div className="text-center">
                    <div className="text-[8px] font-black text-white/40 uppercase">Total Covers</div>
                    <div className="text-sm font-black text-white">{todayCovers} Pax</div>
                 </div>
                 <div className="text-center">
                    <div className="text-[8px] font-black text-white/40 uppercase">Avg Check</div>
                    <div className="text-sm font-black text-white">Rp {calcSessionAvg(todayRevenue, todayCovers).toLocaleString('id-ID')}</div>
                 </div>
              </div>
           </div>
           
            <div className="glass-card p-6 bg-slate-900 border-white/5">
               <div className="flex justify-between items-center mb-4">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Patty Cash OPEX Context</h4>
                  {todayPattyCashItems.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedPattyCashDetailDate(safeStartDate);
                        setShowPattyCashItemModal(true);
                      }}
                      className="px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border border-amber-500/40 shadow-sm active:scale-95"
                      title="Lihat rincian item belanja yang diinput di Patty Cash Expense"
                    >
                      <i className="fas fa-receipt text-amber-400"></i> {todayPattyCashItems.length} Item Belanja
                    </button>
                  )}
               </div>
               <div className="space-y-4">
                  <div className="space-y-2">
                     <div className="flex justify-between items-center border-b border-white/5 pb-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Total Opex</span>
                         <span className="text-xs font-black text-red-400">Rp {
                           (() => {
                             const exp = (mergedExpenses && mergedExpenses[safeStartDate]) || { nonCommodity: 0, commodity: 0, cash: 0, maintenance: 0, asset: 0, casual: 0, atk: 0, thirdParty: 0 };
                             return ((exp.nonCommodity || 0) + (exp.commodity || 0) + (exp.cash || 0) + (exp.maintenance || 0) + (exp.asset || 0) + (exp.casual || 0) + (exp.atk || 0) + (exp.thirdParty || 0)).toLocaleString('id-ID');
                           })()
                        }</span>
                     </div>
                     <div className="grid grid-cols-1 gap-1 pt-1">
                        {(() => {
                           const exp = (mergedExpenses && mergedExpenses[safeStartDate]) || { nonCommodity: 0, commodity: 0, cash: 0, maintenance: 0, asset: 0, casual: 0, atk: 0, thirdParty: 0 };
                           return (
                             <>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Non Commodity</span><span>Rp {(exp.nonCommodity || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Commodity</span><span>Rp {(exp.commodity || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Cash</span><span>Rp {(exp.cash || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Maintenance</span><span>Rp {(exp.maintenance || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Asset</span><span>Rp {(exp.asset || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Casual</span><span>Rp {(exp.casual || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>ATK</span><span>Rp {(exp.atk || 0).toLocaleString('id-ID')}</span></div>
                               <div className="flex justify-between text-[7px] uppercase font-bold text-slate-500"><span>Third Party</span><span>Rp {(exp.thirdParty || 0).toLocaleString('id-ID')}</span></div>
                             </>
                           );
                        })()}
                     </div>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-bold text-slate-400 uppercase">Energy Cost</span>
                     <span className="text-xs font-black text-yellow-400">Rp {
                        (() => {
                           const exp = (mergedExpenses && mergedExpenses[safeStartDate]) || { electricity: 0, water: 0, gas: 0 };
                           return ((exp.electricity || 0) + (exp.water || 0) + (exp.gas || 0)).toLocaleString('id-ID');
                        })()
                     }</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Supplies Expense</span>
                      <span className="text-xs font-black text-emerald-400">Rp {
                         (() => {
                            const exp = (mergedExpenses && mergedExpenses[safeStartDate]) || { 
                              mainKitchen: 0, mainStore: 0, chemical: 0, guestSupplies: 0,
                              ikigai: 0, panfila: 0, everest: 0, saungKubil: 0, tgif: 0, sukanda: 0, kebunku: 0
                            };
                            const kitchenLedger = (mergedMainKitchenLedger && mergedMainKitchenLedger[safeStartDate]) || [];
                            const storeLedger = (mergedMainStoreLedger && mergedMainStoreLedger[safeStartDate]) || [];
                            const chemicalLedger = (mergedChemicalLedger && mergedChemicalLedger[safeStartDate]) || [];
                            const guestLedger = (mergedGuestSuppliesLedger && mergedGuestSuppliesLedger[safeStartDate]) || [];
                            
                            const kitchenTotal = kitchenLedger.reduce((acc: number, curr: any) => acc + ((curr.qty || 0) * (curr.price || 0)), 0);
                            const storeTotal = storeLedger.reduce((acc: number, curr: any) => acc + ((curr.qty || 0) * (curr.price || 0)), 0);
                            const chemicalTotal = chemicalLedger.reduce((acc: number, curr: any) => acc + ((curr.qty || 0) * (curr.price || 0)), 0);
                            const guestTotal = guestLedger.reduce((acc: number, curr: any) => acc + ((curr.qty || 0) * (curr.price || 0)), 0);

                            const mainKitchenVal = (exp.mainKitchen || 0) || kitchenTotal;
                            const mainStoreVal = (exp.mainStore || 0) || storeTotal;
                            const chemicalVal = (exp.chemical || 0) || chemicalTotal;
                            const guestSuppliesVal = (exp.guestSupplies || 0) || guestTotal;

                            return (
                              mainKitchenVal + mainStoreVal + chemicalVal + guestSuppliesVal + 
                              (exp.ikigai || 0) + (exp.panfila || 0) + (exp.everest || 0) + (exp.saungKubil || 0) + (exp.tgif || 0) + 
                              (exp.sukanda || 0) + (exp.kebunku || 0)
                            ).toLocaleString('id-ID');
                         })()
                      }</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-bold text-slate-400 uppercase">OT MTD</span>
                     <span className="text-xs font-black text-blue-400">Rp {otMTD.toLocaleString('id-ID')}</span>
                  </div>
               </div>
            </div>

            <div className="glass-card p-6 bg-slate-900 border-white/5">
                <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                   <i className="fas fa-smile"></i> GSI Report Insights
                </h4>
                <div className="space-y-4">
                   <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                         <span className="text-[9px] font-black text-indigo-400 uppercase">DAILY REVIEW TODAY</span>
                         <span className="text-xs font-black text-white">{gsiStats.daily.responses} Review</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">Daily GSI Score</span>
                         <span className="text-xs font-black text-white">{gsiStats.daily.score.toFixed(2)}%</span>
                      </div>
                   </div>

                   <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                         <span className="text-[9px] font-black text-teal-400 uppercase">MTD REVIEW LAST MONTH</span>
                         <span className="text-xs font-black text-white">{gsiStats.lastMonth.responses} Review</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">Last Month GSI Score</span>
                         <span className="text-xs font-black text-white">{gsiStats.lastMonth.score.toFixed(2)}%</span>
                      </div>
                   </div>

                   <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                         <span className="text-[9px] font-black text-indigo-400 uppercase">MTD REVIEW THIS MONTH</span>
                         <span className="text-xs font-black text-white">{gsiStats.mtd.responses} Review</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">MTD GSI Score</span>
                         <span className="text-xs font-black text-white">{gsiStats.mtd.score.toFixed(2)}%</span>
                      </div>
                   </div>

                   <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black text-indigo-500 uppercase">GLOBAL TOTAL REVIEW ALL MONTH (BULAN BERJALAN)</span>
                         <span className="text-xs font-black text-white">{gsiStats.mtd.responses} Review</span>
                      </div>
                   </div>
                </div>
            </div>

            <div className="glass-card p-6 bg-slate-900 border-white/5">
               <h4 className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <i className="fab fa-google"></i> Google Review Status
               </h4>
               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                     <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Past Months Cum.</span>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-black text-indigo-400">{lastMonthRating.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-500 font-bold">{lastMonthTotalVotes} rev</span>
                        </div>
                     </div>
                     <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 space-y-1">
                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">MTD Current</span>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-black text-white">{mtdRating.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-500 font-bold">{mtdTotalVotes} rev</span>
                        </div>
                     </div>
                  </div>

                  <div className="p-3 bg-slate-950/40 rounded-xl space-y-2 border border-white/5">
                    <div className="flex justify-between items-center">
                       <span className="text-[9px] font-bold text-emerald-400 uppercase">GLOBAL ACTUAL RATING</span>
                       <span className="text-sm font-black text-white">{(currentAvgGlobal || 0).toFixed(2)} <span className="text-[10px] text-yellow-500">★</span></span>
                    </div>
                    <div className="flex justify-between items-center bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 mt-1">
                       <span className="text-[9px] font-bold text-amber-500 uppercase">KEKURANGAN (NEEDED ★5)</span>
                       <span className="text-sm font-black text-amber-400">
                          {reviewsNeeded} REVIEWS
                       </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                       <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">GLOBAL TOTAL REVIEWS (SUM MTD)</span>
                       <span className="text-sm font-black text-emerald-400">
                          {totalVotesGlobal} REVIEWS
                       </span>
                    </div>
                  </div>
               </div>
            </div>
        </div>
      </div>

      {/* REKAPAN DISCOUNT SECTION */}
      {discountBreakdown.length > 0 && (
        <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-rose-500 shadow-2xl mt-8">
           <h3 className="text-xs font-black uppercase text-rose-400 mb-8 flex items-center gap-3">
              <i className="fas fa-percentage"></i> Rekapan Discount Harian
           </h3>
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-950/40">
                  <tr>
                    <th className="p-4 border-b border-white/5">Kategori Discount</th>
                    <th className="p-4 border-b border-white/5 text-right">Total Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {discountBreakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-[10px] font-black text-slate-300">{row.name}</td>
                      <td className="p-4 text-[10px] font-black text-rose-400 text-right">Rp {row.total.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950/60 font-black">
                  <tr>
                    <td className="p-4 text-[10px] text-white">TOTAL DISCOUNT</td>
                    <td className="p-4 text-xs text-rose-500 text-right">Rp {discountBreakdown.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('id-ID')}</td>
                  </tr>
                </tfoot>
              </table>
           </div>
        </section>
      )}

      {/* MTD DISCOUNT LOG SECTION */}
      {discountMonthlyLog.length > 0 && (
        <section className="glass-card p-8 bg-slate-900 border-t-2 border-indigo-500 shadow-2xl mt-8">
           <div className="flex justify-between items-center mb-8">
              <h3 className="text-xs font-black uppercase text-indigo-400 flex items-center gap-3">
                 <i className="fas fa-th-list"></i> Log Rekap Discount (MTD - Bulan Berjalan)
              </h3>
              <button 
                onClick={handleExportDiscountLog}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 no-print"
              >
                <i className="fas fa-file-excel"></i> Convert to Excel
              </button>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-[8px] font-bold text-slate-300 border-collapse">
                <thead className="bg-slate-950/60 text-slate-500 uppercase tracking-widest text-[7px]">
          <tr>
            <th className="p-2 border border-white/5 text-center">DATE</th>
            <th className="p-2 border border-white/5 text-right">Pak Yudi</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.investorName}</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.investorName2}</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.investorName3}</th>
            <th className="p-2 border border-white/5 text-right">Mgmt</th>
            <th className="p-2 border border-white/5 text-right">Bank Mega</th>
            <th className="p-2 border border-white/5 text-right">Digibank</th>
            <th className="p-2 border border-white/5 text-right">Memb</th>
            <th className="p-2 border border-white/5 text-right">Cust Sat</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.cadanganName1}</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.cadanganName2}</th>
            <th className="p-2 border border-white/5 text-right whitespace-nowrap">{monthlyNames.cadanganName3}</th>
            {additionalPromoDefinitions.map(p => (
              <th key={p.id} className="p-2 border border-white/5 text-right whitespace-nowrap text-amber-400">
                {p.name}
              </th>
            ))}
            <th className="p-2 border border-white/10 text-right bg-rose-500/10 text-white">TOTAL</th>
          </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {discountMonthlyLog.map((row, idx) => (
                    <tr key={idx} className={`${row.date === safeStartDate ? 'bg-indigo-500/10' : ''} hover:bg-white/5 transition-colors`}>
                      <td className="p-2 border border-white/5 text-center font-black whitespace-nowrap">{row.date}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.pakYudi > 0 ? 'text-white' : 'text-slate-700'}`}>{row.pakYudi > 0 ? row.pakYudi.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.inv1 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.inv1 > 0 ? row.inv1.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.inv2 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.inv2 > 0 ? row.inv2.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.inv3 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.inv3 > 0 ? row.inv3.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.management > 0 ? 'text-white' : 'text-slate-700'}`}>{row.management > 0 ? row.management.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.bankMega > 0 ? 'text-white' : 'text-slate-700'}`}>{row.bankMega > 0 ? row.bankMega.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.digibank > 0 ? 'text-white' : 'text-slate-700'}`}>{row.digibank > 0 ? row.digibank.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.membership > 0 ? 'text-white' : 'text-slate-700'}`}>{row.membership > 0 ? row.membership.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.custSat > 0 ? 'text-white' : 'text-slate-700'}`}>{row.custSat > 0 ? row.custSat.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.cad1 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.cad1 > 0 ? row.cad1.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.cad2 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.cad2 > 0 ? row.cad2.toLocaleString('id-ID') : '-'}</td>
                      <td className={`p-2 border border-white/5 text-right ${row.cad3 > 0 ? 'text-white' : 'text-slate-700'}`}>{row.cad3 > 0 ? row.cad3.toLocaleString('id-ID') : '-'}</td>
                      {additionalPromoDefinitions.map(p => {
                        const val = row.promoDiscounts[p.id] || 0;
                        return (
                          <td key={p.id} className={`p-2 border border-white/5 text-right font-mono ${val > 0 ? 'text-amber-400 font-bold' : 'text-slate-700'}`}>
                            {val > 0 ? val.toLocaleString('id-ID') : '-'}
                          </td>
                        );
                      })}
                      <td className="p-2 border border-white/10 text-right font-black bg-rose-500/5 text-rose-400">{row.total > 0 ? row.total.toLocaleString('id-ID') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950 font-black text-[9px]">
                   <tr>
                     <td className="p-2 border border-white/10 text-center text-white">TOTAL</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.pakYudi.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.inv1.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.inv2.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.inv3.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.management.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.bankMega.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.digibank.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-emerald-400">Rp {discountMonthlyTotals.membership.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-indigo-400">Rp {discountMonthlyTotals.custSat.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-slate-500">Rp {discountMonthlyTotals.cad1.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-slate-500">Rp {discountMonthlyTotals.cad2.toLocaleString('id-ID')}</td>
                     <td className="p-2 border border-white/10 text-right text-slate-500">Rp {discountMonthlyTotals.cad3.toLocaleString('id-ID')}</td>
                     {additionalPromoDefinitions.map(p => (
                       <td key={p.id} className="p-2 border border-white/10 text-right text-amber-400 font-mono">
                         Rp {(discountMonthlyTotals.promoDiscounts[p.id] || 0).toLocaleString('id-ID')}
                       </td>
                     ))}
                     <td className="p-2 border border-white/10 text-right text-rose-500 bg-rose-500/10">Rp {discountMonthlyTotals.total.toLocaleString('id-ID')}</td>
                   </tr>
                </tfoot>
              </table>
           </div>
        </section>
      )}

      {/* DAILY REVENUE TREND CHART (GRAFIK TREN REVENUE PER HARI) */}
      {salesHistory.length > 0 && (
        <section className="glass-card p-6 md:p-8 bg-slate-900/60 border-t-2 border-emerald-500 shadow-2xl mt-8">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                 <h3 className="text-xs font-black uppercase text-emerald-400 flex items-center gap-3 tracking-wider">
                    <i className="fas fa-chart-line"></i> Grafik Tren Revenue Per Hari
                 </h3>
                 <p className="text-[10px] text-slate-400 font-bold mt-1">
                    Grafik pergerakan omset harian (Total Revenue) sepanjang periode bulan ini
                 </p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold">
                 <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"></div>
                    <span className="text-slate-300">Revenue Harian</span>
                 </div>
              </div>
           </div>
           <div className="h-64 md:h-80 w-full text-[9px]">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={salesHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                       <linearGradient id="revenueDailyColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                    <XAxis 
                       dataKey="date" 
                       stroke="#64748b" 
                       tickFormatter={(tick) => {
                          if (!tick) return '';
                          const parts = tick.split('-');
                          return parts[2] ? parts[2] : tick;
                       }} 
                    />
                    <YAxis 
                       stroke="#64748b" 
                       tickFormatter={(tick) => `Rp ${(tick / 1000).toLocaleString('id-ID')}k`} 
                    />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                       labelStyle={{ fontWeight: 'bold', color: '#cbd5e1' }}
                       formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Total Revenue']}
                       labelFormatter={(label) => `Tanggal: ${label}`}
                    />
                    <Area type="monotone" dataKey="today.rev" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#revenueDailyColor)" />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </section>
      )}

      {/* WEEKLY PERFORMANCE (MTD GROWTH TREND) CHART */}
      <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-emerald-500 shadow-2xl mt-8">
         <div className="flex justify-between items-center mb-8">
            <h3 className="text-xs font-black uppercase text-emerald-400 flex items-center gap-3">
               <i className="fas fa-chart-bar"></i> Weekly Performance (MTD Growth Trend)
            </h3>
            <div className="flex gap-4">
               <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]"></div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Lunch</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-f97316 shadow-[0_0_10px_rgba(249,115,22,0.3)]"></div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Dinner</span>
               </div>
            </div>
         </div>
         <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklySales}
                margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
                barGap={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }}
                  dy={15}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 9, fontWeight: 900 }}
                  tickFormatter={(val) => `Rp. ${val.toLocaleString('id-ID')}`}
                  ticks={[100000000, 200000000, 300000000, 400000000]}
                  domain={[0, 450000000]}
                />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ 
                    backgroundColor: '#020617', 
                    border: '1px solid #ffffff10',
                    borderRadius: '16px',
                    fontSize: '10px',
                    fontWeight: '900',
                    color: '#fff',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                  }}
                  formatter={(value: any) => [`Rp. ${Number(value).toLocaleString('id-ID')}`, '']}
                />
                <Bar dataKey="Lunch" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="Dinner" fill="#f97316" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
         </div>
      </section>

      {/* SALES PERFORMANCE HISTORY (MOVED LOGS) */}
      <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-indigo-600 shadow-2xl">
         <div className="flex justify-between items-center mb-8">
            <h3 className="text-xs font-black uppercase text-indigo-400 flex items-center gap-3">
               <i className="fas fa-history"></i> Daily Sales Performance Logs (History)
            </h3>
            <button 
              onClick={handleExportSalesPerformance}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 no-print"
            >
              <i className="fas fa-file-excel"></i> Convert to Excel
            </button>
         </div>
         <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1200px]">
               <thead className="bg-slate-950/60 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                  <tr>
                    <th className="p-4 border-b border-white/5 sticky left-0 bg-slate-900 z-20">Date</th>
                    <th className="p-4 border-b border-white/5 text-center bg-blue-500/10" colSpan={4}>LUNCH REVENUE</th>
                    <th className="p-4 border-b border-white/5 text-center bg-orange-500/10" colSpan={4}>DINNER REV</th>
                    <th className="p-4 border-b border-white/5 text-center bg-emerald-500/10" colSpan={4}>TODAY REV</th>
                  </tr>
                  <tr className="bg-slate-900/40 text-[7px]">
                    <th className="p-2 border-b border-white/5 sticky left-0 bg-slate-900 z-20"></th>
                    <th className="p-2 border-b border-white/5 text-right">Revenue</th>
                    <th className="p-2 border-b border-white/5 text-center">Cover</th>
                    <th className="p-2 border-b border-white/5 text-right">Avg Check</th>
                    <th className="p-2 border-b border-white/5 text-right border-r border-white/10">Discount</th>
                    <th className="p-2 border-b border-white/5 text-right">Revenue</th>
                    <th className="p-2 border-b border-white/5 text-center">Cover</th>
                    <th className="p-2 border-b border-white/5 text-right">Avg Check</th>
                    <th className="p-2 border-b border-white/5 text-right border-r border-white/10">Discount</th>
                    <th className="p-2 border-b border-white/5 text-right">Revenue</th>
                    <th className="p-2 border-b border-white/5 text-center">Cover</th>
                    <th className="p-2 border-b border-white/5 text-right">Avg Check</th>
                    <th className="p-2 border-b border-white/5 text-right">Discount</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {salesHistory.map((row) => (
                    <tr key={row.date} className={`hover:bg-white/5 transition-colors ${row.date === safeStartDate ? 'bg-indigo-500/10' : ''}`}>
                       <td className="p-4 text-[9px] font-black text-slate-300 sticky left-0 bg-slate-900/90 backdrop-blur-md z-10 border-r border-white/5">
                         {new Date(row.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                         {row.date === safeStartDate && <span className="ml-1 bg-indigo-500 text-[6px] text-white px-1 py-0.5 rounded-full uppercase">Today</span>}
                       </td>
                       {/* Lunch */}
                       <td className="p-2 text-[10px] font-bold text-white text-right">Rp {row.lunch.rev.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[10px] font-medium text-blue-400 text-center">{row.lunch.cov}</td>
                       <td className="p-2 text-[9px] font-medium text-slate-500 text-right">Rp {row.lunch.avg.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[9px] font-medium text-rose-400/70 text-right border-r border-white/10">Rp {row.lunch.disc.toLocaleString('id-ID')}</td>
                       {/* Dinner */}
                       <td className="p-2 text-[10px] font-bold text-white text-right">Rp {row.dinner.rev.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[10px] font-medium text-orange-400 text-center">{row.dinner.cov}</td>
                       <td className="p-2 text-[9px] font-medium text-slate-500 text-right">Rp {row.dinner.avg.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[9px] font-medium text-rose-400/70 text-right border-r border-white/10">Rp {row.dinner.disc.toLocaleString('id-ID')}</td>
                       {/* Today */}
                       <td className="p-2 text-[10px] font-black text-emerald-400 text-right">Rp {row.today.rev.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[10px] font-bold text-slate-300 text-center">{row.today.cov}</td>
                       <td className="p-2 text-[9px] font-bold text-indigo-300 text-right">Rp {row.today.avg.toLocaleString('id-ID')}</td>
                       <td className="p-2 text-[10px] font-black text-rose-500 text-right">Rp {row.today.disc.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
               </tbody>
               <tfoot className="bg-slate-950 font-black text-[9px] uppercase tracking-wider sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                  <tr>
                    <td className="p-4 border-t border-r border-white/20 text-white sticky left-0 bg-slate-950 z-20">TOTAL MTD</td>
                    {/* Lunch Totals */}
                    <td className="p-2 border-t border-white/10 text-right text-blue-400">Rp {salesHistoryTotals.lunchRev.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-white/10 text-center text-blue-300">{salesHistoryTotals.lunchCov}</td>
                    <td className="p-2 border-t border-white/10 text-right text-blue-200">Rp {salesHistoryAvg.lunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-r border-white/20 text-right text-rose-400/80">Rp {salesHistoryTotals.lunchDisc.toLocaleString('id-ID')}</td>
                    {/* Dinner Totals */}
                    <td className="p-2 border-t border-white/10 text-right text-orange-400">Rp {salesHistoryTotals.dinnerRev.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-white/10 text-center text-orange-300">{salesHistoryTotals.dinnerCov}</td>
                    <td className="p-2 border-t border-white/10 text-right text-orange-200">Rp {salesHistoryAvg.dinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-r border-white/20 text-right text-rose-400/80">Rp {salesHistoryTotals.dinnerDisc.toLocaleString('id-ID')}</td>
                    {/* Today Totals */}
                    <td className="p-2 border-t border-white/10 text-right text-emerald-500">Rp {salesHistoryTotals.todayRev.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-white/10 text-center text-emerald-300">{salesHistoryTotals.todayCov}</td>
                    <td className="p-2 border-t border-white/10 text-right text-indigo-400 text-xs">Rp {salesHistoryAvg.today.toLocaleString('id-ID')}</td>
                    <td className="p-2 border-t border-white/20 text-right text-rose-500">Rp {salesHistoryTotals.todayDisc.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr className="bg-slate-900/60 font-black border-t-2 border-indigo-500/30">
                    <td className="p-4 border-r border-white/20 text-indigo-400 sticky left-0 bg-slate-900/90 z-20 whitespace-nowrap">MTD DAILY AVG REV</td>
                    {/* Lunch Avg */}
                    <td className="p-2 text-right text-blue-400/60">Rp {mtdDailyAvgRev.lunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-center text-blue-300/40">-</td>
                    <td className="p-2 text-right text-blue-200/40">-</td>
                    <td className="p-2 border-r border-white/20 text-right text-rose-400/40">-</td>
                    {/* Dinner Avg */}
                    <td className="p-2 text-right text-orange-400/60">Rp {mtdDailyAvgRev.dinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-center text-orange-300/40">-</td>
                    <td className="p-2 text-right text-orange-200/40">-</td>
                    <td className="p-2 border-r border-white/20 text-right text-rose-400/40">-</td>
                    {/* Today Avg */}
                    <td className="p-2 text-right text-emerald-500/60">Rp {mtdDailyAvgRev.today.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-center text-emerald-300/40">-</td>
                    <td className="p-2 text-right text-indigo-400/40">-</td>
                    <td className="p-2 text-right text-rose-500/40">-</td>
                  </tr>
               </tfoot>
            </table>
         </div>
      </section>

      {/* GO FOOD, GRAB FOOD & TAKE AWAY SALES LOGS (MTD) */}
      <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-emerald-600 shadow-2xl">
         <div className="flex justify-between items-center mb-8">
            <h3 className="text-xs font-black uppercase text-emerald-400 flex items-center gap-3">
               <i className="fas fa-motorcycle"></i> GoFood, GrabFood & Take Away Daily Sales Logs (MTD)
            </h3>
            <button 
              onClick={handleExportDeliveryPerformance}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 no-print"
            >
              <i className="fas fa-file-excel"></i> Convert to Excel
            </button>
         </div>
         <div className="overflow-x-auto custom-scrollbar font-sans">
            <table className="w-full text-left border-collapse min-w-[1240px]">
               <thead className="bg-slate-950/60 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                  <tr>
                    <th className="p-4 border-b border-white/5 sticky left-0 bg-slate-900 z-20">Date</th>
                    <th className="p-4 border-b border-white/5 text-center bg-indigo-500/10" colSpan={3}>GO FOOD</th>
                    <th className="p-4 border-b border-white/5 text-center bg-emerald-500/10" colSpan={3}>GRAB FOOD</th>
                    <th className="p-4 border-b border-white/5 text-center bg-amber-500/10" colSpan={3}>TAKE AWAY</th>
                    <th className="p-4 border-b border-white/5 text-center bg-purple-500/10 border-l border-white/10" colSpan={3}>COMBINED DIGITAL & TAKE AWAY</th>
                  </tr>
                  <tr className="bg-slate-900/40 text-[7px]">
                    <th className="p-2 border-b border-white/5 sticky left-0 bg-slate-900 z-20"></th>
                    {/* Go Food */}
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Lunch</th>
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Dinner</th>
                    <th className="p-2 border-b border-white/5 text-right border-r border-white/10 text-indigo-400 font-bold">Total</th>
                    {/* Grab Food */}
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Lunch</th>
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Dinner</th>
                    <th className="p-2 border-b border-white/5 text-right border-r border-white/10 text-emerald-400 font-bold">Total</th>
                    {/* Take Away */}
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Lunch</th>
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Dinner</th>
                    <th className="p-2 border-b border-white/5 text-right border-r border-white/10 text-amber-400 font-bold">Total</th>
                    {/* Combined */}
                    <th className="p-2 border-b border-white/5 text-right text-slate-400 border-l border-white/10">Lunch</th>
                    <th className="p-2 border-b border-white/5 text-right text-slate-400">Dinner</th>
                    <th className="p-2 border-b border-white/5 text-right font-black text-purple-400">Grand Total</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {salesHistory.map((row) => {
                    const totalRowLunch = row.goFood.lunch + row.grabFood.lunch + row.takeAway.lunch;
                    const totalRowDinner = row.goFood.dinner + row.grabFood.dinner + row.takeAway.dinner;
                    const totalRowGrand = row.goFood.total + row.grabFood.total + row.takeAway.total;

                    return (
                      <tr key={row.date} className={`hover:bg-white/5 transition-colors ${row.date === safeStartDate ? 'bg-indigo-500/10' : ''}`}>
                         <td className="p-4 text-[9px] font-black text-slate-300 sticky left-0 bg-slate-900/90 backdrop-blur-md z-10 border-r border-white/5">
                           {new Date(row.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                           {row.date === safeStartDate && <span className="ml-1 bg-indigo-500 text-[6px] text-white px-1 py-0.5 rounded-full uppercase font-black">Today</span>}
                         </td>
                         {/* Go Food */}
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.goFood.lunch.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.goFood.dinner.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-bold text-right text-indigo-400 border-r border-white/10">Rp {row.goFood.total.toLocaleString('id-ID')}</td>
                         {/* Grab Food */}
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.grabFood.lunch.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.grabFood.dinner.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-bold text-right text-emerald-400 border-r border-white/10">Rp {row.grabFood.total.toLocaleString('id-ID')}</td>
                         {/* Take Away */}
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.takeAway.lunch.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-medium text-right text-slate-300">Rp {row.takeAway.dinner.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-bold text-right text-amber-400 border-r border-white/10">Rp {row.takeAway.total.toLocaleString('id-ID')}</td>
                         {/* Combined */}
                         <td className="p-2 text-[10px] font-semibold text-right text-purple-300 border-l border-white/10">Rp {totalRowLunch.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-semibold text-right text-purple-300">Rp {totalRowDinner.toLocaleString('id-ID')}</td>
                         <td className="p-2 text-[10px] font-black text-right text-purple-400">Rp {totalRowGrand.toLocaleString('id-ID')}</td>
                      </tr>
                    );
                  })}
               </tbody>
               <tfoot className="bg-slate-950 font-black text-[9px] uppercase tracking-wider sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                  <tr className="border-t border-white/20">
                    <td className="p-4 border-r border-white/20 text-white sticky left-0 bg-slate-950 z-20">TOTAL MTD</td>
                    {/* Go Food */}
                    <td className="p-2 text-right text-indigo-300">Rp {deliveryHistoryTotals.goFoodLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-indigo-300">Rp {deliveryHistoryTotals.goFoodDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-indigo-400 border-r border-white/10">Rp {deliveryHistoryTotals.goFoodTotal.toLocaleString('id-ID')}</td>
                    {/* Grab Food */}
                    <td className="p-2 text-right text-emerald-300">Rp {deliveryHistoryTotals.grabFoodLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-emerald-300">Rp {deliveryHistoryTotals.grabFoodDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-emerald-400 border-r border-white/10">Rp {deliveryHistoryTotals.grabFoodTotal.toLocaleString('id-ID')}</td>
                    {/* Take Away */}
                    <td className="p-2 text-right text-amber-300">Rp {deliveryHistoryTotals.takeAwayLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-amber-300">Rp {deliveryHistoryTotals.takeAwayDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-amber-400 border-r border-white/10">Rp {deliveryHistoryTotals.takeAwayTotal.toLocaleString('id-ID')}</td>
                    {/* Combined */}
                    <td className="p-2 text-right text-purple-300 border-l border-white/10">Rp {deliveryHistoryTotals.combinedLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-purple-300">Rp {deliveryHistoryTotals.combinedDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-purple-400">Rp {deliveryHistoryTotals.combinedTotal.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr className="bg-slate-900/60 font-black border-t-2 border-emerald-500/30">
                    <td className="p-4 border-r border-white/20 text-emerald-400 sticky left-0 bg-slate-900/90 z-20 whitespace-nowrap font-black font-sans">MTD DAILY AVG</td>
                    {/* Go Food */}
                    <td className="p-2 text-right text-indigo-300/60">Rp {deliveryDailyAvg.goFoodLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-indigo-300/60">Rp {deliveryDailyAvg.goFoodDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-indigo-400/80 border-r border-white/10">Rp {deliveryDailyAvg.goFoodTotal.toLocaleString('id-ID')}</td>
                    {/* Grab Food */}
                    <td className="p-2 text-right text-emerald-300/60">Rp {deliveryDailyAvg.grabFoodLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-emerald-300/60">Rp {deliveryDailyAvg.grabFoodDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-emerald-400/80 border-r border-white/10">Rp {deliveryDailyAvg.grabFoodTotal.toLocaleString('id-ID')}</td>
                    {/* Take Away */}
                    <td className="p-2 text-right text-amber-300/60">Rp {deliveryDailyAvg.takeAwayLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-amber-300/60">Rp {deliveryDailyAvg.takeAwayDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-amber-400/80 border-r border-white/10">Rp {deliveryDailyAvg.takeAwayTotal.toLocaleString('id-ID')}</td>
                    {/* Combined */}
                    <td className="p-2 text-right text-purple-300/60 border-l border-white/10">Rp {deliveryDailyAvg.combinedLunch.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-purple-300/60">Rp {deliveryDailyAvg.combinedDinner.toLocaleString('id-ID')}</td>
                    <td className="p-2 text-right text-purple-400/80">Rp {deliveryDailyAvg.combinedTotal.toLocaleString('id-ID')}</td>
                  </tr>
               </tfoot>
            </table>
         </div>
      </section>

      {/* DETAILED OPEX & PATTY CASH EXPENSE BREAKDOWN */}
      <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-red-500 shadow-2xl">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
               <h3 className="text-xs font-black uppercase text-red-400 flex items-center gap-3">
                  <i className="fas fa-wallet"></i> Opex Expense Breakdown (Patty Cash & Third Party)
               </h3>
               <p className="text-[10px] text-slate-400 mt-1 font-medium">
                  Sinkronisasi riil dari pengeluaran yang diinput di fitur Patty Cash Expense & Third Party
               </p>
            </div>
            
            <div className="flex items-center gap-3 no-print flex-wrap">
               <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/10">
                  <button
                     onClick={() => setOpexViewMode('weekly')}
                     className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        opexViewMode === 'weekly'
                           ? 'bg-red-600 text-white shadow-md'
                           : 'text-slate-400 hover:text-white'
                     }`}
                  >
                     <i className="fas fa-calendar-week mr-1.5"></i> Mingguan (Weekly)
                  </button>
                  <button
                     onClick={() => setOpexViewMode('daily')}
                     className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        opexViewMode === 'daily'
                           ? 'bg-red-600 text-white shadow-md'
                           : 'text-slate-400 hover:text-white'
                     }`}
                  >
                     <i className="fas fa-calendar-day mr-1.5"></i> Harian (Daily Full Tanggal)
                  </button>
               </div>

               <button 
                  onClick={opexViewMode === 'weekly' ? handleExportWeeklyOpex : handleExportDailyOpex}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 cursor-pointer"
               >
                  <i className="fas fa-file-excel"></i> Convert to Excel
               </button>
            </div>
         </div>

         {opexViewMode === 'weekly' ? (
           <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead className="bg-yellow-400 text-slate-900 text-[10px] font-black uppercase">
                <tr>
                  <th className="p-3 border border-slate-900/20">PERIODE</th>
                  <th className="p-3 border border-slate-900/20 text-right">COMMODITY</th>
                  <th className="p-3 border border-slate-900/20 text-right">NON COMMODITY</th>
                  <th className="p-3 border border-slate-900/20 text-right">MAINTENANCE</th>
                  <th className="p-3 border border-slate-900/20 text-right">ATK</th>
                  <th className="p-3 border border-slate-900/20 text-right">ASSET EXPENSE</th>
                  <th className="p-3 border border-slate-900/20 text-right">CASUAL EXPENSE</th>
                  <th className="p-3 border border-slate-900/20 text-right">PETTY CASH LAINNYA</th>
                  <th className="p-3 border border-slate-900/20 text-right">THIRD PARTY</th>
                  <th className="p-3 border border-slate-900/20 text-right">GRAND TOTAL</th>
                </tr>
              </thead>
              <tbody className="bg-slate-950/20">
                {weeklyOpex.map((row: any, idx) => (
                  <tr key={idx} className="text-[11px] hover:bg-white/5 transition-colors border-b border-white/5">
                    <td className="p-3 font-black text-slate-300 border-r border-white/5">{row.label}</td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.commodity > 0 ? `Rp ${row.stats.commodity.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.nonCommodity > 0 ? `Rp ${row.stats.nonCommodity.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.maintenance > 0 ? `Rp ${row.stats.maintenance.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.atk > 0 ? `Rp ${row.stats.atk.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.asset > 0 ? `Rp ${row.stats.asset.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.casual > 0 ? `Rp ${row.stats.casual.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.cash > 0 ? `Rp ${row.stats.cash.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400 border-r border-white/5">
                      {row.stats.thirdParty > 0 ? `Rp ${row.stats.thirdParty.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-right font-black text-slate-200">
                      {row.rowTotal > 0 ? `Rp ${row.rowTotal.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950/60 font-black text-[11px] uppercase">
                <tr>
                  <td className="p-3 border border-slate-900/20 text-white">TOTAL MTD</td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.commodity > 0 ? `Rp ${grandOpexTotals.commodity.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.nonCommodity > 0 ? `Rp ${grandOpexTotals.nonCommodity.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.maintenance > 0 ? `Rp ${grandOpexTotals.maintenance.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.atk > 0 ? `Rp ${grandOpexTotals.atk.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.asset > 0 ? `Rp ${grandOpexTotals.asset.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.casual > 0 ? `Rp ${grandOpexTotals.casual.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.cash > 0 ? `Rp ${grandOpexTotals.cash.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.thirdParty > 0 ? `Rp ${grandOpexTotals.thirdParty.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandOpexTotals.total > 0 ? `Rp ${grandOpexTotals.total.toLocaleString('id-ID')}` : '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
           </div>
         ) : (
           <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-red-600 text-white text-[10px] font-black uppercase">
                <tr>
                  <th className="p-2.5 border border-red-700">TGL</th>
                  <th className="p-2.5 border border-red-700 text-center">HARI</th>
                  <th className="p-2.5 border border-red-700 text-right">COMMODITY</th>
                  <th className="p-2.5 border border-red-700 text-right">NON COMMODITY</th>
                  <th className="p-2.5 border border-red-700 text-right">MAINTENANCE</th>
                  <th className="p-2.5 border border-red-700 text-right">ATK</th>
                  <th className="p-2.5 border border-red-700 text-right">ASSET</th>
                  <th className="p-2.5 border border-red-700 text-right">CASUAL</th>
                  <th className="p-2.5 border border-red-700 text-right">PETTY CASH LAIN</th>
                  <th className="p-2.5 border border-red-700 text-right">THIRD PARTY</th>
                  <th className="p-2.5 border border-red-700 text-right">TOTAL</th>
                  <th className="p-2.5 border border-red-700 text-center no-print">RINCIAN</th>
                </tr>
              </thead>
              <tbody className="bg-slate-950/20">
                {dailyOpexHistory.map((row, idx) => {
                  const itemsCount = getPattyCashItemsForDate(row.date).length;
                  const isCurrentSelected = row.date === safeStartDate;
                  return (
                    <tr 
                      key={idx} 
                      className={`text-[11px] hover:bg-white/5 transition-colors border-b border-white/5 ${
                        isCurrentSelected ? 'bg-indigo-950/30' : ''
                      }`}
                    >
                      <td className="p-2.5 font-bold text-slate-300 border-r border-white/5 whitespace-nowrap">
                        {row.date} {isCurrentSelected && <span className="text-[9px] bg-indigo-500/30 text-indigo-300 px-1 py-0.2 rounded ml-1">Today</span>}
                      </td>
                      <td className="p-2.5 text-center text-slate-400 border-r border-white/5 font-semibold">
                        {row.dayName}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.commodity > 0 ? `Rp ${row.commodity.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.nonCommodity > 0 ? `Rp ${row.nonCommodity.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.maintenance > 0 ? `Rp ${row.maintenance.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.atk > 0 ? `Rp ${row.atk.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.asset > 0 ? `Rp ${row.asset.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.casual > 0 ? `Rp ${row.casual.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.cash > 0 ? `Rp ${row.cash.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-400 border-r border-white/5">
                        {row.thirdParty > 0 ? `Rp ${row.thirdParty.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right font-black text-slate-200 border-r border-white/5">
                        {row.total > 0 ? `Rp ${row.total.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-2 text-center no-print whitespace-nowrap">
                        {itemsCount > 0 ? (
                          <button
                            onClick={() => {
                              setSelectedPattyCashDetailDate(row.date);
                              setShowPattyCashItemModal(true);
                            }}
                            className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[9px] font-bold inline-flex items-center gap-1 cursor-pointer transition-all border border-amber-500/30"
                          >
                            <i className="fas fa-receipt text-[8px]"></i> {itemsCount} Item
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-950/60 font-black text-[11px] uppercase">
                <tr>
                  <td colSpan={2} className="p-3 border border-slate-900/20 text-white">TOTAL MTD</td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.commodity > 0 ? `Rp ${grandDailyOpexTotals.commodity.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.nonCommodity > 0 ? `Rp ${grandDailyOpexTotals.nonCommodity.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.maintenance > 0 ? `Rp ${grandDailyOpexTotals.maintenance.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.atk > 0 ? `Rp ${grandDailyOpexTotals.atk.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.asset > 0 ? `Rp ${grandDailyOpexTotals.asset.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.casual > 0 ? `Rp ${grandDailyOpexTotals.casual.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.cash > 0 ? `Rp ${grandDailyOpexTotals.cash.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.thirdParty > 0 ? `Rp ${grandDailyOpexTotals.thirdParty.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 text-right border border-slate-900/20 text-emerald-400">
                    {grandDailyOpexTotals.total > 0 ? `Rp ${grandDailyOpexTotals.total.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="p-3 border border-slate-900/20 no-print"></td>
                </tr>
              </tfoot>
            </table>
           </div>
         )}
      </section>

      {/* CITY LEDGER, CUSTOMER SATISFACTION & COMPLIMENTARY LOG */}
      <section className="glass-card p-8 bg-slate-900/60 border-t-2 border-indigo-400 shadow-2xl mt-8">
         <div className="flex justify-between items-center mb-8">
            <h3 className="text-xs font-black uppercase text-indigo-400 flex items-center gap-3 text-center w-full justify-center">
               City Ledger, Customer Satisfaction & Complimentary Expense
            </h3>
            <button 
              onClick={handleExportLogistics}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 no-print"
            >
              <i className="fas fa-file-excel"></i> Convert to Excel
            </button>
         </div>
         <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1500px]">
               <thead className="bg-slate-950/80 text-[8px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th rowSpan={2} className="p-4 border-b border-r border-white/10 text-center">Date</th>
                    <th colSpan={3} className="p-4 border-b border-r border-white/10 text-center">Bill City Ledger</th>
                    <th rowSpan={2} className="p-4 border-b border-r border-white/10 text-center">Reason</th>
                    <th colSpan={3} className="p-4 border-b border-r border-white/10 text-center">Bill Customer Satisfaction</th>
                    <th rowSpan={2} className="p-4 border-b border-r border-white/10 text-center">Reason</th>
                    <th colSpan={3} className="p-4 border-b border-r border-white/10 text-center">Bill Complimentary</th>
                    <th rowSpan={2} className="p-4 border-b border-white/10 text-center">Reason</th>
                  </tr>
                  <tr>
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[120px]">Item Name</th>
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[50px]">Qty</th>
                    <th className="p-2 border-b border-r border-white/10 text-center min-w-[100px]">Nominal</th>
                    
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[120px]">Item Name</th>
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[50px]">Qty</th>
                    <th className="p-2 border-b border-r border-white/10 text-center min-w-[100px]">Nominal</th>
                    
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[120px]">Item Name</th>
                    <th className="p-2 border-b border-r border-white/5 text-center min-w-[50px]">Qty</th>
                    <th className="p-2 border-b border-r border-white/10 text-center min-w-[100px]">Nominal</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {combinedLogistics.length > 0 ? combinedLogistics.map((row) => {
                    const maxRows = Math.max(row.cityLedger.length, row.customerSat.length, row.complimentary.length, 1);
                    return Array.from({ length: maxRows }).map((_, i) => (
                      <tr key={`${row.date}-${i}`} className={`hover:bg-white/5 transition-colors ${row.date === safeStartDate ? 'bg-indigo-500/5' : ''}`}>
                         {i === 0 && (
                           <td rowSpan={maxRows} className="p-4 text-[10px] font-black text-slate-300 border-r border-white/5 text-center align-middle">
                             {new Date(row.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                           </td>
                         )}
                         {/* City Ledger */}
                         <td className="p-2 text-[10px] font-medium text-slate-300 border-r border-white/5">
                           {row.cityLedger[i]?.name || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-medium text-slate-400 text-center border-r border-white/5">
                           {row.cityLedger[i]?.qty || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-black text-white text-right border-r border-white/5">
                           {row.cityLedger[i] ? `Rp ${row.cityLedger[i].price.toLocaleString('id-ID')}` : '-'}
                         </td>
                         <td className="p-2 text-[9px] font-bold text-slate-500 border-r border-white/10 italic">
                           {row.cityLedger[i]?.reason || '-'}
                         </td>

                         {/* Customer Sat */}
                         <td className="p-2 text-[10px] font-medium text-slate-300 border-r border-white/5">
                           {row.customerSat[i]?.name || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-medium text-slate-400 text-center border-r border-white/5">
                           {row.customerSat[i]?.qty || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-black text-white text-right border-r border-white/5">
                           {row.customerSat[i] ? `Rp ${row.customerSat[i].price.toLocaleString('id-ID')}` : '-'}
                         </td>
                         <td className="p-2 text-[9px] font-bold text-slate-500 border-r border-white/10 italic">
                           {row.customerSat[i]?.reason || '-'}
                         </td>

                         {/* Complimentary */}
                         <td className="p-2 text-[10px] font-medium text-slate-300 border-r border-white/5">
                           {row.complimentary[i]?.name || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-medium text-slate-400 text-center border-r border-white/5">
                           {row.complimentary[i]?.qty || '-'}
                         </td>
                         <td className="p-2 text-[10px] font-black text-white text-right border-r border-white/5">
                           {row.complimentary[i] ? `Rp ${row.complimentary[i].price.toLocaleString('id-ID')}` : '-'}
                         </td>
                         <td className="p-2 text-[9px] font-bold text-slate-500 italic">
                           {row.complimentary[i]?.reason || '-'}
                         </td>
                      </tr>
                    ));
                  }) : (
                    <tr>
                       <td colSpan={13} className="p-20 text-center opacity-20">
                          <i className="fas fa-file-invoice-dollar text-4xl mb-4"></i>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Belum ada riwayat bill khusus bulan ini</p>
                       </td>
                    </tr>
                  )}
               </tbody>
               <tfoot className="bg-slate-950/80 font-black text-[9px] uppercase tracking-wider sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                  <tr>
                    <td className="p-4 border-t border-r border-white/20 text-white text-center">TOTAL</td>
                    {/* City Ledger Totals */}
                    <td className="p-2 border-t border-r border-white/10"></td>
                    <td className="p-2 border-t border-r border-white/10 text-center text-slate-300">
                      {combinedLogisticsTotals.cityQty > 0 ? combinedLogisticsTotals.cityQty.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-2 border-t border-r border-white/10 text-right text-emerald-400">
                      {combinedLogisticsTotals.cityNom > 0 ? `Rp ${combinedLogisticsTotals.cityNom.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-2 border-t border-r border-white/20"></td>

                    {/* Customer Sat Totals */}
                    <td className="p-2 border-t border-r border-white/10"></td>
                    <td className="p-2 border-t border-r border-white/10 text-center text-slate-300">
                      {combinedLogisticsTotals.satQty > 0 ? combinedLogisticsTotals.satQty.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-2 border-t border-r border-white/10 text-right text-indigo-400">
                      {combinedLogisticsTotals.satNom > 0 ? `Rp ${combinedLogisticsTotals.satNom.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-2 border-t border-r border-white/20"></td>

                    {/* Complimentary Totals */}
                    <td className="p-2 border-t border-r border-white/10"></td>
                    <td className="p-2 border-t border-r border-white/10 text-center text-slate-300">
                      {combinedLogisticsTotals.compQty > 0 ? combinedLogisticsTotals.compQty.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="p-2 border-t border-r border-white/10 text-right text-rose-400">
                      {combinedLogisticsTotals.compNom > 0 ? `Rp ${combinedLogisticsTotals.compNom.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-2 border-t border-white/20"></td>
                  </tr>
               </tfoot>
            </table>
         </div>
      </section>
      {/* MODAL: RINCIAN ITEM BELANJA PATTY CASH EXPENSE */}
      {showPattyCashItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <i className="fas fa-receipt"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white tracking-wider">
                    Rincian Belanja Patty Cash Expense
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Tanggal: <span className="font-bold text-amber-300">{selectedPattyCashDetailDate || safeStartDate}</span> • Outlet: <span className="font-bold text-white">{selectedOutlet}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPattyCashItemModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
              {(() => {
                const targetDate = selectedPattyCashDetailDate || safeStartDate;
                const items = getPattyCashItemsForDate(targetDate);
                if (items.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500">
                      <i className="fas fa-inbox text-3xl mb-3 opacity-40"></i>
                      <p className="text-xs font-semibold">Tidak ada rincian item belanja yang tercatat pada tanggal ini.</p>
                    </div>
                  );
                }

                const totalBelanja = items.reduce((acc, curr) => acc + ((Number(curr.item.qty) || 0) * (Number(curr.item.price) || 0)), 0);

                const getCategoryBadge = (cat: string) => {
                  switch (cat) {
                    case 'Non-Commodity': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                    case 'Commodity': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                    case 'Maintenance': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                    case 'Asset & Equipment': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                    case 'Casual / DW': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
                    case 'ATK & Printing': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
                    case 'Petty Cash Lainnya': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                    case 'Third Party': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
                    default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
                  }
                };

                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[650px]">
                        <thead className="bg-slate-950/80 text-[10px] font-black uppercase text-slate-400">
                          <tr>
                            <th className="p-3 border-b border-white/10 text-center w-12">No</th>
                            <th className="p-3 border-b border-white/10">Kategori</th>
                            <th className="p-3 border-b border-white/10">Nama Item</th>
                            <th className="p-3 border-b border-white/10 text-center">Qty</th>
                            <th className="p-3 border-b border-white/10 text-right">Harga Satuan</th>
                            <th className="p-3 border-b border-white/10 text-right">Subtotal</th>
                            <th className="p-3 border-b border-white/10">PIC / Nota</th>
                            <th className="p-3 border-b border-white/10">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-[11px]">
                          {items.map((row, idx) => {
                            const subtotal = (Number(row.item.qty) || 0) * (Number(row.item.price) || 0);
                            return (
                              <tr key={idx} className="hover:bg-white/5 transition-colors">
                                <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${getCategoryBadge(row.category)}`}>
                                    {row.category}
                                  </span>
                                </td>
                                <td className="p-3 font-bold text-white">{row.item.name || '-'}</td>
                                <td className="p-3 text-center text-slate-300 font-mono">{row.item.qty || 0}</td>
                                <td className="p-3 text-right text-slate-300 font-mono">Rp {(Number(row.item.price) || 0).toLocaleString('id-ID')}</td>
                                <td className="p-3 text-right font-black text-emerald-400 font-mono">Rp {subtotal.toLocaleString('id-ID')}</td>
                                <td className="p-3 text-slate-400 text-[10px]">{row.item.pic || '-'}</td>
                                <td className="p-3 text-slate-400 text-[10px]">{row.item.reason || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-950/80 font-black text-[11px] border-t-2 border-amber-500/40">
                          <tr>
                            <td colSpan={5} className="p-3 text-white uppercase text-right">Total Belanja Hari Ini:</td>
                            <td className="p-3 text-right font-black text-emerald-400 font-mono text-sm">Rp {totalBelanja.toLocaleString('id-ID')}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setShowPattyCashItemModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
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

export default ReportingModule;