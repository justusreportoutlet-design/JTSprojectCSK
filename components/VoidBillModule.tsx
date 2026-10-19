import React, { useState, useMemo } from 'react';
import { AppState, VoidBillRecord, Staff } from '../types';
import { resolveOutletManpowerData } from '../lib/manpowerUtils';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';
import FeatureSubmitSyncButton from './FeatureSubmitSyncButton';

interface Props {
  data: AppState;
  staffList?: Staff[];
  selectedOutlet?: string;
  filters?: {
    month?: string;
    year?: string;
    startDate?: string;
    endDate?: string;
  };
  onUpdate?: (updater: (prev: AppState) => AppState) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const COMMON_REASONS = [
  'Salah Ketik Menu / Salah Input POS',
  'Double Input / Billing Ganda',
  'Tamu Batal / Cancel Order Customer',
  'Ganti Metode Pembayaran / Split Bill',
  'Salah Diskon / Promo Tidak Terpasang',
  'Makanan / Minuman Habis (Sold Out)',
  'Masalah Teknis Sistem / POS Error',
  'Perubahan Meja / Pindah Meja',
  'Salah Pilih Meja',
  'Lainnya (Tulis Manual)'
];

const formatIDR = (num: number) => {
  return (Number(num) || 0).toLocaleString('id-ID');
};

export const VoidBillModule: React.FC<Props> = ({
  data,
  staffList = [],
  selectedOutlet = '',
  filters,
  onUpdate,
  showToast
}) => {
  const currentOutlet = selectedOutlet || data.outlet || 'SH THE BARN';
  const currentDate = filters?.startDate || new Date().toISOString().split('T')[0];
  const currentMonthKey = currentDate.substring(0, 7); // YYYY-MM

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL');
  const [selectedReasonFilter, setSelectedReasonFilter] = useState('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<'MONTH' | 'DATE'>('MONTH');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VoidBillRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [formDate, setFormDate] = useState(currentDate);
  const [formStaffName, setFormStaffName] = useState('');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formReasonPreset, setFormReasonPreset] = useState(COMMON_REASONS[0]);
  const [formReasonCustom, setFormReasonCustom] = useState('');
  const [formPic, setFormPic] = useState('');
  const [formBillNumber, setFormBillNumber] = useState('');
  const [formTableNumber, setFormTableNumber] = useState('');
  const [formShift, setFormShift] = useState<'LUNCH' | 'DINNER' | 'ALL_DAY'>('LUNCH');
  const [formNotes, setFormNotes] = useState('');

  // Extract all void bill records
  const allRecords = useMemo(() => {
    const list: VoidBillRecord[] = [];
    if (data.dailyVoidBills && typeof data.dailyVoidBills === 'object') {
      Object.values(data.dailyVoidBills).forEach(dayList => {
        if (Array.isArray(dayList)) {
          list.push(...dayList);
        }
      });
    }
    if (Array.isArray(data.voidBills)) {
      data.voidBills.forEach(item => {
        if (!list.some(x => x.id === item.id)) {
          list.push(item);
        }
      });
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [data.dailyVoidBills, data.voidBills]);

  // Filter records based on current period
  const monthRecords = useMemo(() => {
    return allRecords.filter(r => r.date.startsWith(currentMonthKey));
  }, [allRecords, currentMonthKey]);

  // Active records by date filter mode
  const activeRecords = useMemo(() => {
    let res = dateFilterMode === 'DATE'
      ? allRecords.filter(r => r.date === currentDate)
      : monthRecords;

    if (selectedStaffFilter !== 'ALL') {
      res = res.filter(r => r.staffName.toLowerCase() === selectedStaffFilter.toLowerCase());
    }
    if (selectedReasonFilter !== 'ALL') {
      res = res.filter(r => r.reason.toLowerCase() === selectedReasonFilter.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(r => 
        (r.staffName || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.pic || '').toLowerCase().includes(q) ||
        (r.billNumber || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      );
    }
    return res;
  }, [allRecords, monthRecords, dateFilterMode, currentDate, selectedStaffFilter, selectedReasonFilter, searchQuery]);

  // KPI Calculations
  const stats = useMemo(() => {
    const totalAmount = monthRecords.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalCount = monthRecords.length;
    const avgAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;

    // Staff frequency map
    const staffCountMap = new Map<string, { count: number; amount: number }>();
    monthRecords.forEach(r => {
      const s = r.staffName || 'Tidak Diketahui';
      const existing = staffCountMap.get(s) || { count: 0, amount: 0 };
      staffCountMap.set(s, {
        count: existing.count + 1,
        amount: existing.amount + (Number(r.amount) || 0)
      });
    });

    const staffRanking = Array.from(staffCountMap.entries())
      .map(([name, data]) => ({ name, count: data.count, amount: data.amount }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount);

    const topStaff = staffRanking[0] || null;

    // Reason frequency map
    const reasonCountMap = new Map<string, number>();
    monthRecords.forEach(r => {
      const reason = r.reason || 'Lainnya';
      reasonCountMap.set(reason, (reasonCountMap.get(reason) || 0) + 1);
    });
    const topReason = Array.from(reasonCountMap.entries()).sort((a, b) => b[1] - a[1])[0] || null;

    return {
      totalAmount,
      totalCount,
      avgAmount,
      topStaff,
      topReason,
      staffRanking
    };
  }, [monthRecords]);

  // Staff options extracted from Manpower Table of the current outlet
  const activeStaffList = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      role: string;
      division: string;
      section: string;
      isLeader: boolean;
      source: 'MANPOWER' | 'STAFF_LIST';
    }> = [];
    const seenNames = new Set<string>();

    const addStaff = (
      name: string,
      role: string,
      division: string,
      section: string,
      isLeader: boolean,
      source: 'MANPOWER' | 'STAFF_LIST',
      id?: string
    ) => {
      const cleanName = (name || '').trim();
      if (!cleanName) return;
      const key = cleanName.toLowerCase();
      if (seenNames.has(key)) return;
      seenNames.add(key);

      const roleLower = (role || '').toLowerCase();
      const secUpper = (section || '').toUpperCase();
      const checkLeader = isLeader ||
        roleLower.includes('manager') ||
        roleLower.includes('supervisor') ||
        roleLower.includes('captain') ||
        roleLower.includes('leader') ||
        roleLower.includes('mod') ||
        roleLower.includes('head') ||
        roleLower.includes('chef') ||
        roleLower.includes('cdp') ||
        secUpper.includes('LEADER');

      list.push({
        id: id || `st_${cleanName.replace(/\s+/g, '_')}`,
        name: cleanName,
        role: role || section || 'Staff',
        division: (division || 'SERVICE').toUpperCase(),
        section: section || role || 'General',
        isLeader: checkLeader,
        source
      });
    };

    // 1. Primary: Extract from Manpower Table of this specific outlet
    const resolvedManpower = resolveOutletManpowerData(data.manpowerData, currentOutlet, currentMonthKey);
    if (resolvedManpower && Array.isArray(resolvedManpower.sections)) {
      resolvedManpower.sections.forEach(sec => {
        const secDivision = sec.division || 'SERVICE';
        if (Array.isArray(sec.slots)) {
          sec.slots.forEach(slot => {
            if (slot.staffName && slot.staffName.trim()) {
              addStaff(
                slot.staffName,
                slot.position || sec.name,
                secDivision,
                sec.name,
                sec.name.toUpperCase().includes('LEADER'),
                'MANPOWER',
                slot.id || slot.staffId
              );
            }
          });
        }
      });
    }

    // Also scan all keys in data.manpowerData for this outlet
    if (data.manpowerData && typeof data.manpowerData === 'object') {
      Object.entries(data.manpowerData).forEach(([key, mpData]: [string, any]) => {
        if (!key.startsWith(currentOutlet) || !mpData || !Array.isArray(mpData.sections)) return;
        mpData.sections.forEach((sec: any) => {
          if (Array.isArray(sec.slots)) {
            sec.slots.forEach((slot: any) => {
              if (slot.staffName && slot.staffName.trim()) {
                addStaff(
                  slot.staffName,
                  slot.position || sec.name,
                  sec.division || 'SERVICE',
                  sec.name || '',
                  (sec.name || '').toUpperCase().includes('LEADER'),
                  'MANPOWER',
                  slot.id
                );
              }
            });
          }
        });
      });
    }

    // 2. Secondary: Combine with staffList for this outlet (active / not resigned)
    if (Array.isArray(staffList)) {
      staffList.forEach(s => {
        if (!s || !s.name) return;
        const sOutlet = s.outlet || '';
        if (sOutlet && sOutlet !== 'ALL' && sOutlet !== currentOutlet) return;
        if (s.status === 'RESIGNED' || s.status === 'RESIGNED_PROSEDUR' || s.status === 'RESIGNED_NON_PROSEDUR') return;
        addStaff(
          s.name,
          s.role || '',
          s.division || 'SERVICE',
          s.role || '',
          s.isLeader || false,
          'STAFF_LIST',
          s.id
        );
      });
    }

    return list.sort((a, b) => {
      if (a.division !== b.division) return a.division.localeCompare(b.division);
      if (a.isLeader && !b.isLeader) return -1;
      if (!a.isLeader && b.isLeader) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [data.manpowerData, currentOutlet, currentMonthKey, staffList]);

  // Leaders / PIC options from Manpower
  const picOptions = useMemo(() => {
    const leaders = activeStaffList.filter(s => s.isLeader);
    const nonLeaders = activeStaffList.filter(s => !s.isLeader);
    return [...leaders, ...nonLeaders];
  }, [activeStaffList]);

  // Open Modal for New Record
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormDate(currentDate);
    setFormStaffName(activeStaffList[0]?.name || '');
    setFormAmount('');
    setFormReasonPreset(COMMON_REASONS[0]);
    setFormReasonCustom('');
    const defaultPic = activeStaffList.find(s => s.isLeader)?.name || activeStaffList[0]?.name || '';
    setFormPic(defaultPic);
    setFormBillNumber('');
    setFormTableNumber('');
    setFormShift('LUNCH');
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Open Modal for Edit Record
  const handleOpenEditModal = (item: VoidBillRecord) => {
    setEditingItem(item);
    setFormDate(item.date);
    setFormStaffName(item.staffName);
    setFormAmount(item.amount);
    if (COMMON_REASONS.includes(item.reason)) {
      setFormReasonPreset(item.reason);
      setFormReasonCustom('');
    } else {
      setFormReasonPreset('Lainnya (Tulis Manual)');
      setFormReasonCustom(item.reason);
    }
    setFormPic(item.pic);
    setFormBillNumber(item.billNumber || '');
    setFormTableNumber(item.tableNumber || '');
    setFormShift(item.shift || 'LUNCH');
    setFormNotes(item.notes || '');
    setIsModalOpen(true);
  };

  // Submit Form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStaffName.trim()) {
      showToast?.('Pilih atau masukkan nama staff!', 'error');
      return;
    }
    const finalAmount = Number(formAmount) || 0;
    if (finalAmount <= 0) {
      showToast?.('Nominal amount harus lebih dari 0!', 'error');
      return;
    }
    const finalReason = formReasonPreset === 'Lainnya (Tulis Manual)'
      ? (formReasonCustom.trim() || 'Lainnya')
      : formReasonPreset;

    const matchedStaff = activeStaffList.find(s => s.name.toLowerCase() === formStaffName.toLowerCase());
    const matchedPic = activeStaffList.find(s => s.name.toLowerCase() === formPic.toLowerCase());

    const record: VoidBillRecord = {
      id: editingItem ? editingItem.id : `void_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      outlet: currentOutlet,
      date: formDate,
      staffName: formStaffName.trim(),
      staffRole: matchedStaff?.role || '',
      staffDivision: (matchedStaff?.division as any) || '',
      amount: finalAmount,
      reason: finalReason,
      pic: formPic.trim() || 'Duty Manager / Leader',
      picRole: matchedPic?.role || '',
      billNumber: formBillNumber.trim(),
      tableNumber: formTableNumber.trim(),
      shift: formShift,
      notes: formNotes.trim(),
      updatedAt: new Date().toISOString()
    };

    if (!editingItem) {
      record.createdAt = new Date().toISOString();
    }

    onUpdate?.(prev => {
      const prevDaily = { ...(prev.dailyVoidBills || {}) };
      const targetDate = record.date;
      const prevDayList = prevDaily[targetDate] || [];

      let updatedDayList: VoidBillRecord[];
      if (editingItem) {
        // If date changed, remove from old date
        if (editingItem.date !== targetDate && prevDaily[editingItem.date]) {
          prevDaily[editingItem.date] = prevDaily[editingItem.date].filter(x => x.id !== editingItem.id);
        }
        updatedDayList = prevDayList.map(x => x.id === editingItem.id ? record : x);
        if (!updatedDayList.some(x => x.id === editingItem.id)) {
          updatedDayList.push(record);
        }
      } else {
        updatedDayList = [record, ...prevDayList];
      }

      prevDaily[targetDate] = updatedDayList;

      // Also maintain flat voidBills list
      const prevFlat = Array.isArray(prev.voidBills) ? prev.voidBills.filter(x => x.id !== record.id) : [];
      const updatedFlat = [record, ...prevFlat];

      return {
        ...prev,
        dailyVoidBills: prevDaily,
        voidBills: updatedFlat
      };
    }, undefined, true);

    try {
      window.dispatchEvent(new CustomEvent('voidBillsUpdated', { detail: { record, outlet: currentOutlet } }));
      window.dispatchEvent(new CustomEvent('appVoidBillsUpdated', { detail: { record, outlet: currentOutlet } }));
    } catch (e) {}

    setIsModalOpen(false);
    showToast?.(editingItem ? 'Data Void Bill berhasil diperbarui!' : 'Void Bill baru berhasil dicatat!', 'success');
  };

  // Delete Record
  const handleDeleteRecord = (id: string) => {
    onUpdate?.((prev: any) => {
      const prevDaily = { ...(prev.dailyVoidBills || {}) };
      Object.keys(prevDaily).forEach(d => {
        if (Array.isArray(prevDaily[d])) {
          prevDaily[d] = prevDaily[d].filter(x => x.id !== id);
        }
      });
      const prevFlat = Array.isArray(prev.voidBills) ? prev.voidBills.filter(x => x.id !== id) : [];
      return {
        ...prev,
        dailyVoidBills: prevDaily,
        voidBills: prevFlat
      };
    }, undefined, true);

    try {
      window.dispatchEvent(new CustomEvent('voidBillsUpdated', { detail: { deletedId: id, outlet: currentOutlet } }));
      window.dispatchEvent(new CustomEvent('appVoidBillsUpdated', { detail: { deletedId: id, outlet: currentOutlet } }));
    } catch (e) {}

    setDeleteConfirmId(null);
    showToast?.('Data Void Bill telah dihapus!', 'info');
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Void Bill Report');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Shift', key: 'shift', width: 12 },
      { header: 'No. Bill', key: 'billNumber', width: 14 },
      { header: 'Meja', key: 'tableNumber', width: 10 },
      { header: 'Nama Staff', key: 'staffName', width: 22 },
      { header: 'Role/Divisi', key: 'role', width: 16 },
      { header: 'Nominal Void (Rp)', key: 'amount', width: 20 },
      { header: 'Alasan Void', key: 'reason', width: 30 },
      { header: 'PIC', key: 'pic', width: 20 },
      { header: 'Catatan', key: 'notes', width: 25 },
    ];

    activeRecords.forEach((item, index) => {
      worksheet.addRow({
        no: index + 1,
        date: item.date,
        shift: item.shift || '-',
        billNumber: item.billNumber || '-',
        tableNumber: item.tableNumber || '-',
        staffName: item.staffName,
        role: `${item.staffRole || ''} ${item.staffDivision ? `(${item.staffDivision})` : ''}`.trim() || '-',
        amount: item.amount,
        reason: item.reason,
        pic: item.pic,
        notes: item.notes || '-'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Void_Bill_${currentOutlet}_${currentMonthKey}.xlsx`);
    showToast?.('File Excel Void Bill berhasil diunduh!', 'success');
  };

  // Copy WhatsApp Summary
  const handleCopyWhatsApp = () => {
    const dateStr = dateFilterMode === 'DATE' ? currentDate : `Bulan ${currentMonthKey}`;
    const lines = [
      `*LAPORAN VOID BILL - ${currentOutlet.toUpperCase()}*`,
      `*Periode:* ${dateStr}`,
      `*Total Nominal Void:* Rp ${formatIDR(stats.totalAmount)}`,
      `*Total Transaksi:* ${stats.totalCount} kali`,
      `*Rata-Rata per Void:* Rp ${formatIDR(stats.avgAmount)}`,
      ``,
      `*AKUMULASI KESALAHAN STAFF:*`
    ];

    if (stats.staffRanking.length > 0) {
      stats.staffRanking.forEach((st, idx) => {
        lines.push(`${idx + 1}. *${st.name}*: ${st.count}x kesalahan (Rp ${formatIDR(st.amount)})`);
      });
    } else {
      lines.push(`(Tidak ada void bill tercatat pada periode ini)`);
    }

    if (activeRecords.length > 0) {
      lines.push(``);
      lines.push(`*DETAIL TRANSAKSI TERAKHIR:*`);
      activeRecords.slice(0, 10).forEach((item, idx) => {
        lines.push(`${idx + 1}. [${item.date}] *${item.staffName}* - Rp ${formatIDR(item.amount)}`);
        lines.push(`   Alasan: ${item.reason} | PIC: ${item.pic}${item.billNumber ? ` | Bill: #${item.billNumber}` : ''}`);
      });
    }

    lines.push(``);
    lines.push(`*Generated from SH THE BARN Management System*`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast?.('Laporan Void Bill berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      showToast?.('Gagal menyalin ke clipboard', 'error');
    });
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-white">
      {/* HEADER SECTION */}
      <div className="glass-card p-6 border border-rose-500/20 bg-slate-900/90 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl border border-rose-500/30 shadow-lg shadow-rose-950/40">
                <i className="fas fa-ban"></i>
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  VOID BILL MONITORING
                  <span className="text-[10px] font-black bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                    OUTLET
                  </span>
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  {currentOutlet} • Periode {currentMonthKey}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 max-w-xl">
              Pencatatan &amp; pengawasan kesalahan void bill outlet. Mengidentifikasi staf pelaku void, alasan pembatalan, nominal kerugian/koreksi, serta verifikasi PIC dari Manpower.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenAddModal}
              className="px-5 py-3 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-950/50 border border-rose-400/30 flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
            >
              <i className="fas fa-plus-circle text-sm"></i>
              <span>Input Void Bill</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-emerald-500/30 flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md"
              title="Unduh data Excel"
            >
              <i className="fas fa-file-excel text-emerald-400"></i>
              <span>Excel</span>
            </button>
            <button
              onClick={handleCopyWhatsApp}
              className="px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-emerald-500/30 flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md"
              title="Salin template WhatsApp"
            >
              <i className="fab fa-whatsapp text-emerald-400"></i>
              <span>Salin WA</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL AMOUNT */}
        <div className="glass-card p-5 bg-slate-900/80 border border-rose-500/20 rounded-2xl relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Nominal Void</span>
            <i className="fas fa-money-bill-wave text-rose-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">
            Rp {formatIDR(stats.totalAmount)}
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Total akumulasi bulan {currentMonthKey}
          </div>
        </div>

        {/* TOTAL TRANSAKSI */}
        <div className="glass-card p-5 bg-slate-900/80 border border-amber-500/20 rounded-2xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Frekuensi Void</span>
            <i className="fas fa-receipt text-amber-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-amber-300 tracking-tight">
            {stats.totalCount} <span className="text-base text-slate-400 font-bold">Kali</span>
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Jumlah nota/bill yang dibatalkan
          </div>
        </div>

        {/* RATA-RATA NOMINAL */}
        <div className="glass-card p-5 bg-slate-900/80 border border-blue-500/20 rounded-2xl relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Rata-Rata per Void</span>
            <i className="fas fa-calculator text-blue-400 text-lg"></i>
          </div>
          <div className="text-2xl lg:text-3xl font-black text-blue-300 tracking-tight">
            Rp {formatIDR(stats.avgAmount)}
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Nilai rata-rata kesalahan per transaksi
          </div>
        </div>

        {/* STAFF TERBANYAK KESALAHAN */}
        <div className="glass-card p-5 bg-slate-900/80 border border-purple-500/20 rounded-2xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Staff Terbanyak Void</span>
            <i className="fas fa-user-xmark text-purple-400 text-lg"></i>
          </div>
          <div className="text-lg lg:text-xl font-black text-purple-300 truncate tracking-tight">
            {stats.topStaff ? stats.topStaff.name : '-'}
          </div>
          <div className="text-[9px] text-purple-200/80 font-bold mt-2 flex items-center gap-1.5">
            {stats.topStaff ? (
              <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md border border-purple-500/30">
                {stats.topStaff.count}x kesalahan (Rp {formatIDR(stats.topStaff.amount)})
              </span>
            ) : (
              <span>Belum ada data</span>
            )}
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className="glass-card p-4 bg-slate-900/80 border border-white/10 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Mode Switcher: Bulan vs Tanggal Hari Ini */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setDateFilterMode('MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                dateFilterMode === 'MONTH'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Bulan Ini ({currentMonthKey})
            </button>
            <button
              onClick={() => setDateFilterMode('DATE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                dateFilterMode === 'DATE'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tanggal Terpilih ({currentDate})
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari nama staff, alasan, PIC, nomor bill..."
              className="w-full bg-slate-950 pl-9 pr-3 py-2 rounded-xl border border-white/10 text-white text-xs outline-none focus:border-rose-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter Staff:</span>
            <select
              value={selectedStaffFilter}
              onChange={e => setSelectedStaffFilter(e.target.value)}
              className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/10 text-white text-xs outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="ALL">Semua Staff ({monthRecords.length} Data)</option>
              {stats.staffRanking.length > 0 && (
                <optgroup label="Staff Pernah Void Bulan Ini">
                  {stats.staffRanking.map(st => (
                    <option key={`rnk_${st.name}`} value={st.name}>
                      {st.name} ({st.count}x void - Rp {formatIDR(st.amount)})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={`Seluruh Staff Manpower ${currentOutlet}`}>
                {activeStaffList
                  .filter(st => !stats.staffRanking.some(r => r.name.toLowerCase() === st.name.toLowerCase()))
                  .map(st => (
                    <option key={`flt_all_${st.name}`} value={st.name}>
                      {st.name} — {st.role || st.division}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter Alasan:</span>
            <select
              value={selectedReasonFilter}
              onChange={e => setSelectedReasonFilter(e.target.value)}
              className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/10 text-white text-xs outline-none focus:border-rose-500"
            >
              <option value="ALL">Semua Alasan</option>
              {COMMON_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {(selectedStaffFilter !== 'ALL' || selectedReasonFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedStaffFilter('ALL');
                setSelectedReasonFilter('ALL');
                setSearchQuery('');
              }}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-[10px] font-bold uppercase transition-all"
            >
              Reset Filter
            </button>
          )}

          <div className="ml-auto text-[10px] font-bold text-slate-400">
            Menampilkan <strong className="text-white">{activeRecords.length}</strong> dari {monthRecords.length} data
          </div>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="glass-card bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
          <div className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <i className="fas fa-list text-rose-400"></i>
            Daftar Transaksi Void Bill
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            Outlet: <strong className="text-rose-300">{currentOutlet}</strong>
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                <th className="p-3 text-center w-12">No</th>
                <th className="p-3">Tanggal &amp; Shift</th>
                <th className="p-3">Bill / Meja</th>
                <th className="p-3">Nama Staff</th>
                <th className="p-3 text-right">Nominal Amount</th>
                <th className="p-3">Alasan Pembatalan</th>
                <th className="p-3">PIC Penanggung Jawab</th>
                <th className="p-3">Catatan</th>
                <th className="p-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {activeRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <i className="fas fa-inbox text-3xl opacity-30"></i>
                      <p className="text-xs font-bold uppercase tracking-wider">Tidak ada data Void Bill yang ditemukan</p>
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        + Input Void Bill Baru
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                activeRecords.map((item, idx) => {
                  return (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-center text-slate-500 font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        <div className="font-bold text-white">{item.date}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          {item.shift || 'LUNCH'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-amber-300 text-[11px]">
                          {item.billNumber ? `#${item.billNumber}` : '-'}
                        </div>
                        {item.tableNumber && (
                          <div className="text-[9px] text-slate-400">Meja: {item.tableNumber}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-black text-white uppercase text-[11px] flex items-center gap-1.5">
                          <i className="fas fa-user text-rose-400 text-[10px]"></i>
                          {item.staffName}
                        </div>
                        {(item.staffRole || item.staffDivision) && (
                          <div className="text-[9px] text-slate-400 font-medium">
                            {item.staffRole} {item.staffDivision ? `• ${item.staffDivision}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono font-black text-rose-400 text-sm">
                          Rp {formatIDR(item.amount)}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs">
                        <span className="inline-block bg-slate-800/80 text-rose-200 px-2 py-0.5 rounded-lg border border-rose-500/20 text-[10px] font-bold">
                          {item.reason}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-indigo-300 flex items-center gap-1.5 text-[11px]">
                          <i className="fas fa-shield-halved text-indigo-400 text-[10px]"></i>
                          {item.pic}
                        </div>
                        {item.picRole && (
                          <div className="text-[9px] text-slate-500">{item.picRole}</div>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 text-[10px] italic max-w-xs truncate" title={item.notes}>
                        {item.notes || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="w-7 h-7 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center transition-all cursor-pointer border border-indigo-500/20 active:scale-95"
                            title="Edit data void"
                          >
                            <i className="fas fa-edit text-xs"></i>
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-all cursor-pointer border border-rose-500/20 active:scale-95"
                            title="Hapus data void"
                          >
                            <i className="fas fa-trash-alt text-xs"></i>
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

        <div className="p-4 border-t border-white/5">
          <FeatureSubmitSyncButton
            featureName="Void Bill Monitoring"
            subtext="Sinkronkan data void bill ke server agar supervisor dan perangkat lain langsung melihat update realtime."
          />
        </div>
      </div>

      {/* INPUT / EDIT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card bg-slate-900 border border-rose-500/30 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg border border-rose-500/30">
                    <i className="fas fa-ban"></i>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-wider">
                      {editingItem ? 'Edit Data Void Bill' : 'Input Void Bill Baru'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {currentOutlet}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="space-y-4">
                {/* TANGGAL & SHIFT */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Tanggal Transaksi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      required
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs font-bold outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Shift
                    </label>
                    <select
                      value={formShift}
                      onChange={e => setFormShift(e.target.value as any)}
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs font-bold outline-none focus:border-rose-500"
                    >
                      <option value="LUNCH">Shift Siang (Lunch)</option>
                      <option value="DINNER">Shift Malam (Dinner)</option>
                      <option value="ALL_DAY">All Day / Closing</option>
                    </select>
                  </div>
                </div>

                {/* NAMA STAFF (PILIHAN DARI TABEL MANPOWER OUTLET) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <i className="fas fa-user-tag text-rose-400"></i>
                      Nama Staff Pelaku Void <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[8px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Tabel Manpower ({activeStaffList.length} Staff)
                    </span>
                  </div>
                  <div className="space-y-2">
                    <select
                      value={formStaffName}
                      onChange={e => {
                        const val = e.target.value;
                        setFormStaffName(val);
                        const matched = activeStaffList.find(s => s.name.toLowerCase() === val.toLowerCase());
                        if (matched && !formPic) {
                          const defaultPic = activeStaffList.find(s => s.isLeader);
                          if (defaultPic) setFormPic(defaultPic.name);
                        }
                      }}
                      required
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs font-black uppercase outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="">-- Pilih Nama Staff dari Tabel Manpower --</option>
                      {['SERVICE', 'KITCHEN', 'BAR'].map(div => {
                        const inDiv = activeStaffList.filter(s => (s.division || 'SERVICE').toUpperCase() === div);
                        if (inDiv.length === 0) return null;
                        return (
                          <optgroup key={div} label={`DIVISI ${div} (${inDiv.length} Orang)`}>
                            {inDiv.map(st => (
                              <option key={st.id || st.name} value={st.name}>
                                {st.name} — {st.role || st.section} {st.isLeader ? '⭐ (Leader)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {activeStaffList.filter(s => !['SERVICE', 'KITCHEN', 'BAR'].includes((s.division || '').toUpperCase())).length > 0 && (
                        <optgroup label="STAFF LAINNYA">
                          {activeStaffList.filter(s => !['SERVICE', 'KITCHEN', 'BAR'].includes((s.division || '').toUpperCase())).map(st => (
                            <option key={st.id || st.name} value={st.name}>
                              {st.name} — {st.role || st.division}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {/* Fallback input jika staff belum terdaftar */}
                    <div className="text-[8px] text-slate-500 flex items-center gap-1.5 bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                      <span className="whitespace-nowrap font-bold">Ketik manual:</span>
                      <input
                        type="text"
                        placeholder="Ketik nama staff manual jika tidak ada di list..."
                        value={formStaffName}
                        onChange={e => setFormStaffName(e.target.value)}
                        className="bg-slate-950 px-2 py-0.5 rounded border border-white/10 text-white text-[10px] outline-none focus:border-rose-500 flex-1 uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* AMOUNT NOMINAL */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Nominal Amount (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-black">RP</span>
                    <input
                      type="number"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      required
                      min="1"
                      className="w-full bg-slate-950 pl-10 pr-3 py-2.5 rounded-xl border border-white/10 text-rose-400 text-sm font-black outline-none focus:border-rose-500"
                    />
                  </div>
                  {/* Quick Amount Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[8px] text-slate-500 font-bold uppercase">Cepat:</span>
                    {[25000, 50000, 100000, 250000, 500000].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormAmount(chip)}
                        className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[8px] font-bold border border-white/5 transition-all cursor-pointer"
                      >
                        +{formatIDR(chip)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* REASON / ALASAN VOID */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Alasan Pembatalan (Reason) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formReasonPreset}
                    onChange={e => setFormReasonPreset(e.target.value)}
                    className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs font-bold outline-none focus:border-rose-500 mb-2 cursor-pointer"
                  >
                    {COMMON_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {formReasonPreset === 'Lainnya (Tulis Manual)' && (
                    <input
                      type="text"
                      value={formReasonCustom}
                      onChange={e => setFormReasonCustom(e.target.value)}
                      placeholder="Tulis alasan void secara spesifik..."
                      required
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-rose-500/50 text-white text-xs outline-none focus:border-rose-400"
                    />
                  )}
                </div>

                {/* PIC (PILIHAN DARI DATA MANPOWER) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <i className="fas fa-shield-halved text-emerald-400"></i>
                      PIC Verifikasi / Otorisasi <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Leader / Manager
                    </span>
                  </div>
                  <div className="space-y-2">
                    <select
                      value={formPic}
                      onChange={e => setFormPic(e.target.value)}
                      required
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs font-black uppercase outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">-- Pilih PIC dari Manpower (Leader / Manager) --</option>
                      {picOptions.map(st => (
                        <option key={`pic_${st.id || st.name}`} value={st.name}>
                          {st.isLeader ? '⭐ ' : ''}{st.name} {st.role ? `• ${st.role}` : ''} ({st.division || 'SERVICE'})
                        </option>
                      ))}
                    </select>
                    <div className="text-[8px] text-slate-500 flex items-center gap-1.5 bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                      <span className="whitespace-nowrap font-bold">Ketik PIC manual:</span>
                      <input
                        type="text"
                        placeholder="Ketik nama PIC manual..."
                        value={formPic}
                        onChange={e => setFormPic(e.target.value)}
                        className="bg-slate-950 px-2 py-0.5 rounded border border-white/10 text-white text-[10px] outline-none focus:border-emerald-500 flex-1 uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* NOMOR BILL & MEJA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Nomor Bill / POS Ref (Opsional)
                    </label>
                    <input
                      type="text"
                      value={formBillNumber}
                      onChange={e => setFormBillNumber(e.target.value)}
                      placeholder="Contoh: 0042 atau B-129"
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs outline-none focus:border-rose-500 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      Nomor Meja (Opsional)
                    </label>
                    <input
                      type="text"
                      value={formTableNumber}
                      onChange={e => setFormTableNumber(e.target.value)}
                      placeholder="Contoh: T-12 / VIP 1"
                      className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs outline-none focus:border-rose-500 uppercase"
                    />
                  </div>
                </div>

                {/* CATATAN TAMBAHAN */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Keterangan tambahan kronologi void..."
                    className="w-full bg-slate-950 p-2.5 rounded-xl border border-white/10 text-white text-xs outline-none focus:border-rose-500"
                  />
                </div>

                {/* BUTTONS */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer uppercase"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-950/40 transition-all active:scale-95 cursor-pointer"
                  >
                    {editingItem ? 'Simpan Perubahan' : 'Catat Void Bill'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl mx-auto border border-rose-500/30">
                <i className="fas fa-trash-alt"></i>
              </div>
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-wider">Hapus Data Void?</h4>
                <p className="text-xs text-slate-400 mt-1">Data yang dihapus tidak dapat dikembalikan lagi ke dalam laporan.</p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer uppercase"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleDeleteRecord(deleteConfirmId)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 transition-all active:scale-95 cursor-pointer"
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

export default VoidBillModule;
