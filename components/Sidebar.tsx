import React from 'react';
import { ModuleType } from '../types';

interface Props {
  active: ModuleType;
  onSelect: (m: ModuleType, tab?: any) => void;
  isAdmin?: boolean;
}

const Sidebar: React.FC<Props> = ({ active, onSelect, isAdmin }) => {
  const rootMenuItems = [
    { type: ModuleType.DASHBOARD, label: 'KEMBALI KE BERANDA', icon: 'fa-home', color: 'text-indigo-400' },
    { type: ModuleType.PROJECT_REPORT, label: 'CSK PROJECT REPORT', icon: 'fa-clipboard-list', color: 'text-purple-400' },
  ];

  const outletMenuItems = [
    { type: ModuleType.SALES, label: 'Daily Revenue', icon: 'fa-cash-register', color: 'text-emerald-400' },
    { type: ModuleType.RECEIVING_SHEET, label: 'Receiving Sheet', icon: 'fa-file-invoice-dollar', color: 'text-amber-400' },
    { type: ModuleType.COGS, label: 'COGS & Forecast', icon: 'fa-calculator', color: 'text-emerald-400' },
    { type: ModuleType.WEEKLY_OVERTIME, label: 'Weekly Overtime', icon: 'fa-business-time', color: 'text-indigo-400' },
    { type: ModuleType.ENERGY_COST, label: 'Energy Cost', icon: 'fa-bolt', color: 'text-yellow-400' },
    { type: ModuleType.PATTY_CASH_EXPENSE, label: 'Patty Cash Expense', icon: 'fa-wallet', color: 'text-amber-400' },
    { type: ModuleType.REKAPAN, label: 'Rekapan Harian', icon: 'fa-file-invoice', color: 'text-indigo-400' },
    { type: ModuleType.EXTERNAL_AUDIT, label: 'Third Party & Gas', icon: 'fa-gas-pump', color: 'text-amber-400' },
    { type: ModuleType.LOGISTICS, label: 'Rekapan Logistik', icon: 'fa-boxes', color: 'text-amber-400' },
    { type: ModuleType.CHEMICAL, label: 'Chemical', icon: 'fa-flask', color: 'text-cyan-400' },
    { type: ModuleType.MAIN_STORE_KITCHEN, label: 'Main Store & Kitchen', icon: 'fa-warehouse', color: 'text-blue-400' },
    { type: ModuleType.SUPPLIER_EXPENSE, label: 'Supplier Expense', icon: 'fa-truck-loading', color: 'text-rose-400' },
    { type: ModuleType.CITY_LEDGER, label: 'City Ledger', icon: 'fa-building', color: 'text-blue-400' },
    { type: ModuleType.GUEST_SATISFACTION, label: 'Guest Satisfaction', icon: 'fa-face-smile', color: 'text-emerald-400' },
    { type: ModuleType.COMPLIMENTARY, label: 'Complimentary', icon: 'fa-gift', color: 'text-purple-400' },
    { type: ModuleType.STRATEGI, label: 'Menu Strategi', icon: 'fa-bullseye', color: 'text-amber-400' },
    { type: ModuleType.VOID_BILL, label: 'Void Bill Monitoring', icon: 'fa-ban', color: 'text-rose-400' },
    { type: ModuleType.TUTORIAL, label: 'Tutorial & SOP', icon: 'fa-graduation-cap', color: 'text-amber-400' },
  ];

  if (isAdmin) {
    outletMenuItems.push({ type: ModuleType.ADMIN, label: 'Admin Panel', icon: 'fa-user-shield', color: 'text-slate-400' });
  }

  return (
    <aside className="h-full md:h-[calc(100vh-2rem)] w-full md:w-64 glass-card md:m-4 border-r md:border border-white/10 flex flex-col z-50 transition-all duration-300 shadow-2xl no-blur bg-[#1e293b]/95 overflow-hidden">
      <div className="p-6 md:p-8 text-center border-b border-white/5 bg-slate-950/20">
        <h1 className="text-xl md:text-2xl font-black tracking-tighter mix-gradient-bg bg-clip-text text-transparent italic leading-none uppercase">
          SH THE BARN
        </h1>
      </div>

      <nav className="flex-1 px-3 md:px-4 py-6 md:py-8 space-y-1.5 overflow-y-auto custom-scrollbar no-blur">
        {rootMenuItems.map((item) => (
          <button
            key={item.type}
            onClick={() => onSelect(item.type)}
            className={`w-full flex items-center p-3 rounded-2xl transition-all duration-200 group no-blur active:scale-95 cursor-pointer ${
              active === item.type 
              ? 'purple-gradient-bg text-white shadow-lg shadow-purple-900/40 translate-x-1' 
              : 'hover:bg-white/5 text-slate-500 hover:text-white'
            }`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${active === item.type ? 'bg-white/20 shadow-inner' : `group-hover:bg-white/5 ${item.color || ''}`}`}>
              <i className={`fas ${item.icon} text-base group-hover:scale-110 transition-transform`}></i>
            </div>
            <span className="ml-4 font-black uppercase text-[9px] tracking-widest leading-none text-left">{item.label}</span>
          </button>
        ))}

        <div className="pt-4 pb-2 px-1">
           <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 border-b border-white/5 pb-2 px-3">Outlet Features</div>
           <div className="space-y-1">
              {outletMenuItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelect(item.type)}
                  className={`w-full flex items-center p-3 rounded-xl transition-all group ${
                    active === item.type 
                    ? 'bg-white/10 text-white shadow-md' 
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10 ${item.color}`}>
                    <i className={`fas ${item.icon} text-[10px] group-hover:scale-110`}></i>
                  </div>
                  <span className="ml-3 font-black uppercase text-[8px] tracking-widest leading-none">{item.label}</span>
                </button>
              ))}
           </div>
        </div>

        <div className="pt-4 pb-2 px-1">
           <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 border-b border-white/5 pb-2 px-3">Regional Report</div>
           <div className="space-y-1">
              {[
                { type: ModuleType.REGIONAL_REPORT, label: 'Summary Overview', icon: 'fa-tachometer-alt', tab: 'OVERVIEW', color: 'text-indigo-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Daily Revenue', icon: 'fa-cash-register', tab: 'REVENUE_MTD', color: 'text-emerald-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Receiving Sheet', icon: 'fa-file-invoice-dollar', tab: 'RECEIVING_SHEET', color: 'text-amber-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'COGS & Forecast', icon: 'fa-calculator', tab: 'COGS', color: 'text-emerald-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Summary Report', icon: 'fa-file-invoice', tab: 'SUMMARY_REPORT', color: 'text-indigo-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Energy Cost', icon: 'fa-bolt', tab: 'ENERGY_COST', color: 'text-yellow-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Patty Cash Expense', icon: 'fa-wallet', tab: 'PATTY_CASH_EXPENSE', color: 'text-amber-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Third Party & Gas', icon: 'fa-gas-pump', tab: 'THIRD_PARTY_GAS', color: 'text-amber-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Rekapan Logistik', icon: 'fa-boxes', tab: 'REKAPAN_LOGISTIK', color: 'text-amber-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Main Store & Kitchen', icon: 'fa-warehouse', tab: 'MAIN_STORE_KITCHEN', color: 'text-blue-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'City Ledger', icon: 'fa-building', tab: 'CITY_LEDGER', color: 'text-blue-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Guest Satisfaction', icon: 'fa-face-smile', tab: 'SATISFACTION', color: 'text-emerald-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Complimentary', icon: 'fa-gift', tab: 'COMPLIMENTARY', color: 'text-purple-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Menu Strategi', icon: 'fa-bullseye', tab: 'STRATEGI_MENU_REGIONAL', color: 'text-amber-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Rekapan Promo Bank', icon: 'fa-tags', tab: 'BANKING_PROMO_REGIONAL', color: 'text-purple-400' },
                { type: ModuleType.REGIONAL_REPORT, label: 'Rekapan Void Bill', icon: 'fa-ban', tab: 'VOID_BILL_REGIONAL', color: 'text-rose-400' },
              ].map((sub, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelect(sub.type, sub.tab)}
                  className="w-full flex items-center p-3 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all group"
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10 ${sub.color}`}>
                    <i className={`fas ${sub.icon} text-[10px] group-hover:scale-110`}></i>
                  </div>
                  <span className="ml-3 font-black uppercase text-[8px] tracking-widest leading-none">{sub.label}</span>
                </button>
              ))}
           </div>
        </div>
      </nav>

      <div className="p-6 mt-auto border-t border-white/5 no-blur bg-slate-900/40">
        <div className="p-3 text-[10px] text-slate-500 hidden md:block rounded-xl border border-white/5 bg-slate-950/50">
          <div className="font-black text-slate-300 uppercase mb-2 tracking-widest flex items-center gap-2">
             <i className="fas fa-user-edit text-[8px] text-purple-500"></i>
             Created by Christian
          </div>
          <div className="font-black text-slate-500 uppercase mb-1 tracking-wider flex items-center gap-2">
             <i className="fas fa-database text-[8px] text-emerald-500"></i>
             System Online
          </div>
          <div className="flex items-center gap-2 mt-1">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
             <span className="font-bold">Session Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;