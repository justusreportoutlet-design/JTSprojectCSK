import React, { useState, useEffect, useMemo } from "react";
import { SalesData, DailySalesData, LedgerItem, BankingPromoItem } from "../types";
import ShareActions from "./ShareActions";

import { motion, AnimatePresence } from "motion/react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

interface Props {
  data: SalesData;
  dailyTargets: Record<string, number>;
  filters: { month: string; startDate: string; endDate: string; outlet?: string };
  onUpdate: (v: SalesData, priority?: boolean) => void;
  showToast?: (message: string, type?: "success" | "error") => void;
  dailyCustomerSat: Record<string, LedgerItem[]>;
}

export const DEFAULT_BANKING_PROMOS: BankingPromoItem[] = [
  {
    id: "digibank",
    name: "Digibank by DBS",
    terms: "All F&B - JKT/TGR/BKS Disc Rp.150.000 with Min. Purchase Rp.1.250.000",
    isActive: true,
  },
  {
    id: "bank_mega",
    name: "Bank MEGA",
    terms: "All F&B Disc. 15% Min. Purchase Rp.650.000 (Max. Disc Rp.150.000)",
    isActive: true,
  },
];

const DEFAULT_DISCOUNT_NAMES = {
  investorName: "INVESTOR 1",
  investorName2: "INVESTOR 2",
  investorName3: "INVESTOR 3",
  cadanganName1: "CADANGAN 1",
  cadanganName2: "CADANGAN 2",
  cadanganName3: "CADANGAN 3",
};

const EMPTY_DAILY_RECORD: any = {
  revenue: 0,
  covers: 0,
  lunchRevenue: 0,
  lunchCovers: 0,
  dinnerRevenue: 0,
  dinnerCovers: 0,
  discountLunch: 0,
  discountDinner: 0,
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
  discClosingInvestor: 0,
  discClosingInvestor2: 0,
  discClosingInvestor3: 0,
  discClosingCadangan1: 0,
  discClosingCadangan2: 0,
  discClosingCadangan3: 0,
  dineInRevenue: 0,
  takeAwayRevenue: 0,
  goFoodRevenue: 0,
  grabFoodRevenue: 0,
  pettyCash: 1500000,
  setorTunai: 0,
  inputNonFood: "",
  investorName: "INVESTOR 1",
  investorName2: "INVESTOR 2",
  investorName3: "INVESTOR 3",
  cadanganName1: "CADANGAN 1",
  cadanganName2: "CADANGAN 2",
  cadanganName3: "CADANGAN 3",
  membershipCover: 0,
  membershipRevenueLunch: 0,
  membershipRevenueDinner: 0,
  membershipRevenue: 0,
  bankMegaCover: 0,
  bankMegaRevenueLunch: 0,
  bankMegaRevenueDinner: 0,
  bankMegaRevenue: 0,
  digibankCover: 0,
  digibankRevenueLunch: 0,
  digibankRevenueDinner: 0,
  digibankRevenue: 0,
  digibankDiscount: 0,
  customerSatRevenue: 0,
  discManagementRevenue: 0,
  discManagementName: "",
};

const SalesModule: React.FC<Props> = ({
  data,
  dailyTargets,
  filters,
  onUpdate,
  showToast,
  dailyCustomerSat,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const onUpdateRef = React.useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const monthlyDiscountNames = useMemo(() => {
    const monthKey = filters.startDate.substring(0, 7);
    return data.monthlyDiscountNames?.[monthKey] || DEFAULT_DISCOUNT_NAMES;
  }, [data.monthlyDiscountNames, filters.startDate]);

  const currentMonthKey = useMemo(() => {
    return filters.startDate ? filters.startDate.substring(0, 7) : `${filters.year || new Date().getFullYear()}-${(parseInt(filters.month) + 1).toString().padStart(2, '0')}`;
  }, [filters.startDate, filters.month, filters.year]);

  const isBankPromoEnabled = useMemo(() => {
    const periodConf = data.promoSettings?.periodSettings?.[currentMonthKey];
    if (periodConf && typeof periodConf.bankPromoEnabled === 'boolean') {
      return periodConf.bankPromoEnabled;
    }
    return data.promoSettings?.bankPromoEnabled ?? true;
  }, [data.promoSettings, currentMonthKey]);

  const isPromoEnabled = useMemo(() => {
    const periodConf = data.promoSettings?.periodSettings?.[currentMonthKey];
    if (periodConf && typeof periodConf.promoEnabled === 'boolean') {
      return periodConf.promoEnabled;
    }
    return data.promoSettings?.promoEnabled ?? true;
  }, [data.promoSettings, currentMonthKey]);

  // Banking Promos State & Active Promos List (Filtered strictly by Target Outlet configured in Outlet Control)
  const [promoConfigVersion, setPromoConfigVersion] = useState(0);
  useEffect(() => {
    const handlePromoChange = () => setPromoConfigVersion(v => v + 1);
    window.addEventListener('appPromoSettingsChanged', handlePromoChange);

    // Also listen directly to Firestore system_config/promo_settings for cross-client real-time update
    const promoDocRef = doc(db, 'system_config', 'promo_settings');
    const unsubPromo = onSnapshot(promoDocRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('APP_PROMO_SETTINGS', JSON.stringify(d));
          }
        } catch (e) {}
        setPromoConfigVersion(v => v + 1);
      }
    }, (err) => {
      console.warn('[SalesModule] Listener notice for promo_settings:', err);
    });

    return () => {
      window.removeEventListener('appPromoSettingsChanged', handlePromoChange);
      unsubPromo();
    };
  }, []);

  const currentBankPromos: BankingPromoItem[] = useMemo(() => {
    const activeOutletName = filters.outlet || 'SH THE BARN';
    let baseList: BankingPromoItem[] = DEFAULT_BANKING_PROMOS;

    // Check local storage or promoSettings
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('APP_PROMO_SETTINGS') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.customBankPromos) && parsed.customBankPromos.length > 0) {
          baseList = parsed.customBankPromos;
        }
      }
    } catch (e) {}

    const map = new Map<string, BankingPromoItem>();
    const list = (data as any).bankingPromos || (data as any).promoSettings?.customBankPromos;
    if (Array.isArray(list) && list.length > 0) {
      list.forEach((p: BankingPromoItem) => {
        if (p && p.id) map.set(p.id, p);
      });
    }
    // Master settings from Outlet Control take highest priority
    baseList.forEach(p => {
      if (p && p.id) map.set(p.id, p);
    });

    const merged = Array.from(map.values());

    // Filter strictly by target outlets!
    return merged.filter(promo => {
      if (!promo.targetOutlets || promo.targetOutlets.length === 0 || promo.targetOutlets.includes('ALL')) {
        return true;
      }
      return promo.targetOutlets.includes(activeOutletName);
    });
  }, [data, filters.outlet, promoConfigVersion]);

  const activeBankPromos = useMemo(() => {
    return currentBankPromos.filter(p => p.isActive);
  }, [currentBankPromos]);

  // Comprehensive centralized discount calculator that synchronizes all discount sources:
  // Investor, Pak Yudi, Cadangan, Justus Membership, Customer Satisfaction, Management,
  // and all Bank/Promo programs (Lunch, Dinner/Closing, and Custom Discount)
  const calculateDiscounts = (batch: any) => {
    // 1. Investor discounts
    const lunchInvestor =
      (Number(batch.discLunchInvestor) || 0) +
      (Number(batch.discLunchInvestor2) || 0) +
      (Number(batch.discLunchInvestor3) || 0);
    const dinnerInvestor =
      (Number(batch.discDinnerInvestor) || 0) +
      (Number(batch.discDinnerInvestor2) || 0) +
      (Number(batch.discDinnerInvestor3) || 0);

    // 2. Pak Yudi (CEO)
    const lunchPakYudi = Number(batch.discLunchPakYudi) || 0;
    const dinnerPakYudi = Number(batch.discDinnerPakYudi) || 0;

    // 3. Cadangan discounts
    const lunchCadangan =
      (Number(batch.discLunchCadangan1) || 0) +
      (Number(batch.discLunchCadangan2) || 0) +
      (Number(batch.discLunchCadangan3) || 0);
    const dinnerCadangan =
      (Number(batch.discDinnerCadangan1) || 0) +
      (Number(batch.discDinnerCadangan2) || 0) +
      (Number(batch.discDinnerCadangan3) || 0);

    // 4. Membership program
    const lunchMember = Number(batch.membershipRevenueLunch) || 0;
    const dinnerMember = Number(batch.membershipRevenueDinner) || 0;

    // 5. Promo & Banking programs
    let lunchPromo = 0;
    let dinnerPromo = 0;
    const accountedPromoIds = new Set<string>();

    const entries = batch.promoBankEntries;
    if (entries && typeof entries === 'object') {
      Object.entries(entries).forEach(([pId, entry]: [string, any]) => {
        if (!entry) return;
        accountedPromoIds.add(pId);
        const rLunch = Number(entry.revLunch) || 0;
        const rClose = Number(entry.rev) || 0;
        const rDinner = entry.revDinner !== undefined ? Number(entry.revDinner) : Math.max(0, rClose - rLunch);
        const disc = Number(entry.disc ?? entry.discount) || 0;

        if (pId === 'bank_mega') {
          const bmLunch = Math.max(rLunch, Number(batch.bankMegaRevenueLunch) || 0);
          const bmDinner = Math.max(rDinner, Number(batch.bankMegaRevenueDinner) || 0);
          lunchPromo += bmLunch;
          dinnerPromo += bmDinner + disc;
        } else if (pId === 'digibank') {
          const dbLunch = Math.max(rLunch, Number(batch.digibankRevenueLunch) || 0);
          const dbDinner = Math.max(rDinner, Number(batch.digibankRevenueDinner) || 0);
          const dbDisc = Math.max(disc, Number(batch.digibankDiscount) || 0);
          lunchPromo += dbLunch;
          dinnerPromo += dbDinner + dbDisc;
        } else {
          lunchPromo += rLunch;
          dinnerPromo += rDinner + disc;
        }
      });
    }

    if (!accountedPromoIds.has('bank_mega')) {
      lunchPromo += Number(batch.bankMegaRevenueLunch) || 0;
      dinnerPromo += Number(batch.bankMegaRevenueDinner) || 0;
    }
    if (!accountedPromoIds.has('digibank')) {
      lunchPromo += Number(batch.digibankRevenueLunch) || 0;
      dinnerPromo += (Number(batch.digibankRevenueDinner) || 0) + (Number(batch.digibankDiscount) || 0);
    }

    const discountLunch = lunchInvestor + lunchPakYudi + lunchCadangan + lunchMember + lunchPromo;
    const discountDinner = dinnerInvestor + dinnerPakYudi + dinnerCadangan + dinnerMember + dinnerPromo;

    const customerSatRevenue = Number(batch.customerSatRevenue) || 0;
    const discManagementRevenue = Number(batch.discManagementRevenue) || 0;

    const totalDiscount = discountLunch + discountDinner + customerSatRevenue + discManagementRevenue;

    return {
      discountLunch,
      discountDinner,
      totalDiscount,
    };
  };

  const getCustomBankPromoTotalDiscount = (promoBankEntries?: Record<string, any>): number => {
    if (!promoBankEntries || typeof promoBankEntries !== 'object') return 0;
    return Object.entries(promoBankEntries).reduce((sum, [pId, entry]) => {
      if (pId === 'digibank' || pId === 'bank_mega') return sum;
      const rLunch = Number(entry?.revLunch) || 0;
      const rClose = Number(entry?.rev) || 0;
      const rDinner = entry?.revDinner !== undefined ? Number(entry.revDinner) : Math.max(0, rClose - rLunch);
      const disc = Number(entry?.disc ?? entry?.discount) || 0;
      return sum + rLunch + rDinner + disc;
    }, 0);
  };

  const getPromoValues = (promoId: string) => {
    const entry = (localBatch as any).promoBankEntries?.[promoId];
    if (entry) {
      const cLunch = Number(entry.coverLunch) || 0;
      const cClose = Number(entry.cover) || 0;
      const cDinner = entry.coverDinner !== undefined ? Number(entry.coverDinner) : Math.max(0, cClose - cLunch);
      const rLunch = Number(entry.revLunch) || 0;
      const rClose = Number(entry.rev) || 0;
      const rDinner = entry.revDinner !== undefined ? Number(entry.revDinner) : Math.max(0, rClose - rLunch);
      const disc = Number(entry.disc ?? entry.discount) || 0;
      return {
        coverLunch: cLunch,
        coverClosing: cClose,
        coverDinner: cDinner,
        revLunch: rLunch,
        revClosing: rClose,
        revDinner: rDinner,
        discount: disc,
      };
    }

    if (promoId === 'digibank') {
      return {
        coverLunch: Number(localBatch.digibankCoverLunch) || 0,
        coverClosing: Number(localBatch.digibankCover) || 0,
        coverDinner: Number(localBatch.digibankCoverDinner) || 0,
        revLunch: Number(localBatch.digibankRevenueLunch) || 0,
        revClosing: Number(localBatch.digibankRevenue) || 0,
        revDinner: Number(localBatch.digibankRevenueDinner) || 0,
        discount: Number(localBatch.digibankDiscount) || 0,
      };
    }
    if (promoId === 'bank_mega') {
      return {
        coverLunch: Number(localBatch.bankMegaCoverLunch) || 0,
        coverClosing: Number(localBatch.bankMegaCover) || 0,
        coverDinner: Number(localBatch.bankMegaCoverDinner) || 0,
        revLunch: Number(localBatch.bankMegaRevenueLunch) || 0,
        revClosing: Number(localBatch.bankMegaRevenue) || 0,
        revDinner: Number(localBatch.bankMegaRevenueDinner) || 0,
        discount: 0,
      };
    }
    return {
      coverLunch: 0,
      coverClosing: 0,
      coverDinner: 0,
      revLunch: 0,
      revClosing: 0,
      revDinner: 0,
      discount: 0,
    };
  };

  const handlePromoInputChange = (promoId: string, field: 'coverLunch' | 'coverClosing' | 'revLunch' | 'revClosing' | 'discount', value: any) => {
    const num = Math.max(0, parseInt(String(value).replace(/[^0-9]/g, ''), 10) || 0);
    const promoDef = currentBankPromos.find(p => p.id === promoId);
    const promoName = promoDef?.name || promoId.replace(/_/g, ' ').toUpperCase();

    setLocalBatch(prev => {
      const prevEntries = { ...((prev as any).promoBankEntries || {}) };
      const cur = prevEntries[promoId] || (
        promoId === 'digibank'
          ? {
              name: 'Digibank',
              coverLunch: Number(prev.digibankCoverLunch) || 0,
              cover: Number(prev.digibankCover) || 0,
              coverDinner: Number(prev.digibankCoverDinner) || 0,
              revLunch: Number(prev.digibankRevenueLunch) || 0,
              rev: Number(prev.digibankRevenue) || 0,
              revDinner: Number(prev.digibankRevenueDinner) || 0,
              disc: Number(prev.digibankDiscount) || 0,
              discount: Number(prev.digibankDiscount) || 0
            }
          : promoId === 'bank_mega'
          ? {
              name: 'Bank MEGA',
              coverLunch: Number(prev.bankMegaCoverLunch) || 0,
              cover: Number(prev.bankMegaCover) || 0,
              coverDinner: Number(prev.bankMegaCoverDinner) || 0,
              revLunch: Number(prev.bankMegaRevenueLunch) || 0,
              rev: Number(prev.bankMegaRevenue) || 0,
              revDinner: Number(prev.bankMegaRevenueDinner) || 0,
              disc: 0,
              discount: 0
            }
          : { name: promoName, coverLunch: 0, cover: 0, revLunch: 0, rev: 0, disc: 0, discount: 0 }
      );

      const updated = { ...cur, name: cur.name || promoName };
      if (field === 'coverLunch') updated.coverLunch = num;
      else if (field === 'coverClosing') updated.cover = num;
      else if (field === 'revLunch') updated.revLunch = num;
      else if (field === 'revClosing') updated.rev = num;
      else if (field === 'discount') {
        updated.disc = num;
        updated.discount = num;
      }

      updated.coverDinner = Math.max(0, (updated.cover || 0) - (updated.coverLunch || 0));
      updated.revDinner = Math.max(0, (updated.rev || 0) - (updated.revLunch || 0));

      const allEntries = {
        ...prevEntries,
        [promoId]: updated
      };

      // Also sync legacy specific keys for digibank and bank_mega
      const legacySync: any = {};
      if (promoId === 'digibank') {
        legacySync.digibankCoverLunch = updated.coverLunch;
        legacySync.digibankCover = updated.cover;
        legacySync.digibankCoverDinner = updated.coverDinner;
        legacySync.digibankRevenueLunch = updated.revLunch;
        legacySync.digibankRevenue = updated.rev;
        legacySync.digibankRevenueDinner = updated.revDinner;
        legacySync.digibankDiscount = updated.disc;
      } else if (promoId === 'bank_mega') {
        legacySync.bankMegaCoverLunch = updated.coverLunch;
        legacySync.bankMegaCover = updated.cover;
        legacySync.bankMegaCoverDinner = updated.coverDinner;
        legacySync.bankMegaRevenueLunch = updated.revLunch;
        legacySync.bankMegaRevenue = updated.rev;
        legacySync.bankMegaRevenueDinner = updated.revDinner;
      }

      const nextBatch = {
        ...prev,
        ...legacySync,
        promoBankEntries: allEntries
      };

      const discounts = calculateDiscounts(nextBatch);

      return {
        ...nextBatch,
        discountLunch: discounts.discountLunch,
        discountDinner: discounts.discountDinner,
        totalDiscount: discounts.totalDiscount
      };
    });
  };

  const INITIAL_BATCH = {
    lunchRevenue: 0,
    lunchCovers: 0,
    dinnerRevenue: 0,
    dinnerCovers: 0,
    discountLunch: 0,
    discountDinner: 0,
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
    discClosingInvestor: 0,
    discClosingInvestor2: 0,
    discClosingInvestor3: 0,
    discClosingCadangan1: 0,
    discClosingCadangan2: 0,
    discClosingCadangan3: 0,
    dineInRevenue: 0,
    takeAwayRevenue: 0,
    goFoodRevenue: 0,
    grabFoodRevenue: 0,
    takeAwayLunch: 0,
    takeAwayDinner: 0,
    goFoodLunch: 0,
    goFoodDinner: 0,
    grabFoodLunch: 0,
    grabFoodDinner: 0,
    pettyCash: 1500000,
    setorTunai: 0,
    inputNonFood: "",
    investorName: monthlyDiscountNames.investorName,
    investorName2: monthlyDiscountNames.investorName2,
    investorName3: monthlyDiscountNames.investorName3,
    cadanganName1: monthlyDiscountNames.cadanganName1,
    cadanganName2: monthlyDiscountNames.cadanganName2,
    cadanganName3: monthlyDiscountNames.cadanganName3,
    membershipCover: 0,
    membershipCoverLunch: 0,
    membershipCoverDinner: 0,
    membershipRevenueLunch: 0,
    membershipRevenueDinner: 0,
    membershipRevenue: 0,
    bankMegaCover: 0,
    bankMegaCoverLunch: 0,
    bankMegaCoverDinner: 0,
    bankMegaRevenueLunch: 0,
    bankMegaRevenueDinner: 0,
    bankMegaRevenue: 0,
    digibankCover: 0,
    digibankCoverLunch: 0,
    digibankCoverDinner: 0,
    digibankRevenueLunch: 0,
    digibankRevenueDinner: 0,
    digibankRevenue: 0,
    digibankDiscount: 0,
    customerSatRevenue: 0,
    discManagementRevenue: 0,
    discManagementName: "",
    totalRevenue: 0,
    totalCovers: 0,
    totalDiscount: 0,
    promoBankEntries: {} as Record<string, any>,
  };

  const [localBatch, setLocalBatch] = useState(INITIAL_BATCH);

  useEffect(() => {
    setLocalBatch(prev => {
      if (
        prev.investorName === monthlyDiscountNames.investorName &&
        prev.investorName2 === monthlyDiscountNames.investorName2 &&
        prev.investorName3 === monthlyDiscountNames.investorName3 &&
        prev.cadanganName1 === monthlyDiscountNames.cadanganName1 &&
        prev.cadanganName2 === monthlyDiscountNames.cadanganName2 &&
        prev.cadanganName3 === monthlyDiscountNames.cadanganName3
      ) {
        return prev;
      }
      return {
        ...prev,
        investorName: monthlyDiscountNames.investorName,
        investorName2: monthlyDiscountNames.investorName2,
        investorName3: monthlyDiscountNames.investorName3,
        cadanganName1: monthlyDiscountNames.cadanganName1,
        cadanganName2: monthlyDiscountNames.cadanganName2,
        cadanganName3: monthlyDiscountNames.cadanganName3,
      };
    });
  }, [monthlyDiscountNames]);

  // NEW: Calculate Customer Sat from Expenses automatically
  const calculatedCustomerSat = useMemo(() => {
    const items = dailyCustomerSat[filters.startDate] || [];
    return items.reduce((acc, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.qty) || 0;
      return acc + price * qty;
    }, 0);
  }, [dailyCustomerSat, filters.startDate]);

  useEffect(() => {
    setLocalBatch((prev) => {
      const nextBatch = {
        ...prev,
        customerSatRevenue: calculatedCustomerSat,
      };
      const discs = calculateDiscounts(nextBatch);

      if (
        prev.customerSatRevenue === calculatedCustomerSat &&
        prev.discountLunch === discs.discountLunch &&
        prev.discountDinner === discs.discountDinner &&
        prev.totalDiscount === discs.totalDiscount
      ) {
        return prev;
      }
      return {
        ...nextBatch,
        discountLunch: discs.discountLunch,
        discountDinner: discs.discountDinner,
        totalDiscount: discs.totalDiscount,
      };
    });

    // Automatically sync to stored record if it exists
    const currentDailyRecording = data.dailyRecording;
    if (currentDailyRecording?.[filters.startDate]) {
      const currentRec = currentDailyRecording[filters.startDate] as any;
      if (currentRec.customerSatRevenue !== calculatedCustomerSat) {
        const updatedRec = {
          ...currentRec,
          customerSatRevenue: calculatedCustomerSat,
        };
        const discs = calculateDiscounts(updatedRec);
        updatedRec.discountLunch = discs.discountLunch;
        updatedRec.discountDinner = discs.discountDinner;
        updatedRec.totalDiscount = discs.totalDiscount;

        const updatedDailyRecording = {
          ...currentDailyRecording,
          [filters.startDate]: updatedRec,
        };
        onUpdateRef.current({
          ...data,
          dailyRecording: updatedDailyRecording,
          sales: {
            ...(data.sales || {}),
            dailyRecording: updatedDailyRecording,
          },
        });
      }
    }
  }, [calculatedCustomerSat, filters.startDate, data]);

  useEffect(() => {
    const autoTarget = dailyTargets[filters.startDate] || 0;
    const currentTarget = data.dailyTarget || 0;
    if (autoTarget !== currentTarget) {
      onUpdateRef.current({ ...data, dailyTarget: autoTarget });
    }
  }, [filters.startDate, dailyTargets, data.dailyTarget]);

  const storedDailyRecord = useMemo(() => {
    return data.dailyRecording?.[filters.startDate] || EMPTY_DAILY_RECORD;
  }, [data.dailyRecording, filters.startDate]);

  // Dynamic MTD calculation for accurate display
  const mtdStats = useMemo(() => {
    const monthPrefix = filters.startDate.substring(0, 7); // "YYYY-MM"
    let rev = 0;
    let cov = 0;
    let disc = 0;
    let lunchRev = 0;
    let dinnerRev = 0;
    let lunchCov = 0;
    let dinnerCov = 0;
    let lunchDisc = 0;
    let dinnerDisc = 0;
    let goFoodRev = 0;
    let grabFoodRev = 0;
    let daysWithData = 0;

    Object.entries(data.dailyRecording || {}).forEach(([date, rec]) => {
      if (date.startsWith(monthPrefix) && date <= filters.startDate) {
        const d = rec as any;
        const dayRev = Number(d.revenue) || 0;
        const dayLunchRev = Number(d.lunchRevenue) || 0;
        const dayDinnerRev = Number(d.dinnerRevenue) || 0;
        if (dayRev > 0 || dayLunchRev > 0 || dayDinnerRev > 0) {
          rev += dayRev;
          cov += Number(d.covers) || 0;
          const dayDisc = d.totalDiscount !== undefined && Number(d.totalDiscount) > 0
            ? Number(d.totalDiscount)
            : calculateDiscounts(d).totalDiscount;
          disc += dayDisc;
          lunchRev += Number(d.lunchRevenue) || 0;
          dinnerRev += Number(d.dinnerRevenue) || 0;
          lunchCov += Number(d.lunchCovers) || 0;
          dinnerCov += Number(d.dinnerCovers) || 0;
          lunchDisc += Number(d.discountLunch) || 0;
          dinnerDisc += Number(d.discountDinner) || 0;
          goFoodRev += Number(d.goFoodRevenue) || 0;
          grabFoodRev += Number(d.grabFoodRevenue) || 0;
          daysWithData++;
        }
      }
    });
    return {
      rev,
      cov,
      disc,
      lunchRev,
      dinnerRev,
      lunchCov,
      dinnerCov,
      lunchDisc,
      dinnerDisc,
      goFoodRev,
      grabFoodRev,
      daysWithData,
    };
  }, [data.dailyRecording, filters.startDate]);

  // LIVE TODAY STATS: Consolidated live values for today based on inputs
  const liveTodayStats = useMemo(() => {
    const lunchRev = localBatch.lunchRevenue;
    const dinnerRev = localBatch.dinnerRevenue;
    const rev = lunchRev + dinnerRev;
    const cov = localBatch.lunchCovers + localBatch.dinnerCovers;
    const disc = localBatch.totalDiscount;
    const lunchCov = localBatch.lunchCovers;
    const dinnerCov = localBatch.dinnerCovers;
    const lunchDisc = localBatch.discountLunch;
    const dinnerDisc = localBatch.discountDinner;

    const discLunchInvestor = localBatch.discLunchInvestor;
    const discLunchInvestor2 = localBatch.discLunchInvestor2;
    const discLunchInvestor3 = localBatch.discLunchInvestor3;
    const discLunchPakYudi = localBatch.discLunchPakYudi;
    const discLunchCadangan1 = localBatch.discLunchCadangan1;
    const discLunchCadangan2 = localBatch.discLunchCadangan2;
    const discLunchCadangan3 = localBatch.discLunchCadangan3;
    const discDinnerInvestor = localBatch.discDinnerInvestor;
    const discDinnerInvestor2 = localBatch.discDinnerInvestor2;
    const discDinnerInvestor3 = localBatch.discDinnerInvestor3;
    const discDinnerPakYudi = localBatch.discDinnerPakYudi;
    const discDinnerCadangan1 = localBatch.discDinnerCadangan1;
    const discDinnerCadangan2 = localBatch.discDinnerCadangan2;
    const discDinnerCadangan3 = localBatch.discDinnerCadangan3;

    const dineInRevenue = localBatch.dineInRevenue;
    const takeAwayRevenue = localBatch.takeAwayRevenue;
    const goFoodRevenue = localBatch.goFoodRevenue;
    const grabFoodRevenue = localBatch.grabFoodRevenue;

    const takeAwayLunch = localBatch.takeAwayLunch;
    const takeAwayDinner = localBatch.takeAwayDinner;
    const goFoodLunch = localBatch.goFoodLunch;
    const goFoodDinner = localBatch.goFoodDinner;
    const grabFoodLunch = localBatch.grabFoodLunch;
    const grabFoodDinner = localBatch.grabFoodDinner;

    const pettyCash = localBatch.pettyCash || 1500000;
    const setorTunai = localBatch.setorTunai;
    const inputNonFood = localBatch.inputNonFood || "";

    const investorName = localBatch.investorName || monthlyDiscountNames.investorName;
    const investorName2 = localBatch.investorName2 || monthlyDiscountNames.investorName2;
    const investorName3 = localBatch.investorName3 || monthlyDiscountNames.investorName3;
    const cadanganName1 = localBatch.cadanganName1 || monthlyDiscountNames.cadanganName1;
    const cadanganName2 = localBatch.cadanganName2 || monthlyDiscountNames.cadanganName2;
    const cadanganName3 = localBatch.cadanganName3 || monthlyDiscountNames.cadanganName3;
    const membershipCover = localBatch.membershipCover;
    const membershipCoverLunch = localBatch.membershipCoverLunch || 0;
    const membershipCoverDinner = localBatch.membershipCoverDinner || 0;
    const membershipRevenueLunch = localBatch.membershipRevenueLunch;
    const membershipRevenueDinner = localBatch.membershipRevenueDinner;
    const membershipRevenue = localBatch.membershipRevenue;

    const bankMegaCover = localBatch.bankMegaCover;
    const bankMegaCoverLunch = localBatch.bankMegaCoverLunch || 0;
    const bankMegaCoverDinner = localBatch.bankMegaCoverDinner || 0;
    const bankMegaRevenueLunch = localBatch.bankMegaRevenueLunch;
    const bankMegaRevenueDinner = localBatch.bankMegaRevenueDinner;
    const bankMegaRevenue = localBatch.bankMegaRevenue;

    const digibankCover = localBatch.digibankCover;
    const digibankCoverLunch = localBatch.digibankCoverLunch || 0;
    const digibankCoverDinner = localBatch.digibankCoverDinner || 0;
    const digibankRevenueLunch = localBatch.digibankRevenueLunch;
    const digibankRevenueDinner = localBatch.digibankRevenueDinner;
    const digibankRevenue = localBatch.digibankRevenue;

    const digibankDiscount = localBatch.digibankDiscount;

    const customerSatRevenue = localBatch.customerSatRevenue;
    const discManagementRevenue = localBatch.discManagementRevenue;
    const discManagementName = localBatch.discManagementName;

    const avgCheck = cov > 0 ? Math.round(rev / cov) : 0;
    const lunchAvg = lunchCov > 0 ? Math.round(lunchRev / lunchCov) : 0;
    const totalAvg = cov > 0 ? Math.round(rev / cov) : 0;
    const performance =
      data.dailyTarget > 0
        ? ((rev / data.dailyTarget) * 100).toFixed(1)
        : "0.0";

    return {
      rev,
      cov,
      disc,
      lunchRev,
      lunchCov,
      dinnerRev,
      dinnerCov,
      lunchDisc,
      dinnerDisc,
      avgCheck,
      performance,
      lunchAvg,
      totalAvg,
      discLunchInvestor,
      discLunchInvestor2,
      discLunchInvestor3,
      discLunchPakYudi,
      discLunchCadangan1,
      discLunchCadangan2,
      discLunchCadangan3,
      discDinnerInvestor,
      discDinnerInvestor2,
      discDinnerInvestor3,
      discDinnerPakYudi,
      discDinnerCadangan1,
      discDinnerCadangan2,
      discDinnerCadangan3,
      dineInRevenue,
      takeAwayRevenue,
      goFoodRevenue,
      grabFoodRevenue,
      takeAwayLunch,
      takeAwayDinner,
      goFoodLunch,
      goFoodDinner,
      grabFoodLunch,
      grabFoodDinner,
      pettyCash,
      setorTunai,
      inputNonFood,
      investorName,
      investorName2,
      investorName3,
      cadanganName1,
      cadanganName2,
      cadanganName3,
      membershipCover,
      membershipCoverLunch,
      membershipCoverDinner,
      membershipRevenue,
      membershipRevenueLunch,
      membershipRevenueDinner,
      bankMegaCover,
      bankMegaCoverLunch,
      bankMegaCoverDinner,
      bankMegaRevenue,
      bankMegaRevenueLunch,
      bankMegaRevenueDinner,
      digibankCover,
      digibankCoverLunch,
      digibankCoverDinner,
      digibankRevenue,
      digibankRevenueLunch,
      digibankRevenueDinner,
      digibankDiscount,
      customerSatRevenue,
      discManagementRevenue,
      discManagementName,
    };
  }, [localBatch, data.dailyTarget]);

  const todayDiscountBreakdown = useMemo(() => {
    const list = [
      { name: "PAK YUDI (CEO)", total: (localBatch.discLunchPakYudi || 0) + (localBatch.discDinnerPakYudi || 0) },
      { name: liveTodayStats.investorName || monthlyDiscountNames.investorName, total: (localBatch.discLunchInvestor || 0) + (localBatch.discDinnerInvestor || 0) },
      { name: liveTodayStats.investorName2 || monthlyDiscountNames.investorName2, total: (localBatch.discLunchInvestor2 || 0) + (localBatch.discDinnerInvestor2 || 0) },
      { name: liveTodayStats.investorName3 || monthlyDiscountNames.investorName3, total: (localBatch.discLunchInvestor3 || 0) + (localBatch.discDinnerInvestor3 || 0) },
      { name: "MEMBER JUSTUS", total: (localBatch.membershipRevenueLunch || 0) + (localBatch.membershipRevenueDinner || 0) },
      { name: liveTodayStats.cadanganName1 || monthlyDiscountNames.cadanganName1, total: (localBatch.discLunchCadangan1 || 0) + (localBatch.discDinnerCadangan1 || 0) },
      { name: liveTodayStats.cadanganName2 || monthlyDiscountNames.cadanganName2, total: (localBatch.discLunchCadangan2 || 0) + (localBatch.discDinnerCadangan2 || 0) },
      { name: liveTodayStats.cadanganName3 || monthlyDiscountNames.cadanganName3, total: (localBatch.discLunchCadangan3 || 0) + (localBatch.discDinnerCadangan3 || 0) },
      { name: "CUST SATISFACTION", total: localBatch.customerSatRevenue || 0 },
      { name: "MANAGEMENT", total: localBatch.discManagementRevenue || 0 },
    ];

    const accountedPromoIds = new Set<string>();

    activeBankPromos.forEach(p => {
      accountedPromoIds.add(p.id);
      const vals = getPromoValues(p.id);
      const totalVal = vals.revLunch + vals.revDinner + vals.discount;
      if (totalVal > 0) {
        list.push({ name: p.name.toUpperCase(), total: totalVal });
      }
    });

    if ((localBatch as any).promoBankEntries) {
      Object.entries((localBatch as any).promoBankEntries).forEach(([pId, pVal]: [string, any]) => {
        if (!accountedPromoIds.has(pId)) {
          accountedPromoIds.add(pId);
          const rLunch = Number(pVal?.revLunch) || 0;
          const rClose = Number(pVal?.rev) || 0;
          const rDinner = pVal?.revDinner !== undefined ? Number(pVal.revDinner) : Math.max(0, rClose - rLunch);
          const disc = Number(pVal?.disc ?? pVal?.discount) || 0;
          const totalVal = rLunch + rDinner + disc;
          if (totalVal > 0) {
            const pName = pVal?.name || pId.replace(/_/g, ' ').toUpperCase();
            list.push({ name: pName.toUpperCase(), total: totalVal });
          }
        }
      });
    }

    if (!accountedPromoIds.has('bank_mega')) {
      const bmTotal = (Number(localBatch.bankMegaRevenueLunch) || 0) + (Number(localBatch.bankMegaRevenueDinner) || 0);
      if (bmTotal > 0) list.push({ name: "BANK MEGA", total: bmTotal });
    }
    if (!accountedPromoIds.has('digibank')) {
      const dbTotal = (Number(localBatch.digibankRevenueLunch) || 0) + (Number(localBatch.digibankRevenueDinner) || 0) + (Number(localBatch.digibankDiscount) || 0);
      if (dbTotal > 0) list.push({ name: "DIGIBANK", total: dbTotal });
    }

    return list.filter((d) => d.total > 0);
  }, [localBatch, liveTodayStats, monthlyDiscountNames, activeBankPromos]);

  // LIVE MTD STATS: Adjusts base MTD stats with current localBatch inputs
  const liveMtdStats = useMemo(() => {
    const stats = { ...mtdStats };

    // Subtract what is currently stored for this specific date
    stats.rev -= storedDailyRecord.revenue || 0;
    stats.cov -= storedDailyRecord.covers || 0;
    const storedDisc = storedDailyRecord.totalDiscount !== undefined && Number(storedDailyRecord.totalDiscount) > 0
      ? Number(storedDailyRecord.totalDiscount)
      : calculateDiscounts(storedDailyRecord).totalDiscount;
    stats.disc -= storedDisc;
    stats.lunchRev -= storedDailyRecord.lunchRevenue || 0;
    stats.dinnerRev -= storedDailyRecord.dinnerRevenue || 0;
    stats.lunchCov -= storedDailyRecord.lunchCovers || 0;
    stats.dinnerCov -= storedDailyRecord.dinnerCovers || 0;
    stats.lunchDisc -= storedDailyRecord.discountLunch || 0;
    stats.dinnerDisc -= storedDailyRecord.discountDinner || 0;
    stats.goFoodRev -= storedDailyRecord.goFoodRevenue || 0;
    stats.grabFoodRev -= storedDailyRecord.grabFoodRevenue || 0;
    if (
      (storedDailyRecord.revenue || 0) > 0 ||
      (storedDailyRecord.lunchRevenue || 0) > 0 ||
      (storedDailyRecord.dinnerRevenue || 0) > 0
    ) {
      stats.daysWithData--;
    }

    // Add current live version for this date
    stats.rev += liveTodayStats.rev;
    stats.cov += liveTodayStats.cov;
    stats.disc += liveTodayStats.disc;
    stats.lunchRev += liveTodayStats.lunchRev;
    stats.dinnerRev += liveTodayStats.dinnerRev;
    stats.lunchCov += liveTodayStats.lunchCov;
    stats.dinnerCov += liveTodayStats.dinnerCov;
    stats.lunchDisc += liveTodayStats.lunchDisc;
    stats.dinnerDisc += liveTodayStats.dinnerDisc;
    stats.goFoodRev += liveTodayStats.goFoodRevenue;
    stats.grabFoodRev += liveTodayStats.grabFoodRevenue;
    if (
      liveTodayStats.rev > 0 ||
      liveTodayStats.lunchRev > 0 ||
      liveTodayStats.dinnerRev > 0
    ) {
      stats.daysWithData++;
    }

    return stats;
  }, [mtdStats, storedDailyRecord, liveTodayStats]);

  const handleInputChange = (
    field: string,
    value: string | number,
  ) => {
    const isString = typeof value === "string";
    const num = isString ? Number(value) || 0 : value;
    setLocalBatch((prev) => {
      const next = {
        ...prev,
      };

      if (
        isString &&
        (field === "inputNonFood" ||
          field === "investorName" ||
          field === "investorName2" ||
          field === "investorName3" ||
          field === "cadanganName1" ||
          field === "cadanganName2" ||
          field === "cadanganName3" ||
          field === "discManagementName")
      ) {
        (next as any)[field] = value;
      } else {
        (next as any)[field] = num;
      }

      // Helper for Investor & Cadangan: Lunch manual, Closing manual, Dinner Auto (Dinner = Closing - Lunch)
      const updateLunchDinnerClosing = (
        lunchKey: string,
        closingKey: string,
        dinnerKey: string,
        currentField: string,
        valNum: number
      ) => {
        if (currentField === closingKey) {
          next[closingKey] = valNum;
          const currentLunch = Number(next[lunchKey]) || 0;
          next[dinnerKey] = Math.max(0, valNum - currentLunch);
        } else if (currentField === lunchKey) {
          next[lunchKey] = valNum;
          const prevClosing = Number(next[closingKey] ?? ((Number(prev[lunchKey]) || 0) + (Number(prev[dinnerKey]) || 0))) || 0;
          if (prevClosing >= valNum) {
            next[dinnerKey] = Math.max(0, prevClosing - valNum);
            next[closingKey] = prevClosing;
          } else {
            next[closingKey] = valNum + Math.max(0, Number(prev[dinnerKey]) || 0);
            next[dinnerKey] = Math.max(0, next[closingKey] - valNum);
          }
        }
      };

      updateLunchDinnerClosing("discLunchInvestor", "discClosingInvestor", "discDinnerInvestor", field, num);
      updateLunchDinnerClosing("discLunchInvestor2", "discClosingInvestor2", "discDinnerInvestor2", field, num);
      updateLunchDinnerClosing("discLunchInvestor3", "discClosingInvestor3", "discDinnerInvestor3", field, num);
      updateLunchDinnerClosing("discLunchCadangan1", "discClosingCadangan1", "discDinnerCadangan1", field, num);
      updateLunchDinnerClosing("discLunchCadangan2", "discClosingCadangan2", "discDinnerCadangan2", field, num);
      updateLunchDinnerClosing("discLunchCadangan3", "discClosingCadangan3", "discDinnerCadangan3", field, num);

      if (["lunchRevenue", "totalRevenue"].includes(field as string)) {
        next.dinnerRevenue = Math.max(0, next.totalRevenue - next.lunchRevenue);
      }

      if (["lunchCovers", "totalCovers"].includes(field as string)) {
        next.dinnerCovers = Math.max(0, next.totalCovers - next.lunchCovers);
      }

      // Breakdown calculations for Grab, GoFood, TakeAway (Total Closing - Lunch = Dinner Auto, matching Bank Mega formula)
      if (["takeAwayLunch", "takeAwayRevenue"].includes(field as string)) {
        next.takeAwayDinner = Math.max(0, next.takeAwayRevenue - next.takeAwayLunch);
      } else if (field === "takeAwayDinner") {
        next.takeAwayRevenue = next.takeAwayLunch + next.takeAwayDinner;
      }

      if (["goFoodLunch", "goFoodRevenue"].includes(field as string)) {
        next.goFoodDinner = Math.max(0, next.goFoodRevenue - next.goFoodLunch);
      } else if (field === "goFoodDinner") {
        next.goFoodRevenue = next.goFoodLunch + next.goFoodDinner;
      }

      if (["grabFoodLunch", "grabFoodRevenue"].includes(field as string)) {
        next.grabFoodDinner = Math.max(0, next.grabFoodRevenue - next.grabFoodLunch);
      } else if (field === "grabFoodDinner") {
        next.grabFoodRevenue = next.grabFoodLunch + next.grabFoodDinner;
      }

      if (
        [
          "lunchRevenue",
          "totalRevenue",
          "takeAwayRevenue",
          "goFoodRevenue",
          "grabFoodRevenue",
          "takeAwayLunch",
          "takeAwayDinner",
          "goFoodLunch",
          "goFoodDinner",
          "grabFoodLunch",
          "grabFoodDinner",
        ].includes(field as string)
      ) {
        next.dineInRevenue =
          next.lunchRevenue +
          next.dinnerRevenue -
          next.takeAwayRevenue -
          next.goFoodRevenue -
          next.grabFoodRevenue;
      }

      // Sync Membership & Bank explicit Totals (including cover)
      if (["membershipRevenueLunch", "membershipRevenue"].includes(field)) {
        next.membershipRevenueDinner = Math.max(0, next.membershipRevenue - next.membershipRevenueLunch);
      }
      if (["membershipCoverLunch", "membershipCover"].includes(field)) {
        next.membershipCoverDinner = Math.max(0, next.membershipCover - next.membershipCoverLunch);
      }

      if (["bankMegaRevenueLunch", "bankMegaRevenue"].includes(field)) {
        next.bankMegaRevenueDinner = Math.max(0, next.bankMegaRevenue - next.bankMegaRevenueLunch);
      }
      if (["bankMegaCoverLunch", "bankMegaCover"].includes(field)) {
        next.bankMegaCoverDinner = Math.max(0, next.bankMegaCover - next.bankMegaCoverLunch);
      }

      if (["digibankRevenueLunch", "digibankRevenue"].includes(field)) {
        next.digibankRevenueDinner = Math.max(0, next.digibankRevenue - next.digibankRevenueLunch);
      }
      if (["digibankCoverLunch", "digibankCover"].includes(field)) {
        next.digibankCoverDinner = Math.max(0, next.digibankCover - next.digibankCoverLunch);
      }

      // Auto-calculate Discounts from available programs (Entitled, Member, Banking)
      const isDiscountField = [
        "discLunchInvestor",
        "discLunchInvestor2",
        "discLunchInvestor3",
        "discLunchPakYudi",
        "discLunchCadangan1",
        "discLunchCadangan2",
        "discLunchCadangan3",
        "membershipRevenueLunch",
        "bankMegaRevenueLunch",
        "digibankRevenueLunch",
        "discDinnerInvestor",
        "discDinnerInvestor2",
        "discDinnerInvestor3",
        "discDinnerPakYudi",
        "discDinnerCadangan1",
        "discDinnerCadangan2",
        "discDinnerCadangan3",
        "membershipRevenueDinner",
        "bankMegaRevenueDinner",
        "digibankRevenueDinner",
        "digibankDiscount",
        "customerSatRevenue",
        "discManagementRevenue",
        "discClosingInvestor",
        "discClosingInvestor2",
        "discClosingInvestor3",
        "discClosingCadangan1",
        "discClosingCadangan2",
        "discClosingCadangan3",
        "membershipRevenue",
        "bankMegaRevenue",
        "digibankRevenue",
      ].includes(field as string);

      if (
        isDiscountField ||
        field === "discountLunch" ||
        field === "totalDiscount"
      ) {
        // As requested: Discount pada Daily Revenue today Lunch Revenue & Today Revenue
        // automatis mengisi dari (discount Entitled, member & banking program)
        const discs = calculateDiscounts(next);
        next.discountLunch = discs.discountLunch;
        next.discountDinner = discs.discountDinner;
        next.totalDiscount = discs.totalDiscount;

        next.discLunchMember = Number(next.membershipRevenueLunch) || 0;
        next.discDinnerMember = Number(next.membershipRevenueDinner) || 0;
        next.discLunchBankMega = Number(next.bankMegaRevenueLunch) || 0;
        next.discDinnerBankMega = Number(next.bankMegaRevenueDinner) || 0;
      }

      return next;
    });
  };

  useEffect(() => {
    // When date changes or data is updated, pre-fill the form with existing data if available
    // and if we are NOT currently submitting
    if (!isSubmitting) {
      // Find latest non-empty names in the current month to make them sticky
      const monthPrefix = filters.startDate.substring(0, 7);
      const configuredNames = data.monthlyDiscountNames?.[monthPrefix] || {};

      const recordsForMonth = Object.entries(data.dailyRecording || {})
        .filter(([date]) => date.startsWith(monthPrefix))
        .sort(([a], [b]) => b.localeCompare(a));
      
      const isLegacyDefault = (name: string) => {
        return !name || 
               name === "INVESTOR 1" || 
               name === "INVESTOR 2" || 
               name === "INVESTOR 3" || 
               name === "CADANGAN 1" || 
               name === "CADANGAN 2" || 
               name === "CADANGAN 3";
      };

      let stickyNames = {
        inv1: monthlyDiscountNames.investorName,
        inv2: monthlyDiscountNames.investorName2,
        inv3: monthlyDiscountNames.investorName3,
        cad1: monthlyDiscountNames.cadanganName1,
        cad2: monthlyDiscountNames.cadanganName2,
        cad3: monthlyDiscountNames.cadanganName3
      };

      // Only pull from records if the current configured name is a default
      if (Object.values(stickyNames).some(isLegacyDefault)) {
        for (const [, rec] of recordsForMonth) {
          const r = rec as any;
          if (isLegacyDefault(stickyNames.inv1) && r.investorName && !isLegacyDefault(r.investorName)) stickyNames.inv1 = r.investorName;
          if (isLegacyDefault(stickyNames.inv2) && r.investorName2 && !isLegacyDefault(r.investorName2)) stickyNames.inv2 = r.investorName2;
          if (isLegacyDefault(stickyNames.inv3) && r.investorName3 && !isLegacyDefault(r.investorName3)) stickyNames.inv3 = r.investorName3;
          if (isLegacyDefault(stickyNames.cad1) && r.cadanganName1 && !isLegacyDefault(r.cadanganName1)) stickyNames.cad1 = r.cadanganName1;
          if (isLegacyDefault(stickyNames.cad2) && r.cadanganName2 && !isLegacyDefault(r.cadanganName2)) stickyNames.cad2 = r.cadanganName2;
          if (isLegacyDefault(stickyNames.cad3) && r.cadanganName3 && !isLegacyDefault(r.cadanganName3)) stickyNames.cad3 = r.cadanganName3;
        }
      }

      const rawTakeAwayLunch = storedDailyRecord.takeAwayLunch || 0;
      const rawTakeAwayDinner = storedDailyRecord.takeAwayDinner || 0;
      const rawTakeAwayRevenue = (storedDailyRecord.takeAwayRevenue !== undefined && storedDailyRecord.takeAwayRevenue > 0)
        ? storedDailyRecord.takeAwayRevenue
        : (rawTakeAwayLunch + rawTakeAwayDinner);
      const finalTakeAwayDinner = rawTakeAwayDinner > 0 ? rawTakeAwayDinner : Math.max(0, rawTakeAwayRevenue - rawTakeAwayLunch);

      const rawGoFoodLunch = storedDailyRecord.goFoodLunch || 0;
      const rawGoFoodDinner = storedDailyRecord.goFoodDinner || 0;
      const rawGoFoodRevenue = (storedDailyRecord.goFoodRevenue !== undefined && storedDailyRecord.goFoodRevenue > 0)
        ? storedDailyRecord.goFoodRevenue
        : (rawGoFoodLunch + rawGoFoodDinner);
      const finalGoFoodDinner = rawGoFoodDinner > 0 ? rawGoFoodDinner : Math.max(0, rawGoFoodRevenue - rawGoFoodLunch);

      const rawGrabFoodLunch = storedDailyRecord.grabFoodLunch || 0;
      const rawGrabFoodDinner = storedDailyRecord.grabFoodDinner || 0;
      const rawGrabFoodRevenue = (storedDailyRecord.grabFoodRevenue !== undefined && storedDailyRecord.grabFoodRevenue > 0)
        ? storedDailyRecord.grabFoodRevenue
        : (rawGrabFoodLunch + rawGrabFoodDinner);
      const finalGrabFoodDinner = rawGrabFoodDinner > 0 ? rawGrabFoodDinner : Math.max(0, rawGrabFoodRevenue - rawGrabFoodLunch);

      const initialDiscs = calculateDiscounts({
        ...storedDailyRecord,
        customerSatRevenue: calculatedCustomerSat,
      });

      setLocalBatch({
        lunchRevenue: storedDailyRecord.lunchRevenue || 0,
        lunchCovers: storedDailyRecord.lunchCovers || 0,
        dinnerRevenue: storedDailyRecord.dinnerRevenue || 0,
        dinnerCovers: storedDailyRecord.dinnerCovers || 0,
        discountLunch: storedDailyRecord.discountLunch || initialDiscs.discountLunch,
        discountDinner: storedDailyRecord.discountDinner || initialDiscs.discountDinner,
        discLunchInvestor: storedDailyRecord.discLunchInvestor || 0,
        discLunchInvestor2: storedDailyRecord.discLunchInvestor2 || 0,
        discLunchInvestor3: storedDailyRecord.discLunchInvestor3 || 0,
        discLunchPakYudi: storedDailyRecord.discLunchPakYudi || 0,
        discLunchCadangan1: storedDailyRecord.discLunchCadangan1 || 0,
        discLunchCadangan2: storedDailyRecord.discLunchCadangan2 || 0,
        discLunchCadangan3: storedDailyRecord.discLunchCadangan3 || 0,
        discDinnerInvestor: storedDailyRecord.discDinnerInvestor || 0,
        discDinnerInvestor2: storedDailyRecord.discDinnerInvestor2 || 0,
        discDinnerInvestor3: storedDailyRecord.discDinnerInvestor3 || 0,
        discDinnerPakYudi: storedDailyRecord.discDinnerPakYudi || 0,
        discDinnerCadangan1: storedDailyRecord.discDinnerCadangan1 || 0,
        discDinnerCadangan2: storedDailyRecord.discDinnerCadangan2 || 0,
        discDinnerCadangan3: storedDailyRecord.discDinnerCadangan3 || 0,
        discClosingInvestor: storedDailyRecord.discClosingInvestor !== undefined && storedDailyRecord.discClosingInvestor > 0 ? storedDailyRecord.discClosingInvestor : ((storedDailyRecord.discLunchInvestor || 0) + (storedDailyRecord.discDinnerInvestor || 0)),
        discClosingInvestor2: storedDailyRecord.discClosingInvestor2 !== undefined && storedDailyRecord.discClosingInvestor2 > 0 ? storedDailyRecord.discClosingInvestor2 : ((storedDailyRecord.discLunchInvestor2 || 0) + (storedDailyRecord.discDinnerInvestor2 || 0)),
        discClosingInvestor3: storedDailyRecord.discClosingInvestor3 !== undefined && storedDailyRecord.discClosingInvestor3 > 0 ? storedDailyRecord.discClosingInvestor3 : ((storedDailyRecord.discLunchInvestor3 || 0) + (storedDailyRecord.discDinnerInvestor3 || 0)),
        discClosingCadangan1: storedDailyRecord.discClosingCadangan1 !== undefined && storedDailyRecord.discClosingCadangan1 > 0 ? storedDailyRecord.discClosingCadangan1 : ((storedDailyRecord.discLunchCadangan1 || 0) + (storedDailyRecord.discDinnerCadangan1 || 0)),
        discClosingCadangan2: storedDailyRecord.discClosingCadangan2 !== undefined && storedDailyRecord.discClosingCadangan2 > 0 ? storedDailyRecord.discClosingCadangan2 : ((storedDailyRecord.discLunchCadangan2 || 0) + (storedDailyRecord.discDinnerCadangan2 || 0)),
        discClosingCadangan3: storedDailyRecord.discClosingCadangan3 !== undefined && storedDailyRecord.discClosingCadangan3 > 0 ? storedDailyRecord.discClosingCadangan3 : ((storedDailyRecord.discLunchCadangan3 || 0) + (storedDailyRecord.discDinnerCadangan3 || 0)),
        dineInRevenue: storedDailyRecord.dineInRevenue || 0,
        takeAwayRevenue: rawTakeAwayRevenue,
        goFoodRevenue: rawGoFoodRevenue,
        grabFoodRevenue: rawGrabFoodRevenue,
        takeAwayLunch: rawTakeAwayLunch,
        takeAwayDinner: finalTakeAwayDinner,
        goFoodLunch: rawGoFoodLunch,
        goFoodDinner: finalGoFoodDinner,
        grabFoodLunch: rawGrabFoodLunch,
        grabFoodDinner: finalGrabFoodDinner,
        pettyCash: storedDailyRecord.pettyCash || 1500000,
        setorTunai: storedDailyRecord.setorTunai || 0,
        inputNonFood: storedDailyRecord.inputNonFood || "",
        investorName: isLegacyDefault(storedDailyRecord.investorName) ? stickyNames.inv1 : (storedDailyRecord.investorName || stickyNames.inv1),
        investorName2: isLegacyDefault(storedDailyRecord.investorName2) ? stickyNames.inv2 : (storedDailyRecord.investorName2 || stickyNames.inv2),
        investorName3: isLegacyDefault(storedDailyRecord.investorName3) ? stickyNames.inv3 : (storedDailyRecord.investorName3 || stickyNames.inv3),
        cadanganName1: isLegacyDefault(storedDailyRecord.cadanganName1) ? stickyNames.cad1 : (storedDailyRecord.cadanganName1 || stickyNames.cad1),
        cadanganName2: isLegacyDefault(storedDailyRecord.cadanganName2) ? stickyNames.cad2 : (storedDailyRecord.cadanganName2 || stickyNames.cad2),
        cadanganName3: isLegacyDefault(storedDailyRecord.cadanganName3) ? stickyNames.cad3 : (storedDailyRecord.cadanganName3 || stickyNames.cad3),
        membershipCover: storedDailyRecord.membershipCover || 0,
        membershipCoverLunch: storedDailyRecord.membershipCoverLunch || 0,
        membershipCoverDinner: storedDailyRecord.membershipCoverDinner || 0,
        membershipRevenueLunch: storedDailyRecord.membershipRevenueLunch || 0,
        membershipRevenueDinner: storedDailyRecord.membershipRevenueDinner || 0,
        membershipRevenue: storedDailyRecord.membershipRevenue || 0,
        bankMegaCover: storedDailyRecord.bankMegaCover || 0,
        bankMegaCoverLunch: storedDailyRecord.bankMegaCoverLunch || 0,
        bankMegaCoverDinner: storedDailyRecord.bankMegaCoverDinner || 0,
        bankMegaRevenueLunch: storedDailyRecord.bankMegaRevenueLunch || 0,
        bankMegaRevenueDinner: storedDailyRecord.bankMegaRevenueDinner || 0,
        bankMegaRevenue: storedDailyRecord.bankMegaRevenue || 0,
        digibankCover: storedDailyRecord.digibankCover || 0,
        digibankCoverLunch: storedDailyRecord.digibankCoverLunch || 0,
        digibankCoverDinner: storedDailyRecord.digibankCoverDinner || 0,
        digibankRevenueLunch: storedDailyRecord.digibankRevenueLunch || 0,
        digibankRevenueDinner: storedDailyRecord.digibankRevenueDinner || 0,
        digibankRevenue: storedDailyRecord.digibankRevenue || 0,
        digibankDiscount: storedDailyRecord.digibankDiscount || 0,
        customerSatRevenue: calculatedCustomerSat,
        discManagementRevenue: storedDailyRecord.discManagementRevenue || 0,
        discManagementName: storedDailyRecord.discManagementName || "",
        totalRevenue: isEditing ? storedDailyRecord.revenue || 0 : 0,
        totalCovers: isEditing ? storedDailyRecord.covers || 0 : 0,
        totalDiscount:
          storedDailyRecord.totalDiscount !== undefined && Number(storedDailyRecord.totalDiscount) > 0
            ? Number(storedDailyRecord.totalDiscount)
            : initialDiscs.totalDiscount,
        promoBankEntries: (storedDailyRecord as any).promoBankEntries || {},
      });
    }
  }, [
    filters.startDate,
    storedDailyRecord,
    isSubmitting,
    isEditing,
    calculatedCustomerSat,
    data.dailyRecording
  ]);

  const handleDeleteAllSalesMonth = () => {
    const monthPrefix = filters.startDate.substring(0, 7);
    const monthRecords = Object.keys(data.dailyRecording || {}).filter(date => date.startsWith(monthPrefix));
    
    if (monthRecords.length === 0) {
      showToast?.("Tidak ada data untuk bulan ini.", "error");
      return;
    }
    
    setShowConfirm({
      title: "HAPUS SEMUA DATA BULAN INI",
      message: `PERINGATAN: Anda akan menghapus SELURUH (${monthRecords.length}) data sales untuk bulan ini. Lanjutkan?`,
      onConfirm: () => {
        const newDailyRecording = { ...data.dailyRecording };
        monthRecords.forEach(date => delete newDailyRecording[date]);

        const newTotalMTDRevenue = Object.values(newDailyRecording).reduce(
          (acc: number, curr: any) => acc + (Number(curr.revenue) || 0),
          0
        );
        const newTotalMTDCovers = Object.values(newDailyRecording).reduce(
          (acc: number, curr: any) => acc + (Number(curr.covers) || 0),
          0
        );

        onUpdate({
          ...data,
          dailyRecording: newDailyRecording,
          sales: {
            ...(data.sales || {}),
            dailyRecording: newDailyRecording,
            revenue: newTotalMTDRevenue,
            covers: newTotalMTDCovers,
            todayRevenue: 0,
            todayCovers: 0,
          },
          revenue: newTotalMTDRevenue,
          covers: newTotalMTDCovers,
          todayRevenue: 0,
          todayCovers: 0,
        }, true);

        setShowSuccess({
          title: "SEMUA DATA DIHAPUS",
          message: `Seluruh data sales untuk bulan ${monthPrefix} telah dihapus.`,
        });
        setShowConfirm(null);
      }
    });
  };

  const handleDeleteToday = () => {
    setShowConfirm({
      title: "HAPUS DATA HARI INI",
      message: `Apakah Anda yakin ingin menghapus data sales tanggal ${filters.startDate}?`,
      onConfirm: () => {
        const newDailyRecording = { ...data.dailyRecording };
        delete newDailyRecording[filters.startDate];

        const newTotalMTDRevenue = Object.values(newDailyRecording).reduce(
          (acc: number, curr: any) => acc + (Number(curr.revenue) || 0),
          0
        );
        const newTotalMTDCovers = Object.values(newDailyRecording).reduce(
          (acc: number, curr: any) => acc + (Number(curr.covers) || 0),
          0
        );

        onUpdate({
          ...data,
          dailyRecording: newDailyRecording,
          sales: {
            ...(data.sales || {}),
            dailyRecording: newDailyRecording,
            revenue: newTotalMTDRevenue,
            covers: newTotalMTDCovers,
            todayRevenue: 0,
            todayCovers: 0,
          },
          revenue: newTotalMTDRevenue,
          covers: newTotalMTDCovers,
          todayRevenue: 0,
          todayCovers: 0,
        }, true);

        setLocalBatch({
          lunchRevenue: 0,
          lunchCovers: 0,
          dinnerRevenue: 0,
          dinnerCovers: 0,
          discountLunch: 0,
          discountDinner: 0,
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
          discClosingInvestor: 0,
          discClosingInvestor2: 0,
          discClosingInvestor3: 0,
          discClosingCadangan1: 0,
          discClosingCadangan2: 0,
          discClosingCadangan3: 0,
          dineInRevenue: 0,
          takeAwayRevenue: 0,
          goFoodRevenue: 0,
          grabFoodRevenue: 0,
          takeAwayLunch: 0,
          takeAwayDinner: 0,
          goFoodLunch: 0,
          goFoodDinner: 0,
          grabFoodLunch: 0,
          grabFoodDinner: 0,
          pettyCash: 1500000,
          setorTunai: 0,
          inputNonFood: "",
          investorName: monthlyDiscountNames.investorName,
          investorName2: monthlyDiscountNames.investorName2,
          investorName3: monthlyDiscountNames.investorName3,
          cadanganName1: monthlyDiscountNames.cadanganName1,
          cadanganName2: monthlyDiscountNames.cadanganName2,
          cadanganName3: monthlyDiscountNames.cadanganName3,
          membershipCover: 0,
          membershipRevenueLunch: 0,
          membershipRevenueDinner: 0,
          membershipRevenue: 0,
          bankMegaCover: 0,
          bankMegaRevenueLunch: 0,
          bankMegaRevenueDinner: 0,
          bankMegaRevenue: 0,
          digibankCover: 0,
          digibankRevenueLunch: 0,
          digibankRevenueDinner: 0,
          digibankRevenue: 0,
          digibankDiscount: 0,
          customerSatRevenue: calculatedCustomerSat,
          discManagementRevenue: 0,
          discManagementName: "",
          totalRevenue: 0,
          totalCovers: 0,
          totalDiscount: calculatedCustomerSat,
        });

        showToast?.("Data hari ini berhasil dihapus.", "success");
        setShowConfirm(null);
      }
    });
  };

  const [showConfirm, setShowConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [showGuestSatReminder, setShowGuestSatReminder] = useState<boolean>(false);

  const handleInitiateSubmit = () => {
    if (isSubmitting) return;
    const hasNewData = (Object.values(localBatch) as number[]).some(
      (v) => v !== 0,
    );
    if (!isEditing && !hasNewData) {
      showToast?.("Masukkan data baru.", "error");
      return;
    }
    setShowGuestSatReminder(true);
  };

  const handleSyncData = () => {
    if (isSubmitting) return;
    const hasNewData = (Object.values(localBatch) as number[]).some(
      (v) => v !== 0,
    );
    if (!isEditing && !hasNewData) {
      showToast?.("Masukkan data baru.", "error");
      return;
    }
    setIsSubmitting(true);

    const currentStored = storedDailyRecord;

    // Logic: The form directly represents the absolute truth (not cumulative), because we pre-fill it.
    const updatedLunchRev = localBatch.lunchRevenue;
    const updatedLunchCov = localBatch.lunchCovers;
    const updatedDinnerRev = localBatch.dinnerRevenue;
    const updatedDinnerCov = localBatch.dinnerCovers;
    const finalDiscounts = calculateDiscounts(localBatch);
    const updatedDiscountLunch = finalDiscounts.discountLunch;
    const updatedDiscountDinner = finalDiscounts.discountDinner;
    const updatedTotalDiscount = finalDiscounts.totalDiscount;

    const updatedDiscLunchInvestor = localBatch.discLunchInvestor;
    const updatedDiscLunchInvestor2 = localBatch.discLunchInvestor2;
    const updatedDiscLunchInvestor3 = localBatch.discLunchInvestor3;
    const updatedDiscLunchPakYudi = localBatch.discLunchPakYudi;
    const updatedDiscLunchCadangan1 = localBatch.discLunchCadangan1;
    const updatedDiscLunchCadangan2 = localBatch.discLunchCadangan2;
    const updatedDiscLunchCadangan3 = localBatch.discLunchCadangan3;
    const updatedDiscDinnerInvestor = localBatch.discDinnerInvestor;
    const updatedDiscDinnerInvestor2 = localBatch.discDinnerInvestor2;
    const updatedDiscDinnerInvestor3 = localBatch.discDinnerInvestor3;
    const updatedDiscDinnerPakYudi = localBatch.discDinnerPakYudi;
    const updatedDiscDinnerCadangan1 = localBatch.discDinnerCadangan1;
    const updatedDiscDinnerCadangan2 = localBatch.discDinnerCadangan2;
    const updatedDiscDinnerCadangan3 = localBatch.discDinnerCadangan3;

    const updatedDineIn = localBatch.dineInRevenue;
    const updatedTakeAway = localBatch.takeAwayRevenue;
    const updatedGoFood = localBatch.goFoodRevenue;
    const updatedGrabFood = localBatch.grabFoodRevenue;
    const updatedTakeAwayLunch = localBatch.takeAwayLunch || 0;
    const updatedTakeAwayDinner = localBatch.takeAwayDinner || Math.max(0, updatedTakeAway - updatedTakeAwayLunch);
    const updatedGoFoodLunch = localBatch.goFoodLunch || 0;
    const updatedGoFoodDinner = localBatch.goFoodDinner || Math.max(0, updatedGoFood - updatedGoFoodLunch);
    const updatedGrabFoodLunch = localBatch.grabFoodLunch || 0;
    const updatedGrabFoodDinner = localBatch.grabFoodDinner || Math.max(0, updatedGrabFood - updatedGrabFoodLunch);

    const updatedPettyCash = localBatch.pettyCash || 1500000;
    const updatedSetorTunai = localBatch.setorTunai;
    const updatedNonFood = localBatch.inputNonFood || "";

    const updatedInvestorName = localBatch.investorName || monthlyDiscountNames.investorName;
    const updatedInvestorName2 = localBatch.investorName2 || monthlyDiscountNames.investorName2;
    const updatedInvestorName3 = localBatch.investorName3 || monthlyDiscountNames.investorName3;
    const updatedCadanganName1 = localBatch.cadanganName1 || monthlyDiscountNames.cadanganName1;
    const updatedCadanganName2 = localBatch.cadanganName2 || monthlyDiscountNames.cadanganName2;
    const updatedCadanganName3 = localBatch.cadanganName3 || monthlyDiscountNames.cadanganName3;
    const updatedMembershipCover = localBatch.membershipCover;
    const updatedMembershipRevenueLunch = localBatch.membershipRevenueLunch;
    const updatedMembershipRevenueDinner = localBatch.membershipRevenueDinner;
    const updatedMembershipRevenue = localBatch.membershipRevenue;
    const updatedBankMegaCover = localBatch.bankMegaCover;
    const updatedBankMegaRevenueLunch = localBatch.bankMegaRevenueLunch;
    const updatedBankMegaRevenueDinner = localBatch.bankMegaRevenueDinner;
    const updatedBankMegaRevenue = localBatch.bankMegaRevenue;
    const updatedDigibankCover = localBatch.digibankCover;
    const updatedDigibankRevenueLunch = localBatch.digibankRevenueLunch;
    const updatedDigibankRevenueDinner = localBatch.digibankRevenueDinner;
    const updatedDigibankRevenue = localBatch.digibankRevenue;
    const updatedDigibankDiscount = localBatch.digibankDiscount;

    const updatedCustomerSatRevenue = localBatch.customerSatRevenue;
    const updatedDiscManagementRevenue = localBatch.discManagementRevenue;
    const updatedDiscManagementName = localBatch.discManagementName;

    // Calculate total revenue
    const totalRev = updatedLunchRev + updatedDinnerRev;
    const totalCov = updatedLunchCov + updatedDinnerCov;

    // Calculate Dine In explicitly for storage
    const finalDineIn =
      totalRev - updatedTakeAway - updatedGoFood - updatedGrabFood;

    const updatedRecord: DailySalesData = {
      revenue: totalRev,
      covers: totalCov,
      lunchRevenue: updatedLunchRev,
      lunchCovers: updatedLunchCov,
      dinnerRevenue: updatedDinnerRev,
      dinnerCovers: updatedDinnerCov,
      discountLunch: updatedDiscountLunch,
      discountDinner: updatedDiscountDinner,
      discLunchInvestor: updatedDiscLunchInvestor,
      discLunchInvestor2: updatedDiscLunchInvestor2,
      discLunchInvestor3: updatedDiscLunchInvestor3,
      discLunchPakYudi: updatedDiscLunchPakYudi,
      discLunchCadangan1: updatedDiscLunchCadangan1,
      discLunchCadangan2: updatedDiscLunchCadangan2,
      discLunchCadangan3: updatedDiscLunchCadangan3,
      discDinnerInvestor: updatedDiscDinnerInvestor,
      discDinnerInvestor2: updatedDiscDinnerInvestor2,
      discDinnerInvestor3: updatedDiscDinnerInvestor3,
      discDinnerPakYudi: updatedDiscDinnerPakYudi,
      discDinnerCadangan1: updatedDiscDinnerCadangan1,
      discDinnerCadangan2: updatedDiscDinnerCadangan2,
      discDinnerCadangan3: updatedDiscDinnerCadangan3,
      discClosingInvestor: localBatch.discClosingInvestor !== undefined ? localBatch.discClosingInvestor : (updatedDiscLunchInvestor + updatedDiscDinnerInvestor),
      discClosingInvestor2: localBatch.discClosingInvestor2 !== undefined ? localBatch.discClosingInvestor2 : (updatedDiscLunchInvestor2 + updatedDiscDinnerInvestor2),
      discClosingInvestor3: localBatch.discClosingInvestor3 !== undefined ? localBatch.discClosingInvestor3 : (updatedDiscLunchInvestor3 + updatedDiscDinnerInvestor3),
      discClosingCadangan1: localBatch.discClosingCadangan1 !== undefined ? localBatch.discClosingCadangan1 : (updatedDiscLunchCadangan1 + updatedDiscDinnerCadangan1),
      discClosingCadangan2: localBatch.discClosingCadangan2 !== undefined ? localBatch.discClosingCadangan2 : (updatedDiscLunchCadangan2 + updatedDiscDinnerCadangan2),
      discClosingCadangan3: localBatch.discClosingCadangan3 !== undefined ? localBatch.discClosingCadangan3 : (updatedDiscLunchCadangan3 + updatedDiscDinnerCadangan3),
      dineInRevenue: finalDineIn,
      takeAwayRevenue: updatedTakeAway,
      goFoodRevenue: updatedGoFood,
      grabFoodRevenue: updatedGrabFood,
      takeAwayLunch: updatedTakeAwayLunch,
      takeAwayDinner: updatedTakeAwayDinner,
      goFoodLunch: updatedGoFoodLunch,
      goFoodDinner: updatedGoFoodDinner,
      grabFoodLunch: updatedGrabFoodLunch,
      grabFoodDinner: updatedGrabFoodDinner,
      pettyCash: updatedPettyCash,
      setorTunai: updatedSetorTunai,
      inputNonFood: updatedNonFood,
      investorName: updatedInvestorName,
      investorName2: updatedInvestorName2,
      investorName3: updatedInvestorName3,
      cadanganName1: updatedCadanganName1,
      cadanganName2: updatedCadanganName2,
      cadanganName3: updatedCadanganName3,
      membershipCover: updatedMembershipCover,
      membershipCoverLunch: localBatch.membershipCoverLunch || 0,
      membershipCoverDinner: localBatch.membershipCoverDinner || 0,
      membershipRevenueLunch: updatedMembershipRevenueLunch,
      membershipRevenueDinner: updatedMembershipRevenueDinner,
      membershipRevenue: updatedMembershipRevenue,
      bankMegaCover: updatedBankMegaCover,
      bankMegaCoverLunch: localBatch.bankMegaCoverLunch || 0,
      bankMegaCoverDinner: localBatch.bankMegaCoverDinner || 0,
      bankMegaRevenueLunch: updatedBankMegaRevenueLunch,
      bankMegaRevenueDinner: updatedBankMegaRevenueDinner,
      bankMegaRevenue: updatedBankMegaRevenue,
      digibankCover: updatedDigibankCover,
      digibankCoverLunch: localBatch.digibankCoverLunch || 0,
      digibankCoverDinner: localBatch.digibankCoverDinner || 0,
      digibankRevenueLunch: updatedDigibankRevenueLunch,
      digibankRevenueDinner: updatedDigibankRevenueDinner,
      digibankRevenue: updatedDigibankRevenue,
      digibankDiscount: updatedDigibankDiscount,
      customerSatRevenue: updatedCustomerSatRevenue,
      discManagementRevenue: updatedDiscManagementRevenue,
      discManagementName: updatedDiscManagementName,
      discLunchMember: Number(updatedMembershipRevenueLunch) || 0,
      discDinnerMember: Number(updatedMembershipRevenueDinner) || 0,
      discLunchBankMega: Number(updatedBankMegaRevenueLunch) || 0,
      discDinnerBankMega: Number(updatedBankMegaRevenueDinner) || 0,
      totalDiscount: updatedTotalDiscount,
      promoBankEntries: (localBatch as any).promoBankEntries || {},
    };

    const newDailyRecording = {
      ...(data.dailyRecording || {}),
      [filters.startDate]: updatedRecord,
    };

    const monthPrefix = filters.startDate.substring(0, 7);
    const newTotalMTDRevenue = Object.entries(newDailyRecording).reduce(
      (acc: number, [date, curr]) => {
        return date.startsWith(monthPrefix) && date <= filters.startDate
          ? acc + (Number((curr as any).revenue) || 0)
          : acc;
      },
      0,
    );

    const newTotalMTDCovers = Object.entries(newDailyRecording).reduce(
      (acc: number, [date, curr]) => {
        return date.startsWith(monthPrefix) && date <= filters.startDate
          ? acc + (Number((curr as any).covers) || 0)
          : acc;
      },
      0,
    );

    onUpdate({
      ...data,
      dailyRecording: newDailyRecording,
      sales: {
        ...(data.sales || {}),
        dailyRecording: newDailyRecording,
        revenue: newTotalMTDRevenue,
        covers: newTotalMTDCovers,
        todayRevenue: totalRev,
        todayCovers: totalCov,
      },
      revenue: newTotalMTDRevenue,
      covers: newTotalMTDCovers,
      todayRevenue: totalRev,
      todayCovers: totalCov,
      todayLunchRevenue: updatedLunchRev,
      todayLunchCovers: updatedLunchCov,
      todayDinnerRevenue: updatedDinnerRev,
      todayDinnerCovers: updatedDinnerCov,
      todayDiscountLunch: updatedDiscountLunch,
      todayDiscountDinner: updatedDiscountDinner,
      todayDiscLunchInvestor: updatedDiscLunchInvestor,
      todayDiscLunchInvestor2: updatedDiscLunchInvestor2,
      todayDiscLunchInvestor3: updatedDiscLunchInvestor3,
      todayDiscLunchPakYudi: updatedDiscLunchPakYudi,
      todayDiscLunchCadangan1: updatedDiscLunchCadangan1,
      todayDiscLunchCadangan2: updatedDiscLunchCadangan2,
      todayDiscLunchCadangan3: updatedDiscLunchCadangan3,
      todayDiscDinnerInvestor: updatedDiscDinnerInvestor,
      todayDiscDinnerInvestor2: updatedDiscDinnerInvestor2,
      todayDiscDinnerInvestor3: updatedDiscDinnerInvestor3,
      todayDiscDinnerPakYudi: updatedDiscDinnerPakYudi,
      todayDiscDinnerCadangan1: updatedDiscDinnerCadangan1,
      todayDiscDinnerCadangan2: updatedDiscDinnerCadangan2,
      todayDiscDinnerCadangan3: updatedDiscDinnerCadangan3,
      todayDiscClosingInvestor: localBatch.discClosingInvestor !== undefined ? localBatch.discClosingInvestor : (updatedDiscLunchInvestor + updatedDiscDinnerInvestor),
      todayDiscClosingInvestor2: localBatch.discClosingInvestor2 !== undefined ? localBatch.discClosingInvestor2 : (updatedDiscLunchInvestor2 + updatedDiscDinnerInvestor2),
      todayDiscClosingInvestor3: localBatch.discClosingInvestor3 !== undefined ? localBatch.discClosingInvestor3 : (updatedDiscLunchInvestor3 + updatedDiscDinnerInvestor3),
      todayDiscClosingCadangan1: localBatch.discClosingCadangan1 !== undefined ? localBatch.discClosingCadangan1 : (updatedDiscLunchCadangan1 + updatedDiscDinnerCadangan1),
      todayDiscClosingCadangan2: localBatch.discClosingCadangan2 !== undefined ? localBatch.discClosingCadangan2 : (updatedDiscLunchCadangan2 + updatedDiscDinnerCadangan2),
      todayDiscClosingCadangan3: localBatch.discClosingCadangan3 !== undefined ? localBatch.discClosingCadangan3 : (updatedDiscLunchCadangan3 + updatedDiscDinnerCadangan3),
      todayDineInRevenue: finalDineIn,
      todayTakeAwayRevenue: updatedTakeAway,
      todayGoFoodRevenue: updatedGoFood,
      todayGrabFoodRevenue: updatedGrabFood,
      todayPettyCash: updatedPettyCash,
      todaySetorTunai: updatedSetorTunai,
      todayInputNonFood: updatedNonFood,
      todayInvestorName: updatedInvestorName,
      todayInvestorName2: updatedInvestorName2,
      todayInvestorName3: updatedInvestorName3,
      todayCadanganName1: updatedCadanganName1,
      todayCadanganName2: updatedCadanganName2,
      todayCadanganName3: updatedCadanganName3,
      todayMembershipCover: updatedMembershipCover,
      todayMembershipRevenueLunch: updatedMembershipRevenueLunch,
      todayMembershipRevenueDinner: updatedMembershipRevenueDinner,
      todayMembershipRevenue: updatedMembershipRevenue,
      todayBankMegaCover: updatedBankMegaCover,
      todayBankMegaRevenueLunch: updatedBankMegaRevenueLunch,
      todayBankMegaRevenueDinner: updatedBankMegaRevenueDinner,
      todayBankMegaRevenue: updatedBankMegaRevenue,
      todayDigibankCover: updatedDigibankCover,
      todayDigibankRevenueLunch: updatedDigibankRevenueLunch,
      todayDigibankRevenueDinner: updatedDigibankRevenueDinner,
      todayDigibankRevenue: updatedDigibankRevenue,
      todayDigibankDiscount: updatedDigibankDiscount,
      todayCustomerSatRevenue: updatedCustomerSatRevenue,
      todayDiscManagementRevenue: updatedDiscManagementRevenue,
      todayDiscManagementName: updatedDiscManagementName,
      todayDiscLunchMember: Number(updatedMembershipRevenueLunch) || 0,
      todayDiscDinnerMember: Number(updatedMembershipRevenueDinner) || 0,
      todayDiscLunchBankMega: Number(updatedBankMegaRevenueLunch) || 0,
      todayDiscDinnerBankMega: Number(updatedBankMegaRevenueDinner) || 0,
    }, true);

    setTimeout(() => {
      setIsSubmitting(false);
      setIsEditing(false);
      setShowSuccess({
        title: "SUBMIT BERHASIL",
        message: `Data sales untuk tanggal ${filters.startDate} telah berhasil disimpan.`,
      });
    }, 600);
  };

  const todayAvgCheck =
    storedDailyRecord.covers > 0
      ? Math.round(storedDailyRecord.revenue / storedDailyRecord.covers)
      : 0;

  const handleCopyLunchWhatsApp = () => {
    const dateObj = new Date(filters.startDate + "T12:00:00Z");
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
    const formattedDate = `${dateStr} / ${dayName}`;

    const lunchRev = liveTodayStats.lunchRev;
    const lunchCov = liveTodayStats.lunchCov;
    const lunchAvg = lunchCov > 0 ? Math.round(lunchRev / lunchCov) : 0;
    const lunchDisc = liveTodayStats.lunchDisc;

    // Lunch Specific MTD Stats
    const mtdLunchAvgCheck =
      liveMtdStats.lunchCov > 0
        ? Math.round(liveMtdStats.lunchRev / liveMtdStats.lunchCov)
        : 0;
    const mtdLunchAvgRevDay =
      daysPassed > 0 ? Math.round(liveMtdStats.lunchRev / daysPassed) : 0;

    // Breakdown & Program Variables
    const takeAway = liveTodayStats.takeAwayLunch || 0;
    const goFood = liveTodayStats.goFoodLunch || 0;
    const grabFood = liveTodayStats.grabFoodLunch || 0;
    const lunchDineIn = lunchRev - takeAway - goFood - grabFood;

    const discPakYudi = liveTodayStats.discLunchPakYudi;
    const discInvestor = liveTodayStats.discLunchInvestor;
    const extraDiscCustomerSat = liveTodayStats.customerSatRevenue || 0;
    const extraDiscManagement = liveTodayStats.discManagementRevenue || 0;
    const extraDiscManagementName = liveTodayStats.discManagementName || "-";

    const pettyCash = liveTodayStats.pettyCash;
    const setorTunai = liveTodayStats.setorTunai;
    const inputNonFood = liveTodayStats.inputNonFood;

    const formatIDR = (val: number) => val.toLocaleString("de-DE");

    // Discount Section Helpers
    const formatDiscountSection = () => {
      let lines = [];
      
      // Pak Yudi
      lines.push(`1. CEO / Pak Yudi`);
      lines.push(`* Disc. 10% / Rp. ${formatIDR(discPakYudi)}`);
      lines.push(``);

      if (isPromoEnabled) {
        // Investors
        const investors = [
          { name: liveTodayStats.investorName || monthlyDiscountNames.investorName, val: liveTodayStats.discLunchInvestor || 0 },
          { name: liveTodayStats.investorName2 || monthlyDiscountNames.investorName2, val: liveTodayStats.discLunchInvestor2 || 0 },
          { name: liveTodayStats.investorName3 || monthlyDiscountNames.investorName3, val: liveTodayStats.discLunchInvestor3 || 0 },
        ].filter(i => i.val > 0);

        lines.push(`1. INVESTOR`);
        if (investors.length > 0) {
          investors.forEach(inv => {
            lines.push(`* Name : ${inv.name}`);
            lines.push(`- Disc. 10% / Rp. ${formatIDR(inv.val)}`);
          });
        } else {
          lines.push(`* Name : `);
          lines.push(`- Disc. 10% / Rp. `);
        }
        lines.push(``);
      }

      return lines.join('\n');
    };

    const template = `*LUNCH - REVENUE REPORT*

*OUTLET* : ${filters.outlet === "All" || !filters.outlet ? "ALL OUTLETS" : filters.outlet}
*DATE/ DAY* :  ${formattedDate} 

*TODAY’S REVENUE* 
1. *Revenue* : Rp. ${formatIDR(lunchRev)}
2. *Cover* :  ${lunchCov} Pax
3. *Average check* : Rp. ${formatIDR(lunchAvg)}
4. *Discount* : Rp. ${formatIDR(lunchDisc)}

*MONTH TO DATE REVENUE*
1. *Revenue*: Rp. ${formatIDR(liveMtdStats.lunchRev)}
2. *Cover* :  ${liveMtdStats.lunchCov.toLocaleString("id-ID")} Pax
3. *Average Check* : Rp. ${formatIDR(mtdLunchAvgCheck)}
4. *Average Revenue Per Day* : Rp. ${formatIDR(mtdLunchAvgRevDay)}
5. *Total Discount* : Rp. ${formatIDR(liveMtdStats.lunchDisc)}

*TODAY’S REVENUE BREAKDOWN*
1. Dine In : Rp. ${formatIDR(lunchDineIn)}
2. Take Away : Rp. ${formatIDR(takeAway)}
3. Go-Food : Rp. ${formatIDR(goFood)}
4. GrabFood : Rp. ${formatIDR(grabFood)}

*DISCOUNT ENTITLED*
${formatDiscountSection()}
*JUSTUS MEMBERSHIP PROGRAM*
1. *MEMBERSHIP DISC UP TO 10%* exclude Dessert & Beverage - From Monday - Thursday (max. Disc. Rp. 200.000 with min. Purchase Rp. 500.000 ++) 
* Cover : ${liveTodayStats.membershipCoverLunch}
* Discount : Rp. ${formatIDR(liveTodayStats.membershipRevenueLunch || 0)}

${!isBankPromoEnabled || activeBankPromos.length === 0 ? `*BANK PROGRAM* : [NONAKTIF / TIDAK ADA PROMO AKTIF]` : `*BANK PROGRAM* - T&C Applied
${activeBankPromos.map((promo, idx) => {
  const pVals = getPromoValues(promo.id);
  return `${idx + 1}. *${promo.name}*${promo.terms ? ` - ${promo.terms}` : ''}
* *Cover* : ${pVals.coverLunch}
* *Revenue* : Rp. ${formatIDR(pVals.revLunch)}`;
}).join('\n\n')}`}


*CASHIER*
* *Petty Cash* : Rp. ${formatIDR(pettyCash)}
* *Setor Tunai Bank BCA* : Rp. ${formatIDR(setorTunai)}


*Best Regards & Thank you*`;

    navigator.clipboard
      .writeText(template)
      .then(() => {
        showToast?.("Template LUNCH berhasil disalin!", "success");
      })
      .catch((err) => {
        console.error("Failed to copy lunch: ", err);
        showToast?.("Gagal menyalin template.", "error");
      });
  };

  const handleCopyDinnerWhatsApp = () => {
    const dateObj = new Date(filters.startDate + "T12:00:00Z");
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
    const formattedDate = `${dateStr} / ${dayName}`;

    const dinnerRev = liveTodayStats.dinnerRev;
    const dinnerCov = liveTodayStats.dinnerCov;
    const dinnerAvg = dinnerCov > 0 ? Math.round(dinnerRev / dinnerCov) : 0;
    const dinnerDisc = liveTodayStats.dinnerDisc;

    // Breakdown Variables (Dinner specific)
    const takeAway = liveTodayStats.takeAwayDinner || 0;
    const goFood = liveTodayStats.goFoodDinner || 0;
    const grabFood = liveTodayStats.grabFoodDinner || 0;
    const dinnerDineIn = dinnerRev - takeAway - goFood - grabFood;

    const discPakYudi = liveTodayStats.discDinnerPakYudi;
    const discInvestor = liveTodayStats.discDinnerInvestor;
    const extraDiscCustomerSat = liveTodayStats.customerSatRevenue || 0;
    const extraDiscManagement = liveTodayStats.discManagementRevenue || 0;
    const extraDiscManagementName = liveTodayStats.discManagementName || "-";

    const pettyCash = liveTodayStats.pettyCash;
    const setorTunai = liveTodayStats.setorTunai;
    const inputNonFood = liveTodayStats.inputNonFood;

    const formatIDR = (val: number) => val.toLocaleString("de-DE");

    // Discount Section Helpers
    const formatDiscountSection = () => {
      let lines = [];
      
      // Pak Yudi
      if (discPakYudi > 0) {
        lines.push(`1. *CEO / Pak Yudi*`);
        lines.push(`* Disc. 10% / Rp.${formatIDR(discPakYudi)}`);
        lines.push(``);
      }

      // Investors
      const investors = [
        { name: liveTodayStats.investorName || monthlyDiscountNames.investorName, val: liveTodayStats.discDinnerInvestor || 0 },
        { name: liveTodayStats.investorName2 || monthlyDiscountNames.investorName2, val: liveTodayStats.discDinnerInvestor2 || 0 },
        { name: liveTodayStats.investorName3 || monthlyDiscountNames.investorName3, val: liveTodayStats.discDinnerInvestor3 || 0 },
      ].filter(i => i.val > 0);

      if (investors.length > 0) {
        lines.push(`*INVESTOR*`);
        investors.forEach(inv => {
          lines.push(`* *Name* : ${inv.name}`);
          lines.push(`- Disc. 10% / Rp.${formatIDR(inv.val)}`);
        });
        lines.push(``);
      }

      return lines.join('\n');
    };

    const template = `*DINNER - REVENUE REPORT*

*OUTLET* : ${filters.outlet === "All" || !filters.outlet ? "ALL OUTLETS" : filters.outlet}
*DATE/ DAY* : ${formattedDate}

*TODAY’S REVENUE* 
1. *Revenue* : Rp. ${formatIDR(dinnerRev)}
2. *Cover* : ${dinnerCov} Pax
3. *Average check* : Rp. ${formatIDR(dinnerAvg)}
4. *Discount* : Rp. ${formatIDR(dinnerDisc)}

*MTD PERFORMANCE (REAL-TIME)*
1. *MTD Revenue*: Rp. ${formatIDR(liveMtdStats.rev)}
2. *MTD Cover* : ${liveMtdStats.cov.toLocaleString("id-ID")} Pax
3. *MTD Lunch Revenue*: Rp. ${formatIDR(liveMtdStats.lunchRev)}
4. *MTD Dinner Revenue*: Rp. ${formatIDR(liveMtdStats.dinnerRev)}

*TODAY’S REVENUE BREAKDOWN*
1. *Dine In* : Rp. ${formatIDR(dinnerDineIn)}
2. *Take Away* : Rp. ${formatIDR(takeAway)}
3. *Go-Food* : Rp. ${formatIDR(goFood)}
4. *GrabFood* : Rp. ${formatIDR(grabFood)}

*DISCOUNT ENTITLED*
${formatDiscountSection()}
*PROGRAM BREAKDOWN (DINNER ONLY)*
* Membership Rev : Rp.${formatIDR(liveTodayStats.membershipRevenueDinner || 0)}
${!isBankPromoEnabled || activeBankPromos.length === 0 ? `* Bank Promo : [NONAKTIF / TIDAK ADA PROMO AKTIF]` : activeBankPromos.map(promo => {
  const pVals = getPromoValues(promo.id);
  return `* ${promo.name} Rev : Rp.${formatIDR(pVals.revDinner)}`;
}).join('\n')}

*CASHIER*
* *Petty Cash* : Rp.${formatIDR(pettyCash)}
* *Setor Tunai Bank BCA* : Rp.${formatIDR(setorTunai)}
* *Notes* : ${inputNonFood || "-"}

*EXTRA DISCOUNTS*
1. *Customer Satisfaction* : Rp.${formatIDR(extraDiscCustomerSat)}
2. *Discount Management* : ${extraDiscManagementName} / Rp.${formatIDR(extraDiscManagement)}

*Best Regards & Thank you*`;

    navigator.clipboard
      .writeText(template)
      .then(() => {
        showToast?.("Template DINNER berhasil disalin!", "success");
      })
      .catch((err) => {
        console.error("Failed to copy dinner: ", err);
        showToast?.("Gagal menyalin template.", "error");
      });
  };

  const handleCopyClosingWhatsApp = () => {
    const dateObj = new Date(filters.startDate + "T12:00:00Z");
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
    const formattedDate = `${dateStr} / ${dayName}`;

    const totalRev = liveTodayStats.rev;
    const totalCov = liveTodayStats.cov;
    const totalAvg = liveTodayStats.avgCheck;
    const totalDisc = liveTodayStats.disc;

    const takeAway = liveTodayStats.takeAwayRevenue;
    const goFood = liveTodayStats.goFoodRevenue;
    const grabFood = liveTodayStats.grabFoodRevenue;
    const dineIn = totalRev - takeAway - goFood - grabFood;

    const discPakYudi =
      liveTodayStats.discLunchPakYudi + liveTodayStats.discDinnerPakYudi;
    const discInvestor =
      liveTodayStats.discLunchInvestor + liveTodayStats.discDinnerInvestor;

    const extraDiscCustomerSat = liveTodayStats.customerSatRevenue || 0;
    const extraDiscManagement = liveTodayStats.discManagementRevenue || 0;
    const extraDiscManagementName = liveTodayStats.discManagementName || "-";

    const pettyCash = liveTodayStats.pettyCash;
    const setorTunai = liveTodayStats.setorTunai;
    const inputNonFood = liveTodayStats.inputNonFood;

    const formatIDR = (val: number) => val.toLocaleString("de-DE");

    // Discount Section Helpers
    const formatDiscountSection = () => {
      let lines = [];
      
      // Pak Yudi
      lines.push(`1. *CEO* / Pak Yudi`);
      lines.push(`* Disc. 10% / Rp. ${formatIDR(discPakYudi)}`);
      lines.push(``);

      if (isPromoEnabled) {
        // Investors
        const investors = [
          { name: liveTodayStats.investorName || monthlyDiscountNames.investorName, val: (liveTodayStats.discLunchInvestor || 0) + (liveTodayStats.discDinnerInvestor || 0) },
          { name: liveTodayStats.investorName2 || monthlyDiscountNames.investorName2, val: (liveTodayStats.discLunchInvestor2 || 0) + (liveTodayStats.discDinnerInvestor2 || 0) },
          { name: liveTodayStats.investorName3 || monthlyDiscountNames.investorName3, val: (liveTodayStats.discLunchInvestor3 || 0) + (liveTodayStats.discDinnerInvestor3 || 0) },
        ].filter(i => i.val > 0);

        lines.push(`1. *INVESTOR*`);
        if (investors.length > 0) {
          investors.forEach(inv => {
            lines.push(`* *Name* : ${inv.name}`);
            lines.push(`- Disc. 10% / Rp. ${formatIDR(inv.val)}`);
          });
        } else {
          lines.push(`* *Name* : `);
          lines.push(`- Disc. 10% / Rp. 0`);
        }
        lines.push(``);
      }

      return lines.join('\n');
    };

    const template = `*CLOSING - REVENUE REPORT*

*OUTLET* : ${filters.outlet === "All" || !filters.outlet ? "ALL OUTLETS" : filters.outlet}
*DATE/ DAY*:  ${formattedDate} 

*TODAY’S REVENUE* 
1. *Revenue* : Rp. ${formatIDR(totalRev)}
2. *Cover* :  ${totalCov} Pax
3. *Average Check* : Rp. ${formatIDR(totalAvg)}
4. *Discount* : Rp. ${formatIDR(totalDisc)}

*MONTH TO DATE REVENUE*
1. *Revenue*: Rp. ${formatIDR(liveMtdStats.rev)}
2. *Cover* : ${liveMtdStats.cov.toLocaleString("id-ID")} Pax
3. *Average Check* : Rp. ${formatIDR(mtdAvgCheck)} 
4. *Average Revenue per Day* : Rp. ${formatIDR(avgTotalRev)} 
5. *Total Discount* : Rp. ${formatIDR(liveMtdStats.disc)} 

*TODAY’S REVENUE BREAKDOWN*
1. Dine In : Rp. ${formatIDR(dineIn)}
2. Take Away : Rp. ${formatIDR(takeAway)} 
3. Go-Food : Rp. ${formatIDR(goFood)}
4. GrabFood : Rp. ${formatIDR(grabFood)} 

*DISCOUNT ENTITLED*
${formatDiscountSection()}
*JUSTUS MEMBERSHIP PROGRAM*
1. *MEMBERSHIP DISC 10%* exclude Dessert & Beverage - From Monday - Thursday (max. Disc. Rp.200.000 with min. Purchase Rp.500.000 ++) 
* Cover : ${liveTodayStats.membershipCover}
* Discount : Rp. ${formatIDR(liveTodayStats.membershipRevenue)} 

${!isBankPromoEnabled || activeBankPromos.length === 0 ? `*BANK PROGRAM* : [NONAKTIF / TIDAK ADA PROMO AKTIF]` : `*BANK PROGRAM* - T&C Applied
${activeBankPromos.map((promo, idx) => {
  const pVals = getPromoValues(promo.id);
  return `${idx + 1}. *${promo.name}*${promo.terms ? ` - ${promo.terms}` : ''}
* *Cover* : ${pVals.coverClosing}
* *Revenue* : Rp. ${formatIDR(pVals.revClosing)}`;
}).join('\n\n')}`}


*CASHIER*
* *Petty Cash* : Rp. ${formatIDR(pettyCash)}
* *Setor Tunai Bank BCA* : Rp. ${formatIDR(setorTunai)}
* *Input Non Food* : ${inputNonFood || "-"}


*Best Regards & Thank you*`;

    navigator.clipboard
      .writeText(template)
      .then(() => {
        showToast?.("Template CLOSING REPORT berhasil disalin!", "success");
      })
      .catch((err) => {
        console.error("Failed to copy closing: ", err);
        showToast?.("Gagal menyalin template.", "error");
      });
  };

  const mtdPerformance =
    data.budgetRevenue > 0
      ? ((liveMtdStats.rev / data.budgetRevenue) * 100).toFixed(2)
      : "0.00";
  const mtdAvgCheck =
    liveMtdStats.cov > 0 ? Math.round(liveMtdStats.rev / liveMtdStats.cov) : 0;

  // Calculate days passed based on selected date
  const selectedDay = parseInt(filters.startDate.split("-")[2]);
  const daysPassed = isNaN(selectedDay)
    ? liveMtdStats.daysWithData
    : selectedDay;

  const avgLunchRev =
    daysPassed > 0 ? Math.round(liveMtdStats.lunchRev / daysPassed) : 0;
  const avgDinnerRev =
    daysPassed > 0 ? Math.round(liveMtdStats.dinnerRev / daysPassed) : 0;
  const avgTotalRev =
    daysPassed > 0 ? Math.round(liveMtdStats.rev / daysPassed) : 0;

  return (
    <div
      className="space-y-6 animate-fade-in no-blur pb-20 px-1"
      id="sales-module-container"
    >
      <ShareActions
        targetId="sales-module-container"
        title={`Sales Report - ${filters.startDate}`}
      />
      {/* New Grouped Metrics Dashboard */}
      <div className="space-y-8">
        {/* GROUP 1: OVERVIEW & BUDGET */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800"></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
              Overview & Budget
            </h3>
            <div className="h-px flex-1 bg-slate-800"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-5 border-l-4 border-pink-500 bg-slate-900/40">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                MTD Monthly Budget
              </div>
              <div className="text-xl font-black text-white">
                Rp {(data.budgetRevenue || 0).toLocaleString('id-ID')}
              </div>
              <div className="text-[8px] font-bold text-emerald-400/50 uppercase mt-1">
                Budget Target
              </div>
            </div>
            <div className="glass-card p-5 border-l-4 border-indigo-500 bg-indigo-500/5 ring-1 ring-white/5">
              <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                Live Today Performance
              </div>
              <div
                className={`text-xl font-black ${Number(liveTodayStats.performance) >= 100 ? "text-emerald-400" : "text-white"}`}
              >
                {liveTodayStats.performance}%
              </div>
              <div className="text-[8px] font-bold text-slate-500 uppercase mt-1">
                vs Day Target (Rp {(data.dailyTarget || 0).toLocaleString('id-ID')})
              </div>
            </div>
            <div className="glass-card p-5 border-l-4 border-emerald-500 bg-slate-900/40">
              <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">
                Target Today Revenue
              </div>
              <div className="text-xl font-black text-white text-emerald-400">
                Rp {(data.dailyTarget || 0).toLocaleString('id-ID')}
              </div>
              <div className="text-[8px] font-bold text-slate-500 uppercase mt-1">
                Daily Goal
              </div>
            </div>
          </div>
        </section>

        {/* GROUP 2: LUNCH PERFORMANCE */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-blue-900/30"></div>
            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
              Lunch Performance
            </h3>
            <div className="h-px flex-1 bg-blue-900/30"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today Lunch */}
            <div className="glass-card p-1 bg-blue-500/5 border border-blue-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20">
                <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">
                  Today Lunch Specifics
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Revenue
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveTodayStats.lunchRev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Cover
                  </div>
                  <div className="text-base font-black text-blue-400">
                    {liveTodayStats.lunchCov.toLocaleString('id-ID')} Pax
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Avg Check
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveTodayStats.lunchAvg.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Discount
                  </div>
                  <div className="text-base font-black text-rose-400">
                    Rp {liveTodayStats.lunchDisc.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>
            {/* MTD Lunch */}
            <div className="glass-card p-1 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20">
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                  MTD Lunch Revenue
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Revenue
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveMtdStats.lunchRev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Cover
                  </div>
                  <div className="text-base font-black text-indigo-400">
                    {liveMtdStats.lunchCov.toLocaleString('id-ID')} Pax
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Avg Rev / Day
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {avgLunchRev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Total Discount
                  </div>
                  <div className="text-base font-black text-rose-400">
                    Rp {liveMtdStats.lunchDisc.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* GROUP 3: TOTAL (CLOSING) PERFORMANCE */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-emerald-900/30"></div>
            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
              Total Performance (Closing)
            </h3>
            <div className="h-px flex-1 bg-emerald-900/30"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today Total */}
            <div className="glass-card p-1 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                  Today Total Revenue
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Revenue
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveTodayStats.rev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Cover
                  </div>
                  <div className="text-base font-black text-emerald-400">
                    {liveTodayStats.cov.toLocaleString('id-ID')} Pax
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Average Check
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveTodayStats.totalAvg.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Discount
                  </div>
                  <div className="text-base font-black text-rose-400">
                    Rp {liveTodayStats.disc.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>
            {/* MTD Total */}
            <div className="glass-card p-1 bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-950 border-b border-white/5">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  MTD Closing Revenue
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Revenue
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {liveMtdStats.rev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Cover
                  </div>
                  <div className="text-base font-black text-slate-300">
                    {liveMtdStats.cov.toLocaleString('id-ID')} Pax
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Average Revenue / Day
                  </div>
                  <div className="text-base font-black text-white">
                    Rp {avgTotalRev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                    Total Discount
                  </div>
                  <div className="text-base font-black text-rose-400">
                    Rp {liveMtdStats.disc.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="glass-card p-4 md:p-6 border-l-4 border-indigo-500 shadow-2xl relative overflow-hidden bg-[#1e293b]/95">
        <div className="relative z-10 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter leading-none flex items-center gap-4">
              <i
                className={`fas ${isEditing ? "fa-edit" : "fa-keyboard"} text-indigo-400 text-lg md:text-xl`}
              ></i>{" "}
              {isEditing ? "Edit Stored Revenue" : "Daily Revenue Today"}
            </h2>
            <div className="flex gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Today Discount:{" "}
                  <span className="text-rose-400">
                    Rp {liveTodayStats.disc.toLocaleString('id-ID')}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Lunch Rev:{" "}
                  <span className="text-blue-400">
                    Rp {liveTodayStats.lunchRev.toLocaleString('id-ID')}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Lunch Disc:{" "}
                  <span className="text-rose-400">
                    Rp {liveTodayStats.lunchDisc.toLocaleString('id-ID')}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={handleCopyLunchWhatsApp}
                className="px-3 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <i className="fab fa-whatsapp text-[10px]"></i> Copy Lunch
              </button>
              <button
                onClick={handleCopyDinnerWhatsApp}
                className="px-3 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-orange-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <i className="fab fa-whatsapp text-[10px]"></i> Copy Dinner
              </button>
              <button
                onClick={handleCopyClosingWhatsApp}
                className="px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <i className="fab fa-whatsapp text-[10px]"></i> Copy Closing
              </button>
              {isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setLocalBatch(INITIAL_BATCH);
                  }}
                  className="px-3 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all active:scale-95 shadow-lg shadow-rose-500/10"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-4">
                <div className="text-right">
                  <div className="text-[7px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                    Live Today Rev
                  </div>
                  <div className="text-sm font-black text-white">
                    Rp {liveTodayStats.rev.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.2em]">
                    MTD Performance
                  </div>
                  <div className="text-sm font-black text-white">
                    {data.budgetRevenue > 0
                      ? ((liveMtdStats.rev / data.budgetRevenue) * 100).toFixed(
                          1,
                        )
                      : 0}
                    %
                  </div>
                </div>
              </div>
              <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">
                VARIANCE MTD REVENUE TO BUDGET
              </div>
              <div className="text-xs font-bold text-slate-300">
                Rp{" "}
                {(
                  liveMtdStats.rev - (data.budgetRevenue || 0)
                ).toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {/* LUNCH */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-3 border-b-2 border-blue-500/20 pb-3">
              <i className="fas fa-sun text-lg"></i> LUNCH REVENUE (INPUT)
            </h3>
            <div className="glass-card bg-slate-900/60 p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  LUNCH REV (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-blue-500/20 transition-all">
                  <span className="text-slate-700 text-sm font-black">RP.</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-white font-black outline-none text-3xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.lunchRevenue}
                    onChange={(e) =>
                      handleInputChange("lunchRevenue", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  LUNCH PAX (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-blue-500/20 transition-all">
                  <i className="fas fa-users text-slate-700 text-sm"></i>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-white font-black outline-none text-2xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.lunchCovers}
                    onChange={(e) =>
                      handleInputChange("lunchCovers", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                  LUNCH DISC (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-rose-500/20 transition-all opacity-80">
                  <span className="text-slate-700 text-sm font-black">RP.</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-rose-400 font-black outline-none text-2xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.discountLunch}
                    readOnly
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-teal-400 uppercase tracking-widest">
                      Go-Food
                    </label>
                    <span className="text-[7px] font-bold text-teal-500/80">LUNCH</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950 p-2 rounded border border-teal-500/30 text-teal-400 text-sm font-black outline-none focus:border-teal-500"
                    value={localBatch.goFoodLunch}
                    onChange={(e) =>
                      handleInputChange("goFoodLunch", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">
                      GrabFood
                    </label>
                    <span className="text-[7px] font-bold text-cyan-500/80">LUNCH</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950 p-2 rounded border border-cyan-500/30 text-cyan-400 text-sm font-black outline-none focus:border-cyan-500"
                    value={localBatch.grabFoodLunch}
                    onChange={(e) =>
                      handleInputChange("grabFoodLunch", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                      Take Away
                    </label>
                    <span className="text-[7px] font-bold text-slate-500/80">LUNCH</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950 p-2 rounded border border-slate-700 text-slate-200 text-sm font-black outline-none focus:border-slate-500"
                    value={localBatch.takeAwayLunch}
                    onChange={(e) =>
                      handleInputChange("takeAwayLunch", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DINNER (MIDDLE) */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-3 border-b-2 border-orange-500/20 pb-3">
              <i className="fas fa-moon text-lg"></i> DINNER REVENUE (AUTO)
            </h3>
            <div className="glass-card bg-slate-900/60 p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  DINNER REV (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-orange-500/20 transition-all">
                  <span className="text-slate-700 text-sm font-black">RP.</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-orange-400 font-black outline-none text-3xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.dinnerRevenue}
                    readOnly
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  DINNER PAX (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-orange-500/20 transition-all">
                  <i className="fas fa-users text-slate-700 text-sm"></i>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-orange-400 font-black outline-none text-2xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.dinnerCovers}
                    readOnly
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                  DINNER DISC (+)
                </label>
                <div className="flex items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-white/10 focus-within:ring-4 ring-rose-500/20 transition-all opacity-80">
                  <span className="text-slate-700 text-sm font-black">RP.</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-rose-400 font-black outline-none text-2xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.discountDinner}
                    readOnly
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-teal-400 uppercase tracking-widest">
                      Go-Food
                    </label>
                    <span className="text-[7px] font-bold text-teal-500/80">DINNER (AUTO)</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950/40 p-2 rounded border border-teal-500/20 text-teal-400 text-sm font-black outline-none opacity-80 cursor-not-allowed"
                    value={localBatch.goFoodDinner || 0}
                    readOnly
                    disabled
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">
                      GrabFood
                    </label>
                    <span className="text-[7px] font-bold text-cyan-500/80">DINNER (AUTO)</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950/40 p-2 rounded border border-cyan-500/20 text-cyan-400 text-sm font-black outline-none opacity-80 cursor-not-allowed"
                    value={localBatch.grabFoodDinner || 0}
                    readOnly
                    disabled
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                      Take Away
                    </label>
                    <span className="text-[7px] font-bold text-slate-500/80">DINNER (AUTO)</span>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-950/40 p-2 rounded border border-slate-700/50 text-slate-300 text-sm font-black outline-none opacity-80 cursor-not-allowed"
                    value={localBatch.takeAwayDinner || 0}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TODAY TOTAL (RIGHT) */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-emerald-500/20 pb-2">
              <i className="fas fa-calendar-day"></i> TOTAL DAILY (INPUT)
            </h3>
            <div className="glass-card bg-emerald-500/5 p-5 space-y-4 border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest underline decoration-wavy">
                  TOTAL REVENUE (NET)
                </label>
                <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-emerald-500/40 focus-within:ring-4 ring-emerald-500/20 shadow-lg shadow-emerald-500/10">
                  <span className="text-emerald-900 text-xs font-black">
                    RP.
                  </span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-emerald-400 font-black outline-none text-2xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.totalRevenue}
                    onChange={(e) =>
                      handleInputChange("totalRevenue", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest underline decoration-wavy">
                  TOTAL PAX
                </label>
                <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-emerald-500/40 focus-within:ring-4 ring-emerald-500/20 shadow-lg shadow-emerald-500/10">
                  <i className="fas fa-users text-emerald-900 text-xs"></i>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-emerald-400 font-black outline-none text-xl tracking-tighter"
                    placeholder="0"
                    value={localBatch.totalCovers}
                    onChange={(e) =>
                      handleInputChange("totalCovers", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest underline decoration-wavy">
                  TOTAL DISCOUNT
                </label>
                <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-rose-500/40 focus-within:ring-4 ring-rose-500/20 shadow-lg shadow-rose-500/10 opacity-80">
                  <span className="text-rose-900 text-xs font-black">Rp.</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-rose-500 font-black outline-none text-xl tracking-tighter cursor-not-allowed"
                    placeholder="0"
                    value={localBatch.totalDiscount}
                    readOnly
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 space-y-6">
                {/* REVENUE BREAKDOWN */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-chart-pie"></i> REVENUE BREAKDOWN (TOTAL CLOSING)
                    </span>
                    <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      INPUT TOTAL CLOSING
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/50 p-3 rounded-xl border border-white/5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                          Dine In
                        </label>
                        <span className="text-[7px] font-bold text-emerald-500/80">AUTO</span>
                      </div>
                      <input
                        type="number"
                        className="w-full bg-slate-950/50 p-2 rounded-lg border border-emerald-500/30 text-emerald-400 text-sm font-black outline-none opacity-80 cursor-not-allowed"
                        value={localBatch.dineInRevenue || 0}
                        readOnly
                        disabled
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                          Take Away
                        </label>
                        <span className="text-[7px] font-bold text-slate-400">CLOSING</span>
                      </div>
                      <input
                        type="number"
                        className="w-full bg-slate-950 p-2 rounded-lg border border-slate-700 text-slate-200 text-sm font-black outline-none focus:border-slate-400 transition-colors"
                        value={localBatch.takeAwayRevenue || 0}
                        onChange={(e) =>
                          handleInputChange("takeAwayRevenue", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[8px] font-black text-teal-400 uppercase tracking-widest">
                          Go-Food
                        </label>
                        <span className="text-[7px] font-bold text-teal-400">CLOSING</span>
                      </div>
                      <input
                        type="number"
                        className="w-full bg-slate-950 p-2 rounded-lg border border-teal-500/30 text-teal-400 text-sm font-black outline-none focus:border-teal-400 transition-colors"
                        value={localBatch.goFoodRevenue || 0}
                        onChange={(e) =>
                          handleInputChange("goFoodRevenue", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">
                          GrabFood
                        </label>
                        <span className="text-[7px] font-bold text-cyan-400">CLOSING</span>
                      </div>
                      <input
                        type="number"
                        className="w-full bg-slate-950 p-2 rounded-lg border border-cyan-500/30 text-cyan-400 text-sm font-black outline-none focus:border-cyan-400 transition-colors"
                        value={localBatch.grabFoodRevenue || 0}
                        onChange={(e) =>
                          handleInputChange("grabFoodRevenue", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* CASHIER SUMMARY */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i className="fas fa-cash-register"></i> CASHIER SUMMARY
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        Patty Cash
                      </label>
                      <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-white/10 focus-within:border-indigo-500 transition-colors">
                        <span className="text-[9px] font-black text-indigo-900">
                          RP
                        </span>
                        <input
                          type="number"
                          className="w-full bg-transparent text-white text-sm font-black outline-none"
                          value={localBatch.pettyCash}
                          onChange={(e) =>
                            handleInputChange("pettyCash", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        Setor Tunai
                      </label>
                      <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-emerald-500/20 focus-within:border-emerald-500 transition-colors">
                        <span className="text-[9px] font-black text-emerald-900">
                          RP
                        </span>
                        <input
                          type="number"
                          className="w-full bg-transparent text-emerald-400 text-sm font-black outline-none"
                          value={localBatch.setorTunai}
                          onChange={(e) =>
                            handleInputChange("setorTunai", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1 sm:col-span-2 mt-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        Notes / Keterangan
                      </label>
                      <textarea
                        className="w-full bg-slate-950 p-3 rounded-lg border border-white/10 text-white text-[11px] font-medium outline-none h-20 resize-none focus:border-indigo-500/50 transition-all placeholder:text-slate-800"
                        placeholder="Detail setoran atau catatan cashier..."
                        value={localBatch.inputNonFood}
                        onChange={(e) =>
                          handleInputChange("inputNonFood", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* EXTRA DISCOUNTS */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center justify-between border-b border-rose-500/20 pb-1">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-tags"></i> EXTRA DISCOUNTS
                    </span>
                    <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[7px] font-bold">
                      EXCLUDED FROM WA
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-rose-500/10">
                    {/* CUSTOMER SATISFACTION */}
                    <div className="space-y-2 p-3 bg-rose-500/5 rounded-lg border border-rose-500/10">
                      <div className="text-[8px] font-black text-rose-400 uppercase flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <i className="fas fa-smile"></i> GUEST SATISFACTION (EXTRA DISC)
                        </span>
                        {(dailyCustomerSat[filters.startDate] || []).length > 0 && (
                          <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded text-[7px] font-black">
                            {(dailyCustomerSat[filters.startDate] || []).length} Item
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[7px] text-slate-500 uppercase font-black">
                          Auto-Calculated Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 text-[8px] font-black">
                            RP
                          </span>
                          <input
                            type="number"
                            className="w-full bg-slate-950 pl-7 p-2 rounded-lg border border-white/5 text-rose-400 text-sm font-black outline-none opacity-90 cursor-not-allowed"
                            value={localBatch.customerSatRevenue}
                            readOnly
                          />
                        </div>
                        <p className="text-[7px] text-emerald-400 font-bold italic flex items-center gap-1">
                          <i className="fas fa-link text-[6px]"></i> Terhubung otomatis dari Fitur Guest Satisfaction
                        </p>
                        {(dailyCustomerSat[filters.startDate] || []).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-rose-500/10 space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                            {(dailyCustomerSat[filters.startDate] || []).map((it, idx) => (
                              <div key={idx} className="flex justify-between text-[7px] text-slate-400 bg-slate-900/60 p-1.5 rounded border border-white/5">
                                <span className="font-semibold text-slate-300 truncate max-w-[140px]">{it.name} ({it.qty}x)</span>
                                <span className="font-bold text-rose-400">Rp {((Number(it.qty) || 0) * (Number(it.price) || 0)).toLocaleString('id-ID')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DISCOUNT MANAGEMENT */}
                    <div className="space-y-2 p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/10">
                      <div className="text-[8px] font-black text-indigo-400 uppercase flex items-center gap-2">
                        <i className="fas fa-tasks"></i> DISCOUNT MANAGEMENT
                        (MANUAL)
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-1">
                          <label className="text-[7px] text-slate-500 uppercase font-black">
                            Remark / Name
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-950 p-2 rounded-lg border border-white/5 text-xs font-bold outline-none focus:border-indigo-500/50 text-white"
                            placeholder="Reason..."
                            value={localBatch.discManagementName}
                            onChange={(e) =>
                              handleInputChange(
                                "discManagementName",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[7px] text-indigo-400 uppercase font-black">
                            Nominal
                          </label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-900 text-[8px] font-black">
                              RP
                            </span>
                            <input
                              type="number"
                              className="w-full bg-slate-950 pl-7 p-2 rounded-lg border border-white/5 text-indigo-400 text-sm font-black outline-none focus:border-indigo-500/50"
                              value={localBatch.discManagementRevenue}
                              onChange={(e) =>
                                handleInputChange(
                                  "discManagementRevenue",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DISCOUNT & PROGRAM DETAILS */}
          <div className="flex flex-col gap-8 relative z-10 mt-6 md:col-span-3">
            {/* SECTION 1: DISCOUNT ENTITLED */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2 border-b-2 border-rose-500/20 pb-2">
                <i className="fas fa-percentage text-base"></i> DISCOUNT
                ENTITLED (INPUT)
              </h3>
              <div className="glass-card bg-slate-950/40 p-5 space-y-4 border border-rose-500/10 shadow-xl shadow-rose-500/5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* CEO / PAK YUDI */}
                  <div className="space-y-3 p-4 bg-slate-900/30 rounded-xl border border-white/5 shadow-lg">
                    <div className="text-[9px] font-black text-white uppercase tracking-[0.2em] flex justify-between items-center border-b border-rose-500/20 pb-1">
                      <span className="flex items-center gap-2">
                        <i className="fas fa-user-tie text-rose-500 text-xs"></i>{" "}
                        CEO / PAK YUDI
                      </span>
                      <span className="text-rose-500 text-base font-black">
                        Rp.
                        {(
                          localBatch.discLunchPakYudi +
                          localBatch.discDinnerPakYudi
                        ).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                          Lunch Disc
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 text-[8px] font-black">
                            RP
                          </span>
                          <input
                            type="number"
                            className="w-full bg-slate-950 pl-7 p-2 rounded-lg border border-white/5 text-white text-base font-black outline-none focus:border-rose-500/50 shadow-inner"
                            value={localBatch.discLunchPakYudi}
                            onChange={(e) =>
                              handleInputChange(
                                "discLunchPakYudi",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                          Dinner Disc
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 text-[8px] font-black">
                            RP
                          </span>
                          <input
                            type="number"
                            className="w-full bg-slate-950 pl-7 p-2 rounded-lg border border-white/5 text-white text-base font-black outline-none focus:border-rose-500/50 shadow-inner"
                            value={localBatch.discDinnerPakYudi}
                            onChange={(e) =>
                              handleInputChange(
                                "discDinnerPakYudi",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* INVESTOR & CADANGAN SECTION */}
                  <div className="col-span-full space-y-4">
                    {!isPromoEnabled ? (
                      <div className="p-4 bg-slate-900/40 rounded-2xl border border-rose-500/20 flex items-center justify-between shadow-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center text-base border border-rose-500/20">
                            <i className="fas fa-tag"></i>
                          </div>
                          <div>
                            <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                              Promo & Diskon Nonaktif
                              <span className="bg-rose-500/10 text-rose-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-rose-500/20">OFF</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">Input diskon Investor & Cadangan dinonaktifkan dari Admin Control untuk periode ini.</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 italic">Admin Configured</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* INVESTOR GROUP */}
                        <div className="space-y-3 p-4 bg-slate-900/40 rounded-2xl border border-indigo-500/20 shadow-xl">
                          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2 mb-2">
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                              <i className="fas fa-users"></i> INVESTOR DISCOUNTS
                            </div>
                            <span className="text-[8px] font-bold text-slate-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                              Lunch Manual • Dinner Auto • Closing Manual
                            </span>
                          </div>
                          
                          {[
                            { label: monthlyDiscountNames.investorName, lunch: 'discLunchInvestor', dinner: 'discDinnerInvestor', closingKey: 'discClosingInvestor', nameKey: 'investorName', defaultName: 'INVESTOR 1' },
                            { label: monthlyDiscountNames.investorName2, lunch: 'discLunchInvestor2', dinner: 'discDinnerInvestor2', closingKey: 'discClosingInvestor2', nameKey: 'investorName2', defaultName: 'INVESTOR 2' },
                            { label: monthlyDiscountNames.investorName3, lunch: 'discLunchInvestor3', dinner: 'discDinnerInvestor3', closingKey: 'discClosingInvestor3', nameKey: 'investorName3', defaultName: 'INVESTOR 3' },
                          ].map((item) => {
                            const lunchVal = Number((localBatch as any)[item.lunch]) || 0;
                            const dinnerVal = Number((localBatch as any)[item.dinner]) || 0;
                            const closingCalculated = Number((localBatch as any)[item.closingKey] ?? (lunchVal + dinnerVal)) || 0;

                            return (
                              <div key={item.label} className="bg-slate-950/60 p-3 rounded-xl border border-white/5 space-y-2 hover:border-indigo-500/30 transition-all">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                    <i className="fas fa-user-tie text-indigo-400 text-xs"></i>
                                    <input
                                      type="text"
                                      className="bg-transparent border-b border-dashed border-indigo-500/30 hover:border-indigo-400 text-[10px] font-black text-white uppercase outline-none focus:border-indigo-500 focus:text-indigo-300 px-1 py-0.5 transition-all w-full max-w-[180px]"
                                      value={(localBatch as any)[item.nameKey] || ""}
                                      onChange={(e) => handleInputChange(item.nameKey, e.target.value)}
                                      placeholder={item.label || item.defaultName}
                                      title="Klik untuk mengubah nama Investor"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                      Total: Rp {closingCalculated.toLocaleString('id-ID')}
                                    </span>
                                    {(lunchVal > 0 || closingCalculated > 0 || dinnerVal > 0) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleInputChange(item.lunch, 0);
                                          handleInputChange(item.closingKey, 0);
                                        }}
                                        className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[8px] font-bold rounded border border-rose-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                                        title="Reset nilai diskon investor ini ke 0"
                                      >
                                        <i className="fas fa-rotate-left text-[7px]"></i>
                                        <span>RESET</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {/* LUNCH (MANUAL) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">LUNCH</span>
                                      <span className="text-[6.5px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-bold border border-emerald-500/20">MANUAL</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-900 pl-8 pr-2 py-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                        value={lunchVal === 0 ? '' : lunchVal}
                                        placeholder="0"
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleInputChange(item.lunch, e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  {/* CLOSING (MANUAL) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">CLOSING</span>
                                      <span className="text-[6.5px] text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded font-bold border border-indigo-500/20">MANUAL</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-900 pl-8 pr-2 py-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                        value={closingCalculated === 0 ? '' : closingCalculated}
                                        placeholder="0"
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleInputChange(item.closingKey, e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  {/* DINNER (AUTO) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">DINNER</span>
                                      <span className="text-[6.5px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded font-bold border border-amber-500/20">AUTO (C - L)</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-950/80 pl-8 pr-2 py-1.5 rounded-lg border border-white/5 text-amber-300 text-xs font-black outline-none cursor-not-allowed opacity-90"
                                        value={dinnerVal}
                                        readOnly
                                        disabled
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* CADANGAN GROUP */}
                        <div className="space-y-3 p-4 bg-slate-900/40 rounded-2xl border border-rose-500/20 shadow-xl">
                          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-2">
                            <div className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                              <i className="fas fa-plus-circle"></i> ADDITIONAL / CADANGAN
                            </div>
                            <span className="text-[8px] font-bold text-slate-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                              Lunch Manual • Dinner Auto • Closing Manual
                            </span>
                          </div>
                          
                          {[
                            { label: monthlyDiscountNames.cadanganName1, lunch: 'discLunchCadangan1', dinner: 'discDinnerCadangan1', closingKey: 'discClosingCadangan1', nameKey: 'cadanganName1', defaultName: 'CADANGAN 1' },
                            { label: monthlyDiscountNames.cadanganName2, lunch: 'discLunchCadangan2', dinner: 'discDinnerCadangan2', closingKey: 'discClosingCadangan2', nameKey: 'cadanganName2', defaultName: 'CADANGAN 2' },
                            { label: monthlyDiscountNames.cadanganName3, lunch: 'discLunchCadangan3', dinner: 'discDinnerCadangan3', closingKey: 'discClosingCadangan3', nameKey: 'cadanganName3', defaultName: 'CADANGAN 3' },
                          ].map((item) => {
                            const lunchVal = Number((localBatch as any)[item.lunch]) || 0;
                            const dinnerVal = Number((localBatch as any)[item.dinner]) || 0;
                            const closingCalculated = Number((localBatch as any)[item.closingKey] ?? (lunchVal + dinnerVal)) || 0;

                            return (
                              <div key={item.label} className="bg-slate-950/60 p-3 rounded-xl border border-white/5 space-y-2 hover:border-rose-500/30 transition-all">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                    <i className="fas fa-tag text-rose-400 text-xs"></i>
                                    <input
                                      type="text"
                                      className="bg-transparent border-b border-dashed border-rose-500/30 hover:border-rose-400 text-[10px] font-black text-white uppercase outline-none focus:border-rose-500 focus:text-rose-300 px-1 py-0.5 transition-all w-full max-w-[180px]"
                                      value={(localBatch as any)[item.nameKey] || ""}
                                      onChange={(e) => handleInputChange(item.nameKey, e.target.value)}
                                      placeholder={item.label || item.defaultName}
                                      title="Klik untuk mengubah nama Promo/Cadangan"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                      Total: Rp {closingCalculated.toLocaleString('id-ID')}
                                    </span>
                                    {(lunchVal > 0 || closingCalculated > 0 || dinnerVal > 0) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleInputChange(item.lunch, 0);
                                          handleInputChange(item.closingKey, 0);
                                        }}
                                        className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[8px] font-bold rounded border border-rose-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                                        title="Reset nilai diskon cadangan ini ke 0"
                                      >
                                        <i className="fas fa-rotate-left text-[7px]"></i>
                                        <span>RESET</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {/* LUNCH (MANUAL) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">LUNCH</span>
                                      <span className="text-[6.5px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-bold border border-emerald-500/20">MANUAL</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-900 pl-8 pr-2 py-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none focus:border-rose-500/70 focus:ring-1 focus:ring-rose-500/30 transition-all"
                                        value={lunchVal === 0 ? '' : lunchVal}
                                        placeholder="0"
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleInputChange(item.lunch, e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  {/* CLOSING (MANUAL) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">CLOSING</span>
                                      <span className="text-[6.5px] text-rose-400 bg-rose-500/10 px-1 py-0.2 rounded font-bold border border-rose-500/20">MANUAL</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-900 pl-8 pr-2 py-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none focus:border-rose-500/70 focus:ring-1 focus:ring-rose-500/30 transition-all"
                                        value={closingCalculated === 0 ? '' : closingCalculated}
                                        placeholder="0"
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleInputChange(item.closingKey, e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  {/* DINNER (AUTO) */}
                                  <div>
                                    <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider mb-1">
                                      <span className="text-slate-400">DINNER</span>
                                      <span className="text-[6.5px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded font-bold border border-amber-500/20">AUTO (C - L)</span>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">RP</span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-950/80 pl-8 pr-2 py-1.5 rounded-lg border border-white/5 text-amber-300 text-xs font-black outline-none cursor-not-allowed opacity-90"
                                        value={dinnerVal}
                                        readOnly
                                        disabled
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* MEMBERSHIP & BANKING - FULL WIDTH INTERNAL GRID */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-id-card"></i> MEMBERSHIP &amp; BANKING PROGRAMS
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-white/10 flex items-center gap-1.5">
                        <i className="fas fa-tag text-indigo-400"></i>
                        <span>{activeBankPromos.length} Promo Aktif</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                          }
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-indigo-600/20 hover:from-amber-500/30 hover:to-indigo-600/30 text-amber-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-amber-500/30 flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                        title="Penambahan & pengaturan promo bank hanya dapat diatur di Outlet Control dengan pilihan outlet target"
                      >
                        <i className="fas fa-sliders-h text-amber-400"></i>
                        <span>Atur di Outlet Control</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* MEMBERSHIP */}
                    <div className={`space-y-4 p-4 bg-slate-900/50 rounded-xl border border-indigo-500/10 hover:border-indigo-500/30 transition-all ${!isBankPromoEnabled ? 'md:col-span-1' : ''}`}>
                      <div className="text-[9px] font-black text-indigo-400 uppercase flex items-center gap-2 mb-1">
                        <div className="w-1 h-3 bg-indigo-500 rounded-full"></div>
                        JUSTUS MEMBERSHIP
                      </div>

                      {/* Covers Block */}
                      <div className="space-y-2">
                        <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest border-b border-indigo-500/10 pb-1">COVERS (PAX)</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[7px] text-slate-400 font-bold block mb-1">LUNCH</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none focus:border-indigo-500"
                              value={localBatch.membershipCoverLunch || 0}
                              onChange={(e) => handleInputChange("membershipCoverLunch", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[7px] text-slate-400 font-bold block mb-1">CLOSING</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none focus:border-indigo-500"
                              value={localBatch.membershipCover || 0}
                              onChange={(e) => handleInputChange("membershipCover", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[7px] text-slate-500 font-bold block mb-1 opacity-50">DINNER (AUTO)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950/40 p-1.5 rounded-lg border border-white/5 text-slate-400 text-xs font-black outline-none"
                              value={localBatch.membershipCoverDinner || 0}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>
                      </div>

                      {/* Revenue Block */}
                      <div className="space-y-2">
                        <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest border-b border-indigo-500/10 pb-1">REVENUE (IDR)</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[7px] text-slate-400 font-bold block mb-1">LUNCH</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none focus:border-indigo-500"
                              value={localBatch.membershipRevenueLunch || 0}
                              onChange={(e) => handleInputChange("membershipRevenueLunch", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[7px] text-slate-400 font-bold block mb-1">CLOSING</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none focus:border-indigo-500"
                              value={localBatch.membershipRevenue || 0}
                              onChange={(e) => handleInputChange("membershipRevenue", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[7px] text-slate-500 font-bold block mb-1 opacity-50">DINNER (AUTO)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950/40 p-1.5 rounded-lg border border-white/5 text-slate-400 text-xs font-black outline-none"
                              value={localBatch.membershipRevenueDinner || 0}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {!isBankPromoEnabled ? (
                      <div className="md:col-span-2 p-5 bg-slate-900/30 rounded-xl border border-amber-500/20 flex flex-col justify-center gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-lg border border-amber-500/20">
                            <i className="fas fa-credit-card"></i>
                          </div>
                          <div>
                            <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                              Bank Promo Nonaktif
                              <span className="bg-amber-500/10 text-amber-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-amber-500/20">OFF</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">Input transaksi promo bank dinonaktifkan oleh Admin Control untuk periode ini.</span>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-500 italic">Untuk mengaktifkan kembali, buka Admin Control &gt; Promo &amp; Bank Control.</p>
                      </div>
                    ) : activeBankPromos.length === 0 ? (
                      <div className="md:col-span-2 p-5 bg-slate-900/30 rounded-xl border border-slate-700/40 flex flex-col justify-center items-center text-center gap-2.5">
                        <i className="fas fa-tags text-slate-500 text-2xl"></i>
                        <span className="text-xs font-bold text-slate-300">Tidak ada Promo Banking aktif untuk {filters.outlet || 'outlet ini'}</span>
                        <span className="text-[10px] text-slate-400 max-w-md">
                          Penambahan promo bank hanya dapat diatur di <strong>Outlet Control</strong> dengan memilih outlet mana saja yang akan ditambahkan promo.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('openOutletControl', { detail: { tab: 'PROMO' } }));
                            }
                          }}
                          className="mt-1 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-950/50 flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <i className="fas fa-store-alt text-amber-400 text-xs"></i>
                          <span>Buka Outlet Control Promo</span>
                        </button>
                      </div>
                    ) : (
                      activeBankPromos.map((promo, pIdx) => {
                        const vals = getPromoValues(promo.id);
                        const colors = [
                          { border: 'border-cyan-500/20 hover:border-cyan-500/40', title: 'text-cyan-400', bar: 'bg-cyan-500', focus: 'focus:border-cyan-500' },
                          { border: 'border-amber-500/20 hover:border-amber-500/40', title: 'text-amber-400', bar: 'bg-amber-500', focus: 'focus:border-amber-500' },
                          { border: 'border-emerald-500/20 hover:border-emerald-500/40', title: 'text-emerald-400', bar: 'bg-emerald-500', focus: 'focus:border-emerald-500' },
                          { border: 'border-purple-500/20 hover:border-purple-500/40', title: 'text-purple-400', bar: 'bg-purple-500', focus: 'focus:border-purple-500' },
                        ];
                        const c = colors[pIdx % colors.length];

                        return (
                          <div key={promo.id} className={`space-y-4 p-4 bg-slate-900/50 rounded-xl border ${c.border} transition-all`}>
                            <div className="flex items-center justify-between">
                              <div className={`text-[9px] font-black ${c.title} uppercase flex items-center gap-2`}>
                                <div className={`w-1 h-3 ${c.bar} rounded-full`}></div>
                                {promo.name}
                              </div>
                              <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                ACTIVE
                              </span>
                            </div>
                            {promo.terms && (
                              <p className="text-[8px] text-slate-400 line-clamp-2 italic bg-slate-950/40 p-1.5 rounded border border-white/5">
                                <span className="font-bold text-slate-300">S&amp;K:</span> {promo.terms}
                              </p>
                            )}

                            {/* Covers Block */}
                            <div className="space-y-2">
                              <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest border-b border-white/5 pb-1">COVERS (PAX)</div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[7px] text-slate-400 font-bold block mb-1">LUNCH</label>
                                  <input
                                    type="number"
                                    className={`w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none ${c.focus}`}
                                    value={vals.coverLunch}
                                    onChange={(e) => handlePromoInputChange(promo.id, 'coverLunch', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[7px] text-slate-400 font-bold block mb-1">CLOSING</label>
                                  <input
                                    type="number"
                                    className={`w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-white text-xs font-black outline-none ${c.focus}`}
                                    value={vals.coverClosing}
                                    onChange={(e) => handlePromoInputChange(promo.id, 'coverClosing', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[7px] text-slate-500 font-bold block mb-1 opacity-50">DINNER (AUTO)</label>
                                  <input
                                    type="number"
                                    className="w-full bg-slate-950/40 p-1.5 rounded-lg border border-white/5 text-slate-400 text-xs font-black outline-none"
                                    value={vals.coverDinner}
                                    readOnly
                                    disabled
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Revenue Block */}
                            <div className="space-y-2">
                              <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest border-b border-white/5 pb-1">REVENUE (IDR)</div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[7px] text-slate-400 font-bold block mb-1">LUNCH</label>
                                  <input
                                    type="number"
                                    className={`w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none ${c.focus}`}
                                    value={vals.revLunch}
                                    onChange={(e) => handlePromoInputChange(promo.id, 'revLunch', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[7px] text-slate-400 font-bold block mb-1">CLOSING</label>
                                  <input
                                    type="number"
                                    className={`w-full bg-slate-950 p-1.5 rounded-lg border border-white/10 text-emerald-400 text-xs font-black outline-none ${c.focus}`}
                                    value={vals.revClosing}
                                    onChange={(e) => handlePromoInputChange(promo.id, 'revClosing', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[7px] text-slate-500 font-bold block mb-1 opacity-50">DINNER (AUTO)</label>
                                  <input
                                    type="number"
                                    className="w-full bg-slate-950/40 p-1.5 rounded-lg border border-white/5 text-slate-400 text-xs font-black outline-none"
                                    value={vals.revDinner}
                                    readOnly
                                    disabled
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Custom Discount */}
                            <div className="space-y-1 pt-1 opacity-80">
                              <label className="text-[8px] text-slate-400 uppercase font-black tracking-widest">
                                Custom Discount (Optional)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[8px] font-black">
                                  Rp
                                </span>
                                <input
                                  type="number"
                                  className="w-full bg-slate-950 pl-8 p-1.5 rounded-lg border border-white/10 text-rose-400 text-sm font-black outline-none transition-all"
                                  value={vals.discount === 0 ? '' : vals.discount}
                                  placeholder="0"
                                  onChange={(e) => handlePromoInputChange(promo.id, 'discount', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SYNC ACTION */}
        <div className="md:col-span-3 mt-4">
          <div className="glass-card bg-slate-950 p-6 md:p-10 border-indigo-500/30 border-2 shadow-2xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex-1 text-center md:text-left">
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                  {isEditing
                    ? "Calculated Replacement Total"
                    : "Calculated Cumulative Today"}
                </div>
                <div className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                  Rp {liveTodayStats.rev.toLocaleString('id-ID')}
                </div>
              </div>
              <button
                onClick={handleInitiateSubmit}
                disabled={isSubmitting}
                className={`w-full md:w-auto px-10 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all border border-white/10 active:scale-95 flex flex-col items-center drop-shadow-2xl ${
                  isSubmitting
                    ? "bg-slate-800 text-slate-600 cursor-wait"
                    : isEditing
                      ? "bg-gradient-to-r from-amber-600 to-orange-700 text-white hover:from-amber-500 hover:to-orange-600 shadow-amber-500/20"
                      : "bg-gradient-to-r from-indigo-600 to-blue-700 text-white hover:from-indigo-500 hover:to-blue-600 shadow-indigo-500/20"
                }`}
              >
                <span className="flex items-center gap-3">
                  {isSubmitting ? (
                    <i className="fas fa-sync fa-spin"></i>
                  ) : (
                    <i
                      className={
                        isEditing ? "fas fa-save" : "fas fa-check-circle"
                      }
                    ></i>
                  )}
                  {isEditing ? "UPDATE & SAVE" : "SYNC & SUBMIT"}
                </span>
              </button>
              {data.dailyRecording?.[filters.startDate] !== undefined && (
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setShowConfirm({
                        title: "HAPUS DATA SALES",
                        message: `Apakah Anda yakin ingin menghapus semua data sales untuk tanggal ${filters.startDate}?`,
                        onConfirm: () => {
                          const newDailyRecording = { ...data.dailyRecording };
                          delete newDailyRecording[filters.startDate];

                          const newTotalMTDRevenue = Object.values(
                            newDailyRecording,
                          ).reduce(
                            (acc: number, curr: DailySalesData) =>
                              acc + (Number(curr.revenue) || 0),
                            0,
                          );
                          const newTotalMTDCovers = Object.values(
                            newDailyRecording,
                          ).reduce(
                            (acc: number, curr: DailySalesData) =>
                              acc + (Number(curr.covers) || 0),
                            0,
                          );

                          onUpdate({
                            ...data,
                            dailyRecording: newDailyRecording,
                            sales: {
                              ...(data.sales || {}),
                              dailyRecording: newDailyRecording,
                              revenue: newTotalMTDRevenue,
                              covers: newTotalMTDCovers,
                              todayRevenue: 0,
                              todayCovers: 0,
                            },
                            revenue: newTotalMTDRevenue,
                            covers: newTotalMTDCovers,
                            todayRevenue: 0,
                            todayCovers: 0,
                            todayLunchRevenue: 0,
                            todayLunchCovers: 0,
                            todayDinnerRevenue: 0,
                            todayDinnerCovers: 0,
                            todayDiscountLunch: 0,
                            todayDiscountDinner: 0,
                          });
                          setShowSuccess({
                            title: "DATA DIHAPUS",
                            message: `Seluruh data sales untuk tanggal ${filters.startDate} telah dihapus.`,
                          });
                          setShowConfirm(null);
                        },
                      });
                    }}
                    className="w-full md:w-auto px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all bg-rose-600/20 text-rose-500 border border-rose-500/30 hover:bg-rose-600/40 active:scale-95 flex items-center justify-center gap-3"
                  >
                    <i className="fas fa-trash-alt"></i>
                    HAPUS HARI INI
                  </button>
                  <button
                    onClick={handleDeleteAllSalesMonth}
                    className="w-full md:w-auto px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all bg-rose-900/40 text-rose-400 border border-rose-500/20 hover:bg-rose-600 hover:text-white active:scale-95 flex items-center justify-center gap-3"
                  >
                    <i className="fas fa-dumpster-fire"></i>
                    TRASH ALL MONTH
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SLIDEABLE DATABASE VIEW */}
        <div className="md:col-span-2 space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-3">
              <i className="fas fa-database"></i> Stored Daily Database
            </h3>
            <div className="flex gap-2">
              {data.dailyRecording?.[filters.startDate] !== undefined && (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      const lunchRev = storedDailyRecord.lunchRevenue || 0;
                      const dinnerRev = storedDailyRecord.dinnerRevenue || 0;
                      const lunchCov = storedDailyRecord.lunchCovers || 0;
                      const dinnerCov = storedDailyRecord.dinnerCovers || 0;
                      const lunchDisc = storedDailyRecord.discountLunch || 0;
                      const dinnerDisc = storedDailyRecord.discountDinner || 0;

                        const loadedTakeAwayLunch = storedDailyRecord.takeAwayLunch || 0;
                        const loadedTakeAwayDinner = storedDailyRecord.takeAwayDinner || 0;
                        const loadedTakeAwayRevenue = (storedDailyRecord.takeAwayRevenue !== undefined && storedDailyRecord.takeAwayRevenue > 0)
                          ? storedDailyRecord.takeAwayRevenue
                          : (loadedTakeAwayLunch + loadedTakeAwayDinner);
                        const finalTakeAwayDinner = loadedTakeAwayDinner > 0 ? loadedTakeAwayDinner : Math.max(0, loadedTakeAwayRevenue - loadedTakeAwayLunch);

                        const loadedGoFoodLunch = storedDailyRecord.goFoodLunch || 0;
                        const loadedGoFoodDinner = storedDailyRecord.goFoodDinner || 0;
                        const loadedGoFoodRevenue = (storedDailyRecord.goFoodRevenue !== undefined && storedDailyRecord.goFoodRevenue > 0)
                          ? storedDailyRecord.goFoodRevenue
                          : (loadedGoFoodLunch + loadedGoFoodDinner);
                        const finalGoFoodDinner = loadedGoFoodDinner > 0 ? loadedGoFoodDinner : Math.max(0, loadedGoFoodRevenue - loadedGoFoodLunch);

                        const loadedGrabFoodLunch = storedDailyRecord.grabFoodLunch || 0;
                        const loadedGrabFoodDinner = storedDailyRecord.grabFoodDinner || 0;
                        const loadedGrabFoodRevenue = (storedDailyRecord.grabFoodRevenue !== undefined && storedDailyRecord.grabFoodRevenue > 0)
                          ? storedDailyRecord.grabFoodRevenue
                          : (loadedGrabFoodLunch + loadedGrabFoodDinner);
                        const finalGrabFoodDinner = loadedGrabFoodDinner > 0 ? loadedGrabFoodDinner : Math.max(0, loadedGrabFoodRevenue - loadedGrabFoodLunch);

                        setLocalBatch({
                          lunchRevenue: lunchRev,
                          lunchCovers: lunchCov,
                          dinnerRevenue: dinnerRev,
                          dinnerCovers: dinnerCov,
                          discountLunch: lunchDisc,
                          discountDinner: dinnerDisc,
                          totalRevenue: lunchRev + dinnerRev,
                          totalCovers: lunchCov + dinnerCov,
                          totalDiscount:
                            storedDailyRecord.totalDiscount !== undefined && Number(storedDailyRecord.totalDiscount) > 0
                              ? Number(storedDailyRecord.totalDiscount)
                              : calculateDiscounts({
                                  ...storedDailyRecord,
                                  customerSatRevenue: calculatedCustomerSat,
                                }).totalDiscount,
                          discLunchInvestor: storedDailyRecord.discLunchInvestor || 0,
                          discLunchInvestor2: storedDailyRecord.discLunchInvestor2 || 0,
                          discLunchInvestor3: storedDailyRecord.discLunchInvestor3 || 0,
                          discDinnerInvestor: storedDailyRecord.discDinnerInvestor || 0,
                          discDinnerInvestor2: storedDailyRecord.discDinnerInvestor2 || 0,
                          discDinnerInvestor3: storedDailyRecord.discDinnerInvestor3 || 0,
                          discClosingInvestor: storedDailyRecord.discClosingInvestor ?? ((storedDailyRecord.discLunchInvestor || 0) + (storedDailyRecord.discDinnerInvestor || 0)),
                          discClosingInvestor2: storedDailyRecord.discClosingInvestor2 ?? ((storedDailyRecord.discLunchInvestor2 || 0) + (storedDailyRecord.discDinnerInvestor2 || 0)),
                          discClosingInvestor3: storedDailyRecord.discClosingInvestor3 ?? ((storedDailyRecord.discLunchInvestor3 || 0) + (storedDailyRecord.discDinnerInvestor3 || 0)),
                          discLunchPakYudi: storedDailyRecord.discLunchPakYudi || 0,
                          discDinnerPakYudi: storedDailyRecord.discDinnerPakYudi || 0,
                          discLunchCadangan1: storedDailyRecord.discLunchCadangan1 || 0,
                          discLunchCadangan2: storedDailyRecord.discLunchCadangan2 || 0,
                          discLunchCadangan3: storedDailyRecord.discLunchCadangan3 || 0,
                          discDinnerCadangan1: storedDailyRecord.discDinnerCadangan1 || 0,
                          discDinnerCadangan2: storedDailyRecord.discDinnerCadangan2 || 0,
                          discDinnerCadangan3: storedDailyRecord.discDinnerCadangan3 || 0,
                          discClosingCadangan1: storedDailyRecord.discClosingCadangan1 ?? ((storedDailyRecord.discLunchCadangan1 || 0) + (storedDailyRecord.discDinnerCadangan1 || 0)),
                          discClosingCadangan2: storedDailyRecord.discClosingCadangan2 ?? ((storedDailyRecord.discLunchCadangan2 || 0) + (storedDailyRecord.discDinnerCadangan2 || 0)),
                          discClosingCadangan3: storedDailyRecord.discClosingCadangan3 ?? ((storedDailyRecord.discLunchCadangan3 || 0) + (storedDailyRecord.discDinnerCadangan3 || 0)),
                          dineInRevenue: (lunchRev + dinnerRev) - loadedTakeAwayRevenue - loadedGoFoodRevenue - loadedGrabFoodRevenue,
                          takeAwayRevenue: loadedTakeAwayRevenue,
                          goFoodRevenue: loadedGoFoodRevenue,
                          grabFoodRevenue: loadedGrabFoodRevenue,
                          takeAwayLunch: loadedTakeAwayLunch,
                          takeAwayDinner: finalTakeAwayDinner,
                          goFoodLunch: loadedGoFoodLunch,
                          goFoodDinner: finalGoFoodDinner,
                          grabFoodLunch: loadedGrabFoodLunch,
                          grabFoodDinner: finalGrabFoodDinner,
                        pettyCash: storedDailyRecord.pettyCash || 1500000,
                        setorTunai: storedDailyRecord.setorTunai || 0,
                        inputNonFood: storedDailyRecord.inputNonFood || "",
                        investorName: storedDailyRecord.investorName || "",
                        investorName2: storedDailyRecord.investorName2 || "",
                        investorName3: storedDailyRecord.investorName3 || "",
                        cadanganName1: storedDailyRecord.cadanganName1 || "",
                        cadanganName2: storedDailyRecord.cadanganName2 || "",
                        cadanganName3: storedDailyRecord.cadanganName3 || "",
                        membershipCover: storedDailyRecord.membershipCover || 0,
                        membershipCoverLunch: storedDailyRecord.membershipCoverLunch || 0,
                        membershipCoverDinner: storedDailyRecord.membershipCoverDinner || 0,
                        membershipRevenueLunch: storedDailyRecord.membershipRevenueLunch || 0,
                        membershipRevenueDinner: storedDailyRecord.membershipRevenueDinner || 0,
                        membershipRevenue: storedDailyRecord.membershipRevenue || 0,
                        bankMegaCover: storedDailyRecord.bankMegaCover || 0,
                        bankMegaCoverLunch: storedDailyRecord.bankMegaCoverLunch || 0,
                        bankMegaCoverDinner: storedDailyRecord.bankMegaCoverDinner || 0,
                        bankMegaRevenueLunch: storedDailyRecord.bankMegaRevenueLunch || 0,
                        bankMegaRevenueDinner: storedDailyRecord.bankMegaRevenueDinner || 0,
                        bankMegaRevenue: storedDailyRecord.bankMegaRevenue || 0,
                        digibankCover: storedDailyRecord.digibankCover || 0,
                        digibankCoverLunch: storedDailyRecord.digibankCoverLunch || 0,
                        digibankCoverDinner: storedDailyRecord.digibankCoverDinner || 0,
                        digibankRevenueLunch: storedDailyRecord.digibankRevenueLunch || 0,
                        digibankRevenueDinner: storedDailyRecord.digibankRevenueDinner || 0,
                        digibankRevenue: storedDailyRecord.digibankRevenue || 0,
                        digibankDiscount: storedDailyRecord.digibankDiscount || 0,
                        customerSatRevenue: calculatedCustomerSat,
                        discManagementRevenue:
                          storedDailyRecord.discManagementRevenue || 0,
                        discManagementName:
                          storedDailyRecord.discManagementName || "",
                        promoBankEntries: (storedDailyRecord as any).promoBankEntries || {},
                      });
                      try {
                        document
                          .getElementById("sales-module-container")
                          ?.scrollIntoView({ behavior: "smooth" });
                      } catch (e) {
                        console.warn("[SalesModule] scrollIntoView failed:", e);
                      }
                    }}
                    className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 group px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg uppercase tracking-widest"
                  >
                    <i className="fas fa-edit group-hover:rotate-12 transition-transform"></i>{" "}
                    Edit Stored Data
                  </button>
                  <button
                    onClick={() => {
                      setShowConfirm({
                        title: "HAPUS DATA SALES",
                        message: `Apakah Anda yakin ingin menghapus semua data sales untuk tanggal ${filters.startDate}?`,
                        onConfirm: () => {
                          const newDailyRecording = {
                            ...data.dailyRecording,
                          };
                          delete newDailyRecording[filters.startDate];

                          const newTotalMTDRevenue = Object.values(
                            newDailyRecording,
                          ).reduce(
                            (acc: number, curr: DailySalesData) =>
                              acc + (Number(curr.revenue) || 0),
                            0,
                          );
                          const newTotalMTDCovers = Object.values(
                            newDailyRecording,
                          ).reduce(
                            (acc: number, curr: DailySalesData) =>
                              acc + (Number(curr.covers) || 0),
                            0,
                          );

                          onUpdate({
                            ...data,
                            dailyRecording: newDailyRecording,
                            sales: {
                              ...(data.sales || {}),
                              dailyRecording: newDailyRecording,
                              revenue: newTotalMTDRevenue,
                              covers: newTotalMTDCovers,
                              todayRevenue: 0,
                              todayCovers: 0,
                            },
                            revenue: newTotalMTDRevenue,
                            covers: newTotalMTDCovers,
                            todayRevenue: 0,
                            todayCovers: 0,
                            todayLunchRevenue: 0,
                            todayLunchCovers: 0,
                            todayDinnerRevenue: 0,
                            todayDinnerCovers: 0,
                            todayDiscountLunch: 0,
                            todayDiscountDinner: 0,
                          });
                          setShowSuccess({
                            title: "DATA DIHAPUS",
                            message: `Seluruh data sales untuk tanggal ${filters.startDate} telah dihapus.`,
                          });
                          setShowConfirm(null);
                        },
                      });
                    }}
                    className="text-[9px] font-black text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-2 group px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg uppercase tracking-widest"
                  >
                    <i className="fas fa-trash-alt group-hover:-rotate-12 transition-transform"></i>{" "}
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/30 custom-scrollbar">
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-slate-900/80 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                <tr>
                  <th className="p-4">Session</th>
                  <th className="p-4 text-right">Revenue</th>
                  <th className="p-4 text-center">Pax</th>
                  <th className="p-4 text-right text-rose-500">Discount</th>
                  <th className="p-4 text-right">Avg Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="text-[10px] bg-blue-500/5">
                  <td className="p-4 font-black text-blue-400 uppercase flex items-center gap-2">
                    <i className="fas fa-sun text-[8px]"></i> Lunch Session
                  </td>
                  <td className="p-4 text-right text-white font-bold">
                    Rp {liveTodayStats.lunchRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center text-slate-300">
                    {liveTodayStats.lunchCov}
                  </td>
                  <td className="p-4 text-right text-rose-400 font-bold">
                    Rp {liveTodayStats.lunchDisc.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right text-blue-300">
                    Rp{" "}
                    {(liveTodayStats.lunchCov
                      ? Math.round(
                          liveTodayStats.lunchRev / liveTodayStats.lunchCov,
                        )
                      : 0
                    ).toLocaleString('id-ID')}
                  </td>
                </tr>
                <tr className="text-[10px] bg-orange-500/5">
                  <td className="p-4 font-black text-orange-400 uppercase flex items-center gap-2">
                    <i className="fas fa-moon text-[8px]"></i> Dinner Session
                  </td>
                  <td className="p-4 text-right text-white font-bold">
                    Rp {liveTodayStats.dinnerRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center text-slate-300">
                    {liveTodayStats.dinnerCov}
                  </td>
                  <td className="p-4 text-right text-rose-400 font-bold">
                    Rp {liveTodayStats.dinnerDisc.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right text-orange-300">
                    Rp{" "}
                    {(liveTodayStats.dinnerCov
                      ? Math.round(
                          liveTodayStats.dinnerRev / liveTodayStats.dinnerCov,
                        )
                      : 0
                    ).toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-900/50 border-t border-white/10 font-black">
                <tr className="text-[10px]">
                  <td className="p-4 text-emerald-400 uppercase tracking-widest font-black">
                    Today Cumulative
                  </td>
                  <td className="p-4 text-right text-white">
                    Rp {liveTodayStats.rev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center text-slate-200">
                    {liveTodayStats.cov}
                  </td>
                  <td className="p-4 text-right text-rose-500">
                    Rp {liveTodayStats.disc.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-right text-emerald-400">
                    Rp {liveTodayStats.avgCheck.toLocaleString('id-ID')}
                  </td>
                </tr>
                <tr className="text-[10px] bg-slate-900/20 border-t border-white/5 opacity-60">
                  <td className="p-4 text-slate-500 uppercase tracking-widest font-black text-[8px]">
                    Live MTD Daily Avg
                  </td>
                  <td className="p-4 text-right text-white/70">
                    Rp {avgTotalRev.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center text-slate-600">-</td>
                  <td className="p-4 text-right text-rose-500/40">-</td>
                  <td className="p-4 text-right text-slate-500 italic">
                    Avg Chk: Rp {mtdAvgCheck.toLocaleString('id-ID')}
                  </td>
                </tr>
                <tr className="text-[8px] bg-slate-900/10 border-t border-white/5 opacity-40">
                  <td className="p-4 text-slate-600 uppercase tracking-widest font-bold">
                    L/D Session Avg
                  </td>
                  <td className="p-4 text-right text-slate-500" colSpan={4}>
                    Lunch:{" "}
                    <span className="text-blue-400/60 font-black">
                      Rp {avgLunchRev.toLocaleString('id-ID')}
                    </span>{" "}
                    | Dinner:{" "}
                    <span className="text-orange-400/60 font-black ml-2">
                      Rp {avgDinnerRev.toLocaleString('id-ID')}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* REKAPAN DISCOUNT SECTION */}
          {todayDiscountBreakdown.length > 0 && (
            <div className="mt-8 border-t border-white/10 pt-6 space-y-4">
              <h3 className="text-xs font-black uppercase text-rose-400 flex items-center gap-2">
                <i className="fas fa-percentage"></i> Rekapan Discount Harian
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/30 custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="p-4">Kategori Discount</th>
                      <th className="p-4 text-right text-rose-500">Total Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[10px]">
                    {todayDiscountBreakdown.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-4 font-black text-slate-300">{row.name}</td>
                        <td className="p-4 font-black text-rose-400 text-right">Rp {row.total.toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900/50 border-t border-white/10 font-black text-[10px]">
                    <tr>
                      <td className="p-4 text-white">TOTAL DISCOUNT</td>
                      <td className="p-4 text-rose-500 text-right">
                        Rp {todayDiscountBreakdown.reduce((acc, curr) => acc + curr.total, 0).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Section removed: Sales History and Weekly OPEX moved to ReportingModule */}
        </div>
      </div>
      {/* Guest Satisfaction Reminder Modal before Daily Revenue Closing Submit */}
      <AnimatePresence>
        {showGuestSatReminder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="bg-gradient-to-b from-slate-900 via-amber-950/20 to-slate-950 border-2 border-amber-500/50 p-6 sm:p-7 rounded-3xl shadow-[0_0_35px_rgba(245,158,11,0.25)] max-w-md w-full text-center space-y-5"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-400/40 shadow-inner">
                  <i className="fas fa-face-smile text-3xl text-amber-400"></i>
                </div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                  CLOSING REVENUE REMINDER
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-base sm:text-lg font-black text-amber-300 uppercase tracking-tight leading-snug">
                  &ldquo;JANGAN LUPA KALAU ADA GUEST SATISFACTION INPUT DULU YAA!!!!&rdquo;
                </h3>
                <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                  Pastikan data kompensasi / komplain Guest Satisfaction hari ini sudah diinput agar diskon tercatat lengkap.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  onClick={() => setShowGuestSatReminder(false)}
                  className="w-full sm:w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-[10px] uppercase tracking-widest transition-all border border-white/10 active:scale-95"
                >
                  <i className="fas fa-arrow-left mr-1.5"></i>
                  Cek Dulu
                </button>
                <button
                  onClick={() => {
                    setShowGuestSatReminder(false);
                    handleSyncData();
                  }}
                  className="w-full sm:w-1/2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-amber-500/30 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <i className="fas fa-check-circle text-xs"></i>
                  <span>Lanjutkan Submit</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-emerald-500/30 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <i className="fas fa-check text-4xl text-emerald-400"></i>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">
                  {showSuccess.title}
                </h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                  {showSuccess.message}
                </p>
              </div>
              <button
                onClick={() => setShowSuccess(null)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
              >
                MENGERTI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
                <i className="fas fa-exclamation-triangle text-4xl text-red-400"></i>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  {showConfirm.title}
                </h3>
                <p className="text-slate-400 text-sm font-medium">
                  {showConfirm.message}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={showConfirm.onConfirm}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SalesModule;
