import React, { useState, useMemo } from 'react';
import { AppState, Staff } from '../types';
import { sortStaff } from '../lib/staffUtils';
import { exportToExcelWithImages } from '../lib/excelExport';
import { Search, Download, Calendar, UserX } from 'lucide-react';
import ShareActions from './ShareActions';

interface Props {
  globalData: AppState;
  selectedYear: number;
  division?: string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  selectedOutlet?: string;
  onSelectOutlet?: (outlet: string) => void;
}

const ResignedStaffTable: React.FC<Props> = ({ globalData, selectedYear, division = 'ALL', showToast, selectedOutlet: propSelectedOutlet, onSelectOutlet }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOutlet, setSelectedOutlet] = useState(propSelectedOutlet || 'ALL');
  const [selectedDivision, setSelectedDivision] = useState<string>(division || 'ALL');

  React.useEffect(() => {
    if (propSelectedOutlet) {
      setSelectedOutlet(propSelectedOutlet);
    } else if (propSelectedOutlet === '') {
      setSelectedOutlet('ALL');
    }
  }, [propSelectedOutlet]);

  const handleOutletChange = (newOutlet: string) => {
    setSelectedOutlet(newOutlet);
    if (onSelectOutlet) {
      onSelectOutlet(newOutlet === 'ALL' ? '' : newOutlet);
    }
  };
  const tableId = useMemo(() => `regional-staff-resign-${selectedDivision.toLowerCase()}-${selectedYear}`, [selectedDivision, selectedYear]);

  // Filter staff who have resigned
  const processedResigned = useMemo(() => {
    if (!globalData || !globalData.staffList) return [];

    const filtered = globalData.staffList.filter(s => {
      const isResigned = s.status === 'RESIGNED_PROSEDUR' || s.status === 'RESIGNED_NON_PROSEDUR';
      if (!isResigned) return false;

      if (selectedDivision === 'ALL') return true;
      if (selectedDivision === 'SERVICE') {
        return s.division === 'SERVICE' || s.division === 'STORE KEEPER' || s.division === 'PUBLIC ATTENDANCE' || !s.division;
      }
      return s.division === selectedDivision;
    });

    return sortStaff(filtered);
  }, [globalData, selectedDivision]);

  // Get distinct list of outlets for filter dropdown
  const outletsList = useMemo(() => {
    const outlets = new Set<string>();
    processedResigned.forEach(s => {
      if (s.outlet) {
        outlets.add(s.outlet);
      }
    });
    return Array.from(outlets).sort();
  }, [processedResigned]);

  // Filter based on search query and selected outlet
  const filteredResigned = useMemo(() => {
    return processedResigned.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.role && item.role.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesOutlet = selectedOutlet === 'ALL' || item.outlet === selectedOutlet;
      return matchesSearch && matchesOutlet;
    });
  }, [processedResigned, searchTerm, selectedOutlet]);

  const handleExportExcel = async () => {
    if (filteredResigned.length === 0) {
      showToast?.('Tidak ada data staff resign untuk dieksport', 'info');
      return;
    }

    const columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Outlet', key: 'outlet', width: 18 },
      { header: 'Nama Staff', key: 'name', width: 22 },
      { header: 'Jabatan / Role', key: 'role', width: 18 },
      { header: 'Divisi', key: 'division', width: 15 },
      { header: 'Tgl Join', key: 'joinDate', width: 14 },
      { header: 'Tgl Resign', key: 'resignDate', width: 14 },
      { header: 'Tipe Resign', key: 'statusType', width: 18 },
      { header: 'Alasan Resign', key: 'resignReason', width: 40 },
    ];

    const exportData = filteredResigned.map((d, idx) => ({
      no: idx + 1,
      outlet: d.outlet || '-',
      name: d.name,
      role: d.role || '-',
      division: d.division || '-',
      joinDate: d.joinDate || '-',
      resignDate: d.resignDate || d.statusDate || '-',
      statusType: d.status === 'RESIGNED_PROSEDUR' ? 'Prosedur' : 'Non-Prosedur',
      resignReason: d.resignReason || '-',
    }));

    try {
      await exportToExcelWithImages(
        `REGIONAL_STAFF_RESIGN_${selectedDivision}_${selectedYear}`,
        columns,
        exportData
      );
      showToast?.(`Laporan Staff Resign ${selectedDivision} berhasil disimpan ke Excel!`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('Gagal menyimpan laporan Excel', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search and Filters Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Cari Nama / Jabatan..."
              className="w-full text-xs font-black uppercase tracking-widest pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/5 focus:border-indigo-500/50 outline-none text-white transition-all placeholder:text-slate-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Division Selector */}
          <div className="relative">
            <select
              className="appearance-none text-xs font-black uppercase tracking-widest pl-4 pr-10 py-2.5 rounded-xl bg-slate-950/60 border border-amber-500/30 focus:border-amber-500/60 outline-none text-amber-400 cursor-pointer"
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
            >
              <option value="ALL">🌐 Semua Divisi</option>
              <option value="SERVICE">Service</option>
              <option value="BAR">Bar</option>
              <option value="KITCHEN">Kitchen</option>
              <option value="STEWARD">Steward</option>
              <option value="STORE KEEPER">Store Keeper</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-amber-400">
               <i className="fas fa-chevron-down text-[8px]" />
            </div>
          </div>

          {/* Outlet Filter */}
          <div className="relative">
            <select
              className="appearance-none text-xs font-black uppercase tracking-widest pl-4 pr-10 py-2.5 rounded-xl bg-slate-950/60 border border-white/5 focus:border-indigo-500/50 outline-none text-indigo-400 cursor-pointer"
              value={selectedOutlet}
              onChange={(e) => handleOutletChange(e.target.value)}
            >
              <option value="ALL">Semua Outlet</option>
              {outletsList.map(out => (
                <option key={out} value={out}>{out}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-indigo-400">
               <i className="fas fa-chevron-down text-[8px]" />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <ShareActions targetId={tableId} title={`Laporan Staff Resign ${selectedDivision} - ${selectedYear}`} />
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-95 border border-white/10"
          >
            <Download className="w-3.5 h-3.5" /> EXPORT EXCEL
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div id={tableId} className="glass-card overflow-hidden border border-white/10 shadow-2xl bg-slate-900/40 rounded-2xl">
        <div className="table-responsive custom-scrollbar overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-950 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-white/5">
              <tr>
                <th className="p-4 text-center w-12">No</th>
                <th className="p-4">Staff Details</th>
                <th className="p-4">Division / Role</th>
                <th className="p-4">Original Outlet</th>
                <th className="p-4">Dates Info</th>
                <th className="p-4">Status Type</th>
                <th className="p-4">Resignation Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredResigned.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 font-bold uppercase text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserX className="w-8 h-8 text-slate-600" />
                      Belum Ada Karyawan Resign Dalam Divisi Ini
                    </div>
                  </td>
                </tr>
              ) : (
                filteredResigned.map((staff, idx) => (
                  <tr key={staff.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-center text-slate-500 font-black text-xs">{idx + 1}</td>
                    <td className="p-4">
                      <div className="font-black text-white uppercase tracking-tight text-sm">{staff.name}</div>
                      <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">ID: {staff.staffId}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-300 text-xs">{staff.role || '-'}</div>
                      <span className="inline-block px-2 py-0.5 mt-1 rounded text-[8px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 border border-white/5">
                        {staff.division || 'SERVICE'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-black text-indigo-400 text-xs uppercase">{staff.outlet || '-'}</div>
                    </td>
                    <td className="p-4 text-xs font-bold space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>Join: {staff.joinDate || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-red-400 font-black">
                        <Calendar className="w-3 h-3 text-red-400/80" />
                        <span>Resign: {staff.resignDate || staff.statusDate || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                        staff.status === 'RESIGNED_PROSEDUR' 
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                          : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                      }`}>
                        {staff.status === 'RESIGNED_PROSEDUR' ? 'PROSEDUR' : 'NON-PROSEDUR'}
                      </span>
                    </td>
                    <td className="p-4 max-w-[280px]">
                      <div className="text-slate-300 text-xs font-bold whitespace-normal break-words bg-slate-950/30 p-2.5 rounded-xl border border-white/5">
                        {staff.resignReason || <span className="text-slate-500 italic font-medium">Tidak ada keterangan alasan</span>}
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
  );
};

export default ResignedStaffTable;
