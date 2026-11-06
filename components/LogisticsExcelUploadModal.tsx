import React, { useState, useRef } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { LogisticItem } from '../types';
import { PeriodInfo } from './LogisticsModule';

export interface ParsedExcelRow {
  rowNumber: number;
  name: string;
  price: number;
  notes?: string;
  status: 'NEW_ITEM' | 'UPDATE_PRICE';
  existingId?: string;
  currentPrice?: number;
}

interface LogisticsExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingItems: LogisticItem[];
  currentPeriod: PeriodInfo;
  logisticPeriodPrices: Record<string, Record<string, number>>;
  selectedDate: string;
  onApply: (
    finalItems: LogisticItem[],
    updatedPeriodPrices: Record<string, Record<string, number>>,
    summary: { added: number; updated: number }
  ) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const LogisticsExcelUploadModal: React.FC<LogisticsExcelUploadModalProps> = ({
  isOpen,
  onClose,
  existingItems,
  currentPeriod,
  logisticPeriodPrices,
  selectedDate,
  onApply,
  showToast
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedExcelRow[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'UPDATE'>('ALL');
  const [applyToPeriod, setApplyToPeriod] = useState(true);
  const [applyToMaster, setApplyToMaster] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper to resolve current price of existing item
  const resolveCurrentPrice = (itemId: string): number => {
    if (logisticPeriodPrices[currentPeriod.key]?.[itemId] !== undefined) {
      return logisticPeriodPrices[currentPeriod.key][itemId];
    }
    const item = existingItems.find(i => i.id === itemId);
    return item?.price || 0;
  };

  // Download Empty Excel Template
  const handleDownloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Template Barang Logistik');

      sheet.views = [{ showGridLines: true }];

      // Title & Instruction
      sheet.mergeCells('A1:D1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'TEMPLATE IMPORT DATA BARANG & HARGA SATUAN LOGISTIK';
      titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 28;

      sheet.mergeCells('A2:D2');
      const noteCell = sheet.getCell('A2');
      noteCell.value = 'Petunjuk: Masukkan Nama Barang dan Harga Satuan (angka bulat tanpa titik/koma). Baris dengan nama barang kosong akan diabaikan.';
      noteCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
      sheet.getRow(2).height = 20;

      // Header row
      const headers = ['NO', 'NAMA BARANG', 'HARGA SATUAN (RP)', 'KETERANGAN / SPESIFIKASI'];
      const hRow = sheet.addRow(headers);
      hRow.height = 24;
      hRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      hRow.alignment = { horizontal: 'center', vertical: 'middle' };
      hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      // Example rows
      const sampleData = [
        [1, 'PIRING MAKAN SH 9 INCH', 35000, 'Keramik Putih'],
        [2, 'GELAS JUS KACA TINGGI', 18500, 'Kaca Bening'],
        [3, 'SENDOK MAKAN STAINLESS 304', 12000, 'Tebal 2.5mm'],
        [4, 'GARPU MAKAN STAINLESS 304', 12000, 'Tebal 2.5mm'],
        [5, 'MANGKOK SOUP KERAMIK', 28000, 'Diameter 6 Inch'],
        [6, 'NAMPAN SAJI KAYU RECTANGULAR', 65000, 'Kayu Mahoni / Jati']
      ];

      sampleData.forEach(row => {
        const r = sheet.addRow(row);
        r.height = 20;
        r.getCell(1).alignment = { horizontal: 'center' };
        r.getCell(3).numFmt = '#,##0';
      });

      sheet.getColumn(1).width = 8;
      sheet.getColumn(2).width = 40;
      sheet.getColumn(3).width = 24;
      sheet.getColumn(4).width = 30;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), 'Template_Import_Barang_Logistik.xlsx');
      showToast('Template Excel berhasil diunduh.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Gagal membuat template Excel: ' + err.message, 'error');
    }
  };

  // Download Existing Items as Excel (So users can just update prices)
  const handleExportExistingItems = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Daftar Barang Logistik');

      sheet.views = [{ showGridLines: true }];

      sheet.mergeCells('A1:D1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `DAFTAR MASTER BARANG LOGISTIK - ${currentPeriod.name}`;
      titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 28;

      const headers = ['NO', 'NAMA BARANG', 'HARGA SATUAN (RP)', 'STATUS DI SISTEM'];
      const hRow = sheet.addRow(headers);
      hRow.height = 24;
      hRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      hRow.alignment = { horizontal: 'center', vertical: 'middle' };
      hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      existingItems.forEach((item, idx) => {
        const curPrice = resolveCurrentPrice(item.id);
        const r = sheet.addRow([idx + 1, item.description, curPrice, 'Terdaftar']);
        r.height = 20;
        r.getCell(1).alignment = { horizontal: 'center' };
        r.getCell(3).numFmt = '#,##0';
      });

      sheet.getColumn(1).width = 8;
      sheet.getColumn(2).width = 42;
      sheet.getColumn(3).width = 24;
      sheet.getColumn(4).width = 20;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Daftar_Barang_Logistik_${currentPeriod.key}.xlsx`);
      showToast('Daftar barang saat ini berhasil diexport ke Excel.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Gagal mengekspor data: ' + err.message, 'error');
    }
  };

  // Parse Excel File
  const parseExcelFile = async (uploadedFile: File) => {
    setIsParsing(true);
    setFile(uploadedFile);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Lembar kerja (sheet) Excel tidak ditemukan.');
      }

      // Map existing items by normalized description for quick matching
      const existingMap = new Map<string, LogisticItem>();
      existingItems.forEach(item => {
        const norm = item.description.trim().toLowerCase();
        if (norm) existingMap.set(norm, item);
      });

      let nameColIdx = 2; // Default column 2 (B)
      let priceColIdx = 3; // Default column 3 (C)
      let notesColIdx = 4; // Default column 4 (D)
      let startRow = 2; // Default row after header

      // Scan first 10 rows to detect header row dynamically
      for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
        const row = worksheet.getRow(r);
        let foundName = false;
        let foundPrice = false;

        row.eachCell((cell, colNum) => {
          const val = String(cell.value || '').trim().toLowerCase();
          if (/nama|barang|item|deskripsi|description/i.test(val)) {
            nameColIdx = colNum;
            foundName = true;
          }
          if (/harga|price|tarif|satuan|nilai/i.test(val)) {
            priceColIdx = colNum;
            foundPrice = true;
          }
          if (/keterangan|ket|spesifikasi|notes|satuan/i.test(val)) {
            notesColIdx = colNum;
          }
        });

        if (foundName || foundPrice) {
          startRow = r + 1;
          break;
        }
      }

      const rows: ParsedExcelRow[] = [];
      const seenNamesInFile = new Set<string>();

      for (let r = startRow; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);

        // Read Raw Name
        const rawNameVal = row.getCell(nameColIdx).value;
        let nameStr = '';
        if (typeof rawNameVal === 'object' && rawNameVal !== null) {
          if ('richText' in rawNameVal && Array.isArray((rawNameVal as any).richText)) {
            nameStr = (rawNameVal as any).richText.map((t: any) => t.text).join('');
          } else if ('text' in rawNameVal) {
            nameStr = String((rawNameVal as any).text);
          } else {
            nameStr = String((rawNameVal as any).result || '');
          }
        } else {
          nameStr = String(rawNameVal || '');
        }

        nameStr = nameStr.trim();
        // Skip empty names or duplicate headers
        if (!nameStr || /^no$/i.test(nameStr) || /^nama barang$/i.test(nameStr)) {
          continue;
        }

        const normName = nameStr.toLowerCase();
        // Skip duplicate names in the same upload file (keep latest)
        if (seenNamesInFile.has(normName)) {
          continue;
        }
        seenNamesInFile.add(normName);

        // Read Raw Price
        const rawPriceVal = row.getCell(priceColIdx).value;
        let priceNum = 0;

        if (typeof rawPriceVal === 'number') {
          priceNum = rawPriceVal;
        } else if (typeof rawPriceVal === 'string') {
          const cleaned = rawPriceVal.replace(/[^0-9.-]/g, '');
          priceNum = parseFloat(cleaned) || 0;
        } else if (rawPriceVal && typeof rawPriceVal === 'object') {
          if ('result' in rawPriceVal) {
            const res = (rawPriceVal as any).result;
            priceNum = typeof res === 'number' ? res : parseFloat(String(res).replace(/[^0-9.-]/g, '')) || 0;
          }
        }

        // Notes / Spec
        const notesVal = String(row.getCell(notesColIdx).value || '').trim();

        // Check if existing
        const matchedItem = existingMap.get(normName);
        if (matchedItem) {
          const curPrice = resolveCurrentPrice(matchedItem.id);
          rows.push({
            rowNumber: r,
            name: matchedItem.description, // keep canonical casing if already registered
            price: Math.max(0, priceNum),
            notes: notesVal || undefined,
            status: 'UPDATE_PRICE',
            existingId: matchedItem.id,
            currentPrice: curPrice
          });
        } else {
          rows.push({
            rowNumber: r,
            name: nameStr.toUpperCase(),
            price: Math.max(0, priceNum),
            notes: notesVal || undefined,
            status: 'NEW_ITEM',
            currentPrice: 0
          });
        }
      }

      if (rows.length === 0) {
        showToast('Tidak ada data barang yang valid ditemukan pada file Excel. Pastikan kolom Nama Barang terisi.', 'error');
        setParsedRows([]);
      } else {
        setParsedRows(rows);
        showToast(`Berhasil membaca ${rows.length} data barang dari Excel!`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memproses file Excel: ' + (err.message || 'Format file tidak didukung'), 'error');
      setParsedRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      parseExcelFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.xlsx') && !droppedFile.name.endsWith('.xls')) {
        showToast('Mohon unggah file format Excel (.xlsx atau .xls)', 'error');
        return;
      }
      parseExcelFile(droppedFile);
    }
  };

  // Filter parsed rows for preview table
  const filteredRows = parsedRows.filter(r => {
    if (statusFilter === 'NEW' && r.status !== 'NEW_ITEM') return false;
    if (statusFilter === 'UPDATE' && r.status !== 'UPDATE_PRICE') return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.notes && r.notes.toLowerCase().includes(q));
    }
    return true;
  });

  const countNew = parsedRows.filter(r => r.status === 'NEW_ITEM').length;
  const countUpdate = parsedRows.filter(r => r.status === 'UPDATE_PRICE').length;

  // Apply imported data
  const handleApplyImport = () => {
    if (parsedRows.length === 0) {
      showToast('Belum ada data barang yang siap diimpor.', 'error');
      return;
    }

    const updatedItemsList = [...existingItems];
    const updatedPricesMap = {
      ...(logisticPeriodPrices || {}),
      [currentPeriod.key]: {
        ...((logisticPeriodPrices || {})[currentPeriod.key] || {})
      }
    };

    let addedCount = 0;
    let updatedCount = 0;

    parsedRows.forEach((row, idx) => {
      if (row.status === 'UPDATE_PRICE' && row.existingId) {
        // Update price for period
        if (applyToPeriod) {
          updatedPricesMap[currentPeriod.key][row.existingId] = row.price;
        }
        // Update master item price
        if (applyToMaster) {
          const itemIdx = updatedItemsList.findIndex(i => i.id === row.existingId);
          if (itemIdx >= 0) {
            updatedItemsList[itemIdx] = {
              ...updatedItemsList[itemIdx],
              price: row.price
            };
          }
        }
        updatedCount++;
      } else if (row.status === 'NEW_ITEM') {
        const newId = `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        const newItem: LogisticItem = {
          id: newId,
          description: row.name,
          createdAt: selectedDate,
          price: row.price
        };
        updatedItemsList.push(newItem);

        if (applyToPeriod) {
          updatedPricesMap[currentPeriod.key][newId] = row.price;
        }
        addedCount++;
      }
    });

    onApply(updatedItemsList, updatedPricesMap, { added: addedCount, updated: updatedCount });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[70] p-4 animate-fade-in">
      <div className="w-full max-w-4xl max-h-[92vh] glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col bg-slate-900 animate-scale-up">
        {/* Header Modal */}
        <div className="p-5 bg-slate-950/60 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/30">
              <i className="fas fa-file-excel text-lg"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                Upload Data Nama Barang & Harga Satuan by Excel
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-mono">
                  {currentPeriod.name}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Impor master nama barang baru sekaligus pembaruan harga satuan otomatis via spreadsheet Excel (.xlsx / .xls)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Action Download Templates */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <i className="fas fa-lightbulb text-amber-400 text-xs"></i>
                Format File & Template Excel
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Gunakan template kosong atau unduh daftar barang yang sudah ada untuk diedit harganya langsung di Excel.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              >
                <i className="fas fa-download text-xs"></i>
                Download Template Kosong
              </button>
              <button
                type="button"
                onClick={handleExportExistingItems}
                disabled={existingItems.length === 0}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-40"
              >
                <i className="fas fa-file-export text-xs"></i>
                Export Master Saat Ini ({existingItems.length} Item)
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                : file
                ? 'border-emerald-500/50 bg-emerald-950/20'
                : 'border-white/10 hover:border-emerald-500/40 bg-slate-950/30 hover:bg-slate-950/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl shadow-inner">
                {isParsing ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-cloud-arrow-up"></i>
                )}
              </div>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-wider">
                  {file ? file.name : 'Klik untuk Memilih File atau Drag & Drop File Excel ke Sini'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Mendukung format Microsoft Excel (.xlsx, .xls). Kolom wajib: <span className="text-emerald-300 font-bold">Nama Barang</span> &amp; <span className="text-emerald-300 font-bold">Harga Satuan (Rp)</span>.
                </p>
              </div>
              {file && (
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full mt-1 border border-emerald-500/30 font-bold">
                  {(file.size / 1024).toFixed(1)} KB • Klik untuk ganti file
                </span>
              )}
            </div>
          </div>

          {/* Preview Section if Rows Parsed */}
          {parsedRows.length > 0 && (
            <div className="space-y-4 animate-fade-in">
              {/* Summary Badges & Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Terdeteksi</span>
                    <h4 className="text-lg font-black text-white font-mono">{parsedRows.length} Baris</h4>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                    <i className="fas fa-list-check text-xs"></i>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Barang Baru</span>
                    <h4 className="text-lg font-black text-emerald-300 font-mono">{countNew} Item</h4>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <i className="fas fa-plus text-xs"></i>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Pembaruan Harga</span>
                    <h4 className="text-lg font-black text-amber-300 font-mono">{countUpdate} Item</h4>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <i className="fas fa-tags text-xs"></i>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Pengaturan Penerapan Data:
                </span>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="checkbox"
                      checked={applyToPeriod}
                      onChange={(e) => setApplyToPeriod(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-white/20 focus:ring-emerald-500"
                    />
                    <span>Terapkan harga satuan ke periode aktif saat ini (<span className="text-emerald-400">{currentPeriod.name}</span>)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="checkbox"
                      checked={applyToMaster}
                      onChange={(e) => setApplyToMaster(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-white/20 focus:ring-emerald-500"
                    />
                    <span>Perbarui harga standar master daftar barang</span>
                  </label>
                </div>
              </div>

              {/* Table Preview */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Preview Data Hasil Baca Excel ({filteredRows.length} dari {parsedRows.length}):
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Status Tabs */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-white/5 text-[9px] font-bold">
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-2.5 py-1 rounded-md transition-all ${statusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Semua ({parsedRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('NEW')}
                        className={`px-2.5 py-1 rounded-md transition-all ${statusFilter === 'NEW' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-400'}`}
                      >
                        Baru ({countNew})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('UPDATE')}
                        className={`px-2.5 py-1 rounded-md transition-all ${statusFilter === 'UPDATE' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-amber-400'}`}
                      >
                        Update ({countUpdate})
                      </button>
                    </div>
                    {/* Search */}
                    <div className="relative">
                      <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                      <input
                        type="text"
                        placeholder="Cari barang..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="pl-7 pr-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-white text-[10px] w-40 focus:w-56 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-white/5 rounded-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar bg-slate-950/40">
                  <table className="w-full text-left text-xs uppercase">
                    <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-white/10 text-[9px] font-black text-slate-400 tracking-wider">
                      <tr>
                        <th className="p-2.5 text-center w-12">No</th>
                        <th className="p-2.5">Nama Barang</th>
                        <th className="p-2.5 text-right">Harga Baru di Excel</th>
                        <th className="p-2.5 text-center">Status</th>
                        <th className="p-2.5 text-right">Harga Sebelumnya / Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-[11px]">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-500 font-bold uppercase">
                            Tidak ada data barang yang sesuai filter
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, idx) => {
                          const diff = row.status === 'UPDATE_PRICE' ? row.price - (row.currentPrice || 0) : 0;
                          return (
                            <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-2.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                              <td className="p-2.5 font-bold text-white">
                                {row.name}
                                {row.notes && (
                                  <span className="block text-[9px] text-slate-400 font-normal lowercase">
                                    {row.notes}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-300">
                                Rp {row.price.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-center">
                                {row.status === 'NEW_ITEM' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black">
                                    <i className="fas fa-plus mr-1 text-[8px]"></i> BARU
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black">
                                    <i className="fas fa-rotate mr-1 text-[8px]"></i> UPDATE
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono text-[10px]">
                                {row.status === 'UPDATE_PRICE' ? (
                                  <div>
                                    <span className="text-slate-400">
                                      Rp {(row.currentPrice || 0).toLocaleString('id-ID')}
                                    </span>
                                    {diff !== 0 && (
                                      <span className={`ml-2 font-black ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ({diff > 0 ? '+' : ''}Rp {diff.toLocaleString('id-ID')})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic">Item Baru</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between">
          <div className="text-[10px] text-slate-400">
            {parsedRows.length > 0 && (
              <span>
                Total <strong className="text-white">{parsedRows.length}</strong> barang siap diproses.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApplyImport}
              disabled={parsedRows.length === 0}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-emerald-300 shadow-xl shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <i className="fas fa-check-double"></i>
              Simpan Data ke Logistik ({parsedRows.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default LogisticsExcelUploadModal;
