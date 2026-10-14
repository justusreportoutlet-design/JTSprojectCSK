import React, { useState, useMemo } from 'react';
import { AppState, OutletManpowerData, ManpowerSection, ManpowerSlot, ManpowerSlotStatus, ExternalManpowerEntry, Staff } from '../types';
import { createDefaultManpowerData, calculateManpowerSummary, generateManpowerWaReport, generateSingleOutletManpowerWaReport, ManpowerWaFillMode, resolveOutletManpowerData } from '../lib/manpowerUtils';
import { getAreaForOutlet, REGIONAL_AREAS } from '../constants';
import { safeWindow } from '../lib/safeStorage';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  data: AppState;
  onUpdate: (key: keyof AppState, val: any) => void;
  selectedOutlet?: string;
  filters?: {
    month?: string;
    year?: string;
  };
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToWeeklyOvertime?: () => void;
}

export const ManpowerTableModule: React.FC<Props> = ({
  data,
  onUpdate,
  selectedOutlet = 'SH THE BARN',
  filters,
  showToast,
  onNavigateToWeeklyOvertime
}) => {
  const currentDate = new Date();
  const currentMonthIdx = filters?.month ? parseInt(filters.month) : currentDate.getMonth();
  const currentYear = filters?.year ? parseInt(filters.year) : currentDate.getFullYear();
  const monthKey = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;

  // Outlet-specific manpower key
  const outletKey = `${selectedOutlet}_${monthKey}`;
  const legacyOutletKey = selectedOutlet;

  // Retrieve existing or initialize fallback from previous/any filled month
  const activeManpowerData: OutletManpowerData = useMemo(() => {
    return resolveOutletManpowerData(data.manpowerData, selectedOutlet, monthKey);
  }, [data.manpowerData, selectedOutlet, monthKey]);

  const [manpowerState, setManpowerState] = useState<OutletManpowerData>(activeManpowerData);

  // Sync state if activeManpowerData changes externally
  React.useEffect(() => {
    setManpowerState(activeManpowerData);
  }, [activeManpowerData]);

  // Persist helper
  const saveManpowerChanges = (updated: OutletManpowerData, toastMsg?: string) => {
    setManpowerState(updated);
    const all = { ...(data.manpowerData || {}) };
    all[outletKey] = updated;
    all[legacyOutletKey] = updated;
    all[`${selectedOutlet}_LATEST`] = updated;
    onUpdate('manpowerData', all, true);
    if (toastMsg && showToast) {
      showToast(toastMsg, 'success');
    }
  };

  // Calculations
  const summary = useMemo(() => {
    return calculateManpowerSummary(manpowerState);
  }, [manpowerState]);

  // Modals state
  const [showAddSectionModal, setShowAddSectionModal] = useState<boolean>(false);
  const [targetDivision, setTargetDivision] = useState<'SERVICE' | 'BAR' | 'KITCHEN'>('SERVICE');
  const [newSectionName, setNewSectionName] = useState<string>('');
  const [newSectionBudget, setNewSectionBudget] = useState<number>(2);

  const [showExternalModal, setShowExternalModal] = useState<boolean>(false);
  const [editingExternal, setEditingExternal] = useState<ExternalManpowerEntry | null>(null);
  const [extCategory, setExtCategory] = useState<string>('DAILY WORKER / CASUAL');
  const [extRole, setExtRole] = useState<string>('');
  const [extVendor, setExtVendor] = useState<string>('');
  const [extBudget, setExtBudget] = useState<number>(1);
  const [extActual, setExtActual] = useState<number>(1);
  const [extRemark, setExtRemark] = useState<string>('');
  const [extStatus, setExtStatus] = useState<ManpowerSlotStatus>('FILLED');

  // WhatsApp Report Template Modal State (Default: COUNT auto terisi jumlah orang)
  const currentArea = useMemo(() => getAreaForOutlet(selectedOutlet) || 'TANGGERANG', [selectedOutlet]);
  const [showWaModal, setShowWaModal] = useState<boolean>(false);
  const [waScope, setWaScope] = useState<'CURRENT' | 'AREA'>('CURRENT');
  const [waMode, setWaMode] = useState<ManpowerWaFillMode>('COUNT');
  const [waCustomArea, setWaCustomArea] = useState<string>(currentArea);
  const [waReportText, setWaReportText] = useState<string>('');

  // Keep waCustomArea in sync with currentArea when outlet changes
  React.useEffect(() => {
    setWaCustomArea(currentArea);
  }, [currentArea]);

  // Generate WA Report Text Helper
  const getGeneratedWaText = (
    scope: 'CURRENT' | 'AREA' = waScope,
    mode: ManpowerWaFillMode = waMode,
    areaName: string = waCustomArea || currentArea
  ) => {
    const allManpower = data.manpowerData || {};
    if (scope === 'AREA') {
      const areaOutlets = REGIONAL_AREAS[areaName] || [selectedOutlet];
      const outletList = areaOutlets.map(name => {
        const outletData = resolveOutletManpowerData(allManpower, name, monthKey);
        return {
          name,
          data: outletData
        };
      });
      return generateManpowerWaReport(outletList, areaName, { mode });
    }

    // Single Current Outlet
    return generateManpowerWaReport(
      [{ name: selectedOutlet, data: manpowerState }],
      areaName,
      { mode }
    );
  };

  // Slot status toggle
  const handleSlotStatusChange = (sectionId: string, slotId: string, newStatus: ManpowerSlotStatus) => {
    const updatedSections = manpowerState.sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      const updatedSlots = sec.slots.map(slot => {
        if (slot.id !== slotId) return slot;
        return {
          ...slot,
          status: newStatus
        };
      });
      return {
        ...sec,
        slots: updatedSlots
      };
    });

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData);
  };

  // Update Slot Position, Remark, or Staff Name inline
  const handleSlotFieldChange = (sectionId: string, slotId: string, field: 'position' | 'remark' | 'staffName', value: string) => {
    const updatedSections = manpowerState.sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      const updatedSlots = sec.slots.map(slot => {
        if (slot.id !== slotId) return slot;
        return {
          ...slot,
          [field]: value
        };
      });
      return {
        ...sec,
        slots: updatedSlots
      };
    });

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData);
  };

  // Add new Slot to Section
  const handleAddSlot = (sectionId: string) => {
    const updatedSections = manpowerState.sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      const nextSlotNum = sec.slots.length + 1;
      const newSlot: ManpowerSlot = {
        id: `slot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        slotNumber: nextSlotNum,
        status: 'FILLED',
        position: sec.slots[sec.slots.length - 1]?.position || 'Staff',
        remark: ''
      };
      return {
        ...sec,
        budget: sec.budget + 1,
        slots: [...sec.slots, newSlot]
      };
    });

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, 'Berhasil menambahkan 1 slot posisi');
  };

  // Delete Slot from Section
  const handleDeleteSlot = (sectionId: string, slotId: string) => {
    const updatedSections = manpowerState.sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      const filteredSlots = sec.slots.filter(s => s.id !== slotId).map((s, idx) => ({
        ...s,
        slotNumber: idx + 1
      }));
      return {
        ...sec,
        budget: Math.max(1, sec.budget - 1),
        slots: filteredSlots
      };
    });

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, 'Slot berhasil dihapus');
  };

  // Update Section Budget or Name
  const handleUpdateSection = (sectionId: string, field: 'name' | 'budget' | 'remark', val: any) => {
    const updatedSections = manpowerState.sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        [field]: val
      };
    });

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData);
  };

  // Delete Entire Section
  const handleDeleteSection = (sectionId: string, sectionName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus section "${sectionName}"?`)) return;
    const updatedSections = manpowerState.sections.filter(sec => sec.id !== sectionId);
    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, `Section "${sectionName}" berhasil dihapus`);
  };

  // Add New Section to a Division
  const handleSaveNewSection = () => {
    if (!newSectionName.trim()) {
      alert('Nama section tidak boleh kosong!');
      return;
    }

    const initialSlots: ManpowerSlot[] = [];
    const count = Math.max(1, newSectionBudget);
    for (let i = 1; i <= count; i++) {
      initialSlots.push({
        id: `slot_${Date.now()}_${i}`,
        slotNumber: i,
        status: 'FILLED',
        position: newSectionName.toUpperCase().replace('SECTION', '').trim() || 'Staff',
        remark: ''
      });
    }

    const newSection: ManpowerSection = {
      id: `sec_${Date.now()}`,
      name: newSectionName.toUpperCase().trim(),
      division: targetDivision,
      budget: count,
      slots: initialSlots
    };

    const updatedSections = [...manpowerState.sections, newSection];
    const updatedData: OutletManpowerData = {
      ...manpowerState,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, `Section "${newSection.name}" berhasil ditambahkan ke divisi ${targetDivision}!`);
    setShowAddSectionModal(false);
    setNewSectionName('');
    setNewSectionBudget(2);
  };

  // Open External Modal
  const handleOpenExternalModal = (entry?: ExternalManpowerEntry) => {
    if (entry) {
      setEditingExternal(entry);
      setExtCategory(entry.category);
      setExtRole(entry.role);
      setExtVendor(entry.vendorName || '');
      setExtBudget(entry.budget);
      setExtActual(entry.actual);
      setExtRemark(entry.remark || '');
      setExtStatus(entry.status || 'FILLED');
    } else {
      setEditingExternal(null);
      setExtCategory('DAILY WORKER / CASUAL');
      setExtRole('');
      setExtVendor('');
      setExtBudget(1);
      setExtActual(1);
      setExtRemark('');
      setExtStatus('FILLED');
    }
    setShowExternalModal(true);
  };

  // Save External Manpower
  const handleSaveExternal = () => {
    if (!extRole.trim()) {
      alert('Posisi / Role Manpower External tidak boleh kosong!');
      return;
    }

    const existing = [...(manpowerState.externalEntries || [])];
    const variance = (Number(extActual) || 0) - (Number(extBudget) || 0);

    if (editingExternal) {
      const idx = existing.findIndex(e => e.id === editingExternal.id);
      if (idx >= 0) {
        existing[idx] = {
          ...editingExternal,
          category: extCategory,
          role: extRole,
          vendorName: extVendor,
          budget: Number(extBudget) || 0,
          actual: Number(extActual) || 0,
          variance,
          remark: extRemark,
          status: extStatus
        };
      }
    } else {
      existing.push({
        id: `ext_${Date.now()}`,
        category: extCategory,
        role: extRole,
        vendorName: extVendor,
        budget: Number(extBudget) || 0,
        actual: Number(extActual) || 0,
        variance,
        remark: extRemark,
        status: extStatus
      });
    }

    const updatedData: OutletManpowerData = {
      ...manpowerState,
      externalEntries: existing,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, 'Data Manpower External berhasil disimpan');
    setShowExternalModal(false);
  };

  // Delete External Manpower
  const handleDeleteExternal = (id: string) => {
    const existing = (manpowerState.externalEntries || []).filter(e => e.id !== id);
    const updatedData: OutletManpowerData = {
      ...manpowerState,
      externalEntries: existing,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData, 'Data Manpower External berhasil dihapus');
  };

  // Toggle External Status
  const handleToggleExternalStatus = (id: string, newStatus: ManpowerSlotStatus) => {
    const existing = (manpowerState.externalEntries || []).map(e => {
      if (e.id !== id) return e;
      const actual = newStatus === 'FILLED' ? Math.max(1, e.budget) : 0;
      return {
        ...e,
        status: newStatus,
        actual,
        variance: actual - e.budget
      };
    });
    const updatedData: OutletManpowerData = {
      ...manpowerState,
      externalEntries: existing,
      updatedAt: new Date().toISOString()
    };
    saveManpowerChanges(updatedData);
  };

  // Reset to Default Template
  const handleResetDefault = () => {
    if (window.confirm(`Kembalikan data tabel Man Power untuk ${selectedOutlet} ke template awal standar?`)) {
      const def = createDefaultManpowerData(selectedOutlet);
      saveManpowerChanges(def, 'Tabel Man Power dikembalikan ke template awal');
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tabel Man Power');

    // Title Header
    const titleRow = worksheet.addRow([selectedOutlet]);
    titleRow.font = { bold: true, size: 16, color: { argb: 'FF000000' } };
    titleRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells('A1:G1');

    worksheet.addRow([]);

    // Table Headers
    const headerRow = worksheet.addRow(['DEPARTMENT', 'NAMA', 'POSITION', 'BUDGET', 'ACTUAL', 'VARIANCE', 'REMARK']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F3864' } // Navy like in screenshot
      };
    });

    // Write Sections
    manpowerState.sections.forEach(sec => {
      const actualCount = sec.slots.filter(s => s.status === 'FILLED').length;
      const variance = actualCount - sec.budget;

      // Section Header Row
      const secHeaderRow = worksheet.addRow([
        sec.name,
        '',
        '',
        sec.budget,
        actualCount,
        variance,
        sec.remark || ''
      ]);
      secHeaderRow.font = { bold: true };
      secHeaderRow.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' } // Light bluish gray
        };
      });

      // Section Slots
      sec.slots.forEach(slot => {
        const isVacantOpen = slot.status === 'VACANT_OPEN';
        const isVacantHold = slot.status === 'VACANT_HOLD';
        const statusLabel = isVacantOpen ? 'Vacant Open' : isVacantHold ? 'Vacant Hold' : '';

        const slotRow = worksheet.addRow([
          `${slot.slotNumber}  ${statusLabel}`,
          slot.staffName || '',
          slot.position,
          '',
          slot.status === 'FILLED' ? 1 : '',
          '',
          slot.remark || ''
        ]);

        if (isVacantOpen) {
          slotRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF70AD47' } // Bright green like screenshot
          };
          slotRow.getCell(2).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF70AD47' }
          };
        } else if (isVacantHold) {
          slotRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC000' } // Amber/Yellow
          };
        }
      });
    });

    // Space before summary
    worksheet.addRow([]);
    worksheet.addRow([]);

    // Summary Table Header
    const sumHeader = worksheet.addRow(['NO', `DEPARTMENT / ${selectedOutlet}`, 'CURRENT BUDGET', 'BUDGET', 'VARIANCE', 'PREVIOUS BUDGET']);
    sumHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sumHeader.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F3864' }
      };
    });
    // Set column 3 title highlight
    sumHeader.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' } // Yellow
    };
    sumHeader.getCell(3).font = { bold: true, color: { argb: 'FF000000' } };

    summary.rows.forEach(r => {
      worksheet.addRow([r.no, r.name, '', r.currentBudget, r.variance, r.previousBudget]);
    });

    // Total Row
    const totalRow = worksheet.addRow([
      '',
      'TOTAL',
      summary.totalInhouseBudget,
      '',
      summary.totalInhouseVariance,
      summary.previousBudgetTotal
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' } // Yellow
    };

    // Auto-fit column widths
    worksheet.columns.forEach(col => {
      col.width = 24;
    });
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 28;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Tabel_Man_Power_${selectedOutlet.replace(/\s+/g, '_')}_${monthKey}.xlsx`);
    if (showToast) showToast('File Excel Tabel Man Power berhasil diunduh!', 'success');
  };

  // Copy to WhatsApp (Man Power Report Template with Bold Asterisks and auto-filled counts)
  const handleCopyWhatsApp = (customText?: string) => {
    const msg = customText || getGeneratedWaText('CURRENT', waMode || 'COUNT', currentArea);

    navigator.clipboard.writeText(msg).then(() => {
      if (showToast) showToast('Template WA Report Man Power (Jumlah Orang Terisi) berhasil disalin!', 'success');
    }).catch(() => {
      if (showToast) showToast('Gagal menyalin ringkasan', 'error');
    });
  };

  const handleOpenWaModal = () => {
    const initialText = getGeneratedWaText(waScope, waMode, waCustomArea || currentArea);
    setWaReportText(initialText);
    setShowWaModal(true);
  };

  const handleScopeChange = (newScope: 'CURRENT' | 'AREA') => {
    setWaScope(newScope);
    setWaReportText(getGeneratedWaText(newScope, waMode, waCustomArea || currentArea));
  };

  const handleModeChange = (newMode: ManpowerWaFillMode) => {
    setWaMode(newMode);
    setWaReportText(getGeneratedWaText(waScope, newMode, waCustomArea || currentArea));
  };

  const handleAreaChange = (newArea: string) => {
    setWaCustomArea(newArea);
    setWaReportText(getGeneratedWaText(waScope, waMode, newArea));
  };

  const handleDirectShareWa = () => {
    const textToSend = waReportText || getGeneratedWaText();
    const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
    safeWindow.open(waUrl, '_blank');
  };

  // Filter sections by Division
  const serviceSections = useMemo(() => {
    return manpowerState.sections.filter(s => s.division === 'SERVICE');
  }, [manpowerState.sections]);

  const barSections = useMemo(() => {
    return manpowerState.sections.filter(s => s.division === 'BAR');
  }, [manpowerState.sections]);

  const kitchenSections = useMemo(() => {
    return manpowerState.sections.filter(s => s.division === 'KITCHEN');
  }, [manpowerState.sections]);

  // Render a Single Section's rows
  const renderSection = (sec: ManpowerSection) => {
    const actualCount = sec.slots.filter(s => s.status === 'FILLED').length;
    const variance = actualCount - sec.budget;

    return (
      <React.Fragment key={sec.id}>
        {/* Section Header Row */}
        <tr className="bg-slate-800/95 border-b border-t border-slate-700 font-bold text-slate-100">
          <td className="px-4 py-3 font-black text-sm tracking-wide uppercase flex items-center justify-between border-r border-slate-700/80">
            <span className="flex items-center gap-2">
              <i className="fas fa-layer-group text-indigo-400 text-xs"></i>
              {sec.name}
            </span>
            <div className="flex items-center gap-1.5 opacity-90 hover:opacity-100">
              <button
                onClick={() => handleAddSlot(sec.id)}
                title="Tambah Slot Posisi di Section ini"
                className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm"
              >
                <i className="fas fa-plus text-[9px]"></i> +Slot
              </button>
              <button
                onClick={() => handleDeleteSection(sec.id, sec.name)}
                title="Hapus Section ini"
                className="px-1.5 py-0.5 bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white rounded text-[10px] font-bold transition-all"
              >
                <i className="fas fa-trash-alt text-[9px]"></i>
              </button>
            </div>
          </td>
          {/* Column NAMA in section header */}
          <td className="px-3 py-3 text-xs text-slate-500 italic border-r border-slate-700/80">
            —
          </td>
          {/* Column POSITION in section header */}
          <td className="px-3 py-3 text-xs text-slate-300 font-bold border-r border-slate-700/80">
            <span className="px-2 py-0.5 bg-slate-900/80 rounded text-[11px] border border-slate-700/60">
              {sec.slots.length} Total Slot
            </span>
          </td>
          {/* Column BUDGET */}
          <td className="px-3 py-3 text-center font-black text-sm border-r border-slate-700/80">
            <input
              type="number"
              min="0"
              value={sec.budget}
              onChange={(e) => handleUpdateSection(sec.id, 'budget', parseInt(e.target.value) || 0)}
              className="w-14 text-center bg-slate-950 border border-slate-700 rounded py-0.5 font-black text-sm text-white shadow-inner focus:border-indigo-400 outline-none"
            />
          </td>
          {/* Column ACTUAL */}
          <td className="px-3 py-3 text-center font-black text-sm text-emerald-400 border-r border-slate-700/80">
            {actualCount}
          </td>
          {/* Column VARIANCE */}
          <td className={`px-3 py-3 text-center font-black text-sm border-r border-slate-700/80 ${variance < 0 ? 'text-rose-400' : variance > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
            {variance > 0 ? `+${variance}` : variance}
          </td>
          {/* Column REMARK */}
          <td className="px-3 py-3 text-xs">
            <input
              type="text"
              placeholder="Remark section..."
              value={sec.remark || ''}
              onChange={(e) => handleUpdateSection(sec.id, 'remark', e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-700/80 rounded text-xs px-2 py-1 focus:border-indigo-400 outline-none text-slate-200"
            />
          </td>
        </tr>

        {/* Section Slot Rows */}
        {sec.slots.map((slot) => {
          const isVacantOpen = slot.status === 'VACANT_OPEN';
          const isVacantHold = slot.status === 'VACANT_HOLD';
          const isFilled = slot.status === 'FILLED';

          return (
            <tr
              key={slot.id}
              className={`border-b border-slate-800/90 transition-colors ${
                isVacantOpen
                  ? 'bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-100'
                  : isVacantHold
                  ? 'bg-amber-950/40 hover:bg-amber-950/60 text-amber-100'
                  : 'bg-slate-900/90 hover:bg-slate-850 text-slate-200'
              }`}
            >
              {/* Column 1: DEPARTMENT / SLOT NUMBER + VACANT BUTTONS */}
              <td className="px-4 py-2 text-xs border-r border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center font-mono font-bold text-slate-400 text-xs">
                      {slot.slotNumber}
                    </span>

                    {/* Status Badge Preview */}
                    {isVacantOpen && (
                      <span className="px-2 py-0.5 bg-[#22c55e] text-slate-950 font-black rounded text-[11px] shadow-sm tracking-wide uppercase">
                        Vacant Open
                      </span>
                    )}
                    {isVacantHold && (
                      <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black rounded text-[11px] shadow-sm tracking-wide uppercase">
                        Vacant Hold
                      </span>
                    )}
                    {isFilled && (
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 font-bold rounded text-[10px]">
                        Terisi
                      </span>
                    )}
                  </div>

                  {/* ACTION BUTTONS: VACANT OPEN, VACANT HOLD, TERISI */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSlotStatusChange(sec.id, slot.id, 'VACANT_OPEN')}
                      title="Tandai sebagai Vacant Open (Lowongan Dibuka)"
                      className={`px-2 py-1 rounded text-[10px] font-black tracking-tight transition-all shadow-xs ${
                        isVacantOpen
                          ? 'bg-[#15803d] text-white ring-2 ring-[#22c55e]'
                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-[#22c55e] hover:text-slate-950 border border-emerald-500/40'
                      }`}
                    >
                      Vacant Open
                    </button>

                    <button
                      onClick={() => handleSlotStatusChange(sec.id, slot.id, 'VACANT_HOLD')}
                      title="Tandai sebagai Vacant Hold (Ditahan)"
                      className={`px-2 py-1 rounded text-[10px] font-black tracking-tight transition-all shadow-xs ${
                        isVacantHold
                          ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                          : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40'
                      }`}
                    >
                      Vacant Hold
                    </button>

                    <button
                      onClick={() => handleSlotStatusChange(sec.id, slot.id, 'FILLED')}
                      title="Tandai sebagai Terisi / Aktif"
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                        isFilled
                          ? 'bg-indigo-600 text-white ring-1 ring-indigo-400'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700'
                      }`}
                    >
                      Terisi
                    </button>

                    <button
                      onClick={() => handleDeleteSlot(sec.id, slot.id)}
                      title="Hapus baris ini"
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors text-[10px]"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              </td>

              {/* Column 2: NAMA (NEW REQUESTED COLUMN) */}
              <td className="px-3 py-2 text-xs border-r border-slate-800/80">
                <input
                  type="text"
                  value={slot.staffName || ''}
                  onChange={(e) => handleSlotFieldChange(sec.id, slot.id, 'staffName', e.target.value)}
                  placeholder={isVacantOpen ? 'Lowongan Dibuka...' : isVacantHold ? 'Ditahan...' : 'Nama Karyawan...'}
                  className={`w-full bg-slate-950/80 border border-slate-700/80 px-2.5 py-1 rounded font-medium text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all ${
                    isVacantOpen ? 'border-emerald-700/60 text-emerald-200 placeholder:text-emerald-500/70' : isVacantHold ? 'border-amber-700/60 text-amber-200 placeholder:text-amber-500/70' : ''
                  }`}
                />
              </td>

              {/* Column 3: POSITION */}
              <td className="px-3 py-2 text-xs border-r border-slate-800/80">
                <input
                  type="text"
                  value={slot.position}
                  onChange={(e) => handleSlotFieldChange(sec.id, slot.id, 'position', e.target.value)}
                  placeholder="Nama Posisi / Role..."
                  className={`w-full bg-slate-950/80 border border-slate-700/80 px-2.5 py-1 rounded font-medium text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all ${
                    isVacantOpen ? 'border-emerald-700/60 text-emerald-200' : ''
                  }`}
                />
              </td>

              {/* Column 4: BUDGET */}
              <td className="px-3 py-2 text-center text-xs text-slate-500 border-r border-slate-800/80">
                —
              </td>

              {/* Column 5: ACTUAL */}
              <td className="px-3 py-2 text-center text-xs border-r border-slate-800/80">
                {isFilled ? (
                  <span className="text-emerald-400 font-bold">1</span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>

              {/* Column 6: VARIANCE */}
              <td className="px-3 py-2 text-center text-xs text-slate-500 border-r border-slate-800/80">
                —
              </td>

              {/* Column 7: REMARK */}
              <td className="px-3 py-2 text-xs">
                <input
                  type="text"
                  value={slot.remark || ''}
                  onChange={(e) => handleSlotFieldChange(sec.id, slot.id, 'remark', e.target.value)}
                  placeholder={isVacantOpen ? 'Catatan lowongan / target join...' : 'Catatan posisi / join date...'}
                  className="w-full bg-slate-950/80 border border-slate-700/80 px-2.5 py-1 rounded text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-400 outline-none"
                />
              </td>
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn text-slate-100">
      {/* TOP HEADER & ACTION BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-indigo-950 text-indigo-300 rounded-lg text-xs font-black uppercase tracking-wider border border-indigo-800">
                Tabel Man Power Outlet
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Periode: {monthKey}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mt-1 flex items-center gap-2">
              <span>{selectedOutlet}</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Hubungan data Man Power per Divisi ke Weekly Overtime: Service, Bar, Kitchen (Store Keeper & Steward), dan Manpower External.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToWeeklyOvertime && (
              <button
                onClick={onNavigateToWeeklyOvertime}
                className="px-3.5 py-2 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 rounded-xl text-xs font-bold transition-all border border-indigo-800 flex items-center gap-2 shadow-xs"
              >
                <i className="fas fa-business-time"></i>
                Input Weekly Overtime
              </button>
            )}

            <button
              onClick={() => handleOpenExternalModal()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm active:scale-95"
            >
              <i className="fas fa-user-plus"></i>
              + Input Manpower External
            </button>

            <button
              onClick={handleOpenWaModal}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer active:scale-95"
              title="Buka Template WA Report Man Power & Live Preview"
            >
              <i className="fab fa-whatsapp text-sm text-emerald-100"></i>
              <span>Template WA Report</span>
            </button>

            <button
              onClick={() => handleCopyWhatsApp()}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Salin Cepat Format WhatsApp (Huruf Tebal Bintang)"
            >
              <i className="fas fa-copy text-emerald-400 text-xs"></i>
              <span>Salin WA Cepat</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 rounded-xl text-xs font-bold transition-all border border-emerald-800 flex items-center gap-1.5"
            >
              <i className="fas fa-file-excel text-sm"></i>
              Export Excel
            </button>

            <button
              onClick={handleResetDefault}
              title="Reset ke template standar"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700"
            >
              <i className="fas fa-redo-alt"></i>
            </button>
          </div>
        </div>

        {/* OVERVIEW KPI STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Budget In-House</span>
            <span className="text-xl font-black text-white">{summary.totalInhouseBudget} <span className="text-xs font-normal text-slate-400">Org</span></span>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Actual Terisi</span>
            <span className="text-xl font-black text-emerald-400">{summary.totalInhouseActual} <span className="text-xs font-normal text-slate-400">Org</span></span>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Varian In-House</span>
            <span className={`text-xl font-black ${summary.totalInhouseVariance < 0 ? 'text-rose-400' : 'text-white'}`}>
              {summary.totalInhouseVariance > 0 ? `+${summary.totalInhouseVariance}` : summary.totalInhouseVariance}
            </span>
          </div>

          <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/60">
            <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">Vacant Open</span>
            <span className="text-xl font-black text-[#4ade80]">{summary.totalVacantOpen} <span className="text-xs font-normal">Slot</span></span>
          </div>

          <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/60">
            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">Vacant Hold</span>
            <span className="text-xl font-black text-amber-400">{summary.totalVacantHold} <span className="text-xs font-normal">Slot</span></span>
          </div>

          <div className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-800/60">
            <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">External Manpower</span>
            <span className="text-xl font-black text-indigo-400">{summary.externalActual} <span className="text-xs font-normal">/{summary.externalBudget}</span></span>
          </div>
        </div>
      </div>

      {/* MAIN MANPOWER TABLE (MATCHING SPREADSHEET LAYOUT) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Navy Header Title like screenshot */}
        <div className="bg-[#0f172a] text-white text-center py-3.5 px-4 border-b border-slate-800">
          <h2 className="text-lg md:text-xl font-black tracking-widest uppercase text-slate-100">
            {selectedOutlet}
          </h2>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[950px] bg-slate-950">
            {/* Primary Columns Header */}
            <thead>
              <tr className="bg-[#1e293b] text-white uppercase text-xs tracking-wider font-black border-b border-slate-700">
                <th className="px-4 py-3.5 w-72 text-left border-r border-slate-700/80">
                  DEPARTMENT
                </th>
                <th className="px-3 py-3.5 w-60 text-left border-r border-slate-700/80">
                  NAMA
                </th>
                <th className="px-3 py-3.5 w-48 text-left border-r border-slate-700/80">
                  POSITION
                </th>
                <th className="px-3 py-3.5 w-24 text-center border-r border-slate-700/80">
                  BUDGET
                </th>
                <th className="px-3 py-3.5 w-24 text-center border-r border-slate-700/80">
                  ACTUAL
                </th>
                <th className="px-3 py-3.5 w-24 text-center border-r border-slate-700/80">
                  VARIANCE
                </th>
                <th className="px-3 py-3.5 w-64 text-left">
                  REMARK
                </th>
              </tr>
            </thead>

            <tbody>
              {/* 1. DIVISION: SERVICE */}
              <tr className="bg-indigo-950 text-white font-black text-xs uppercase tracking-wider border-y border-indigo-800/80">
                <td colSpan={7} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-indigo-200">
                    <i className="fas fa-concierge-bell text-indigo-400"></i>
                    DIVISI SERVICE (IN-HOUSE & PUBLIC AREA)
                  </span>
                  <button
                    onClick={() => {
                      setTargetDivision('SERVICE');
                      setShowAddSectionModal(true);
                    }}
                    className="px-2.5 py-1 bg-indigo-600/60 hover:bg-indigo-600 text-white rounded text-[10px] font-black transition-all flex items-center gap-1 border border-indigo-400/30"
                  >
                    <i className="fas fa-plus"></i> Tambah Section Service
                  </button>
                </td>
              </tr>
              {serviceSections.map(renderSection)}

              {/* 2. DIVISION: BAR */}
              <tr className="bg-amber-950/90 text-white font-black text-xs uppercase tracking-wider border-y border-amber-800/80">
                <td colSpan={7} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-amber-200">
                    <i className="fas fa-glass-martini-alt text-amber-400"></i>
                    DIVISI BAR
                  </span>
                  <button
                    onClick={() => {
                      setTargetDivision('BAR');
                      setShowAddSectionModal(true);
                    }}
                    className="px-2.5 py-1 bg-amber-600/60 hover:bg-amber-600 text-white rounded text-[10px] font-black transition-all flex items-center gap-1 border border-amber-400/30"
                  >
                    <i className="fas fa-plus"></i> Tambah Section Bar
                  </button>
                </td>
              </tr>
              {barSections.map(renderSection)}

              {/* 3. DIVISION: KITCHEN (Includes Store Keeper & Steward per user rule) */}
              <tr className="bg-emerald-950 text-white font-black text-xs uppercase tracking-wider border-y border-emerald-800/80">
                <td colSpan={7} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-emerald-200">
                    <i className="fas fa-utensils text-emerald-400"></i>
                    DIVISI KITCHEN (LEADER, COOKS, STEWARD, & STORE KEEPER)
                  </span>
                  <button
                    onClick={() => {
                      setTargetDivision('KITCHEN');
                      setShowAddSectionModal(true);
                    }}
                    className="px-2.5 py-1 bg-emerald-600/60 hover:bg-emerald-600 text-white rounded text-[10px] font-black transition-all flex items-center gap-1 border border-emerald-400/30"
                  >
                    <i className="fas fa-plus"></i> Tambah Section Kitchen
                  </button>
                </td>
              </tr>
              {kitchenSections.map(renderSection)}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXTERNAL MANPOWER TABLE (TERPISAH DARI KITCHEN, BAR, SERVICE SESUAI PERMINTAAN USER) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-[#1e293b] text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-750">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black rounded text-[10px] uppercase">
                Khusus Terpisah
              </span>
              <h3 className="text-base font-black tracking-wider uppercase text-slate-100">
                MANPOWER EXTERNAL (OUTSOURCING, CASUAL / DAILY WORKER)
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Terpisah dari divisi In-House Kitchen, Bar, dan Service untuk isolasi kontrol vendor dan casual payroll.
            </p>
          </div>

          <button
            onClick={() => handleOpenExternalModal()}
            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <i className="fas fa-plus"></i>
            + Input Manpower External
          </button>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[750px] bg-slate-950">
            <thead>
              <tr className="bg-[#0f172a] text-slate-300 uppercase text-[11px] font-black tracking-wider border-b border-slate-800">
                <th className="px-4 py-3 w-12 text-center border-r border-slate-800">NO</th>
                <th className="px-4 py-3 border-r border-slate-800">KATEGORI & VENDOR</th>
                <th className="px-4 py-3 border-r border-slate-800">POSISI / ROLE</th>
                <th className="px-3 py-3 w-24 text-center border-r border-slate-800">BUDGET</th>
                <th className="px-3 py-3 w-24 text-center border-r border-slate-800">ACTUAL</th>
                <th className="px-3 py-3 w-24 text-center border-r border-slate-800">VARIANCE</th>
                <th className="px-4 py-3 border-r border-slate-800">STATUS & VACANCY</th>
                <th className="px-4 py-3 border-r border-slate-800">REMARK / KETERANGAN</th>
                <th className="px-3 py-3 w-20 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {(manpowerState.externalEntries || []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">
                    Belum ada data Manpower External. Klik tombol "+ Input Manpower External" untuk menambahkan casual worker atau vendor outsourcing.
                  </td>
                </tr>
              ) : (
                (manpowerState.externalEntries || []).map((ext, idx) => {
                  const isVacantOpen = ext.status === 'VACANT_OPEN';
                  const isVacantHold = ext.status === 'VACANT_HOLD';
                  const isFilled = ext.status === 'FILLED' || !ext.status;

                  return (
                    <tr
                      key={ext.id}
                      className={`hover:bg-slate-900 transition-colors ${
                        isVacantOpen ? 'bg-emerald-950/40 text-emerald-100' : isVacantHold ? 'bg-amber-950/40 text-amber-100' : 'bg-slate-950/90 text-slate-200'
                      }`}
                    >
                      <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        <span className="block">{ext.category}</span>
                        {ext.vendorName && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            Vendor: {ext.vendorName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        {ext.role}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-700 dark:text-slate-300">
                        {ext.budget}
                      </td>
                      <td className="px-3 py-3 text-center font-black text-emerald-600 dark:text-emerald-400">
                        {ext.actual}
                      </td>
                      <td className={`px-3 py-3 text-center font-black ${ext.variance < 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {ext.variance > 0 ? `+${ext.variance}` : ext.variance}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleExternalStatus(ext.id, 'VACANT_OPEN')}
                            className={`px-2 py-0.5 rounded text-[10px] font-black tracking-tight ${
                              isVacantOpen
                                ? 'bg-[#15803d] text-white ring-1 ring-[#22c55e]'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-[#22c55e] hover:text-black'
                            }`}
                          >
                            Vacant Open
                          </button>
                          <button
                            onClick={() => handleToggleExternalStatus(ext.id, 'VACANT_HOLD')}
                            className={`px-2 py-0.5 rounded text-[10px] font-black tracking-tight ${
                              isVacantHold
                                ? 'bg-amber-600 text-white ring-1 ring-amber-400'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-black'
                            }`}
                          >
                            Vacant Hold
                          </button>
                          <button
                            onClick={() => handleToggleExternalStatus(ext.id, 'FILLED')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isFilled ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
                            }`}
                          >
                            Terisi
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {ext.remark || '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenExternalModal(ext)}
                            className="text-slate-400 hover:text-indigo-500 p-1"
                            title="Edit"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteExternal(ext.id)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                            title="Hapus"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUMMARY TABLE AT BOTTOM (MATCHING SPREADSHEET FORMAT) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-[#1e293b] dark:bg-[#0f172a] text-white py-3 px-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm md:text-base font-black tracking-wider uppercase text-slate-100 flex items-center gap-2">
            <i className="fas fa-chart-pie text-indigo-400"></i>
            RINGKASAN BUDGET & REKAP MAN POWER - {selectedOutlet}
          </h3>
          <span className="text-xs text-slate-400">
            Auto-linked to Weekly Overtime Divisions
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-[#1e3a8a] text-white text-xs font-black tracking-wider">
                <th className="px-4 py-3 w-16 text-center border-r border-blue-900/40">NO</th>
                <th className="px-4 py-3 border-r border-blue-900/40">
                  DEPARTMENT / {selectedOutlet}
                </th>
                <th className="px-4 py-3 text-center w-40 bg-[#eab308] text-slate-950 font-black border-r border-blue-900/40">
                  CURRENT BUDGET
                </th>
                <th className="px-4 py-3 text-center w-32 border-r border-blue-900/40">
                  ACTUAL
                </th>
                <th className="px-4 py-3 text-center w-32 border-r border-blue-900/40">
                  VARIANCE
                </th>
                <th className="px-4 py-3 text-center w-40">
                  PREVIOUS BUDGET
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
              {summary.rows.map((row) => (
                <tr key={row.no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-500">{row.no}</td>
                  <td className="px-4 py-3 font-black tracking-wide text-slate-900 dark:text-white uppercase">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-center font-black text-sm bg-yellow-50 dark:bg-yellow-950/20 text-slate-900 dark:text-yellow-300">
                    {row.currentBudget}
                  </td>
                  <td className="px-4 py-3 text-center font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {row.actual}
                  </td>
                  <td className={`px-4 py-3 text-center font-black text-sm ${row.variance < 0 ? 'text-rose-600 dark:text-rose-400' : row.variance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    {row.variance > 0 ? `+${row.variance}` : row.variance}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-500 dark:text-slate-400">
                    {row.previousBudget}
                  </td>
                </tr>
              ))}

              {/* External Row in Summary */}
              {summary.externalBudget > 0 && (
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 font-bold">
                  <td className="px-4 py-3 text-center text-slate-400">7</td>
                  <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400 uppercase">
                    MANPOWER EXTERNAL (CASUAL / OUTSOURCING)
                  </td>
                  <td className="px-4 py-3 text-center font-black text-sm bg-yellow-50 dark:bg-yellow-950/20 text-slate-900 dark:text-yellow-300">
                    {summary.externalBudget}
                  </td>
                  <td className="px-4 py-3 text-center font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {summary.externalActual}
                  </td>
                  <td className="px-4 py-3 text-center font-black text-sm text-slate-700 dark:text-slate-300">
                    {summary.externalVariance > 0 ? `+${summary.externalVariance}` : summary.externalVariance}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-400">-</td>
                </tr>
              )}

              {/* TOTAL ROW (MATCHING SPREADSHEET HIGHLIGHT) */}
              <tr className="bg-[#1e293b] text-white font-black text-sm border-t-2 border-slate-700">
                <td className="px-4 py-3 text-center"></td>
                <td className="px-4 py-3 text-right uppercase tracking-wider text-slate-200">
                  TOTAL
                </td>
                <td className="px-4 py-3 text-center bg-[#facc15] text-slate-950 text-base font-black shadow-inner">
                  {summary.totalInhouseBudget}
                </td>
                <td className="px-4 py-3 text-center text-emerald-400 text-base font-black">
                  {summary.totalInhouseActual}
                </td>
                <td className={`px-4 py-3 text-center text-base font-black ${summary.totalInhouseVariance < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {summary.totalInhouseVariance > 0 ? `+${summary.totalInhouseVariance}` : summary.totalInhouseVariance}
                </td>
                <td className="px-4 py-3 text-center text-slate-300">
                  {summary.previousBudgetTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: TAMBAH SECTION BARU PER DIVISI */}
      <AnimatePresence>
        {showAddSectionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-folder-plus text-indigo-500"></i>
                  Tambah Section Divisi {targetDivision}
                </h3>
                <button
                  onClick={() => setShowAddSectionModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Pilihan Divisi
                  </label>
                  <select
                    value={targetDivision}
                    onChange={(e) => setTargetDivision(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100"
                  >
                    <option value="SERVICE">SERVICE (Termasuk Public Area)</option>
                    <option value="BAR">BAR</option>
                    <option value="KITCHEN">KITCHEN (Termasuk Steward & Store Keeper)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Nama Section
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: GRILL SECTION, RUNNER, HOST..."
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Target Budget Headcount (Jumlah Slot Awal)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newSectionBudget}
                    onChange={(e) => setNewSectionBudget(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddSectionModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewSection}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  Simpan Section
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: INPUT MANPOWER EXTERNAL */}
      <AnimatePresence>
        {showExternalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-user-tag text-emerald-500"></i>
                  {editingExternal ? 'Edit Manpower External' : 'Input Manpower External'}
                </h3>
                <button
                  onClick={() => setShowExternalModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Kategori Tenaga Kerja External
                  </label>
                  <select
                    value={extCategory}
                    onChange={(e) => setExtCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100"
                  >
                    <option value="DAILY WORKER / CASUAL">DAILY WORKER / CASUAL (Harian)</option>
                    <option value="OUTSOURCING CLEANING">OUTSOURCING CLEANING / STEWARD</option>
                    <option value="SECURITY & VALET">SECURITY & VALET</option>
                    <option value="THIRD PARTY VENDOR">THIRD PARTY VENDOR / TEKNISI</option>
                    <option value="FREELANCE / EVENT HELPER">FREELANCE / EVENT HELPER</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Posisi / Role Pekerjaan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Casual Server, Night Cleaner, Steward DW..."
                    value={extRole}
                    onChange={(e) => setExtRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Nama Vendor / Agensi / Supplier (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: PT Bersih Sejahtera, Mandiri Casual..."
                    value={extVendor}
                    onChange={(e) => setExtVendor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Budget Headcount
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={extBudget}
                      onChange={(e) => setExtBudget(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Actual Headcount
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={extActual}
                      onChange={(e) => setExtActual(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Status Posisi
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setExtStatus('FILLED')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                        extStatus === 'FILLED'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Terisi
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtStatus('VACANT_OPEN')}
                      className={`py-2 px-3 rounded-xl text-xs font-black transition-all border ${
                        extStatus === 'VACANT_OPEN'
                          ? 'bg-[#22c55e] text-slate-950 border-[#16a34a] shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Vacant Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtStatus('VACANT_HOLD')}
                      className={`py-2 px-3 rounded-xl text-xs font-black transition-all border ${
                        extStatus === 'VACANT_HOLD'
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Vacant Hold
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Keterangan / Jadwal Penugasan
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Shift weekend malam, rate Rp 150rb/shift..."
                    value={extRemark}
                    onChange={(e) => setExtRemark(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExternalModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveExternal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  Simpan Manpower External
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* MODAL TEMPLATE WA REPORT MAN POWER */}
        {showWaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="p-5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <i className="fab fa-whatsapp text-2xl"></i>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                      Template WA Report Man Power
                    </h2>
                    <p className="text-xs text-slate-400 font-medium flex items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono font-bold text-[10px] border border-emerald-800/60">
                        *BOLD MARKDOWN*
                      </span>
                      Huruf tanda bintang tetap (Bold pada WhatsApp)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWaModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Controls Bar */}
              <div className="p-4 bg-slate-950/70 border-b border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Scope Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cakupan:</span>
                    <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleScopeChange('CURRENT')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          waScope === 'CURRENT'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        1 Outlet ({selectedOutlet})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleScopeChange('AREA')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          waScope === 'AREA'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Seluruh Area ({waCustomArea || currentArea})
                      </button>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Format Isian:</span>
                    <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleModeChange('COUNT')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          waMode === 'COUNT'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Auto isi jumlah orang setiap department (contoh: 3 Orang, 2 Orang)"
                      >
                        <i className="fas fa-users text-[10px]"></i>
                        Jumlah Orang (Auto)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('COUNT_WITH_NAMES')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          waMode === 'COUNT_WITH_NAMES'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Tampilkan jumlah orang dan nama karyawan jika terisi"
                      >
                        <i className="fas fa-id-badge text-[10px]"></i>
                        Jumlah & Nama
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('FILLED_NAMES')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          waMode === 'FILLED_NAMES'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Tampilkan nama karyawan yang sudah terisi di tabel"
                      >
                        Nama Staff
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('TEMPLATE_ONLY')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          waMode === 'TEMPLATE_ONLY'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Format titik dua kosong tanpa isian angka"
                      >
                        Template Polos
                      </button>
                    </div>
                  </div>
                </div>

                {/* Area Input & Regenerate */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[70px]">Nama Area:</span>
                  <input
                    type="text"
                    value={waCustomArea}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    placeholder="Contoh: TANGGERANG / JAKARTA / BEKASI..."
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1 text-xs text-white placeholder:text-slate-500 font-mono focus:border-emerald-500 outline-none w-48"
                  />
                  <button
                    type="button"
                    onClick={() => setWaReportText(getGeneratedWaText(waScope, waMode, waCustomArea))}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                  >
                    <i className="fas fa-sync-alt text-[10px]"></i>
                    Reset Format
                  </button>
                  <span className="text-[11px] text-slate-500 italic ml-auto hidden sm:inline">
                    Teks di bawah dapat langsung diedit sebelum dikirim
                  </span>
                </div>
              </div>

              {/* Text Area & Preview */}
              <div className="p-4 flex-1 overflow-y-auto bg-slate-950 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <i className="fas fa-terminal text-emerald-400"></i>
                    Teks WhatsApp (Siap Kirim):
                  </span>
                  <span className="text-slate-500 font-mono">
                    {waReportText.split('\n').length} Baris • {waReportText.length} Karakter
                  </span>
                </div>

                <textarea
                  rows={14}
                  value={waReportText}
                  onChange={(e) => setWaReportText(e.target.value)}
                  className="w-full bg-[#0b141a] text-[#e9edef] font-mono text-xs md:text-sm p-4 rounded-xl border border-emerald-950/60 focus:border-emerald-500 outline-none leading-relaxed resize-y selection:bg-emerald-600/40 custom-scrollbar"
                  spellCheck={false}
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <i className="fas fa-info-circle text-indigo-400"></i>
                  Format menggunakan tanda bintang (<code className="text-emerald-400 font-bold">*TEKS*</code>) untuk tulisan tebal di WhatsApp.
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWaModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700"
                  >
                    Tutup
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCopyWhatsApp(waReportText);
                      setShowWaModal(false);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm active:scale-95"
                  >
                    <i className="fas fa-copy"></i>
                    Salin ke Clipboard
                  </button>

                  <button
                    type="button"
                    onClick={handleDirectShareWa}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 active:scale-95"
                  >
                    <i className="fab fa-whatsapp text-sm"></i>
                    Kirim ke WhatsApp
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
