import React, { useState, useEffect, useMemo } from 'react';
import { OutletConfig, PromoSettings, BankingPromoItem, StrategyMenuItem, StrategyCategory, StrategySession } from '../types';
import { 
  DEFAULT_OUTLET_CONFIGS, 
  OUTLET_AREAS, 
  OUTLET_TYPES, 
  MONTH_NAMES, 
  saveActiveOutletConfigs, 
  getActiveOutletConfigs, 
  markOutletDeleted,
  DEFAULT_BANKING_PROMOS,
  DEFAULT_STRATEGY_MENU_CATALOG,
  getStoredStrategyCatalog,
  saveStoredStrategyCatalog
} from '../constants';
import { doc, getDoc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOutletsChange?: (outlets: OutletConfig[]) => void;
  initialTab?: 'OUTLETS' | 'PROMO' | 'STRATEGI';
}

export const OutletControlModal: React.FC<Props> = ({
  isOpen,
  onClose,
  showToast,
  onOutletsChange,
  initialTab = 'OUTLETS'
}) => {
  const [activeTab, setActiveTab] = useState<'OUTLETS' | 'PROMO' | 'STRATEGI'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Outlet State
  const [outletConfigs, setOutletConfigs] = useState<OutletConfig[]>(() => getActiveOutletConfigs());
  const [outletSearch, setOutletSearch] = useState('');
  const [outletAreaFilter, setOutletAreaFilter] = useState('ALL');
  const [outletTypeFilter, setOutletTypeFilter] = useState('ALL');

  // Modal Sub-States
  const [showAddModal, setShowAddModal] = useState(false);
  const [outletToDelete, setOutletToDelete] = useState<OutletConfig | null>(null);

  // Edit Outlet State
  const [outletToEdit, setOutletToEdit] = useState<OutletConfig | null>(null);
  const [editOutletName, setEditOutletName] = useState('');
  const [editOutletArea, setEditOutletArea] = useState('JAKARTA');
  const [isEditCustomArea, setIsEditCustomArea] = useState(false);
  const [editCustomAreaText, setEditCustomAreaText] = useState('');
  const [editOutletType, setEditOutletType] = useState('REGULAR OUTLET');
  const [isEditCustomType, setIsEditCustomType] = useState(false);
  const [editCustomTypeText, setEditCustomTypeText] = useState('');

  // Add Form State
  const [newOutletName, setNewOutletName] = useState('');
  const [newOutletArea, setNewOutletArea] = useState('JAKARTA');
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [customAreaText, setCustomAreaText] = useState('');
  const [newOutletType, setNewOutletType] = useState('REGULAR OUTLET');
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeText, setCustomTypeText] = useState('');

  // Outlet selection for Promo Banking (Scoped per outlet)
  const [selectedPromoOutlet, setSelectedPromoOutlet] = useState<string>('ALL');

  // Promo Settings State
  const [promoSettings, setPromoSettings] = useState<PromoSettings>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('APP_PROMO_SETTINGS') : null;
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { bankPromoEnabled: true, promoEnabled: true };
  });

  // Custom Promos Management State
  const [bankPromosList, setBankPromosList] = useState<BankingPromoItem[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('APP_PROMO_SETTINGS') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.customBankPromos) && parsed.customBankPromos.length > 0) {
          return parsed.customBankPromos;
        }
      }
    } catch (e) {}
    return DEFAULT_BANKING_PROMOS;
  });

  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [promoNameInput, setPromoNameInput] = useState('');
  const [promoTermsInput, setPromoTermsInput] = useState('');
  const [promoPeriodStartInput, setPromoPeriodStartInput] = useState('');
  const [promoPeriodEndInput, setPromoPeriodEndInput] = useState('');
  const [promoIsActiveInput, setPromoIsActiveInput] = useState(true);
  const [promoTargetOutlets, setPromoTargetOutlets] = useState<string[]>(['ALL']);
  const [promoToDelete, setPromoToDelete] = useState<BankingPromoItem | null>(null);

  const [promoPeriodMonth, setPromoPeriodMonth] = useState<number>(new Date().getMonth());
  const [promoPeriodYear, setPromoPeriodYear] = useState<number>(new Date().getFullYear());
  const [promoScope, setPromoScope] = useState<'PERIOD' | 'GLOBAL'>('PERIOD');

  // Strategy Catalog State (Kategori Menu Penyeimbang & Percepatan)
  const [strategyCatalog, setStrategyCatalog] = useState<StrategyMenuItem[]>(() => getStoredStrategyCatalog());
  const [strategySearch, setStrategySearch] = useState('');
  const [strategyCategoryFilter, setStrategyCategoryFilter] = useState<'ALL' | 'PENYEIMBANG' | 'PERCEPATAN'>('ALL');
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [stratNameInput, setStratNameInput] = useState('');
  const [stratCategoryInput, setStratCategoryInput] = useState<StrategyCategory>('PENYEIMBANG');
  const [stratPriceInput, setStratPriceInput] = useState<number | string>('');
  const [stratSessionInput, setStratSessionInput] = useState<StrategySession>('BOTH');
  const [stratIsActiveInput, setStratIsActiveInput] = useState(true);
  const [strategyToDelete, setStrategyToDelete] = useState<StrategyMenuItem | null>(null);

  // Load and Listen to Firestore configurations
  useEffect(() => {
    // 1. Listen to outlet_control
    const outletDocRef = doc(db, 'system_config', 'outlet_control');
    const unsubOutlets = onSnapshot(outletDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.outlets) && data.outlets.length > 0) {
          setOutletConfigs(data.outlets);
          saveActiveOutletConfigs(data.outlets);
          onOutletsChange?.(data.outlets);
        }
      }
    }, (err) => {
      console.warn('[OutletControl] Listener notice for outlet_control:', err);
    });

    // 2. Listen to promo_settings
    const promoDocRef = doc(db, 'system_config', 'promo_settings');
    const unsubPromo = onSnapshot(promoDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPromoSettings(data as PromoSettings);
        if (Array.isArray(data.customBankPromos) && data.customBankPromos.length > 0) {
          setBankPromosList(data.customBankPromos);
        }
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('APP_PROMO_SETTINGS', JSON.stringify(data));
            window.dispatchEvent(new CustomEvent('appPromoSettingsChanged', { detail: data }));
          }
        } catch (e) {}
      }
    }, (err) => {
      console.warn('[OutletControl] Listener notice for promo_settings:', err);
    });

    // 3. Listen to strategy_catalog
    const stratDocRef = doc(db, 'system_config', 'strategy_catalog');
    const unsubStrat = onSnapshot(stratDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.items) && data.items.length > 0) {
          setStrategyCatalog(data.items);
          saveStoredStrategyCatalog(data.items);
        }
      }
    }, (err) => {
      console.warn('[OutletControl] Listener notice for strategy_catalog:', err);
    });

    return () => {
      unsubOutlets();
      unsubPromo();
      unsubStrat();
    };
  }, []);

  // Filtered outlets
  const filteredOutlets = useMemo(() => {
    return outletConfigs.filter(cfg => {
      const matchSearch = !outletSearch || cfg.name.toLowerCase().includes(outletSearch.toLowerCase());
      const matchArea = outletAreaFilter === 'ALL' || cfg.area === outletAreaFilter;
      const matchType = outletTypeFilter === 'ALL' || cfg.type === outletTypeFilter;
      return matchSearch && matchArea && matchType;
    });
  }, [outletConfigs, outletSearch, outletAreaFilter, outletTypeFilter]);

  // Handlers for Outlets
  const handleAddNewOutlet = async () => {
    const finalName = newOutletName.trim().toUpperCase();
    if (!finalName) {
      showToast?.('Nama outlet tidak boleh kosong', 'error');
      return;
    }
    const finalArea = (isCustomArea ? customAreaText.trim().toUpperCase() : newOutletArea) || 'JAKARTA';
    const finalType = (isCustomType ? customTypeText.trim().toUpperCase() : newOutletType) || 'REGULAR OUTLET';

    if (outletConfigs.some(o => o.name === finalName)) {
      showToast?.(`Outlet ${finalName} sudah terdaftar!`, 'error');
      return;
    }

    const newConfig: OutletConfig = {
      id: finalName,
      name: finalName,
      area: finalArea,
      type: finalType,
      createdAt: new Date().toISOString()
    };

    const updated = [...outletConfigs, newConfig];
    setOutletConfigs(updated);
    saveActiveOutletConfigs(updated);
    onOutletsChange?.(updated);

    try {
      const ref = doc(db, 'system_config', 'outlet_control');
      await setDoc(ref, { outlets: updated, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('[OutletControl] Failed to write outlet to cloud:', e);
    }

    setShowAddModal(false);
    setNewOutletName('');
    setCustomAreaText('');
    setCustomTypeText('');
    setIsCustomArea(false);
    setIsCustomType(false);
    showToast?.(`Berhasil mendaftarkan outlet ${finalName}`, 'success');
  };

  const handleConfirmDeleteOutlet = async () => {
    if (!outletToDelete) return;
    markOutletDeleted(outletToDelete.name);
    const updated = outletConfigs.filter(o => o.name !== outletToDelete.name && o.id !== outletToDelete.id);
    setOutletConfigs(updated);
    saveActiveOutletConfigs(updated);
    onOutletsChange?.(updated);

    try {
      const ref = doc(db, 'system_config', 'outlet_control');
      await setDoc(ref, { outlets: updated, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('[OutletControl] Failed to delete outlet on cloud:', e);
    }

    try {
      const outletDocRef = doc(db, 'dashboards', outletToDelete.name);
      await setDoc(outletDocRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
      try {
        await deleteDoc(outletDocRef);
      } catch (delErr) {
        // Ignored if rules prevent hard delete, isDeleted: true is set
      }
    } catch (e) {
      console.warn('[OutletControl] Failed to mark dashboard deleted on cloud:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('appOutletConfigsChanged', { detail: updated }));
      window.dispatchEvent(new CustomEvent('appOutletDeleted', { detail: outletToDelete.name }));
    }

    showToast?.(`Outlet ${outletToDelete.name} berhasil dihapus dari sistem`, 'success');
    setOutletToDelete(null);
  };

  const handleStartEdit = (outlet: OutletConfig) => {
    setOutletToEdit(outlet);
    setEditOutletName(outlet.name);

    if (OUTLET_AREAS.includes(outlet.area)) {
      setEditOutletArea(outlet.area);
      setIsEditCustomArea(false);
      setEditCustomAreaText('');
    } else {
      setEditOutletArea(outlet.area);
      setIsEditCustomArea(true);
      setEditCustomAreaText(outlet.area);
    }

    if (OUTLET_TYPES.includes(outlet.type)) {
      setEditOutletType(outlet.type);
      setIsEditCustomType(false);
      setEditCustomTypeText('');
    } else {
      setEditOutletType(outlet.type);
      setIsEditCustomType(true);
      setEditCustomTypeText(outlet.type);
    }
  };

  const handleSaveEditOutlet = async () => {
    if (!outletToEdit) return;

    const finalArea = (isEditCustomArea ? editCustomAreaText.trim().toUpperCase() : editOutletArea) || 'JAKARTA';
    const finalType = (isEditCustomType ? editCustomTypeText.trim().toUpperCase() : editOutletType) || 'REGULAR OUTLET';
    const finalName = editOutletName.trim().toUpperCase() || outletToEdit.name;

    const updated = outletConfigs.map(o => {
      if (o.id === outletToEdit.id || o.name === outletToEdit.name) {
        return {
          ...o,
          name: finalName,
          area: finalArea,
          type: finalType
        };
      }
      return o;
    });

    setOutletConfigs(updated);
    saveActiveOutletConfigs(updated);
    onOutletsChange?.(updated);

    try {
      const ref = doc(db, 'system_config', 'outlet_control');
      await setDoc(ref, { outlets: updated, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('[OutletControl] Failed to update outlet on cloud:', e);
    }

    showToast?.(`Outlet ${finalName} berhasil diperbarui (Area: ${finalArea}, Jenis: ${finalType})`, 'success');
    setOutletToEdit(null);
  };

  // Promo Handlers
  const currentPeriodKey = `${promoPeriodYear}-${(promoPeriodMonth + 1).toString().padStart(2, '0')}`;
  const periodSetting = promoSettings?.periodSettings?.[currentPeriodKey];
  const isPeriodBankPromoActive = periodSetting && typeof periodSetting.bankPromoEnabled === 'boolean'
    ? periodSetting.bankPromoEnabled 
    : (promoSettings?.bankPromoEnabled ?? true);
  const isPeriodPromoActive = periodSetting && typeof periodSetting.promoEnabled === 'boolean'
    ? periodSetting.promoEnabled 
    : (promoSettings?.promoEnabled ?? true);
  const isGlobalBankPromoActive = promoSettings?.bankPromoEnabled ?? true;
  const isGlobalPromoActive = promoSettings?.promoEnabled ?? true;

  const activeBankPromoDisplay = promoScope === 'GLOBAL' ? isGlobalBankPromoActive : isPeriodBankPromoActive;
  const activePromoDisplay = promoScope === 'GLOBAL' ? isGlobalPromoActive : isPeriodPromoActive;

  const syncPromoSettingsEverywhere = async (newSettings: PromoSettings, targetPromoList: BankingPromoItem[]) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('APP_PROMO_SETTINGS', JSON.stringify(newSettings));
        window.dispatchEvent(new CustomEvent('appPromoSettingsChanged', { detail: newSettings }));
      }
      const configRef = doc(db, 'system_config', 'promo_settings');
      await setDoc(configRef, { ...newSettings, customBankPromos: targetPromoList, updatedAt: new Date().toISOString() }, { merge: true });

      // Realtime push to all outlet documents in dashboards collection
      for (const out of outletConfigs) {
        try {
          const outletDocRef = doc(db, 'dashboards', out.name);
          await setDoc(outletDocRef, {
            promoSettings: {
              ...newSettings,
              customBankPromos: targetPromoList
            },
            bankingPromos: targetPromoList
          }, { merge: true });
        } catch (err) {}
      }
    } catch (err) {
      console.warn('[OutletControl] Sync promo error:', err);
    }
  };

  const handleToggleBankPromo = async (newValue: boolean) => {
    let updated: PromoSettings;
    if (promoScope === 'GLOBAL') {
      updated = {
        ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        bankPromoEnabled: newValue,
        customBankPromos: bankPromosList
      };
    } else {
      const curr = promoSettings?.periodSettings?.[currentPeriodKey] || {
        bankPromoEnabled: promoSettings?.bankPromoEnabled ?? true,
        promoEnabled: promoSettings?.promoEnabled ?? true
      };
      updated = {
        ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        customBankPromos: bankPromosList,
        periodSettings: {
          ...(promoSettings?.periodSettings || {}),
          [currentPeriodKey]: {
            ...curr,
            bankPromoEnabled: newValue
          }
        }
      };
    }

    setPromoSettings(updated);
    await syncPromoSettingsEverywhere(updated, bankPromosList);

    const scopeLabel = promoScope === 'GLOBAL' ? 'Seluruh Periode' : `Periode ${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`;
    const targetLabel = selectedPromoOutlet === 'ALL' ? 'Semua Outlet' : `Outlet ${selectedPromoOutlet}`;
    showToast?.(`Bank Promo berhasil di-${newValue ? 'ON-kan (Aktif)' : 'OFF-kan (Nonaktif)'} untuk ${targetLabel} (${scopeLabel})`, 'success');
  };

  const handleTogglePromo = async (newValue: boolean) => {
    let updated: PromoSettings;
    if (promoScope === 'GLOBAL') {
      updated = {
        ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        promoEnabled: newValue,
        customBankPromos: bankPromosList
      };
    } else {
      const curr = promoSettings?.periodSettings?.[currentPeriodKey] || {
        bankPromoEnabled: promoSettings?.bankPromoEnabled ?? true,
        promoEnabled: promoSettings?.promoEnabled ?? true
      };
      updated = {
        ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
        customBankPromos: bankPromosList,
        periodSettings: {
          ...(promoSettings?.periodSettings || {}),
          [currentPeriodKey]: {
            ...curr,
            promoEnabled: newValue
          }
        }
      };
    }

    setPromoSettings(updated);
    await syncPromoSettingsEverywhere(updated, bankPromosList);

    const scopeLabel = promoScope === 'GLOBAL' ? 'Seluruh Periode' : `Periode ${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`;
    const targetLabel = selectedPromoOutlet === 'ALL' ? 'Semua Outlet' : `Outlet ${selectedPromoOutlet}`;
    showToast?.(`Diskon Promo berhasil di-${newValue ? 'ON-kan (Aktif)' : 'OFF-kan (Nonaktif)'} untuk ${targetLabel} (${scopeLabel})`, 'success');
  };

  // Custom Promo Bank Handlers (Scoped per Target Outlets)
  const handleOpenAddPromoModal = () => {
    setEditingPromoId(null);
    setPromoNameInput('');
    setPromoTermsInput('');
    setPromoPeriodStartInput('');
    setPromoPeriodEndInput('');
    setPromoIsActiveInput(true);
    setPromoTargetOutlets(['ALL']);
    setShowPromoModal(true);
  };

  const handleStartEditPromo = (promo: BankingPromoItem) => {
    setEditingPromoId(promo.id);
    setPromoNameInput(promo.name);
    setPromoTermsInput(promo.terms || '');
    setPromoPeriodStartInput(promo.periodStart || promo.startDate || '');
    setPromoPeriodEndInput(promo.periodEnd || promo.endDate || '');
    setPromoIsActiveInput(promo.isActive);
    setPromoTargetOutlets(promo.targetOutlets && promo.targetOutlets.length > 0 ? promo.targetOutlets : ['ALL']);
    setShowPromoModal(true);
  };

  const handleSavePromo = async () => {
    const finalName = promoNameInput.trim();
    if (!finalName) {
      showToast?.('Nama promo bank wajib diisi', 'error');
      return;
    }
    if (promoTargetOutlets.length === 0) {
      showToast?.('Pilih minimal 1 outlet untuk menerapkan promo ini', 'error');
      return;
    }

    const currentList = [...bankPromosList];
    let updatedList: BankingPromoItem[];
    const isTargetAll = promoTargetOutlets.includes('ALL') || promoTargetOutlets.length === outletConfigs.length;
    const finalTargetOutlets = isTargetAll ? ['ALL'] : promoTargetOutlets;

    const promoItem: BankingPromoItem = {
      id: editingPromoId || `promo_${Date.now()}`,
      name: finalName,
      terms: promoTermsInput.trim(),
      periodStart: promoPeriodStartInput || undefined,
      periodEnd: promoPeriodEndInput || undefined,
      isActive: promoIsActiveInput,
      targetOutlets: finalTargetOutlets
    };

    if (editingPromoId) {
      updatedList = currentList.map(p => p.id === editingPromoId ? promoItem : p);
    } else {
      updatedList = [...currentList, promoItem];
    }

    setBankPromosList(updatedList);
    const updatedSettings: PromoSettings = {
      ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
      customBankPromos: updatedList
    };
    setPromoSettings(updatedSettings);

    await syncPromoSettingsEverywhere(updatedSettings, updatedList);

    setShowPromoModal(false);
    setEditingPromoId(null);
    setPromoNameInput('');
    setPromoTermsInput('');
    setPromoPeriodStartInput('');
    setPromoPeriodEndInput('');
    setPromoIsActiveInput(true);
    setPromoTargetOutlets(['ALL']);

    const targetLabel = isTargetAll ? 'Semua Outlet' : `${finalTargetOutlets.length} Outlet Terpilih`;
    showToast?.(`Promo ${finalName} berhasil disimpan dan diterapkan untuk ${targetLabel}!`, 'success');
  };

  const handleTogglePromoActive = async (promoId: string) => {
    const updatedList = bankPromosList.map(p => p.id === promoId ? { ...p, isActive: !p.isActive } : p);
    setBankPromosList(updatedList);

    const updatedSettings: PromoSettings = {
      ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
      customBankPromos: updatedList
    };
    setPromoSettings(updatedSettings);

    await syncPromoSettingsEverywhere(updatedSettings, updatedList);

    const promoItem = updatedList.find(p => p.id === promoId);
    showToast?.(`Promo ${promoItem?.name || ''} berhasil di-${promoItem?.isActive ? 'Aktifkan' : 'Nonaktifkan'}!`, 'success');
  };

  const handleConfirmDeletePromo = async () => {
    if (!promoToDelete) return;
    const updatedList = bankPromosList.filter(p => p.id !== promoToDelete.id);
    setBankPromosList(updatedList);

    const updatedSettings: PromoSettings = {
      ...(promoSettings || { bankPromoEnabled: true, promoEnabled: true }),
      customBankPromos: updatedList
    };
    setPromoSettings(updatedSettings);

    await syncPromoSettingsEverywhere(updatedSettings, updatedList);

    showToast?.(`Promo ${promoToDelete.name} berhasil dihapus dari sistem!`, 'success');
    setPromoToDelete(null);
  };

  // Strategy Catalog Handlers
  const syncStrategyCatalogEverywhere = async (newList: StrategyMenuItem[]) => {
    try {
      saveStoredStrategyCatalog(newList);
      const catRef = doc(db, 'system_config', 'strategy_catalog');
      await setDoc(catRef, { items: newList, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn('[OutletControl] Sync strategy catalog error:', err);
    }
  };

  const handleOpenAddStrategyModal = () => {
    setEditingStrategyId(null);
    setStratNameInput('');
    setStratCategoryInput('PENYEIMBANG');
    setStratPriceInput('');
    setStratSessionInput('BOTH');
    setStratIsActiveInput(true);
    setShowStrategyModal(true);
  };

  const handleStartEditStrategy = (item: StrategyMenuItem) => {
    setEditingStrategyId(item.id);
    setStratNameInput(item.name);
    setStratCategoryInput(item.category);
    setStratPriceInput(item.price);
    setStratSessionInput(item.session || 'BOTH');
    setStratIsActiveInput(item.isActive);
    setShowStrategyModal(true);
  };

  const handleSaveStrategyItem = async () => {
    const finalName = stratNameInput.trim();
    if (!finalName) {
      showToast?.('Nama menu wajib diisi', 'error');
      return;
    }
    const finalPrice = Math.max(0, parseInt(String(stratPriceInput).replace(/[^0-9]/g, ''), 10) || 0);
    if (finalPrice <= 0) {
      showToast?.('Harga menu harus lebih besar dari 0', 'error');
      return;
    }

    const currentList = [...strategyCatalog];
    let updatedList: StrategyMenuItem[];

    const itemObj: StrategyMenuItem = {
      id: editingStrategyId || `strat_${Date.now()}`,
      name: finalName,
      category: stratCategoryInput,
      price: finalPrice,
      session: stratSessionInput,
      isActive: stratIsActiveInput,
      createdAt: new Date().toISOString().split('T')[0]
    };

    if (editingStrategyId) {
      updatedList = currentList.map(it => it.id === editingStrategyId ? itemObj : it);
    } else {
      updatedList = [itemObj, ...currentList];
    }

    setStrategyCatalog(updatedList);
    await syncStrategyCatalogEverywhere(updatedList);

    setShowStrategyModal(false);
    setEditingStrategyId(null);
    setStratNameInput('');
    setStratPriceInput('');
    showToast?.(`Menu "${finalName}" (Kategori: ${stratCategoryInput}, Rp ${finalPrice.toLocaleString('id-ID')}) berhasil disimpan & otomatis masuk ke Fitur Strategi!`, 'success');
  };

  const handleToggleStrategyActive = async (itemId: string) => {
    const updated = strategyCatalog.map(it => it.id === itemId ? { ...it, isActive: !it.isActive } : it);
    setStrategyCatalog(updated);
    await syncStrategyCatalogEverywhere(updated);
    const it = updated.find(x => x.id === itemId);
    showToast?.(`Menu "${it?.name}" berhasil di-${it?.isActive ? 'Aktifkan' : 'Nonaktifkan'}!`, 'success');
  };

  const handleConfirmDeleteStrategy = async () => {
    if (!strategyToDelete) return;
    const updated = strategyCatalog.filter(it => it.id !== strategyToDelete.id);
    setStrategyCatalog(updated);
    await syncStrategyCatalogEverywhere(updated);
    showToast?.(`Menu "${strategyToDelete.name}" berhasil dihapus dari katalog!`, 'success');
    setStrategyToDelete(null);
  };

  // Filtered Strategy Catalog
  const filteredStrategyCatalog = useMemo(() => {
    return strategyCatalog.filter(it => {
      const matchSearch = !strategySearch || it.name.toLowerCase().includes(strategySearch.toLowerCase());
      const matchCategory = strategyCategoryFilter === 'ALL' || it.category === strategyCategoryFilter;
      return matchSearch && matchCategory;
    });
  }, [strategyCatalog, strategySearch, strategyCategoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-white/15 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* HEADER */}
        <div className="p-5 sm:p-7 bg-slate-950/80 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl shadow-lg shadow-amber-500/10">
              <i className="fas fa-store-alt"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  SYSTEM PORTAL
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                  OUTLET CONTROL
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Pusat Kendali Master Outlet & Pengaturan Fitur Promo Sistem
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/10 flex items-center gap-2"
            >
              <i className="fas fa-times text-xs"></i>
              Tutup
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex border-b border-white/10 bg-slate-950/40 px-6 pt-3 gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('OUTLETS')}
            className={`px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'OUTLETS'
                ? 'bg-slate-900 text-amber-400 border-amber-400 shadow-md'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-store"></i>
            Master Outlet ({outletConfigs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PROMO')}
            className={`px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'PROMO'
                ? 'bg-slate-900 text-indigo-400 border-indigo-400 shadow-md'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-tags"></i>
            Kontrol Bank & Diskon Promo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('STRATEGI')}
            className={`px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'STRATEGI'
                ? 'bg-slate-900 text-purple-400 border-purple-400 shadow-md'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            <i className="fas fa-chess"></i>
            Menu Strategi ({strategyCatalog.length})
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-5 sm:p-7 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OUTLETS MANAGEMENT */}
          {activeTab === 'OUTLETS' && (
            <div className="space-y-6 animate-fade-in">
              {/* Top Controls: Search, Filter & Add Button */}
              <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-950/50 p-4 rounded-2xl border border-white/10">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px]">
                    <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                    <input
                      type="text"
                      value={outletSearch}
                      onChange={(e) => setOutletSearch(e.target.value)}
                      placeholder="Cari nama outlet..."
                      className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white font-medium outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Area Filter */}
                  <select
                    value={outletAreaFilter}
                    onChange={(e) => setOutletAreaFilter(e.target.value)}
                    className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="ALL">Semua Area</option>
                    {OUTLET_AREAS.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>

                  {/* Type Filter */}
                  <select
                    value={outletTypeFilter}
                    onChange={(e) => setOutletTypeFilter(e.target.value)}
                    className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="ALL">Semua Jenis</option>
                    {OUTLET_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <i className="fas fa-plus-circle text-sm"></i>
                  Tambah Outlet Baru
                </button>
              </div>

              {/* Outlet List Table */}
              <div className="bg-slate-950/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/90 text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-white/10">
                        <th className="py-3.5 px-5 text-center w-12">No</th>
                        <th className="py-3.5 px-5">Nama Outlet</th>
                        <th className="py-3.5 px-5">Wilayah Area</th>
                        <th className="py-3.5 px-5">Klasifikasi Jenis</th>
                        <th className="py-3.5 px-5 text-center">Status</th>
                        <th className="py-3.5 px-5 text-center w-28">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-slate-200">
                      {filteredOutlets.map((outlet, idx) => (
                        <tr key={outlet.id || outlet.name} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-3.5 px-5 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                          <td className="py-3.5 px-5">
                            <div className="font-black text-white text-xs sm:text-sm tracking-tight flex items-center gap-2">
                              <i className="fas fa-building text-amber-400 text-xs"></i>
                              {outlet.name}
                            </div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                              outlet.area === 'JAKARTA' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
                              outlet.area === 'TANGGERANG' ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' :
                              outlet.area === 'BEKASI' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                              outlet.area === 'BANDUNG' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                              'bg-slate-500/10 border-slate-500/30 text-slate-300'
                            }`}>
                              {outlet.area}
                            </span>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                              outlet.type === 'PRIME OUTLET' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                              outlet.type === 'FOOD COURT' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
                              outlet.type === 'INDONESIAN' ? 'bg-teal-500/10 border-teal-500/30 text-teal-300' :
                              'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                            }`}>
                              {outlet.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Aktif
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(outlet)}
                                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-amber-500/30 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                                title="Ubah Area dan Jenis Outlet"
                              >
                                <i className="fas fa-edit text-[9px]"></i>
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setOutletToDelete(outlet)}
                                className="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-rose-500/30 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                                title="Hapus outlet dari sistem"
                              >
                                <i className="fas fa-trash-alt text-[9px]"></i>
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredOutlets.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 font-bold uppercase text-xs">
                            Tidak ada outlet yang sesuai dengan filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROMO & BANK TOGGLE */}
          {activeTab === 'PROMO' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-slate-950/60 rounded-2xl border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <i className="fas fa-sliders-h text-amber-400"></i>
                    Cakupan Pengaturan Promo & Bank
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Pilih apakah pengaturan berlaku untuk periode tertentu saja atau global seluruh periode.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-slate-900 p-2 rounded-xl border border-white/10">
                  {/* Scope Outlet */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Target Outlet:</span>
                    <select
                      value={selectedPromoOutlet}
                      onChange={(e) => setSelectedPromoOutlet(e.target.value)}
                      className="bg-slate-950 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none max-w-[160px]"
                    >
                      <option value="ALL">Semua Outlet</option>
                      {outletConfigs.map(o => (
                        <option key={o.id} value={o.name}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Periode:</span>
                    <select
                      value={promoPeriodMonth}
                      onChange={(e) => setPromoPeriodMonth(parseInt(e.target.value))}
                      className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={promoPeriodYear}
                      onChange={(e) => setPromoPeriodYear(parseInt(e.target.value))}
                      className="bg-slate-950 border border-white/10 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none"
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex rounded-lg overflow-hidden border border-white/10">
                    <button
                      type="button"
                      onClick={() => setPromoScope('PERIOD')}
                      className={`px-3 py-1.5 text-[9px] font-black uppercase transition-all ${
                        promoScope === 'PERIOD'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      Periode Terpilih
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromoScope('GLOBAL')}
                      className={`px-3 py-1.5 text-[9px] font-black uppercase transition-all ${
                        promoScope === 'GLOBAL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      Semua Periode (Global)
                    </button>
                  </div>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. BANK PROMO TOGGLE CARD */}
                <div className={`p-6 rounded-2xl border transition-all ${
                  activeBankPromoDisplay 
                    ? 'bg-gradient-to-br from-emerald-950/30 to-slate-900 border-emerald-500/30 shadow-lg shadow-emerald-950/20' 
                    : 'bg-gradient-to-br from-rose-950/20 to-slate-900 border-rose-500/20'
                }`}>
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeBankPromoDisplay ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          <i className="fas fa-credit-card"></i>
                        </div>
                        <h5 className="text-base font-black text-white uppercase tracking-tight">Bank Promo</h5>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Mencakup: <strong>Bank Mega</strong> dan <strong>Digibank by DBS</strong>.
                      </p>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                      activeBankPromoDisplay 
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    }`}>
                      {activeBankPromoDisplay ? '● AKTIF (ON)' : '○ NONAKTIF (OFF)'}
                    </span>
                  </div>

                  <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[10px] text-slate-400 leading-relaxed">
                    {activeBankPromoDisplay 
                      ? 'Tombol input transaksi Bank Mega & Digibank dan laporan dinner/closing aktif pada Daily Revenue outlet.'
                      : 'Tombol input dan rekapan Bank Mega & Digibank otomatis dinonaktifkan/disembunyikan pada Daily Revenue outlet.'}
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">
                      Target: {promoScope === 'GLOBAL' ? 'Global Seluruh Periode' : `${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleBankPromo(!activeBankPromoDisplay)}
                      className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 shadow-md ${
                        activeBankPromoDisplay
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                      }`}
                    >
                      <i className={`fas ${activeBankPromoDisplay ? 'fa-toggle-on' : 'fa-toggle-off'} text-sm`}></i>
                      {activeBankPromoDisplay ? 'Matikan (Turn OFF)' : 'Aktifkan (Turn ON)'}
                    </button>
                  </div>
                </div>

                {/* 2. PROMO DISKON TOGGLE CARD */}
                <div className={`p-6 rounded-2xl border transition-all ${
                  activePromoDisplay 
                    ? 'bg-gradient-to-br from-emerald-950/30 to-slate-900 border-emerald-500/30 shadow-lg shadow-emerald-950/20' 
                    : 'bg-gradient-to-br from-rose-950/20 to-slate-900 border-rose-500/20'
                }`}>
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activePromoDisplay ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          <i className="fas fa-percent"></i>
                        </div>
                        <h5 className="text-base font-black text-white uppercase tracking-tight">Promo & Diskon</h5>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Mencakup: <strong>Investor Promo 1-3</strong>, <strong>Management</strong>, dan <strong>Cadangan Diskon 1-3</strong>.
                      </p>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                      activePromoDisplay 
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    }`}>
                      {activePromoDisplay ? '● AKTIF (ON)' : '○ NONAKTIF (OFF)'}
                    </span>
                  </div>

                  <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[10px] text-slate-400 leading-relaxed">
                    {activePromoDisplay 
                      ? 'Input diskon promo Investor & Cadangan serta breakdown rekapan diskon aktif pada Daily Revenue outlet.'
                      : 'Input diskon promo Investor & Cadangan dinonaktifkan/disembunyikan pada Daily Revenue outlet.'}
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">
                      Target: {promoScope === 'GLOBAL' ? 'Global Seluruh Periode' : `${MONTH_NAMES[promoPeriodMonth]} ${promoPeriodYear}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTogglePromo(!activePromoDisplay)}
                      className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 shadow-md ${
                        activePromoDisplay
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                      }`}
                    >
                      <i className={`fas ${activePromoDisplay ? 'fa-toggle-on' : 'fa-toggle-off'} text-sm`}></i>
                      {activePromoDisplay ? 'Matikan (Turn OFF)' : 'Aktifkan (Turn ON)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 2: KELOLA MASTER PROMO BANKING & PILIHAN TARGET OUTLET */}
              <div className="bg-slate-950/70 p-5 sm:p-7 rounded-3xl border border-indigo-500/25 shadow-2xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        PUSAT KONTROL PROMO
                      </span>
                      <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <i className="fas fa-tags text-indigo-400"></i>
                        Daftar & Penambahan Promo Banking
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Kelola nama promo bank, syarat & ketentuan, masa aktif, dan <strong className="text-amber-400">pilih outlet mana saja yang akan ditambahkan promo</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenAddPromoModal}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-950/60 flex items-center gap-2 active:scale-95 cursor-pointer whitespace-nowrap border border-indigo-400/30"
                  >
                    <i className="fas fa-plus-circle text-sm text-indigo-200"></i>
                    <span>+ Tambah Promo Baru</span>
                  </button>
                </div>

                {/* Promo Cards List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                    <span>Daftar Promo Aktif & Konfigurasi ({bankPromosList.length})</span>
                    <span className="text-indigo-400">Tombol transaksi di Daily Revenue hanya tampil pada outlet target</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5">
                    {bankPromosList.length === 0 ? (
                      <div className="text-center py-10 bg-slate-900/40 rounded-2xl border border-white/5 space-y-2">
                        <i className="fas fa-tags text-slate-600 text-3xl"></i>
                        <p className="text-slate-400 text-xs font-bold">Belum ada promo banking yang ditambahkan.</p>
                        <p className="text-slate-500 text-[10px]">Klik tombol "+ Tambah Promo Baru" di atas untuk menambahkan promo.</p>
                      </div>
                    ) : (
                      bankPromosList.map((promo) => {
                        const isAllOutlets = !promo.targetOutlets || promo.targetOutlets.length === 0 || promo.targetOutlets.includes('ALL');
                        const targetList = isAllOutlets ? outletConfigs.map(o => o.name) : promo.targetOutlets!;

                        return (
                          <div
                            key={promo.id}
                            className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                              promo.isActive
                                ? 'bg-slate-900/90 border-indigo-500/30 shadow-md shadow-indigo-950/20'
                                : 'bg-slate-900/40 border-white/5 opacity-60'
                            }`}
                          >
                            <div className="space-y-2 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-black text-white uppercase tracking-tight">
                                  {promo.name}
                                </span>
                                <span
                                  className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                    promo.isActive
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border-white/10'
                                  }`}
                                >
                                  {promo.isActive ? '● AKTIF' : '○ NONAKTIF'}
                                </span>

                                {(promo.periodStart || promo.periodEnd || promo.startDate || promo.endDate) && (
                                  <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                                    <i className="fas fa-calendar-alt text-[8px] mr-1"></i>
                                    {promo.periodStart || promo.startDate || 'Sekarang'} s/d {promo.periodEnd || promo.endDate || 'Seterusnya'}
                                  </span>
                                )}
                              </div>

                              {promo.terms && (
                                <p className="text-[11px] text-slate-300 font-medium italic bg-slate-950/50 p-2.5 rounded-xl border border-white/5 leading-relaxed">
                                  <span className="font-bold text-indigo-300 not-italic">Syarat & Ketentuan:</span> {promo.terms}
                                </p>
                              )}

                              {/* PILIHAN OUTLET TARGET YANG DITERAPKAN */}
                              <div className="space-y-1 pt-1">
                                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <i className="fas fa-store-alt text-amber-400 text-[10px]"></i>
                                  <span>Outlet yang Diberlakukan Promo:</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isAllOutlets ? (
                                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
                                      <i className="fas fa-globe text-xs"></i>
                                      SEMUA OUTLET ({outletConfigs.length} Outlet Aktif)
                                    </span>
                                  ) : (
                                    <>
                                      <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        {targetList.length} Outlet Terpilih:
                                      </span>
                                      {targetList.map(outName => (
                                        <span
                                          key={outName}
                                          className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-950 border border-white/10 text-slate-300 flex items-center gap-1"
                                        >
                                          <i className="fas fa-store text-[8px] text-amber-400"></i>
                                          {outName}
                                        </span>
                                      ))}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => handleTogglePromoActive(promo.id)}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                  promo.isActive
                                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                                }`}
                              >
                                {promo.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStartEditPromo(promo)}
                                className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                                title="Edit Promo & Target Outlet"
                              >
                                <i className="fas fa-edit text-xs"></i>
                                <span>Edit Target</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPromoToDelete(promo)}
                                className="w-8 h-8 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center justify-center text-xs cursor-pointer transition-all active:scale-95"
                                title="Hapus Promo"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STRATEGI MENU MANAGEMENT (PENYEIMBANG & PERCEPATAN) */}
          {activeTab === 'STRATEGI' && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Card */}
              <div className="bg-gradient-to-r from-purple-950/40 via-slate-950/60 to-indigo-950/40 p-6 rounded-2xl border border-purple-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      MASTER STRATEGI REVENUE
                    </span>
                    <h4 className="text-lg font-black text-white uppercase tracking-tight">
                      Katalog Menu Penyeimbang & Percepatan
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Daftar menu dan harga yang di-input di sini otomatis terhubung ke <strong>Fitur Menu Strategi</strong> dan <strong>Rekapan Regional</strong> untuk penentuan target & actual pencapaian Lunch dan Dinner.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddStrategyModal}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-xl shadow-purple-950/40 flex items-center gap-2 active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <i className="fas fa-plus"></i>
                  <span>Tambah Menu Strategi</span>
                </button>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-950/50 p-4 rounded-2xl border border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Filter Kategori:</span>
                  {(['ALL', 'PENYEIMBANG', 'PERCEPATAN'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setStrategyCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                        strategyCategoryFilter === cat
                          ? cat === 'PENYEIMBANG'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                            : cat === 'PERCEPATAN'
                            ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                            : 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                          : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat === 'ALL' ? `Semua (${strategyCatalog.length})` : cat === 'PENYEIMBANG' ? `Penyeimbang (${strategyCatalog.filter(x => x.category === 'PENYEIMBANG').length})` : `Percepatan (${strategyCatalog.filter(x => x.category === 'PERCEPATAN').length})`}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[220px]">
                  <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                  <input
                    type="text"
                    value={strategySearch}
                    onChange={(e) => setStrategySearch(e.target.value)}
                    placeholder="Cari nama menu..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-white font-bold text-xs outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Strategy Table */}
              <div className="bg-slate-950/40 rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-white/10 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="p-4 w-12 text-center">No</th>
                        <th className="p-4">Nama Menu</th>
                        <th className="p-4 text-center">Kategori</th>
                        <th className="p-4 text-center">Rekomendasi Sesi</th>
                        <th className="p-4 text-right">Harga Jual (Rp)</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center w-28">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredStrategyCatalog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">
                            Belum ada menu strategi yang terdaftar sesuai filter.
                          </td>
                        </tr>
                      ) : (
                        filteredStrategyCatalog.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-4 text-center text-slate-500 font-bold text-xs">{idx + 1}</td>
                            <td className="p-4 font-black text-white">
                              <div className="text-xs">{item.name}</div>
                              <div className="text-[9px] text-slate-500 font-normal">ID: {item.id}</div>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                item.category === 'PENYEIMBANG'
                                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              }`}>
                                <i className={`fas ${item.category === 'PENYEIMBANG' ? 'fa-scale-balanced' : 'fa-bolt'} mr-1 text-[8px]`}></i>
                                {item.category}
                              </span>
                            </td>
                            <td className="p-4 text-center text-[10px] font-bold text-slate-300">
                              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 uppercase">
                                {item.session === 'LUNCH' ? 'Lunch Saja' : item.session === 'DINNER' ? 'Dinner Saja' : 'Lunch & Dinner'}
                              </span>
                            </td>
                            <td className="p-4 text-right font-black text-amber-400 font-mono text-sm">
                              Rp {Number(item.price || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleStrategyActive(item.id)}
                                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                                  item.isActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                }`}
                              >
                                {item.isActive ? '● AKTIF' : '○ NONAKTIF'}
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditStrategy(item)}
                                  className="w-8 h-8 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-xs cursor-pointer transition-all active:scale-95"
                                  title="Edit Menu"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStrategyToDelete(item)}
                                  className="w-8 h-8 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center justify-center text-xs cursor-pointer transition-all active:scale-95"
                                  title="Hapus Menu"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SUB-MODAL 1: ADD NEW OUTLET */}
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <i className="fas fa-store-alt text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Tambah Outlet Baru</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Daftarkan outlet baru ke dalam sistem portal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 text-left">
                {/* 1. Nama Outlet */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Nama Outlet <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newOutletName}
                    onChange={(e) => setNewOutletName(e.target.value.toUpperCase())}
                    placeholder="Contoh: SH THE BARN, SH GALAXY, SH CIHAMPELAS"
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-amber-500 focus:ring-1 ring-amber-500"
                  />
                  <span className="text-[9px] text-slate-500 mt-1 block">Otomatis diformat huruf kapital</span>
                </div>

                {/* 2. Pilihan Area */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Pilihan Wilayah Area <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    {OUTLET_AREAS.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setNewOutletArea(area);
                          setIsCustomArea(false);
                        }}
                        className={`p-2.5 rounded-xl text-xs font-black uppercase transition-all border ${
                          !isCustomArea && newOutletArea === area
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                            : 'bg-slate-950/60 text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomArea(!isCustomArea)}
                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 mt-1"
                  >
                    <i className={`fas ${isCustomArea ? 'fa-check-square' : 'fa-plus-circle'}`}></i>
                    {isCustomArea ? 'Gunakan Area Kustom:' : '+ Kustom Area Lainnya'}
                  </button>
                  {isCustomArea && (
                    <input
                      type="text"
                      value={customAreaText}
                      onChange={(e) => setCustomAreaText(e.target.value.toUpperCase())}
                      placeholder="Masukkan nama area kustom (Contoh: SURABAYA)"
                      className="w-full bg-slate-950 border border-indigo-500/50 rounded-xl px-4 py-2.5 text-white font-bold text-xs mt-2 outline-none"
                    />
                  )}
                </div>

                {/* 3. Pilihan Jenis Outlet */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Klasifikasi Jenis Outlet <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {OUTLET_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setNewOutletType(type);
                          setIsCustomType(false);
                        }}
                        className={`p-2.5 rounded-xl text-xs font-black uppercase transition-all border ${
                          !isCustomType && newOutletType === type
                            ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                            : 'bg-slate-950/60 text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomType(!isCustomType)}
                    className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-wider flex items-center gap-1.5 mt-1"
                  >
                    <i className={`fas ${isCustomType ? 'fa-check-square' : 'fa-plus-circle'}`}></i>
                    {isCustomType ? 'Gunakan Jenis Kustom:' : '+ Kustom Jenis Lainnya'}
                  </button>
                  {isCustomType && (
                    <input
                      type="text"
                      value={customTypeText}
                      onChange={(e) => setCustomTypeText(e.target.value.toUpperCase())}
                      placeholder="Masukkan jenis kustom (Contoh: EXPRESS OUTLET)"
                      className="w-full bg-slate-950 border border-purple-500/50 rounded-xl px-4 py-2.5 text-white font-bold text-xs mt-2 outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddNewOutlet}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-black uppercase text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <i className="fas fa-save"></i>
                  Simpan & Daftarkan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 2: EDIT OUTLET (AREA & JENIS OUTLET) */}
        {outletToEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                    <i className="fas fa-edit"></i>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-tight">Edit Data Outlet</h3>
                    <p className="text-[11px] text-slate-400">Ubah Area dan Jenis Outlet untuk {outletToEdit.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOutletToEdit(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* 1. Nama Outlet */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Nama Outlet
                  </label>
                  <input
                    type="text"
                    value={editOutletName}
                    onChange={(e) => setEditOutletName(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-white font-black text-sm tracking-wide outline-none focus:border-amber-500 uppercase"
                    placeholder="Contoh: SH PONDOK INDAH"
                  />
                </div>

                {/* 2. Area Outlet */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                    <span>Pilih Area yang Tersedia</span>
                    <span className="text-amber-400 font-bold">{isEditCustomArea ? editCustomAreaText || 'Kustom' : editOutletArea}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTLET_AREAS.map(area => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setEditOutletArea(area);
                          setIsEditCustomArea(false);
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-black uppercase transition-all flex items-center justify-between ${
                          !isEditCustomArea && editOutletArea === area
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md'
                            : 'bg-slate-950/60 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span>{area}</span>
                        {!isEditCustomArea && editOutletArea === area && (
                          <i className="fas fa-check-circle text-amber-400"></i>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Toggle Custom Area */}
                  <button
                    type="button"
                    onClick={() => setIsEditCustomArea(!isEditCustomArea)}
                    className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-wider flex items-center gap-1.5 mt-1"
                  >
                    <i className={`fas ${isEditCustomArea ? 'fa-check-square' : 'fa-plus-circle'}`}></i>
                    {isEditCustomArea ? 'Gunakan Area Kustom:' : '+ Kustom Area Lainnya'}
                  </button>
                  {isEditCustomArea && (
                    <input
                      type="text"
                      value={editCustomAreaText}
                      onChange={(e) => setEditCustomAreaText(e.target.value.toUpperCase())}
                      placeholder="Masukkan nama area kustom (Contoh: BALI / SURABAYA)"
                      className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-4 py-2.5 text-white font-bold text-xs mt-2 outline-none focus:border-amber-400"
                    />
                  )}
                </div>

                {/* 3. Jenis Outlet */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                    <span>Pilih Jenis Outlet yang Tersedia</span>
                    <span className="text-purple-400 font-bold">{isEditCustomType ? editCustomTypeText || 'Kustom' : editOutletType}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTLET_TYPES.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setEditOutletType(type);
                          setIsEditCustomType(false);
                        }}
                        className={`p-2.5 rounded-xl border text-[11px] font-black uppercase transition-all flex items-center justify-between ${
                          !isEditCustomType && editOutletType === type
                            ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-md'
                            : 'bg-slate-950/60 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{type}</span>
                        {!isEditCustomType && editOutletType === type && (
                          <i className="fas fa-check-circle text-purple-400"></i>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Toggle Custom Type */}
                  <button
                    type="button"
                    onClick={() => setIsEditCustomType(!isEditCustomType)}
                    className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-wider flex items-center gap-1.5 mt-1"
                  >
                    <i className={`fas ${isEditCustomType ? 'fa-check-square' : 'fa-plus-circle'}`}></i>
                    {isEditCustomType ? 'Gunakan Jenis Kustom:' : '+ Kustom Jenis Lainnya'}
                  </button>
                  {isEditCustomType && (
                    <input
                      type="text"
                      value={editCustomTypeText}
                      onChange={(e) => setEditCustomTypeText(e.target.value.toUpperCase())}
                      placeholder="Masukkan jenis kustom (Contoh: EXPRESS OUTLET)"
                      className="w-full bg-slate-950 border border-purple-500/50 rounded-xl px-4 py-2.5 text-white font-bold text-xs mt-2 outline-none focus:border-purple-400"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setOutletToEdit(null)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditOutlet}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black uppercase text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i>
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 3: CONFIRM DELETE OUTLET */}
        {outletToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl border border-rose-500/30">
                <i className="fas fa-trash-alt"></i>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Hapus Outlet Ini?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Apakah Anda yakin ingin menghapus outlet <strong className="text-rose-400 uppercase font-mono">{outletToDelete.name}</strong> ({outletToDelete.area} • {outletToDelete.type})?
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Outlet ini akan dihapus dari daftar master outlet aktif sistem portal.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOutletToDelete(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteOutlet}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-rose-950/50"
                >
                  Ya, Hapus Outlet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 4: ADD / EDIT PROMO WITH TARGET OUTLET SELECTION */}
        {showPromoModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <i className="fas fa-credit-card text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {editingPromoId ? "Edit Promo Banking & Target Outlet" : "Tambah Promo Banking Baru"}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Atur nama promo, ketentuan, dan tentukan outlet mana saja yang menerapkannya
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromoModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-5 text-left">
                {/* 1. Nama Promo */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Nama Promo Bank <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={promoNameInput}
                    onChange={(e) => setPromoNameInput(e.target.value)}
                    placeholder="Contoh: Digibank by DBS, Bank MEGA, Mandiri Livin, BCA Prioritas..."
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-white font-bold text-xs outline-none focus:border-indigo-500 focus:ring-1 ring-indigo-500"
                  />
                </div>

                {/* 2. Syarat & Ketentuan */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Syarat &amp; Ketentuan (T&amp;C)
                  </label>
                  <textarea
                    rows={2}
                    value={promoTermsInput}
                    onChange={(e) => setPromoTermsInput(e.target.value)}
                    placeholder="Contoh: All F&B Disc 15% Min. Purchase Rp 650.000 (Max Disc Rp 150.000)..."
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2 text-white font-medium text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 3. Periode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                      Periode Mulai (Opsional)
                    </label>
                    <input
                      type="date"
                      value={promoPeriodStartInput}
                      onChange={(e) => setPromoPeriodStartInput(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2 text-white font-bold text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                      Periode Selesai (Opsional)
                    </label>
                    <input
                      type="date"
                      value={promoPeriodEndInput}
                      onChange={(e) => setPromoPeriodEndInput(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2 text-white font-bold text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* 4. Status Aktif */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-white uppercase tracking-wider">Status Promo</div>
                    <div className="text-[10px] text-slate-400">Aktifkan promo ini agar langsung muncul di menu Daily Revenue outlet target</div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={promoIsActiveInput}
                      onChange={(e) => setPromoIsActiveInput(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-white/20 accent-indigo-500"
                    />
                    <span className="text-xs font-black text-indigo-300 uppercase">
                      {promoIsActiveInput ? "AKTIF" : "NONAKTIF"}
                    </span>
                  </label>
                </div>

                {/* 5. PILIHAN OUTLET TARGET (THE CORE USER REQUIREMENT) */}
                <div className="space-y-3 bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-amber-500/30">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <label className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <i className="fas fa-store-alt text-amber-400"></i>
                        PILIHAN OUTLET PENERIMA PROMO <span className="text-rose-400">*</span>
                      </label>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Pilih outlet mana saja yang akan ditambahkan promo ini (hanya outlet terpilih yang menampilkan input transaksi)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setPromoTargetOutlets(['ALL'])}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          promoTargetOutlets.includes('ALL') || promoTargetOutlets.length === outletConfigs.length
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <i className="fas fa-check-double mr-1"></i>
                        Semua Outlet
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoTargetOutlets([])}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Reset Pilihan
                      </button>
                    </div>
                  </div>

                  {/* Area Quick Select Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mr-1">Pilih Cepat Wilayah:</span>
                    {OUTLET_AREAS.map(area => {
                      const areaOutlets = outletConfigs.filter(o => o.area === area).map(o => o.name);
                      const isAreaAllSelected = areaOutlets.length > 0 && areaOutlets.every(n => promoTargetOutlets.includes('ALL') || promoTargetOutlets.includes(n));
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            setPromoTargetOutlets(prev => {
                              const current = prev.includes('ALL') ? [] : [...prev];
                              if (isAreaAllSelected) {
                                return current.filter(n => !areaOutlets.includes(n));
                              } else {
                                const next = Array.from(new Set([...current, ...areaOutlets]));
                                if (next.length === outletConfigs.length) return ['ALL'];
                                return next;
                              }
                            });
                          }}
                          className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                            isAreaAllSelected
                              ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                              : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {area} ({areaOutlets.length})
                        </button>
                      );
                    })}
                  </div>

                  {/* Outlet Cards Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto custom-scrollbar p-1">
                    {outletConfigs.map(outlet => {
                      const isChecked = promoTargetOutlets.includes('ALL') || promoTargetOutlets.includes(outlet.name);
                      return (
                        <label
                          key={outlet.id || outlet.name}
                          onClick={(e) => {
                            e.preventDefault();
                            setPromoTargetOutlets(prev => {
                              const allNames = outletConfigs.map(o => o.name);
                              let current = prev.includes('ALL') ? [...allNames] : [...prev];
                              if (current.includes(outlet.name)) {
                                current = current.filter(n => n !== outlet.name);
                              } else {
                                current.push(outlet.name);
                              }
                              if (current.length === allNames.length) {
                                return ['ALL'];
                              }
                              return current;
                            });
                          }}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                            isChecked
                              ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm'
                              : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/15 hover:bg-slate-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-950 border-white/20 accent-amber-500 pointer-events-none"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-black truncate">{outlet.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[8px] font-bold text-slate-400 uppercase">{outlet.area}</span>
                              <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-white/5 text-slate-500 uppercase">{outlet.type}</span>
                            </div>
                          </div>
                          {isChecked && (
                            <i className="fas fa-check text-amber-400 text-xs"></i>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {/* Summary Indicator */}
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 border-t border-white/5 pt-2">
                    <span>Status Penerapan:</span>
                    {promoTargetOutlets.includes('ALL') || promoTargetOutlets.length === outletConfigs.length ? (
                      <span className="text-emerald-400 font-black flex items-center gap-1">
                        <i className="fas fa-globe text-xs"></i> Berlaku untuk SEMUA OUTLET ({outletConfigs.length} Outlet)
                      </span>
                    ) : promoTargetOutlets.length === 0 ? (
                      <span className="text-rose-400 font-black">
                        Belum ada outlet yang dipilih (Pilih minimal 1)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-black flex items-center gap-1">
                        <i className="fas fa-check-circle text-xs"></i> Berlaku untuk {promoTargetOutlets.length} dari {outletConfigs.length} Outlet Terpilih
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowPromoModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSavePromo}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black uppercase text-xs rounded-xl shadow-lg shadow-indigo-950/50 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i>
                  <span>{editingPromoId ? "Perbarui & Terapkan Promo" : "Simpan & Terapkan Promo"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 5: CONFIRM DELETE PROMO */}
        {promoToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl border border-rose-500/30">
                <i className="fas fa-trash-alt"></i>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Hapus Promo Ini?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Apakah Anda yakin ingin menghapus promo <strong className="text-rose-400 uppercase font-mono">{promoToDelete.name}</strong>?
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Promo ini akan dihapus dari daftar master dan dinonaktifkan dari seluruh outlet penerima.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPromoToDelete(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeletePromo}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  Ya, Hapus Promo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 6: ADD / EDIT STRATEGY MENU ITEM */}
        {showStrategyModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-purple-500/30 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <i className="fas fa-chess text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">
                      {editingStrategyId ? "Edit Menu Strategi" : "Tambah Menu Strategi"}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Atur menu penyeimbang & percepatan beserta harga jualnya
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStrategyModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 text-left">
                {/* 1. Nama Menu */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Nama Menu <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={stratNameInput}
                    onChange={(e) => setStratNameInput(e.target.value)}
                    placeholder="Contoh: Ribeye Prime 200gr / Wagyu Burger"
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-white font-bold text-xs outline-none focus:border-purple-500 focus:ring-1 ring-purple-500"
                  />
                </div>

                {/* 2. Kategori Menu: PENYEIMBANG vs PERCEPATAN */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Kategori Menu <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setStratCategoryInput('PENYEIMBANG')}
                      className={`p-3 rounded-xl border text-xs font-black uppercase transition-all flex flex-col items-center gap-1 cursor-pointer ${
                        stratCategoryInput === 'PENYEIMBANG'
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200 shadow-md ring-1 ring-purple-400'
                          : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <i className="fas fa-scale-balanced text-sm"></i>
                      <span>PENYEIMBANG</span>
                      <span className="text-[8px] font-normal text-slate-400">Balance & High-Margin Items</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStratCategoryInput('PERCEPATAN')}
                      className={`p-3 rounded-xl border text-xs font-black uppercase transition-all flex flex-col items-center gap-1 cursor-pointer ${
                        stratCategoryInput === 'PERCEPATAN'
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-400'
                          : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <i className="fas fa-bolt text-sm"></i>
                      <span>PERCEPATAN</span>
                      <span className="text-[8px] font-normal text-slate-400">Accelerator & Premium Revenue</span>
                    </button>
                  </div>
                </div>

                {/* 3. Harga Jual (Rp) */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Harga Jual Satuan (Rp) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">Rp</span>
                    <input
                      type="text"
                      value={stratPriceInput === '' ? '' : Number(stratPriceInput).toLocaleString('id-ID')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setStratPriceInput(raw ? parseInt(raw, 10) : '');
                      }}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-amber-400 font-mono font-black text-sm outline-none focus:border-purple-500 focus:ring-1 ring-purple-500"
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 mt-1 block">Harga ini otomatis digunakan untuk menghitung target & actual revenue di Fitur Strategi.</span>
                </div>

                {/* 4. Rekomendasi Sesi Shift */}
                <div>
                  <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Rekomendasi Sesi Shift
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'BOTH', label: 'Lunch & Dinner' },
                      { id: 'LUNCH', label: 'Lunch Saja' },
                      { id: 'DINNER', label: 'Dinner Saja' }
                    ].map(ses => (
                      <button
                        key={ses.id}
                        type="button"
                        onClick={() => setStratSessionInput(ses.id as StrategySession)}
                        className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase transition-all border cursor-pointer ${
                          stratSessionInput === ses.id
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                            : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {ses.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Status Aktif */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-white">Status Menu</div>
                    <div className="text-[10px] text-slate-400">Aktifkan agar muncul dalam pilihan fitur strategi</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStratIsActiveInput(!stratIsActiveInput)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                      stratIsActiveInput
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    }`}
                  >
                    {stratIsActiveInput ? '● Aktif' : '○ Nonaktif'}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowStrategyModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveStrategyItem}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black uppercase text-xs rounded-xl shadow-lg shadow-purple-950/50 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i>
                  <span>{editingStrategyId ? "Perbarui Menu" : "Simpan Menu ke Strategi"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL 7: CONFIRM DELETE STRATEGY */}
        {strategyToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl border border-rose-500/30">
                <i className="fas fa-trash-alt"></i>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Hapus Menu Strategi?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Apakah Anda yakin ingin menghapus menu <strong className="text-rose-400 uppercase font-mono">{strategyToDelete.name}</strong> ({strategyToDelete.category})?
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Menu ini akan dihapus dari katalog master strategi sistem.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStrategyToDelete(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteStrategy}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  Ya, Hapus Menu
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

