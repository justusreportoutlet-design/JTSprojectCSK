import React from 'react';
import { ModuleType } from '../types';

interface Props {
  onSelect: (m: ModuleType, tab?: any) => void;
  isAdmin?: boolean;
  onToggleFS?: () => void;
  onOpenLogisticsInput?: () => void;
}

const Dashboard: React.FC<Props> = ({ onSelect, isAdmin, onToggleFS, onOpenLogisticsInput }) => {
  const cards = [
    { type: ModuleType.PROJECT_REPORT, label: 'CSK Project Report', icon: 'fa-clipboard-list', color: 'from-purple-600 to-indigo-800', desc: 'Laporan Pekerjaan Lapangan, Progres Harian & Irit Kuota' },
    { type: ModuleType.SALES, label: 'Daily Revenue', icon: 'fa-cash-register', color: 'from-emerald-600 to-teal-800', desc: 'Revenue, Covers & Avg Check' },
    { type: ModuleType.RECEIVING_SHEET, label: 'Receiving Sheet', icon: 'fa-file-invoice-dollar', color: 'from-amber-500 to-yellow-600', desc: 'Laporan Belanja & Cost Supplier Harian' },
    { type: ModuleType.PATTY_CASH_EXPENSE, label: 'Patty Cash Expense', icon: 'fa-wallet', color: 'from-amber-500 to-orange-600', desc: 'Belanja Patty Cash & Matrix Detail Item' },
    { type: ModuleType.ENERGY_COST, label: 'Energy Cost', icon: 'fa-bolt', color: 'from-amber-400 to-yellow-600', desc: 'Listrik, Air PDAM, Gas & Monitoring KWh' },
    { type: ModuleType.CHEMICAL, label: 'Chemical', icon: 'fa-flask', color: 'from-cyan-500 to-teal-600', desc: 'Belanja Chemical Floor & Matrix Requisition' },
    { type: ModuleType.MAIN_STORE_KITCHEN, label: 'Main Store & Kitchen', icon: 'fa-warehouse', color: 'from-blue-600 to-indigo-700', desc: 'Belanja Main Store/Kitchen & Matrix Detail' },
    { type: ModuleType.SUPPLIER_EXPENSE, label: 'Supplier Expense', icon: 'fa-truck-loading', color: 'from-rose-600 to-red-700', desc: 'Belanja Supplier Rekanan & Purchasing Matrix' },
    { type: ModuleType.CITY_LEDGER, label: 'City Ledger', icon: 'fa-building', color: 'from-blue-600 to-cyan-700', desc: 'Bill City Ledger & Matrix Detail Piutang' },
    { type: ModuleType.GUEST_SATISFACTION, label: 'Guest Satisfaction', icon: 'fa-face-smile', color: 'from-emerald-600 to-teal-700', desc: 'Customer Care & Matrix Detail Recovery' },
    { type: ModuleType.COMPLIMENTARY, label: 'Complimentary', icon: 'fa-gift', color: 'from-purple-600 to-pink-700', desc: 'Bill Complimentary & Matrix Detail Promo' },
    { type: ModuleType.STRATEGI, label: 'Menu Strategi', icon: 'fa-bullseye', color: 'from-amber-500 to-orange-600', desc: 'Target & Actual Penyeimbang & Percepatan Lunch/Dinner' },
    { type: ModuleType.WEEKLY_OVERTIME, label: 'Input Weekly Overtime', icon: 'fa-business-time', color: 'from-indigo-600 to-purple-800', desc: 'Total Staff, Total Overtime & Average Overtime' },
    { type: ModuleType.COGS, label: 'COGS & Forecast Rev', icon: 'fa-calculator', color: 'from-emerald-600 to-teal-700', desc: 'HPP COGS, Forecast Revenue Weekday & Weekend' },
    { type: ModuleType.REKAPAN, label: 'Rekapan Harian', icon: 'fa-file-invoice', color: 'from-indigo-600 to-purple-800', desc: 'Summary Performa Harian' },
    { type: ModuleType.LOGISTICS, label: 'Rekapan Logistik', icon: 'fa-boxes', color: 'from-amber-500 to-orange-600', desc: 'Inventory & Peminjaman Barang' },
    { type: ModuleType.EXTERNAL_AUDIT, label: 'Third Party & Gas', icon: 'fa-gas-pump', color: 'from-amber-600 to-orange-700', desc: 'Penginputan & Rekapan Belanja Third Party & Gas' },
    { type: ModuleType.VOID_BILL, label: 'Void Bill Monitoring', icon: 'fa-ban', color: 'from-rose-600 to-red-800', desc: 'Pencatatan Kesalahan Void Staff & Otorisasi PIC' },
    { type: ModuleType.TUTORIAL, label: 'Tutorial & SOP', icon: 'fa-graduation-cap', color: 'from-blue-600 to-indigo-800', desc: 'Panduan Operasional Leader, Cashier & Store Keeper' },
  ];

  if (isAdmin) {
    cards.push({ type: ModuleType.ADMIN, label: 'Admin Panel', icon: 'fa-user-shield', color: 'from-slate-700 to-slate-900', desc: 'Master Configuration Center' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-4">
        <button 
          onClick={onToggleFS}
          className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.15em] text-[10px] shadow-xl shadow-indigo-900/40 transition-all active:scale-95 flex items-center gap-2.5 border border-indigo-400/30"
        >
          <i className="fas fa-expand"></i>
          Full Screen Mode
        </button>
        {onOpenLogisticsInput && (
          <button 
            onClick={onOpenLogisticsInput}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black uppercase tracking-[0.15em] text-[10px] shadow-xl shadow-orange-950/40 transition-all active:scale-95 flex items-center gap-2.5 border border-orange-400/30 animate-pulse-subtle"
          >
            <i className="fas fa-boxes"></i>
            Input Harian Logistik
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 animate-fade-in no-blur p-1 pb-20">
      {cards.map((card, idx) => (
        <div
          key={card.type + idx}
          onClick={() => onSelect(card.type)}
          className="group relative h-40 md:h-52 rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-white/40 transition-all duration-300 hover:-translate-y-1 active:scale-95 text-left focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-xl"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5 group-hover:opacity-20 transition-opacity duration-300`}></div>
          <div className="absolute top-4 right-4 md:top-6 md:right-6 text-white/5 group-hover:text-white/10 transition-all duration-300 transform group-hover:scale-110">
            <i className={`fas ${card.icon} text-5xl md:text-7xl`}></i>
          </div>
          <div className="relative h-full p-6 md:p-8 flex flex-col justify-between items-start z-10">
            <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-lg group-hover:shadow-2xl transition-all`}>
              <i className={`fas ${card.icon} text-lg md:text-2xl`}></i>
            </div>
            
            <div className="pointer-events-none">
              <h3 className="text-base md:text-xl font-black text-white mb-1 md:mb-2 uppercase tracking-tight group-hover:text-purple-300 transition-colors">
                {card.label}
              </h3>
              <p className="text-[9px] md:text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors max-w-[150px] md:max-w-[180px]">
                {card.desc}
              </p>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
};

export default Dashboard;